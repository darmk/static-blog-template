---
title: "pnpm 的 hoisting 坑：Three.js 装了两份"
slug: "pnpm-hoisting-threejs"
publishedAt: 2026-07-02
tags:
  - pnpm
  - Node.js
  - 工程化
source: "开发笔记"
draft: false
---

场景里的物体突然全部失去光照，材质报 `THREE.Material: shader not found`。折腾了两小时，最后发现是 monorepo 里 `apps/demo` 和 `packages/core` 各自依赖了不同版本的 Three.js，pnpm 严格的依赖隔离让 demo 打包时把两份 three 都打了进去，`instanceof` 判断全部失效。

解法：

```toml
# pnpm-workspace.yaml
overrides:
  three: "0.169.0"
```

教训：涉及大量 `instanceof` 的库（Three.js、Lint 系全家桶）在 monorepo 里必须锁单一版本。
