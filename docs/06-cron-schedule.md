# Cron 调度 — 权威清单与幂等建置

调度定义在 `scripts/configure-catalog-schedules.py`，生产实例由 Google Cloud Scheduler 运行。下表时间均为 UTC。

## 端点一览

| Job | 端点 | 建议频率 | 参数 | 落库策略 |
|-----|------|----------|------|----------|
| `takoapi-scrape-agents` | `GET /api/cron/scrape-agents` | 每日 06:00 UTC | `?pages=1&minStars=200&max=2000` | PROJECT 直接 APPROVED；admin REJECT/DISABLE 的 slug 会被跳过 |
| `takoapi-import-hosted` | `GET /api/cron/import-hosted` | 每日 07:00 UTC | `?max=0`（不限） | HOSTED 落 PENDING，待 `/admin/agents` 审核；跨域变更也降级 PENDING |
| `takoapi-github-check` | `POST /api/cron/check-github` | 每周日 02:00 UTC | —— | 探测 skill 的 GitHub 链接是否 404，写 `ghStatus`/`ghCheckedAt` |
| `takoapi-health` | `GET /api/cron/health` | 每小时 | —— | 更新 `healthStatus`/`healthCheckedAt`，状态**翻转**时追加 `AgentHealthCheck` |
| `takoapi-weekly-digest` | `POST /api/cron/weekly-digest` | 每周一 09:00 UTC | —— | 给已验证订阅者发周报 |
| `takoapi-retention` | `POST /api/cron/retention` | 每日 02:30 UTC | —— | 删除 90 天前的 `RequestLog`（分批，单次上限 10 万行） |
| `takoapi-ingestion-health` | `GET /api/cron/ingestion-health` | 每 6 小时 | —— | **只读**。按来源报告目录新鲜度，超过 72 小时无新增即 `stale: true` |
| `takoapi-github-skills` | Cloud Run Job | 每日 05:00 UTC | 每类最多 50 个仓库 | GitHub 元数据，保留现有审核状态 |
| `takoapi-daily-sync` | Cloud Run **Job**（非 HTTP 端点） | 每日 03:00 UTC | —— | 从 clawskills.sh 增量同步 skills；见 `scripts/deploy-sync-job.sh` |

所有 HTTP 端点鉴权：`Authorization: Bearer <CRON_SECRET>`（见 `src/lib/cron-auth.ts`）。
**只接受请求头**——`?key=` 形式已移除（Cloud Run 请求日志会记录完整 URL 含查询串，保留 30 天，
等于把密钥抄进一份 `logging.viewer` 就能读的日志）。`CRON_SECRET` 未配置时端点 fail-closed 返回 401。

响应含 `durationMs` + `ranAt`；摄取类端点另外向 stdout 打一行
`{"event":"ingestion_run", …}` 结构化日志（`src/lib/ingestion-log.ts`），供告警使用。

## 云端建置与复核

从已验证的主分支运行 `bash scripts/deploy-sync-job.sh`。脚本构建同一个固定版本的镜像，将 ClawSkills 同步和 GitHub Skills 采集分别部署为 Cloud Run Job，然后根据 `scripts/configure-catalog-schedules.py` 更新 Cloud Scheduler。仅恢复调度时运行 `python3 scripts/configure-catalog-schedules.py`。下一次调度不依赖本地电脑。

GitHub Skills 每天 05:00 UTC 运行。两个采集作业仅从 Secret Manager 获取运行时数据库配置。GitHub Skills 使用项目的 GitHub 凭据，按来源和标识更新元数据。显示名称允许重复。Hosted Agent 由社区注册表发现后进入既有审核流程。执行记录与新增数可在 Cloud Run Jobs 和 Cloud Logging 查看。

## 告警与恢复

Cloud Monitoring 的 `TakoAPI catalog ingestion and freshness` 策略读取日志指标 `takoapi_catalog_ingestion_errors`，在 Cloud Console 生成事件。它监测调度失败、采集任务错误和超过 72 小时无新增的来源。没有新增时，先比对上游候选量、成功刷新的数量和待审数。现有站点 5xx 与 uptime 策略继续独立运行。

Cloud SQL 每天 01:00 UTC 开始备份，保留最近七份。应用和采集使用 Secret Manager 的 `tako-runtime-database-url`。管理员连接用于单独的手动迁移作业。该作业默认执行 `prisma validate`。需要应用迁移时，确认备份及目标镜像内的具体 SQL 文件，再为该次执行指定 `db,execute,--schema=prisma/schema.prisma,--file=prisma/migrations/<migration>/migration.sql`。生产的迁移历史经过手动基线处理，部署前应核对实际的表、列和索引。

## 运维

```bash
gcloud scheduler jobs list --location=us-central1 --project=takoapi-491505
gcloud scheduler jobs run takoapi-ingestion-health --location=us-central1 --project=takoapi-491505
gcloud scheduler jobs pause  takoapi-scrape-agents --location=us-central1 --project=takoapi-491505
gcloud scheduler jobs resume takoapi-scrape-agents --location=us-central1 --project=takoapi-491505
```

## 密钥到期日历（人工提醒，没有代码会替你做）

| 密钥 | 到期 / 轮换周期 | 到期后的症状 |
|---|---|---|
| `APPLE_CLIENT_SECRET` | **2027-05-06 北京时间**（2026-11-12 已续签，提前 30 天复核） | Apple 登录静默失败，无报错页 |
| `tako-github-token` | GitHub PAT，按创建时设定 | 抓取返回 401；`scrape-agents` 现在会抛错而非静默返回空 |
| `CRON_SECRET` | 建议每 6 个月 | 轮换后必须运行 `python3 scripts/configure-catalog-schedules.py`（header 里带的是明文值） |
| Cloud SQL 密码 | 应用与采集作业使用独立运行时角色。迁移使用单独的管理员凭据 | —— |

## 安全备注

- header 里带的是明文 bearer secret；`gcloud scheduler jobs describe` 可见，权限同项目其他密钥。
  若日后启用 OIDC（service account），可改用 `--oidc-service-account-email` 并把 `cron-auth.ts` 换成校验 OIDC token。
- **别把 `SECRET` 硬编码进本文件或提交历史**；上面的命令从 Secret Manager 现取。
- 仓库根有 `npm run check:secrets`（CI 也跑），会在任何被追踪文件里出现凭据形态的值时让构建失败。
