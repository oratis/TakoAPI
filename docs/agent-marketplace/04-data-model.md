# 04 · 数据模型演进

> 从「Skill 中心」演进到「Agent 中心」。原则：**新增 `Agent` 等模型，不强行复用 `Skill`**（语义不同）；现有表按 2026-04-22「未搞清用途不删」决策**保留**。
> 现状 schema 见 `prisma/schema.prisma`；迁移已 baseline `0_init`。下面是**草案**，落地前据 [02](02-product-spec.md)/[03](03-technical-architecture.md) 细化并跑 `prisma migrate dev`。

---

## 1. 复用 vs 新增

| 现有模型 | 处置 |
|---|---|
| `User` | ✅ 复用，加 `role`（已含 user/admin，扩 `publisher`）、关联 credits/keys |
| `Account` / `Session` / `VerificationToken` | ✅ 原样（NextAuth） |
| `Category` / `Tag` / `SkillTag` | ✅ 复用给 agent 分类/标签（`SkillTag` 旁加 `AgentTag`） |
| `Like` / `Bookmark` / `Rating` | ✅ **激活孤立表**给 agent（加 `agentId`，或新建平行表） |
| `RequestLog` | ✅ **演进为 usage 计量雏形**（见 §3） |
| `SkillStatus`（PENDING/APPROVED/REJECTED）+ admin 审核 + `reviewNote` | ✅ **直接复用**给 agent 审核流 |
| `Skill` + 5,146 条数据 + `AgentType` 枚举 + `src/lib/agents.ts` | 🟡 **保留为 legacy 内容品类**（coding-agent skills），**不**改造成 invokable agent |
| `AdCampaign` / `KolContact` / `KolOutreach` / `BlogPost` / `Subscriber` / `AuthorFollow` | ⬜ 不动（孤立表，保留） |

> ⚠️ 再次强调语义：现有 `Skill.agentType` 描述「装 skill 的 coding agent」；新 `Agent` 是「可调用的服务」。**两者并存，互不覆盖。**

## 2. 新增模型（草案）

```prisma
// ── 发现层 ──────────────────────────────────────────────
enum AgentProtocol { A2A  OPENAI_COMPAT  MCP }
enum AgentStatus   { PENDING  APPROVED  REJECTED  DISABLED }   // 复用 SkillStatus 思路
enum PricingModel  { FREE  PER_CALL  PER_TASK  PER_TOKEN }

model Agent {
  id            String        @id @default(cuid())
  slug          String        @unique
  name          String
  description   String
  publisherId   String                              // → User(role=publisher)
  categoryId    String?
  status        AgentStatus   @default(PENDING)
  reviewNote    String?

  // —— AgentCard 派生（A2A）——
  cardUrl       String?                             // /.well-known/agent-card.json
  endpointUrl   String
  protocols     AgentProtocol[]
  streaming     Boolean       @default(false)
  pushNotify    Boolean       @default(false)
  securitySchemes Json?                             // 上游鉴权方式
  cardSignatureVerified Boolean @default(false)     // A2A v1.0 signed card
  namespaceVerified     Boolean @default(false)     // DNS/GitHub 所有权
  cardFetchedAt DateTime?
  healthStatus  String?                             // ok / degraded / down
  healthCheckedAt DateTime?

  // —— 商业 ——
  pricingModel  PricingModel  @default(FREE)
  unitPriceUsd  Decimal?      @db.Decimal(12, 6)    // 每 call/task/1k token 的价
  byokSupported Boolean       @default(false)
  revShareBps   Int?                                // 给 publisher 的分成(基点)，默认平台策略

  // —— 策展/统计 ——
  featured      Boolean       @default(false)
  likesCount    Int           @default(0)
  callsCount    Int           @default(0)
  avgRating     Float         @default(0)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  publisher     User          @relation(fields: [publisherId], references: [id])
  category      Category?     @relation(fields: [categoryId], references: [id])
  skills        AgentSkillDef[]
  invocations   Invocation[]

  @@index([status, categoryId])
  @@index([featured, callsCount(sort: Desc)])
  @@index([publisherId])
}

model AgentSkillDef {                                // A2A skill —— 发现/搜索/能力匹配
  id          String   @id @default(cuid())
  agentId     String
  skillKey    String                                // AgentCard skill.id
  name        String
  description String?
  inputModes  String[]
  outputModes String[]
  examples    String[]
  agent       Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  @@index([agentId])
}

// ── 鉴权 ────────────────────────────────────────────────
model ApiKey {                                       // 替代 User.apiKey 单字段
  id          String   @id @default(cuid())
  userId      String
  name        String?
  hashedKey   String   @unique                       // SHA-256，不存明文
  prefix      String                                 // 识别用，如 "tako_live_AbC…"
  scopes      String[]
  rateLimit   Int?
  monthlyQuota Int?
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([prefix])
}

// ── 计量 / 可观测（演进 RequestLog）────────────────────────
model Invocation {                                   // 每次 agent 调用一条
  id          String   @id @default(cuid())
  apiKeyId    String?
  userId      String?
  agentId     String
  protocol    AgentProtocol
  status      Int                                    // HTTP/任务状态
  taskState   String?                                // A2A TaskState
  latencyMs   Int?
  unitsBilled Decimal? @db.Decimal(14, 6)            // calls/tasks/tokens
  costUsd     Decimal? @db.Decimal(14, 6)            // 上游成本
  billedUsd   Decimal? @db.Decimal(14, 6)            // 向用户计费
  errorCode   String?
  createdAt   DateTime @default(now())
  agent       Agent    @relation(fields: [agentId], references: [id])
  @@index([agentId, createdAt])
  @@index([apiKeyId, createdAt])
  @@index([userId, createdAt])
}

// ── 商业 / 账本 ─────────────────────────────────────────
enum LedgerType { TOPUP  TOPUP_FEE  DEBIT  PAYOUT  REFUND  ADJUST }

model CreditBalance {
  userId      String   @id
  balanceUsd  Decimal  @default(0) @db.Decimal(14, 6)
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model LedgerEntry {                                   // 不可变流水
  id            String     @id @default(cuid())
  userId        String
  type          LedgerType
  amountUsd     Decimal    @db.Decimal(14, 6)         // +充值/-扣费
  invocationId  String?                               // DEBIT 关联调用
  providerRef     String?                               // 充值/退款
  note          String?
  createdAt     DateTime   @default(now())
  @@index([userId, createdAt])
}

model Payout {                                        // 给 publisher 结算
  id          String   @id @default(cuid())
  publisherId String
  amountUsd   Decimal  @db.Decimal(14, 6)
  periodStart DateTime
  periodEnd   DateTime
  status      String   @default("pending")            // pending/paid/failed
  providerRef   String?
  createdAt   DateTime @default(now())
  @@index([publisherId, status])
}
```

> 说明：`Decimal` 用于钱与用量（避免浮点误差）；`String[]`/`Json` 是 Postgres 原生支持。`Invocation` 与 `LedgerEntry` 是高写入表，注意索引与分区/归档（量大后考虑按月分区或冷热分离）。

## 3. `RequestLog` → `Invocation` 的关系

- `RequestLog`（现有，记所有 HTTP 请求）**保留**做通用请求日志。
- `Invocation`（新）专记**计费相关的 agent 调用**——是 `RequestLog` 的「商业子集」，字段更丰富（成本/计费/taskState）。
- 计量写路径（[03 §5](03-technical-architecture.md)）：网关每次调用 append 一条 `Invocation`（便宜），**异步聚合**到 `LedgerEntry`（DEBIT）+ 扣 `CreditBalance`。

## 4. 迁移策略

1. 沿用现有 Prisma 迁移流（已 baseline `0_init`）：每次 `prisma migrate dev --name <desc>` 生成文件入库，生产 `prisma migrate deploy`（[docs/01 §迁移策略](../01-architecture-review.md)）。
2. **分阶段加表**，对齐 [05-roadmap.md](05-roadmap.md)：Phase 1 加 `Agent`/`AgentSkillDef`/`AgentTag`；Phase 2 加 `ApiKey`/`Invocation`；Phase 3 加 `CreditBalance`/`LedgerEntry`；Phase 4 加 `Payout` + publisher 字段。
3. **基础设施前置**：加 `Invocation` 等高写表前，**先升配 Cloud SQL + 接 PgBouncer**（[03 §9.2](03-technical-architecture.md)）——当前 db-f1-micro 扛不住。
4. **零破坏**：新表与现有 `Skill` 业务无外键耦合，可安全并存上线。`User.apiKey` 单字段在 `ApiKey` 表上线并迁移后再废弃。

## 5. 索引要点

- `Agent`：`(status, categoryId)`、`(featured, callsCount desc)`、`(publisherId)`。
- `Invocation`：`(agentId, createdAt)`、`(apiKeyId, createdAt)`、`(userId, createdAt)`——计费聚合与看板的高频查询。
- `LedgerEntry`：`(userId, createdAt)`。
- `ApiKey`：`(prefix)` 用于快速查找校验。
