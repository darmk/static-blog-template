---
title: "Three.js 大型场景性能优化实践"
slug: "threejs-large-scene-optimization"
description: "从 draw call、内存、着色器到帧调度，系统梳理 Three.js 大型场景的性能瓶颈定位方法与优化手段。"
publishedAt: 2026-07-18
updatedAt: 2026-08-02
category: "threejs"
tags:
  - Three.js
  - WebGL
  - Performance
  - 可视化
cover: ""
featured: false
featuredOrder: 3
pinned: false
recommend: true
draft: false
---

做一个省份级别的 3D 地图，行政区块加上建筑标粗之后，面数轻松突破两百万。第一次跑起来帧率 14，风扇狂转，笔记本能煎蛋。

下面是把帧率拉回 60 的完整过程，按投入产出比排序。

## 先定位，再优化

这一步被跳过得最多。很多人上来就开始合并几何体、降贴图，做完发现没变化 —— 因为瓶颈根本不在那儿。

### 用 Spector.js 看一帧

浏览器层的工具只能告诉你"慢"，WebGL 层的工具才能告诉你"为什么慢"。[Spector.js](https://spector.browserstack.com/) 能抓下一帧的所有 GL 调用。

看三个数字就够了：

| 指标 | 健康值 | 说明 |
| --- | --- | --- |
| draw call | < 150 | 每帧的绘制批次 |
| 三角形数 | < 500 万 | 视 GPU 而定 |
| 纹理内存 | < 512 MB | 超出会触发换页 |

我这次的实际情况：draw call **1832**，三角形 **240 万**。问题一目了然 —— 瓶颈在 draw call，不是面数。

> draw call 太多意味着 CPU 在反复告诉 GPU"画这个、画这个、画这个"，GPU 大部分时间在等指令。

## 合并几何体

第一个也是最有效的手段。地图上有 2800 个独立的区块 mesh，每个都是一次 draw call。

### 用 BatchedMesh

Three.js r159 之后有了 `BatchedMesh`，它能把不同几何体合并成一个 draw call，同时保留每个实例的独立变换和可见性。

```ts title="src/map/batch.ts" showLineNumbers {12,20}
import * as THREE from 'three';

function buildDistricts(geometries: THREE.BufferGeometry[]) {
  const maxVertex = geometries.reduce(
    (sum, g) => sum + g.attributes.position.count, 0);
  const maxIndex = geometries.reduce(
    (sum, g) => sum + (g.index?.count ?? 0), 0);

  const batched = new THREE.BatchedMesh(
    maxInstanceCount,
    maxVertex,
    maxIndex,
    material
  );

  const ids: number[] = [];
  for (const geo of geometries) {
    const id = batched.addGeometry(geo);
    batched.addInstance(id);
    ids.push(id);
  }

  return { batched, ids };
}
```

需要**所有几何体共享同一个材质**，这是前提。如果你的区块本来就要用不同颜色，不要拆材质，改用顶点色或者 instanceColor。

```ts title="用颜色属性代替多材质" {2,7}
const material = new THREE.MeshStandardMaterial({ vertexColors: true });
batched.setColorAt(id, new THREE.Color().setHSL(hue, 0.5, 0.5));
```

改完之后：draw call **1832 → 46**。帧率从 14 到 41。

## 分帧构建，别卡死主线程

合并 2800 个几何体本身要花 3-4 秒，这期间页面是完全卡死的。必须分帧处理：

```ts title="src/map/scheduler.ts" showLineNumbers {8,16,25}
const BUDGET_MS = 8; // 每帧只占用 8ms，留足时间给渲染

async function buildInChunks(
  items: Item[],
  onProgress: (p: number) => void
) {
  let index = 0;
  while (index < items.length) {
    const frameStart = performance.now();

    while (index < items.length &&
           performance.now() - frameStart < BUDGET_MS) {
      process(items[index]);
      index++;
    }

    onProgress(index / items.length);
    // 让出一帧，浏览器才能更新进度条
    await new Promise((r) => requestAnimationFrame(r));
  }
}
```

这里有个容易踩的坑：**别用 `await new Promise(r => setTimeout(r, 0))`**。setTimeout 在后台标签页会被节流到 1 秒，而 rAF 在后台会暂停但恢复时是准确的。

## 着色器：把计算搬到 GPU

地图上的区块需要根据数值实时变色。最早是在 JS 里更新每个实例的 color attribute，每次更新要传 2800 × 3 个 float。

换成在顶点着色器里算：

```glsl title="district.vert" showLineNumbers
attribute float aValue;
attribute float aIndex;
uniform float uTime;
uniform float uSelected;
varying float vValue;
varying vec3 vNormalW;

void main() {
  vValue = aValue;
  vNormalW = normalize(normalMatrix * normal);

  vec3 pos = position;
  // 数值越高，挤出越高
  pos.y += aValue * uExtrudeScale;

  // 选中项轻微抬升，用 sin 做呼吸
  float lift = step(0.5, abs(aIndex - uSelected) < 0.5 ? 1.0 : 0.0);
  pos.y += lift * (0.15 + sin(uTime * 2.0) * 0.05);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

用 `onBeforeCompile` 注入，不用改 Three.js 源码：

```ts title="注入自定义着色器" {4,10}
const material = new THREE.MeshStandardMaterial();

material.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uniforms.uTime;
  shader.uniforms.uExtrudeScale = uniforms.uExtrudeScale;

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `
      #include <common>
      attribute float aValue;
      uniform float uTime;
      uniform float uExtrudeScale;
      varying float vValue;
    `)
    .replace('#include <begin_vertex>', `
      #include <begin_vertex>
      transformed.y += aValue * uExtrudeScale;
      vValue = aValue;
    `);
};
```

注意 `onBeforeCompile` 修改过的材质需要设置 `customProgramCacheKey`，否则 Three.js 会用缓存的 shader 导致修改不生效：

```ts title="缓存 key" {2}
material.customProgramCacheKey = () => 'district-extrude-v1';
```

## 视锥剔除与 LOD

远处的区块不需要高精度。用 `LOD` 按距离切换：

```ts title="src/map/lod.ts" {6,10,14}
const lod = new THREE.LOD();

// 近：完整几何体
lod.addLevel(highMesh, 0);
// 中：简化到 40%
lod.addLevel(midMesh, 400);
// 远：只保留轮廓
lod.addLevel(lowMesh, 1200);

scene.add(lod);
```

但对于 BatchedMesh，`LOD` 不适用 —— 这时候用**距离剔除**更实际：

```ts title="按距离隐藏实例" showLineNumbers {6}
function cullByDistance(camera: THREE.Camera, threshold = 2000) {
  for (let i = 0; i < ids.length; i++) {
    const pos = batched.getPositionAt(ids[i], new THREE.Vector3());
    const visible = pos.distanceTo(camera.position) < threshold;
    batched.setVisibleAt(ids[i], visible);
  }
}
```

`getPositionAt` 每帧对 2800 个实例调用是有开销的，可以改成每 6 帧更新一次 —— 视觉上完全看不出来。

## 内存：几何体要显式释放

这是最容易漏的。切换地图数据时，如果只 `scene.remove(mesh)` 而不 `dispose()`，显存不会释放，来回切几次就崩。

```ts title="src/lib/dispose.ts" showLineNumbers {6,12,18}
export function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry?.dispose();

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    for (const mat of materials) {
      if (!mat) continue;
      // 材质上挂的所有纹理都要释放
      for (const value of Object.values(mat)) {
        if (value && (value as THREE.Texture).isTexture) {
          (value as THREE.Texture).dispose();
        }
      }
      mat.dispose();
    }
  });

  root.removeFromParent();
}
```

Chrome DevTools 的 Memory 面板里，如果切换场景后 GPU memory 不下降，就是这里漏了。

## 渲染循环的细节

几个配置项的收益：

```ts title="渲染器配置" {3,5,7}
const renderer = new THREE.WebGLRenderer({
  antialias: window.devicePixelRatio < 2, // 高分屏关掉 AA
  powerPreference: 'high-performance',
  stencil: false,
  depth: true,
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false; // 大型场景阴影代价极高
```

`setPixelRatio` 这一条在 Retina 屏上效果显著。默认会用 `devicePixelRatio`（通常是 2 或 3），意味着要渲染 4-9 倍的像素。限制到 2 之后视觉差异很小，但填充率压力降一半。

### 按需渲染

如果场景不是持续动画的（比如地图只有 hover 和选中时有变化），不要每帧渲染：

```ts title="按需渲染" showLineNumbers {5,10}
let needsRender = true;

function invalidate() {
  needsRender = true;
}

function loop() {
  requestAnimationFrame(loop);
  if (!needsRender) return;

  controls.update();
  renderer.render(scene, camera);
  needsRender = controls.autoRotate; // 只有自动旋转时才持续渲染
}

controls.addEventListener('change', invalidate);
```

这一条让空闲时的 GPU 占用从 100% 降到 0%。笔记本风扇终于安静了。

## 优化结果

| 阶段 | draw call | 帧率 | GPU 占用 |
| --- | --- | --- | --- |
| 初始 | 1832 | 14 | 100% |
| 合并几何体 | 46 | 41 | 100% |
| 着色器挤出 | 46 | 52 | 92% |
| 距离剔除 | 31 | 58 | 78% |
| 按需渲染 | 31 | 60 | 空闲 0% |

## 小结

按这个顺序排查，基本不会走弯路：

1. **用 Spector.js 定位瓶颈**（draw call / 三角形 / 纹理内存）
2. **draw call 多 → 合并**（BatchedMesh / InstancedMesh）
3. **构建卡顿 → 分帧**（rAF + 时间预算）
4. **逐帧数据更新 → 搬到 GPU**（attribute + 着色器）
5. **远景 → 剔除或 LOD**
6. **静态场景 → 按需渲染**
7. **切换场景 → 显式 dispose**

最后一条最不起眼，但它是唯一一个"不做就会崩"的优化。
