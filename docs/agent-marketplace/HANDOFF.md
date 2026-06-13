# 交接文档 / HANDOFF

> 跨机器、跨 session 的接手说明。本机的 `~/.claude` memory 不随 git 同步,所以把关键信息都落在这里。
> 最后更新:2026-06-13。

---

## 0. 一句话

TakoAPI 正从「OpenClaw skills 市集」转型为 **「One API to access all agents」**(agent 市集 + 统一网关,即 OpenRouter-for-agents)。**Phase 1(registry)+ Phase 2(gateway)已完成、合并 `main`、上线 takoapi.com**。

---

## 1. 新机器准备(prerequisites)

- **clone**:`git clone https://github.com/oratis/TakoAPI.git`(若 git 卡死见 §6)。
- **依赖**:`npm ci`(本仓库是改过的 Next.js 16,写代码前先读 `node_modules/next/dist/docs/`,见根 `AGENTS.md`)。
- **本地 DB**:`docker compose up -d db`(Postgres:5432),`cp .env.example .env` 并把 `DATABASE_URL` 设成 `postgresql://takoapi:takoapi_dev@localhost:5432/takoapi`,`NEXTAUTH_SECRET=任意`,`NEXTAUTH_URL=http://localhost:3000`。
- **本地 schema**:`npx prisma db push`(本地用 push,**不要** migrate,见 §5),`npx tsx prisma/seed.ts` 灌 skills。
- **跑**:`npm run dev`(:3000)。上线前必跑 `npx tsc --noEmit`(dev server 用 SWC,不做类型检查)。
- **gh**:`gh auth login`(账号 oratis,需 `repo` scope)。
- **GCP**(部署/改生产库用):`gcloud auth login`(账号 **wangharp@gmail.com**,对项目 `takoapi-491505` 有权限);装 `cloud-sql-proxy`。

---

## 2. 现状(2026-06-13)

- 线上 **takoapi.com**;GCP 项目 `takoapi-491505`,region `us-central1`,Cloud Run 服务 `takoapi`,当前 revision **`takoapi-00048-x5r`**(回滚见 §5)。
- 市集共 **493 个 agent**:
  - **43 个 HOSTED**(在线可调用,A2A;来自 a2aregistry.org + awesome-a2a)
  - **450 个 PROJECT**(GitHub 开源项目,按 stars;`kind=PROJECT`,仅发现、不接网关调用)
- **网关**:`POST /v1/agents/{slug}/message`(A2A 透传)、`/v1/agents/{slug}/stream`(SSE)、`/v1/chat/completions`(OpenAI 兼容 shim);API key 在 `/dashboard`;每次调用落 `Invocation` 表计量。
- **页面**:`/`(slogan 首页 + Featured Agents=HOSTED)、`/agents`(市集,有 Agents/Projects 切换 + 排序)、`/agents/[slug]`(详情)、`/submit-agent`、`/admin/agents`(审核)、`/dashboard`(开发者控制台);旧 skills 功能(`/skills` 等)完好。
- **数据模型**:`prisma/schema.prisma`(`Agent`/`AgentSkillDef`/`AgentTag`/`ApiKey`/`Invocation`;`Agent.kind` = HOSTED|PROJECT;迁移 `003`–`005` 均已应用到生产)。
- **GitHub token**:`tako-github-token` secret **现已有效**(认证后 search 30/min)。
- **已合并 PR**:#2 docs、#3 backend、#8 ui+gateway+dashboard+streaming、#9 rebrand、#10 projects-directory、#11 scraper-expand。(#4/#6 关闭、#5/#7 作废,内容都在 main。)

设计文档全集见同目录 `00`–`06`(愿景/调研/产品/架构/数据模型/路线图/决策)。

---

## 3. 给新 session 的提示词(可直接粘贴)

```
你在接手 TakoAPI 的 agent 市集改造(One API to access all agents)。Phase 1+2 已上线
takoapi.com。先读 docs/agent-marketplace/HANDOFF.md 和 00–06,再动手。所有破坏性/对外动作
(部署、改生产库、合并 PR)先确认。注意 HANDOFF §5/§6 的部署与 git 大坑。不确定方向先问用户。
```

---

## 4. 接下来做什么

### 需要用户(做不了)
- **Stripe key** → Phase 3 计费(credits 充值/扣费;计量已在落 `Invocation`)。
- **Cloud SQL 升配 + PgBouncer + Upstash Redis**(付费/账号)→ 网关上真实流量前。现在是 `db-f1-micro` + 内存限流。

### 现在就能做(无外部依赖)
- **扩项目目录**:`scripts/scrape-github-agents.ts`(token 有效;池子 1,105 个唯一,现导入 top 400)。调大 `MAX_AGENTS`/`PAGES`,经 cloud-sql-proxy + `PROD_URL` 跑生产即可扩更多。
- **首页加「热门开源项目」**(现首页只 feature 43 个 HOSTED)。
- **提高 `/api/registry` 上限**(现 `take: 200`,库里 493)。
- **Phase 3 内部账本**(`CreditBalance`/`LedgerEntry` schema + 扣费逻辑,除 Stripe 充值外)。
- **agent 健康检查**(schema 有 `healthStatus`/`healthCheckedAt`,做 cron/endpoint ping HOSTED)。
- **再导真实 HOSTED agent**(从 a2aregistry.org / awesome-a2a 抓 AgentCard 验证后入库)。

---

## 5. 部署手册(踩过的坑都在这)

> ⚠️ **千万别跑 `gcloud builds submit --config cloudbuild.yaml`** —— 它的 `--set-env-vars` 是占位符密钥(`USER:PASSWORD`、`your-secret-here`),会**冲掉生产密钥搞挂线上**。无 Cloud Build trigger,所以合并 main **不会**自动部署(安全)。

**安全部署(只换镜像,保留 env/secret/CloudSQL 绑定)**:
```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/takoapi-491505/takoapi-repo/takoapi:<tag> --project=takoapi-491505 .
gcloud run deploy takoapi --image us-central1-docker.pkg.dev/takoapi-491505/takoapi-repo/takoapi:<tag> --region us-central1 --project=takoapi-491505   # 不带 --set-env-vars
```
Cloud Run 保留旧 revision。**回滚**:
```bash
gcloud run services update-traffic takoapi --to-revisions takoapi-00047-xgs=100 --region us-central1 --project=takoapi-491505
```
Dockerfile **不**跑迁移(只 `node server.js`),所以迁移要单独先做。

**密钥在 Secret Manager**:`tako-database-url`、`tako-nextauth-secret`、`tako-google-client-secret`、`tako-apple-client-secret`、`tako-resend-api-key`、`tako-cron-secret`、`tako-github-token`。Cloud Run env 通过 `valueFrom.secretKeyRef.{name,key}` 引用。

**生产 DB 迁移(只做新增;别 `prisma migrate deploy`——`0_init` 目录排序在最后会乱序)**:
```bash
cloud-sql-proxy takoapi-491505:us-central1:takoapi-db --port 5435 &
RAW=$(gcloud secrets versions access latest --secret=tako-database-url --project=takoapi-491505)
# 把 RAW 里的 host 换成 127.0.0.1:5435、db=takoapi,得到 PROD_URL
npx prisma db execute --url "$PROD_URL" --file prisma/migrations/<NNN>/migration.sql
```
生产灌数据(如 scraper)同理,用 `PROD_URL=... npx tsx scripts/scrape-github-agents.ts`。

---

## 6. 环境坑

- **git fetch/pull/push 在原 Mac 会卡死**(本机代理 `127.0.0.1:7897` + macOS keychain)。咒语:
  `GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c http.version=HTTP/1.1 <cmd>`,Bash 要 `dangerouslyDisableSandbox`,push 把 gh token 拼进 URL(`https://x-access-token:$(gh auth token)@github.com/...`)。**新 Mac 若没这个代理,可能不需要**——先正常试,卡了再用咒语。
- **合 PR**:在 git worktree 里 `gh pr merge` 会报 `main is already used by worktree`。改用
  `gh api -X PUT repos/oratis/TakoAPI/pulls/N/merge -f merge_method=merge`。**一次一个、尽量单 PR 直接基于 main**,别堆栈式(会乱)。
- **`/api/registry` 上限 200**(`take: 200`),库里有 493;`/agents` 分页正常显示全部。
- 生产 `_prisma_migrations` 历史不可靠 → 所以生产迁移走 §5 的 `db execute`,不要 `migrate deploy`。
```
