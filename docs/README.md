# TakoAPI Docs

项目工程计划与技术文档索引。

## 📋 当前路线图

按顺序执行：

0. **[密钥加固](03-secret-hardening.md)** ✅ 已完成 — 生产密钥已迁入 Secret Manager，CRON_SECRET / NEXTAUTH_SECRET 已轮换
1. **[架构与数据库优化](01-architecture-review.md)** ✅ Phase 1A–1C 已上线 — SkillStatus 枚举 / 事务 / 限流 / 审核流程 / Zod 校验 / Tag + RequestLog 表
2. **[Coding Agent Skills 支持](02-coding-agent-skills.md)** ✅ Phase 2A–2C 已上线 — AgentType + SkillSource schema / GitHub 抓取脚本 / `/agents` 路由

## ✅ 已交付（2026-04-23）

- Prisma 迁移：`001_skill_status_enum`（已应用）、`002_agent_tags_requestlog`（已应用）
- 新 API 库：`src/lib/api.ts` 统一错误、`src/lib/schemas.ts` Zod 校验、`src/lib/ratelimit.ts` 限流、`src/lib/pagination.ts` 分页、`src/lib/requestLog.ts` 请求日志、`src/lib/github.ts` GitHub API 客户端、`src/lib/agents.ts` agent 元数据
- 前端：`/agents`、`/agents/[slug]`、`/profile` 新增 "My Submissions" tab、`/skills` 新增 agent 过滤与 stars 排序、Header 增加 Agents 导航
- 脚本：`scripts/scrape-github-skills.ts`（需 `GITHUB_TOKEN` 运行；见 [02-coding-agent-skills.md](02-coding-agent-skills.md)）

## 🔜 Next up

- 配置 GITHUB_TOKEN secret 并首次运行 scraper 填充各 agent 下的高星技能
- 扩展请求日志覆盖到剩余 admin / search 路由
- 添加 rating / bookmark API（表已存在但未暴露）

## 🏗 基础设施快照

**[00-infrastructure.md](00-infrastructure.md)** —— GCP 项目 / Cloud Run / Cloud SQL / 生产 schema 真实状态（17 models + 行数）。

## 🛠 运维与环境

| 主题 | 所在文档 |
|---|---|
| 密钥 / Secret Manager | [03-secret-hardening.md](03-secret-hardening.md) |
| DB 基础设施（Cloud SQL 连接、代理） | [00-infrastructure.md#cloud-sql](00-infrastructure.md#cloud-sql) |
| DB 迁移策略（已 baseline `0_init`） | [01-architecture-review.md#迁移策略](01-architecture-review.md#迁移策略) |
| GitHub Token 获取与配置 | [02-coding-agent-skills.md#github-token-获取](02-coding-agent-skills.md#github-token-获取) |

## 🔖 约定

- 每个任务分阶段（A/B/C…），每阶段完成后停下来等用户验收，**不一次性交付**。
- 所有 schema 变更通过 `prisma migrate dev --name <desc>` 生成迁移文件并入库。
- 所有破坏性 API 变更在 PR 描述里注明前端影响点。
