---
title: "模块边界：架构设计中最难的那个决定"
slug: "module-boundaries-architecture"
description: "讨论怎么划模块的边界、什么时候该拆、什么时候不该拆，以及耦合的真正代价在哪里。"
publishedAt: 2026-04-08
updatedAt: 2026-05-14
category: "architecture"
tags:
  - Architecture
  - 工程实践
  - 设计
cover: ""
featured: false
featuredOrder: 6
pinned: false
recommend: false
draft: false
---

代码写到一定规模，一定会遇到这个问题：这段逻辑应该放在哪个模块？

看起来是个小问题，但它决定了接下来两年这个项目的维护成本。

## 边界划错的代价

我见过最典型的错误是按**技术分层**而不是按**业务能力**划分。

```text title="按技术分层（常见但有问题）"
src/
├── controllers/
├── services/
├── repositories/
├── models/
└── utils/
```

这个结构的问题在于：**实现一个需求要改动 5 个目录**。加一个"用户改绑手机号"的功能，要动 `controllers/user.ts`、`services/user.ts`、`repositories/user.ts`、`models/user.ts`，最后把校验逻辑塞进 `utils/`。

半年之后 `utils/` 里有 80 个文件，没人知道哪个还在用。

## 换个切法

按业务能力切：

```text title="按业务能力划分"
src/
├── identity/          # 身份与登录
│   ├── api.ts
│   ├── service.ts
│   ├── store.ts
│   └── index.ts       # 只导出外部需要的
├── billing/           # 计费
├── notification/      # 通知
└── shared/            # 真正通用的基础设施
```

判断标准只有一条：**这个模块能不能被独立讲清楚**。如果你没法用一句话说清楚一个模块负责什么，边界大概率划错了。

`identity` 可以 —— "负责用户身份认证与会话管理"。`utils` 不行 —— 它负责"一些不好归类的东西"。

### 用 index.ts 控制可见性

```ts title="src/identity/index.ts" showLineNumbers
export { login, logout, verifySession } from './service';
export type { Session, Credentials } from './types';

// 注意：store.ts 和 internal.ts 不导出
// 外部只能通过 service 层访问，内部实现可以随便改
```

这一层是**模块边界的实际载体**。没有它，任何文件都能 import 任何文件，模块就名存实亡了。

## 什么时候该拆

三个信号同时出现时再拆，只出现一个时先忍着：

### 信号一：变更频率差异

模块内部有些部分每天都改，有些半年没动过。这说明它们其实不是一件事。

```text title="变化频率不同的例子"
订单服务/
├── 价格计算    ← 每周改（促销规则）
├── 订单状态机  ← 半年没动
└── 发票生成    ← 每季度改（税务政策）
```

价格计算值得独立出去，因为它变化快、需要独立测试、出错影响大。

### 信号二：被不同角色修改

如果 A 团队和 B 团队改同一个文件，他们迟早会互相踩。

### 信号三：不同的一致性要求

订单数据要求强一致，商品浏览记录允许最终一致。这两者放一个模块里，要么都变慢，要么都变得不可靠。

> 三个信号只出现一个 —— 拆分带来的分布式复杂度会大于收益。

## 什么时候不该拆

### 不要为了"看起来整洁"拆

```ts title="过度拆分的例子"
// ❌ 拆了 4 个文件，但 3 个只有 5 行
format-date.ts
format-currency.ts
format-number.ts
format-phone.ts

// ✅ 一个 format.ts 就够了
export const format = {
  date: (d: Date) => /* ... */,
  currency: (n: number) => /* ... */,
  number: (n: number) => /* ... */,
  phone: (s: string) => /* ... */,
};
```

文件小不等于耦合低。拆得太碎唯一的成果是让跳转次数变多。

### 不要过早为"以后可能复用"拆

```text title="过早抽象的代价"
// 为了「以后可能有别的支付方式」，提前做了抽象
interface PaymentProvider {
  charge(amount: Money): Promise<Result>;
}

// 两年后仍然只有一个实现：StripeProvider
// 但这期间每个改支付逻辑的人都要先理解这层抽象
```

Rule of three：第三次需要的时候再抽象。前两次直接复制也没关系。

## 耦合的真正代价

耦合的代价不是"改起来麻烦"，是**让变更变得不可预测**。

```ts title="隐式耦合的例子"
// order.ts
export function createOrder(input: OrderInput) {
  // 直接读全局变量 —— 隐式依赖
  const user = currentUser!;
  const rate = exchangeRates[user.currency];
  // ...
}
```

这段代码看起来只依赖 `OrderInput`，实际上还依赖当前登录用户和全局汇率表。测试它要先搭好整个运行时环境。

改成显式依赖之后：

```ts title="显式依赖" showLineNumbers {2,4}
export function createOrder(
  input: OrderInput,
  deps: { user: User; rates: ExchangeRates }
) {
  const rate = deps.rates[deps.user.currency];
  // ...
}
```

现在这个函数的依赖是一眼可见的，测试只需要构造两个对象。

**判断一个模块的耦合程度，看它的 import 列表和函数签名就够了。** 需要初始化一大堆全局状态才能调用的代码，耦合一定高。

## 一个实用的检查方法

每隔一段时间，我会做一件事：**随机挑一个模块，尝试在不看其他模块代码的前提下，说清楚它依赖什么、被谁依赖。**

如果说不清楚，说明这个模块的边界已经模糊了。

具体可以这样查：

```bash title="统计模块被引用次数"
# 谁在 import 这个模块
grep -r "from '~/billing" src/ --include=*.ts | wc -l

# 这个模块 import 了多少别的模块
grep -o "from '~/[a-z-]*" src/billing/*.ts | sort -u | wc -l
```

被引用特别多、或者引用别人特别多的模块，都是需要重点审视的。

## 小结

模块边界没有标准答案，但有几条经验是稳定的：

1. **按业务能力切，不要按技术分层切**
2. **`index.ts` 是边界的实际载体**，用它控制可见性
3. **三个信号同时出现才拆**，不要为了整洁而拆
4. **依赖要显式**，隐式依赖是耦合的主要来源
5. **边界不要求一开始就对**，但要求能改

最后一条最重要。好的架构不是一开始设计出来的，是在能低成本修改的前提下，慢慢长出来的。
