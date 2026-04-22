# 基础设施现状（2026-04-22）

> 本文是 TakoAPI 生产环境的真实状况快照，作为任务 1 / 任务 2 的前置事实依据。

---

## GCP 项目

| 项 | 值 |
|---|---|
| 项目 ID | `takoapi-491505` |
| 项目名 | `TakoAPI` |
| 项目号 | `429522911261` |

## Cloud Run

| 项 | 值 |
|---|---|
| 服务名 | `takoapi` |
| 区域 | `us-central1` |
| 运行 URL | https://takoapi-429522911261.us-central1.run.app |
| 自定义域名 | https://takoapi.com |
| 最近部署 | 2026-04-18 by WangHarp@gmail.com |

### 当前环境变量（来源：Cloud Run 服务 spec）

```
NODE_ENV=production
AUTH_TRUST_HOST=true
DATABASE_URL=postgresql://postgres:***@localhost/takoapi?host=/cloudsql/takoapi-491505:us-central1:takoapi-db
NEXTAUTH_URL=https://takoapi.com
NEXTAUTH_SECRET=***
GOOGLE_CLIENT_ID=429522911261-t3s9v8av3n4saed95u4vkij5oqlfjoti.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=***
APPLE_CLIENT_ID=com.takoapi.auth
APPLE_CLIENT_SECRET=***   # JWT, exp=1790313380 (2026-09-25)
RESEND_API_KEY=***
CRON_SECRET=***
```

### 🚨 安全问题

所有密钥以**明文**存于 Cloud Run env vars。Secret Manager API **未启用**。任何拥有项目 `viewer` 或更高权限的账户都能通过 `gcloud run services describe` 读取明文。

**修复路径**见 [03-secret-hardening.md](03-secret-hardening.md)。

---

## Cloud SQL

| 项 | 值 |
|---|---|
| 实例名 | `takoapi-db` |
| 引擎 | PostgreSQL 15 |
| 区域 | us-central1-c |
| 规格 | db-f1-micro（最小，1 shared CPU, 0.6GB RAM） |
| 公网 IP | `136.111.207.161` |
| 私网 IP | 未配置 |
| 状态 | RUNNABLE |
| 数据库 | `postgres`（默认）、`takoapi`（生产） |

**连接方式**：Cloud Run → Unix socket `/cloudsql/takoapi-491505:us-central1:takoapi-db`。本地调试需起 Cloud SQL Auth Proxy：

```bash
cloud-sql-proxy takoapi-491505:us-central1:takoapi-db --port 5434
```

---

## 生产 DB schema 真实状态

⚠️ **仓库里的 `prisma/schema.prisma` 曾严重滞后于生产**（2026-04-22 已通过 `prisma db pull` 同步）。生产多出 9 张表和多个字段。

备份：`prisma/schema.prisma.pre-pull-bak` 保留了同步前的旧版本。

### 17 个模型清单 + 行数

| Model | 行数 | 代码引用 | 状态说明 |
|---|---:|---|---|
| `User` | 4 | ✅ | 活跃（admin + 少数测试账户） |
| `Account` | 3 | ✅ | OAuth 账户 |
| `Session` | 0 | ✅ | JWT session 策略，不入库（预期） |
| `VerificationToken` | — | ✅ | 邮箱验证，按需写入 |
| `Category` | 30 | ✅ | 活跃 |
| `Skill` | **5,146** | ✅ | 🔥 核心内容表 |
| `Like` | 3 | ✅ | 🟡 引擎已有但用户基本不点赞 |
| `AdminLog` | 0 | ✅ | `logAdminAction()` 有调用点（8 处），但生产尚无后台管理操作触发过 — **不是 bug**（先前误判） |
| `AdCampaign` | 0 | ❌ 无引用 | 🕸️ **孤立表** — 仅 schema 有，代码完全不引用 |
| `AuthorFollow` | 0 | ❌ 无引用 | 🕸️ **孤立表** |
| `BlogPost` | 4 | ❌ 无引用 | ⚠️ **孤立表但有数据** — 4 篇内容来源未知（被移除的旧代码或手工写入） |
| `Bookmark` | 0 | ❌ 无引用 | 🕸️ **孤立表** |
| `KolContact` | **1,042** | ❌ 无引用 | ⚠️ **孤立表但大量数据** — 1042 行 KOL 联系人数据，源头未知；可能是已下线的 scraper/后台工具的遗留 |
| `KolOutreach` | 3 | ❌ 无引用 | ⚠️ 同上，3 条外联记录 |
| `Rating` | 0 | ❌ 无引用 | 🕸️ **孤立表** |
| `SkillEvent` | 1 | ❌ 无引用 | 🕸️ **孤立表** |
| `Subscriber` | 1 | ❌ 无引用 | 🕸️ **孤立表** |

**代码引用判定依据**（2026-04-22 扫描）：
- 在 `src/` 全量 grep: `KolContact|KolOutreach|BlogPost|AdCampaign|AuthorFollow|Bookmark|Rating|SkillEvent|Subscriber` —— 零命中
- 只有 `schema.prisma` 和生成的 migration 中有这些名字
- `git branch -a` 只有 `main`，无其他分支可能含相关代码

### 核心观察

1. **主业务 = Skill 目录聚合**（5146 条）—— 与 README 描述一致
2. **9 张孤立表** = schema 存在但 `src/` 零代码引用。其中 **两张含真实数据**（KolContact 1042 / BlogPost 4），来源未知
3. 孤立表写入源头候选：被移除的旧代码、手工 SQL、Prisma Studio 操作、跨服务共库
4. **处理策略**：保留现状，不删不改，直到搞清数据用途（用户 2026-04-22 决策）

### 索引现状（Skill）

```
(categoryId), (slug), (name), (downloads), (status)
(createdAt DESC)
(featured, likesCount DESC)
(likesCount DESC)
(status, downloads DESC)
(viewsCount DESC)
```

对常见查询已覆盖度不错。仍建议补：`(featured, createdAt DESC)`、`(status, categoryId)` 组合。

---

## 迁移历史（Prisma）

**无 `prisma/migrations/` 目录** —— 历史上全程使用 `prisma db push`（schema 直接同步），无版本化迁移文件。

任务 1 阶段 1A 将建立 baseline（见 [01-architecture-review.md#迁移策略](01-architecture-review.md#迁移策略)）。

---

## 部署链路

```
开发机 → git push origin main
  → GitHub webhook / 手动触发
  → Cloud Build (cloudbuild.yaml)
  → Docker 构建
  → Push 到 Container Registry
  → Cloud Run 部署新 revision
  → 流量切换
```

Cloud SQL 通过 Cloud Run 的 `--add-cloudsql-instances` 连接，走 Unix socket，无公网暴露。

---

## 待澄清事项（保留，不动）

按 2026-04-22 用户决策：**未搞清用途的功能全部保留，不删不改**。以下是需要未来某个时间点再做调研的问题：

1. **KOL 系统 1042 条数据的来源与用途**：是还在用的后台营销工具，还是已弃用？谁是写入方？
2. **Blog 4 篇内容**：是哪个前端在展示？渲染逻辑在哪个仓库/分支？
3. **孤立表数据迁移风险**：如果未来决定启用某个孤立功能（如 Bookmark），现有孤立列或索引是否影响新实现？

**AdminLog 更正**：初步判断"`logAdminAction()` 未被调用"错误。实际代码中 8 处调用点，行数为 0 只是因为生产尚未发生管理员操作。不是 bug。
