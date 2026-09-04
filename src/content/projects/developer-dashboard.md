---
title: "Developer Dashboard"
slug: "developer-dashboard"
description: "个人开发工作台，聚合 GitHub、CI、服务器与自部署服务的状态，一个页面掌握所有在跑的东西。"
date: 2026-01-14
updatedAt: 2026-05-28
cover: ""
featured: true
featuredOrder: 3
status: "已完成"
category: "web"
stack:
  - Astro
  - React
  - TypeScript
  - Tailwind CSS
  - Cloudflare Workers
github: ""
demo: ""
draft: false
highlights:
  - label: "接入数据源"
    value: "7 个"
  - label: "首屏体积"
    value: "48 KB"
  - label: "Lighthouse"
    value: "98"
  - label: "数据源刷新"
    value: "按需 + 定时"
---

维护的项目多了之后，状态分散在各处：GitHub 看 PR、CI 平台看构建、服务器看监控、域名看证书到期。每天早上要开五六个标签页才能确认"昨天晚上有没有出问题"。

这个项目的目标很简单：**一个页面，看完全部。**

## 项目背景

市面上的 dashboard 工具要么太重（Grafana 配置成本高），要么太贵（SaaS 按月收费，个人项目用不上）。

我需要的东西其实很少：几个卡片，显示几个数字，红了就说明有问题。不需要告警、不需要权限、不需要多租户。

## 需要解决的问题

### API 限流

GitHub API 未认证时只有 60 次/小时。假设页面每 5 分钟刷新一次，一小时就是 12 次，看起来够用。但实际上：

```text title="配额消耗计算"
一次页面加载需要的数据：
  - 用户基本信息        1 次
  - 仓库列表            1 次
  - 每个仓库的 PR       5 次
  - 每个仓库的 Workflow 5 次
  - 通知                1 次
  ─────────────────────
  合计                 13 次 / 次加载

60 / 13 ≈ 4 次加载 / 小时  ← 不够
```

解决方案是**服务端聚合 + 缓存**。所有第三方 API 调用都在 Cloudflare Worker 里做，结果缓存到 KV，前端只请求一个聚合接口。

```ts title="src/worker/aggregate.ts" showLineNumbers {8,16}
export default {
  async fetch(request: Request, env: Env) {
    const cacheKey = 'dashboard:v1';
    const cached = await env.KV.get(cacheKey, 'json');

    // 5 分钟内的缓存直接返回
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
      return json(cached.data, { servedFrom: 'cache' });
    }

    // 并发拉取所有数据源，单个失败不影响其他
    const results = await Promise.allSettled([
      fetchGitHub(env),
      fetchCIStatus(env),
      fetchServerStats(env),
      fetchCertExpiry(env),
    ]);

    const data = {
      at: Date.now(),
      sources: results.map((r, i) =>
        r.status === 'fulfilled'
          ? { ok: true, data: r.value }
          : { ok: false, error: String(r.reason), index: i }
      ),
    };

    await env.KV.put(cacheKey, JSON.stringify(data));
    return json(data, { servedFrom: 'origin' });
  },
};
```

`Promise.allSettled` 而不是 `Promise.all` —— 这是刻意的。**一个数据源挂了不应该让整个页面白屏**，而是那张卡片显示"暂时不可用"，其他照常。

### 密钥管理

PAT（Personal Access Token）不能放在前端，也不能硬编码进仓库。用 Cloudflare Workers 的 secrets：

```bash title="设置密钥"
echo "ghp_xxxx" | npx wrangler secret put GITHUB_TOKEN
```

这样密钥只存在于 Cloudflare 的环境里，代码仓库里只有一个 `env.GITHUB_TOKEN` 的引用。

## 技术方案

### 静态优先

页面本身是 Astro 静态生成的，**只有数据卡片是 React island**。整站首屏 JS 只有 48 KB，Lighthouse 98 分。

```astro
---
// 页面骨架是静态的
import Layout from '~/layouts/Layout.astro';
import { StatCard } from '~/components/react/StatCard';
---

<Layout title="Dashboard">
  <!-- 静态骨架，SSR 时就有内容 -->
  <section class="grid">
    <StatCard client:load source="github" />
    <StatCard client:visible source="ci" />
    <StatCard client:visible source="server" />
  </section>
</Layout>
```

`client:visible` 让首屏之外的卡片按需 hydration，进一步减少初始 JS。

### 视觉设计

这一块花了不少时间。Dashboard 最容易做成"一堆方格子"，要有辨识度得靠别的东西：

- **单一强调色。** 只有异常状态用红色，正常状态一律中性色。这样一旦有红色出现，视线会立刻被抓住。
- **数字用等宽字体。** 数据会跳动，等宽字体能避免宽度变化导致的布局抖动。
- **状态用形状而不是颜色单独表达。** 色觉障碍用户也要能分辨，所以配了不同的图标形状。

```ts title="状态色板" showLineNumbers
const STATUS = {
  ok:      { color: 'var(--muted)',   icon: 'check'  },
  warning: { color: 'var(--amber)',   icon: 'alert'  },
  error:   { color: 'var(--danger)',  icon: 'cross'  },
  idle:    { color: 'var(--faint)',   icon: 'dash'   },
} as const;
```

## 遇到的问题

**Cloudflare Workers 的 CPU 时间限制。** 免费版单次请求最多 10ms CPU 时间。最初在 Worker 里做了数据转换和排序，直接超限。改成只做转发和缓存，数据整形放到前端，问题解决。

**证书到期检测耗时不稳定。** 检查 TLS 证书需要建立连接握手，慢的时候要 2 秒。改成一个独立的 Cron Trigger 每小时跑一次，结果写进 KV，页面只读缓存。

**SSE 和 Cloudflare 的兼容问题。** 最初想用 SSE 做实时推送，但 Workers 的流式响应有诸多限制。最后放弃实时，改成"页面可见时每 60 秒轮询"，配合 `visibilitychange` 在后台标签页暂停轮询。

```ts title="可见时才轮询" showLineNumbers {6}
useEffect(() => {
  let timer: ReturnType<typeof setInterval> | undefined;

  const start = () => {
    stop();
    if (document.visibilityState === 'visible') {
      timer = setInterval(refresh, 60_000);
    }
  };
  const stop = () => timer && clearInterval(timer);

  document.addEventListener('visibilitychange', start);
  start();
  return () => {
    stop();
    document.removeEventListener('visibilitychange', start);
  };
}, [refresh]);
```

## 经验总结

- **`allSettled` 优于 `all`。** 聚合类接口的铁律：部分失败不应该导致整体失败。
- **缓存粒度按数据源分，不要一刀切。** 服务器指标 30 秒过期，证书到期时间 24 小时过期。统一用 5 分钟会浪费大量请求。
- **免费额度要先算清。** Cloudflare Workers 的 10ms CPU 限制、GitHub 的 5000 次/小时认证配额，动手之前算一遍能省掉很多返工。
- **Dashboard 的设计重点是"异常突出"，不是"信息密集"。** 一个满是数字的页面等于没有信息，重要的是让人一眼看出哪里不对。

## 状态

这个项目已经稳定运行半年，日常使用主要就是扫一眼有没有红色。没有再加功能的计划 —— 它解决的就是那个具体问题，做完了。
