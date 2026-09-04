---
title: "陕西省 3D 地图"
slug: "shaanxi-3d-map"
description: "基于 Three.js、Blender 和 WebGL 实现的三维地图可视化项目，支持数据驱动的区块着色与 GPU 拾取交互。"
date: 2026-05-20
updatedAt: 2026-07-10
cover: ""
featured: true
featuredOrder: 1
status: "持续优化"
category: "3d"
stack:
  - Three.js
  - Blender
  - WebGL
  - TypeScript
  - Earcut
github: ""
demo: ""
draft: false
highlights:
  - label: "三角面数"
    value: "240 万"
  - label: "Draw Call"
    value: "31"
  - label: "首屏加载"
    value: "1.1s"
  - label: "稳定帧率"
    value: "60 FPS"
---

起因是想做一个能直观看到省内各市数据分布的东西。表格看数字太抽象，二维地图又缺少层次感，于是决定做三维的。

## 项目背景

做数据可视化项目时经常遇到一个矛盾：**数据维度越多，二维图表越难表达**。

这个项目的目标是把一个省的经济、人口、产业数据放到一个三维空间里，让人一眼就能看出分布差异和聚集趋势，而不是盯着一堆柱状图做对比。

## 需要解决的问题

### 数据体积

原始 GeoJSON 边界数据 **11.4 MB**，其中大部分是海岸线和边界的高精度顶点。对 Web 端来说完全不可接受。

用 mapshaper 做几何简化，最终在体积和视觉精度之间取了 1.5% 的保留比例 —— 940 KB，gzip 后约 280 KB。这个比例下市域轮廓几乎无损，但再往下压就会出现肉眼可见的锯齿。

### 坐标系与投影

GeoJSON 用的是 GCJ-02 坐标系（火星坐标系），需要正确投影到平面坐标。项目里实现了墨卡托投影 + 包围盒自动居中缩放，换任何省份的数据都不需要手动调参。

### 带洞多边形的三角化

Three.js 的 `ShapeGeometry` 处理不了带洞多边形 —— 比如一个市域中间包着另一个飞地。最终改用 Earcut 手动三角化，把外环和内环一起喂进去。

## 技术方案

### 渲染架构

```text title="渲染管线"
GeoJSON 数据
    ↓
mapshaper 简化（构建期）
    ↓
墨卡托投影 + 包围盒归一化
    ↓
Earcut 三角化
    ↓
ExtrudeGeometry 挤出 + 倒角
    ↓
BatchedMesh 合并（2800 → 1 draw call）
    ↓
自定义着色器（数值驱动挤出高度）
    ↓
HDR 环境贴图 + 按需渲染
```

### 关键实现

合并 draw call 是性能的第一步。2800 个独立区块意味着 2800 次 draw call，用 `BatchedMesh` 合并后降到 46 次，配合距离剔除最终降到 31 次。

材质通过 `onBeforeCompile` 注入自定义着色器，把"数值 → 挤出高度 → 颜色"这条链路搬到 GPU 上。这样切换数据维度时不需要重建几何体，只更新一个 attribute 就行。

```ts title="数值驱动挤出" showLineNumbers
material.onBeforeCompile = (shader) => {
  shader.uniforms.uExtrudeScale = uniforms.uExtrudeScale;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `
      #include <common>
      attribute float aValue;
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

### 交互设计

拾取用 GPU 拾取而不是射线检测。给每个区块分配独立的 ID 颜色，渲染到 1×1 的离屏 target，读取鼠标位置像素反查 ID。这样拾取代价与场景复杂度无关，恒定一次像素读取。

相机做了严格约束 —— 限制俯仰角、禁用平移。三维地图一旦允许自由平移，用户很容易把地图推出视野然后找不到回来的路。

## 遇到的问题

**构建时主线程卡死。** 合并 2800 个几何体要花 3-4 秒，期间页面完全无响应。改成按 8ms 时间预算分帧处理，每帧处理完让出一次 rAF，配合进度条，体验就正常了。

**Retina 屏帧率腰斩。** `devicePixelRatio` 默认吃到 2 或 3，意味着要渲染 4-9 倍像素。限制到 2 之后视觉差异极小，填充率压力降一半。

**切换数据后显存持续上涨。** `scene.remove()` 只解除引用，不释放显存。必须显式遍历 `dispose()` geometry、material 以及材质上挂的所有 texture。

## 经验总结

- **数据处理的复杂度远超渲染。** 坐标系、简化比例、带洞多边形、轴向映射 —— 每一个都没有标准答案。渲染部分遇到问题查文档基本都能解决，数据这块只能靠试。
- **先定位再优化。** 用 Spector.js 看一帧的 draw call / 三角形数 / 纹理内存，三个数字就能指出瓶颈方向。不做测量就开始优化，大概率是在优化不是瓶颈的地方。
- **倒角是"高级感"的主要来源。** 只开 1 段 bevel 就能让边缘在光照下产生一圈高光，视觉提升远大于成本。

## 后续计划

- 支持全国数据的动态加载与分级渲染
- 加入时间轴，支持数据随时间演化的动画
- 把数据管线做成可调参重跑的独立脚本

> 详细的性能优化过程写在[这篇文章](/blog/threejs-large-scene-optimization)里。
