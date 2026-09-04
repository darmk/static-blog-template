---
title: "构建一个真正可用的 AI Agent 系统"
slug: "building-production-ai-agent"
description: "从 Context 管理、Tool Calling 到 Workflow 编排，完整记录一个能上线跑的 AI Agent 系统的工程实现与踩过的坑。"
publishedAt: 2026-08-26
updatedAt: 2026-09-01
category: "ai"
tags:
  - AI
  - Agent
  - Architecture
  - TypeScript
cover: ""
featured: false
featuredOrder: 2
pinned: false
recommend: true
draft: false
---

Agent 的 demo 都很好看。给模型接几个工具，跑一个"帮我查天气然后订机票"的例子，效果惊艳。但真把它放到生产环境，问题会在一周内全部暴露出来。

这篇文章不讲概念，只讲工程实现：怎么让一个 Agent 系统真正稳定地跑起来。

## 先明确 Agent 不是什么

大部分"Agent 项目"失败的原因，是在不需要 Agent 的地方用了 Agent。

判断标准很简单：**如果任务的步骤可以被完整枚举出来，那就不需要 Agent，写个流程就行。**

```ts title="判断是否需要 Agent"
// 不需要 Agent：步骤固定
async function handleRefund(orderId: string) {
  const order = await db.orders.find(orderId);
  if (!order.refundable) return reject('订单不可退款');
  return payment.refund(order.paymentId);
}

// 需要 Agent：路径无法预先枚举
async function investigateIncident(alert: Alert) {
  // 需要看日志、查监控、翻最近发布、判断根因
  // 每一步依赖上一步的结果，且分支无法穷举
}
```

Agent 的价值在于**用模型的推理能力替代人类的判断**，而不是替代 `if-else`。

## 架构分层

我把系统拆成四层，每层的职责边界非常明确：

```text title="Agent 系统分层"
┌─────────────────────────────────────────┐
│  Orchestrator  编排层                    │
│  任务拆解 / 状态机 / 重试 / 超时          │
├─────────────────────────────────────────┤
│  Planner  规划层                         │
│  ReAct 循环 / 下一步决策                 │
├─────────────────────────────────────────┤
│  Tools  工具层                           │
│  受控副作用 / Schema 校验 / 幂等          │
├─────────────────────────────────────────┤
│  Context  上下文层                       │
│  消息裁剪 / 记忆 / 检索                  │
└─────────────────────────────────────────┘
```

很多人只写了中间两层就开始跑，然后在上下文爆掉和工具乱调两个问题上反复挣扎。

## Context 管理是第一个拦路虎

一个跑 20 步的任务，如果不做裁剪，上下文轻松突破 100k token。而且更糟的是：**长上下文里的模型表现会明显下降**，它不是均匀退化，而是在中后段开始丢失早期信息。

我的策略是分层压缩：

```ts title="src/context/compactor.ts" showLineNumbers {18,26}
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** 压缩优先级，数字越大越先被裁掉 */
  volatile?: number;
}

async function compact(messages: Message[], budget: number) {
  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');

  // 1. 永远保留最近 N 轮，这些是当前推理的依据
  const keepRecent = 6;
  const recent = rest.slice(-keepRecent);
  let middle = rest.slice(0, -keepRecent);

  // 2. 工具返回的大段结果优先压缩，它们体积大但信息密度低
  middle = await Promise.all(
    middle.map(async (m) => {
      if (m.role === 'tool' && m.content.length > 800) {
        return { ...m, content: await summarize(m.content), volatile: 3 };
      }
      return { ...m, volatile: m.volatile ?? 1 };
    })
  );

  // 3. 按 volatile 降序裁剪，直到进入预算
  middle.sort((a, b) => (b.volatile ?? 0) - (a.volatile ?? 0));
  while (estimateTokens([...system, ...middle, ...recent]) > budget) {
    if (middle.length === 0) break;
    middle.shift();
  }

  return [...system, ...middle, ...recent];
}
```

几个实践下来很关键的点：

- **系统提示词永远不压缩**，它是行为的锚点
- **工具结果优先压缩**，尤其是抓网页、查数据库返回的大段 JSON
- **压缩后的摘要要标注来源**，否则模型会把它当成真实对话

> 上下文管理不是优化项，是 Agent 系统的地基。地基没打好，上面怎么设计都会塌。

## 工具调用要当成 API 来设计

模型的工具调用本质是"用自然语言写的函数调用"，但它会犯所有新手程序员会犯的错：参数类型不对、必填项漏传、对不存在的 ID 发起请求。

所以工具的 schema 必须严格，描述必须准确：

```ts title="src/tools/query-orders.ts" showLineNumbers {5,9,12}
export const queryOrders = defineTool({
  name: 'query_orders',
  description:
    '按条件查询订单列表。仅返回订单摘要，不含明细。' +
    '若需要某个订单的完整信息，请使用 get_order_detail。',
  schema: z.object({
    status: z
      .enum(['pending', 'paid', 'shipped', 'refunded'])
      .describe('订单状态，必填'),
    limit: z.number().int().min(1).max(50).default(20)
      .describe('返回条数，最多 50'),
  }),
  async execute({ status, limit }, ctx) {
    return ctx.db.orders.findMany({ where: { status }, take: limit });
  },
});
```

`description` 里那句"若需要完整信息请使用 get_order_detail"看起来是废话，实际上能显著减少模型的错误调用。模型需要从描述里推断工具之间的关系。

### 工具必须幂等

写操作一定要带幂等键。Agent 会重试，网络会抖动，一个不幂等的工具在系统里迟早会造成重复扣款：

```ts title="幂等执行"
async function executeIdempotent(key: string, fn: () => Promise<unknown>) {
  const existing = await redis.get(`idem:${key}`);
  if (existing) return JSON.parse(existing);

  const result = await fn();
  await redis.set(`idem:${key}`, JSON.stringify(result), 'EX', 86400);
  return result;
}
```

### 工具返回值要小而准

不要让工具返回整个数据库对象。返回过多字段有两个坏处：吃掉上下文，以及给了模型不该有的信息（比如内部状态字段、其他用户的数据）。

我的做法是每个工具都有一个对应的 `toContext()` 序列化函数，只暴露模型需要的字段。

## 编排：用状态机而不是 while 循环

最常见的新手写长这样：

```ts title="不要这样写"
while (!done) {
  const next = await llm.chat(messages);
  messages.push(next);
}
```

这个循环没有超时、没有步数上限、没有失败恢复、没有人工介入通道。跑挂了就只能重来。

改成显式状态机：

```ts title="src/orchestrator/machine.ts" showLineNumbers {4,12,20}
type State =
  | { kind: 'planning' }
  | { kind: 'awaiting_tool'; call: ToolCall }
  | { kind: 'awaiting_human'; reason: string; snapshot: Snapshot }
  | { kind: 'done'; result: string }
  | { kind: 'failed'; error: AgentError };

async function step(state: State, ctx: Ctx): Promise<State> {
  switch (state.kind) {
    case 'planning': {
      if (ctx.stepCount > ctx.maxSteps) {
        return { kind: 'failed', error: new StepLimitError(ctx.stepCount) };
      }
      const next = await ctx.planner.decide(ctx.messages);
      return next.toolCall
        ? { kind: 'awaiting_tool', call: next.toolCall }
        : { kind: 'done', result: next.content };
    }

    case 'awaiting_tool': {
      const output = await ctx.tools.run(state.call);
      ctx.messages.push(toolMessage(state.call, output));
      return { kind: 'planning', };
    }

    case 'awaiting_human':
      return state; // 挂起，等待外部事件恢复
  }
}
```

状态机带来三个直接好处：

1. **每一步都可以持久化**，进程挂了能从中断处恢复
2. **可以设置全局超时和步数上限**，成本控制变成硬约束
3. **可以插入人工审批节点**，高风险操作卡住等人确认

## 成本控制

没有成本约束的 Agent 系统是一个信用卡账单生成器。我在编排层加了两道闸：

```ts title="成本闸门"
const budget = {
  maxSteps: 20,
  maxTokensPerRun: 200_000,
  maxCostPerRun: 0.5,
  onExceed: 'fail' as const,
};
```

`onExceed: 'fail'` 而不是 `'warn'`。警告在自动化系统里没有意义，没人会去看。超预算就停，把状态存下来，让调用方决定怎么办。

另外一个小技巧：**给不同复杂度的任务路由到不同的模型**。分类、抽取、格式化这类简单步骤用小模型，只有真正需要推理的规划步骤用大模型。这一步能把成本降低 60% 以上。

## 可观测性

Agent 出问题时，你最需要的是"它当时在想什么"。所以每一步都要留痕：

```ts title="追踪每一步"
interface TraceStep {
  index: number;
  state: State['kind'];
  input: unknown;
  output: unknown;
  tokens: { prompt: number; completion: number };
  latencyMs: number;
  model: string;
}
```

有了这个，排查问题就是从 trace 里找到第一个不对劲的 step，然后看它的 input。没有这个，排查问题就是靠猜。

## 小结

回到开头那句话：**Agent 的价值在于用模型的推理能力替代人类的判断**。

围绕这一点，工程上要做的就是三件事：

- **控制住上下文**，让模型始终有足够的、准确的信息做判断
- **约束住工具**，让模型的判断能够安全、幂等地作用于真实世界
- **编排住流程**，让整个过程可恢复、可控制、可观测

这三件事做好了，Agent 就能上线。做不好，就只是一个会偶尔给你惊喜的 demo。
