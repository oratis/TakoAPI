# 任务 4：MCP server + npx 安装器

> 目标：(1) 给 takoapi.com **真正搭一个 MCP server**（远程 Streamable-HTTP，三平台用原生 `mcp add` 一行注册）；(2) **发一个 npx 安装器**，把 skill 安装跨平台化（含 Windows），与 `public/install.sh` 对等。

调研均为 2026-06 实测（MCP TS SDK 1.29.0 / mcp-handler 1.1.0 / Next 16.2.1 docs / 三平台 MCP 注册语法 / npx 最佳实践）。

---

## 两个交付物

| # | 交付物 | 形态 | 用户怎么用 |
|---|---|---|---|
| A | **托管 MCP server** | Next 路由 `src/app/mcp/route.ts`，URL `https://takoapi.com/mcp` | `claude mcp add --transport http takoapi https://takoapi.com/mcp` 等一行 |
| B | **npx 安装器** | 独立零依赖 Node 包 `packages/takoapi-install/` | `npx takoapi-install`（跨平台，含 Windows） |

C（粘合）：更新 `install.sh` / `/install` 页 / README，把 **skill 安装** 和 **MCP 注册** 两条路径都呈现。

---

## A. 托管 MCP server

### 工具集（薄封装，调用 TakoAPI 自己的公开 REST/网关 API）
MCP 工具不直接碰 Prisma，而是 `fetch` takoapi.com 现有端点 —— 解耦、handler 无需 DB、可对着线上真实数据测：

| 工具 | 入参 | 调用 | 鉴权 |
|---|---|---|---|
| `search_agents` | `query?`, `category?`, `protocol?`, `limit?` | `GET /api/registry?format=json&…` | 无 |
| `get_agent` | `slug` | `GET /api/agents/{slug}` | 无 |
| `search_skills` | `query?`, `category?`, `limit?` | `GET /api/skills/search?q=` / `GET /api/agent?format=json` | 无 |
| `invoke_agent` | `slug`, `text` | `POST /v1/agents/{slug}/message`，`Authorization: Bearer <TAKO_KEY>` | **需 key** |

读工具匿名；`invoke_agent` 走规范网关路由（鉴权 `authenticateApiKey` + 计费 `meterInvocation` 都已在该路由里，不重复实现）。Key 从 MCP 请求的 `Authorization: Bearer` 取（`withMcpAuth` → `extra.authInfo.token`）。

工具逻辑抽到共享模块 `src/lib/mcp/tools.ts`：`buildTools({ baseUrl, apiKey? })` 返回工具定义数组；路由把它接到 MCP 服务器。base URL = `SITE_URL`（lib/seo.ts，缺省 takoapi.com）。

### 实现方式 —— ⚖️ 待辩论（见下）
**方案 1（官方）**：`mcp-handler@1.1.0` + `@modelcontextprotocol/sdk@1.29.0` + zod@4，stateless（Cloud Run 适配），`registerTool` + `withMcpAuth`。
**方案 2（手写零依赖）**：普通 Next POST 路由实现极简 stateless Streamable-HTTP —— 只处理 `initialize` / `notifications/initialized` / `tools/list` / `tools/call`（+`ping`），POST 回 `application/json`（无 server 主动消息时合法）。风格与现有 `/v1` 路由一致，零新依赖。

路由位置定为固定 `src/app/mcp/route.ts`（**不用** 官方 `app/[transport]/route.ts` —— 根级 `[transport]` 动态段会吞掉 `/agents`、`/skills`、`/install` 等所有顶层路径）。`export const runtime="nodejs"; export const dynamic="force-dynamic";`。读工具加 `checkRateLimit`（复用 lib/ratelimit.ts）。

### 三平台注册（文档化）
- Claude：`claude mcp add --transport http takoapi https://takoapi.com/mcp`（加 `--header "Authorization: Bearer $TAKO_KEY"` 用网关）
- Codex：`[mcp_servers.takoapi]` `url="https://takoapi.com/mcp"`，`bearer_token_env_var="TAKO_KEY"`
- OpenCode：`mcp.takoapi = { type:"remote", url:"https://takoapi.com/mcp", headers:{Authorization:"Bearer …"} }`

---

## B. npx 安装器（`packages/takoapi-install/`）

- 零依赖 ESM Node CLI（仅 `node:` 内置），`bin/cli.js` + `#!/usr/bin/env node`。
- 与 `install.sh` 对等：把 skill 写进 Claude / Codex / OpenCode 原生目录（见任务 3），**且跨平台**（`os.homedir()`；OpenCode 用 `XDG_CONFIG_HOME || ~/.config`；Windows 同样是 home 锚定 dotfolder）。
- flags：`--all` / `--claude` / `--codex` / `--opencode` / `--uninstall` / `--mcp`（打印 MCP 注册一行命令而非改配置）/ `--help`。默认自动检测，没检测到就装全部。
- 命名：**unscoped `takoapi-install`**，bin 同名 → `npx takoapi-install` 免 `--package`。文档里用 `npx -y takoapi-install` 避免交互确认。
- 包放 `packages/takoapi-install/`（独立 publish，不进 Next 构建）；纯 `.js`，不入 app 的 tsc/eslint。

> 单一正文来源：skill 正文目前在 install.sh（heredoc）、takoapi_skill/SKILL.md、plugins/…、npx 包四处。npx 包内置自己的副本（与现有一致）。彻底 DRY（codegen）列为后续，本次保持人工对齐。

---

## 文件清单

**新增**
- `src/lib/mcp/tools.ts` —— 共享工具定义（fetch 封装 REST/网关）
- `src/app/mcp/route.ts` —— 托管 MCP 端点（实现方式见辩论结论）
- `packages/takoapi-install/{package.json, bin/cli.js, README.md}` —— npx 安装器
- （若方案 1）`package.json` 加 `mcp-handler` + `@modelcontextprotocol/sdk` + 确认 zod

**修改**
- `public/install.sh` —— 末尾摘要补 MCP 一行注册命令（`--mcp` 提示）
- `src/app/install/page.tsx` + `src/components/ui/InstallTabs.tsx` —— 每平台 tab 增「MCP server（原生）」与「Skill（脚本）」两种方式
- `README.md` —— MCP server 段 + npx 段
- `takoapi_skill/SKILL.md` —— 顶部能力区可提一句「也可作为 MCP server 接入」

---

## 验证
1. **MCP 协议（curl 直测，无需 client/DB）**：对本地 dev `POST /mcp` 发 JSON-RPC `initialize` → 校验 `protocolVersion`/`capabilities`/`serverInfo`；`tools/list` → 4 个工具；`tools/call search_agents{query}` → 真实 agent 数据（工具 fetch 线上 takoapi.com）。`invoke_agent` 无 key → 友好报错；带假 key → 401 透传。
2. **npx**：`node packages/takoapi-install/bin/cli.js --all`（沙箱 HOME）→ 文件落位、frontmatter 合法、幂等、`--uninstall` 清干净；`--help` exit 0、错误 flag 非零；`npm pack` 校验 tarball 只含 bin。
3. **回归**：`npx tsc --noEmit` + 新文件 eslint clean；`/install`、`/install.sh` 仍 200；`npm run build`（若加了依赖，确认 standalone 构建通过）。

---

## 风险（辩论重点）
- mcp-handler + SDK 在 **Next 16.2.1 standalone/Turbopack** 能否正常构建运行（官方主要在 Vercel 验证）→ 决定方案 1 vs 2。
- 固定 `/mcp` 路径下 mcp-handler 的路由匹配是否成立（basePath=""）。
- 自调用 loopback（takoapi.com/mcp → fetch takoapi.com/api）多一跳；可接受，后续可改直连 Prisma。
- 安全：匿名读工具暴露面 = 现有公开 API（已公开，OK）；`invoke_agent` key 仅透传不落盘；`/mcp` 限流。
- npx 改配置（Codex TOML）幂等性差 → 故 `--mcp` 只打印命令，不自动改配置。

---

## 辩论结论与最终决策（正反方辩论后）

正方（捍卫计划）与反方（红队攻击）独立辩论后裁决如下：

1. **传输：手写零依赖 stateless Streamable-HTTP JSON-RPC**（`src/app/mcp/route.ts`），**不引** mcp-handler / SDK。理由（两方共识）：mcp-handler 把 SDK peer **精确锁死 1.26.0**（现稳定 1.29.0），当前未安装、Next16 standalone/Turbopack/Cloud Run **未验证**；而 stateless 无 server 主动消息时 POST 直接回 `application/json` 即合法，与现有 `/v1` 路由同风格，约 150 行可审。
2. **数据源：facade 调 takoapi.com 自身公开 API**（不直连 Prisma）。决定性理由：base origin 取**服务端常量**后，本地起 dev 即可对**线上真实数据**端到端测（本环境无 DB，facade 是唯一可测路径）。反方的 SSRF 顾虑已采纳：**origin 绝不取请求头**。生产自调用多一跳，列为后续可优化为直连 Prisma。
3. **工具：读工具匿名 + `invoke_agent` 保留**但 key 门控 + 标 `readOnlyHint:false`（客户端调用前确认），转发规范网关路由继承鉴权/计费。网关既有问题（余额可为负、限流 in-memory 单实例）属**既有、超范围** → 另起任务跟进。
4. **协议正确性（采纳反方清单）**：`notifications/initialized` 回 **HTTP 202 空体**；容忍 `Accept: …text/event-stream`；回显 `protocolVersion`；JSON-RPC 错误码 `-32700/-32601/-32602`；结果 `{content:[{type:"text"}]}`；仅 POST，GET→405；`req.json().catch`。
5. **/mcp 加 per-IP 限流**（复用 lib/ratelimit）。
6. **工具定义隔离** `src/lib/mcp/tools.ts`（传输可换）。
7. **npx 与 install.sh 严格对等**：双 Codex 目录（`~/.codex/skills` + `~/.agents/skills`）、OpenCode 用 `XDG_CONFIG_HOME||~/.config/opencode`（Windows 同 home 锚定；注 %APPDATA% 旧习）、`--uninstall` 清全部、skill 正文用**字面字符串**（不模板插值 `$TAKO_KEY`/`$ARGUMENTS`）、unscoped 名、`--mcp` 只打印。
8. **不新增第 4 份发散正文**：npx 正文与 install.sh 一致；codegen 去重列后续。
