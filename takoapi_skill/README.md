# TakoAPI Skill for OpenClaw

> Search, install, and manage OpenClaw skills through natural conversation — powered by the TakoAPI marketplace.

**TakoAPI** is the all-in-one OpenClaw Skills Marketplace with 5,000+ curated community skills. This skill brings the full marketplace experience directly into your OpenClaw agent.

## Features

### Search & Install
Find any skill by keyword, category, or description — then install with a single command.

```
You: "Find me a skill for working with PostgreSQL"
Agent: Here are the top PostgreSQL skills on TakoAPI:

| Skill | Description | Install |
|-------|-------------|---------|
| pg-manager | Full PostgreSQL management... | clawhub install pg-manager |
| sql-helper | Write and optimize SQL... | clawhub install sql-helper |

You: "Install the first one"
Agent: Run: clawhub install pg-manager
```

### Must-Have Recommendations
Get a curated pack of the highest-rated skill from each major category — perfect for new setups or when you want the essentials.

```
You: "Give me the must-have skills"
Agent:
## TakoAPI Must-Have Skills Pack

| Category | Top Skill | Install |
|----------|-----------|---------|
| Coding Agents | cursor-tools | clawhub install cursor-tools |
| Web Development | browser-use | clawhub install browser-use |
| DevOps & Cloud | docker-mcp | clawhub install docker-mcp |
| Search & Research | tavily-search | clawhub install tavily-search |
| ... | ... | ... |

### Install All:
clawhub install cursor-tools browser-use docker-mcp tavily-search ...
```

### Skill Management & Deduplication
Audit your installed skills, find overlapping functionality, and keep only the best one for each purpose.

```
You: "Clean up my skills, remove duplicates"
Agent:
## Your Skills Audit

### Duplicates Found:
| Function | Installed | Keep | Remove |
|----------|-----------|------|--------|
| Git management | git-helper, git-pro | git-pro (2.1k downloads) | git-helper |
| File search | file-finder, search-tool | search-tool (4.5k downloads) | file-finder |

Remove duplicates? clawhub uninstall git-helper file-finder
```

## Installation

### From ClawHub (recommended)
```bash
clawhub install takoapi
```

### Manual Installation
```bash
# Clone this repo
git clone https://github.com/oratis/skill-takoapi_skill_manage.git

# Copy to your OpenClaw skills directory
cp -r skill-takoapi_skill_manage ~/.openclaw/skills/takoapi
```

### Verify Installation
```bash
clawhub list | grep takoapi
```

## How It Works

This skill connects to the [TakoAPI](https://takoapi.com) marketplace API to:

1. **Search** — Queries `https://takoapi.com/api/agent?q={query}&format=json` for skill discovery
2. **Browse categories** — Fetches `https://takoapi.com/api/categories` for organized browsing
3. **Get top skills** — Uses `https://takoapi.com/api/skills?sort=popular&limit=1&category={slug}` per category
4. **Skill details** — Reads `https://takoapi.com/api/skills/{slug}` for full metadata

No API key required for reading. All data comes from TakoAPI's curated database of 5,000+ skills sourced from the community.

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /api/agent?format=json` | List top skills |
| `GET /api/agent?q={query}&format=json` | Search skills |
| `GET /api/categories` | List categories |
| `GET /api/skills?sort=popular&limit=1&category={slug}` | Top skill per category |
| `GET /api/skills/{slug}` | Skill detail page |

Full API docs: [takoapi.com](https://takoapi.com)

## Requirements

- [OpenClaw](https://openclaw.ai) agent
- Internet access (for TakoAPI API calls)

## Contributing

We welcome contributions! Here's how:

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes to `SKILL.md`
4. Test with your local OpenClaw setup
5. Submit a pull request

### Ideas for Contributions
- Add skill comparison features (side-by-side)
- Add skill dependency resolution
- Add batch install from curated lists
- Improve deduplication heuristics
- Add skill update checking

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [TakoAPI Marketplace](https://takoapi.com) — Browse skills on the web
- [OpenClaw Documentation](https://docs.openclaw.ai) — Learn about OpenClaw skills
- [ClawHub](https://clawskills.sh) — OpenClaw skill registry
