# TakoAPI GTM 执行手册(非代码增长）

> 策略背景见 memory `gtm-plan`。**代码/SEO 地基已全部上线**（见 §1）。
> 本文只讲**非代码的增长动作**：做什么、怎么做、节奏、指标、红线。
> 最后更新：2026-06-26。

## 0. 一句话
产品、网关、计费、SEO 表面、徽章回链都已就绪。现在唯一的瓶颈是 **权重（外链）+ 分发**，不是产品也不是页面数量。目标：**10k GitHub stars + 10k UV/天**。

---

## 1. 已就绪的「弹药」（你手上有什么）
- **自助徽章回链**：`/badge` 教程页 + 每个 `/agents/[slug]` 上的一键复制片段 + 动态 SVG `/api/badge/[slug]`（显示实时星标，比 shields.io 多了「会更新 + 打到自己域名」）。
- **Badge PR 自动化**：`scripts/notify-listed-repos.ts`（已发 30 个；带去重账本、opt-out 文案、刷星/mega-repo 过滤）。
- **~6.8k 可索引 URL × 15 语言**：agent/skill 详情、17 个场景落地页（CollectionPage/ItemList 结构化数据）、agent 详情 AggregateRating（评分星）。
- **唯一性防御已做**：非英文实体详情页 `noindex`、薄 PROJECT 页 `noindex` → 不怕规模化内容处罚；英文实体页 + 多语言列表/场景页正常收录。
- **网关 + PayPal 充值（5% 费率）已 live** → 有流量就能变现。

---

## 2. 北极星指标（每周看一次）
| 指标 | 工具 | 现状 → 目标 |
|---|---|---|
| GitHub stars | 仓库页 | 1 → 10k |
| 日 UV | 需接分析（GA4 / Plausible / Umami） | ? → 10k/天 |
| 收录页数、曝光、点击 | Google Search Console | 需接入 |
| Badge 采纳数 | GSC 引荐域，或给 `/api/badge` 加请求日志 | 0 → ↑ |
| 注册 / API key / 充值 | DB（已有 RequestLog / Invocation / LedgerEntry） | — |

> **第 0 步（必做、最优先）**：接 **Google Search Console**（验证 takoapi.com，提交 sitemap）+ 一个轻量分析。**没数据 = 盲飞。**

---

## 3. 工作流 A — 外链/权重（#1 杠杆，80% 精力在这）

### A1. Badge PR 外联（扩量，守规矩）
- 跑：`STAR_MIN=800 STAR_MAX=8000 npx tsx scripts/notify-listed-repos.ts --send --limit=15`
- 节奏：每周 1 批 10–20 个；账本自动去重，重复跑安全。
- 规矩（memory `cautious-outreach`）：先不带 `--send` 跑一遍看名单；只发中腰部 repo（800–8000★）；跳过 mega-repo（会被当 spam）；PR 文案带「不想要就关掉本 PR」；一个 repo 一个 PR。
- **自助化**：把 `/badge` 链接放进文档/社区，让 repo 主自己加徽章（不靠你逐个发 PR）。
- 指标：发出数、合并率、GSC 引荐域增长。

### A2. 上 awesome-list（高价值、低成本）
- 给这些清单开 PR，加一行 `- [TakoAPI](https://takoapi.com) — One API to access all agents（A2A 目录 + 网关）`：
  - `awesome-a2a`（A2A 协议生态清单）
  - `awesome-ai-agents` / `awesome-llm-agents`
  - `awesome-mcp`（若定位相关）
- 做法：fork → 在合适分类下按该清单格式加一行 → 开 PR。**先读每个清单的 CONTRIBUTING**（有的要字母序/特定格式，乱加会被拒）。

### A3. 自己运营一个 awesome-list（stars 飞轮 + 外链枢纽）
- 建并维护 `awesome-a2a-agents`（精选 A2A agent / 工具 / 服务端），里面挂 TakoAPI。
- 为什么：awesome-list 本身涨 stars 快，且成为长期外链来源 + 你目录的「上游」。

### A4. 目录/榜单收录
- AI 工具目录（There's An AI For That、Futurepedia 等）、AlternativeTo、相关 SaaS 目录。
- Product Hunt 见 §6。

---

## 4. 工作流 B — GitHub stars 飞轮
- **README**：首屏价值主张 + 截图/GIF + slogan「One API to access all agents」+ 徽章 + 30 秒上手。
- **多次发布，不赌一次爆款**：每个新功能/里程碑 = 一次发布机会。
- **GitHub Trending**：把一次发布（HN + Reddit + PH + Twitter）集中到**同一天**，冲日榜 → 上 Trending → 自然涨星。
- 🚫 **红线：绝不刷星**（AI repo 是假星重灾区，GitHub 会标记/封）。

---

## 5. 工作流 C — 内容/SEO 权重
- 场景页已自动 target「X AI agents」长尾；现在补**唯一、有深度的内容**：
  - 博客：`什么是 A2A`、`A2A vs MCP`、`如何用一个 API 调用多个 agent`、`OpenRouter for agents 是什么`。
  - 对比页：`TakoAPI vs <竞品>`。
  - gptwiki 交叉导流（memory `gptwiki-gtm`）。
- 关键认知：**外链没上来之前，内容页排不动**。所以 A（外链）先于 C（内容）。

---

## 6. 工作流 D — 发布/分发
- **Show HN**：标题如 `Show HN: TakoAPI – One API to access all AI agents (A2A directory + gateway)`；挑美东工作日早上发；自己第一条评论讲来历 + 技术决策。
- **Reddit**：r/LocalLLaMA、r/AI_Agents、r/LLMDevs；**先读版规**，以「我做了个东西，求反馈」口吻，别硬广。
- **Twitter/X**：A2A / agent 圈；@ 相关项目与作者。
- **A2A 社区**：协议有 150+ 组织，去其 Discord/讨论区分享。
- **Newsletter**：投 AI/dev newsletter（TLDR、Ben's Bites 类）。

---

## 7. 工作流 E — 母语校对
- 13 个机翻语种（实体详情页已 `noindex`，风险已降；但**列表/场景/营销页**仍面向真人用户）。
- 优先级按流量潜力：**zh、es、ja、de、fr** 先过，其余按需。
- 做法：每语种找母语者过 `messages/<lang>.json` 的**重点页文案**（首页、/agents、/scenarios、/badge），不必逐 key。

---

## 8. 建议节奏
- **每周**：1 批 badge PR（10–20）；1 次发布或 1 篇内容；看一次指标。
- **每月**：1 次里程碑大发布；复盘引荐域 + 收录增长；补 1–2 篇内容。
- **一次性（尽快）**：接 GSC + 分析；上 5–10 个 awesome-list/目录;建自有 awesome-list。

---

## 9. 原则 / 红线
- 绝不刷星；不 spam；**小批量、先核验**（`cautious-outreach`）；所有 outreach 带 opt-out；尊重各社区/清单版规。

## 10. 老实话（时间预期，来自 `gtm-plan`）
- **stars**：约 9–15 个月（靠发布节奏 + Trending 飞轮 + 自有 awesome-list，**不是**一次爆款）。
- **UV**：约 12–20 个月（SEO 慢热；早期靠发布/社区拉量，SEO 复利在后面）。

---

## 11. 谁做什么（你 vs 我）
- **只有你能做**：接 GSC/分析（账号）、Show HN/Reddit/PH 发布（你的身份/口碑）、社区互动、母语校对的人。
- **我能帮做（说一声）**：写/改 README、写博客与对比页（代码/Markdown）、扩 badge outreach 跑批、写 awesome-list 的 PR 文案、给 `/api/badge` 加采纳计数日志、做 GSC 要的任何技术验证（如 meta 验证标签）。
