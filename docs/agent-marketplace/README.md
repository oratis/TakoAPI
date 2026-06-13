# TakoAPI 转型设计：One API to access all agents

> 设计文档轨道（**仅设计，未动手实现**）。
> 目标：把 TakoAPI 从「OpenClaw Skills Marketplace」升级为「**agent 市集 + 统一调用 API**」。
> Slogan：**One API to access all agents**。
> 起草：2026-06-13。

---

## 一句话论点

把 OpenRouter 对 LLM 做的事，对 **agent** 再做一遍：用**一个 API key、一张账单**，发现并调用任意第三方 agent。站在已收敛的开放标准（**A2A** + **MCP**）之上，做它们刻意不做的那一层——**统一鉴权、计费、路由、可观测**。

调研结论：这个「OpenRouter for agents」的生态位在 2026 年中**仍然空着**（详见 [01-landscape-and-standards.md](01-landscape-and-standards.md)）。

---

## 文档索引

| # | 文档 | 内容 |
|---|---|---|
| ⭐ | [**HANDOFF 交接**](HANDOFF.md) | **跨机器/跨 session 接手:现状、部署手册、环境坑、下一步。本机 memory 不随 git —— 换机器先看这里。** |
| 00 | [愿景与定位](00-vision-and-positioning.md) | 为什么转、转成什么、目标用户、战略选项与推荐、与现有 skills 业务的关系 |
| 01 | [格局与标准调研](01-landscape-and-standards.md) | A2A / MCP 等开放标准 + 竞争格局 + 市场空白（**带来源链接**） |
| 02 | [产品方案](02-product-spec.md) | 三层产品面：Registry（发现）/ Gateway（调用）/ Console（控制台与变现） |
| 03 | [技术架构](03-technical-architecture.md) | 网关架构、协议适配、鉴权/限流/计量、GCP 落地与坑、可观测、信任安全 |
| 04 | [数据模型演进](04-data-model.md) | 从 Skill 中心到 Agent 中心的 Prisma schema 演进、复用与新增、迁移策略 |
| 05 | [路线图](05-roadmap.md) | 分阶段执行计划（registry-first → gateway → 变现 → 双边市集），每阶段验收 |
| 06 | [待决策清单](06-open-questions.md) | 需要用户拍板的 8 个关键决策，每个附推荐与影响 |

---

## 当前状态

- **Phase 0（决策）** ✅ — 2026-06-13 采纳**全部推荐**（见 [06](06-open-questions.md)）。
- **Phase 1 · Registry MVP** ✅ **本地实现并验证完成**（见 [05-roadmap.md](05-roadmap.md)）：数据模型 + 入驻（AgentCard URL/手填）+ admin 审核 + 市集 UI（`/agents` + 详情）+ 发现/registry API + 首页改版（slogan 落地）。三个测试 agent 走通「提交→审核→上架→发现」全链路。
- **下一步**：Phase 2 · Gateway MVP（需先升配 Cloud SQL + PgBouncer + Redis）。

## 与现有 docs 的关系

本轨道是**新业务方向**，与现有 [docs/00–03](../README.md)（基础设施 / 架构优化 / coding-agent skills / 密钥加固，均已上线）并行。现有 skills 业务的处理见 [00-vision §6](00-vision-and-positioning.md#6-与现有-skills-业务的关系)。

## 约定（沿用现有 docs 规范）

- 每个任务分阶段（Phase 1A/1B…），**每阶段完成后停下来等用户验收，不一次性交付**。
- 所有 schema 变更走 `prisma migrate dev --name <desc>` 生成迁移文件入库（已 baseline `0_init`）。
- **实现前必读** `node_modules/next/dist/docs/`——本仓库 Next.js 16 有 breaking changes，不能凭训练记忆写代码（见根目录 `AGENTS.md`）。
- 破坏性 API 变更在 PR 描述注明前端影响点。
