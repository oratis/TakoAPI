# 03 · 技术架构

> 落地基线：复用现有 **Next.js 16 + Prisma + Cloud Run + Cloud SQL**。来源均附链接。
> ⚠️ **实现前必读** `node_modules/next/dist/docs/`（本仓库 Next.js 16 有 breaking changes）。

---

## 1. 系统架构（文字图）

```
   Client / SDK / OpenAI-SDK
            │  (API key)
            ▼
┌──────────────────────────────────────────────┐
│  Gateway（Cloud Run, Next.js route handlers）   │
│  ┌──────────┬───────────┬──────────┬────────┐ │
│  │ Auth/Key │ RateLimit │  Router  │ Meter  │ │
│  │ (hash)   │ (Redis)   │ +resil.  │(log→agg)│ │
│  └──────────┴───────────┴──────────┴────────┘ │
│       │ 协议适配：A2A client / OpenAI shim / MCP │
└───────┼──────────────────────────────────────┘
        ▼ (JSON-RPC / SSE / HTTP)            ┌─ 旁路 ─────────────────┐
   上游第三方 agents                          │ Postgres(经 PgBouncer)  │
   (A2A servers / OpenAI-compat / MCP)        │ Upstash Redis           │
                                              │ Stripe（credits/账单）   │
                                              │ 可观测(OTel/Langfuse)    │
                                              └────────────────────────┘
```

## 2. 协议适配层

- **A2A client**：解析 AgentCard（`/.well-known/agent-card.json`，兼容旧 `agent.json`）、发 JSON-RPC `message/send`、消费 SSE、按 TaskState 跟踪、处理 push webhook。
- **OpenAI 兼容适配**：把 `/v1/chat/completions` 请求映射到选定 agent，再把 agent 输出包成 OpenAI 响应 shape。**最低摩擦入口**。
- **MCP client**（后置）：聚合/转发 MCP 工具。

## 3. 鉴权与 API Key

- **存哈希不存明文**：创建时**只显示一次**完整 key，库里存 **SHA-256 哈希 + 可见前缀**（前缀用于识别/查找）。每请求用快哈希校验（bcrypt/argon2 太慢，仅用于用户密码）。
  ⚠️ 哈希算法选择是行业惯例，非单一权威来源。网关鉴权模式参考：[DEV: Production-Ready API Gateway](https://dev.to/tim_derzhavets/building-a-production-ready-api-gateway-from-token-bucket-rate-limiting-to-jwt-validation-27l4)
- per-key：tenant scope、quota、速率、`lastUsedAt`。
- **升级路径**：现有 `User.apiKey` 单字段 → 独立 `ApiKey` 表（见 [04](04-data-model.md)）。

## 4. 限流与配额

- **算法 token bucket**，网关集中执行。来源：[Redis rate-limiter](https://redis.io/docs/latest/develop/use-cases/rate-limiter/)
- **必须用 Redis（Upstash），不能用进程内内存**：Cloud Run 默认 autoscale 到 **多实例**，进程内计数会被绕过（打不同实例）。用 Redis 集中状态 + **Lua 脚本原子**「检查-补充-消费」，key 形如 `rl:{tenantId}:{endpoint}:{rule}` + **TTL**（空闲租户自动释放）。
  来源：[Multi-Tenant Rate Limiting（2026-02）](https://medium.com/@khalilsayed/system-design-multi-tenant-rate-limiting-service-32c63ade5ec7)

## 5. 计量（计费的写路径）

- **log → aggregate** 范式：每请求 append **一条 usage event**（便宜的写），**异步聚合**用于计费。
- 选型：**OpenMeter**（开源 Apache-2.0、自托管、原生 LLM-token 计量、内置 Stripe 开票）或 Stripe-native usage billing（Stripe 现把新用量计费导向 **Metronome**，旧 Billing Meters 进入维护）。
  来源：[openmeter.io](https://openmeter.io/)、[Stripe recording-usage](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage)
- **演进现有 `RequestLog`**：它已经在记 path/method/status/duration——是 usage event 的雏形，扩字段即可（见 [04](04-data-model.md)）。

## 6. 计费

- **Stripe + 预付 credits + 充值费**（OpenRouter 验证过的模型，见 [01](01-landscape-and-standards.md)）。先**不做** postpaid 发票。
- 余额账本：充值 → 调用扣减 → publisher 分成 → 结算（数据模型见 [04](04-data-model.md)）。

## 7. 弹性（对付不稳定的上游 agent）

- **断路器**（最重要）：按错误率/慢响应跳闸，自动剔除失活上游，冷却后恢复。
- **有界重试 + 指数退避 + jitter**（仅幂等操作）。
- **超时**调到略高于 p95。
- **fallback 链**：跨 provider/agent 兜底。
  来源：[Portkey: retries/fallbacks/circuit breakers](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/)

## 8. 流式（SSE）

- Cloud Run **支持 HTTP 流式 / SSE / gRPC server-streaming**。来源：[Cloud Run streaming](https://cloud.google.com/blog/products/serverless/cloud-run-now-supports-http-grpc-server-streaming)
- ⚠️ **坑**：有报告称 **Global HTTPS LB + serverless NEG** 后面 SSE 被节流，直连 Cloud Run URL 正常——流式代理要评估这一点。来源：[Google Dev 论坛](https://discuss.google.dev/t/cloud-run-serverless-neg-behind-global-https-lb-sse-streaming-connections-throttled-vs-direct-cloud-run-url/361659)

## 9. GCP 落地的两个硬约束（必须 day-1 规划）

### 9.1 Cloud Run 请求超时 60 分钟硬顶

- 默认 **5 分钟**，最大 **60 分钟（3600s）**。超时返回 **504**，但容器**不被杀**。
  来源：[Cloud Run request-timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout)
- **含义**：超过 ~60 分钟的长 agent 任务**不能是单个同步请求** → 走 **async job + `taskId` 轮询/webhook**（正好对应 A2A 的 push notification）。

### 9.2 Cloud SQL 连接数（#1 扩展性翻车点）

- Cloud Run 多实例各开 DB 连接；Postgres 连接数受实例规格限制，**每连接 ~5–10MB RAM**。
- **必须上连接池**：**PgBouncer** 或 **Cloud SQL Auth Proxy** 夹在 Cloud Run 与 Cloud SQL 之间。
  来源：[PgBouncer for Cloud SQL（2026-02）](https://oneuptime.com/blog/post/2026-02-17-how-to-set-up-pgbouncer-connection-pooling-for-cloud-sql-postgresql/view)、[Cloud SQL manage-connections](https://docs.cloud.google.com/sql/docs/postgres/manage-connections)
- ⚠️ **现状**：生产是 **db-f1-micro（1 shared CPU / 0.6GB）**（见 [docs/00-infrastructure.md](../00-infrastructure.md)）——做网关**必须升配** + 接 PgBouncer。

## 10. 可观测

- 采纳 **OpenTelemetry GenAI semantic conventions**（仍 experimental，但已是方向）——统一 LLM/agent span、token、cost。
- 部署：自托管 **Langfuse**（OTel-native）或用 **Helicone** 式代理日志（cost/latency/token）。
  来源：[Langfuse OTel](https://langfuse.com/integrations/native/opentelemetry)

## 11. 信任与安全（OWASP LLM Top 10，2025）

- **Prompt Injection 是 #1**；市集相关新增项：Excessive Agency、System Prompt Leakage、Unbounded Consumption。
- 控制：**把上游 agent 响应当作不可信**（二阶注入）；least-privilege 工具权限 + 命令 allowlist + 敏感模式（`*.env`/`*.key`/`*.pem`）拦截；短时令牌 + 审批绑定具体参数；高危操作 **human-in-the-loop**；**日志默认脱敏**（redact secrets/PII）；租户隔离。
  来源：[OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)、[OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)

## 12. 与现有架构的衔接

- **网关用 Next.js 16 route handlers 起步够用**（复用 `src/lib/api.ts` 错误约定、`ratelimit.ts`、`pagination.ts`、`requestLog.ts`）。
- **规模化再考虑拆独立服务**：高并发流式代理 + 长连接对 serverless 有压力；若流量起来，把 gateway 数据面拆成独立 Cloud Run 服务（甚至非 Next.js）。
- CI/CD 复用现有 `cloudbuild.yaml` → Cloud Build → Cloud Run；在 Dockerfile 启动前加 `prisma migrate deploy`。

## 13. 「先建 / 后置」一览（精益团队）

| 先建（v1） | 后置（v2+ / 观察） |
|---|---|
| API key（哈希）+ 鉴权 | postpaid / 企业发票、复杂多 metric 定价（Orb/Metronome） |
| A2A 透传代理（同步 + SSE） | BYOK toll |
| Redis 限流 + log→agg 计量 | 智能路由（price/latency/success） |
| OpenAI 兼容 shim | 异步长任务（>60min, task+webhook） |
| Stripe + prepaid credits + 充值费 | MCP 工具聚合 |
| PgBouncer + 升配 Cloud SQL + Upstash | agentic payments（x402/AP2/ACP）——**仅观察** |
| 日志脱敏 + 基础 OTel/Langfuse | 沙箱化运行不可信 agent、内容审核、publisher 强验证 |
