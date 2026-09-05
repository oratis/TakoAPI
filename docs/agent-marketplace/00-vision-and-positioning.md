# 00 · 愿景与定位

> Slogan：**One API to access all agents**

---

## 1. 一句话愿景

把 TakoAPI 从「给 coding agent 安装 **skill** 的内容目录」，升级为「用**一个 API** 发现并**调用**任意 **agent** 的市集 + 网关」。

- **现在**：用户/agent 来 TakoAPI **找静态内容**（skill = markdown/配置），装进自己的 Claude Code / Cursor。
- **目标**：开发者用**一个 key**，把请求发给 TakoAPI，由我们**路由并调用**任意已注册的第三方 agent，统一鉴权、计费、可观测——并给 agent 作者分成。

## 2. 核心类比：OpenRouter for agents

| | OpenRouter | TakoAPI（目标） |
|---|---|---|
| 一句话 | One API to access all **LLMs** | One API to access all **agents** |
| 被路由的单位 | 模型推理（token） | agent 任务（task / call） |
| 发现层 | 模型目录 | agent 市集（基于 AgentCard） |
| 调用层 | 统一 `/v1/chat/completions` | 统一 gateway（A2A 透传 + OpenAI 兼容 shim） |
| 变现 | 充值费 ~5.5% + BYOK toll（推理零加价） | 同款 + 给 publisher 分成 |
| 护城河 | 跨 provider 路由/fallback | 跨厂商 agent 路由/fallback + 统一账单 + 验证身份 |

调研验证了两点（见 [01](01-landscape-and-standards.md)）：(1) 这个生态位**无人占据**；(2) OpenRouter 的「零加价 + 充值费 + BYOK toll」money model 已被整个网关品类反复验证。

## 3. 我们到底做什么——三层

```
┌─────────────────────────────────────────────────────────┐
│  3. Commercial 层  — credits / 计量 / 计费 / 给作者分成      │
├─────────────────────────────────────────────────────────┤
│  2. Gateway 层     — 一个 API key，路由调用任意 agent        │
│                      （A2A 透传 + OpenAI 兼容 shim）         │
├─────────────────────────────────────────────────────────┤
│  1. Registry 层    — agent 市集：发现 / 搜索 / 分类 /        │
│                      验证 / 评分（基于 A2A AgentCard）       │
└─────────────────────────────────────────────────────────┘
```

1. **Registry / 市集（发现）**：列出所有 agent，用标准化的 **AgentCard** 描述（name、endpoint、能力 `skills[]`、定价、鉴权方式），提供搜索 / 分类 / 评分 / trending。**——这一层最大程度复用现有 skills 市集的 UX、auth、基础设施。**
2. **Gateway（调用）**：一个 base URL + 一个 API key，把调用路由到任意已注册 agent；处理鉴权、限流、超时/重试/断路、流式、计量。
3. **Commercial（变现）**：预付 credits、用量计量、给 agent 作者分成与结算。

> 详细产品面见 [02-product-spec.md](02-product-spec.md)；技术实现见 [03-technical-architecture.md](03-technical-architecture.md)。

## 4. 目标用户（双边市场）

| 边 | 是谁 | 痛点 | 我们给什么 |
|---|---|---|---|
| **需求方**（Consumers / Developers） | 想用多个 agent 拼业务的开发者、agent 编排者、其它平台 | 要对接 N 个 agent = N 个合同、N 个 key、N 套鉴权、N 张账单 | **一个 key、一张账单、任意 agent**；BYOK；无锁定 |
| **供给方**（Publishers / Builders） | 做了 agent 想触达用户并变现的人 | 自建分发、计费、鉴权太重；没有流量入口 | **一键上架**（提交 AgentCard URL）+ 现成计费/结算 + 市集流量 |

冷启动顺序：**先把供给方（agent 供给）做厚**（registry-first），再放量需求方。详见 [05-roadmap.md](05-roadmap.md)。

## 5. 价值主张与品牌

- **核心承诺**：*"One API key, one bill, any agent."*
- **中立的瑞士**：我们不卖自家 agent、不绑自家云，没有偏向任何厂商的动机——这正是 OpenRouter 对各大模型厂的信任优势。把**厂商中立 + 无锁定 + BYOK** 写成显式的、可兑现的品牌承诺。
- **透明定价**：所有 take-rate 公开（企业市集都藏着掖着——把透明当卖点）。
- **品牌契合**：Tako（章鱼）多腕触达四方，天然呼应「一个 API、千百 agent」。Slogan 与现有品牌不冲突，可平滑过渡。

## 6. 与现有 skills 业务的关系

现有资产**不浪费**，但**主角换人**：

| 现有资产 | 处置 |
|---|---|
| Next.js 16 + Prisma + Postgres + Cloud Run + cloudbuild | ✅ 直接复用 |
| NextAuth（邮箱/Google/Apple）+ API key | ✅ 复用并扩展（API key 升级为网关 key，见 [04](04-data-model.md)） |
| 市集 UX（分类 / 搜索 / 卡片 / 详情 / likes / ratings / bookmarks / trending） | ✅ 复用给 agent 列表（现有孤立表 Rating/Bookmark 正好激活） |
| `RequestLog` 表 | ✅ 演进为 usage 计量的雏形 |
| `/api/agent` 发现端点 | ✅ 升级为 agent 目录 + registry API |
| `AgentType` 枚举 / `src/lib/agents.ts` | ⚠️ 部分复用——但注意语义差异（见下） |
| **5,146 条 skill 数据 + 30 分类** | 🟡 作为 legacy 内容品类**保留并存**（不删，符合 2026-04-22「未搞清用途不删」决策） |

> ⚠️ **关键语义澄清**：现有的 `AgentType`（CLAUDE_CODE / CURSOR…）描述的是「**消费 skill 的 coding agent**」——skill 是装进它们的静态内容。而新业务里的 **Agent** 是「**可被调用的服务实体**」（有 endpoint、有 AgentCard、能跑任务）。两者是不同的东西。所以新模型用全新的 `Agent` 实体，**不强行复用 `Skill`**（详见 [04-data-model.md](04-data-model.md)）。

**推荐定位**：skills 成为市集的一个子品类（"coding agent skills"），新主线是 invokable agents。首页与 slogan 以 agent 为英雄。

## 7. 战略形态：三个选项（需用户拍板，见 [06](06-open-questions.md)）

| 选项 | 形态 | slogan 贴合度 | 护城河 | 基础设施重量 | 变现 |
|---|---|---|---|---|---|
| **A. Proxy Gateway**（推荐终局） | 调用流量**过我们的网关**，我们计量/计费/路由 | 🟢 最贴合 | 🟢 强（统一账单+路由+身份） | 🔴 重（流式代理、限流、计量） | 🟢 强（充值费 + 分成 + BYOK toll） |
| **B. Directory + Connect**（轻） | 只做发现 + 标准化连接（A2A/MCP），调用**直连**不过我们 | 🟡 中 | 🔴 弱（容易被绕过） | 🟢 轻 | 🔴 弱（只能广告/订阅） |
| **C. Agent Hosting**（最重） | 我们**托管运行** agent | 🟢 贴合 | 🟢 强 | ⛔ 最重（运行时/隔离/扩缩容） | 🟢 强（消耗计费） |

**推荐**：以 **A 为终局**，但用 **B 作为冷启动**——即 **"registry-first, gateway-fast-follow"**：

1. 先做 **Registry**（B 的轻量发现层）把 agent 供给做厚、把搜索/验证做好；
2. 紧接着加 **Gateway**（A 的调用层）把流量与计费收拢；
3. **C（hosting）先不做**——等有明确需求再说。

这样冷启动摩擦最低（无需先建重型网关就能有内容和流量），又不放弃 A 的终局护城河。

## 8. 北极星与早期指标

- **北极星**：通过网关**成功完成的 agent 任务数 / 周**（GMV 的前导）。
- 供给侧：注册并**通过验证**的 agent 数；活跃 publisher 数。
- 需求侧：持有 API key 并**本周有调用**的开发者数；开发者周留存。
- 商业：credits 充值额；通过平台结算给 publisher 的金额；take-rate 收入。

## 9. 非目标（先不做，避免铺太大）

- 不自建/托管运行第三方 agent（选项 C）。
- 不做复杂多 metric 定价、不做企业 postpaid 发票（先 prepaid credits）。
- 不自研支付协议；agentic payments（x402 / AP2 / ACP）**仅观察**，非 v1 依赖（见 [03 §计费](03-technical-architecture.md) 与 [01](01-landscape-and-standards.md)）。
- 不做又一个「消费者浏览 agent」的 storefront——我们做**开发者基础设施**（storefront 底下的 PayPal）。
