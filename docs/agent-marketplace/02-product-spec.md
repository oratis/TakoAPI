# 02 · 产品方案

> 三层产品面：**Registry**（发现）/ **Gateway**（调用）/ **Console**（控制台与变现）。
> 实现的技术细节见 [03-technical-architecture.md](03-technical-architecture.md)；数据落地见 [04-data-model.md](04-data-model.md)。

---

## A. Agent Registry & 市集（发现层）

### A.1 Agent 实体

每个 agent 由一张 **AgentCard** 派生（A2A 标准，见 [01](01-landscape-and-standards.md)）：

- 身份：`name`、`slug`、`description`、`publisher`、`homepage`、`logo`
- 端点：`endpointUrl`、支持协议（`A2A` / `OPENAI_COMPAT` / `MCP`）、`capabilities`（streaming / push）、安全 `schemes`
- 能力：`skills[]`（每个含 id/name/description/inputModes/outputModes/examples）—— **这是搜索与能力匹配的核心**
- 商业：定价模型（per-call / per-task / per-token / free）、单价、是否支持 BYOK
- 策展：category、tags、featured、status（审核状态）、评分/likes/调用量

### A.2 入驻方式（让供给侧零摩擦——冷启动关键）

1. **提交 AgentCard URL**（首选）：填一个 `/.well-known/agent-card.json` 地址，我们抓取 + 解析 + 验证，自动建档。
2. **表单手填**：没有标准卡片的 agent，手动录入端点与能力。
3. **从注册表导入**：批量从 A2A registry（如 a2aregistry.org）/ MCP Registry 拉取做种子。

### A.3 验证与信任（回答「如何安全列出第三方 agent」）

- **Signed AgentCard 校验**（A2A v1.0）：验证卡片确由域名所有者签发。
- **命名空间所有权验证**：DNS TXT / GitHub 挑战（照抄 MCP Registry 模式）。
- **人工审核流**：**直接复用现有 `SkillStatus`（PENDING / APPROVED / REJECTED）+ admin 后台 + `reviewNote`**——已经建好的轮子。
- **健康检查**：定期 ping 端点 + 拉卡片，标记失活/过时 agent（复用 `ghCheckedAt/ghStatus` 的模式）。

### A.4 浏览 UX（最大化复用现有 skills 市集）

| 现有组件/页面 | 复用为 |
|---|---|
| `/skills` 列表 + filter sidebar | `/agents` agent 列表（分类 / 能力 / 协议 / 定价 过滤） |
| `SkillCard` | `AgentCard`（展示 publisher、能力标签、定价、评分） |
| `/skills/[slug]` 详情 | `/agents/[slug]`：AgentCard 全貌 + skills 列表 + 定价 + **调用示例（curl / SDK）** + 状态/SLA |
| `HomeSearch` / `/api/skills/search` | agent 搜索（按 name/description/skills） |
| `/trending`、likes、ratings、bookmarks | agent 的 trending / 收藏 / 评分（**现有孤立表 `Rating`/`Bookmark` 正好激活**） |

### A.5 Agent-readable 发现（吃自己的狗粮）

- 升级现有 `/api/agent`：从「返回 skill 目录」改为「返回 **agent 目录**」（md / json），供其它 agent 自助发现我们市集里的 agent。
- 暴露 **A2A 风格的 registry API**：让 TakoAPI 自身成为一个可被查询的 curated registry（填补 [01](01-landscape-and-standards.md) 指出的「全局发现/解析」空白）。

---

## B. Unified Gateway API（调用层）

> **核心卖点**：一个 base URL + 一个 API key，调用任意已注册 agent。

### B.1 三个协议面

| 面 | 形态 | 用途 |
|---|---|---|
| **A2A 透传**（主） | `POST {gw}/v1/agents/{slug}/message` → 我们按 AgentCard 路由到上游 A2A agent（JSON-RPC `message/send`，SSE 流，task 轮询/webhook） | 调用「真正的 agent」 |
| **OpenAI 兼容 shim**（on-ramp） | `POST {gw}/v1/chat/completions`，`model` = agent slug | 让现有 OpenAI SDK 改一行 base URL 即可接入，**最低摩擦获客** |
| **MCP**（可选/后置） | 暴露/聚合 MCP 工具 | 给 agent 提供工具，非 v1 重点 |

### B.2 路由与弹性

- 同步调用 + **SSE 流式**；超时（~p95）、有界重试 + backoff+jitter（仅幂等）、**断路器**（剔除失活上游）。
- **跨 agent fallback**：上游报错/超时时切到备选 agent（护城河功能，进阶）。
- **智能路由**（进阶）：按价格 / 延迟 / 成功率 / 能力选 agent。
- **异步长任务**：超过 Cloud Run 60 分钟硬顶的任务，返回 `taskId` + 轮询/webhook（见 [03](03-technical-architecture.md)）。

### B.3 鉴权

- API key（**存哈希 + 前缀**，创建时只显示一次），per-key scope / quota / 速率。
- 替代现有 `User.apiKey` 单字段（升级为独立 `ApiKey` 表，见 [04](04-data-model.md)）。

---

## C. Developer Console & Publisher 体验（控制台层）

### C.1 Developer（需求侧）

注册 → 拿 API key → 充值 credits → 调用 → 看**用量 / 账单 / 调用日志** → 管理多个 key。
复用现有 `/profile` 扩展。

### C.2 Publisher（供给侧）

提交 agent → 验证 → 设定**定价 / 分成** → 看**调用量 / 收入** → **结算（payout）**。
复用现有 `/profile`「My Submissions」+ admin 审核界面。

### C.3 Admin

复用现有 `/admin/*`（skills/users/logs/stats）扩展为 agent 审核、publisher 管理、用量与收入看板。

---

## D. Billing & Credits（商业层）

> 详见 [03 §计费与计量](03-technical-architecture.md)。产品侧规则：

- **预付 credits**（PayPal 充值），调用按量扣减。
- **充值费 ~5%**（OpenRouter 式，主要收入线）。
- 计量单位：**per-call / per-task**（不透明第三方 agent）或 **per-token**（模型类 agent）。
- **BYOK toll**：用户带自己的上游 key 时收薄费（进阶）。
- **给 publisher 分成**：起谈 **~80/20（偏向创作者）**（对标 Perplexity Comet Plus / Microsoft 70%，⚠️ 无 agent 专属基准）。
- **透明定价**：take-rate 公开。

---

## E. SDK 与自有 skill

- 轻量 **TS / Python SDK**：3 行接入 gateway（`new Tako({apiKey}).agents.call(slug, input)`）。
- 把现有 `takoapi_skill/`（Claude Code skill）从「搜索安装 skill」**改造为「发现并调用 agent」**——吃自己的狗粮，也是一个分发渠道。

---

## F. 产品边界（先不做）

- ❌ 托管运行第三方 agent（[00](00-vision-and-positioning.md) 选项 C）。
- ❌ 复杂多 metric 定价、企业 postpaid 发票（先 prepaid credits）。
- ❌ 自研支付协议；agentic payments（x402 / AP2 / ACP）**仅观察**，非 v1 依赖。
- ❌ 又一个「消费者浏览 agent」的 storefront——主线是开发者基础设施。
