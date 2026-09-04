---
title: "从零构建一个 3D 地图可视化项目"
slug: "building-3d-map-visualization"
description: "记录用 Three.js、Blender 和 WebGL 从零实现陕西省三维地图可视化的完整过程，包括数据处理、建模、渲染与交互。"
publishedAt: 2026-05-20
updatedAt: 2026-07-10
category: "threejs"
tags:
  - Three.js
  - WebGL
  - Blender
  - 数据可视化
cover: ""
featured: false
featuredOrder: 5
pinned: false
recommend: true
draft: false
---

起因是想做一个能直观看到省内各市数据分布的东西。表格看数字太抽象，二维地图又缺少层次感，于是决定做三维的。

这篇文章记录从拿到原始数据到最终上线的完整过程，包括所有走过的弯路。

## 数据从哪来

第一步就卡住了：行政边界数据不好找。

### GeoJSON 边界数据

最终用的是阿里云的 DataV 数据平台，可以直接下载省市区三级的 GeoJSON。要注意的是**坐标系问题**：

```text title="坐标系对比"
WGS84    —— GPS 原始坐标，国际通用
GCJ-02   —— 火星坐标系，高德/腾讯地图使用
BD-09    —— 百度坐标系，在 GCJ-02 基础上再加密
```

DataV 提供的是 GCJ-02。如果你的底图用的是 WGS84（比如 Mapbox），直接叠加会偏移几百米。

这个项目里我不叠加底图，所以坐标系不影响渲染，只影响经纬度到平面坐标的投影精度。

### 数据体积问题

原始 GeoJSON 有 **11.4 MB**，其中大部分是海岸线和边界的高精度顶点。对于 Web 端这显然太大了。

用 mapshaper 做简化：

```bash title="简化几何数据"
# 保留 3% 的顶点，肉眼几乎看不出差别
mapshaper shaanxi.json -simplify 3% -o format=geojson shaanxi-simple.json

# 先看看效果再决定比例
mapshaper shaanxi.json -simplify 1.5% -o preview.json
```

实测结果：

| 简化比例 | 体积 | 视觉效果 |
| --- | --- | --- |
| 原始 | 11.4 MB | — |
| 3% | 1.8 MB | 无损感知 |
| 1.5% | 940 KB | 边界轻微锯齿 |
| 0.8% | 520 KB | 明显变形 |

选了 1.5%。再配合 gzip，传输体积约 280 KB。

> 简化比例不是越低越好。市域边界在视觉上是主要轮廓，过度简化会让形状认不出来。

## 投影：经纬度转平面坐标

GeoJSON 里是经纬度，Three.js 里需要平面坐标。用墨卡托投影：

```ts title="src/geo/projection.ts" showLineNumbers {10,17}
import * as THREE from 'three';

const EARTH_RADIUS = 6378137;
const MAX_LATITUDE = 85.0511287798;

/** 经纬度 → 世界坐标（单位：米） */
export function lonLatToWorld(
  lon: number,
  lat: number
): THREE.Vector2 {
  const d = Math.PI / 180;
  const clampedLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));

  const x = EARTH_RADIUS * lon * d;
  const y =
    EARTH_RADIUS *
    Math.log(Math.tan(Math.PI / 4 + (clampedLat * d) / 2));

  return new THREE.Vector2(x, y);
}

/** 计算包围盒，用于把地图居中并缩放到合适大小 */
export function fitToBounds(
  points: THREE.Vector2[],
  targetSize: number
) {
  const box = new THREE.Box2().setFromPoints(points);
  const size = box.getSize(new THREE.Vector2());
  const center = box.getCenter(new THREE.Vector2());
  const scale = targetSize / Math.max(size.x, size.y);

  return { center, scale };
}
```

拿到 `center` 和 `scale` 之后，所有点减 center 再乘 scale，地图就居中且大小统一了。这样换一个省的数据不用手动调参数。

## 把 GeoJSON 变成几何体

这是整个项目里最麻烦的一步：GeoJSON 的多边形要三角化才能渲染。

Three.js 的 `ShapeGeometry` 用的是 earcut，能处理简单多边形，但**处理不了带洞的多边形**（比如一个市里面包着另一个市）。

### 用 Earcut 手动三角化

```ts title="src/geo/triangulate.ts" showLineNumbers {12,22,30}
import earcut from 'earcut';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

export function featureToGeometry(
  feature: Feature,
  project: (lon: number, lat: number) => THREE.Vector2
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const holes: number[] = [];

  const geom = feature.geometry as Polygon | MultiPolygon;
  const polygons =
    geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

  for (const polygon of polygons) {
    const ringOffset = positions.length / 2;

    // 外环 + 内环（洞）一起喂给 earcut
    const flat: number[] = [];
    for (const ring of polygon) {
      if (positions.length > ringOffset * 2) {
        holes.push(positions.length / 2);
      }
      for (const [lon, lat] of ring) {
        const p = project(lon, lat);
        flat.push(p.x, p.y);
        positions.push(p.x, 0, p.y);
      }
    }

    const triangles = earcut(flat, holes, 2);
    for (const idx of triangles) {
      indices.push(idx + ringOffset);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
```

注意第 33 行：`positions` 数组是 3 个分量一组，但 earcut 需要 2 个分量一组的 `flat` 数组。这两个数组要分别维护，很容易搞混。

这里有个坑：**geojson 的 y 轴和 Three.js 的 z 轴是反的**。我在 `positions.push(p.x, 0, p.y)` 这里做了映射，让形状躺平在 XZ 平面上。

### 挤出成三维

平面的多边形要变成有厚度的体块，用 `ExtrudeGeometry`：

```ts title="挤出为三维体块" showLineNumbers {9,16}
function extrudeDistrict(shape: THREE.Shape, depth: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.04,
    bevelSize: depth * 0.06,
    bevelSegments: 1,
    curveSegments: 2,
  });

  geometry.rotateX(-Math.PI / 2); // 立起来
  geometry.computeVertexNormals();
  return geometry;
}
```

`bevelSegments: 1` 和 `curveSegments: 2` 是为了控制面数。倒角能让边缘在光照下有一圈高光，视觉上"高级感"主要来自这里，开 1 段就够。

## 用 Blender 做辅助

Blender 在这个项目里只做一件事：**生成环境光照的 HDR 贴图**。

三维地图的质感很大程度取决于光照。用 Three.js 自带的平行光 + 环境光，出来的效果是"塑料感"的。换成 HDR 环境贴图之后，金属和玻璃材质立刻真实了。

在 Blender 里搭一个简单的三点光场景，渲染成等距圆柱投影的 EXR，再用 `RGBELoader` 加载：

```ts title="加载 HDR 环境贴图" showLineNumbers {3}
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const hdr = await new RGBELoader().loadAsync('/hdr/studio.hdr');
hdr.mapping = THREE.EquirectangularReflectionMapping;

scene.environment = hdr;
scene.environmentIntensity = 0.6;
```

HDR 文件通常 2-4 MB，记得用 `PMREMGenerator` 预处理，否则实时过滤会很慢。

## 交互设计

### 拾取

用射线检测太慢（地图上万个三角形），改用**GPU 拾取**：给每个区块一个独立的 ID 颜色，渲染到离屏 target，读取鼠标位置的像素值反查 ID。

```ts title="src/pick/gpu-picker.ts" showLineNumbers {8,20}
class GPUPicker {
  private target = new THREE.WebGLRenderTarget(1, 1);
  private buffer = new Uint8Array(4);

  pick(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    x: number,
    y: number
  ): number {
    // 用 ID 材质覆盖渲染
    scene.overrideMaterial = this.idMaterial;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);

    renderer.readRenderTargetPixels(
      this.target, x, this.target.height - y, 1, 1, this.buffer
    );

    renderer.setRenderTarget(null);
    scene.overrideMaterial = null;

    // 从 RGB 反解 ID
    return (this.buffer[0] << 16) | (this.buffer[1] << 8) | this.buffer[2];
  }
}
```

这个方法的好处是**拾取精度是像素级的**，而且跟场景复杂度无关 —— 无论多少三角形，代价都是固定的一次 1×1 渲染。

### 相机约束

三维地图最容易让人晕的是相机能无限制翻滚。必须加约束：

```ts title="相机约束" showLineNumbers {5,10}
controls.maxPolarAngle = Math.PI * 0.42;  // 不允许看到地平线以下
controls.minPolarAngle = Math.PI * 0.08;  // 不允许完全俯视
controls.minDistance = 60;
controls.maxDistance = 400;
controls.enablePan = false;               // 禁止平移，防止迷路
controls.dampingFactor = 0.08;            // 惯性阻尼
```

`enablePan = false` 这条很重要。三维地图一旦允许自由平移，用户很容易把地图推出视野然后找不到回来的路。

## 性能

最终场景包含 10 个市、107 个区县、约 240 万个三角形。优化手段写在[另一篇文章](/blog/threejs-large-scene-optimization)里，这里只说结果：

- draw call：1832 → 31
- 首屏加载：4.2s → 1.1s（含数据下载与构建）
- 稳定帧率：14 FPS → 60 FPS

## 回看

整个项目做完，最大的体会是：**数据处理的复杂度远超渲染**。

渲染部分是标准的，遇到问题查文档基本都能解决。但数据这块 —— 坐标系、简化比例、带洞多边形、坐标系轴向 —— 每一个都没有标准答案，只能靠试。

如果重做一次，我会先花两天专门做数据管线，把简化、投影、三角化做成可以调参重跑的脚本，而不是像这次一样，每次调参都要手动跑一串命令。
