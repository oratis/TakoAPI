# 任务 0：密钥加固（优先级：最高）

> 先于任务 1 执行。当前所有生产密钥以明文存在 Cloud Run env vars 中，需要迁移到 Secret Manager。

---

## 现状回顾

Cloud Run 服务 `takoapi` 的 env vars 明文包含：

| 变量 | 敏感级别 | 处理方式 |
|---|---|---|
| `DATABASE_URL` | 🔴 最高 | 迁移到 Secret Manager |
| `NEXTAUTH_SECRET` | 🔴 最高（JWT 签名） | 迁移到 Secret Manager |
| `GOOGLE_CLIENT_SECRET` | 🔴 高 | 迁移到 Secret Manager |
| `APPLE_CLIENT_SECRET` | 🔴 高（JWT, 2026-09-25 到期） | 迁移到 Secret Manager |
| `RESEND_API_KEY` | 🟠 中 | 迁移到 Secret Manager |
| `CRON_SECRET` | 🟠 中 | 迁移到 Secret Manager |
| `GOOGLE_CLIENT_ID` | 🟢 公开 | 保留为 env var |
| `APPLE_CLIENT_ID` | 🟢 公开 | 保留为 env var |
| `NEXTAUTH_URL` | 🟢 公开 | 保留为 env var |
| `NODE_ENV`, `AUTH_TRUST_HOST` | 🟢 公开 | 保留为 env var |

---

## 加固步骤

### 步骤 1 — 启用 Secret Manager API ✅

```bash
gcloud services enable secretmanager.googleapis.com --project=takoapi-491505
```

**状态**：已于 2026-04-22 完成。

### 步骤 2 — 创建 Secret（使用当前值，不 rotate）

对每个敏感 env var：

```bash
printf '%s' "<current value>" | \
  gcloud secrets create <SECRET_NAME> \
  --data-file=- \
  --project=takoapi-491505 \
  --replication-policy=automatic
```

建议命名：`tako-database-url`、`tako-nextauth-secret`、`tako-google-client-secret`、`tako-apple-client-secret`、`tako-resend-api-key`、`tako-cron-secret`。

**不 rotate 的理由**：
- `NEXTAUTH_SECRET` 一旦改变，所有现有 JWT 失效，全体用户被登出
- `GOOGLE_CLIENT_SECRET` 需要在 Google Cloud Console 重新配置
- 迁移到 Secret Manager 本身就降低了暴露面；rotate 是第二步，可以择机做

### 步骤 3 — 授权 Cloud Run 服务账户读取

Cloud Run 使用默认 SA `429522911261-compute@developer.gserviceaccount.com`。

```bash
for secret in tako-database-url tako-nextauth-secret tako-google-client-secret \
              tako-apple-client-secret tako-resend-api-key tako-cron-secret; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:429522911261-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=takoapi-491505
done
```

### 步骤 4 — 部署新 Cloud Run revision 使用 Secret 引用

⚠️ **这一步会生成新 revision**。新 revision 行为与旧完全一致（值相同，只是引用方式变了）；若新 revision 启动失败，Cloud Run 自动保留旧 revision 接流量。

```bash
gcloud run services update takoapi \
  --region=us-central1 \
  --project=takoapi-491505 \
  --remove-env-vars=DATABASE_URL,NEXTAUTH_SECRET,GOOGLE_CLIENT_SECRET,APPLE_CLIENT_SECRET,RESEND_API_KEY,CRON_SECRET \
  --set-secrets=DATABASE_URL=tako-database-url:latest,\
NEXTAUTH_SECRET=tako-nextauth-secret:latest,\
GOOGLE_CLIENT_SECRET=tako-google-client-secret:latest,\
APPLE_CLIENT_SECRET=tako-apple-client-secret:latest,\
RESEND_API_KEY=tako-resend-api-key:latest,\
CRON_SECRET=tako-cron-secret:latest
```

部署后验证：
- `gcloud run services describe takoapi --region=us-central1 --format="value(spec.template.spec.containers[0].env)"` 应不再含明文
- 访问 https://takoapi.com 确认应用正常启动、登录功能正常

---

## 步骤 5 — 密钥轮换（独立于上述，可择机进行）

迁移到 Secret Manager 后，建议依次 rotate：

| 密钥 | rotate 方法 | 用户影响 |
|---|---|---|
| `DATABASE_URL` 中的密码 | Cloud SQL 改密 → Secret 新版本 → Cloud Run 指向 `:latest` | 短时断连 |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` 生成新值 → Secret 新版本 → 发布 | **所有用户被登出** |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth 客户端 → 重置密钥 → Secret 新版本 | 短时 Google 登录不可用 |
| `APPLE_CLIENT_SECRET` | Apple Developer → 重新签 JWT → Secret 新版本 | 短时 Apple 登录不可用 |
| `RESEND_API_KEY` | Resend dashboard 新建 key → Secret 新版本 → 吊销旧 | 邮件发送短时受影响 |
| `CRON_SECRET` | 随机生成新值 → Secret 新版本 → 同步更新调用方 | Cron 任务须同步 |

**建议时机**：周五傍晚低峰期逐个滚动；或先 rotate `NEXTAUTH_SECRET` 外的其他密钥，NEXTAUTH 选周日凌晨。

---

## 未来防线

- Cloudbuild 流水线加 `gcloud secrets list` 审计 step，提醒轮换
- Cloud Run 部署配置改用 YAML 管理进 git（`cloudbuild.yaml` 或 `service.yaml`），禁止裸环境变量
- 新开发约定：任何 secret 必须走 Secret Manager，code review 检查

---

## 状态追踪

- [x] 步骤 1：Secret Manager API 启用（2026-04-22）
- [x] 步骤 2：创建 6 个 secret（2026-04-22，值 = 当前 env 值）
- [x] 步骤 3：授权 Cloud Run SA `429522911261-compute@developer.gserviceaccount.com` 读取（2026-04-22）
- [x] 步骤 4：部署新 Cloud Run revision `takoapi-00043-wcq`（2026-04-22，env 已全部走 `secretKeyRef`，200 OK）
- [ ] 步骤 5：密钥轮换（可延后，见上表）
