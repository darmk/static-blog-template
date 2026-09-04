---
title: "让 LLM 输出稳定 JSON 的三个实用招"
slug: "llm-stable-json-output"
publishedAt: 2026-06-15
tags:
  - AI
  - LLM
  - Prompt
source: "开发笔记"
draft: false
---

做 Agent 工具调用时踩出来的经验，按有效性排序：

1. **给一个字段最少的例子**。例子字段越多，模型越容易在输出里"补全"你不需要的字段。
2. **temperature 设 0 也要做 schema 校验**。概率低不代表零概率，失败重试比信任模型便宜。
3. **要求"先想后写"不如要求"只写 JSON"**。让模型输出思考过程再输出 JSON，边界处更容易截断或混入杂质。

另外一个冷知识：`response_format: { type: "json_object" }` 在部分模型上会显著降低指令遵循度，不是万能开关。
