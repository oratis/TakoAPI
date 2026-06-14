# TakoAPI

**One API to access all agents** — an open directory and unified gateway for AI agents (think OpenRouter, but for agents), plus thousands of OpenClaw skills for your coding agent.

Live at [takoapi.com](https://takoapi.com)

## What is TakoAPI?

TakoAPI is two things in one:

1. **Agent directory + gateway** — discover hosted AI agents and open-source agent projects, then invoke the hosted ones through a single unified API: A2A passthrough, SSE streaming, and an OpenAI-compatible shim. Agents are described by open [A2A](https://a2aproject.github.io/A2A/) AgentCards, and every call is metered per API key.
2. **OpenClaw skills marketplace** — browse, search, and install thousands of community skills for coding agents (Claude Code, Cursor, Windsurf, Codex, and more) from the web or programmatically.

## Install into your coding agent (one command)

Add TakoAPI to **Claude Code**, **Codex**, or **OpenCode** with a single command:

```bash
curl -fsSL https://takoapi.com/install.sh | sh
```

It auto-detects which agents you have and drops a small, namespaced TakoAPI skill into each — teaching your agent to discover and invoke agents through the gateway and search the skills catalog. It never edits your shared config, is safe to re-run, and undoes cleanly with `--uninstall`.

| Agent | Installs to | Invoke with |
|-------|-------------|-------------|
| Claude Code | `~/.claude/skills/takoapi/SKILL.md` | loads automatically |
| Codex | `~/.agents/skills/takoapi/SKILL.md` | `$takoapi` or `/skills` |
| OpenCode | `~/.config/opencode/{agent,command}/takoapi.md` | `/takoapi` or `@takoapi` |

Target a single agent with `… | sh -s -- --claude` (or `--codex` / `--opencode`). On Windows or in Node, use the npx installer instead:

```bash
npx takoapi-install
```

Claude Code users can also install the native plugin:

```bash
claude plugin marketplace add oratis/TakoAPI
claude plugin install takoapi@takoapi
```

### As an MCP server

TakoAPI is also a hosted **MCP server** — register it with one command and get `search_agents`, `get_agent`, `search_skills`, and `invoke_agent` as native tools, no local install:

```bash
claude mcp add --transport http takoapi https://takoapi.com/mcp
```

For Codex, add a `[mcp_servers.takoapi]` block (`url = "https://takoapi.com/mcp"`) to `~/.codex/config.toml`; for OpenCode, add a `remote` entry under `mcp` in `opencode.json`. Read tools are anonymous; `invoke_agent` needs your API key as a Bearer token. Run `npx takoapi-install --mcp` to print all three.

Full walkthrough and copy-paste commands: <https://takoapi.com/install>.

## Features

- **Agent registry** — `GET /api/registry` returns the whole catalog as Markdown (for agents/LLMs) or JSON.
- **Unified gateway** — call a hosted agent at `/v1/agents/{slug}/message` (A2A), stream it at `/v1/agents/{slug}/stream` (SSE), or use the OpenAI-compatible `/v1/chat/completions`. Issue API keys in `/dashboard`; usage is metered per call.
- **Open-source project directory** — hundreds of self-hostable agent projects, ranked by stars and discoverable alongside hosted agents.
- **Skills discovery** — thousands of skills across dozens of categories, with search, filtering, a trending leaderboard, and a dedicated `GET /api/agent` endpoint designed for AI agents.
- **Accounts** — sign in with Google, Apple, or email/password. Agents can register via API and receive a key.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) + TypeScript |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) |
| Database | PostgreSQL + [Prisma 6](https://prisma.io) |
| Auth | [NextAuth v5](https://authjs.dev) (Google, Apple, Credentials) |
| Deployment | Docker + Google Cloud Run |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)

### Setup

```bash
# Clone the repo
git clone https://github.com/oratis/TakoAPI.git
cd TakoAPI

# Install dependencies
npm install

# Start PostgreSQL
docker compose up -d db

# Create .env (see Environment Variables below)
cat > .env <<'EOF'
DATABASE_URL=postgresql://takoapi:takoapi_dev@localhost:5432/takoapi
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-me
EOF

# Push the schema and seed data
npx prisma db push
npx tsx prisma/seed.ts

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server uses SWC and skips type-checking, so run `npx tsc --noEmit` before shipping.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Random secret for NextAuth sessions |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (optional) |
| `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` | Apple OAuth (optional) |
| `GITHUB_TOKEN` | Raises the GitHub API rate limit for the scraper scripts (optional) |

## API Reference

### Agent registry

```
GET /api/registry              # Markdown directory of all agents (default)
GET /api/registry?format=json  # Structured JSON
```

Filters: `q` (search), `category`, `protocol` (`A2A` | `OPENAI_COMPAT` | `MCP`), `limit`.

### Gateway (hosted agents)

```
POST /v1/agents/{slug}/message     # A2A passthrough
GET  /v1/agents/{slug}/stream      # Server-sent events
POST /v1/chat/completions          # OpenAI-compatible shim
```

All gateway routes require an API key: `Authorization: Bearer $TAKO_KEY`.

### Skills

```
GET  /api/agent                # Curated skills as Markdown (md) or JSON, for AI agents
GET  /api/skills               # List skills (paginated, sortable)
GET  /api/skills/search?q=     # Full-text search
GET  /api/skills/:id           # Skill detail (by ID or slug)
POST /api/skills/submit        # Submit a new skill (auth required)
```

### MCP server

```
POST /mcp                      # Streamable-HTTP MCP endpoint (JSON-RPC 2.0)
```

Tools: `search_agents`, `get_agent`, `search_skills` (anonymous), and `invoke_agent` (send your key as `Authorization: Bearer $TAKO_KEY`). Register in any MCP client, e.g. `claude mcp add --transport http takoapi https://takoapi.com/mcp`.

## Project Structure

```
src/
  app/
    page.tsx                 # Home
    agents/                  # Agent marketplace + detail pages
    skills/                  # Skills browse + detail pages
    trending/                # Trending leaderboard
    dashboard/               # Developer console (API keys, usage)
    admin/                   # Moderation
    api/                     # REST API routes
    v1/                      # Gateway routes (A2A / OpenAI-compatible)
    sitemap.ts, robots.ts    # SEO
  components/                # UI + layout
  lib/                       # auth, prisma, seo, helpers
prisma/
  schema.prisma              # Database schema
  seed.ts                    # Database seeder
scripts/                     # Scrapers + maintenance scripts
```

## Deployment

The app is containerized (see `Dockerfile`) and runs on Google Cloud Run. The image is a standalone Next.js server (`node server.js`); database migrations are applied separately, not at container start.

```bash
docker compose up   # PostgreSQL + the Next.js app on :3000
```

## Contributing

Contributions are welcome — open an issue or a pull request.

## License

[MIT](LICENSE)
