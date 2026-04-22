# TakoAPI Docs

项目工程计划与技术文档索引。

## 📋 当前路线图

按顺序执行：

0. **[密钥加固](03-secret-hardening.md)** 🔴 最高优先 — 生产密钥从 Cloud Run env 明文迁入 Secret Manager（进行中）
1. **[架构与数据库优化](01-architecture-review.md)** — 后端现状分析 + 分批修复方案
2. **[Coding Agent Skills 支持](02-coding-agent-skills.md)** — 新增 Claude Code / Cursor / Windsurf 等编码代理技能收录

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
