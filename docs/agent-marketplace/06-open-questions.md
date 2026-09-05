# 06 · 待决策清单

> 进入 Phase 1 实现前，需要用户拍板。每条附**推荐**与**影响**。

## ✅ 决策结果（2026-06-13）

用户答复「全部按照推荐进行」——**D1–D8 全部采纳本文推荐**（见文末决策矩阵）。Phase 0 关闭，进入 [Phase 1](05-roadmap.md)。

---

## D1 · 战略形态

我们做哪种？（详见 [00 §7](00-vision-and-positioning.md)）

- **A. Proxy Gateway**——流量过我们的网关，计量/计费/路由。
- **B. Directory + Connect**——只发现 + 标准化连接，调用直连。
- **C. Agent Hosting**——我们托管运行 agent。

**推荐**：**A 为终局，registry-first 冷启动**（先 B 的发现层，再 fast-follow A 的调用层）。
**影响**：决定整个架构与护城河；选 B 则砍掉网关/计费大部分工作，但护城河与变现都弱。

---

## D2 · 现有 skills 业务去留

5,146 条 skill + 30 分类怎么办？

- 全部转为 agent / **并存为子品类** / 弃用归档。

**推荐**：**并存**——skills 作为「coding-agent skills」子品类保留（符合 2026-04-22「不删」决策），新主线是 invokable agents。
**影响**：决定首页信息架构与导航；并存最省事且不丢现有 SEO/内容。

---

## D3 · 变现模型

- **OpenRouter 式**（推理/调用零加价 + 充值费 ~5% + BYOK toll + publisher 分成）
- 成本加价（cost × markup）
- 订阅制

**推荐**：**OpenRouter 式**（[01](01-landscape-and-standards.md) 验证过、信任友好、透明）。
**影响**：决定账本/计费设计与品牌定价叙事。

---

## D4 · 目标用户优先级

- **开发者优先**（API/SDK，self-serve）
- 消费者优先（浏览/运行 agent 的 storefront）

**推荐**：**开发者优先**——做基础设施（PayPal-under-storefronts），避开变挤的消费者赛道。
**影响**：决定首屏、文档、SDK 投入与 GTM。

---

## D5 · v1 协议范围

- 只 A2A / **A2A + OpenAI 兼容 shim** / 再加 MCP

**推荐**：**A2A（主）+ OpenAI 兼容 shim（on-ramp）**；MCP 后置。
**影响**：决定协议适配层工作量；shim 是低摩擦获客的关键。

---

## D6 · 品牌与文案

- 保留 **TakoAPI** 名（章鱼隐喻契合 one-API-many-agents）？
- Slogan「One API to access all agents」落地到首页/README/SKILL.md？
- 是否需要首页改版方案？

**推荐**：**保留 TakoAPI**，slogan 全站落地，首页以 agent 为英雄（skills 降为子品类入口）。
**影响**：决定品牌迁移与营销物料。

---

## D7 · 基础设施预算

- Cloud SQL 升配（脱离 db-f1-micro）、Upstash Redis、是否拆独立 gateway 服务。

**推荐**：Phase 2A 前置升配 + PgBouncer + Upstash；网关先用 Next.js route handlers，规模化再拆。
**影响**：决定月度成本与 Phase 2 能否启动（[03 §9](03-technical-architecture.md) 是硬约束）。

---

## D8 · 合规与信任标准

- 第三方 agent 审核门槛（自动 + 人工到什么程度）？
- 数据/日志策略（是否存 prompt/输出、保留期、脱敏默认）？
- license 与内容合规展示？

**推荐**：人工审核 + Signed Card/命名空间验证；**日志默认脱敏、opt-in 存储**；详情页展示 license 与数据策略。
**影响**：决定信任叙事与法务暴露面；[03 §11](03-technical-architecture.md) 给了控制清单。

---

## 决策矩阵（一页速览）

| # | 问题 | 推荐 |
|---|---|---|
| D1 | 战略形态 | A 终局 + registry-first |
| D2 | skills 去留 | 并存为子品类 |
| D3 | 变现 | OpenRouter 式 |
| D4 | 用户优先级 | 开发者优先 |
| D5 | v1 协议 | A2A + OpenAI shim |
| D6 | 品牌 | 保留 TakoAPI，slogan 全站 |
| D7 | 基础设施 | 升配 + PgBouncer + Redis，先不拆服务 |
| D8 | 合规信任 | 人工审核 + 验证 + 默认脱敏 |
