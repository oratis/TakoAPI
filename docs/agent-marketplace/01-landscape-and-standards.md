# 01 · 格局与标准调研

> 调研时间：2026-06-13。来源均附链接。标注「⚠️ 待核实」处为二手来源或推断，落地前需复核。

---

## TL;DR（先读这段）

1. **标准已收敛**：2026 年中，agent 互操作已收敛为 **Linux Foundation 治理的两层栈**——**A2A**（agent↔agent）+ **MCP**（agent↔tool）。竞争协议（IBM-ACP、Cisco/AGNTCY-ACP）**都已并入 A2A**。
2. **A2A 是我们的标准**：`AgentCard`（`/.well-known/agent-card.json`）是事实上的「机器可读 agent 描述符」，同时承载发现（`skills[]`）与调用（endpoint + 鉴权 + task 生命周期）。
3. **市场空白真实存在**：「一个统一 API + SDK，跨厂商**发现并调用**任意 agent，一张账单」是**缺失的中间层**。企业市集是单厂商围墙，独立市集是消费者目的地，registry 只发现不计费。
4. **money model 已验证**：OpenRouter 的「推理零加价 + 充值费 ~5.5% + BYOK toll」被整个网关品类反复采用。
5. **护城河**：A2A 标准化了「卡片 + 传输」，但**没有跨域的全局发现 / 命名 / 解析层**——市集可以「**成为那个 registry**」。

---

# Part A · 开放标准

## A2A（Agent2Agent Protocol）— 我们的核心标准

- **来源与治理**：Google 2025-04 开源，2025-06 捐给 **Linux Foundation** 成立 A2A 项目；Apache-2.0。
  来源：[Linux Foundation 公告](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents)
- **当前版本 v1.0**（2026 年初首个稳定生产版）。v1.0 四大要点：
  1. **Signed Agent Cards**——对卡片做密码学签名，客户端可验证卡片确由域名所有者签发（**市集信任的关键原语**）；
  2. **多租户**——单 endpoint 托管多个 agent；
  3. **多协议绑定**——同一逻辑 agent 同时暴露 **JSON-RPC + gRPC**；
  4. **版本协商**——v0.3 → v1 向后兼容迁移。
  来源：[a2a-protocol.org v1.0 公告](https://a2a-protocol.org/latest/announcing-1.0/)、[GitHub a2aproject/A2A](https://github.com/a2aproject/A2A)（⚠️ patch 号 v1.0.1 / 2026-05-28 来自仓库页，未单独核实）
- **AgentCard 结构**：发布在 well-known URI（当前 **`/.well-known/agent-card.json`**，旧 v0.2 路径 `/.well-known/agent.json` 仍在野，网关应两者都兼容）。字段：`name`、`description`、`provider`、`url`（服务端点）、`version`、`capabilities`（`streaming`/`pushNotifications`）、安全 `schemes`（Bearer/OAuth2…）、`skills[]`（每个含 `id`/`name`/`description`/`inputModes`/`outputModes`/`examples`）。
  来源：[A2A Agent Discovery 文档](https://a2a-protocol.org/latest/topics/agent-discovery/)
- **三种发现方式**：(1) well-known URI GET；(2) **curated registries**（按 skill/tag 查询，**协议明确祝福的模式——就是我们要做的**）；(3) 直接配置。另有需鉴权的 **extended AgentCard**。
- **Task 生命周期**：`SUBMITTED → WORKING → (INPUT_REQUIRED / AUTH_REQUIRED) → COMPLETED / FAILED / CANCELED / REJECTED`。
  来源：[A2A 规范](https://a2a-protocol.org/latest/specification/)
- **传输**：JSON-RPC 2.0 over HTTPS；流式走 **SSE**；异步走 **push notification（webhook）**；v1.0 增 gRPC。
- **采用度（强）**：2026-04 一周年报告 **150+ 组织**（AWS、Cisco、Google、IBM、Microsoft、Salesforce、SAP、ServiceNow…），GitHub 22k+ star，5 种语言 SDK；已集成进 Azure AI Foundry、Amazon Bedrock AgentCore、Google Cloud。
  来源：[Linux Foundation 一周年报告](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year)

**→ 对我们**：把每个 agent 的 `/.well-known/agent-card.json` 抓进来，索引 `skills[]` 做发现/搜索，校验 signed card 做信任；调用时读 `url` + `schemes` + `capabilities`，代理一个 JSON-RPC `message/send`（或 SSE 流），按 TaskState 跟踪。**我们本质上是「一堆 A2A server 前面的 A2A client + curated registry」。**

## MCP（Model Context Protocol）— 工具层，不是 agent

- **关键区分**：MCP 标准化的是「agent ↔ **工具/资源**」，**不是** agent ↔ agent。MCP server 是**能力/工具**，不是自主 agent。协议维护者自己也把 MCP 与 A2A 定位为**配合使用的不同层**。
  来源：[A2A v1.0 公告（明确对比两层）](https://a2a-protocol.org/latest/announcing-1.0/)
- **治理**：2025-12 Anthropic 把 MCP 捐给新成立的 **Agentic AI Foundation（AAIF，Linux Foundation 旗下）**，由 **Anthropic、Block、OpenAI** 共同发起，白金成员含 AWS、Bloomberg、Cloudflare、Google、Microsoft。
  来源：[MCP 博客](https://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/)、[Linux Foundation AAIF 公告](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- **官方 MCP Registry**（`registry.modelcontextprotocol.io`）：公共 MCP server 的官方元数据库，**仍处 preview**（非 GA，可能 reset）。`server.json`（reverse-DNS 唯一名、包位置/远程 URL、能力），命名空间用 **DNS/GitHub 验证**，暴露 REST + OpenAPI，供**下游聚合市集**消费（Smithery、PulseMCP…）。
  来源：[MCP Registry About](https://modelcontextprotocol.io/registry/about)、[GitHub modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry)（⚠️ ~9.6k server 数来自三方追踪器）

**→ 对我们**：MCP **互补不竞争**。(1) 概念边界要清：**agent（A2A）≠ 工具（MCP）**；我们路由的是 *task* 给 A2A agent，可另外*列出* MCP 工具。(2) MCP Registry 的「**上游不带观点 + 下游市集做增强（评分/策展/安全）**」架构值得照抄到我们的 agent catalog。

## 其它互操作努力（了解即可）

| 协议 | 现状 | 与我们的关系 |
|---|---|---|
| **IBM/BeeAI ACP** | **已并入 A2A**（2025-09），BeeAI 留作参考实现 | 收敛信号——别投资独立 ACP。来源：[agentcommunicationprotocol.dev](https://agentcommunicationprotocol.dev/introduction/welcome) |
| **Cisco/AGNTCY Agent Connect Protocol** | `acp-spec` 仓库 **2026-04-11 归档**（只读） | 同上收敛信号（⚠️ 「并入 A2A」为推断）。来源：[agntcy/acp-spec](https://github.com/agntcy/acp-spec) |
| **AG-UI（CopilotKit）** | agent ↔ **前端 UI** 的事件流标准；AWS/Oracle/MS 已集成 | **正交**——若我们做人机流式 UI 可选采纳。来源：[AG-UI 文档](https://docs.ag-ui.com/introduction) |
| **OpenAI-compatible `/v1/chat/completions`** | **模型推理**的事实标准 lingua franca，80%+ 新 provider 支持 | **低摩擦入口**：提供 OpenAI 兼容 shim，开发者改一行 base URL 即可接入。注意 OpenAI 正推 **Responses API**，别锁死老接口。来源：[TokenMix 指南](https://tokenmix.ai/blog/openai-compatible-api) |
| **agents.json（Wildcard）** | v0.1.0，基于 OpenAPI 描述 API 工作流；小众早期 | **不是** agent 路由标准，别当标准用。来源：[wild-card-ai/agents-json](https://github.com/wild-card-ai/agents-json) |

## 标准层对我们的 6 条启示

1. **以 A2A AgentCard 为唯一标准的 agent 描述符**——生态已收敛，捡现成的发现+调用+生命周期。
2. **做 A2A client + curated registry，不发明新协议**——差异化在策展/搜索/信任，不在 wire format。
3. **用 Signed Cards + 命名空间验证做市集信任**——回答「如何安全列出任意第三方 agent」。
4. **把 MCP 当工具层列出，别和 agent 混为一谈**——可选消费 MCP Registry（仍 preview）。
5. **提供 OpenAI 兼容 shim 作为低摩擦 on-ramp**——同时为 OpenAI 转向 Responses API 留余地。
6. **填补命名/解析空白 = 护城河**——A2A 不解决跨域全局发现，市集「成为 registry」正是解这个题。
  来源：[Solo.io: A2A 的发现/命名/解析缺失](https://www.solo.io/blog/agent-discovery-naming-and-resolution---the-missing-pieces-to-a2a)

---

# Part B · 竞争格局

## 对比总表

| 玩家 | 类别 | 定位 | 变现 | 来源 |
|---|---|---|---|---|
| **OpenRouter** | LLM 网关（模板） | One API for any model | **推理零加价**；充值 **5.5%+$0.80**（卡）/5%（加密）；BYOK 前 100 万次/月免费后 **5%** | [datastudios.org](https://www.datastudios.org/post/openrouter-pricing-byok-routing-costs-and-cost-optimization-strategies-how-openrouter-actually-c)、[OpenRouter FAQ](https://openrouter.ai/docs/faq) |
| LiteLLM | LLM 网关（OSS） | 100+ LLM 统一代理 | OSS 免费 + 企业版 ~$250/mo | [GitHub](https://github.com/BerriAI/litellm/) |
| Portkey | LLM 网关 | 企业网关 + guardrails | 按日志/可观测分层收费 | [TrueFoundry](https://www.truefoundry.com/blog/portkey-pricing-guide) |
| Cloudflare AI Gateway | LLM 网关 | 边缘观测/缓存/路由 | 核心免费；统一计费 **5% 充值费**；token 零加价 | [Cloudflare 文档](https://developers.cloudflare.com/ai-gateway/reference/pricing/) |
| Vercel AI Gateway | LLM 网关 | 一个端点，零加价 | token 零加价；靠 add-on 附加费 | [Vercel 文档](https://vercel.com/docs/ai-gateway/pricing) |
| Helicone | 网关 + 可观测 | 一个 key 到 100+ 模型 | 零加价；可观测订阅（$79/$799） | [Helicone 文档](https://docs.helicone.ai/gateway/overview) |
| **Salesforce AgentExchange** | 企业市集 | Agentforce 的可信市集 | 无 agent 专属 take-rate（⚠️ 套用 AppExchange ~15%） | [Salesforce PR](https://www.salesforce.com/news/press-releases/2025/03/04/agentexchange-announcement/) |
| **Google Agentspace → Gemini Enterprise** | 企业市集 | Agent Gallery 发现面 | 经 Google Cloud Marketplace，免费/订阅 | [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/partner-built-agents-available-in-gemini-enterprise) |
| **AWS Bedrock AgentCore** | agent 基础设施 + 市集 | 托管运行时/记忆/网关/注册表 | 消耗计费 + AWS Marketplace 卖 agent（2025-10） | [AWS What's New](https://aws.amazon.com/about-aws/whats-new/2025/10/aws-marketplace-pricing-ai-agents-tools) |
| **Microsoft Copilot Agent Store** | 企业市集 | Copilot「超级 app」内市集 | **~70% 分给开发者**；transactable SaaS / BYOL | [MS Learn](https://learn.microsoft.com/en-us/microsoft-agent-365/developer/submit-agent-partner-center) |
| **OpenAI Apps in ChatGPT / App Directory** | 消费者 agent/app 市集 | ChatGPT 内 Apps SDK + 目录 | 开发者自定价 + **Agentic Commerce Protocol** 结账 | [OpenAI Apps SDK](https://developers.openai.com/apps-sdk/build/monetization) |
| Sierra | 企业 agent 平台（单厂商） | 结果导向 CX agent | **按结果计费**（~$2–5/解决） | [Sierra blog](https://sierra.ai/blog/outcome-based-pricing-for-ai-agents) |
| **agent.ai** | 独立 agent 市集 | 「agent 的集市」+ 职业网络 | **目前免费、无变现**（~23 万用户） | [Boston Globe](https://www.bostonglobe.com/2025/01/31/business/hubspot-dharmesh-shah-ai-artificial-intelligence-agents/) |
| **MuleRun** | 独立 agent 市集 | 「AI agent 数字劳力市集」 | **创作者拿 ~100%** | [AiThority](https://aithority.com/machine-learning/mulerun-launches-creator-studio-the-worlds-first-platform-built-for-ai-agent-monetization/) |
| **Replit Agent Market** | 独立 agent 市集 | 最像 agent app store | 直接售卖 / 订阅 / 消耗 | [DigitalApplied](https://www.digitalapplied.com/blog/ai-agent-marketplaces-2026-discovery-distribution) |
| a2aregistry.org / MCP registries | 开放注册表 | 列出活的 A2A/MCP 端点 | 非商业 / 社区 | [a2aregistry.org](https://a2aregistry.org/) |

## 三类玩家的共性（关键洞察）

1. **LLM 网关（直接类比）**：几乎全部「**零/近零加价**」，靠**别的面**变现——充值费（OpenRouter 5.5% / Cloudflare 5% / Requesty 5% markup）、add-on（Vercel）、可观测订阅（Helicone/Portkey）。**网关层在 LLM 领域已商品化、卷向免费。** → 启示：agent 领域定价**远未标准化**，被路由的「单位」是 agent 而非 token，差异化空间更大。

2. **企业 / 平台市集**：Salesforce / Google / AWS / Microsoft / ServiceNow 每家都在建**funnel 进自家栈**的市集——**单厂商、垂直整合、企业 gated、无跨厂商调用**。买家**无法用一个 API、一张账单**同时调用 Salesforce 的 agent、Google 的 agent 和某创业公司的 agent。

3. **独立 / 开放**：agent.ai（免费无变现）、MuleRun（创作者友好）、Replit（最像 app store）、A2A/MCP registry（只发现无计费）。共性：**面向消费者「运行 agent」的目的地（UI 优先），不是开发者基础设施（「用一个 API/SDK 以编程方式调用任意 agent，一张账单」）。**

## 市场空白 = 我们的楔子（8 条战略要点）

1. **OpenRouter 类比真的没人占**：企业市集是单厂商围墙，独立市集是消费者目的地，registry 只发现不计费——「**一个统一 API + SDK，跨厂商发现并调用任意 agent，一张账单**」是缺失的中间层。**主打开发者 API，而非可浏览的 storefront。**
2. **几乎照抄 OpenRouter 的钱模型**：零加价 + 充值费(~5%) + BYOK toll。对 agent 更稳——作者各自定价，我们**不必给 agent 加价**，只在结算抽一层薄费。**公开 take-rate**（别人都藏，透明即差异化）。
3. **跨厂商路由 / fallback 是技术护城河**：agent 没有「同模型多 provider」的等价物——把 *task* 路由到最适合的 agent（价格/延迟/成功率/能力），失败 fallback，**按成功计费**。Sierra 的「按结果计费」说明市场已在用 outcome 思考。
4. **站在 A2A + MCP 上，别造运行时**：做「**开放协议之上的商业层**」——统一 key、计量、账单、限流、可观测。低自研、无锁定、搭顺风车。
5. **统一账单是最尖锐的痛点**：今天对接多 agent = N 合同/N 账单/N 鉴权。**「一个 key、一张账单、任意 agent」可被直接演示**——这正是 OpenRouter 赢过裸 provider key 的原因。营销主打**整合**，而非**目录大小**。
6. **先赢开发者，别打企业采购的仗**：企业市集都 gated 在 partner program + 销售流程后面。精益打法靠 **self-serve + credits + BYOK + docs-first** 自底向上（OpenRouter/Helicone 的剧本）。
7. **做中立瑞士**：结构性优势是**不卖一方 agent、不绑一朵云**——和 OpenRouter 对各模型厂的中立信任位一样。把**中立 + 可移植 + BYOK** 当成承重的品牌承诺。
8. **刻意选开发者基础设施 beachhead**：消费者 storefront 赛道（MuleRun/Replit/agent.ai）正在变挤。去做**每个市集、每个 agent builder 调用其它 agent 时都要打的那个 API/SDK**——像 Stripe 坐在所有 storefront 底下。面更小、嵌入后更难替换，也最贴 slogan。

## ⚠️ 下注前要复核的点

- Salesforce / Google / AWS / ServiceNow 的 **agent 专属分成比例**均**未公开**，本文用各自现有市集框架代理，已标注。
- OpenRouter 费率（5.5%/$0.80、BYOK 100 万免费后 5%）来自其 JS 渲染页，已用二手来源三方交叉确认；落地前再核当前数字。
- GPT Store 创作者收入「$100–500/月封顶」来自二手 2026 指南，方向性参考。
