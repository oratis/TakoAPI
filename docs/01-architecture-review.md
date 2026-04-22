# 任务 1：架构与数据库优化

> 调研快照：2026-04-22。基于 `prisma/schema.prisma` + `src/app/api/**` + `src/lib/**` 的全量 review。

---

## 调研发现概览

### 🔴 高优先级（正确性 / 安全）

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| 1 | `/skills/submit` 默认 `status="approved"`，绕过审核 | `src/app/api/skills/submit/route.ts` + `prisma/schema.prisma:90` | 任何注册用户可直接发布内容 |
| 2 | 计数器（`likesCount/viewsCount/downloads/stars`）无事务保护 | 各 skill 相关路由 | 删除/并发时计数漂移 |
| 3 | `/skills/search` 无分页 | `src/app/api/skills/search/route.ts` | 全表扫描，5900+ 条一次返回 |
| 4 | `Status` 是 String 而非 Prisma enum | `prisma/schema.prisma:90` | 无约束，脏数据风险 |
| 5 | 无 rate limiting + 无输入长度限制 | 全体公开路由 | DoS / 垃圾内容注入 |
| 6 | `requireAdmin()` 热路径每请求查库 | `src/lib/admin.ts` | 后台每次点击都多一次 DB roundtrip |

### 🟡 中优先级（性能 / 可维护性）

| # | 问题 | 位置 |
|---|---|---|
| 7 | 缺索引：`featured`、`(status, categoryId)` 复合、`updatedAt` | `prisma/schema.prisma` |
| 8 | 全部 ad-hoc 校验，无 Zod；错误响应 shape 不统一 | 各路由 |
| 9 | 无 Tag/Taxonomy：只有 Category 单一归类 | schema |
| 10 | 缺共享中间件：错误处理包装、请求日志、分页工具 | `src/lib/` |
| 11 | `Skill.submitterId` nullable 无 cascade 规则 | `prisma/schema.prisma:100` |

### 🟢 低优先级（架构）

- API 版本化（`/api/v1/*`）
- `readme` Text 字段大内容考虑外存
- 死路由 `/api/agent/route.ts` 职责不清

---

## 执行计划

分 **3 个阶段**，每阶段完成后停下来验收。

---

### 阶段 1A — 紧急修复（破坏性变更 + 安全）

**交付物**：schema 迁移 + 6 个高优路由修复 + 用户 profile 页扩展。

**Schema 变更**（一次迁移 `001_init_and_safety.sql`）：
```prisma
enum SkillStatus {
  PENDING
  APPROVED
  REJECTED
}

model Skill {
  // ...
  status  SkillStatus @default(PENDING)   // was: String @default("approved")
  submitter User? @relation(fields: [submitterId], references: [id], onDelete: SetNull)

  @@index([status, categoryId])
  @@index([featured])
  @@index([updatedAt])
}
```

**路由修复**：
1. `/skills/submit`：默认 `PENDING`；API key 带 admin scope 才能 `APPROVED`。
2. `/skills/search`：加 `page/limit`，默认 limit=24，max=100。
3. Like toggle、view increment、skill 删除全部包 `prisma.$transaction`。
4. 所有公开路由加 rate limiter（方案见下）。
5. Input 统一过 Zod（见阶段 1B）。
6. `requireAdmin()` 优先从 JWT 读 role，fallback DB。

**Rate limiting 方案**：
- 无 Redis：用内存 LRU（`lru-cache`），按 IP+route 限速。适合单实例。
- 有 Redis：用 `@upstash/ratelimit`。
- **先用内存版**，Cloud Run 单实例部署够用；未来多实例再切 Redis。

**新增用户 Profile 扩展**（应对"用户看不到自己的 pending 提交"）：
- `/profile/page.tsx` 增加 **我的提交** tab：
  - 按 `status` 分组显示：`pending` / `approved` / `rejected`
  - 每条显示提交时间、当前状态、审核备注（需加 `Skill.reviewNote String?` 字段）
  - Rejected 条目可点"重新提交"
- 后端：`/api/user/skills/route.ts` 已存在，只需增加 status 分组返回 shape
- Admin 审核界面加"备注"输入框，写入 `Skill.reviewNote`

**验收标准**：
- [ ] 新用户提交 skill → 默认 pending，前端 list 不显示，submitter 在自己 profile 能看到
- [ ] 管理员审核通过 → 用户 profile 状态变 approved
- [ ] 未登录 IP 1 分钟内第 21 次 POST `/skills/submit` 返回 429
- [ ] `/skills/search?q=claude&page=1&limit=10` 正常返回 10 条
- [ ] 查 Postgres `EXPLAIN` 确认 `(status, categoryId)` 索引被用

---

### 阶段 1B — Zod 校验 + 错误 shape 统一

**交付物**：所有公开路由接入 Zod；统一 `ApiError` 结构。

**新增文件**：
```
src/lib/validators/
  skill.ts          # createSkillSchema, updateSkillSchema, searchSkillSchema
  category.ts
  user.ts
  pagination.ts     # paginationSchema (page, limit with bounds)
src/lib/api/
  error.ts          # ApiError class, errorHandler() wrapper
  response.ts       # ok(), paginated(), error() helpers
```

**统一错误响应**：
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [ { "path": ["name"], "message": "Required" } ]
  }
}
```

**路由改造示例**：
```ts
export async function POST(req: Request) {
  return withErrorHandler(async () => {
    const body = createSkillSchema.parse(await req.json());
    // ...
    return ok({ skill });
  });
}
```

**验收标准**：
- [ ] 所有 `/api/**` 路由走统一 `withErrorHandler`
- [ ] 400 响应全部匹配新 shape
- [ ] 前端错误展示兼容（前端可能需小改）

---

### 阶段 1C — Tag/Taxonomy + 性能打磨

**交付物**：加 `Tag` / `SkillTag` 表为任务 2 铺路；请求日志 middleware；基础监控埋点。

**Schema 变更**（迁移 `002_tags.sql`）：
```prisma
model Tag {
  id      String     @id @default(cuid())
  name    String     @unique
  slug    String     @unique
  color   String?
  skills  SkillTag[]
}

model SkillTag {
  skillId String
  tagId   String
  skill   Skill @relation(fields: [skillId], references: [id], onDelete: Cascade)
  tag     Tag   @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([skillId, tagId])
  @@index([tagId])
}
```

**请求日志 middleware**：Next.js 16 原生 middleware，记录 method/path/status/duration 到 stdout（Cloud Run 自动收集）。

**验收标准**：
- [ ] Migration 应用成功，无数据丢失
- [ ] 管理员可在 `/admin/skills/[id]` 给 skill 加标签
- [ ] `/skills?tag=claude-code` 按标签过滤

---

## 迁移策略

**现状**：
- DB: **PostgreSQL**（`DATABASE_URL` 环境变量）
- 无 `prisma/migrations/` 目录 — 此前用 `prisma db push` 同步
- 已存在的 `prisma/dev.db` 是 SQLite 遗留，**已在 .gitignore**，实际不用

**切换计划**：

1. **baseline 当前 schema**：
   ```bash
   # 生产 DB 已经通过 db push 达成当前 schema 的状态
   mkdir -p prisma/migrations/0_init
   npx prisma migrate diff \
     --from-empty \
     --to-schema-datamodel prisma/schema.prisma \
     --script > prisma/migrations/0_init/migration.sql
   npx prisma migrate resolve --applied 0_init
   ```
   这把"当前 schema"记为初始迁移，但不真正执行（告诉 Prisma 它已应用）。

2. **之后每次 schema 变更**：
   ```bash
   npx prisma migrate dev --name <description>
   ```
   本地生成迁移文件 → 提交 git → 生产 `prisma migrate deploy`。

3. **Cloud Run 部署**：在 Dockerfile 启动命令前加 `npx prisma migrate deploy`。

**环境变量需要**：
```
DATABASE_URL="postgresql://user:pass@host:5432/db"
DATABASE_URL_UNPOOLED="postgresql://..."   # 可选，for migrate，避开连接池
```

---

## 风险与回滚

- **阶段 1A 是破坏性变更**：已存在 `status="approved"` 字符串的旧数据迁移时需要 `UPDATE skill SET status='APPROVED' WHERE status='approved'`（Prisma enum 是大写）。迁移脚本需要包含此 `UPDATE`。
- **回滚**：每阶段独立 git commit + 独立迁移文件；回滚用 `prisma migrate resolve --rolled-back` 配合反向 SQL。
- 建议先在开发 DB 全流程跑通，再打生产。
