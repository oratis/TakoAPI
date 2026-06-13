# 05 · 路线图

> 策略：**registry-first, gateway-fast-follow**（见 [00 §7](00-vision-and-positioning.md)）。
> 沿用现有约定：**每个 Phase 分子阶段，完成后停下来等用户验收，不一次性交付**。
> ⚠️ 每阶段动代码前必读 `node_modules/next/dist/docs/`；schema 变更走 `prisma migrate`。

---

## Phase 0 · 决策与对齐（当前）

- **产出**：本 `docs/agent-marketplace/` 设计轨道 + 用户对 [06-open-questions.md](06-open-questions.md) 的拍板。
- **验收**：战略形态（A/B/C）、变现模型、skills 去留、协议范围、品牌 已确认。
- 🚦 **未确认前不进入 Phase 1。**

---

## Phase 1 · Registry MVP（发现层，冷启动）

> ✅ **已完成并本地验证（2026-06-13）**。三个测试 agent 走通「提交→审核→上架→发现」全链路；首页改版落地 slogan。生产应用迁移 `003` + 升配数据库待 Phase 2 前置。

把 agent 供给做厚、发现做好——**无需先建重型网关就能有内容和流量**。

| 子阶段 | 内容 |
|---|---|
| 1A | 数据模型：`Agent` / `AgentSkillDef` / `AgentTag`（[04](04-data-model.md)）+ 迁移 |
| 1B | 入驻：提交 AgentCard URL → 抓取/解析/验证；表单手填；admin 审核（复用 `SkillStatus` 流） |
| 1C | 市集 UI：`/agents` 列表 + 过滤、`/agents/[slug]` 详情（复用 skills UX）、搜索 |
| 1D | 发现 API：升级 `/api/agent` 返回 agent 目录；暴露 registry API；从 a2aregistry/MCP 导入种子 |

- **验收**：≥ N 个**通过验证**的 agent 可被浏览/搜索/查看详情；`/api/agent` 返回 agent 目录。
- **暂不**：任何调用/计费。

---

## Phase 2 · Gateway MVP（调用层）

| 子阶段 | 内容 |
|---|---|
| 2A | 基础设施前置：**升配 Cloud SQL + PgBouncer + Upstash Redis**（[03 §9](03-technical-architecture.md)） |
| 2B | `ApiKey` 表（哈希）+ 鉴权中间件（替代 `User.apiKey`） |
| 2C | **A2A 透传代理**（单 agent，同步 + SSE）+ 超时/重试/断路器 |
| 2D | 限流（Redis）+ 用量计量（`Invocation`，log→agg） |
| 2E | **OpenAI 兼容 shim** `/v1/chat/completions` |
| 2F | 基础可观测（OTel/Langfuse）+ 日志脱敏 |

- **验收**：用一个 API key，经网关**成功调用一个已注册 agent**（含流式），且调用被**正确计量**进 `Invocation`。
- **暂不**：真实扣费。

---

## Phase 3 · Commercial 层（变现闭环）

| 子阶段 | 内容 |
|---|---|
| 3A | `CreditBalance` / `LedgerEntry` + Stripe 充值 + **充值费** |
| 3B | 调用按量扣减余额（DEBIT）；余额不足拦截 |
| 3C | Developer Console：用量 / 账单 / 调用日志 / 多 key 管理（扩 `/profile`） |

- **验收**：**充值 → 调用 → 扣费**闭环跑通，账本与余额一致。

---

## Phase 4 · 双边市集（publisher 变现）

| 子阶段 | 内容 |
|---|---|
| 4A | Publisher onboarding + 命名空间验证 + 定价/分成设置 |
| 4B | `Payout` 结算 + publisher 收入看板 |
| 4C | 评分 / 排行 / trending（激活 `Rating`/`Like`/`Bookmark`） |

- **验收**：第三方 publisher 自助上架 agent，产生调用并**获得分成结算**。

---

## Phase 5+ · 护城河与进阶（按需）

- 智能路由（price/latency/success/capability）+ **跨 agent fallback**
- **BYOK toll**
- 异步长任务（`taskId` + webhook，绕开 Cloud Run 60min）
- MCP 工具聚合
- 企业能力（postpaid、SSO、SLA）
- **观察项**：agentic payments（x402/AP2/ACP）——非依赖

---

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| 冷启动两难（无 agent 则无用户，反之亦然） | registry-first 先单边做厚供给；自己/合作伙伴种子 agent；从 A2A/MCP registry 导入 |
| 基础设施不足（db-f1-micro） | Phase 2A 前置升配 + PgBouncer，**不达标不上调用层** |
| 第三方 agent 不可信 / 注入 | [03 §11](03-technical-architecture.md) 安全控制；上游响应当作 hostile；高危 human-in-loop |
| 合规/license | 审核流卡关；展示 license；数据/日志策略公开 |
| 破坏现有 skills 业务 | 新表与 `Skill` 无外键耦合，**并存上线**；每阶段独立迁移 + commit，可回滚 |
| Next.js 16 breaking changes | 每阶段实现前读 `node_modules/next/dist/docs/`（`AGENTS.md` 硬性要求） |
