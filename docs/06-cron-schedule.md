# Cron 调度 — 权威清单与幂等建置

> 三个自动摄取端点全靠 **Cloud Scheduler** 触发,但调度配置此前不在代码库里
> (无 `vercel.json`,`cloudbuild.yaml` 是 stale 模板)。本文件是它们的**唯一权威来源**:
> 频率、参数、鉴权,以及可复现的 `gcloud` 建置命令。改调度请改这里并同步执行。
> 关联:`docs/05-automation-ingestion-review.md` §7。

## 端点一览

| Job | 端点 | 建议频率 | 参数 | 落库策略 |
|-----|------|----------|------|----------|
| `tako-scrape-agents` | `GET /api/cron/scrape-agents` | 每日 04:00 UTC | `?pages=1&minStars=200&max=2000` | PROJECT 直接 APPROVED;admin REJECT/DISABLE 的 slug 会被跳过 |
| `tako-import-hosted` | `GET /api/cron/import-hosted` | 每日 04:30 UTC | `?max=0`(不限) | HOSTED 落 PENDING,待 `/admin/agents` 审核;跨域变更也降级 PENDING |
| `tako-health` | `GET /api/cron/health` | 每 6 小时 | —— | 更新 `healthStatus`/`healthCheckedAt` |

所有端点鉴权:`Authorization: Bearer <CRON_SECRET>`(见 `src/lib/cron-auth.ts`;
`CRON_SECRET` 未配置时端点 fail-closed 返回 401)。响应含 `durationMs` + `ranAt`,
调度日志据此判断是否接近超时 / 被截断。

## 建置(幂等 create-or-update)

```bash
set -euo pipefail
PROJECT=takoapi-491505
REGION=us-central1
LOCATION=us-central1                       # Cloud Scheduler location
BASE=https://takoapi.com                    # 或 run URL: https://takoapi-429522911261.us-central1.run.app

# CRON_SECRET 来源(二选一,取决于是否启用 Secret Manager — 见 docs/00-infrastructure.md):
#   a) Secret Manager:
SECRET=$(gcloud secrets versions access latest --secret=tako-cron-secret --project="$PROJECT")
#   b) 若 Secret Manager 未启用,从 Cloud Run 服务 env 读取当前值:
# SECRET=$(gcloud run services describe takoapi --region "$REGION" --project="$PROJECT" \
#   --format='value(spec.template.spec.containers[0].env)' | tr ',' '\n' | grep -A1 CRON_SECRET | tail -1)

# 幂等 upsert:create 失败(已存在)即改 update。
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

upsert_job tako-scrape-agents "0 4 * * *"   "${BASE}/api/cron/scrape-agents?pages=1&minStars=200&max=2000"
upsert_job tako-import-hosted "30 4 * * *"  "${BASE}/api/cron/import-hosted?max=0"
upsert_job tako-health        "0 */6 * * *" "${BASE}/api/cron/health"
```

> `--attempt-deadline=320s` 略高于 scrape-agents 的 `maxDuration=300`,以免 Scheduler 先于端点超时。
> **Cloud Run 服务的 request timeout 必须 ≥ 320s**(否则那才是真正的截断点);核对:
> `gcloud run services describe takoapi --region us-central1 --project=takoapi-491505 --format='value(spec.template.spec.timeoutSeconds)'`。

## 运维

```bash
# 列出 / 查看
gcloud scheduler jobs list --location=us-central1 --project=takoapi-491505
# 手动触发一次(冒烟)
gcloud scheduler jobs run tako-health --location=us-central1 --project=takoapi-491505
# 轮换 CRON_SECRET 后,重跑上面的 upsert_job 即可刷新 header
# 暂停 / 恢复
gcloud scheduler jobs pause  tako-scrape-agents --location=us-central1 --project=takoapi-491505
gcloud scheduler jobs resume tako-scrape-agents --location=us-central1 --project=takoapi-491505
```

## 安全备注

- header 里带的是明文 bearer secret;`gcloud scheduler jobs describe` 可见,权限同项目其他密钥。
  若日后启用 OIDC(service account),可改用 `--oidc-service-account-email` 并把 `cron-auth.ts` 换成校验 OIDC token。
- **别把 `SECRET` 硬编码进本文件或提交历史**;上面的命令都从 Secret Manager / 运行时 env 现取。
