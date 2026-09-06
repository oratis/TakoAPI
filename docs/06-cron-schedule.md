# Cron 调度 — 权威清单与幂等建置

> 所有自动摄取与维护端点都靠 **Cloud Scheduler** 触发，调度配置本身不在代码库里
> （无 `vercel.json`）。本文件是它们的**唯一权威来源**：频率、参数、鉴权，以及可复现的
> `gcloud` 建置命令。改调度请改这里并同步执行。
> 关联：`docs/05-automation-ingestion-review.md` §7、`docs/08-tech-review-2026-09-05.md` §2.9。

## 端点一览

| Job | 端点 | 建议频率 | 参数 | 落库策略 |
|-----|------|----------|------|----------|
| `tako-scrape-agents` | `GET /api/cron/scrape-agents` | 每日 04:00 UTC | `?pages=1&minStars=200&max=2000` | PROJECT 直接 APPROVED；admin REJECT/DISABLE 的 slug 会被跳过 |
| `tako-import-hosted` | `GET /api/cron/import-hosted` | 每日 04:30 UTC | `?max=0`（不限） | HOSTED 落 PENDING，待 `/admin/agents` 审核；跨域变更也降级 PENDING |
| `tako-check-github` | `GET /api/cron/check-github` | 每周一 05:00 UTC | —— | 探测 skill 的 GitHub 链接是否 404，写 `ghStatus`/`ghCheckedAt` |
| `tako-health` | `GET /api/cron/health` | 每 6 小时 | —— | 更新 `healthStatus`/`healthCheckedAt`，状态**翻转**时追加 `AgentHealthCheck` |
| `tako-weekly-digest` | `GET /api/cron/weekly-digest` | 每周一 09:00 UTC | —— | 给已验证订阅者发周报 |
| `tako-retention` | `GET /api/cron/retention` | 每日 02:00 UTC | —— | 删除 90 天前的 `RequestLog`（分批，单次上限 10 万行） |
| `tako-ingestion-health` | `GET /api/cron/ingestion-health` | 每 6 小时 | —— | **只读**。按来源报告目录新鲜度，超过 72 小时无新增即 `stale: true` |
| `takoapi-daily-sync` | Cloud Run **Job**（非 HTTP 端点） | 每日 03:00 UTC | —— | 从 clawskills.sh 增量同步 skills；见 `scripts/deploy-sync-job.sh` |

所有 HTTP 端点鉴权：`Authorization: Bearer <CRON_SECRET>`（见 `src/lib/cron-auth.ts`）。
**只接受请求头**——`?key=` 形式已移除（Cloud Run 请求日志会记录完整 URL 含查询串，保留 30 天，
等于把密钥抄进一份 `logging.viewer` 就能读的日志）。`CRON_SECRET` 未配置时端点 fail-closed 返回 401。

响应含 `durationMs` + `ranAt`；摄取类端点另外向 stdout 打一行
`{"event":"ingestion_run", …}` 结构化日志（`src/lib/ingestion-log.ts`），供告警使用。

## 建置（幂等 create-or-update）

```bash
set -euo pipefail
PROJECT=takoapi-491505
REGION=us-central1
LOCATION=us-central1                        # Cloud Scheduler location
BASE=https://takoapi.com                    # 或 run URL

SECRET=$(gcloud secrets versions access latest --secret=tako-cron-secret --project="$PROJECT")

upsert_job () {
  local name="$1" schedule="$2" uri="$3"
  local verb=create
  gcloud scheduler jobs describe "$name" --location="$LOCATION" --project="$PROJECT" >/dev/null 2>&1 && verb=update
  gcloud scheduler jobs "$verb" http "$name" \
    --location="$LOCATION" --project="$PROJECT" \
    --schedule="$schedule" --time-zone="Etc/UTC" \
    --uri="$uri" --http-method=GET \
    --headers="Authorization=Bearer ${SECRET}" \
    --attempt-deadline=320s \
    --max-retry-attempts=1
}

upsert_job tako-scrape-agents    "0 4 * * *"   "${BASE}/api/cron/scrape-agents?pages=1&minStars=200&max=2000"
upsert_job tako-import-hosted    "30 4 * * *"  "${BASE}/api/cron/import-hosted?max=0"
upsert_job tako-check-github     "0 5 * * 1"   "${BASE}/api/cron/check-github"
upsert_job tako-health           "0 */6 * * *" "${BASE}/api/cron/health"
upsert_job tako-weekly-digest    "0 9 * * 1"   "${BASE}/api/cron/weekly-digest"
upsert_job tako-retention        "0 2 * * *"   "${BASE}/api/cron/retention"
upsert_job tako-ingestion-health "15 */6 * * *" "${BASE}/api/cron/ingestion-health"
```

> `--attempt-deadline=320s` 略高于 scrape-agents 的 `maxDuration=300`，以免 Scheduler 先于端点超时。
> **Cloud Run 服务的 request timeout 必须 ≥ 320s**（否则那才是真正的截断点）；核对：
> `gcloud run services describe takoapi --region us-central1 --project=takoapi-491505 --format='value(spec.template.spec.timeoutSeconds)'`。

## 必须配的告警（否则等于没做）

摄取管道曾经**静默停摆两个月**：`takoapi-daily-sync` 每天 03:00 正常触发、正常退出 0，
但 clawskills.sh 改版后选择器失配，一条都没导入。目录里最新的 skill 停在 2026-07-04，
而没有任何信号提示。现在 job 在"跑了但一条没找到"时会以非 0 退出，
但**只有配了告警才有人知道**。建议在 Cloud Monitoring 建三条：

| 告警 | 条件 | 为什么 |
|---|---|---|
| 摄取任务失败 | Cloud Scheduler / Cloud Run Job 执行失败 ≥ 1 次 | 抓取失配、鉴权过期 |
| 目录停滞 | `/api/cron/ingestion-health` 返回体里任一来源 `stale: true` | 唯一能抓住"成功但没产出"的信号 |
| 网关 5xx 率 | `jsonPayload.event="gateway_call_rejected"` 或 5xx 超阈值 | 上游批量失效 |

## 运维

```bash
gcloud scheduler jobs list --location=us-central1 --project=takoapi-491505
gcloud scheduler jobs run tako-ingestion-health --location=us-central1 --project=takoapi-491505
gcloud scheduler jobs pause  tako-scrape-agents --location=us-central1 --project=takoapi-491505
gcloud scheduler jobs resume tako-scrape-agents --location=us-central1 --project=takoapi-491505
```

## 密钥到期日历（人工提醒，没有代码会替你做）

| 密钥 | 到期 / 轮换周期 | 到期后的症状 |
|---|---|---|
| `APPLE_CLIENT_SECRET` | **2026-09-25**（JWT，Apple 上限 6 个月） | Apple 登录静默失败，无报错页 |
| `tako-github-token` | GitHub PAT，按创建时设定 | 抓取返回 401；`scrape-agents` 现在会抛错而非静默返回空 |
| `CRON_SECRET` | 建议每 6 个月 | 轮换后必须重跑上面的 `upsert_job`（header 里带的是明文值） |
| Cloud SQL 密码 | 见 `docs/08-tech-review-2026-09-05.md` §1.1 —— **待轮换** | —— |

## 安全备注

- header 里带的是明文 bearer secret；`gcloud scheduler jobs describe` 可见，权限同项目其他密钥。
  若日后启用 OIDC（service account），可改用 `--oidc-service-account-email` 并把 `cron-auth.ts` 换成校验 OIDC token。
- **别把 `SECRET` 硬编码进本文件或提交历史**；上面的命令从 Secret Manager 现取。
- 仓库根有 `npm run check:secrets`（CI 也跑），会在任何被追踪文件里出现凭据形态的值时让构建失败。
