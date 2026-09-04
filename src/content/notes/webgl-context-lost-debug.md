---
title: "Chrome 里调试 WebGL 上下文丢失"
slug: "webgl-context-lost-debug"
publishedAt: 2026-08-18
tags:
  - WebGL
  - Chrome
  - 调试
source: "开发笔记"
draft: false
---

页面切走再切回来，Three.js 场景直接黑屏。控制台只有一行 `WebGL: CONTEXT_LOST_WEBGL`。

排查结论：

- Chrome 后台标签会强制回收 GPU 资源，切回来不一定能恢复；
- `renderer.domElement.addEventListener('webglcontextlost', e => e.preventDefault())` 只是第一步；
- 真正要做的是监听 `webglcontextrestored`，在里面重建 renderer、重传纹理和几何体；
- 数据别只存在 GPU 里 —— 把场景描述留在 JSON，恢复时重建比"热恢复"靠谱得多。

一行命令可以在 DevTools 里主动触发验证：

```js
const c = document.querySelector('canvas');
const ext = c.getContext('webgl2').getExtension('WEBGL_lose_context');
ext.loseContext();
```
