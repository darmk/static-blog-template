# darmk 个人空间

一个内容驱动、静态优先的个人技术博客。Dark / Minimal / Tech 风格，强调可读性、性能与克制的交互。

> 记录 Web、AI、工程实践、Three.js 与 3D 可视化，以及开发过程中值得留下来的思考。  
> Code · Build · Share

---

## 🛠 用 WorkBuddy 怎么构建这个博客

本项目完全由 [WorkBuddy](https://www.workbuddy.cn)（腾讯出品的多端 AI 编程助手）在对话中驱动完成——不是手写每一行代码，而是把规范交给 WorkBuddy，让它自己规划架构、生成组件、跑构建、上浏览器验收、修 bug。

### 大致流程

1. **开一份需求**。在 WorkBuddy 对话里把想要的网站讲清楚：
   - 站点定位（个人技术博客，风格 Dark / Minimal / Tech / Grid / Glow / Editorial，避免 AI 模板感）
   - 技术栈（Astro + TypeScript strict + React Islands + Tailwind + MDX + Shiki + Pagefind + GSAP + Motion + Lucide + Giscus）
   - 页面与功能清单（首页分区、文章 TOC/进度/复制/灯箱、Ctrl+K 命令面板、深浅色、响应式 5 档）
   - 内容要求（≥5 篇博客、≥3 个项目、≥3 条笔记）
   - 必装并启用的 Skill（`/设计味道增强版`、`/Ponytail`、`/GSAP 动画开发助手`、`/playwright-cli`）
2. **进入 Agent 模式**。告诉 WorkBuddy 可以自由编辑文件，它会先生成目录骨架、配置文件、布局与基础组件，然后逐块填内容。
3. **持续迭代 + 浏览器验收**。每个里程碑用 `/playwright-cli` 真实打开页面验证——标题、链接、复制按钮、主题切换、跳转、滚动行为都得在浏览器里点过才算过。
4. **跑必需的 Skill 审计**：`/设计味道增强版` 看视觉、`/Ponytail` 控制复杂度、`/GSAP 动画开发助手` 检查动画清理——不通过就改。
5. **修 bug、补 README**。换页主题丢失、命令面板关闭不了这类真实问题，也是让 WorkBuddy 读源码、查 Playwright 控制台、再修的。

### WorkBuddy 帮上的几个忙

| 场景                      | WorkBuddy 做了什么                                                                 |
| ----------------------- | ----------------------------------------------------------------------------- |
| Astro 7 的 Markdown 处理器迁移 | 翻 `node_modules/astro/dist/content/content-layer.js` 源码，确认 `markdown.rehypePlugins` 已废弃，改用 `unified({ rehypePlugins: [...] })` 才能跑自定义 rehype 插件 |
| 标题锚点不生效                 | 重写 `rehypeHeadingAnchor`，自己用 `github-slugger` 算 slug，写入自定义 id                          |
| 静态站点的分类筛选               | `?category=` 在运行时不会被服务端求值，改为「渲染全部 + `data-category` + 客户端脚本即时筛选」                 |
| View Transitions 把主题重置了  | 在 `astro:after-swap` 重新应用主题到 `<html>` 上                                                  |
| 命令面板无法关闭               | `motion/react` 的 `<AnimatePresence>` 在 React 19 下不卸载退出元素，改为普通 `<div>` 条件渲染              |
| OG 图缺失                 | 用 Playwright 把一个 HTML 临时页截图 1200×630，直接写成 `public/og.png`                            |

### 对其他想复刻的人的提示

- WorkBuddy 的真正价值在于「能跑浏览器、能查源码、能跑审计脚本」——遇到 bug 不要靠猜，把控制台和构建日志贴给它。
- 设计 Skill 不只是审视觉，也是一个反模板检查器，避免页面看起来像 AI 自动生成的。
- 写好一份「带可量化验收标准」的需求，WorkBuddy 才能在每个阶段知道算不算完成。

---

## ✨ 特性

- **Astro 7 + TypeScript（strict）+ React Islands**：页面默认零 JS，动效只在值得的地方出现。
- **内容即文件**：文章 / 项目 / 笔记都是 `src/content/` 下的纯 Markdown，配置全部数据驱动，无硬编码。
- **首页编排**：Hero（GSAP 入场）→ 推荐文章 → 最近更新 → 主题 Bento → 项目 → 公众号 → 技术栈 → 关于，桌面端带右侧章节导航。
- **文章体验**：目录（TOC + 滚动高亮）、阅读进度条、代码块一键复制、图片灯箱、锚点跳转。
- **搜索**：Pagefind 全文索引 + `Ctrl/⌘ + K` 命令面板。
- **主题**：深色 / 浅色，跟随系统并记忆本地偏好，换页主题不丢失。
- **响应式**：390 / 768 / 1024 / 1280 / 1440 五档断点。
- **可访问性**：`prefers-reduced-motion` 全程尊重，对比度与焦点态均做了处理。
- **SEO / 社交**：每页独立 `title` / `description` / Open Graph / Twitter Card，自动 `sitemap` 与 `RSS`。

技术栈：Astro · TypeScript · React 19 · Tailwind CSS v4 · Shiki · Pagefind · GSAP · Motion · Lucide · Giscus（可选项）。

---

## 🚀 快速开始

环境要求：Node.js ≥ 20、npm（或 pnpm / yarn）。

```bash
npm install              # 安装依赖
npm run dev              # 本地开发（带热更新）
npm run build            # 生产构建（含 Pagefind 索引）
npm run preview          # 预览 dist/
npm run check            # astro check 类型检查
```

注意：`npm run build` 阶段生成 `dist/pagefind/`，部署时要一起上传。

---

## 📁 项目结构（提要）

```
src/
├─ components/
│  ├─ astro/        # 所有 Astro 组件（Navbar / Hero / Footer / Sections / TOC / …）
│  └─ react/        # 仅 CommandPalette 一个 React Island
├─ config/          # 站点级配置（数据驱动，不硬编码）：site / social / wechat / categories / navigation / home
├─ content/         # 文章 / 项目 / 笔记（纯 Markdown，frontmatter 由 content.config.ts 校验）
├─ layouts/         # BaseLayout（SEO / 主题脚本 / View Transitions）
├─ lib/             # content / interactions / hero-animation (GSAP) / rehype / shiki-transformer
├─ pages/           # 路由
├─ styles/global.css# 设计系统与主题 token
└─ content.config.ts# 集合 schema（zod）

public/
├─ favicon.svg
├─ images/avatar.svg
├─ og.png           # 社交分享图
└─ images/wechat/   # 公众号二维码放这里（qrcode.webp）
```

---

## ✍️ 内容创作

所有内容都是 `src/content/` 下的 Markdown 文件，frontmatter 由 `src/content.config.ts` 校验。

### 文章

```markdown
---
title: 用 Astro 搭建自己的个人技术博客
description: 从零搭建一个静态优先、内容驱动的个人技术博客。
publishedAt: 2026-09-01
updatedAt: 2026-09-02        # 可选
category: web                # 见 src/config/categories.ts 的 key
tags: [Astro, TypeScript, Blog]
cover: /images/cover.webp    # 可选；留空不渲染
featured: true
featuredOrder: 1
pinned: false
draft: false                 # true 则构建时排除
---

正文用标准 Markdown。代码块支持 `title="..."` 与 `showLineNumbers`。
```

### 项目

字段：`title` / `description` / `date` / `status`（`进行中` / `已完成` / `开发中`）/ `category` / `stack` / `github` / `demo` / `highlights`（`[{label, value}]`）/ `cover`（缺省时用分类程序化视觉）。

### 笔记

```markdown
---
title: 关于 LLM 稳定输出 JSON 的一点记录
publishedAt: 2026-08-10
tags: [LLM, JSON, Prompt]
source: ''    # 可选
draft: false
---
```

笔记详情页用时间线排版（`prose-note`），适合短思考与踩坑记录。

---

## ⚙️ 配置（数据驱动）

所有站点文案、链接、分类都在 `src/config/` 里维护，组件读取，**不要在模板里硬编码**。

| 文件              | 作用                                  |
| --------------- | ----------------------------------- |
| `site.ts`       | 站点名、描述、作者、url、头像、社交、ICP、建站年份     |
| `social.ts`     | GitHub / 邮箱 / RSS（值为空时自动隐藏）       |
| `wechat.ts`     | 公众号名称、二维码路径、各页开关                  |
| `categories.ts` | 分类 key、label、程序化视觉类型、栅格跨度、主题色     |
| `navigation.ts` | 主 / 次级导航                            |
| `home.ts`       | 首页各区块展示数量                          |

### 部署前需要确认 / 填写的真实值

以下在 `src/config/site.ts` 与 `src/config/social.ts` 中已给出占位，请替换为自己的：

1. **`siteConfig.url`** → 你的正式域名（影响 canonical / RSS / sitemap / OG）。
2. **`siteConfig.github`** → GitHub 地址（当前为 `https://github.com/darmk`）。
3. **邮箱** → 在 `src/config/social.ts` 把 `邮箱` 项的 `value` 填上，页脚才会出现邮箱链接。
4. **`icp`** → 备案号（选填）。
5. **公众号二维码** → 放到 `public/images/wechat/qrcode.webp`（推荐 480×480）。未提供时，公众号区块显示「二维码待配置」占位，**不会生成假图**。
6. **评论（Giscus）** → 在 `site.ts` 的 `giscusConfig` 填 `repo` / `repoId` / `category` / `categoryId`，并把 `enabled` 设为 `true`。

---

## 🔍 搜索 · 🎨 主题 · ♿ 动效（要点）

- **搜索**：构建时由 Pagefind 索引全站，正文按 `Ctrl/⌘ + K` 调出命令面板。博客列表的「分类」胶囊用客户端脚本即时筛选。
- **主题**：跟随系统 + `localStorage` 记忆；通过 `astro:after-swap` 在换页后重新应用，**无白屏、无重置**。
- **动效**：Hero GSAP 入场（仅 opacity / y / blur）、其余交互原生 rAF 实现；全局尊重 `prefers-reduced-motion`。

---

## 📦 部署

构建产物 `dist/` 可托管到任意静态平台（Vercel / Netlify / Cloudflare Pages / GitHub Pages / 对象存储 + CDN）。

```bash
npm run build   # 产出 dist/ + pagefind 索引
```

---

## 📄 协议

站点代码可自由学习与复用；文中内容版权归作者所有。
