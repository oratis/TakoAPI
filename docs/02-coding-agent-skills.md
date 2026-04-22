# 任务 2：Coding Agent Skills 支持

> 目标：把 TakoAPI 建成 Claude Code / Cursor / Windsurf / Aider 等 coding agent skill 的权威聚合站。

---

## 现状

- "Coding Agents & IDEs" 分类已存在，1160 条 skill（最大分类）
- 数据全部来自 clawskills.sh 一家
- 无 agent type 细分 — 无法区分 Claude Code skill vs Cursor rule vs Aider config
- 无直接从 GitHub 采集的通道

## 目标能力

1. **按 agent type 筛选**：用户能打开 `/agents/claude-code` 只看 Claude Code 相关 skill
2. **来源标注**：每条 skill 清晰显示来自 clawskills 还是 GitHub，以及原始星数
3. **GitHub 自动采集**：定期拉取高星合集仓库内容入库，与 clawskills 数据去重合并
4. **agent-specific 元数据**：install path、触发条件、适配 CLI 版本等

---

## 执行计划

分 4 阶段，**按 A→B→C→D 顺序**，每阶段单独验收。

---

### 阶段 A — 数据模型扩展（预计 1 天）

**依赖**：任务 1 阶段 1C 已建 `Tag` / `SkillTag` 表。

**Schema 变更**（迁移 `003_agent_types.sql`）：

```prisma
enum AgentType {
  CLAUDE_CODE       // ~/.claude/skills/*, SKILL.md 格式
  CLAUDE_AGENT_SDK  // 使用 Agent SDK 构建的 agent
  CURSOR            // .cursorrules, .cursor/rules/
  WINDSURF          // .windsurfrules
  AIDER             // .aider.conf.yml
  CONTINUE          // Continue.dev config
  CODEX             // OpenAI Codex CLI
  COPILOT           // GitHub Copilot Workspace
  GENERIC           // 通用 LLM prompt/agent pattern
}

enum SkillSource {
  CLAWSKILLS
  GITHUB
  MANUAL
}

model Skill {
  // ... 现有字段 ...
  agentType      AgentType?
  source         SkillSource @default(MANUAL)
  sourceRepo     String?      // e.g. "hesreallyhim/awesome-claude-code"
  sourceStars    Int?
  lastScrapedAt  DateTime?
  license        String?      // SPDX identifier, e.g. "MIT"

  @@index([agentType])
  @@index([source])
}
```

**验收**：
- [ ] 迁移应用成功
- [ ] 现有 1160 条 "Coding Agents & IDEs" skill 通过脚本按关键字推断 `agentType`（best-effort），人工 review 后写回
- [ ] `/admin/skills/[id]` 编辑页增加 agentType 下拉

---

### 阶段 B — GitHub 采集器（预计 2-3 天）

**新文件**：
```
scripts/scrape-github-skills.ts
src/lib/github/
  client.ts       # Octokit 实例 + rate-limit 处理
  classifier.ts   # 判定 agentType 的启发式规则
  parser.ts       # 解析 SKILL.md / AGENTS.md / README.md
```

**目标仓库清单**（种子列表，后续扩充）：

| 仓库 | 用途 | 预估 skill 数 |
|---|---|---|
| `hesreallyhim/awesome-claude-code` | Claude Code 精选合集 | ~100 |
| `davidteren/claude-code-agents` 类 | Claude Code subagents | ~50 |
| `anthropics/claude-cookbooks` | 官方示例 | ~30 |
| `wong2/awesome-mcp-servers` | MCP server 合集 | ~200 |
| `punkpeye/awesome-mcp-servers` | MCP server 合集（备选） | ~150 |
| `PatrickJS/awesome-cursorrules` | Cursor rules | ~500 |
| `Aider-AI/aider` 官方 examples | Aider 配置 | ~20 |
| `continuedev/continue` 官方 configs | Continue.dev | ~30 |

**另加仓库发现机制**：
- GitHub search API：`topic:claude-code stars:>10`、`topic:cursorrules`
- 按月增量，stars 排序取 top N

**采集流程**：

1. 读 `scripts/github-sources.json`（手工维护的目标仓库列表）
2. 对每个仓库：
   - 拉 meta：name、description、stars、topics、license、default_branch
   - 拉 tree：找特征文件（`SKILL.md`, `AGENTS.md`, `.cursorrules`, `.windsurfrules`, `.aider.conf.yml`）
   - 判定 `agentType`（见 classifier 规则）
   - 拉 README（截断到 32KB）
   - 构造 Skill JSON
3. 输出 `prisma/github-skills.json`
4. 人工 review → `npm run seed:github` 导入

**classifier 启发式规则**：

```ts
function classify(repo: RepoMeta, tree: string[]): AgentType | null {
  if (tree.some(f => /^\.claude\/skills\/.+\/SKILL\.md$/.test(f))) return 'CLAUDE_CODE';
  if (tree.some(f => f === 'SKILL.md')) return 'CLAUDE_CODE';
  if (tree.includes('.cursorrules') || tree.some(f => f.startsWith('.cursor/rules/'))) return 'CURSOR';
  if (tree.includes('.windsurfrules')) return 'WINDSURF';
  if (tree.includes('.aider.conf.yml')) return 'AIDER';
  if (repo.topics.includes('claude-code')) return 'CLAUDE_CODE';
  if (repo.topics.includes('mcp-server')) return 'CLAUDE_AGENT_SDK';
  // ... 更多规则
  return null;
}
```

**去重策略**：
- 按 `githubUrl` 唯一索引匹配
- 若 clawskills 已有同 `githubUrl`，采集器优先更新 `sourceStars/lastScrapedAt`，不新增记录
- 冲突字段以 GitHub 原始数据为准（author、stars、license）

**Rate limiting**：
- 未认证：60 req/hour（不够用）
- 认证（PAT）：5000 req/hour
- 使用 Octokit 自带的 throttle plugin，超限时 sleep 等待

**验收**：
- [ ] 跑 `npm run scrape:github` 输出合法 JSON
- [ ] 每条 skill 有 `agentType`、`sourceRepo`、`sourceStars`、`license`
- [ ] 去重逻辑跑通（重复 URL 不产生重复记录）

---

### 阶段 C — 前端展示（预计 1-2 天）

**新增路由**：
- `/agents` — agent type 总览页（8 种类型卡片 + skill count）
- `/agents/[type]` — 某类 agent 的 skill 列表（e.g. `/agents/claude-code`）

**改造现有**：
- `/skills` 列表增加左侧 filter sidebar：
  - Category（已有）
  - Agent Type（新）— 复选框
  - Source（新）— CLAWSKILLS / GITHUB / MANUAL
  - Tag（新）— 多选
- Skill 详情页顶部增加徽章行：`[Claude Code]` `[GitHub 1.2k ★]` `[MIT]`
- 首页 hero 下方新增 "Popular Agent Types" 轮播区

**API 变更**：
- `/api/skills` 接受 `agentType`、`source`、`tag` query 参数
- 新增 `/api/agent-types` 返回 agent type + skill count 映射

**验收**：
- [ ] `/agents/claude-code` 正确展示所有 Claude Code skill
- [ ] 列表 filter 组合生效（Category + AgentType + Tag）
- [ ] 详情页徽章显示正确

---

### 阶段 D — 内容导入与运维（预计 1 天）

**步骤**：
1. 跑阶段 B 的采集器，生成 `prisma/github-skills.json`
2. 人工抽样 review 100 条（检查 agentType 判定、描述质量）
3. `npm run seed:github` 导入到生产 DB
4. 配置 GitHub Actions 定时任务（每周一次），运行采集器并提交 PR（人工 merge）
5. 在 admin 后台新增"采集 pending"页面，列出待审核的 GitHub 新条目

**验收**：
- [ ] 生产库新增 ≥500 条带 `source=GITHUB` 的 skill
- [ ] `/agents/claude-code` 真实渲染内容 ≥80 条
- [ ] GitHub Action 可手动触发并成功跑完

---

## GitHub Token 获取

### 推荐方式：Fine-grained Personal Access Token

1. 登录 https://github.com/settings/tokens?type=beta
2. 点击 **Generate new token**
3. 配置：
   - **Token name**：`TakoAPI Skill Scraper`
   - **Expiration**：90 days（到期要滚动）
   - **Repository access**：**Public Repositories (read-only)** — 只读即可
   - **Permissions** → Repository permissions：
     - `Contents`: Read-only
     - `Metadata`: Read-only（默认必选）
   - 其他全部 No access
4. 点 **Generate token**，复制 `github_pat_...` 字符串（只显示一次）

### 备选：Classic Token（更简单但权限粒度粗）

1. 访问 https://github.com/settings/tokens/new
2. Note: `TakoAPI Scraper`
3. Expiration: 90 days
4. Scopes: 勾选 `public_repo`（读公共仓库）
5. 生成，复制 `ghp_...` 字符串

### 配置到项目

本地开发 (`.env.local`，**不入库**)：
```
GITHUB_TOKEN="github_pat_xxx..."
```

Cloud Run / 生产：
- 用 Google Secret Manager 存 `GITHUB_TOKEN`
- 在 `cloudbuild.yaml` 或部署配置里映射为环境变量
- **切勿**硬编码或提交到 git

### 速率额度

| 认证方式 | 每小时请求数 |
|---|---|
| 未认证（IP） | 60 |
| PAT | 5,000 |
| GitHub App (如未来切换) | 15,000 |

我们采集 ~50 仓库/每周，每仓库 ~10 API 调用（meta + tree + README），总量 ~500/周，PAT 完全够用。

### 安全备注

- Token 过期要更换。建议日历提醒 90 天前滚动。
- Token 泄露立即 https://github.com/settings/tokens 撤销。
- 代码中**永远**用 `process.env.GITHUB_TOKEN` 读取，不要落盘。
- `.env.local` 已在 `.gitignore` 保护范围内。

---

## 风险与注意

- **License 合规**：采集的 README 可能含非商用许可。必须存 `license` 字段；若为 unknown/proprietary，站点展示加红色告警。
- **内容更新**：上游仓库改名/删除会导致链接失效。`lastScrapedAt` 超过 30 天的 skill 标记"可能过时"，定期批量 re-check。
- **GitHub ToS**：大规模抓 README 属于公开内容，可接受；但**不要**用单个 token 高频轮询，throttle plugin 必配。
