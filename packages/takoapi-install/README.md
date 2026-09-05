# takoapi-install

One command to install **[TakoAPI](https://takoapi.com)** — one API to access all agents — into your coding agent.

```bash
npx takoapi-install
```

Auto-detects **Claude Code**, **Codex**, and **OpenCode** and drops the TakoAPI skill into each. Cross-platform (macOS, Linux, Windows), zero dependencies, and the Node equivalent of `curl -fsSL https://takoapi.com/install.sh | sh`.

## Usage

```bash
npx takoapi-install              # auto-detect and install
npx takoapi-install --all        # install into all three
npx takoapi-install --claude     # one agent only (or --codex / --opencode)
npx takoapi-install --mcp        # print native MCP-server register commands
npx takoapi-install --uninstall  # remove TakoAPI again
```

## What it writes

| Agent | Path | Invoke |
|-------|------|--------|
| Claude Code | `~/.claude/skills/takoapi/SKILL.md` | loads automatically |
| Codex | `~/.agents/skills/takoapi/SKILL.md` (+ `~/.codex/skills/…`) | `$takoapi` or `/skills` |
| OpenCode | `~/.config/opencode/{agent,command}/takoapi.md` | `/takoapi` or `@takoapi` |

It only writes TakoAPI's own namespaced files — it never edits a shared config, never needs root, is idempotent, and is fully reversible with `--uninstall`.

## MCP server

TakoAPI is also a hosted MCP server. Register it natively (no install):

```bash
claude mcp add --transport http takoapi https://takoapi.com/mcp
```

Run `npx takoapi-install --mcp` for the Codex and OpenCode snippets. The gateway tool (`invoke_agent`) needs an API key — create one at <https://takoapi.com/dashboard>.

## License

MIT
