---
title: "用 Astro 搭建自己的个人技术博客"
slug: "build-blog-with-astro"
description: "从零搭建一个静态优先、内容驱动、可读性与性能都在线的个人技术博客，记录完整的选型思考与实现细节。"
publishedAt: 2026-09-01
updatedAt: 2026-09-03
category: "web"
tags:
  - Astro
  - TypeScript
  - Blog
  - Web
cover: ""
featured: true
featuredOrder: 1
pinned: true
recommend: true
draft: false
---

写过好几版博客。最早是 WordPress，后来用过 Hexo，也试过 Next.js 全站 SPA。每次都因为同一个原因放弃：写东西的成本太高了，而维护站点的成本比写东西还高。

这一版我换成了 Astro，核心诉求只有三个：**内容必须是纯文件**、**默认输出应该是零 JS**、**主题要能自己完全掌控**。这篇文章记录完整的搭建过程。

## 为什么是 Astro

做个人博客，本质上是在选一个"内容到 HTML 的转换器"。问题不在于谁功能多，而在于默认行为是不是你想要的。

| 方案 | 默认 JS 体积 | 内容形态 | 主要问题 |
| --- | --- | --- | --- |
| WordPress | 较大 | 数据库 | 需要运维，备份麻烦 |
| Hexo | 较小 | Markdown | 主题定制成本高 |
| Next.js | 较大 | 任意 | 默认全站 hydration |
| **Astro** | **0 KB** | **Markdown / MDX** | 需要自己写主题 |

关键差别在最后一列的前一项：**Astro 默认不发送任何 JavaScript**。只有你显式标注 `client:load` 的组件才会被 hydrate。对于一个 95% 都是文字的站点，这个默认行为是对的。

> 一个内容站点如果需要几百 KB 的 JS 才能显示出一段文字，那这个架构从一开始就是错的。

## 初始化与目录结构

用官方脚手架起项目，注意这里不要用 `--template` 直接套博客模板，那样你会继承一堆别人的设计决定。

```bash title="初始化"
npm create astro@latest
# 选择: Empty → TypeScript strict → 安装依赖
```

我最终的目录结构是这样：

```text title="目录结构"
src/
├── components/       # .astro 组件 + 少量 React island
├── config/           # 站点配置（导航、分类、公众号…）
├── content/          # 内容集合
│   ├── blog/
│   ├── projects/
│   └── notes/
├── layouts/
├── pages/
└── styles/
```

这里有个我自己加的约定：**所有可配置项都进 `src/config/`**。导航、分类、技术栈、公众号、首页各区块的展示数量，全部从这里读。这样以后想改"首页显示几篇推荐文章"，不用翻组件代码。

## 内容集合

Astro 5 的内容集合用 `glob` loader，schema 用 Zod 声明。这一步的价值在于：**Frontmatter 写错了会在 build 时就报错**，而不是等到线上才发现少了个字段。

```ts title="src/content.config.ts" showLineNumbers {9,14}
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
```

`z.coerce.date()` 很重要 —— 它让你可以直接写 `publishedAt: 2026-09-01`，不用加引号，也不用手动 `new Date()`。

### 草稿处理

草稿在开发时可见、构建时剔除，这一行搞定：

```ts title="过滤草稿"
const posts = (await getCollection('blog', ({ data }) => {
  return import.meta.env.PROD ? !data.draft : true;
})).sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
```

注意 `import.meta.env.PROD` 的判断，别写成 `NODE_ENV`，在 Astro 里前者才是可靠的。

## 代码高亮

Shiki 是 Astro 内置的，不需要额外装。配置双主题以支持亮/暗模式切换：

```ts title="astro.config.mjs" {6-9}
export default defineConfig({
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light-default',
        dark: 'github-dark-default',
      },
      defaultColor: false,
    },
  },
});
```

`defaultColor: false` 是关键。它让 Shiki 输出 `--shiki-light` 和 `--shiki-dark` 两个 CSS 变量而不是直接写死颜色，配合下面这段 CSS 就能实现主题切换：

```css title="主题感知的代码高亮"
.astro-code,
.astro-code span {
  color: var(--shiki-dark);
}
[data-theme='light'] .astro-code,
[data-theme='light'] .astro-code span {
  color: var(--shiki-light);
}
```

如果这里设成 `true`，代码高亮的颜色就会被内联写死，切换主题时代码块的配色不会跟着变。

## 主题切换不闪烁

这是唯一必须放在 `<head>` 里同步执行的脚本。任何形式的延迟都会导致刷新时白屏闪一下：

```html title="防闪烁脚本" showLineNumbers
<script is:inline>
  (function () {
    var stored = localStorage.getItem('theme');
    var theme =
      stored ||
      (window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark');
    document.documentElement.dataset.theme = theme;
  })();
</script>
```

三个细节：

- 用 `is:inline`，让 Astro 原样输出，不做打包处理
- 用 `documentElement.dataset.theme` 而不是 `class`，语义更清晰
- CSS 里把暗色作为默认值，这样即使脚本没执行也不会闪白

## 搜索用 Pagefind

Pagefind 的思路很聪明：**在构建完成后扫描生成的 HTML**，所以它天然支持任何静态站点，索引体积也小。

```json title="package.json" {4}
{
  "scripts": {
    "build": "astro build && pagefind --site dist"
  }
}
```

在页面上用的时候要注意，Pagefind 的 UI 必须在运行时动态 import，否则构建时找不到 `pagefind` 这个模块（它只在 build 之后才存在）：

```ts title="动态加载 Pagefind UI"
const pagefind = await import(/* @vite-ignore */ '/pagefind/pagefind.js');
```

搜索结果里的链接是绝对路径，如果你把站点部署在子路径下，记得处理一下前缀。

## 性能上的一些取舍

个人博客的性能优化其实没什么神秘的，主要是**别做多余的事**：

1. 图片全部 `loading="lazy"` 且显式写 `width` / `height`，避免布局抖动
2. 字体只加载用到的字重，中文走系统字体栈
3. 动画只用 `transform` 和 `opacity`
4. 第三方脚本能不引就不引

中文用系统字体是个容易被忽略的点。一套完整的中文字体动辄 3-5 MB，而 `PingFang SC` / `Microsoft YaHei` 在每个平台上都是现成的，渲染质量也更好。只有拉丁字母和数字用 web font 就够了。

## 小结

从 WordPress 到 Astro，我最大的感受是：**工具应该让写作变简单，而不是让建站变复杂**。

现在加一篇文章就是在 `src/content/blog/` 里新建一个 `.md` 文件，写一段 frontmatter，然后开始写字。`git push` 之后自动部署。没有数据库，没有后台，没有插件更新。

这大概就是个人博客该有的样子。
