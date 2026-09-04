---
title: "AI Knowledge Assistant"
slug: "ai-knowledge-assistant"
description: "面向团队内部文档的 RAG 问答系统，支持多源数据接入、混合检索与引用溯源。"
date: 2026-03-02
updatedAt: 2026-06-18
cover: ""
featured: true
featuredOrder: 2
status: "开发中"
category: "ai"
stack:
  - TypeScript
  - Node.js
  - PostgreSQL
  - pgvector
  - React
github: ""
demo: ""
draft: false
highlights:
  - label: "文档量"
    value: "12,000+"
  - label: "检索召回率"
    value: "91.4%"
  - label: "P95 延迟"
    value: "1.8s"
  - label: "引用准确率"
    value: "96%"
---

团队内部文档散落在 Notion、Confluence、Git 仓库和一堆 Markdown 文件里。想找"上次那个接口为什么改了"要翻三个地方，最后往往是在某个 PR 的评论里找到答案。

这个项目就是为了解决这件事：让团队能用自然语言问问题，并且**能知道答案是从哪来的**。

## 项目背景

通用的大模型问答有个致命问题：**它不知道你的内部信息，还会在不知道的时候编造**。

对于个人使用，编造的代价是可以接受的。但对于团队决策依据，一个看起来很自信的错误答案比没有答案更危险。

所以这个系统的第一优先级不是"回答得流畅"，而是**"每个答案都能追溯到源文档"**。

## 需要解决的问题

### 检索质量

纯向量检索在以下几个场景表现很差：

```text title="向量检索的失效场景"
查询：「订单超时时间配置在哪」
文档：「order.timeout.ms 参数说明」

→ 语义相关，但字面完全不同，纯向量容易漏

查询：「ERROR_CODE_5001」
→ 精确字符串，向量化后反而丢失了特征
```

最终用混合检索解决：向量检索 + BM25 关键词检索，用 RRF（Reciprocal Rank Fusion）融合排序。

### 文档切分

这是个被严重低估的环节。切分策略直接决定了检索质量上限。

固定长度切分（比如每 500 token 一段）会**把完整的语义单元切开**。我改成按文档结构切分：

```ts title="结构感知切分" showLineNumbers {6,14}
function chunk(node: DocNode, maxTokens = 600): Chunk[] {
  // 标题层级作为切分边界
  if (node.type === 'heading' && node.level <= 2) {
    return node.children.flatMap((child) => chunk(child, maxTokens));
  }

  // 段落 + 代码块作为一个整体，不拆开
  if (node.type === 'code' || node.type === 'paragraph') {
    return [{ text: node.text, heading: currentHeading(node) }];
  }

  // 超长内容才做二次切分，且优先在句子边界切
  if (countTokens(node.text) > maxTokens) {
    return splitBySentence(node.text, maxTokens);
  }

  return [{ text: node.text, heading: currentHeading(node) }];
}
```

关键一点：**每个 chunk 都带上它所属的标题路径**。这样检索到片段时，模型能知道上下文，用户也能看到完整的文档位置。

### 幻觉与引用

这是整个项目最难的部分。要求模型输出引用不难，难的是**验证引用是真的**。

## 技术方案

### 整体架构

```text title="系统架构"
数据源接入层
  Notion / Confluence / Git / Markdown
        ↓
解析与清洗（保留结构信息）
        ↓
结构感知切分 + 标题路径注入
        ↓
向量化（bge-m3）+ BM25 索引
        ↓
┌───────────────────┐
│  查询改写 / 扩展   │
│  混合检索（RRF）   │
│  Rerank（bge-reranker）│
│  上下文组装 + 引用绑定 │
└───────────────────┘
        ↓
流式生成 + 引用校验
```

### 混合检索

```ts title="src/retrieval/hybrid.ts" showLineNumbers {8,18}
async function hybridSearch(query: string, topK = 20) {
  const [vectorHits, keywordHits] = await Promise.all([
    vectorStore.search(await embed(query), topK * 2),
    keywordIndex.search(query, topK * 2),
  ]);

  // RRF 融合：不关心各自的分数尺度，只看排名
  const scores = new Map<string, number>();
  const k = 60;

  for (const [rank, hit] of vectorHits.entries()) {
    scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (k + rank + 1));
  }
  for (const [rank, hit] of keywordHits.entries()) {
    scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (k + rank + 1));
  }

  const candidates = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => byId(id));

  // 精排，RRF 只是粗筛
  return rerank(query, candidates);
}
```

RRF 的好处是**不需要归一化两路检索的分数** —— 向量相似度是 0~1 的余弦值，BM25 是无上限的整数，本来就没法直接加权。只看排名就绕开了这个问题。

### 引用校验

生成之后做一次校验，把模型声称的引用和它实际看到的上下文比对：

```ts title="src/verify/citations.ts" showLineNumbers {5,12}
const CITATION_PATTERN = /\[(\d+)\]/g;

function verifyCitations(
  answer: string,
  context: Chunk[]
): VerificationResult {
  const cited = new Set(
    [...answer.matchAll(CITATION_PATTERN)].map((m) => Number(m[1]))
  );

  // 情况一：引用了不存在的编号
  const invalid = [...cited].filter((i) => i < 1 || i > context.length);
  if (invalid.length > 0) {
    return { valid: false, reason: 'invalid_index', invalid };
  }

  // 情况二：引用存在，但与内容不相关 —— 用 NLI 判断
  return checkEntailment(answer, [...cited].map((i) => context[i - 1]));
}
```

校验不通过时不直接返回错误，而是**重试一次，并在重试 prompt 里明确指出上次的问题**。这个反馈循环把引用准确率从 78% 提到了 96%。

## 遇到的问题

**Notion API 的嵌套结构。** Notion 的 block 是递归嵌套的，一个表格单元格里还能塞一个子页面。最初写的递归解析器在处理三层以上嵌套时会栈溢出，改成显式栈的迭代遍历才稳定。

**增量更新的索引一致性。** 全量重建 12000 篇文档要 40 分钟。改成增量更新后，遇到一个问题：删除的文档如果只在向量库里删了而 BM25 索引没删，检索会返回 404 的内容。最终用一个统一的 `document_id` + 版本号做墓碑标记解决。

**Rerank 的延迟。** bge-reranker 对 20 个候选做精排要 600ms，占了总延迟的三分之一。改成只对 top-10 精排，同时把模型量化到 int8，延迟降到 220ms，质量基本无损。

## 经验总结

- **检索质量决定上限，模型能力只决定下限。** 把 prompt 优化做到极致，不如把切分策略改对一次。
- **引用溯源比答案质量更重要。** 用户能自己判断答案对不对的前提是知道依据，没有引用的答案在团队场景里没有价值。
- **评测集要在动手之前就建。** 我中途才意识到没有量化指标就没法判断改动是否有效，回头补了 200 条标注数据。这段时间本来可以省下来。
- **混合检索不是可选项。** 纯向量检索在专有名词、错误码、配置项这类查询上表现很差，而这些恰恰是内部文档问答的高频场景。

## 后续计划

- 支持表格与图表的结构化问答
- 加入多轮对话的上下文管理
- 接入权限系统，让检索结果符合文档权限

> 相关的 Agent 工程实践记录在[这篇文章](/blog/building-production-ai-agent)里。
