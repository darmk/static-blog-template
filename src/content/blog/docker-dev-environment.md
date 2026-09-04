---
title: "Docker 开发环境实践"
slug: "docker-dev-environment"
description: "用 Docker 统一本地开发环境，解决「在我机器上是好的」这个问题，同时不牺牲开发体验。"
publishedAt: 2026-06-12
updatedAt: 2026-07-05
category: "devops"
tags:
  - Docker
  - DevOps
  - 工程实践
cover: ""
featured: false
featuredOrder: 4
pinned: false
recommend: false
draft: false
---

"这不是我写的 bug，在我机器上是好的。" —— 这句话我说了太多次，后来决定彻底解决它。

但要注意：**统一环境不等于把开发者塞进一个黑盒**。开发环境必须保持跟本地一样快的反馈速度，否则没人愿意用。

## 目标与边界

先明确要统一什么，不要统一什么：

| 统一 | 不统一 |
| --- | --- |
| 运行时版本（Node / Python） | 编辑器与插件 |
| 系统依赖（编译工具链） | 调试工具 |
| 数据库与中间件 | Git 配置 |
| 环境变量的可选项 | 个人 dotfiles |

核心原则是：**应用跑在容器里，工具跑在本机**。编辑器、Git、浏览器都在宿主机，只有应用进程和它依赖的服务进容器。

## 分层设计

一个项目里我通常维护三个 compose 文件：

```text title="compose 文件分层"
docker-compose.yml        # 基础：所有环境共用
docker-compose.dev.yml    # 开发：挂载源码、开调试端口
docker-compose.test.yml   # 测试：一次性数据库、无网络
```

基础文件只定义服务本身：

```yaml title="docker-compose.yml" showLineNumbers
services:
  app:
    build:
      context: .
      target: dev
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD:-localdev}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 3s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 3s
      retries: 10

volumes:
  pgdata:
```

`healthcheck` 加 `condition: service_healthy` 是关键。默认的 `depends_on` 只等容器启动，不等服务就绪，结果就是应用启动时数据库还没准备好，报一堆连接错误然后退出。

开发覆盖文件只做三件事：

```yaml title="docker-compose.dev.yml" showLineNumbers {5,9,12}
services:
  app:
    volumes:
      - .:/app
      # 关键：不要把宿主机 node_modules 挂进去
      - node_modules:/app/node_modules
    ports:
      - '5173:5173'
      - '9229:9229' # Node 调试端口
    command: pnpm dev
    environment:
      NODE_ENV: development

volumes:
  node_modules:
```

## 匿名卷解决 node_modules 冲突

上面第 6 行那个 `node_modules:/app/node_modules` 是整套配置里最重要的一个技巧。

如果不加，宿主机的 `node_modules` 会覆盖容器里的。问题在于：如果宿主机是 macOS 或 Windows，装出来的原生模块（比如 `esbuild`、`better-sqlite3`）在 Linux 容器里是跑不了的。

用命名卷把容器的 `node_modules` 独立出来，容器里装什么就是什么，宿主机完全不干扰。

首次启动后需要同步一次：

```bash title="同步依赖"
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose exec app pnpm install
```

## Dockerfile 的多阶段写法

```dockerfile title="Dockerfile" showLineNumbers {1,14,26}
# syntax=docker/dockerfile:1

# 基础：只装依赖，缓存友好
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 开发：包含完整工具链
FROM deps AS dev
RUN apk add --no-cache git openssh-client
COPY . .
EXPOSE 5173 9229
CMD ["pnpm", "dev"]

# 生产：只保留运行需要的东西
FROM base AS prod
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY ./dist ./dist
USER node
CMD ["node", "dist/server.js"]
```

几个要点：

- **`--mount=type=cache`** 让包管理器的缓存跨构建复用，第二次构建能快 10 倍
- **COPY 依赖清单和安装分两步**，改代码不会让依赖层失效
- **生产镜像用 `USER node`**，不要以 root 运行

## 文件监听的坑

这是开发环境最大的坑：在 macOS 和 Windows 上，Docker 的文件系统事件传递有延迟，热更新经常失灵或者慢半拍。

Vite / webpack 的解决方式是开启轮询：

```ts title="vite.config.ts" showLineNumbers {4}
export default defineConfig({
  server: {
    host: '0.0.0.0',      // 必须，否则容器外访问不到
    watch: {
      usePolling: true,   // Docker 环境必须开
      interval: 300,
    },
  },
});
```

`host: '0.0.0.0'` 也是必须的。默认情况下 dev server 只监听 localhost，在容器里就等于只监听容器内部，宿主机的浏览器打不开。

## 环境变量的治理

项目里经常出现这种情况：`.env` 有 40 个变量，新人 clone 下来不知道哪些必填、默认值是什么、格式长什么样。

我的做法是把 `.env.example` 当成文档来写：

```bash title=".env.example"
# ── 必填 ──────────────────────────────
# 数据库连接串，格式：postgres://user:pass@host:5432/db
DATABASE_URL=
# 至少 32 字符随机串，生成：openssl rand -hex 32
SESSION_SECRET=

# ── 可选，有默认值 ────────────────────
PORT=5173
LOG_LEVEL=info
# 留空则使用本地文件存储
S3_BUCKET=
```

然后加一个启动前检查：

```js title="scripts/check-env.mjs" showLineNumbers {9}
import { readFileSync, existsSync } from 'node:fs';

const REQUIRED = ['DATABASE_URL', 'SESSION_SECRET'];

const example = readFileSync('.env.example', 'utf8');
const actual = existsSync('.env')
  ? Object.fromEntries(
      readFileSync('.env', 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), true])
    )
  : {};

const missing = REQUIRED.filter((k) => !actual[k]);
if (missing.length) {
  console.error('缺少必需的环境变量：' + missing.join(', '));
  console.error('请参考 .env.example 配置');
  process.exit(1);
}
```

挂到 `predev` 上，启动时自动检查。这比写进 README 有效得多 —— README 没人看，报错所有人都会看。

## CI 里复用同一套配置

最大的收益在这里：CI 用的 compose 文件和本地是同一份，不会出现"CI 挂了本地是好的"。

```yaml title=".github/workflows/ci.yml" showLineNumbers {12}
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: 启动服务
        run: docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build --wait
      - name: 跑测试
        run: docker compose exec -T app pnpm test
      - name: 收集日志
        if: failure()
        run: docker compose logs --no-color > ci-logs.txt
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: logs
          path: ci-logs.txt
```

`--wait` 会等所有 healthcheck 通过才返回，比 `sleep 30` 可靠得多。

测试覆盖文件的关键是**数据隔离**：

```yaml title="docker-compose.test.yml" {4,6}
services:
  app:
    command: pnpm test
    environment:
      NODE_ENV: test
  db:
    tmpfs:
      - /var/lib/postgresql/data
```

`tmpfs` 让数据库完全跑在内存里，测试既快又天然隔离，跑完即焚。

## 一些数字

引入这套配置之后：

| 指标 | 之前 | 之后 |
| --- | --- | --- |
| 新人首次跑起来 | 半天 | 15 分钟 |
| "本地是好的"类问题 | 每周 2-3 次 | 基本消失 |
| CI 环境与本地不一致导致失败 | 每月 4-5 次 | 0 |
| 首次冷启动 | — | 约 3 分钟 |

## 小结

Docker 开发环境的价值不在技术，在于**消除分歧**。

一个 `docker compose up` 就能跑起来的项目，意味着新人第一天就能提交代码，意味着 CI 的失败一定是真的失败，意味着你再也不用说"在我机器上是好的"。

但要注意别过度：如果一套配置让开发者的每次热更新都要等 3 秒，那它带来的痛苦会大于收益。反馈速度是开发体验的底线。
