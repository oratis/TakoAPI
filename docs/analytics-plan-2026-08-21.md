# TakoAPI 打点建设方案（2026-08-21）

> ## ⚠️ 核实状态（2026-08-21，写在最前面）
>
> **本文初稿是在一个落后 `origin/main` 18 个 commit 的工作树上写的。**
> 已针对 `origin/main` = **`b868319c`**（2026-08-08，"chore(deploy): make cloudbuild safe
> + add ignore files (#51)"）逐条复核，并连生产（Cloud Run / Cloud SQL / Cloud Scheduler /
> Cloud Logging，只读）实测。复核结果：
>
> - **一条地基被推翻**：§0.1 原有的「`cloudbuild.yaml` 已与线上漂移、照它跑会把生产密钥
>   覆盖成占位串」**是错的**，已就地更正（见 §0.1 与 §2.3 第 2 条）。它之所以出现，正是因为
>   初稿读的是陈旧 checkout —— 那句话描述的是本地文件，不是 `origin/main` 上的文件。
> - **一条口径被收窄**：§0.1 / §1 的「402/429/401 **无任何记录**」不准确。平台请求日志
>   （timestamp / status / URL，`_Default` bucket 保留 30 天）是有的，缺的是**归因**。
>   `gateway_call_rejected` 仍然该做，但价值主张是「从不可归因到可归因」。
> - **两条待确认项已结**：`_Default` 保留期 = 30 天；Cloud Run `cpu-throttling` 注解为空
>   （即默认节流态）、无 `minScale`、`maxScale=20`、`containerConcurrency=80`。见 §0.4。
> - §1043 / §1118 关于「PostgreSQL 的 `DELETE` 没有 `LIMIT`」和「别用 `prisma/sql` TypedSQL」
>   两条**经核实成立**，且仓里现有代码没有踩这两个坑——它们是**给实现者的约束**，不是待修的 bug。
>
> **本文所描述的现状，有一部分已被同一个 PR 改掉了**（见 §0.6）。读正文时以 §0.6 为准。
>
> **方法论来源**：一份内部的可移植打点手册（10 节，下称"蓝图"，从另一个产品的生产事故提炼；
> 出处不在本仓，正文中以 `<redacted>` 指代，需要原文请找维护者）。本文不是那本手册的改名版——
> **蓝图的参照项目是 web+mobile 的 C 端产品，TakoAPI 是开发者 API 产品**，蓝图里有相当一部分
> 条目在这里根本不成立。适用的部分照抄并落到本仓具体文件；不适用的部分在**附录 A** 逐条列出
> 理由与替代做法。
>
> 所有路径均为**仓库相对路径**（`src/…`、`prisma/…`）。行号会漂移，按符号名搜索为准。
>
> 赶时间的读法：**§0.3（先补洞，再加事件）→ §1（问题→指标→事件映射）→ §2.4（Cloud Run 的 CPU
> 节流，决定 sink 怎么写）→ §4（chokepoint）→ §7（口径陷阱）→ §10（Phase 0 checklist）**。
> 附录 A 是本文与蓝图差异最大的部分，建议通读。

---

## 摘要

**一句话**：TakoAPI 的打点是**服务端权威、单一 chokepoint、双 sink（Cloud Logging 结构化日志
为"仓"+ Postgres 精简热表为"join 面"）**的体系，锚点是 `api_key_id` 而不是浏览器会话，
北极星（每周成功完成的 agent 任务数）的唯一权威落点是 `src/lib/billing.ts` 的 `meterInvocation()`
及其新增的 `gateway_call_rejected` 补集。

**与蓝图的最大差异（四条）**：

1. **仓不是 BigQuery，是 Cloud Logging**。理由是成本红线：生产是 512Mi 单实例 + db-f1-micro，
   几乎零收入；而 `cloudbuild.yaml` 已配 `logging: CLOUD_LOGGING_ONLY`，Cloud Run 的 stdout
   本来就免费进 Cloud Logging（_Default bucket 每项目 50 GiB/月免费）。Phase 1 用
   `console.log(JSON.stringify(...))` 当仓，Phase 2 再挂 log sink → BigQuery。这让"仓 sink"
   的成本、依赖、失败模式全部归零——`console.log` 没有"不可用"状态。
2. **Phase 0 完全没有客户端打点**。蓝图 §3 整节（batch envelope / 时钟 clamp / 防伪造
   allowlist / properties 上限）是为客户端事件入口设计的；TakoAPI 的钱和北极星 100% 在服务端，
   浏览器只承担 SEO 与 dashboard。客户端入口推到 Phase 2，且**必须与 consent gate 同期落地**
   （GA4 已在 15 个 locale 跑着却没有任何 consent banner，这是既存债务，不能靠加埋点放大它）。
3. **采样的结论与蓝图相反**。蓝图 §7.6 的实测结论是"多数体量下答案是不采"；TakoAPI 必须采样，
   因为 `/api/registry` 默认 `limit=1000` 一次吐全目录、`/api/badge/[slug]` 每次渲染写一行
   `RequestLog`、MCP 三个读工具全匿名——这三类天生高频、单条价值极低，而热表是 0.6 GB 的
   db-f1-micro。**采样率必须作为事件属性入库**（`sample_rate`），否则还原时无从加权。
4. **蓝图 §1.1 的"buffer + 定时 flush + SIGTERM drain"范式在这里会静默失效**。它默认进程常驻；
   Cloud Run 默认"CPU 仅在处理请求期间分配"，**响应发出后未 settle 的 promise 和不 tick 的定时器
   一样不可靠**。所以本方案的日志 sink 是**请求路径内写出（响应返回之前）**的，DB sink 的 flush 由**流量驱动**，
   并新增一条"日志 ↔ `Invocation` 丢失率"对账（§2.4、§8.3 ④）。这条同时暴露了一个
   **已经存在的资金风险**：今天 `void meterInvocation(...)` 里的 DEBIT 扣款也在这条约束之下。

---

## §0 前提与假设

### 0.1 调研已确认的事实（本方案的地基）

| 事实 | 依据 |
|---|---|
| 北极星 = 每周经网关**成功完成**的 agent 任务数 | `docs/agent-marketplace/00-vision-and-positioning.md:99` |
| 生产 DB = Cloud SQL PG15 / **db-f1-micro（1 shared CPU、0.6 GB）**、无连接池、无 Redis | `docs/00-infrastructure.md` |
| Cloud Run 512Mi、`--allow-unauthenticated`、`logging: CLOUD_LOGGING_ONLY` | `cloudbuild.yaml` |
| Secret Manager **已就绪**（不是待办）：API 已启用、6 个 secret 已建、Cloud Run SA 已授权、revision `takoapi-00043-wcq` 起 env 全走 `secretKeyRef`。只剩「步骤 5 密钥轮换」未勾 | `docs/03-secret-hardening.md`「状态追踪」步骤 1–4 全部 `[x]`（2026-04-22） |
| ~~**`cloudbuild.yaml` 已与线上漂移**：`--set-env-vars` 里是占位串，照它跑一次 = 把生产密钥覆盖成占位值~~ **← 这一条是错的，已推翻，见下方注** | ~~`cloudbuild.yaml`~~ |
| 仓库 MIT 公开；`public/install.sh`、`takoapi_skill/SKILL.md`、`packages/takoapi-install` 是公开分发物 | `LICENSE`、这些文件本身 |
| GA4 `G-PPXV98MJ4Y` 硬编码在 `src/components/Analytics.tsx`，**全仓无一处 `gtag()` 自定义事件**，无 consent banner | 该文件 + grep |
| 网关三条路由与 `/mcp` **完全没有 `RequestLog` 包裹** | `src/app/v1/**`、`src/app/mcp/route.ts` |
| `meterInvocation()` 在 `prisma.$transaction` 里同时写 Invocation + `Agent.callsCount++` + DEBIT ledger + 扣余额，`catch {}` 吞异常 | `src/lib/billing.ts` |
| `Invocation` 表**没有** `source` / `client` / `userAgent` 列；`taskState` 有列但三条网关路由都不传 | `prisma/schema.prisma:553-573` + `src/app/v1/**` |
| MCP `invoke_agent` 内部 `fetch(${TAKOAPI_ORIGIN}/v1/agents/{slug}/message)`，**不带任何来源标识** | `src/lib/mcp/tools.ts` |
| MCP 是无状态的；`initialize` 收到的 `params.clientInfo`（name/version）**被代码直接丢弃** | `src/app/mcp/route.ts` 的 `case "initialize"` |
| `ApiKey` 只存 SHA-256 + 6 位 prefix；`scopes[]` / `rateLimit` / `monthlyQuota` 有列**无强制执行** | `src/lib/apikey.ts`、`prisma/schema.prisma:534-551` |
| 限流写死 60s/120 次，key 为 `gw:<keyId>:<ip>`，**不读 `ApiKey.rateLimit`** | `src/app/v1/**` + `src/lib/ratelimit.ts` |
| `RequestLog.ip` 是**明文全量保留**，无 TTL / 无归档 / 无采样 | `src/lib/requestLog.ts` + `prisma/schema.prisma:186-201` |
| 本仓**无测试框架**（`package.json` 无 test script、无 vitest/jest），**无 CI 构建/部署 workflow**（`.github/workflows/` 只有 `i18n.yml`） | `package.json`、`.github/workflows/` |
| `prisma/migrations/` **存在**（11 个目录，含 `0_init` baseline） | `ls prisma/migrations/`——注意 `docs/00-infrastructure.md` 里"无 migrations 目录"的说法已过时 |

> **注：被划掉的 `cloudbuild.yaml` 那一行为什么是错的（两层都错）**
>
> 1. **它早就修好了。**`origin/main` 的 `cloudbuild.yaml` 在 commit `b868319c`
>    （2026-08-08，PR #51）已经重写：用 `--update-env-vars` 传公开值（真值，非占位），
>    并用 `--update-secrets` 绑定 `DATABASE_URL` / `NEXTAUTH_SECRET` / `GOOGLE_CLIENT_SECRET` /
>    `APPLE_CLIENT_SECRET` / `RESEND_API_KEY` / `CRON_SECRET`。文件头注释自己写明用
>    `--update-*` 而非 `--set-*`，以保留未列出的既有绑定。占位串只存在于**初稿所读的那个
>    陈旧本地工作树**里。
> 2. **即使拿旧文件去跑，破坏机制也不是"覆盖成占位串"。**`--set-env-vars` 里有 4 个名字与
>    线上的 `secretKeyRef` 撞名。gcloud 的 `_PruneMapping` 只清 literal 类型的 env
>    （`filter_func` 要求 `valueFrom is None`），随后 `literals.update()` 命中同名的
>    非 literal 条目会 `raise KeyError`，被上层转成
>    `ConfigurationError: Cannot update environment variable [DATABASE_URL] to string
>    literal because it has already been set with a different type.`
>    这是**客户端校验，发生在调用 API 之前**——deploy step 会红着失败，一个字节都写不到生产。
> 3. **而且它从来没在真实流水线里跑过。**`gcloud builds triggers list` 返回空（无触发器）；
>    最近一次成功构建只有一个 docker build step、无 deploy step、source 是 `storageSource`
>    （人工 `gcloud builds submit`）。它的风险形状是「死配置」，不是「定时炸弹」。
>
> **对本方案的影响**：§2.3 第 2 条原来的整段警告作废（已就地重写）；遥测 env 的落地动作
> **不需要**先"修 `cloudbuild.yaml` 的漂移"这一前置步骤。但「改 `cloudbuild.yaml` 不等于
> 改了生产」这个**结论仍然成立**，原因换成了更简单的一个：**没有任何触发器在跑它**，
> 部署是人工 `gcloud run deploy`。

### 0.2 调研之外、本次实测新增的事实（每条都直接改变方案）

1. **`/skills/[slug]` 是 client component，`/agents/[slug]` 是 server component。**
   `src/app/[locale]/skills/[slug]/page.tsx` 第一行是 `"use client"`，数据靠浏览器
   `fetch('/api/skills/${slug}')` 拿——所以 skill 浏览**会经过 API 层**，`viewsCount++` 就发生在
   `src/app/api/skills/[id]/route.ts` 的 `prisma.skill.update({ data: { viewsCount: { increment: 1 } } })`。
   **注意：这条路由并没有被 `withRequestLog` 包住**——`api/skills/[id]/route.ts` 的 import 里
   根本没有 `requestLog`（要看当前覆盖面跑
   `grep -rl 'withRequestLog\|logRequest' src/app/api`，**别把数量写进正文**，§3.5 的规则对本文
   自己生效；本次审校就是在这里抓到一个已经错了的数字）。所以 skill 详情浏览今天**只有一个
   counter，没有任何带时间戳的行**，无法按天/按 locale/按人机切分。
   而 `src/app/[locale]/agents/[slug]/page.tsx` 直接 `prisma.agent.findFirst()`（含
   `generateMetadata`，且 `export const dynamic = "force-dynamic"` 所以每次请求都真的执行），
   **不经过任何 API 路由**。
   **后果：agent 详情页的浏览量目前 100% 不可见**——`RequestLog` 只包部分 `/api/*`，`src/proxy.ts`
   的 matcher 虽然覆盖页面路由但不写任何日志。业务问题 Q4（"哪些 agent 只有目录页浏览、零调用"）
   现在**完全无法回答**。两个事件因此落点不同：`skill_detail_viewed` 发在 API 路由，
   `agent_detail_viewed` 必须发在 server component 的 page 函数里（**不是 `generateMetadata` 里**
   ——它与 page 函数各跑一次，发在那里会把每次浏览记成两条）。

2. **`RequestLog.path` 的基数语义在 badge 路由上是破的。**
   所有 `withRequestLog(req, "/api/agents/[slug]", …)` 传的都是**模板**（低基数），
   唯独 `src/app/api/badge/[slug]/route.ts:73` 传的是插值后的
   `` `/api/badge/${slug}` ``（高基数，每个被徽章化的 repo 一个值）。这是**刻意的**——徽章采纳
   数就是这么数出来的——但它意味着：`GROUP BY path` 混了两种语义；`@@index([path, createdAt])`
   会随徽章采纳线性膨胀。方案里必须把徽章从 `RequestLog` 迁到独立事件（见 §6.4）。

3. **402 / 429 / 401 的调用根本不产生 `Invocation` 行。**
   `checkCreditPreflight` 与 `checkRateLimit` 都在 `meterInvocation()` **之前** return
   （`src/app/v1/agents/[slug]/message/route.ts` 的 credit gate 分支、`rateLimitResponse`）。
   所以"从 Invocation 表算网关错误率"必然错——分母里根本没有被我们自己挡掉的那部分。
   这是 Q1 的核心陷阱，也是 `gateway_call_rejected` 事件存在的唯一理由。

4. **SSE 流式路由在拿到 upstream response header 的那一刻就计量并计费。**
   `src/app/v1/agents/[slug]/stream/route.ts` 在 `fetch` 返回后立刻
   `meterInvocation({ status: upstream.status, … })`，然后才把流 pass through。流中途上游报错、
   客户端断开、120s 超时——**一律不被记录，且已经收过钱**。所以 stream 的成功率天然高估，
   且与 `message` 路由的成功率**不可比、不可相加**（蓝图 §6.2「同名不同物」在本项目的对应物）。
   **最刺眼的一个子情形**：紧跟计量之后的 `if (!upstream.body)` 分支返回 502，
   但那次调用**已经按 `upstream.status`（可能是 200）计量并计费了**——`Invocation` 里躺着一条
   "成功且已收费"的行，用户拿到的是 502。这不是假想边界，是代码里现成的一条路径
   （`stream/route.ts` 的 `!upstream.body` 分支），事件 3 的 `reason` 枚举必须能表达它。

5. **Cloud Run 的 CPU 在响应 flush 之后就被节流——`void doAsync()` 不等于"稍后一定跑完"。**
   `cloudbuild.yaml` 的 `gcloud run deploy` 既没有 `--no-cpu-throttling` 也没有 `--min-instances`，
   `docs/00-infrastructure.md` 记录的服务 spec 里也没有相关注解 → 默认是
   **"CPU 仅在处理请求期间分配"**。含义：**响应发出后仍未 settle 的 promise，要么等到该实例的
   下一次请求才继续，要么随实例回收永远不跑**；`setInterval` / `setTimeout` 在两次请求之间**不 tick**。
   这不是新代码才有的问题——**今天的 `void meterInvocation(...)`（内含 DEBIT 扣款 + 余额递减）
   与 `logRequest()` 已经全部暴露在这条约束下**：一次已经返回 200 的收费调用，有可能既没有
   `Invocation` 行也没有扣款。
   蓝图 §1.1 的核心范式（内存有界 buffer + 定时 flush + SIGTERM drain）**默认进程是常驻的**，
   照抄到这里会得到一个"看起来在跑、实际按流量随机丢"的管线。处置见 §2.4。
   **部署侧实际值待确认**（本次只从仓内文件推断，未连生产）：
   `gcloud run services describe takoapi --region us-central1 \`
   `--format="value(spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'])"`
   ——返回空或 `true` 即为节流（默认态）。

### 0.3 必须先补的洞（Phase 0 的实际内容）

打点方案的前半段不是"加事件"，是**把已有管线补到能回答问题**。下表这些不补，后面所有事件都是
在错误的地基上加装饰：

| # | 洞 | 修在哪 |
|---|---|---|
| H1 | `Invocation` 无 `source` / `client` 维度 → MCP 转调与裸 curl 无法区分 | `prisma/schema.prisma` 加列 + `src/lib/mcp/tools.ts` 注入 `X-Tako-Client` header |
| H2 | 三条网关路由都不传 `taskState` → "成功完成"只能靠 HTTP status 近似 | `src/app/v1/agents/[slug]/message/route.ts` 解析 A2A 响应的 `result.status.state` |
| H3 | 402/429/401 **无 DB 行、无事件、不可归因**（平台请求日志有 timestamp/status/URL，保留 30 天，但没有 userId / apiKeyId / agentId / 拒绝原因，402 与 429 在日志里长得一样，且无法与 `Invocation` join）| 新事件 `gateway_call_rejected` |
| H4 | SSE 提前计量 | 新事件 `gateway_stream_closed` + 口径规则 |
| H5 | `RequestLog.ip` 明文 + 无 TTL，在 0.6 GB 实例上无限增长 | `src/lib/requestLog.ts` 改 `ipHash` + 新增保留期 cron |
| H6 | `/mcp` 零日志 | chokepoint 事件 `mcp_session_initialized` / `mcp_tool_invoked` |
| H7 | **MCP 的四个工具全部走公网 loopback 调自己的 API**（`src/lib/mcp/tools.ts` 的 `getJson()` → `/api/registry`、`/api/agents/{slug}`、`/api/skills/search`、`/api/agent`；`invoke_agent` → `/v1/agents/{slug}/message`）。不处理 = 每一次 MCP 读工具调用都在 API 侧再产生一条事件（双计），且那条 loopback 请求的 IP 是 **Cloud Run 自己的出口 IP**，会把 `client_fp` 污染成一个巨大的热值 | 在 `getJson()` 与 `invoke_agent` 的 fetch **统一注入 `X-Tako-Client`**（§5.4），服务端见到它就把该请求标记 `source='mcp'` 且**不计入匿名指纹**；口径侧按 §7.2 去重 |

### 0.4 待确认项（**不要当成事实用**）

| 项 | 为什么重要 | 确认方法 |
|---|---|---|
| 生产 `Invocation` / `RequestLog` 当前行数 | 决定采样率与 TTL 的起点；`docs/00-infrastructure.md`（2026-04-22 快照）没列这两张表 | `cloud-sql-proxy takoapi-491505:us-central1:takoapi-db --port 5434` 后 `SELECT count(*), min("createdAt"), max("createdAt") FROM "Invocation";` 与 `"RequestLog"` 同 |
| ~~Cloud Logging `_Default` bucket 的保留期是否被改过~~ **已实测 = 30 天（未被改过）** | 直接决定"仓"的保留期，也决定 GDPR 的自然删除边界（§9.3） | `gcloud logging buckets describe _Default --location=global --project=takoapi-491505 --format='value(retentionDays)'` → `30` |
| Cloud Run 上 `GOOGLE_SITE_VERIFICATION` 是否真的设了 / GSC 是否已验证 | Q9（15 语言 SEO ROI）的曝光侧数据源 | `gcloud run services describe takoapi --region us-central1 --format=json \| jq '.spec.template.spec.containers[0].env'`；GSC 控制台确认 takoapi.com 属性 |
| GA4 property `G-PPXV98MJ4Y` 的数据保留期设置（默认 2 个月，可改 14 个月）与是否有人在看 | 决定 GA4 是保留、并行还是弃用 | GA4 后台 → 管理 → 数据设置 → 数据保留 |
| `SkillEvent`（生产 1 行）、`KolContact`（1042 行）等 9 张孤立表的写入方 | 若有外部写入方，本方案的新表可能重复造轮子 | `docs/00-infrastructure.md`「待澄清事项」已挂账，本方案**假设它们全是死表**（见 §6.3 为什么不复用 `SkillEvent`） |
| ~~线上 Cloud Run 的 `run.googleapis.com/cpu-throttling` 注解与 `min-instances` 实际值~~ **已实测：注解为空（= 默认节流）、无 `minScale`、`maxScale=20`、`containerConcurrency=80`** → fire-and-forget **确实可能跑不完**，扣款确实可能在丢；因为 concurrency=80，丢失是**概率性**的（只咬"实例转入空闲前的最后一批"与缩容瞬间），不是每次都丢 | 决定 fire-and-forget 到底能不能跑完——**同时决定今天的计费扣款有没有在丢**（§0.2-5、§2.4） | `gcloud run services describe takoapi --region us-central1 --format=json \| jq '{ann:.spec.template.metadata.annotations, scale:.spec.template.metadata.annotations["autoscaling.knative.dev/minScale"]}'` |

**已从本表移出的三条**（原本挂在这里，本次实测查清，结论直接落进正文——留档是为了让下一个读者
知道这三条被查过，而不是被忘了）：

1. **注销流程不存在。**`src/` 下零个 `prisma.user.delete` / `deleteUser` / delete-account 路由；
   `/api/admin/users/[id]/route.ts` 只导出 `PATCH`；`User` 模型也没有 `status` / `deletedAt`。
   → §9.3 的 GDPR 删除**今天没有触发点**：规则现在就定，实现随注销功能一起做。
2. **`Invocation.costUsd` 的语义是"上游成本"**（`docs/agent-marketplace/04-data-model.md:120`
   的行内注释原文就是「上游成本」），列已建但 `meterInvocation()` 从不写它。
   → 它不是废列，是**未接线的列**。毛利（`billedUsd − costUsd`）在它被写入前无法计算，
   **Q6 的口径里不许出现"毛利"二字**，只能说"收入 / 消耗 / 沉淀"。
3. **`RESEND_API_KEY` 确认零引用**（`src/` 下 grep `resend` 零命中）。邮件通道不存在
   → 激活漏斗里没有"验证邮件送达/点击"这一段，别在漏斗图上画它。

### 0.6 本 PR 已经改掉的现状（读正文时以本节为准）

本文与一批核实后的修复走的是**同一个 PR**（分支 `fix/verified-findings-2026-08-21`，基于
`origin/main` = `b868319c`）。以下条目在正文里仍按"修复前"描述，**代码已经变了**：

| 正文里的说法 | 现在的实际情况 | 对打点方案的影响 |
|---|---|---|
| `meterInvocation()` 一律 `void`，`catch {}` 吞异常 | 拆成 `debitInvocation`（计费，**响应前 await**）与 `meterInvocation`（遥测，可 fire-and-forget）；空 catch 换成 `console.error` | §2.4 R1 的结论不变，但"扣款也在 fire-and-forget 里"这个具体例子已经不成立 |
| SSE 拿到 header 就计费 | 改为 `startInvocation`（流开始前建未计价行）+ `settleInvocation`（流真正结束时定价并扣款）；新增 errorCode：`NO_STREAM_BODY` / `STREAM_ABORTED` / `CLIENT_DISCONNECTED` | H4「stream 终局不记」**已修**；`gateway_call_completed` 的 stream 分支要对齐这三个 errorCode |
| 限流 key 为 `gw:<keyId>:<ip>`，**不读 `ApiKey.rateLimit`** | 网关限流改为 `perIp: false`（key 就是 `gw:<keyId>`）；`max` 改读 `ApiKey.rateLimit`（空则 120） | 「限流可被伪造 XFF 绕过」已修；`rate_limited` 事件的分母口径随之变成"每 key"而非"每 key×IP" |
| `RequestLog.ip` 明文全量保留、无 TTL | 列改为 `ipHash`（盐化 + 按 UTC 日轮换，`TAKO_IP_SALT` 未设则写 null）；新增 `/api/cron/retention` 按 90 天分批清理 | §5.3「日轮换指纹」的设计**已经在 `RequestLog` 上落地**，`client_fp` 可以直接复用同一套盐与轮换口径 |
| 402/429/401 无事件 | 三条 `/v1` 路由 + `/mcp` 已在拒绝分支发结构化日志 `gateway_call_rejected`（带 `reason` / `route` 模板 / `apiKeyId` / `userId` / `agentSlug`，402 另带 `requiredUsd` / `balanceUsd`） | §4 的 chokepoint 设计不变，但**事件 2 已有一个 stdout 版本的雏形**；Phase 1 接 `ProductEvent` 时是"接上第二个 sink"，不是从零发事件 |
| `Agent.healthStatus` 只有当前值 | 新增 `AgentHealthCheck`（**只写状态翻转**，不是每小时每 agent 一行）；`HealthSummary` 加 `transitions` 并整行结构化输出到 Cloud Logging | 「agent 什么时候开始挂的」现在可答；健康度相关指标不必再自己造历史表 |
| PayPal 手续费与正额是两个事务 | 合并为单事务 `applyTopUp`；capture 之后的三条静默 `return "failed"` 全部带上下文告警；webhook 失败时返回 500 让 PayPal 重投 | 影响 §6 的收入口径：`TOPUP` 行现在可以当作"这笔充值已完整入账"的可靠代理 |
| `isAuthorizedCron` 接受 `?key=<secret>` | 只接受 `Authorization: Bearer`，比较改 `timingSafeEqual` | 与打点无关，但**任何文档里出现 `?key=` 的调用示例都要改掉** |

**仍未改、正文描述依然准确的**：`Invocation` 无 `source` / `client` 列；MCP `invoke_agent` 不带来源标识；
MCP `clientInfo` 被丢弃；`ApiKey.scopes` / `monthlyQuota` 仍无强制执行；`userAgent` 仍明文全量存；
`Skill.downloads` 仍是第三方数字（本 PR 只改了文案与 schema 注释，**没有改列名**）。

### 0.5 量级假设（阈值全部基于它，量级变了要重调）

蓝图的规模参照是 **21k events/天**；TakoAPI 的 GTM 文档自己承认日 UV 是 "?"、徽章采纳是
"0"、GitHub stars 是 1。**差 3–4 个数量级**。所以蓝图里所有具体数字（240 req/min/IP、
50 条 batch 上限、15% 对账容差、$50 预算、"5 次/小时"地板）**一条都不能直接抄**。

本方案按三档设阈值，每个阈值旁标注它属于哪一档：

- **T0（今天，≈0 流量）**：告警只能是"绝对零"型，比率型监控全部无意义（分母是 0）。
- **T1（日 1k 事件）**：采样开始有意义，per-agent 看板可读。
- **T2（日 50k 事件，即北极星量级起来了）**：启用蓝图 §7.4 的 per-event 量级回归、log sink → BigQuery。

---

## §1 业务问题 → 指标 → 事件

调研列出九个业务问题。逐条给"用哪个指标算、指标从哪些事件/表来、今天缺什么"。

| # | 业务问题 | 指标（口径） | 数据来源 | 今天缺什么 |
|---|---|---|---|---|
| **Q1** | 北极星是多少？被 502/402/429 挡掉多少？ | `weekly_successful_tasks` = `COUNT(gateway_call_completed WHERE outcome='success')`；`rejection_mix` = `gateway_call_rejected` 按 `reason` 分布 | 事件 1、2、3 | 402/429/401 有平台日志但不可归因（H3）；`taskState` 不解析（H2）；stream 终局不记（H4） |
| **Q2** | 激活漏斗每步流失与中位耗时 | 五步：`install`(代理指标) → `account_registered` → `api_key_created` → `api_key_first_call` → `week2_retained`。每步转化率 + p50 时长 | 事件 5、7、9 + `ApiKey.createdAt` | `api_key_first_call` 不存在；安装侧零遥测（见 §5.4 的替代方案） |
| **Q3** | 哪个入口的开发者最值钱 | 按 `source ∈ {direct, mcp, skill, plugin, openai_shim, unknown}` 切 Q1 与 Q2 的次周留存 | 事件 1 的 `source` / `client` 属性、事件 10、11、12 | `Invocation` 无 source 维度（H1）；MCP 转调不可区分 |
| **Q4** | agent 供给是不是虚胖 | `activated_agents` = `COUNT(DISTINCT agent_slug WHERE 成功调用 ≥ 1)`；`call_gini`；`viewed_never_called` = 有 `agent_detail_viewed` 且零成功调用的 agent | 事件 1、14 | agent 详情页浏览完全不可见（§0.2-1） |
| **Q5** | 每个 HOSTED agent 的上游可靠性画像 | per-agent：`p50/p95 latency_ms`、`error_rate`、`down_ratio` = down/degraded 时长占比 | 事件 1、3、4 + `Agent.healthStatus` | 延迟与错误率原料齐（`Invocation.latencyMs`）。但 **`down_ratio` 今天算不出来**：`Agent.healthStatus` 是一列**被每轮 cron 覆写的当前值**，只配一个 `healthCheckedAt`，**没有任何历史表**——"时长占比"必须靠事件 4 的流水从头攒，**上线之日起才有第一天的数据**，历史无法回溯 |
| **Q6** | 预付经济闭环健不健康 | `weekly_topup_usd`、`fee_revenue_usd`、`burn_days` = 充值额 / 日均消耗、`idle_balance_usd`、**`blocked_revenue_usd`** = 因 402 被拒调用的应收 | 事件 20–23 + `LedgerEntry` + `CreditBalance` | `credit_exhausted` 不存在 → 放宽 `TAKO_CREDIT_FLOOR_USD` 的决策今天没有依据 |
| **Q7** | 5,146 条 skill 的转化效率 | `install_intent_rate` = `install_command_copied` / `skill_detail_viewed`（按 category / scenario 切）；`zero_result_rate` | 事件 13、15、16、19 | 安装意图事件不存在；`Skill.downloads` 是抓来的外部数字**不能当转化**；`viewsCount` 人机混计（§7.3） |
| **Q8** | 徽章外链飞轮转没转 | `badge_repos_weekly` = `COUNT(DISTINCT agent_slug)` 有渲染的；`badge_renders`（加权还原）；转化端**不可归因**（camo 剥 Referer） | 事件 17、18 | 转化端需要替代锚点：徽章链接加 `?ref=badge`（§5.5） |
| **Q9** | 15 语言 SEO fan-out 的投入产出 | 按 `locale` 切 `account_registered` / `api_key_created` / 首次成功调用；分母用 GSC 曝光。**必须分两类页面算**（见右栏） | 事件 5、7、13、14、15 的 `locale` 属性 + GSC | GSC 待确认已接入；locale 解析有陷阱（§7.6）。**最关键的一条**：`src/proxy.ts` 已经对**非 en 的 `/agents/*` 与 `/skills/*` 详情页**打了 `X-Robots-Tag: noindex, follow`（理由：详情页正文是英文抓来的，14 个 locale 只是 UI 壳）。所以"15 语言 SEO"实际只有**列表页 / scenario 页 / 营销页**在被索引——拿全站 locale 汇总去算 ROI 会把一批**故意不索引**的页面算进分母 |

**映射的反向检查**：§4.3 列出的事件里，没有一个是"因为蓝图里有所以加的"（此处**刻意不写事件
总数**——§3.5 的规则对本文自己生效；要数跑 `node scripts/audit-analytics-events.mjs --counts`。
本次审校在这一行原本就抓到过一个会漂移的数字）。每个事件在上表
至少出现一次。反过来，Q1–Q9 每一条都至少有一个 Phase 0 或 Phase 1 事件覆盖——唯一的例外是
Q2 的第一段（安装量），它**永远只有代理指标**，理由见 §5.4。

---

## §2 设计不变量在 TakoAPI 的形态

蓝图 §1 的三条不变量全部适用，但每条在本项目有具体的、已经被代码验证过的形态。

### 2.1 打点永不阻塞网关（fire-and-forget）

这条在 TakoAPI 不是新规则——**代码里已经写死了**：`src/lib/billing.ts` 的 `meterInvocation()`
注释原文是 *"metering/billing must never break the gateway path"*，实现是全函数
`try { … } catch {}`；`src/lib/requestLog.ts` 的 `logRequest()` 是 `void` 签名 +
`.catch(console.error)`。**新增的 `trackEvent()` 必须沿用同一契约，并且要比它们更严一档**：

```ts
// src/lib/analytics.ts —— 唯一入口，签名不可变
export function trackEvent<N extends TakoEventName>(
  name: N,
  props: TakoEventProps<N>,
  ctx?: EventContext,   // { req?, apiKeyId?, userId?, clientFp? }
): void;                // ← 同步、返回 void、永不 throw、永不 await
```

三条本项目特有的补充规则：

- **不得在 `trackEvent` 内部做任何 `await prisma.*`**。db-f1-micro 没有 PgBouncer
  （`docs/agent-marketplace/03-technical-architecture.md` 把连接池列为「#1 扩展性翻车点」），
  Cloud Run 每个实例各开连接。同步 DB 写会在流量峰值直接吃掉连接池。DB sink 走**有界 buffer +
  定量/流量驱动的批量 INSERT**（§6.3）——**注意不是"定时"**：定时器在 Cloud Run 上不可靠，
  理由与替代做法见 §2.4 R2。
- **Cloud Logging sink 是 `console.log`，不允许包装成 Promise**。它把行交给 stdout 流后立刻
  返回，不 await、不把失败抛给调用方。把它 `await` 化只会引入一个不存在的失败模式。
  **但要说准一件事，否则 §10 的验收会写成一条必然翻车的断言**：在 Linux 上、当 stdout 是
  **pipe**（容器里就是）时，Node 的写入是**异步**的，不是同步 fd 写——行先进 libuv 的缓冲，
  由事件循环 flush。含义有两条：① 它仍然满足 fire-and-forget 契约（调用点零阻塞），
  且因为 flush 发生在**响应还在生成、CPU 还在的时候**，R1 的论证成立；
  ② 但"`console.log` 绝不丢"是**假的**——`kill -9` 或实例被强杀时，未 flush 的那一小截会消失。
  §8.3 已经把这条记为日志 sink 唯一的丢法，两处要保持一致，别在这里写成"写 fd、同步返回"。
- **buffer 溢出丢最旧**（蓝图 §1.1），且溢出本身要发 `tako_analytics_error`——否则丢数据静默。
  `TAKO_ANALYTICS_DB_MAX_BUFFER` 默认 **2000**（蓝图是 10000；这里按 512Mi 内存下调，
  2000 行 × ~400B ≈ 0.8 MB，可接受）。
- **flush 失败丢弃本批，不重试、不回队**（蓝图 §1.1，本方案先前漏了这一条）。蓝图原话是
  *a retry loop against a failing sink is how analytics turns into an outage amplifier*，
  而在 TakoAPI 这条比在 参照项目 更硬：DB sink 的对面是 **db-f1-micro、无 PgBouncer** 的同一个
  业务库。一个持续失败的批次如果重试，打点会和网关、限流（`RateLimitBucket`）、计费事务
  抢同一个连接池——把"丢了几十行事件"放大成"钱路径写不进库"。丢的数据靠 §8.2 的
  `tako_analytics_error` 告警和 §8.3 ④ 的对账被看见，**不靠重试掩盖**。
- **SIGTERM 时 drain 一次 buffer**（蓝图 §1.1 的第四条契约，本方案先前漏了）。Cloud Run
  缩容/换 revision 时会给实例 SIGTERM 再等约 10s，不 drain = 每次部署都静默丢掉最后一批。
  **本仓有现成形状可抄，但它今天是死代码**：`src/lib/requestLog.ts` 的 `flushRequestLogs()`
  （用一个 `inflight` Set 收住所有 in-flight promise，`Promise.allSettled` 等它们落地）
  **在 `src/` 下零调用点，仓里也没有任何 `process.on("SIGTERM")`**——它被写出来过，从未运行过。
  这正是蓝图反复点名的那种病：一条只活在代码里、没人验证过的防线。所以落地动作是
  **新建**一个 SIGTERM handler，把新的 `flushProductEvents()` 与既有的 `flushRequestLogs()`
  一起挂进去（顺手把后者接线，是白捡的收益）。**注意三件事**：① drain 本身要有超时（≤5s），
  不能让打点拖住实例退出；② Cloud Logging sink 是 `console.log`，**没有 buffer 可以 drain**——
  它的行早在 `trackEvent()` 返回时就已交给 stdout 流（余下的 flush 是 libuv 的事，我们碰不到），
  给它加"drain"只是凭空造一个失败模式；③ **drain 是"优雅退出时少丢一点"，不是
  "不丢"**——实例被回收时能否拿到足够 CPU 把 drain 跑完是平台行为（§2.4），把它当保障就等于
  在设计里默许一个不成立的假设。

**踩坑（蓝图 §1.1 的坑在本项目的具体形态）**：绝不要在 `trackEvent` 开头写
`if (!process.env.TAKO_ANALYTICS_LOG) return`。短路判断必须放在**各 sink 内部**——否则将来
关掉日志 sink 会把 DB sink 一起带死。这不是假想：`src/components/Analytics.tsx` 已经有一个
入口级短路（`if (process.env.NODE_ENV !== "production" \|\| !GA_ID) return null`），它只有一个
sink 所以无害，但那个模式**不能**复制到 `trackEvent`。

### 2.2 双 sink 彼此解耦（本项目是单向解耦）

蓝图 §1.2 假设两个 sink 对称。TakoAPI 不对称：Cloud Logging sink **没有"不可用"状态**——
无依赖、无凭据、无配额、无连接（它唯一的丢法是进程被强杀时 stdout 未 flush，§2.1）。所以
解耦的实际含义收窄为**一条单向规则**：

> **DB sink 的任何失败（连接耗尽、写超时、buffer 溢出、schema drift）不得影响 Log sink 落行。**

实现上就是 fan-out 里两次独立 try/catch，不共享变量、不共享 buffer。反方向（Log sink 影响
DB sink）在物理上不可能，不需要防。

### 2.3 sink 开关 env 化

| env | 默认 | 作用 |
|---|---|---|
| `TAKO_ANALYTICS_LOG` | `"1"`（`NODE_ENV=production` 时）/ `"0"`（其余） | Cloud Logging sink 总开关。本地 `docker-compose.yml` 起的全栈默认静默 |
| `TAKO_ANALYTICS_DB` | 未设 = **关** | Postgres 热表 sink 总开关（`!!process.env.TAKO_ANALYTICS_DB`）。Phase 1 才在生产打开 |
| `TAKO_ANALYTICS_DB_FLUSH_AT` | `20` | 定量 flush |
| `TAKO_ANALYTICS_DB_FLUSH_MS` | `5000` | **buffer 最老行的年龄阈值**，不是"每 5 秒 flush 一次"——flush 由下一次请求触发（§2.4 R2） |
| `TAKO_ANALYTICS_DB_MAX_BUFFER` | `2000` | buffer 上限，溢出丢最旧 |
| `TAKO_ANALYTICS_SALT` | 未设 = **匿名指纹功能整体关闭**（`client_fp` 落 null，不降级成明文 IP） | 匿名指纹的 HMAC 盐，见 §5.3 |
| `TAKO_ANALYTICS_SAMPLE_REGISTRY` | `0.05` | `/api/registry`、`/api/agent` 的采样率 |
| `TAKO_ANALYTICS_SAMPLE_BADGE` | `0.02` | 徽章渲染采样率 |
| `TAKO_ANALYTICS_SAMPLE_CATALOG` | `0.25` | skill/agent/scenario 详情页浏览采样率 |
| `TAKO_REQUESTLOG_RETENTION_DAYS` | `90` | `RequestLog` 保留期（新增 cron） |
| `TAKO_PRODUCTEVENT_RETENTION_DAYS` | `400` | 热表保留期（`365 + 一个月对齐余量`，同蓝图 §5.1） |

**本项目特有的约束（两条，别把它们混成一条）**：

1. **`TAKO_ANALYTICS_SALT` 走 Secret Manager，不走 `--set-env-vars`。**好消息是**前置条件早已就绪**：
   `docs/03-secret-hardening.md` 的状态追踪显示步骤 1–4 在 2026-04-22 全部完成（API 已启用、
   6 个 secret 已建、Cloud Run 默认 SA `429522911261-compute@…` 已授 `secretAccessor`、
   revision `takoapi-00043-wcq` 起 env 全走 `secretKeyRef`）。所以这一步不是"先启用 API"，
   而是**照既有范式再加一个 secret**：`gcloud secrets create tako-analytics-salt` → 给同一个 SA
   授权 → 部署时 `--set-secrets TAKO_ANALYTICS_SALT=tako-analytics-salt:latest`。
   在它就绪前，**宁可让 `client_fp` 恒为 null**（不设即整体关闭），也不要退回存明文 IP——
   那正是 H5 要修的东西。
2. **⚠️ `cloudbuild.yaml` 不是线上的部署路径，改它不会生效。**（本条已按 `origin/main`
   = `b868319c` 重写；初稿在此处的"跑它会把生产密钥覆盖成占位串"**是错的**，理由见 §0.1 下方的注。）
   `origin/main` 上的 `cloudbuild.yaml` **已经是安全版本**：PR #51 把它改成了
   `--update-env-vars`（公开值真值）+ `--update-secrets`（6 个 secret 绑定），且刻意用
   `--update-*` 而非 `--set-*`，以保留未列出的既有绑定。所以「照它跑会闯祸」这半句不再成立。
   **但「改它不会生效」这半句仍然成立，而且理由更简单**：`gcloud builds triggers list` 返回空
   ——**没有任何触发器在跑这个文件**；最近一次成功构建只有一个 docker build step、没有 deploy
   step，部署是人工敲的 `gcloud run deploy`。
   **后果因此只剩一个方向**：只把遥测 env 加进 `cloudbuild.yaml` 而不改实际的手工
   `gcloud run deploy`，新变量在生产**根本不会出现**，打点会静默 no-op（而"不配置即 no-op"
   正是我们自己设计的行为，所以它不会报错，只会没数据）。
   **所以本方案的遥测 env 落地动作是：以人工 `gcloud run deploy --update-env-vars` 为准，
   并把同样的开关补进 `cloudbuild.yaml` 以免将来接上 CI 时回退。**
   这不再是 Phase 0 的阻塞项——原来把它列为阻塞项，是基于那条已被推翻的判断。

**"不配置即 no-op"的验收方式**：`docker-compose up` 起本地全栈，跑一遍 `/v1/agents/x/message`，
确认 Postgres 里 `ProductEvent` 零行、stdout 无 `tako_event` 行、且接口行为与打点上线前完全一致。

### 2.4 Cloud Run 的 CPU 节流——本项目最硬的物理约束（蓝图完全没有这一节）

事实与待确认项见 §0.2-5。一句话：**在请求级 CPU 分配下，"fire-and-forget" 的后半句不成立**——
它 fire 了，但不保证 forget 之后还会跑。蓝图的三条不变量（§1）仍然全对，但它们的**实现范式**
（buffer + 定时 flush + drain）默认进程常驻，照抄过来会得到一个"看起来在跑、实际按流量随机丢"
的管线。四条规则，按重要性排序：

**R1 — 日志 sink 必须在响应返回之前、在请求路径内写出。**
`trackEvent()` 的 Cloud Logging 分支只是一次字符串序列化 + 一次 `console.log`，微秒级；
放在 `return NextResponse.json(...)` 之前是安全的。**绝不允许**把它挪进 `after()`、`setTimeout`、
或某个 `.then()` 尾巴——那等于把"仓"交给一个可能永远不 tick 的时钟。
**本方案敢把 Cloud Logging 当权威"仓"（§6.1），前提就是这一条**；违反它，§6 的选型论证同时失效。

**R2 — DB sink 的 flush 由流量驱动，定时器只能是第二道保险。**
`trackEvent()` 把行推进 buffer 后**立刻**判定：`buffer.length >= TAKO_ANALYTICS_DB_FLUSH_AT`
**或** 最老一行的年龄 > `TAKO_ANALYTICS_DB_FLUSH_MS` → 就在**当前请求的生命周期内**发起 flush。
落地用 Next 16 的 `after()`（`import { after } from "next/server"`；本仓 `next@16.2.1` 已导出，
`node -e "console.log(typeof require('next/server').after)"` → `function`）。
`setInterval` 可以留，但它的定位降级为"实例恰好在处理别的请求时顺手清一下"，**不能是唯一路径**。

> **别把 `after()` 当成 R3 的替代品——它不解决 CPU 节流，只解决"时钟不 tick"。**
> 本仓是 `output: "standalone"` + 裸 `node server.js`（`next.config.ts` / `Dockerfile`），
> **没有任何平台 `waitUntil` 可以延长请求的 CPU 分配窗口**。Next 的 `after()` 按定义是
> **响应结束之后**才跑回调，所以它面对 Cloud Run 请求级 CPU 时的暴露面**与今天的
> `void meterInvocation(...)` 完全相同**。它相对 `setInterval` 唯一的、但确实有价值的优势是
> **调度时机**：回调在响应 flush 的那一刻就已经在事件循环里排好队，比"5 秒后某个定时器
> 但愿还能 tick"有数量级更高的命中率。
> **结论**：R2 消掉的是"定时器永远不 tick"这个失败模式，**不是**"CPU 已经被收走"那个。
> 后者只有 R3 的两条路能真正消掉，丢多少由 R4 度量。**不要因为用了 `after()` 就跳过 R4。**
- **`TAKO_ANALYTICS_DB_FLUSH_MS` 的语义因此变了**：它不再是"每 5 秒 flush 一次"，而是
  "**下一次请求到来时**，若 buffer 最老行超过 5 秒就带走它"。这个语义差别必须写进 env 表的注释，
  否则下一个人会拿它当 SLA 用。
- **验收**：本地把 `FLUSH_AT` 设成 50，发 3 条事件后**停止发请求** 60 秒 → 不落库；
  再发第 4 个无关请求 → 前 3 条随之落库。这正是生产上应有的行为。

**R3 — 钱不许依赖"以后再说"。**
今天 `void meterInvocation(...)` 里含 DEBIT 扣款与余额递减（`src/lib/billing.ts`）。
在请求级 CPU 下，**一次已经返回 200 的收费调用可能既没有 `Invocation` 行、也没扣款**。
这是**本方案之外、已经存在的资金风险**，打点方案不负责修它，但**负责先把它测出来**（R4）。
真要修只有两条路，都要显式决策：
① 网关路由里改成 `await meterInvocation(...)`——它按契约 never-throws，`await` 不会把失败传给用户，
代价是几毫秒延迟换确定性；
② 部署加 `--no-cpu-throttling`（CPU 常驻）——绝对成本在当前量级很小，但它**改变计费模型**，
且与"512Mi 单实例、成本红线"这条约束正面相关，要算过账再做。
**触发条件（写死，别留成"再看看"）**：R4 测出丢失率 **> 0.5%** 即必须二选一。

**R4 — 用日志 sink 反过来审计 DB 写入路径（本项目独有的对账，T0 就有价值）。**
因为 R1 保证 `gateway_call_completed` 是请求路径内写出（响应返回之前）的，而 `Invocation` 行是 fire-and-forget
落库的，同一时间窗里两者的差就是**计量丢失率**：

```
COUNT(jsonPayload.tako_event="gateway_call_completed")     -- Cloud Logging，权威分母
SELECT count(*) FROM "Invocation" WHERE "createdAt" ...    -- DB，可能少
```

它抓的形态是 §8.3 的 ①②③ 全都看不见的那一种：**事务根本没开始**（①②③ 比的是已经落了库的行
之间是否自洽，事务没跑就三边同时缺，比出来全绿）。这条不需要任何流量规模，
**Phase 0 就该开**，落点并进 §8.3 的对账 cron 作为第 ④ 条。

---

## §3 事件 schema 与类型化治理——本项目该上几层

蓝图 §2 是五层。TakoAPI **上四层，第五层并进第四层**。逐层给裁剪决策与理由。

### 3.1 第一层：schema 单一真相源 —— **全上**

新建 `src/lib/analytics-schema.ts`：discriminated union + `EVENT_EMITTERS` 声明表。

```ts
export type TakoEvent =
  | { name: "gateway_call_completed"; properties: GatewayCallProps }
  | { name: "gateway_call_rejected";  properties: GatewayRejectProps }
  | …;
export type TakoEventName = TakoEvent["name"];
export type TakoEventProps<N extends TakoEventName> =
  Extract<TakoEvent, { name: N }>["properties"];

export type EventEmitter = "server" | "client" | "both" | "both_server_authoritative";
export const EVENT_EMITTERS: Readonly<Record<TakoEventName, EventEmitter>> = { … };
```

`Record<TakoEventName, …>` 作用在字符串字面量 union 上时每个成员都是必填 key——加了 union arm
却忘声明 emitter 就是 TS2739 编译错误。**保留全部四个 emitter 值**，即使 Phase 0 只用到
`server`：删掉再加回来是 breaking change，而多留两个字面量的成本是零。当前 `both` 与
`both_server_authoritative` 都是空集，用审计脚本 pin 死（见 3.4）：

```
DUAL_EMIT_EVENTS.size === 0   // 有人加了双端事件时这条断言会红，逼他先读 §7.2 的双计数规则
```

**本项目特有的 emitter 纪律**：TakoAPI 有一整类事件名含金钱 token（`credit_topup_*`、
`credit_debited`、`credit_exhausted`、`gateway_call_completed` 带 `billed_usd`）。这些
**永远是 `server`**——理由比 参照项目 更硬：TakoAPI 的客户端是 coding agent，**它本身就是一个
能构造任意 HTTP 请求的程序**。参照项目 面对的是"用户可能伪造"，TakoAPI 面对的是"调用方在设计上
就是自动化程序"。任何"client 可发"的金钱事件在这里等于把计费口径开放写入。

### 3.2 第二层：chokepoint helper —— **裁剪为 1 端（Phase 0）**

蓝图是三端（web / mobile / server）。TakoAPI：

| 端 | 文件 | Phase | 说明 |
|---|---|---|---|
| server | `src/lib/analytics.ts` | **0** | 唯一入口，见 §2.1 |
| client（web） | `src/lib/telemetry-client.ts` | **2** | 只服务 3 个事件（16/17/19-web 侧），且必须与 consent gate 同期 |
| mobile | — | **不适用** | 仓库里没有任何 iOS/Android/RN/Expo 代码 |

`src/lib/analytics.ts` 的职责边界（**只做这四件事，别的都不做**）：
① 从 `EventContext` 补齐公共字段（见 §4.2）；② 采样裁决并把 `sample_rate` 写进 props；
③ fan-out 到两个 sink；④ 自身失败发 `tako_analytics_error`。
**不做 enrich 型 DB 查询**（例如"顺手查一下 agent 的 category"）——那是把 chokepoint 变成
关键路径上的额外查询，在 db-f1-micro 上是自杀。需要 join 的维度在查询侧 join，不在写入侧。

**这条规则的边界要说清楚，否则会与 §4.3 的事件表打架**：事件表里确实有几个属性需要额外查询——
`api_key_created.key_index`（该用户第几把 key）、`.minutes_since_registration`（要读 `User.createdAt`）、
`api_key_revoked.lifetime_invocations` / `.lifetime_billed_usd`（要对 `Invocation` 做聚合）。
规则不是"这些字段不许要"，而是：

> **enrich 只允许发生在调用点，永远不允许发生在 `trackEvent()` 内部；
> 且只允许出现在低频路径上。**

判据是**该路径每天跑几次**：key 创建/吊销是**人手动点一次**的动作（`/api/keys` POST/DELETE），
每天个位数，多一次 `count()` 无所谓；而网关 `/v1/*`、`/api/registry`、徽章渲染是**机器高频路径**，
那里的事件属性**只能用手边已有的对象**（`keyRecord`、`agent` 的 select 结果、`upstream.status`），
一次额外查询都不许加。`trackEvent()` 自己不知道调用点的频率，所以它索性一次查询都不做——
把判断权留在调用点，是这条规则的全部意思。

### 3.3 第三层：ESLint 禁裸调 —— **上，但规则形态与蓝图完全不同**

参照项目 禁的是 `posthog.capture()` / `fetch('/api/telemetry/event')`。TakoAPI 的裸调风险是
另外两种：

```js
// eslint.config.mjs —— 追加在现有 defineConfig 数组末尾
{
  files: ["src/**/*.ts", "src/**/*.tsx"],
  ignores: ["src/lib/analytics.ts", "src/lib/analytics-schema.ts"],
  rules: {
    "no-restricted-syntax": ["error",
      { // ① 绕过 chokepoint 直接写热表
        selector: "MemberExpression[object.property.name='productEvent']",
        message: "写 ProductEvent 必须经 trackEvent()（src/lib/analytics.ts）。见 docs/analytics-plan-2026-08-21.md §3.3",
      },
      { // ② 手搓结构化日志伪装成事件行
        selector: "CallExpression[callee.object.name='console'][callee.property.name='log'] > CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
        message: "结构化事件日志只能由 trackEvent() 产出，否则 Cloud Logging 的 tako_event 计数会被污染。",
      },
    ],
  },
}
```

**两个本项目特有的踩坑**：

- 蓝图 §2.3 的核心教训是"flat config 没挂 TS parser → 规则一次都没执行过而 CI 是绿的"。
  本仓 `eslint.config.mjs` 用的是 `eslint-config-next/typescript`，理论上带 parser——
  但**本仓根本没有 CI 跑 lint**（`.github/workflows/` 只有 `i18n.yml`）。所以这条规则上线时
  必须**同时**新建 workflow 跑 `npm run lint`，否则它连"绿的假象"都没有。
- 上线后**故意写一个 `prisma.productEvent.create()` 验证它真的报红**。蓝图明确要求这个动作，
  本仓没有测试兜底，更需要。

### 3.4 第四层：CI schema↔调用点审计 —— **上，且吸收第五层**

新建 `scripts/audit-analytics-events.mjs`（**用 `.mjs` 而不是 `.ts`**：本仓无
`tsx` 依赖，`scripts/check-i18n.mjs` 已经是纯 node 脚本的现成范式，零新依赖）。它做四件事：

1. **missing**：正则扫全仓 `trackEvent("…"` 的字面量事件名，减去 schema 里的 union 成员
   → 非空则 `exit 1`。
2. **unused**：schema 有、无人发 → 打印（`--strict` 下 exit 1）。
3. **敏感命名**（吸收蓝图第五层）：事件名**按 `_` 分词**后命中
   `{credit, payment, topup, refund, payout, ledger, billed, admin, revoke}` 任一 token 的，
   必须 `EVENT_EMITTERS[name] === "server"`，否则 exit 1；例外表内联在脚本顶部，每条带一句
   为什么豁免的理由。
   **必须分词而非 substring**：naive 的 `includes("admin")` 会误伤未来的
   `agent_admin_page_viewed` 这类名字；蓝图明确记录了误报把防线做废的机制。
4. **不变量断言**：`DUAL_EMIT_EVENTS.size === 0`；`serverOnly + clientEmittable === 全量`
   （partition 断言，破了 exit 1）。

**为什么把第五层并进来而不是独立成单测**：本仓**没有测试框架**。为一条命名检查引入
vitest + 配置 + CI job，成本远高于在已有的审计脚本里加 20 行。这是本项目量级下的正确裁剪。
**代价要写明**：并进去之后，这条检查失去了"单测的可读失败输出"，所以脚本必须打印
`事件名 / 命中的 token / 当前 emitter / 应为 server` 四列，别只 exit 1。

**Workflow（与脚本同一个 PR 落地，不许进 backlog）**：新建
`.github/workflows/analytics-audit.yml`，`on: [push, pull_request]`，三步：
`npm ci` → `npm run lint` → `node scripts/audit-analytics-events.mjs`。
蓝图 §2.4 记录了 参照项目 把这个脚本晾在 backlog 数月、同时文档声称"also runs in CI"的病；
本仓的起点更差（一个 CI job 都没有），所以这条更不能拖。
**验收方式**：故意在某个路由里写 `trackEvent("not_declared_event", {})`，确认 CI 变红。

### 3.5 附则：不把集合大小写进 prose —— **适用**

本文全文**没有出现**"共 N 个事件"这样的数字断言（§4.3 的事件表是清单不是计数）。要数就跑
`node scripts/audit-analytics-events.mjs --counts`。

**例外**：`docs/00-infrastructure.md` 里的行数快照（Skill 5,146、KolContact 1,042 等）是
**2026-04-22 的一次性快照**且文中已标注日期——那种带日期的快照是合法的；无日期的
"目前有 493 个 agent"才是谎言温床。注意 `src/app/api/registry/route.ts` 的注释里就写着
"493 today"——那行注释迟早会过时，别引用它。

---

## §4 数据入口：chokepoint 在哪、协议长什么样

### 4.1 chokepoint 清单（哪些代码位置调 `trackEvent`）

TakoAPI 的运气不错：**关键路径上已经有几个天然收口**，不需要新造。

| chokepoint | 文件 | 覆盖 | 状态 |
|---|---|---|---|
| `meterInvocation()` | `src/lib/billing.ts` | 三条网关路由的**成功侧** | 已存在，加事件即可 |
| `withRequestLog()` | `src/lib/requestLog.ts` | **一部分** `/api/*` 路由（跑 `grep -rl 'withRequestLog\|logRequest' src/app/api` 看当前覆盖面） | 已存在；需扩到网关与 `/mcp` |
| `withAdmin()` | `src/lib/admin.ts` | 全部 admin 路由 | 已存在，是"一个 wrapper 覆盖一整类路由"的现成范式 |
| `authenticateApiKey()` | `src/lib/apikey.ts` | 机器身份解析 | 已存在；`api_key_first_call` 判据在这里（见下方陷阱） |

**需要新增的收口**：
- `withGateway()`（新建于 `src/lib/gateway.ts`）——把三条 `/v1/*` 路由的
  「鉴权 → 限流 → 找 agent → credit preflight」四段共用逻辑抽出来，让 `gateway_call_rejected`
  只有一个发射点。今天这四段在三个文件里各抄了一遍，加事件如果不先收口，就要维护三份。
- `src/app/mcp/route.ts` 的 `POST` handler 顶部与 `tools/call` 分支——MCP 的两个事件。

**`withGateway()` 的两个非对称点（不处理就会把 OpenAI 兼容性做坏）**：

1. **顺序不同。**`message` 与 `stream` 是「auth → rate limit → **找 agent** → credit → 读 body」；
   `chat/completions` 必须**先读 body** 才知道 agent 是谁（slug 来自 `body.model`），所以它是
   「auth → rate limit → **读 body** → 找 agent → credit」。`withGateway()` 不能把 slug 当参数
   硬拿，得接受一个 `resolveSlug: (req) => Promise<string>`（前两条直接从 path params 拿，
   shim 那条从已解析的 body 拿），否则 shim 那条路要么读两次 body、要么塞不进这个 wrapper。
2. **错误信封不同。**`message`/`stream` 回的是 `{ error: "Agent not found" }`；
   `chat/completions` 回的是 OpenAI 形状的
   `{ error: { message, type: "invalid_request_error" | "insufficient_quota", code } }`，
   402 那条还专门用了 `type/code = "insufficient_quota"` 让 OpenAI SDK 能正确识别。
   **一个"统一"的 `withGateway()` 如果返回统一的错误体，就等于悄悄破坏了 shim 的兼容契约**——
   而这类破坏没有测试会接住（本仓无测试框架）。所以 `withGateway()` 必须收一个
   `renderError(reason, detail) => NextResponse` 回调，由各路由自己给形状；
   wrapper 只负责**判定 reason 并发 `gateway_call_rejected`**，不负责渲染。
   一句话：**收口的是"判定与打点"，不是"响应体"。**

**实现陷阱（`api_key_first_call` 的判据会被自己踩掉）**：
`authenticateApiKey()` 里有一句 best-effort 的
`prisma.apiKey.update({ data: { lastUsedAt: new Date() } })`。如果在 `meterInvocation` 里用
"`lastUsedAt IS NULL` 说明是首调"来判断，**这个判据在鉴权阶段就已经被写坏了**。
好消息：**今天的代码恰好是对的**——`record` 来自 `findUnique`，那句 `update` 是
fire-and-forget 且**没有回写 `record`**，所以 `record.lastUsedAt` 拿到的就是更新前的旧值。
所以这里要做的**不是改 `apikey.ts`，而是别把它改坏**：绝不能"顺手优化"成用 `update` 的返回值
当返回记录。要落地事件 9，真正要动的是**下游**——`meterInvocation()` 的 `MeterInput` 目前
只有 `{apiKeyId, userId, agentId, protocol, status, latencyMs, taskState, errorCode, units, billedUsd}`，
**没有任何字段能带过去这个旧值**，三条网关路由也只从 `keyRecord` 里取了 `.id` 和 `.userId`。

**`MeterInput` 的完整加宽清单（不只是 `keyLastUsedAt`——这是本方案工作量最容易被低估的一处）。**
`meterInvocation()` 是事件 1、9、22 的共同落点，而 §3.2 定死了"`trackEvent()` 内部不做任何
enrich 查询"。两条一合，事件 1 的每一个属性都**必须由调用方经 `MeterInput` 传进来**。今天的
`MeterInput` 只够填其中一半，所以以下字段全部要加，且三条路由都要传：

| 新字段 | 事件 1 的哪个 prop | 调用点手边有吗 |
|---|---|---|
| `agentSlug: string` | `agent_slug` | 有：`message`/`stream` 从 path params 拿，shim 从 `body.model` 拿。**注意 `agent` 的 `select` 里没有 `slug`**，别去查库，用路由已有的那个变量 |
| `route: "message" \| "stream" \| "chat_completions"` | `route` | 有：每个文件一个常量。**`protocol` 替代不了它**——`message` 与 `stream` 都传 `"A2A"`（只有 shim 是 `"OPENAI_COMPAT"`），§7.5 的"不可相加"在数据上根本切不开 |
| `pricingModel: PricingModel` | `agent_pricing_model` | 有：`agent.pricingModel` 已在三条路由的 `select` 里 |
| `upstreamHost: string \| null` | `upstream_host` | 有：`new URL(agent.endpointUrl).host`。**只取 host，不取全 URL**（§9.1） |
| `promptChars: number` | `prompt_chars_bucket` | 有：`text.length`（原文不传，**分桶在 `trackEvent` 调用点或 schema 侧做**） |
| `source` / `client` | `source` / `client` | 有：从 `X-Tako-Client` 解析（§5.4）。同时也是 H1 要写进 `Invocation.source/client` 两列的值 |
| `keyLastUsedAt?: Date \| null` | 事件 9 的判据 | 有：`keyRecord.lastUsedAt`（上面那个"旧值"） |

**这七条一条不加，事件 1 就只剩 `status/latency/billed` 三个维度，Q3（入口对比）、Q5
（per-agent 画像）、§7.5（route 不可相加）全部落空**——而它们恰好是本方案最贵的三个产出。

### 4.2 事件信封（每行的公共字段）

无论进哪个 sink，每条事件的公共部分固定为：

```jsonc
{
  "tako_event": "gateway_call_completed",  // ← Cloud Logging 的 logs-based metric 靠这个 key 过滤
  "event_id":   "uuid-v4",                 // 幂等键；Phase 2 进 BigQuery 时当 insertId
  "ts":         "2026-08-21T09:14:02.113Z",// 服务端时间，客户端不参与（见下）
  "env":        "production",              // NODE_ENV
  "rev":        "takoapi-00042-abc",       // K_REVISION（Cloud Run 注入），定位"哪个版本开始变的"
  "identity": {
    "user_id":    "cuid | null",
    "api_key_id": "cuid | null",
    "client_fp":  "hex16 | null",          // 日轮换指纹，见 §5.3
    "grade":      "key | session | anon"   // 见 §5.2
  },
  "source":     "direct | mcp | skill | plugin | openai_shim | web | cron | unknown",
  "client":     "takoapi-mcp/0.1.0",       // X-Tako-Client 原样截断 64 字符，可为 null
  "locale":     "en | zh | ja | …",        // 仅 web 侧事件
  "sample_rate": 1.0,                      // ← 采样事件必填，还原时 SUM(1/sample_rate)
  "props":      { … }                       // 逐事件形状，见 §4.3
}
```

**三条设计决定与理由**：

- **`ts` 一律用服务端时间，不接受客户端自报**。蓝图 §3.3 的时钟 clamp（`[now−24h, now+60s]`）
  是为移动端离线 outbox 设计的；TakoAPI 没有离线队列，Phase 2 的浏览器事件也是即时发送。
  接受客户端 ts 只会引入坏时钟风险而换不到任何东西。Phase 2 若真需要，clamp 窗口应是
  **`[now−1h, now+60s]`**（不是 24h），且窗口外**丢弃 ts 用到达时间**，不 clamp 到边界值。
- **`rev` 必须有**。本仓无 CI 部署、靠手动 `gcloud run deploy`，"什么时候变的"经常只能靠
  revision 反推。`K_REVISION` 是 Cloud Run 自动注入的，白捡。
- **`props` 里永远不出现**：prompt 原文、agent 响应体、API key 明文或 prefix、
  邮箱、明文 IP、搜索词原文。硬规则见 §9.1。

### 4.3 首批事件清单

**Phase 列**：0 = 与补洞同周；1 = 第一批看板需求；2 = 客户端入口 + consent 之后。
**emitter 列**：`server` / `client` / `both` / `both_server_authoritative`（蓝图 §2.1 的四值）。

#### A. 网关与北极星

| # | 事件名 | emitter | Phase | 落点 | props | 回答 |
|---|---|---|---|---|---|---|
| 1 | `gateway_call_completed` | server | 0 | `src/lib/billing.ts` `meterInvocation()` | `agent_slug, agent_id, protocol(A2A\|OPENAI_COMPAT), route(message\|stream\|chat_completions), outcome(success\|upstream_error\|upstream_unreachable\|task_failed), status, error_code, task_state, latency_ms, billed_usd, units, prompt_chars_bucket(0\|1-200\|201-1k\|1k-8k\|8k+), upstream_host, agent_pricing_model` | Q1 Q3 Q4 Q5 |
| 2 | `gateway_call_rejected` | server | 0 | 新建 `src/lib/gateway.ts` `withGateway()` | `reason(no_key\|invalid_key\|revoked_key\|rate_limited\|insufficient_credit\|agent_not_found\|not_invokable\|bad_request), route, agent_slug?, required_usd?, balance_usd?, floor_usd?, retry_after_ms?` | Q1 Q6 |
| 3 | `gateway_stream_closed` | server | 0 | `src/app/v1/agents/[slug]/stream/route.ts` 的 `close`/`cancel`/error 分支 **以及 `!upstream.body` 分支** | `agent_slug, invocation_id, reason(complete\|client_cancel\|upstream_error\|timeout\|**no_body**), bytes_out, duration_ms, first_byte_ms, event_count, **billed_usd**` | Q1 Q5（修正 H4 的成功率高估） |
| 4 | `agent_health_checked` | server | 0 | `src/lib/health.ts` 的 `runHealthChecks()`（**不是** cron 路由——路由只是触发器，逐 agent 的结果在这里） | `agent_slug, health_status(ok\|degraded\|down), previous_status, transitioned(bool), latency_ms, http_status, error_code` | Q5 |

> **1 的 `outcome` 是本方案最重要的一个字段。**它不是 `status < 400` 的同义词——见 §7.1。
>
> **4 的 props 今天一个都取不到，`src/lib/health.ts` 必须先改（这是 Phase 0 的实际工作量，别低估）**：
> `probeAgentHealth()` 现在的签名是 `(agent) => Promise<Health>`——只回一个
> `"ok"|"degraded"|"down"` 字符串，**延迟没测、HTTP 状态被 `classify()` 吃掉、原始错误被丢弃**；
> `runHealthChecks()` 的 `findMany` 只 `select: { id, cardUrl, endpointUrl }`——
> **既没有 `slug`，也没有旧的 `healthStatus`**，所以 `agent_slug`、`previous_status`、
> `transitioned` 三个字段无从谈起。落地动作是两处扩宽：
> ① `probeAgentHealth` 返回 `{ health, latencyMs, httpStatus, errorCode }`；
> ② `runHealthChecks` 的 select 加上 `slug` 与 `healthStatus`（写库前的旧值就是 `previous_status`）。
> 两处都在同一个文件里，改动小，但**不改就没有事件 4，没有事件 4 就永远没有 `down_ratio`**（§1 Q5）。

#### B. 身份与激活漏斗

| # | 事件名 | emitter | Phase | 落点 | props | 回答 |
|---|---|---|---|---|---|---|
| 5 | `account_registered` | server | 0 | `src/lib/auth.ts` 的 `events.createUser`（**今天 auth.ts 只有 `callbacks`，没有 `events` 块，要新加**）+ `src/app/api/auth/register/route.ts`（credentials 注册不经 adapter，`createUser` 不会为它触发，必须两处都发） | `user_id, method(google\|apple\|credentials), locale, referrer_host, has_username` | Q2 Q9 |
| 6 | `session_signed_in` | server | 0 | `src/lib/auth.ts` 的 `events.signIn`（同上，`events` 块要新加） | `user_id, method, is_new_user, locale` | Q2 |
| 7 | `api_key_created` | server | 0 | `src/app/api/keys/route.ts` POST | `user_id, api_key_id, key_index(该用户第几把), named(bool), minutes_since_registration` | Q2 Q9 |
| 8 | `api_key_revoked` | server | 0 | `src/app/api/keys/[id]/route.ts` DELETE | `user_id, api_key_id, age_days, lifetime_invocations, lifetime_billed_usd` | Q2 |
| 9 | `api_key_first_call` | server | 0 | `src/lib/billing.ts` 的 `meterInvocation()`，判据是**新增的 `MeterInput.keyLastUsedAt` 为 null**（不是查库！见 §4.1 陷阱） | `user_id, api_key_id, minutes_since_created, agent_slug, source, outcome` | **Q2 的激活时刻** |

#### C. MCP 与分发入口

| # | 事件名 | emitter | Phase | 落点 | props | 回答 |
|---|---|---|---|---|---|---|
| 10 | `mcp_session_initialized` | server | 0 | `src/app/mcp/route.ts` `case "initialize"` | `client_name, client_version, protocol_version, protocol_downgraded(bool), has_token, client_fp` | Q3 |
| 11 | `mcp_tool_invoked` | server | 0 | `src/app/mcp/route.ts` `case "tools/call"` | `tool(search_agents\|get_agent\|search_skills\|invoke_agent), has_token, outcome(ok\|tool_error\|validation_error\|unknown_tool), duration_ms, result_chars, query_chars_bucket, client_fp` | Q3 |
| 12 | `registry_fetched` | server | 1（采样） | `src/app/api/registry/route.ts`、`src/app/api/agent/route.ts` | `endpoint(registry\|agent), format(md\|json), limit, result_count, response_bytes, filtered_by(q\|category\|protocol\|none), ua_class, client_fp, sample_rate, **is_mcp_loopback(bool)**` | Q3 |

> **10 是唯一能识别 MCP 客户端的机会。**MCP server 是无状态的（`src/app/mcp/route.ts` 头注释
> 明确"no session id"），`initialize` 之后的每个请求都不带任何客户端标识。今天
> `case "initialize"` **把 `params.clientInfo` 直接丢弃了**（它只从 `params` 里取了
> `protocolVersion`）——加上它，"是 Claude Code 还是 Cursor 还是自建脚本在用我们的 MCP"
> 这个问题才有答案。
> **代价要写明**：无状态意味着 `mcp_session_initialized` 与后续 `mcp_tool_invoked`
> **无法用 session id 串起来**，只能靠同一天的 `client_fp` 做弱关联。这是协议决定的，不是缺陷。
>
> **11 与 12 之间有一条必须先切断的双计线（H7）。**MCP 不是直接查库的——`src/lib/mcp/tools.ts`
> 的四个工具**全部经公网 loopback 回调自己的 HTTP API**：`search_agents` → `/api/registry`、
> `get_agent` → `/api/agents/{slug}`、`search_skills` → `/api/skills/search`（无 query 时走
> `/api/agent`）、`invoke_agent` → `/v1/agents/{slug}/message`。所以一次 MCP 读工具调用
> **必然同时产生一条 `mcp_tool_invoked` 和一条 API 侧事件**。两个后果：
> ① 计数双计（口径规则见 §7.2，已从"只讲 invoke_agent"扩写成通用规则）；
> ② **匿名指纹被污染**——那条 loopback 请求的 `x-forwarded-for` 是 **Cloud Run 自己的出口 IP**，
> `extractClientIp()` 取到的与真实 MCP 客户端毫无关系。若不处理，`registry_fetched.client_fp`
> 会出现一个吃掉大半流量的热值，"日活设备数上界"这个语义直接作废。
> **处置**：`getJson()` 与 `invoke_agent` 的 fetch 统一带 `X-Tako-Client: takoapi-mcp/<ver>`
> （§5.4），服务端见到它就 ① 置 `is_mcp_loopback=true`、② **`client_fp` 落 null 而不是算出来**
> ——宁可少一个维度，也不要一个假的。

#### D. 目录与 SEO 转化

| # | 事件名 | emitter | Phase | 落点 | props | 回答 |
|---|---|---|---|---|---|---|
| 13 | `skill_detail_viewed` | server | 1（采样） | `src/app/api/skills/[id]/route.ts`（`viewsCount++` 的同一处） | `skill_id, skill_slug, category_slug, locale, referrer_host, ua_class(browser\|llm_agent\|bot\|unknown), client_fp, sample_rate` | Q7 Q9 |
| 14 | `agent_detail_viewed` | server | 1（采样） | **`src/app/[locale]/agents/[slug]/page.tsx` 的 page 函数**（server component，见 §0.2-1） | `agent_slug, agent_id, category_slug, locale, health_status, is_hosted, referrer_host, ua_class, client_fp, sample_rate` | Q4 Q9 |
| 15 | `scenario_page_viewed` | server | 1（采样） | `src/app/[locale]/scenarios/[slug]/page.tsx` | `scenario_slug, locale, item_count, referrer_host, client_fp, sample_rate` | Q7 Q9 |
| 16 | `install_command_copied` | **client** | 2 | **`src/components/ui/InstallTabs.tsx` 的 `CopyButton`**（`/install` 页唯一的复制入口）+ `src/app/[locale]/skills/[slug]/page.tsx` 的复制按钮 | `surface(install_page\|skill_detail), target(claude_native\|codex\|opencode\|curl\|npx\|mcp\|uninstall\|skill_snippet), locale` | **Q7 的转化分子** |
| 17 | `badge_snippet_copied` | **client** | 2 | **`src/components/BadgeSnippet.tsx` 的 `copy()`**（今天唯一带复制按钮的徽章片段，挂在 `/agents/[slug]`） | `agent_slug, locale, format(md\|html)` | Q8 |
| 18 | `badge_rendered` | server | 1（采样） | `src/app/api/badge/[slug]/route.ts`（替换现有 `logRequest`） | `agent_slug(**规范 slug，不是 URL 段**), lookup_key_kind(slug\|id), ua_class(github_camo\|browser\|other), referer_host, value_kind(stars\|listed\|not_listed), sample_rate` | Q8 |
| 19 | `search_performed` | both_server_authoritative | 1 | server：**只在 `src/app/api/skills/search/route.ts` 一处**（MCP 的 `search_skills` 就是转调它，见下）；client（Phase 2）：搜索框 | `surface(skills_api\|agents_api\|web), query_chars_bucket, result_count, zero_result(bool), locale, source(direct\|mcp\|…), is_mcp_loopback(bool)` | Q7 |

> **16 / 17 的落点与枚举本次审校改过——原写法把事件挂在了没有复制按钮的文件上。**
> 全仓写 `navigator.clipboard` 的地方只有四个：`src/components/ui/InstallTabs.tsx`、
> `src/app/[locale]/skills/[slug]/page.tsx`、`src/components/BadgeSnippet.tsx`、
> `src/app/[locale]/dashboard/page.tsx`。三条推论：
> ① **`src/app/[locale]/install/page.tsx` 里没有复制按钮**，它只是 `<InstallTabs />` 的宿主——
> 事件要发在 `InstallTabs` 的 `CopyButton` 里，那一个组件覆盖 claude/codex/opencode 的原生命令、
> 通用 curl、npx、MCP 配置**以及 `--uninstall`**（所以 `target` 枚举里补了 `uninstall`：
> 复制卸载命令是一个真实且重要的负向信号，原枚举把它漏掉了）。
> ② **`/badge` 页今天只把片段渲染在 `<code>` 里，没有复制按钮**（它是 server component）。
> 想在那里发事件，得先给它加一个按钮——这是产品改动，不是埋点改动，别写进埋点 PR 就以为有了。
> ③ **`agent_detail` / `home` / `badge_page` 三个 surface 值今天没有对应的复制入口**，
> 已从枚举里删掉。留着一个永远为空的枚举值，等于给未来的读者一个"这里没数据 = 没人用"的
> 错觉，而真相是"这里根本没有按钮"。
> **另记一笔（不属于事件 16，但同一批 clipboard 里）**：`dashboard/page.tsx` 的复制是
> **API key 明文复制**。那里可以发一个 `api_key_copied`（只带 `api_key_id`），
> 但**绝不允许把被复制的字符串或其长度带进任何 prop**（§9.1）。Phase 2 再定，不进首批。
>
> **19 是本方案唯一的双端事件，且刻意标成 `both_server_authoritative`。**理由与蓝图 §2.1 一致：
> 搜索量是要拿去做供给决策（"哪些查询零结果 → 该补什么 agent"）的，客户端副本可伪造。
> Phase 2 之前它是纯 server；Phase 2 加 client 副本时，`/api/telemetry/event` 入口
> **必须拒绝**这个名字的 client 副本（allowlist 从 `EVENT_EMITTERS` 推导，自动拒）。
> **搜索词原文永不入任何 sink**——只记长度分桶与结果数。要做"零结果查询词"分析时，
> 走一条单独的、显式批准的、只在 admin 侧留存 7 天的通道（§9.2）。
>
> **落点从"API 路由 + MCP 工具"改成"只有 API 路由"（本次审校修正）。**原写法会保证双计：
> MCP 的 `search_skills` 并不自己查库，而是 `getJson('/api/skills/search?…')` 回调同一条路由
> （H7）。在两处都发，一次 MCP 搜索就是两条 `search_performed`——而且这两条的 `surface` 不同
> （`mcp_tool` / `skills_api`），连去重都做不了，正好复刻蓝图案例 A「所有 client 事件被双计 ~2 倍、
> 数月无人发现」的形态。**正确做法**：`search_performed` 只在 API 路由发一次，
> 由 `X-Tako-Client` 带来的 `source='mcp'` + `is_mcp_loopback` 区分它是不是 MCP 来的；
> MCP 侧那次调用由 `mcp_tool_invoked`（事件 11）单独覆盖，**两个事件语义不同、不相加**。
> `surface` 枚举里的 `mcp_tool` 因此删掉——它是这个 bug 的化石。

#### E. 钱（全部 server-only，审计脚本会强制）

| # | 事件名 | emitter | Phase | 落点 | props | 回答 |
|---|---|---|---|---|---|---|
| 20 | `credit_topup_started` | server | 0 | `src/app/api/billing/topup/route.ts` | `user_id, amount_usd, fee_usd, provider(paypal), balance_before_usd` | Q6 |
| 21 | `credit_topup_completed` | server | 0 | `src/app/api/billing/topup/return/route.ts` + `/webhook` | `user_id, amount_usd, fee_usd, net_credit_usd, balance_after_usd, minutes_since_started, path(return\|webhook)` | Q6 |
| 22 | `credit_debited` | server | 0 | `src/lib/billing.ts` `meterInvocation()` 的 DEBIT 分支 | `user_id, api_key_id, invocation_id, amount_usd, balance_after_usd, agent_slug` | Q6 |
| 23 | `credit_exhausted` | server | 0 | **`src/lib/gateway.ts` 的 `withGateway()` 里，`checkCreditPreflight()` 返回 `ok:false` 的那个分支**（**不是** billing.ts 内部，见下注） | `user_id, api_key_id, balance_usd, required_usd, floor_usd, agent_slug, route, blocked_value_usd(= required_usd)` | **Q6 的核心** |

> **21 的 `path` 字段**：PayPal 的 return 与 webhook 两条路都能触发 capture，很可能**双发**。
> 口径上营收**永远从 `LedgerEntry` 数，不从事件数**（§7.4）。这个字段只用来诊断双发。
>
> **23 为什么不发在 `checkCreditPreflight()` 里面（本次审校修正）。**
> 它今天的签名是 `checkCreditPreflight(userId, pricingModel, unitPriceUsd)`——**函数体内既没有
> `agent.slug` 也没有 `agent.id`，更不知道自己是被哪条路由调的**，`agent_slug` / `route` 两个
> prop 在那里物理上取不到。要么改签名（把 agent 传进一个纯计算函数，污染它的职责），
> 要么在调用点发——**选调用点**，而 H3 的 `withGateway()` 正好就是那个唯一的调用点：
> 它在同一个分支里既发 `gateway_call_rejected{reason:"insufficient_credit"}` 又发
> `credit_exhausted`，两条事件同源、字段一致。这与事件 9 的 `keyLastUsedAt` 是同一类陷阱
> （props 写在纸上、落点取不到），本方案在这里踩过两次，第三次请先问"这个字段在那个作用域里
> 真的存在吗"。
>
> **23 的一条口径边界**：`checkCreditPreflight()` 在读余额出错时 **fail-open**
> （`catch { return { ok: true } }`，`src/lib/billing.ts` 的注释写明了这是刻意的）。
> 所以 `credit_exhausted` 与 `blocked_revenue_usd` **在 DB 抖动期间会系统性偏低**——
> 那些调用被放行了而不是被拒了。Q6 的报表要么切掉 DB 不可用的时间窗，要么在结论上标注
> "下界"。别把一个 fail-open 的 gate 的拒绝数当成需求上限。

#### F. 供给与运营

| # | 事件名 | emitter | Phase | 落点 | props | 回答 |
|---|---|---|---|---|---|---|
| 24 | `agent_submitted` | server | 0 | `src/app/api/agents/submit/route.ts` | `user_id, protocol, has_endpoint, pricing_model, source(form\|cron_import\|scrape)` | Q4 |
| 25 | `skill_submitted` | server | 1 | `src/app/api/skills/submit/route.ts` | `user_id, repo_host, category_slug, source(form\|scrape)` | Q7 |
| 26 | `agent_status_changed` | server | 1 | `src/app/api/admin/agents/**`（经 `withAdmin()`） | `agent_slug, from_status, to_status, admin_user_id, reason` | Q4 Q5 |

#### G. 打点自身健康

| # | 事件名 | emitter | Phase | 落点 | props | 回答 |
|---|---|---|---|---|---|---|
| 27 | `tako_analytics_error` | server | 0 | `src/lib/analytics.ts` 各失败分支 | `sink(log\|db), reason(row_build_failed\|db_insert_failed\|buffer_overflow\|serialize_too_large), event_name, dropped_count` | §8.2 的告警源 |

> 这个事件**不进 DB sink**（DB 挂了时它正好发不出去）。它只进 Cloud Logging，且**不采样**。

---

## §5 身份模型

### 5.1 三层锚点，主锚点不是 user_id

蓝图 §4.2 的不变量是「每个事件至少落在 `userId` 或 `anonId` 之一」，且 `userId` 是唯一权威。
**TakoAPI 要改这条**：

> **网关侧的主体是 `api_key_id`，不是 `user_id`。**

理由不是洁癖，是口径正确性：一个人可以持多把 key，而每把 key 通常对应**一个集成 / 一台机器 /
一个 CI job**。用 `user_id` 算"激活"会把"第二把 key 的首调"算成老用户的普通调用，
Q2 的漏斗（第 4 步"发出第一次成功调用"）就永远数不对。所以：

| 锚点 | 语义 | 何时非空 | 用在哪 |
|---|---|---|---|
| `api_key_id` | **机器主体**：一个集成 | 全部 `/v1/*` 与 MCP `invoke_agent` | 激活、留存、限流、来源分析 |
| `user_id` | **人 / 租户** | 网页会话、以及经 `ApiKey.userId` 回溯的网关调用 | 计费、GDPR、跨 key 汇总 |
| `client_fp` | **匿名日指纹** | 目录读、MCP 读工具、徽章 | 日级去重、机器人识别 |

**锚点不变量（本项目版）**：每条事件至少有 `api_key_id` / `user_id` / `client_fp` 之一非空。
在 `ProductEvent` 热表上用 DB CHECK 约束钉死（蓝图 §4.2 的做法适用）：

```sql
ALTER TABLE "ProductEvent" ADD CONSTRAINT "ProductEvent_identity_ck"
  CHECK ("apiKeyId" IS NOT NULL OR "userId" IS NOT NULL OR "clientFp" IS NOT NULL);
```

**唯一豁免**：cron 事件（`agent_health_checked`）三者皆空，`source='cron'`。所以 CHECK 要写成
`… OR "source" = 'cron'`。别指望代码纪律记住这个例外。

### 5.2 `grade`：身份可信度三级（蓝图 §4.5 的本项目形态）

蓝图的 `identity_grade` 是 verified / asserted / anonymous。TakoAPI 的三级不同：

| grade | 含义 | 可信度 |
|---|---|---|
| `key` | 通过 `authenticateApiKey()` 的 SHA-256 比对 | **最高**。密码学证明，可用于计费与所有金钱指标 |
| `session` | NextAuth JWT 会话 | 高。但注意 `session: { strategy: "jwt" }` 意味着 `Session` 表 0 行，撤销只能等 JWT 过期 |
| `anon` | 只有 `client_fp` | **最低**。日级、可伪造（IP+UA 都能改） |

**规则**：任何进入北极星、收入、留存的指标只允许 `grade='key'` 的行。`anon` 行只能进
"流量 / 曝光 / 供给发现"类指标，且报表上必须显式标注。

**遗留坑（必须写进代码注释）**：`src/lib/admin.ts` 的 `requireAdmin()` 有一条走
`x-api-key` 匹配 **`User.apiKey` 明文 unique 列**的分支，与新的哈希 `ApiKey` 体系并存。
经这条路进来的请求 grade 是什么？**答：不要给它任何 grade，落 `null` 并打
`legacy_admin_key=true`**。绝不能在埋点里顺手带上 `User.apiKey` 的值——那是明文密钥。

### 5.3 匿名态：日轮换指纹，不是 anon cookie

蓝图 §4.1「自持 anon ID cookie / SecureStore」**在 TakoAPI 不成立**——匿名主力流量是
`curl`、MCP JSON-RPC、GitHub camo 代理拉徽章，**它们都不带 cookie、不执行 JS、不存状态**。
`next-intl` 的 `NEXT_LOCALE` cookie 也只在用户主动切语言时才写（`localeDetection: false`）。

替代方案：

```ts
// src/lib/analytics.ts
function clientFp(req: NextRequest): string | null {
  const salt = process.env.TAKO_ANALYTICS_SALT;
  if (!salt) return null;                       // 未配置 → 整体关闭，不降级成明文 IP
  const day = new Date().toISOString().slice(0, 10);   // UTC 日
  const ip = extractClientIp(req);              // 复用 src/lib/ratelimit.ts
  const ua = req.headers.get("user-agent")?.slice(0, 200) ?? "";
  return createHmac("sha256", salt).update(`${day}|${ip}|${ua}`).digest("hex").slice(0, 16);
}
```

**四条必须写进口径文档的语义边界**：

1. **日轮换 = 跨日不可关联。**所以 `client_fp` **不能**做留存、cohort、跨日漏斗。它的全部
   语义就是"同一天内的去重上限"。写查询的人会想当然地拿它当用户 ID——所以字段名叫 `client_fp`
   而不是 `anon_id`，就是为了让这个错误在读代码时就显眼。
2. **它是"日活设备数的上界"，不是设备数。**NAT 后的一栋楼共享一个出口 IP，UA 又高度同质
   （`curl/8.x`），会被合并成一个指纹；反过来，同一台机器换 UA（curl → MCP → 浏览器）会裂成三个。
   **两个方向的偏差同时存在，且不可校正。**
3. **不写 cookie、不写任何客户端存储**——这是它相对 anon cookie 的合规优势（§9）。
4. **`TAKO_ANALYTICS_SALT` 轮换 = 历史指纹全部作废。**盐进 Secret Manager 后不要"顺手轮换"。

### 5.4 显式来源标识：`X-Tako-Client`

`client_fp` 猜不出"这是谁的哪个集成"。所以引入一个**自报的、非机密的、公开可见的** header：

```
X-Tako-Client: <name>/<version>
```

约定值（全部写进公开分发物，正因为仓库是 MIT 公开的，这些值本来就该是公开的）：

| 值 | 注入点 | 备注 |
|---|---|---|
| `takoapi-mcp/<ver>` | **`src/lib/mcp/tools.ts` 的 `getJson()` 与 `invoke_agent` 的 `fetch` —— 两处都要，不是只有 `invoke_agent`** | **H1 + H7 的共同修复点**。`invoke_agent` 那处不加，MCP 转调与裸 curl 在 `Invocation` 里完全一样；`getJson()` 那处不加，三个读工具的 loopback 会在 `/api/registry`、`/api/agents/{slug}`、`/api/skills/search` 上伪装成匿名外部流量，并把 `client_fp` 污染成 Cloud Run 出口 IP 的指纹。`getJson()` 是**一个函数覆盖三个工具**，改一处即可 |
| `takoapi-skill/<ver>` | `takoapi_skill/SKILL.md` 与 `public/install.sh` 写入的 skill 文本里的 curl 示例 | 让 SKILL 里的 curl 自报家门 |
| `takoapi-plugin/<ver>` | `plugins/takoapi/skills/takoapi/SKILL.md` | Claude Code 原生插件 |
| `takoapi-install/<ver>` | `packages/takoapi-install/bin/cli.js` 写出的示例 | npx 路径 |
| （缺失） | 裸 curl / OpenAI SDK | → `source='direct'` 或 `openai_shim`（按 route 判） |

服务端把它映射成 `source` 枚举，**原样值也保留在 `client` 字段**（截断 64 字符）——枚举会漏掉
第三方集成，原样值让它们可被发现。

> **这是"安装侧遥测"问题的解法，也是本方案最重要的一个合规取舍。**
> 调研指出 `install.sh` 与 `npx cli` **零 phone-home**，所以装机量、卸载率不可测。
> **方案：保持零 phone-home。**理由：`public/install.sh` 的产品承诺原文是「只写自己命名空间的
> 文件、从不改共享配置、可 `--uninstall`」，且仓库 MIT 公开——一个静默上报的安装脚本会
> 在第一个读源码的开发者那里毁掉信任，代价远大于一个装机数。
> **替代（三条，全部是代理指标，必须标注为代理）**：
> ① `public/install.sh` 的 GET 次数——Cloud Run 访问日志里**已经免费存在**，是"下载数"不是
> "安装数"（CI 缓存、重复执行、`--uninstall` 都混在里面）；
> ② `X-Tako-Client` 在**用户主动调用 API 时**自报——遥测只发生在用户已经在用产品的时刻，
> 不发生在安装时刻；
> ③ npm registry 的 `takoapi-install` 下载数（外部数据源，手工记录）。
> **不可测的部分要认**：卸载率、"装了但从没调过"的沉默安装量，**这三条代理指标都测不出来**。
> 如果将来非要测，唯一可接受的形态是 **opt-in**（`install.sh --telemetry`，默认关，且在
> `--help` 里成文），不是 opt-out。

### 5.5 徽章归因：camo 剥 Referer 的替代锚点

`src/app/api/badge/[slug]/route.ts` 的注释已经记录了限制：GitHub 的 camo 图片代理会剥掉
Referer，所以**徽章渲染 → 站点访问**这一跳无法归因。

替代做法（Phase 1，低成本）：**徽章的外层链接加 `?ref=badge&a=<slug>`**。片段由我们自己生成，
**全仓恰好两处，都是一行常量拼接**（改动量按分钟计）：

| 文件 | 那一行 | 覆盖 |
|---|---|---|
| `src/components/BadgeSnippet.tsx` | `const link = \`${SITE_URL}/agents/${slug}\`` | `/agents/[slug]` 详情页的一键复制（md + html 两个片段共用这个 `link`） |
| `src/app/[locale]/badge/page.tsx` | 拼 `md` 的那一行（`[![TakoAPI](…/api/badge/${exSlug})](…/agents/${exSlug})`） | `/badge` 教程页的示例片段 |

**只改一处等于漏掉一半的新片段**——两处生成的是同一个东西，却没有共用函数。落地时顺手把
链接拼接抽成 `src/lib/seo.ts` 里的一个 helper，下次改口径就只有一个点。

```md
[![TakoAPI](https://takoapi.com/api/badge/my-agent)](https://takoapi.com/agents/my-agent?ref=badge)
```

点击是**用户浏览器直接发起的**，不经 camo，所以 `?ref=badge` 会原样到达。落在
`agent_detail_viewed.referrer_host` 旁边加一个 `ref` 属性即可。

**诚实的边界**：这只覆盖**我们生成的新片段**；已经嵌在别人 README 里的旧片段不会自动改。
所以 `ref=badge` 的绝对值天然低估，只能看**趋势**和**相对结构**，不能算"徽章带来的总访问量"。

### 5.6 多租户

**没有 Organization / Team / Workspace 模型**（`prisma/schema.prisma` 里一个都没有；要数模型
就跑 `grep -c '^model ' prisma/schema.prisma`，**别把数字写进这段话**——§3.5 的规则对本文自己
同样生效，本次审校就是在这里抓到过一个过时的数字）。所以租户边界 = `user_id`，
隔离手段只有一层 `where: { userId }`。

打点侧要钉死三条：

1. **publisher 看板只给聚合。**`Agent.publisherId → User.id`，publisher 也是普通 User。
   他能看到自己 agent 的：调用数、成功率、p50/p95 延迟、分成金额、按天趋势。
   **绝不能看到**：`api_key_id`、调用方 `user_id`、`client_fp`、`ip`、`user_agent`、
   `prompt_chars_bucket`（够细的话能推断具体调用）。
   实现规则：publisher 查询走**预聚合视图**，不给他任何能触到明细行的路径。
2. **小样本抑制。**当某天某 agent 的调用方 distinct `api_key_id` < 5 时，publisher 侧的
   任何按天明细都要合并成周粒度——否则"某天只有 1 个调用方"配上时间戳，等于泄露单个客户的
   使用模式。阈值 5 是 T1 量级下的保守值，量级起来后可降到 3。
3. **admin 面板要意识到 `RequestLog` 里已经存着别人的个人数据**（明文 IP + UA）。
   H5 修完之后这条压力小很多，但在修完之前，`/admin/logs` 页面就是一个 PII 展示面。

---

## §6 存储与 sink 选型

### 6.1 选型论证

候选与否决理由：

| 候选 | 判断 | 理由 |
|---|---|---|
| BigQuery（蓝图的仓） | **Phase 2 才上** | 不是因为贵（当前量级下预期 $0/月，见 6.5），而是因为它要新增 GCP API、服务账号、凭据、依赖包，而 Cloud Logging 已经在跑。Phase 2 用 **log sink** 接过去，代码零改动 |
| PostHog / Amplitude / Mixpanel 等 SaaS | **否决** | 成本红线明确写着"不引入按量计费的第三方 SaaS 底价"；且蓝图案例 A 就是 SaaS 配额爆掉断供六天 |
| Redis / Upstash 做缓冲 | **否决** | 架构文档把 Redis 列为"先建"但未落地；为打点单独引入一个有状态依赖，违背"先用已有基建"的原则。`RateLimitBucket` 已经证明 Postgres 能扛这类工作 |
| 新建通用 `AnalyticsEvent` 大表 | **否决全量，只留白名单** | db-f1-micro 0.6 GB。全量事件入 Postgres 是把 OLTP 库当归档用——蓝图 §5.1 的红线 |
| 复用死表 `SkillEvent` | **否决** | 见 6.3 |
| Cloud Logging（stdout JSON） | **选它当仓** | 零新依赖、零新凭据、免费额度充裕、`logging: CLOUD_LOGGING_ONLY` 已配、`console.log` 天然满足 fire-and-forget |
| Postgres 精简热表 `ProductEvent` | **选它当热表** | 需要与 `Agent`/`Skill`/`User` join 的少数事件，Prisma 一把查 |

### 6.2 Sink A：Cloud Logging（"仓"）

- **写法**：`console.log(JSON.stringify({ severity: "INFO", tako_event: name, ... }))`。
  Cloud Run 会把 stdout 的单行 JSON 自动解析成 `jsonPayload`，`severity` 字段被识别为日志级别。
- **查法（Phase 1，无 BigQuery）**：Log Explorer 的
  `jsonPayload.tako_event="gateway_call_completed"`，或 `gcloud logging read`。
  够用来做周度北极星统计，不够用来做 cohort——**这是刻意接受的 Phase 1 局限**。
- **保留期**：`_Default` bucket 默认 30 天（**待确认**，§0.4）。
- **单行上限**：Cloud Logging 单条 LogEntry 上限 256 KB。本方案所有事件的 props 都是标量与
  短枚举，远低于此；但 `trackEvent` 仍要在序列化后做长度检查，超 32 KB 直接丢弃并发
  `tako_analytics_error{reason:"serialize_too_large"}`——蓝图 §3.5 记录了 参照项目 把这个上限
  只写在注释里从未实现的教训，**这次真的实现它**。
- **Phase 2 升级路径**：建 log sink → BigQuery dataset `takoapi_analytics`，
  按天分区、`partition_expiration_days = 730`、cluster `(tako_event, source, agent_slug)`。
  代码零改动。**注意蓝图 §5.1 的踩坑**：分区过期不等于永久保留，保留期只信 `bq show`。

### 6.3 Sink B：Postgres 热表 `ProductEvent`（白名单）

**为什么不复用现成的 `SkillEvent` 表**（它已存在、已有 `@@index([skillId, createdAt])`、
`@@index([skillId, type])`，看起来是白捡）：

1. **schema 太窄**：`skillId String`（**非空**），装不下 agent / 网关 / 计费事件；
   没有 `userId` / `apiKeyId` 列，锚点不变量无处安放。
2. **`id String @id` 没有 `@default(cuid())`**——复用要么改 schema（那就不是"零迁移"了），
   要么每处显式传 `randomUUID()`。
3. **它是一张来源不明的死表**（生产 1 行，`src/` 零引用，`docs/00-infrastructure.md` 的
   「待澄清事项」明确写着不知道谁写的）。把一个语义模糊、可能有外部写入方的表放进关键路径，
   是拿一个已知的小便宜换一个未知的大风险。
4. 用户 2026-04-22 的决策是「未搞清用途的功能全部保留，不删不改」——复用它就是"改"。

新表（白名单极小，只放**需要与业务表 join** 的事件）：

```prisma
model ProductEvent {
  id        String   @id @default(cuid())
  name      String              // TakoEventName
  ts        DateTime @default(now())
  userId    String?
  apiKeyId  String?
  clientFp  String?             // 日轮换指纹，见 §5.3
  source    String?             // direct|mcp|skill|plugin|openai_shim|web|cron
  agentId   String?             // 便于 join Agent
  skillId   String?             // 便于 join Skill
  props     Json                // 逐事件形状
  sampleRate Float  @default(1)

  @@index([name, ts])
  @@index([userId, ts])
  @@index([agentId, ts])
  @@index([ts])          // 保留期 cron 专用：上面三个都以别的列打头，`WHERE ts < $1` 用不上它们
}
```

**`@@index([ts])` 不是冗余的**：`[name, ts]` / `[userId, ts]` / `[agentId, ts]` 的前导列都不是
`ts`，保留期清理的 `WHERE ts < $1` 在它们上面只能退化成全表扫描。在 0.6 GB 的实例上，
一次月度全表扫描就是一次业务抖动。**锚点不变量的 CHECK 约束同理要留心**：Prisma schema
**表达不了 `CHECK`**，§5.1 那条 `ALTER TABLE … ADD CONSTRAINT` 必须手写进 migration 的 SQL
文件里；而本仓历史上是用 `prisma db push` 的（`docs/00-infrastructure.md` 有记录），
**`db push` 不会带上手写约束**——所以这张表必须走 `prisma migrate`，不能 push。

**白名单（Phase 1 初始集合，写在 `analytics-schema.ts` 里由代码推导，不手工维护第二份）**：
`gateway_call_completed`、`gateway_call_rejected`、`api_key_created`、`api_key_first_call`、
`api_key_revoked`、`account_registered`、`credit_topup_completed`、`credit_debited`、
`credit_exhausted`、`agent_submitted`、`agent_status_changed`、`agent_health_checked`。

不在白名单里的（`registry_fetched`、`skill_detail_viewed`、`badge_rendered`、
`mcp_tool_invoked` 等高频匿名事件）**只进 Cloud Logging**。

**一个蓝图踩坑在这里被结构性避开了，值得记一笔**：蓝图 §5.2 的热表要**额外**再过一道
"client 副本不许进热表"的交集，理由是 *参照项目 的 EventLog 没有 `source` 列*，双端事件的
client 副本进了热表就会在后台双计。本方案的 `ProductEvent` **有 `source` 列**（上面 schema
第 6 个字段），所以那道交集不需要——去重靠 `WHERE source = …` 谓词，而不是靠一份要手工维护的
第二名单。**但这个便利有个前提**：`source` 必须**永远非空且语义唯一**。所以 §7.2 的
`is_mcp_loopback` 不能用"`source` 缺失"来表达，必须是独立布尔——一旦有人开始拿 `source IS NULL`
当"未知来源"用，这里就退化成 参照项目 那个坑。

**红线（照抄蓝图 §5.1）**：热表**永远不当归档用**。它和 OLTP 同实例，膨胀会伤业务库。
保留期 400 天，月度 cron 清理，上下界 30..730（防一个 typo 清空全表）。

**新增 cron**：`src/app/api/cron/retention/route.ts`（走现有的 `src/lib/cron-auth.ts`
+ `CRON_SECRET` Bearer 范式），每月一次，同时清 `ProductEvent`（400 天）与
`RequestLog`（`TAKO_REQUESTLOG_RETENTION_DAYS`，默认 90 天）。
**分批删**（db-f1-micro 上一把删几十万行会长时间持锁并撑爆 WAL）。**注意 PostgreSQL 的
`DELETE` 没有 `LIMIT` 子句**——直接写 `DELETE … WHERE ts < $1 LIMIT 5000` 会语法报错
（这是 MySQL 的写法）。正确形状是子查询 + `ctid`：

```sql
-- 循环执行直到 rowCount < 5000
DELETE FROM "ProductEvent"
WHERE ctid IN (
  SELECT ctid FROM "ProductEvent" WHERE "ts" < $1 ORDER BY "ts" LIMIT 5000
);
```

Prisma 侧用 `prisma.$executeRaw` 跑它（`deleteMany` 同样不支持 `LIMIT`），每轮之间让出事件循环，
并给整个 cron 设一个墙钟上限（Cloud Run 请求超时之内），跑不完下个月接着跑——**保留期清理是
幂等的，宁可慢，不要一把梭**。上下界 30..730 的校验放在读 env 之后、进 SQL 之前。

### 6.4 `RequestLog` 的处置（不是新建，是收敛）

`RequestLog` 现在承担两件不该由一张表承担的事：HTTP 访问日志 + 徽章采纳计数。处置：

1. **`ip` → `ipHash`**：改 `src/lib/requestLog.ts`，写 `clientFp(req)` 的结果而不是明文。
   **迁移**：加 `ipHash` 列，新写只写它；旧的 `ip` 列在一次性 `UPDATE "RequestLog" SET ip = NULL`
   之后再 drop（分两步，避免长事务）。
2. **加 TTL**：见 6.3 的 cron。
3. **徽章迁出**：`src/app/api/badge/[slug]/route.ts:73` 的
   `` logRequest({ path: `/api/badge/${slug}` }) `` 改成
   `trackEvent("badge_rendered", { agent_slug: <规范 slug>, … })`，`RequestLog` 那行删掉。
   这同时解决了 §0.2-2 的高基数 path 污染，也让 `@@index([path, createdAt])` 不再随徽章采纳膨胀。
   **但别直接把 URL 里那个 `slug` 变量填进去**：这条路由的查询是
   `where: { OR: [{ slug }, { id: slug }], status: "APPROVED" }`——**URL 段既可能是 slug 也可能
   是 cuid**。两种写法嵌在不同 repo 的 README 里，指的是同一个 agent，而 Q8 的
   `badge_repos_weekly = COUNT(DISTINCT agent_slug)` 会把它数成两个。
   落地动作：给那次 `findFirst` 的 `select` 加上 `slug: true`（今天只 select 了 `kind` 与
   `stars`），事件里发 `agent.slug`，**同时**保留一个 `lookup_key_kind(slug|id)` 属性——
   前者保证计数正确，后者让"有多少 repo 嵌的是 cuid 形式"这个迁移问题可见。
   `404`（未收录）那条分支查不到 agent，`agent_slug` 落 URL 原值并标 `value_kind='not_listed'`。
4. **网关与 `/mcp` 是否要包 `withRequestLog`**：**不包**。它们有更精确的事件（1/2/3/10/11），
   再包一层就是同一次请求写两行 Postgres——在 db-f1-micro 上是纯浪费。
   `RequestLog` 的定位收敛为"非网关 `/api/*` 路由的 HTTP 访问日志"。

### 6.5 成本量级估算

按 §0.5 的三档给。**这些是估算，不是实测**——上线一个月后要用真实数字回填。

| | T0（今天） | T1（日 1k 事件） | T2（日 50k 事件） |
|---|---|---|---|
| Cloud Logging 摄取 | < 1 MB/月 | ~15 MB/月 | ~750 MB/月 |
| vs 免费额度（50 GiB/月/项目） | 0.002% | 0.03% | 1.5% |
| Cloud Logging 费用 | $0 | $0 | $0 |
| `ProductEvent` 行/月（白名单约占 20%） | ~0 | ~6k | ~300k |
| `ProductEvent` 存储（400 天保留，~350 B/行） | ~0 | ~28 MB | ~1.4 GB ⚠️ |
| `RequestLog` 存储（90 天保留） | 待确认 | ~10 MB | ~500 MB |
| BigQuery（Phase 2，log sink） | — | 存储 < 1 GB → $0（10 GB 免费）；查询 < 1 TB/月 → $0 | 存储 ~18 GB（730 天）→ ~$0.4/月；查询仍在免费额度内 |

**T2 的红旗**：`ProductEvent` 到 1.4 GB 时，db-f1-micro（0.6 GB RAM）已经装不下热索引。
**触发条件即行动**：`ProductEvent` 行数 > 200k 时，要么升 DB 规格，要么把白名单进一步收窄
（把 `gateway_call_completed` 移出热表，只留在 Cloud Logging + BigQuery）。这个决策点要提前
写进 runbook，别等磁盘告警。

**成本护栏（蓝图 §7.6 的本项目版）**：

- ❌ **BigQuery `maximumBytesBilled`** —— Phase 1 无 BQ，不适用。Phase 2 设 1 GiB（不是蓝图的
  5 GiB，量级差得远）。
- ✅ **账单预算 $5**（不是蓝图的 $50），三档 50/90/100%。
  **必须显式设 `EXCLUDE_ALL_CREDITS`** —— 蓝图记录了 GCP 预算默认 `INCLUDE` credits、
  账户有赠金时永远不触发的坑。TakoAPI 是新 GCP 项目，**极可能有赠金**，这个坑命中概率很高。
- ✅ **Postgres 行数护栏**（本项目独有）：`ProductEvent` 或 `RequestLog` 行数超阈值告警。
  这比 BigQuery 预算重要得多——0.6 GB 的实例撑爆是**业务宕机**，不是账单超支。

---

## §7 口径规则：TakoAPI 最容易数错的那些事

蓝图 §6.3 的思想是「把容易写错的规则编进数据库视图，让最省事的查询恰好就是正确的查询」。
Phase 1 阶段本项目没有 BigQuery，视图落在 **Postgres 视图**上，**用 `prisma/migrations/` 里
手写的 `CREATE VIEW` 语句**，Phase 2 迁到 BQ。
（**别用 `prisma/sql/`**：那是 Prisma 的 TypedSQL，需要在 generator 里开
`previewFeatures = ["typedSql"]`，本仓的 generator 块是光板的 `provider = "prisma-client-js"`，
目录也不存在——为两个视图引入一个 preview feature 不划算，读侧用 `$queryRaw` 就够。）
下面每条都标注了**不这么做会得到什么错数**。

### 7.1 「成功完成的 agent 任务」的精确定义（北极星）

```
success := status < 400
       AND error_code IS NULL
       AND task_state NOT IN ('failed', 'canceled', 'rejected', 'input-required')
```

- **`status < 400` 单独不够**：A2A 的 JSON-RPC 在任务失败时照样回 HTTP 200，失败信息在
  `result.status.state` 里。今天三条网关路由**都不解析它**（`meterInvocation` 的 `taskState`
  参数从没被传过）——所以在 H2 修好之前，北极星只能是**上界**，必须在报表上标注
  "task_state 未采集，此数为上界"。
- **`input-required` 算不算成功？** 不算。它是"agent 需要更多输入"，任务没完成。
  但它也不是错误——所以单独在报表上列一列 `needs_input`，别混进 `task_failed`。
- **不这么做的错数**：把 HTTP 200 的失败任务全算成功。上游 agent 越不稳，北极星越好看——
  指标方向和产品健康**反向**，这是最糟的一类指标缺陷。

**这条定义必须固化成视图，不能只活在这一段 prose 里**（蓝图 §6.3 的整个论点：*prose 无法强制
执行任何口径，每个新分析师都会重推一遍，推错的那个把错数发出去*）。本方案先前只给了 §7.7 的
`v_event_counts` 一个视图，把北极星、route 不可相加（§7.5）、MCP loopback 去重（§7.2）三条
最容易写错的规则全留在了文字里——**本次审校补上下面这个**，与 `ProductEvent` 热表同一批 migration 落地：

```sql
CREATE VIEW v_gateway_calls_canon AS
SELECT
  e."ts",
  e."userId", e."apiKeyId", e."agentId",
  e."props"->>'agent_slug'                       AS agent_slug,
  e."props"->>'route'                            AS route,          -- 永远不许 SUM 掉（§7.5）
  COALESCE(e."source", 'unknown')                AS source,         -- 非空，见 §6.3
  COALESCE((e."props"->>'is_mcp_loopback')::bool, false) AS is_mcp_loopback,
  (e."props"->>'status')::int                    AS status,
  e."props"->>'error_code'                       AS error_code,
  e."props"->>'task_state'                       AS task_state,
  (e."props"->>'latency_ms')::int                AS latency_ms,
  -- 唯一权威的成功判定。改这里 = 改北极星，改之前先读 §7.1。
  ( (e."props"->>'status')::int < 400
    AND e."props"->>'error_code' IS NULL
    AND COALESCE(e."props"->>'task_state', '') NOT IN
        ('failed','canceled','rejected','input-required') )         AS is_success,
  -- task_state 尚未采集时（H2 未修完），is_success 是上界。这一列让报表能自己发现这件事。
  (e."props"->>'task_state' IS NULL)             AS task_state_missing
FROM "ProductEvent" e
WHERE e."name" = 'gateway_call_completed';
-- KEEP A DATE PREDICATE：调用方仍需自己加 ts 下界。
-- 规则出处：docs/analytics-plan-2026-08-21.md §7.1 / §7.2 / §7.5
-- 红线：① 任何按 route 汇总必须显式 GROUP BY route（message 与 stream 的"成功"是两种物理事件）；
--       ② 北极星只数这张视图，永不加 mcp_tool_invoked（§7.2 特例）；
--       ③ task_state_missing 为 true 的行占比要与结果一起报出来，否则读者不知道自己看的是上界。
```

**为什么值得单开一个视图而不是让大家自己写 `WHERE`**：上面三条红线里的每一条，写错的形态都是
**一个正常的正整数**——没有任何监控会因为漏了 `GROUP BY route` 而报红（§7.9 结尾的同一个论点）。
视图的价值不在省字数，在于**让最省事的查询恰好就是正确的查询**。

### 7.2 MCP 的**每一个**工具都会双计，不只是 `invoke_agent`

先把机制说准（这是本节上一版写窄了的地方）：`src/lib/mcp/tools.ts` **没有一个工具直接查库**。
它的头注释自己写着 "a thin facade over TakoAPI's OWN public REST/gateway API"——四个工具全部
经公网 loopback 打回自己：

| MCP 工具 | 内部实际打的 endpoint | 于是同时产生 |
|---|---|---|
| `search_agents` | `GET /api/registry?format=json&…` | `mcp_tool_invoked` + `registry_fetched` |
| `get_agent` | `GET /api/agents/{slug}` | `mcp_tool_invoked` + 该路由的 `RequestLog` |
| `search_skills`（带 query） | `GET /api/skills/search?q=…` | `mcp_tool_invoked` + `search_performed` |
| `search_skills`（无 query） | `GET /api/agent?format=json` | `mcp_tool_invoked` + `registry_fetched` |
| `invoke_agent` | `POST /v1/agents/{slug}/message` | `mcp_tool_invoked` + `gateway_call_completed` |

所以规则不是一条，是**一条通则加一个特例**：

> **通则：任何"MCP 工具层"事件与"API/网关层"事件，永远不相加。**
> 一次 MCP 用户行为在两层各留一条记录，这是 facade 架构的必然结果，不是缺陷。
> 每张报表必须显式声明自己数的是哪一层：
> **业务量（北极星、搜索量、目录拉取量）一律数 API/网关层**（那是唯一能同时看见 MCP 与非 MCP 的层）；
> **MCP 采用度（有多少客户端在用我们的 MCP、哪个工具最常被调、工具级失败率）数工具层。**
>
> **特例：北极星永远只数 `gateway_call_completed`，永远不加 `mcp_tool_invoked`。**
> 因为 `invoke_agent` 的失败可能发生在两层中的任一层（工具层的参数校验失败 / 缺 token，
> 与网关层的 402/429/502），只有网关层的口径与非 MCP 调用可比。

**实现侧的配套（不做这一步，上面的规则在 SQL 里根本写不出来）**：API/网关层事件必须能回答
"这条是不是 MCP loopback 打来的"，靠的是 §5.4 的 `X-Tako-Client` → `source='mcp'` +
`is_mcp_loopback=true`。没有这个字段，`registry_fetched` 里 MCP 流量与真实外部 curl
**在数据上完全同形**，"MCP 带来多少目录流量"（Q3）就永远算不出来。

这条要写进视图注释与报表标题。蓝图案例 A 的核心教训就是双计数——PostHog 里所有 client 事件
被双计 ~2 倍，历史上所有分析虚高一倍且数月无人发现。**本项目的双计不是实现失误，是架构自带的，
所以它不会被"修好"，只能被口径纪律一直挡住。**

### 7.3 三个"看起来是转化指标但不是"的计数器

| 字段 | 真实语义 | 禁止用法 |
|---|---|---|
| `Agent.callsCount` | `meterInvocation()` 对**所有** status 递增，包括 502 和 4xx | 禁止当"成功调用数"。它只配做目录页排序 |
| `Skill.downloads` | **scraper 从 GitHub 抓来的外部数字**，产品代码从不递增 | 禁止当我们的转化指标（调研已点名） |
| `Skill.viewsCount` | 只在 `GET /api/skills/[id]` 里 `increment: 1`。而**这个端点同时服务浏览器和 LLM**（任何 curl 目录的人、任何拿到 skill id 的 agent） | 禁止当"人类浏览量"。**人机混计**，且爬虫/无 JS 客户端完全不计（详情页是 client component，靠浏览器 fetch）。更要命的是它**只是一个单调计数器，没有任何带时间戳的行**——这条路由没被 `withRequestLog` 包住，所以"这个 skill 上周被看了几次"今天**根本无法回答**，只能看总数。要分人机、要按天，就得靠 `skill_detail_viewed.ua_class`，**`viewsCount` 保持不动**——它是排序用的虚荣数字，改它会动 `/trending` 与 `/admin` 的排序 |

### 7.4 营收只从 `LedgerEntry` 数

`credit_topup_completed` 有 `path(return|webhook)` 两条触发路径，可能双发；`credit_debited`
是 `meterInvocation` 的一个视角。**规则**：

> 任何美元金额（充值额、5% 费收入、消耗、余额）**一律从 `LedgerEntry` + `CreditBalance` 算**，
> 事件只用于诊断与漏斗，**永不用于财务口径**。

理由：`LedgerEntry` 是不可变流水且与 `CreditBalance` 在同一事务里写；事件是 fire-and-forget，
按契约就是允许丢的。**让允许丢的东西去数钱，是设计错误。**

### 7.5 SSE 与 message 的成功率不可比、不可相加

见 §0.2-4。在 `gateway_stream_closed`（事件 3）落地之前：

- stream 的"成功"含义是"**上游返回了 header**"，message 的是"**上游返回了完整 body**"。
- 两者相加得到的成功率是**路由分布的函数**，不是产品质量的函数。这是蓝图 §6.2「网格每卡计一次
  vs 全屏每屏计一次，相加得到的是布局的函数」在本项目的对应形态。
- **视图层强制**：北极星视图里 `route` 必须是显式维度，不允许 `SUM` 掉。

事件 3 落地后，stream 的成功口径改为：`reason='complete' AND bytes_out > 0`。
这个定义**顺带修掉了 `!upstream.body` 那条已收费的假成功**（§0.2-4）：那次调用的
`gateway_stream_closed.reason='no_body'`、`bytes_out=0`，于是它在成功率里正确地落到分母而不是分子，
同时因为它带着 `billed_usd > 0`，还能被单独捞出来做**退款候选清单**——这是本方案里唯一一个
"打点直接指向一笔该退的钱"的地方，别让它只停在看板上。

### 7.6 locale 的解析陷阱

`src/i18n/routing.ts` 配的是 **en 不带前缀，其余 14 个带前缀**。所以：

- 从 URL path 解析 locale 时，**"没有 locale 段"这个状态就是 `en`**。naive 的
  `path.split('/')[1]` 会把 `/agents/foo` 解析成 locale=`agents`。
- GA4 的 pageview 按 URL path 计，同一个页面在 15 个 locale 下是 15 个不同 path——
  做 Q9 的分母时必须先归一化。
- 事件里的 `locale` **不要从 URL 现推**，直接用 next-intl 已经解析好的值
  （server component 里 `params.locale`；API 路由里从 `Accept-Language` 或调用方显式传）。
  URL 解析在服务端做一遍，是把一个已经解决的问题重新解决错。
- **最大的一个陷阱不在解析，在分母**：`src/proxy.ts` 已经对**非 en 的 `/agents/*` 与
  `/skills/*` 详情页**主动打了 `X-Robots-Tag: noindex, follow`（`isNonDefaultLocaleEntityDetail()`；
  理由写在函数上方注释里——详情页正文是抓来的英文，14 个 locale 只是 UI 壳，全量索引会被
  判成 scaled/duplicate content）。所以：
  - **"15 语言 SEO"实际只对列表页 / scenario 页 / 营销页成立**，详情页的非英语版本是**故意**
    不进索引的。
  - 算 Q9 的"曝光 → 注册"转化时，分母（GSC 曝光）里根本不会有那些 noindex 页，
    但分子（`agent_detail_viewed` / `skill_detail_viewed` 的非 en 行）里**会有**——
    直接相除会得到一个凭空虚高的转化率。
  - **规则**：Q9 的 locale ROI 必须**按页面类型分开算**：`scenario_page_viewed` 与列表页走
    "GSC 曝光 → 注册"的正常漏斗；`*_detail_viewed` 的非 en 行只能算"站内流转"，
    **不许拿 GSC 曝光当它的分母**。
  - 这条同时是一个**下游改名风险点**（蓝图案例 B）：哪天有人放开 noindex，Q9 的口径要跟着改，
    否则会把新增曝光当成 SEO 见效。

### 7.7 采样还原：`sample_rate` 必须入库

任何采样事件的计数都要 `SUM(1.0 / sample_rate)` 而不是 `COUNT(*)`。
**规则**：采样率**必须作为事件属性写进每一行**，绝不能只活在代码常量里——
改了 env 之后，历史行的还原系数就错了，而没人会记得某天改过。

**视图强制**（Phase 1 建）：

```sql
CREATE VIEW v_event_counts AS
SELECT name, date_trunc('day', ts) AS day,
       SUM(1.0 / COALESCE("sampleRate", 1)) AS weighted_count,
       COUNT(*) AS raw_rows            -- 显式命名为 raw_rows，防止有人误当计数
FROM "ProductEvent" GROUP BY 1, 2;
-- KEEP A DATE PREDICATE：调用方仍需自己加 ts 下界。
-- 规则出处：docs/analytics-plan-2026-08-21.md §7.7
```

### 7.8 比率的到达滞后：**分路由裁决，不一刀切 T-2**

蓝图 §6.4 的全局规则是"比率一律切 T-2"。TakoAPI 要分开：

| 指标族 | 规则 | 理由 |
|---|---|---|
| 网关（北极星、成功率、延迟） | **T-0 可用，但当天只许读日志 sink** | 分子分母走同一条代码路径，没有跨管线的到达滞后。**但 `meterInvocation` 是 `void` 调的**：在 Cloud Run 的请求级 CPU 下，`Invocation` 行可能被推迟到该实例的下一次请求才落库，甚至随实例回收而丢（§2.4）。所以"今天的北极星"读 `gateway_call_completed`（响应返回之前就已写出），`Invocation` 要到 T-1 才算到齐 |
| 徽章（采纳数、渲染量） | **切 T-2** | `Cache-Control: s-maxage=3600` + GitHub camo 自己的缓存，渲染量的到达是被 CDN 平滑过的 |
| SEO / GSC（曝光、点击） | **切 T-3** | GSC 数据本身有 2–3 天延迟，且与站内事件是完全不同的管线 |
| 激活漏斗（注册 → key → 首调） | **按 cohort 成熟度切**，不是按天 | 首调可能发生在注册后 7 天。分母（注册）到齐了，分子（首调）还在累积 → 未成熟 cohort 的转化率**必然虚低**。规则：只报 **cohort 已满 14 天**的转化率 |

蓝图案例 C（66% 的假 CTR）的机制正是"分子分母走不同管线"。TakoAPI 的对应形态不是 CTR，
**是激活漏斗**——它比 CTR 更容易骗人，因为"最近一周注册的人还没首调"看起来完全合理。

### 7.9 身份单位对照表（蓝图 §6.1 的本项目版——这条本方案先前漏了）

蓝图 §6.1 的规则是"留存 / cohort / DAU / 漏斗一律 `COUNT(DISTINCT userId)`，禁止 `COUNT(*)`
和 `COUNT(DISTINCT session_id)` 当人数用"。TakoAPI **不能照抄**，因为这里有**三个**候选单位
（§5.1），混用比在 参照项目 更容易发生：`user_id` 是人、`api_key_id` 是集成、`client_fp` 是
"同一天内的设备上界"。规则必须逐报表钉死：

| 报表 / 指标 | 唯一合法的计数单位 | 为什么不是别的 |
|---|---|---|
| 北极星（周成功任务数） | `COUNT(*)` on `gateway_call_completed WHERE outcome='success'` | 它本来就是**动作总量**，不是人数。报表标题必须写"任务数"，不许写"调用用户数" |
| 开发者激活 / 漏斗（Q2） | `COUNT(DISTINCT api_key_id)` | 用 `user_id` 会把"同一人的第二把 key 首调"算成老用户的普通调用，第 4 步永远数不对（§5.1） |
| 付费 / 充值 / 余额（Q6） | `COUNT(DISTINCT user_id)` | 钱挂在人身上（`CreditBalance.userId` 是主键），不挂在 key 上 |
| 周留存 / cohort | `COUNT(DISTINCT api_key_id)`，**且只取 `grade='key'` 的行** | `client_fp` 日轮换、跨日不可关联，**永远不能做留存**（§5.3 边界 1） |
| 目录 / SEO 流量（Q7 Q9） | `SUM(1/sample_rate)` 做量、`COUNT(DISTINCT client_fp)` 做"上界" | 匿名侧没有真身份。任何用 `client_fp` 算出来的"人数"在报表上**必须**带"上界/estimate"字样 |
| 供给侧（Q4 Q5） | `COUNT(DISTINCT agent_slug)` | 单位是 agent，不是人 |

**两条硬规则**：

1. **同一张图里不许混单位。**"本周 120 个开发者调用了 45 个 agent"——这句话里的 120 如果是
   `api_key_id` 而读者以为是人，决策就错了。图例必须写单位名（"120 keys"，不是"120 devs"）。
2. **`COUNT(*)` 只允许出现在明确标注"动作总量"的地方**，且标题里必须有"数/次"而不是"人/用户"。
   这条和蓝图 §6.1 完全一致，是唯一可以照抄的一句。

**为什么这条排在采样与滞后之后仍然重要**：前面几节挡的是"数错了多少"，这一节挡的是
"数的根本不是同一种东西"。后者不会在任何监控里报红——两个都是正整数，图也画得出来。

---

## §8 监控

蓝图 §7 是四件套且"不可合并"。TakoAPI 对应关系如下，**有两件在当前量级下不适用，另加两件
本项目独有的**。

### 8.1 Ingestion floor —— **适用，但 T0 只能做"绝对零"型**

- **查什么（T0）**：Cloud Run 有请求（`run.googleapis.com/request_count > 0`）但
  `jsonPayload.tako_event` 的 logs-based metric 连续 **6 小时为 0** → 告警。
- **为什么不能抄蓝图的"< 5 次/小时持续 3 小时"**：那是在 21k events/天的量级下调出来的。
  TakoAPI 今天的正常状态**就是接近零**，任何比率型地板都会天天误报，然后被静音，然后失效。
- **升级触发条件（写进告警 YAML 的 OPS note）**：当连续 7 天日均 `tako_event` > 200 时，
  把这条告警改成"日均量跌破 14 天健康日中值的 30%"。
- **为什么在日志层而不是 sink 层**：日志层在两个 sink 的上游，Phase 2 换成 BigQuery 时监控不用动。

### 8.2 Sink 失败告警 —— **适用，原样上**

- **查什么**：logs-based metric 过滤 `jsonPayload.tako_event="tako_analytics_error"`，
  5 分钟窗口内 ≥ 1 条即告警。
- **为什么**：fire-and-forget 的代价就是失败静默；这条告警是那个设计决定的**对价**，
  **必须与 sink 同一天上线**，不能排到 Phase 1。
- **本项目特有的注意**：`tako_analytics_error` 本身不进 DB sink（DB 挂了时它正好发不出去），
  也不采样。
- **改字符串前先搜 YAML**：`tako_analytics_error` 与 `tako_event` 这两个字面量被 logs-based
  metric 的 filter 匹配。改它们 = 静默失明。这条要写进 `AGENTS.md` / `CLAUDE.md` 的长期纪律。

### 8.3 双 sink 日对账 —— **降级为 Phase 2；Phase 0 先做更重要的"财务三件套对账"**

蓝图 §7.3 对的是"两个 sink 都活着但不一致"。在 TakoAPI，Cloud Logging sink 是 `console.log`，
它几乎不会"活着但丢行"（唯一的丢法是 Cloud Run 实例被强杀时 stdout buffer 未 flush）。
所以**全白名单逐事件比率对账**的边际价值低，推到 Phase 2（有 BigQuery 后再做，因为那时才好查）。

**但有一条例外必须 Phase 0 就上**：日志侧 vs `Invocation` 的行数比（下表 ④）。
它不是"两个 sink 不一致"，而是"DB 那一侧的**写入根本没发生**"——在 Cloud Run 的请求级 CPU 下
这是有物理机制的（§2.4），且丢的是钱。两者形态不同，别因为都叫"对账"就一起排到 Phase 2。

**Phase 0 优先做的是本项目独有的、价值高得多的财务对账**（新 cron
`src/app/api/cron/reconcile/route.ts`，每天 10:00 UTC，走 `CRON_SECRET`）：

| 对账 | SQL 关系 | 不等意味着 |
|---|---|---|
| ① | **左右都用 `LedgerEntry.invocationId` 对上**，不是两边各数一个 `COUNT`：`Invocation WHERE billedUsd > 0` 与 `LedgerEntry WHERE type='DEBIT'` 应**一一对应**（`FULL OUTER JOIN … ON le."invocationId" = i.id`，两侧的孤儿数都必须是 0） | 左孤儿 = 计了费没扣款；右孤儿 = 扣了款没有对应调用。**用两个独立 `COUNT` 相等来判断是错的**：它会把"一条左孤儿 + 一条右孤儿"判成正常。`LedgerEntry.invocationId` 有 `@@index`，join 很便宜——现成的列不用是浪费。另注：`meterInvocation` 的 DEBIT 分支条件是 `billedUsd > 0 && input.userId`，所以一条 `userId` 为 null 的计费调用会天然产生左孤儿；今天网关路径上 `keyRecord.userId` 恒非空（`ApiKey.userId` 是必填列），**这个前提哪天变了，这条对账会第一个叫** |
| ② | `SUM(LedgerEntry.amountUsd) GROUP BY userId` == `CreditBalance.balanceUsd` | 有人在 `grantCredit` / `meterInvocation` 之外改过余额——**这是资金安全事件** |
| ③ | `SUM(Invocation.billedUsd)` == `-SUM(LedgerEntry WHERE type='DEBIT')` | 计费金额与扣款金额漂移 |
| ④ | **日志侧 `COUNT(gateway_call_completed)` == DB 侧 `COUNT(Invocation)`**（同一时间窗，日志为分母） | **计量事务根本没跑**——①②③ 比的都是"已落库的行之间是否自洽"，事务没开始时三边同时缺，比出来全绿。这一条是唯一能看见它的（§2.4 R4）。差值即丢失率，**> 0.5% 触发 §2.4 R3 的二选一决策** |

**三个照抄蓝图的实现细节**：
① mismatch 时**返回 HTTP 200**（`ok:false` 在 body 里）——Cloud Scheduler 对非 2xx 会重试，
重试一个"正确地发现了不一致"的对账只是烧钱重放同一发现；告警走结构化日志
`tako_event:"reconcile_result", outcome:"mismatch"` → logs-based metric。
② DB 不可达 ≠ mismatch，单独计数。
③ 容差：**②必须精确相等**（Decimal，不是 float）；①③ 允许 T-0 当天的在途差（`meterInvocation`
是 fire-and-forget，事务可能还没落），所以**对 T-1 那天对账**，不对今天。

### 8.4 Per-event 量级回归 —— **T0/T1 不适用**

蓝图 §7.4 的基线是"14 天健康日中值"。TakoAPI 今天所有事件的中值都是 0，检测器输出恒为噪音。

- **启用条件**：某事件连续 14 天日均 ≥ 50 行。达标的事件才进入这个检测器，不达标的不进。
- **T0/T1 的替代**：对**四个关键事件**做"绝对零"告警——
  `gateway_call_completed`、`account_registered`、`api_key_created`、`credit_topup_completed`
  中任一在**过去 7 天有过行、但最近 48 小时为零** → 告警。
  这条能抓到蓝图案例 A 那种"单事件归零而总量看不出来"的形态，且在零流量下不误报。

### 8.5 本项目独有：上游 agent SLO 看板（蓝图无对应物）

这是 TakoAPI 的核心运营抓手——**我们把自己的信誉借给了上游 agent**。

- **看板**：新增 `/admin/agents` 的一个 tab，per-agent 显示：7 日成功率、p50/p95 `latency_ms`、
  `down_ratio`（healthStatus 为 down/degraded 的时长占比）、`error_code` 分布、调用量。
- **数据源**：事件 1、3、4。**注意口径可用的时间不一致**：成功率、p50/p95、`error_code` 分布
  可以从**已有的 `Invocation` 历史**回算（`latencyMs` / `status` / `errorCode` 三列早就在写），
  上线当天就有历史曲线；而 **`down_ratio` 只能从事件 4 开始的那天往后攒**——
  `Agent.healthStatus` 是被每轮 cron 覆写的当前值，没有历史（§1 Q5）。
  看板上这两组指标必须**分开标注起算日**，否则第一个月的 `down_ratio` 会因为窗口不满而虚低，
  正好把最该被降权的 agent 放过去。
- **SLO 与动作（阈值属 T1 档，量级起来后回测重调）**：
  | 条件（7 日窗口，调用量 ≥ 20） | 动作 |
  |---|---|
  | 成功率 < 90% | 目录页标注 "unstable" |
  | 成功率 < 70% 或 `down_ratio` > 30% | 从默认排序降权 |
  | 连续 14 天 `healthStatus='down'` | 转 `status` 为 PENDING（下架），通知 publisher |
- **为什么必须有**：Q5 直接问了这个；而且没有它，一个挂掉的上游 agent 会一直消耗我们的
  429/502 预算和用户信任，直到有人手工发现。

### 8.6 本项目独有：Postgres 容量护栏

- `ProductEvent` 行数 > 200k **或** `RequestLog` 行数 > 500k → 告警（见 §6.5 的红旗）。
- Cloud SQL 磁盘使用率 > 70% → 告警。db-f1-micro 上这是**业务宕机**风险，不是账单风险。
- 实现：`src/app/api/cron/reconcile/route.ts` 顺手多跑两条 `COUNT(*)`，超阈值发结构化日志。

### 8.7 告警 YAML 防漂移 —— **Phase 2**

蓝图 §7.5。TakoAPI 当前**一条告警策略都没有**，所以先有策略再谈漂移检查。
告警 YAML 进仓路径定为 `docs/monitoring/alert-*.yaml`（与蓝图同构，方便照抄脚本）。
**记一笔**：账单预算是账单账户资源，不在 drift check 覆盖范围内，要单独记。

---

## §9 合规与隐私

### 9.1 硬规则（写进 `src/lib/analytics.ts` 头注释，违反即事故）

| 禁止入任何 sink 的东西 | 出处 |
|---|---|
| **prompt 原文 / agent 响应体** | `docs/agent-marketplace/03-technical-architecture.md` §11（OWASP LLM Top 10）已把"日志默认脱敏"定为架构约束；`Invocation` 现在刻意不存 `body.text`。只记 `prompt_chars_bucket`（分桶，**不是精确长度**——精确长度对短 prompt 有区分度） |
| **prompt 的 hash** | 短 prompt 可撞库还原。连 hash 都不要 |
| **API key 明文或 prefix** | `src/lib/apikey.ts` 只存 SHA-256 + 6 位 prefix。埋点只能出现 `api_key_id`（cuid）。**prefix 也不行**——它是 key 的前缀，属于凭据材料 |
| **`User.apiKey`（遗留明文列）** | 仍被 `src/lib/admin.ts` 的 `requireAdmin()` 使用。绝不能在埋点里顺手带上（§5.2） |
| **明文 IP** | H5。只存 `client_fp`（HMAC + 日轮换） |
| **邮箱 / 用户名 / bio / website** | 身份特征不入仓（蓝图 §8.4）。需要时 JOIN 回 `User` 表 |
| **搜索词原文** | 只记 `query_chars_bucket` + `result_count` + `zero_result` |
| **完整 User-Agent** | 只记 `ua_class` 枚举 + 用于指纹的哈希输入（哈希后不可还原） |
| **上游 agent 的 endpoint URL 全文** | 只记 `upstream_host`（域名）。完整 URL 可能带 query 里的凭据 |

**开源可见性这条最硬**：仓库 MIT 公开在 GitHub，`public/install.sh`、`takoapi_skill/SKILL.md`、
`packages/takoapi-install` 是公开分发物。**任何写进代码或前端 bundle 的 endpoint / key 等同公开**
（现有 GA4 ID 就是硬编码并注释「Safe to commit」的）。所以：

- `TAKO_ANALYTICS_SALT` **必须**走 Secret Manager（`--set-secrets`），不能进 `--set-env-vars`。
  前置条件已就绪（Secret Manager API 与 SA 授权 2026-04-22 完成，§2.3）。
  `origin/main` 的 `cloudbuild.yaml` 已经在用 `--update-secrets` 绑定 6 个 secret，
  照它的写法加一条即可（初稿这里写的"已与线上漂移、照它部署会覆盖生产密钥"**是错的**，
  见 §0.1 下方的注）。真正要记住的是：**没有触发器在跑这个文件**，实际生效的是人工
  `gcloud run deploy`，两处都要加。
- Phase 2 若引入客户端埋点，`NEXT_PUBLIC_*` 变量的值等同公开——**只能是 write-only 的公开
  measurement id 类值，绝不能是带读权限的 token**。

### 9.2 "零结果查询词"的例外通道（一条显式、留痕的决定）

Q7 需要知道"用户搜什么搜不到"。这需要**原始文本**，与 §9.1 冲突。蓝图 §8.4 的规则是：
凡用户原始文本要入库，必须是一条**显式、留痕**的决定（谁批的、为什么、影响哪个字段）。

**本方案的决定**（留痕于此，Phase 2 落地前需要维护者书面确认）：

- 只对 `zero_result = true` 的查询记原文，命中结果的不记。
- 只进 **admin 侧独立表**（不是 `ProductEvent`，不是 Cloud Logging），保留 **7 天**，
  只有 `role=admin` 可读。
- 记录时**不带任何身份锚点**（无 `user_id` / `api_key_id` / `client_fp`）——切断与人的关联。
- **重估触发条件**：若查询量级起来后出现明显的个人信息（邮箱、姓名、密钥形状）泄漏进查询词，
  立即关闭这条通道并清表。

**没有触发条件的例外决定会变成永久盲区**（蓝图 §8.2）。这条写在这里就是为了防止它变成默认行为。

### 9.3 GDPR：本项目的删除面比 参照项目 小一个量级，但有一个新盲区

- **蓝图 §8.3 的 streaming-buffer 日扫不适用**：TakoAPI 没有 streaming insert。
- **`deletePerson(userId)` 的表面积**：`ProductEvent`（`WHERE "userId" = $1` DML 删除）
  + `RequestLog`（同）+ 业务表（`User` / `ApiKey` / `Invocation` / `LedgerEntry`）。
  **注意 `LedgerEntry` 是财务记录**，多数司法辖区要求保留——删除时应做**假名化**
  （`userId` → 墓碑值）而不是物理删除，且这个决定要单独留痕。
- **新盲区：Cloud Logging 是 append-only，无法按行删除。**
  这是本方案选 Cloud Logging 当仓的**已知代价**，必须显式承认：
  - Phase 1 的缓解：`_Default` bucket 30 天自然过期（**待确认**，§0.4）= 天然的删除边界。
    所以**日志里除 `user_id` 之外绝不能有任何身份特征**（§9.1 已强制），
    30 天后 `user_id` 与人的关联随行过期而消失。
  - Phase 2 挂 BigQuery 后，BQ 表支持 DML，`deletePerson` 要加一条
    `DELETE FROM takoapi_analytics.events WHERE user_id IN UNNEST(@userIds)`
    （批量，一个 job 清一批，不是每人一个 job）。
  - **RTBF 审计轨**：删除日志记 subject id（截断到 200 个）——"证明你删了这个人"要有据可查。
- **删除失败只记日志不抛**：删除流程不能因打点清理失败而卡死（蓝图 §8.3）。
- **前置：注销流程今天不存在（§0.4 已实测）。**`src/` 下零个 `prisma.user.delete` /
  delete-account 路由，`/api/admin/users/[id]/route.ts` 只有 `PATCH`，`User` 也没有
  `status` / `deletedAt`。所以本节**今天没有触发点**，实现随注销功能一起做。
  但**规则现在就要定**，而且要定成一条**验收条件**而不是备忘：
  > 将来实现注销的那个 PR，**必须同时**清 `ProductEvent` 与 `RequestLog` 的对应行，
  > 并对 `LedgerEntry` 做假名化。
  写在这里还不够——本条要同步进 `AGENTS.md` / `CLAUDE.md` 的长期纪律，否则它会以
  蓝图 §2.4 的经典方式失效：一条只活在文档里、没人验证过的防线。
  另外，`User` 没有 `deletedAt` 意味着**蓝图 §8.3 那种"扫 status+updatedAt 窗口"的幂等日扫
  在本项目今天连人群都圈不出来**——做注销时优先选**软删 + `deletedAt`**，别选物理删除，
  否则打点侧的补删将永远无从下手。

### 9.4 Consent：Phase 0 不需要，Phase 2 必须，GA4 是既存债务

- **Phase 0 的服务端事件不需要 consent**：不写 cookie、不写任何客户端存储、不做跨站追踪、
  无第三方处理器（Cloud Logging 与 Postgres 都是自持基础设施）、身份特征不入库、
  匿名指纹日轮换不可长期追踪。这套姿势下，服务端日志属于运营必要处理。
- **既存债务**：GA4（`G-PPXV98MJ4Y`）已在 15 个 locale 面向全球流量运行，**没有任何 consent
  banner 或 gating**，且是第三方处理器 + 持久 client_id。这是**现在就存在**的欧盟合规敞口，
  不是本方案引入的。本方案**不扩大它**（Phase 0 一行客户端代码都不加）。
- **Phase 2 的硬条件**：建 `/api/telemetry/event` 客户端入口时，**必须同期**落地：
  ① 区域化 consent gate（未知地区默认 `opt_in`，fail-closed；显式 allowlist 跳过弹窗）；
  ② 尊重 `Sec-GPC`；③ 服务端复查（绕过客户端的调用也被挡）；
  ④ 顺便决定 GA4 的去留——**要么给它加 gate，要么用自持事件替代它然后关掉**。
  挂载点唯一：`src/app/[locale]/layout.tsx`（第 116 行附近的 `<Analytics/>`）。
  **不允许"先上埋点、consent 下个迭代补"**——那正是把一个已知敞口从"一个第三方脚本"扩大成
  "一整套自建追踪"。

### 9.5 自托管与离线：默认可跑、可关

`docker-compose.yml` 支持本地起全栈；`public/install.sh` 的产品承诺是「只写自己命名空间的文件、
从不改共享配置、可 `--uninstall`」。对应规则：

- 两个 sink 都由 env 开关（§2.3）。**这里要说准，否则和 §2.3 的默认值自相矛盾**：
  - `TAKO_ANALYTICS_DB` **不设 = 关**，热表一行都不写。
  - `TAKO_ANALYTICS_LOG` 在 `NODE_ENV=production` 下**默认开**——但它写的是**自托管者自己进程的
    stdout**，没有任何出站请求，数据全部留在他自己的机器/日志系统里。所以准确的表述是
    **"零外发遥测"，不是"零日志"**；要连本地这行 JSON 都不要，设 `TAKO_ANALYTICS_LOG=0`。
  - 这条差别要写进 README 的自托管章节。把"默认开的本地 stdout"含糊成"不配置即 no-op"，
    是那种**读源码的人一眼就能戳穿**的措辞——而 §9.1 说过，戳穿它的代价是信任，不是一个数字。
- `install.sh` / `npx cli` **零 phone-home**（§5.4）。
- `X-Tako-Client` 是**自报**的，用户可以不发或改写——这是特性不是缺陷。埋点必须容忍它缺失
  （`source='unknown'`），**绝不能用它做任何门禁**（不做限流豁免、不做鉴权、不做定价分档）。
  **一个必须提前认下的副作用**：H7 让服务端在看到 `takoapi-mcp/*` 时把 `client_fp` 落 null，
  所以任何外部调用方只要自己带上这个 header，就能让自己不被匿名计数。
  **这是可接受的**，因为 `client_fp` 只用于计数、从不用于门禁——被伪造的代价是
  "匿名量被低估"，不是"有人绕过了什么"。真要防，只能在 loopback 侧改用一个只有服务端知道的
  内部 header，但那等于往一个 MIT 公开仓里塞一个共享秘密，收益（计数更准一点）
  远小于代价。**记在这里是为了让下一个人不必重推一遍这个取舍。**

---

## §10 分阶段落地 checklist

排序逻辑（蓝图 §10）：**补洞先于加事件**（在错的地基上加事件只会得到更精确的错数）；
**告警先于看板**（没人看的数据断了也没人知道）；**类型闸先于事件膨胀**。

### Phase 0 — 与"补洞"同一批 PR，不可延后

**前置（阻塞项）**
- [ ] 确认 `prisma/migrations/` 的 baseline 可用，新 migration 能干净 apply（`0_init` 已存在；`docs/00-infrastructure.md:127` 的"无 migrations 目录"说法已过时，先修文档）
- [x] ~~先把 `cloudbuild.yaml` 修回与线上一致~~ **不再是阻塞项**：`origin/main` 上 PR #51 已经把它改成 `--update-env-vars` + `--update-secrets`，初稿说的"占位串、照跑会覆盖生产密钥"是在陈旧 checkout 上得出的错误结论（§0.1 注）。仍需注意的是**没有触发器在跑它**，遥测开关必须同时加进人工 `gcloud run deploy`，否则生产不生效（§2.3 第 2 条）
- [ ] `gcloud secrets create tako-analytics-salt` + 给 Cloud Run SA 授 `secretAccessor` + 部署加 `--set-secrets`。**Secret Manager API 与 SA 授权已在 2026-04-22 就绪，这里只是再加一个 secret**。未就绪则 `client_fp` 恒为 null，**不得退回明文 IP**
- [x] ~~查清线上 `run.googleapis.com/cpu-throttling` 与 `minScale`~~ **已实测（2026-08-21）**：`cpu-throttling` 注解**为空**（= 默认「仅在请求处理期间分配 CPU」），**无 `minScale`**（= min-instances 0），`maxScale=20`，`containerConcurrency=80`。结论：**请求级 CPU，fire-and-forget 确实可能跑不完，扣款确实可能在丢**；`trackEvent` 必须按 §2.4 的 R1 在响应返回前写出。**下一步是人工给 Cloud Run 打 `--no-cpu-throttling`**（见 §2.4）

**补洞（§0.3）**
- [ ] H1：`Invocation` 加 `source String?` / `client String?` 列 + migration
- [ ] H1 + H7：`src/lib/mcp/tools.ts` 的 **`getJson()` 与 `invoke_agent` 两处 fetch** 都加 `X-Tako-Client: takoapi-mcp/<ver>`（`getJson()` 一处覆盖三个读工具）
- [ ] H7：服务端识别 `X-Tako-Client` 后，**loopback 请求的 `client_fp` 落 null**（不是算出来的 Cloud Run 出口 IP 指纹），并置 `is_mcp_loopback=true`
- [ ] H2：`src/app/v1/agents/[slug]/message/route.ts` 解析 A2A `result.status.state` → `meterInvocation({ taskState })`
- [ ] H3：新建 `src/lib/gateway.ts` 的 `withGateway()`，三条 `/v1/*` 路由改用它。**必须带 `resolveSlug` 与 `renderError` 两个回调**，否则 OpenAI shim 的错误契约会被做坏（§4.1）
- [ ] H4：`stream/route.ts` 的 `close`/`cancel`/error **以及 `!upstream.body`** 分支发 `gateway_stream_closed`
- [ ] H5：`src/lib/requestLog.ts` 的 `ip` → `ipHash`；旧 `ip` 列先置 NULL 再 drop（两步）
- [ ] H5：新建 `src/app/api/cron/retention/route.ts` + Cloud Scheduler（月度）
- [ ] H6：`src/app/mcp/route.ts` 的 `initialize` 保存 `params.clientInfo`（今天只取了 `protocolVersion`）
- [ ] 事件 1/9 的前置：**`MeterInput` 按 §4.1 的七行表整体加宽**（`agentSlug` / `route` / `pricingModel` / `upstreamHost` / `promptChars` / `source` / `client` / `keyLastUsedAt`），三条网关路由全部补传。只加 `keyLastUsedAt` 是不够的——事件 1 的多数维度都从这里来
- [ ] 事件 4 的前置：`src/lib/health.ts` 的 `probeAgentHealth()` 改回 `{ health, latencyMs, httpStatus, errorCode }`；`runHealthChecks()` 的 `select` 加 `slug` 与 `healthStatus`（§4.3 A 组注）
- [ ] 事件 5/6 的前置：`src/lib/auth.ts` 新增 `events` 块（今天只有 `callbacks`）

**打点骨架**
- [ ] `src/lib/analytics-schema.ts`：discriminated union + `EVENT_EMITTERS`（四个 emitter 值全保留）
- [ ] `src/lib/analytics.ts`：`trackEvent()` 同步 void 签名 + Cloud Logging sink + 32 KB 序列化上限 + `clientFp()`
- [ ] **日志 sink 的 `console.log` 写在响应返回之前**（§2.4 R1）——这是"Cloud Logging 当仓"整个选型的前提，不是风格问题
- [ ] Sink 开关 env 化（§2.3 全表），本地默认 no-op
- [ ] A/B/C/E/F/G 组的 Phase-0 事件：1–11、20–24、27

**监控（与 sink 同天上线，不许拖）**
- [ ] logs-based metric `tako_event_count`（filter `jsonPayload.tako_event:*`）
- [ ] 告警 ①：有请求但 6 小时零事件（§8.1）
- [ ] 告警 ②：`tako_analytics_error` ≥ 1 / 5min（§8.2）
- [ ] 告警 ③：四个关键事件的"7 天有过、48 小时归零"（§8.4）
- [ ] 财务三件套对账 cron `src/app/api/cron/reconcile/route.ts` + mismatch 告警（§8.3）
- [ ] 对账 ④：日志 `gateway_call_completed` ↔ `Invocation` 行数（§2.4 R4）。**跑出的第一个丢失率数字要写回本文档 §0.2-5**——它是 R3 那个二选一决策的唯一依据
- [ ] 账单预算 **$5**，三档，**`EXCLUDE_ALL_CREDITS`**（§6.5）
- [ ] `docs/monitoring/alert-*.yaml` 四份 YAML 进仓

**Phase 0 验收（每条都要真的做一遍）**
- [ ] 故意 `trackEvent("not_declared", {})` → **TS 编译红**
- [ ] 故意不给新 union arm 声明 emitter → **TS2739 编译红**
- [ ] 本地 `docker-compose up` 跑一次网关调用 → Postgres 零新增行、stdout 零 `tako_event`、接口行为不变
- [ ] 把 `DATABASE_URL` 指向一个挂掉的库，跑一次网关调用 → **接口仍 200/502 正常返回**，且 `tako_analytics_error` 告警响。**同一次实验再看一件事**：连打 50 次调用，确认失败的批次**没有被重排进队列反复重试**（`db_insert_failed` 的条数应约等于批次数，而不是随时间线性增长）——重试放大器在这台 0.6 GB 的实例上是真实风险，不是理论风险（§2.1）
- [ ] 用一把余额为 0 的 key 调一个收费 agent → 有 `gateway_call_rejected{reason:"insufficient_credit"}` 与 `credit_exhausted`，且**没有** `Invocation` 行（确认 §0.2-3 的口径）
- [ ] 经 MCP `invoke_agent` 调一次 → `Invocation.source='mcp'`，且 `mcp_tool_invoked` 与 `gateway_call_completed` 各一条
- [ ] **经 MCP `search_skills` 搜一次 → `mcp_tool_invoked` 一条 + `search_performed` 恰好一条**（不是两条），且那条 `search_performed` 的 `source='mcp'`、`is_mcp_loopback=true`、`client_fp` 为 null（H7 的验收；不做这一条，双计与指纹污染都会静默上线）
- [ ] 用 OpenAI SDK 打一次余额不足的 shim 调用 → 返回体仍是 `{error:{type:"insufficient_quota",code:"insufficient_quota"}}`（`withGateway()` 没把 OpenAI 契约做坏）
- [ ] `kill -TERM` 掉本地实例 → buffer 里的行落库（或在 5s 超时后放弃），进程正常退出（§2.1 的 drain）
- [ ] 网关调用返回 200 后**立刻** `kill -9` 本地实例，**重复 10 次**，数两边各命中几次。期望：`gateway_call_completed` 的日志行命中率**显著高于** `Invocation` 行的命中率。这不是 bug，是 §2.4 要度量的那个形态。**三条读法**：① 关键判据是**方向**（日志 ≫ DB），不是"日志必须 10/10"——stdout 在容器里是 pipe，异步写，强杀时尾部本来就会丢一点（§2.1、§8.3）；② 若出现"DB 有、日志无"，说明 R1 被违反了（日志沦为响应后执行），整个"日志当仓"的前提失效，立刻停下来查 `trackEvent` 的调用位置；③ 若两边命中率**一样低**，说明日志 sink 也被挪到了响应之后——同样是 R1 违反

### Phase 1 — 第一批看板需求出现时

- [ ] `ProductEvent` 热表 + CHECK 约束（§5.1）+ 白名单从 schema 推导
- [ ] DB sink（有界 buffer、溢出丢最旧并报错）+ **flush 由流量驱动**：`after()` 触发，`setInterval` 只作第二道（§2.4 R2）。验收：停止发请求 60s → 不落库；下一个无关请求到来 → 补落库
- [ ] **SIGTERM drain**：`flushProductEvents()` 照抄 `src/lib/requestLog.ts` 的 `flushRequestLogs()` 形状（`inflight` Set + `allSettled`），**新建**一个 `process.on("SIGTERM")` 把它和 `flushRequestLogs()` 一起挂进去，带 ≤5s 超时（§2.1）。**注意仓里今天一个 SIGTERM handler 都没有，`flushRequestLogs()` 也零调用点——这是"新建 + 顺手接线"，不是"加进已有的那个"**
- [ ] **flush 失败丢本批、不重试、不回队**（§2.1）——db-f1-micro 无连接池，重试循环会去和计费事务抢连接
- [ ] 保留期 cron 扩到 `ProductEvent`（400 天，上下界 30..730）
- [ ] 采样事件：12、13、14、15、18、19、25、26；`sample_rate` 入库
- [ ] 徽章从 `RequestLog` 迁到 `badge_rendered`（`select` 加 `slug`，发规范 slug 而不是 URL 段，§6.4）；`?ref=badge` **改 `src/components/BadgeSnippet.tsx` 与 `src/app/[locale]/badge/page.tsx` 两处**（§5.5）
- [ ] ESLint 两条 `no-restricted-syntax`（§3.3）+ **故意违规验证会红**
- [ ] `scripts/audit-analytics-events.mjs`（含敏感命名分词检查 + partition 断言）
- [ ] `.github/workflows/analytics-audit.yml`（**与脚本同一个 PR**）+ **故意制造违规验证 CI 变红**
- [ ] Postgres 视图 **两个**：`v_gateway_calls_canon`（北极星成功定义 + route 不可相加 + MCP loopback 去重，§7.1）与 `v_event_counts`（采样还原，§7.7）。**两个视图的头注释都要写明规则出处与红线**（蓝图 §6.3：让最省事的查询恰好就是正确的查询）
- [ ] **身份单位对照表进 runbook 并在每张看板的图例里标出单位**（§7.9）——三个候选单位混用是本项目最不会报红的一类错
- [ ] 上游 agent SLO 看板 + 三档动作（§8.5）
- [ ] Postgres 容量护栏告警（§8.6）
- [ ] 用真实一周流量**回测并重设** §8.1 的地板值

### Phase 2 — 客户端入口 + 仓升级

- [ ] **consent gate 与客户端入口同一个 PR**（§9.4）：区域 fail-closed + `Sec-GPC` + 服务端复查
- [ ] GA4 去留决策（加 gate / 用自持替代后关掉），决定写进本文档
- [ ] `POST /api/telemetry/event`：batch envelope（上限 30 = 客户端 flush 阈值 10 的 3 倍）+
      从 `EVENT_EMITTERS` 推导的 allowlist + 限流 + **真的实现 properties 上限**（蓝图 §3.5 的教训）
- [ ] `src/lib/telemetry-client.ts` chokepoint（事件 16、17、19-web）
- [ ] 时钟 clamp `[now−1h, now+60s]`，窗口外**丢弃 ts 用到达时间**（§4.2）
- [ ] Cloud Logging → BigQuery log sink（dataset `takoapi_analytics`，730 天分区，
      cluster `(tako_event, source, agent_slug)`），**用 `bq show` 确认分区过期而不是信文档**
- [ ] BigQuery `maximumBytesBilled` 1 GiB
- [ ] 双 sink 日对账（§8.3 的事件侧）
- [ ] per-event 量级回归（达到 §8.4 的启用条件后）
- [ ] GDPR `deletePerson` 双 sink 版 + `LedgerEntry` 假名化决定留痕（§9.3）
- [ ] publisher 看板 + 小样本抑制（§5.6）
- [ ] 告警 YAML drift check（§8.7）

### 长期纪律（没有完成态）

- 新事件三件套：union arm + emitter 声明 +（若含敏感 token）审计脚本的例外表书面理由。
- **改 `tako_event` / `tako_analytics_error` 这两个字面量前，先搜 `docs/monitoring/*.yaml`**
  ——它们被 logs-based metric 的 filter 匹配，改了 = 静默失明。
- 声明任何事件为 `both` / `both_server_authoritative` 之前，先用数据验证 server 副本真的在生产
  路径上落行（蓝图 §2.1 的 `ai_generate_started` 教训：声明后封掉 client 副本 = 直接杀死该事件，
  下游读零 16 天无人发现）。
- 每次 `source` / 事件改名 = 一次全仓下游过滤搜索（蓝图案例 B 的三周静默漏计）。
- **不许把日志 sink 的 `console.log` 挪到响应之后**（`after()` / `setTimeout` / `.then()` 尾巴）。
  看起来是"让响应更快"的优化，实际是把权威"仓"交给一个在 Cloud Run 上不保证执行的时钟（§2.4 R1）。
  同理：给网关加任何"响应后再做"的收尾逻辑之前，先问它丢了会不会有人发现。
- 每次改 `TAKO_ANALYTICS_SAMPLE_*` 都是一次口径事件——历史行的 `sample_rate` 不变，
  但报表上要标注变更日期。

---

## 附录 A：蓝图中**不适用于 TakoAPI** 的条目及理由

这一节比照抄适用的部分更有价值。每条给：不适用什么、为什么、替代做法。

| 蓝图条目 | 判断 | 为什么不适用 | 替代做法 |
|---|---|---|---|
| **§1.3** 热表"不配置这个状态天然不存在" | **反转** | 蓝图说热表和业务库同库所以没有"不配置"态。TakoAPI 的热表**必须**能关——db-f1-micro 是真瓶颈，事故时要能一键停掉打点写入 | `TAKO_ANALYTICS_DB` 默认**关**，Phase 1 才在生产打开 |
| **§1.1** fire-and-forget 的**实现范式**：内存 buffer + 定时 flush + SIGTERM drain | **规则对，范式失效** | 那套范式默认进程常驻。Cloud Run 默认"CPU 仅在处理请求期间分配"：响应 flush 后未 settle 的 promise 会被挂起或随实例回收丢弃，`setInterval` 在两次请求之间不 tick。**今天的 `void meterInvocation(...)`（含扣款）已经在这条约束下** | 日志 sink **请求路径内写出（响应返回之前）**；DB sink **流量驱动 flush**（Next 16 的 `after()`）；drain 降级为尽力而为；新增"日志 ↔ `Invocation` 丢失率"对账，> 0.5% 触发 `await` 或 `--no-cpu-throttling` 二选一（§2.4） |
| **§2.2** 三端 chokepoint（web/mobile/server） | **裁剪为 1 端** | 仓库里没有任何 iOS/Android/RN/Expo 代码；web 侧 Phase 0 无事件 | server 一个 `src/lib/analytics.ts`；client Phase 2；mobile 永不 |
| **§2.3** ESLint 禁 `posthog.capture()` / `sendBeacon` | **规则形态全换** | 本项目没有 PostHog、没有 sendBeacon | 禁 `prisma.productEvent.*` 与裸 `console.log(JSON.stringify(...))`（§3.3） |
| **§2.5** 敏感命名**单测** | **裁剪：并进审计脚本** | 本仓**无测试框架**（`package.json` 无 test script）。为一条检查引入 vitest + 配置 + CI job，成本远高于收益 | 并进 `scripts/audit-analytics-events.mjs`，输出四列诊断信息补偿单测的可读性（§3.4） |
| **§3.1–3.6** 整节：单一客户端入口、batch envelope、legacy 单事件 sniff、时钟 clamp、防伪造 allowlist、properties 上限、anonId 入口校验 | **Phase 0 整节不适用** | 没有客户端事件就没有客户端入口。钱和北极星 100% 在服务端 | Phase 2 一次性建齐，且 clamp 窗口收紧到 `[now−1h, now+60s]`（无离线 outbox，24h 窗口只引入坏时钟风险） |
| **§3.3** 时钟 clamp 的 24h 窗口 + "离线批次整批重打送达日"的失真记账 | **不适用** | 移动端 outbox 才需要 24h；浏览器不离线攒事件 | 见上；且 TakoAPI 的对应失真是**激活漏斗的 cohort 成熟度**（§7.8），不是时钟 |
| **§3.4** 240 次/分/IP 的速率限制（"余量给 carrier NAT"） | **数字不适用** | 那是移动端 carrier NAT 场景。TakoAPI 的匿名读流量是 CI 机器与 LLM agent，共享出口 IP 的形态不同 | 复用现成的 `src/lib/ratelimit.ts`（`mcp` 命名空间 120/60s 已在跑），埋点不新增限流层 |
| **§4.1** 自持 anon ID（web HttpOnly cookie + mobile SecureStore） | **不适用** | 匿名主力流量是 curl / MCP JSON-RPC / GitHub camo——**不带 cookie、不执行 JS、不存状态**。`NEXT_LOCALE` 也只在主动切语言时才写 | 日轮换 HMAC 指纹 `client_fp`（§5.3）+ 自报 `X-Tako-Client`（§5.4）。**并接受它的四条语义边界**：跨日不可关联、NAT 合并、换 UA 分裂、不可做留存 |
| **§4.2** "`userId` 是唯一权威 ID，其余都是别名" | **改写** | 网关侧一个人多把 key，每把 key ≈ 一个集成/一台机器。用 `user_id` 算激活会把"第二把 key 的首调"算成老用户普通调用 | **主锚点是 `api_key_id`**；`user_id` 是租户/计费维度（§5.1） |
| **§4.3** AnonIdentityLink 桥（匿名 → 注册的同设备缝合） | **不适用** | 匿名读者（curl/camo/MCP）与注册用户之间**没有任何共享标识**——不是"桥没人过"，是**桥的两端物理上不相连** | 注册来源改用 `account_registered.referrer_host` + 徽章 `?ref=badge`。"同 IP/UA 24h 内先读目录后注册"只是**弱关联**，可用于探索，**不可用于归因结论** |
| **§4.4** platform 归类（`X-App-OS` → UA → null） | **替换语义** | TakoAPI 没有 ios/android 维度 | 对应物是 `source`（direct/mcp/skill/plugin/openai_shim/web/cron）+ `client`。优先级同构：显式 header → route 推断 → `unknown` |
| **§4.5** identity_grade 的四步收紧计划 | **部分适用，语义换掉** | 蓝图的 asserted 是"自报 cuid"。TakoAPI 没有这种形态 | 三级换成 `key` / `session` / `anon`（§5.2），规则是"金钱与留存指标只认 `key`" |
| **§5.1** 仓 = BigQuery | **Phase 1 替换** | 成本红线 + 新增依赖/凭据。而 `logging: CLOUD_LOGGING_ONLY` 已在跑，stdout 免费进 Cloud Logging | Phase 1 用 Cloud Logging，Phase 2 挂 log sink → BigQuery，**代码零改动** |
| **§5.4** 仓插入的 `insertId` 幂等 + `skipInvalidRows`/`ignoreUnknownValues` | **Phase 1 不适用** | 那是 BigQuery streaming insert 的机制。`console.log` 没有这些概念 | `event_id` 字段照样生成（Phase 2 直接当 insertId 用）；Phase 1 的去重靠 `event_id` 在查询侧 `DISTINCT` |
| **§6.2** 分端曝光/游玩口径、`billing_unit`（card vs screenful）、"两者相加是布局的函数" | **无直接对应物** | 没有信息流、没有游戏 | **思想适用，形态换成**：`message` vs `stream` 的"成功"是两种物理事件，不可比不可相加（§7.5）；以及 MCP 转调的双计（§7.2） |
| **§7.3** 双 sink 日对账（15% 容差、量 < 50 跳过） | **降级 Phase 2，且被更重要的对账替代** | Cloud Logging sink 是 `console.log`，"活着但丢行"的形态几乎不存在，边际价值低 | **Phase 0 先做财务三件套对账**（Invocation ↔ DEBIT ↔ CreditBalance，§8.3）——那是钱，比事件一致性重要一个量级 |
| **§7.4** per-event 量级回归（14 天健康日中值、跌破 10% 报警） | **T0/T1 不适用** | 今天所有事件的中值都是 0，检测器输出恒为噪音 | 四个关键事件的"7 天有过、48 小时归零"绝对零告警（§8.4）。启用条件：某事件连续 14 天日均 ≥ 50 行 |
| **§7.1** "< 5 次/小时持续 3 小时"的地板值 | **数字不适用** | 那是 21k events/天量级下调的。TakoAPI 今天的正常状态就是接近零，比率型地板会天天误报→被静音→失效 | T0 用"有请求但 6 小时零事件"；达到 T1 后回测重设（§8.1） |
| **§7.6** "先测集中度再谈采样，多数体量下答案是不采"（参照项目 实测最大单事件仅 10.7%） | **结论反转** | 参照项目 的仓是 BigQuery（写便宜）。TakoAPI 的热表是 0.6 GB 的 db-f1-micro，且有三类天生高频低价值的流量：`/api/registry` 默认 `limit=1000` 全量吐目录、徽章每渲染一次写一行、MCP 三个读工具全匿名 | **必须采样**，且 `sample_rate` 入库（§7.7）。采样率 env 化以便事故时调节 |
| **§7.6** BigQuery `maximumBytesBilled` + $50 预算 | **数字与工具都换** | Phase 1 无 BQ；量级差 3–4 个数量级 | 预算 **$5**（仍要 `EXCLUDE_ALL_CREDITS`——新 GCP 项目大概率有赠金，这个坑命中概率高）+ **Postgres 行数/磁盘护栏**（后者才是宕机风险，§8.6） |
| **§8.1** 区域化 consent gate + 客户端 gate + 撤回时清队列 | **Phase 0 不适用** | Phase 0 零客户端代码：不写 cookie、不写客户端存储、无第三方处理器、身份特征不入库、指纹日轮换 | Phase 2 与客户端入口**同一个 PR**落地（§9.4）。**GA4 的既存敞口单独挂账**，不是本方案引入的，本方案也不扩大它 |
| **§8.2** "mobile 刻意不设 consent gate + 四条重估触发器" | **对象换掉** | 没有 mobile | 对应物是 **§9.2 的"零结果查询词"例外通道**——同样是一条"显式、留痕、带重估触发条件"的数据处理例外 |
| **§8.3** GDPR streaming-buffer 日扫（DML 摸不到 90 分钟内的行） | **不适用** | 没有 streaming insert | Phase 1：Cloud Logging append-only **无法按行删** → 这是选它当仓的**已知代价**，缓解是"日志里除 `user_id` 外零身份特征" + 30 天自然过期。Phase 2 上 BQ 后补批量 DML（§9.3） |
| **§9** 三个事故案例（PostHog 断供 / 曝光按拉取计费 / CTR 到达滞后） | **案例本身不适用，机制适用** | 没有 PostHog、没有信息流、没有 banner | 机制的本项目形态：**双计数** → MCP 转调（§7.2）；**同名不同物** → message vs stream（§7.5）；**到达滞后** → 激活漏斗 cohort 成熟度（§7.8）。三个都已经存在于代码里，只是还没人数过 |
| **规模参照表** 的所有阈值 | **全部不可直接抄** | 参照项目 21k events/天，TakoAPI 接近 0，差 3–4 个数量级 | §0.5 的 T0/T1/T2 三档，每个阈值标注所属档位与升级触发条件 |

**一条元规则**：上表里凡标"Phase 2"的，都不是"以后有空再说"，而是**有明确前置条件的排期**
（客户端入口 → consent；BigQuery → log sink；per-event 回归 → 日均 50 行）。
前置条件达成而没做，就是蓝图 §2.4 记录的那种病——**一条没人验证过的防线，比没有防线更危险，
因为它让人停止担心。**

---

## 附录 B：本方案会新增/修改的文件清单

**新建**
- `src/lib/analytics-schema.ts` — 事件 union + `EVENT_EMITTERS` + 热表白名单推导
- `src/lib/analytics.ts` — `trackEvent()` chokepoint + 两个 sink + `clientFp()`
- `src/lib/gateway.ts` — `withGateway()`，三条 `/v1/*` 的共用前置逻辑 + `gateway_call_rejected`
- `src/app/api/cron/retention/route.ts` — `ProductEvent` / `RequestLog` 保留期清理
- `src/app/api/cron/reconcile/route.ts` — 财务三件套对账 + **日志↔`Invocation` 丢失率（④）** + 容量护栏
- `scripts/audit-analytics-events.mjs` — 第四层审计（含敏感命名分词检查）
- `.github/workflows/analytics-audit.yml` — lint + audit
- `docs/monitoring/alert-*.yaml` — 四份告警策略（意图进仓）
- `prisma/migrations/0NN_analytics/` — `ProductEvent` 表（含 `@@index([ts])`）、**手写的
  `ProductEvent_identity_ck` CHECK 约束**（Prisma schema 表达不了，必须走 `migrate` 而非 `db push`，§6.3）、
  `Invocation.source/client`、`RequestLog.ipHash`、以及两个视图
  `v_gateway_calls_canon`（§7.1）与 `v_event_counts`（§7.7）
- **SIGTERM handler**（放 `src/lib/analytics.ts` 或一个 `src/lib/shutdown.ts`）——仓里现在
  **一个都没有**，`flushRequestLogs()` 至今零调用点（§2.1）
- `src/lib/telemetry-client.ts` + `src/app/api/telemetry/event/route.ts` —（Phase 2）

**修改**
- `src/lib/billing.ts` — `MeterInput` 加 `keyLastUsedAt`；`meterInvocation()` 发事件 1、9、22；`checkCreditPreflight()` 发事件 23
- `src/lib/requestLog.ts` — `ip` → `ipHash`；`flushRequestLogs()` 与新的 `flushProductEvents()` 一起挂 SIGTERM
- `src/lib/apikey.ts` — **不改逻辑，只加一条注释钉死现状**：`record` 来自 `findUnique`、那句 `lastUsedAt` 的 update 是 fire-and-forget 且不回写，所以 `record.lastUsedAt` 就是"更新前的旧值"，事件 9 依赖它——**谁把它改成 update 的返回值，谁就悄悄杀死了激活漏斗**（§4.1）
- `src/lib/health.ts` — `probeAgentHealth()` 返回 `{health, latencyMs, httpStatus, errorCode}`；`runHealthChecks()` 的 select 加 `slug` / `healthStatus`；发事件 4
- `src/lib/mcp/tools.ts` — **`getJson()` 与 `invoke_agent` 两处** fetch 注入 `X-Tako-Client`（H1 + H7）
- `src/app/mcp/route.ts` — `initialize` 保存 `clientInfo`；`tools/call` 发事件 11
- `src/app/v1/agents/[slug]/message/route.ts` — 用 `withGateway()`；解析 `taskState`
- `src/app/v1/agents/[slug]/stream/route.ts` — 用 `withGateway()`；流终局发事件 3
- `src/app/v1/chat/completions/route.ts` — 用 `withGateway()`
- `src/app/api/badge/[slug]/route.ts` — `logRequest` → `trackEvent("badge_rendered")`；`findFirst` 的 `select` 加 `slug`（URL 段可能是 cuid，§6.4）
- `src/components/BadgeSnippet.tsx` + `src/app/[locale]/badge/page.tsx` — 徽章外层链接加 `?ref=badge`（**两处都要，全仓只有这两处生成片段**，§5.5）；Phase 2 时 `BadgeSnippet.copy()` 发事件 17
- `src/components/ui/InstallTabs.tsx` —（Phase 2）`CopyButton` 发事件 16，`target` 含 `uninstall`
- `src/app/[locale]/skills/[slug]/page.tsx` —（Phase 2）复制按钮发事件 16（`surface='skill_detail'`）
- `src/app/[locale]/agents/[slug]/page.tsx` — server component 里发事件 14
- `src/app/api/skills/[id]/route.ts` — 发事件 13
- `src/lib/auth.ts` — **新增 `events` 块**（今天只有 `callbacks`），`events.createUser` / `events.signIn` 发事件 5、6
- `src/app/api/auth/register/route.ts` — credentials 注册不走 adapter，`events.createUser` 不会为它触发，这里补发事件 5
- `src/app/api/keys/route.ts` / `[id]/route.ts` — 事件 7、8
- `src/app/api/billing/topup/**` — 事件 20、21
- `prisma/schema.prisma` — `ProductEvent`、`Invocation.source/client`、`RequestLog.ipHash`
- `eslint.config.mjs` — 两条 `no-restricted-syntax`
- `cloudbuild.yaml` — 加遥测开关；`TAKO_ANALYTICS_SALT` 走 `--update-secrets`（文件已是安全版本，无需先"修漂移"——那条断言已被推翻）。**同一份开关必须同时加进人工 `gcloud run deploy`**，因为没有触发器在跑这个文件
- `docs/00-infrastructure.md` — 修掉第 127 行"无 `prisma/migrations/` 目录"的过时说法（实际有 11 个目录含 `0_init`）
- `AGENTS.md` / `CLAUDE.md` — 加长期纪律条目（改 logs-based metric 匹配字符串前先搜 YAML）
