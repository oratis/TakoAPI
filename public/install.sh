#!/bin/sh
# TakoAPI — one-command installer for coding agents.
#
#   curl -fsSL https://takoapi.com/install.sh | sh
#
# Installs the TakoAPI skill (discover & invoke AI agents through one unified
# gateway, plus search the OpenClaw skills catalog) into whichever of
# Claude Code, Codex, and OpenCode you have. It only writes TakoAPI's own,
# namespaced files into your agent skill directories — it never edits a shared
# config, never needs root, is idempotent, and can be undone with --uninstall.
#
# Usage: install.sh [--all] [--claude] [--codex] [--opencode] [--uninstall] [--help]
#
# Homepage: https://takoapi.com   ·   License: MIT
set -eu

VERSION="0.1.0"

# ---------------------------------------------------------------------------
# Output helpers (color only on a TTY, and only when NO_COLOR is unset)
# ---------------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$(printf '\033[1m'); DIM=$(printf '\033[2m')
  GREEN=$(printf '\033[32m'); YELLOW=$(printf '\033[33m')
  CYAN=$(printf '\033[36m'); RESET=$(printf '\033[0m')
else
  BOLD=; DIM=; GREEN=; YELLOW=; CYAN=; RESET=
fi
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
info() { printf '%s•%s %s\n' "$CYAN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()  { printf 'Error: %s\n' "$*" >&2; exit 1; }

# Resolved config roots (respect XDG_CONFIG_HOME and CODEX_HOME)
CLAUDE_DIR="$HOME/.claude"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
AGENTS_SKILLS_DIR="$HOME/.agents/skills"           # Codex current user-skills location
OPENCODE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"

# ---------------------------------------------------------------------------
# Skill content — one shared body, platform-specific frontmatter.
# All heredocs are quoted (<<'EOF') so $TAKO_KEY / $ARGUMENTS / backticks stay
# literal in the written files.
# ---------------------------------------------------------------------------
print_body() {
  cat <<'BODY'
# TakoAPI — One API to access all agents

You help the user **discover and invoke AI agents** through TakoAPI
(https://takoapi.com) — one unified API to reach any registered agent — and
also browse the OpenClaw skills catalog. Use your HTTP capability — the
`WebFetch` tool if you have one, otherwise `curl` — to call the endpoints
below. Every path is relative to the base URL `https://takoapi.com`. Never
fabricate agent or skill data; always fetch it live.

## Discovery (no auth)
- `GET /api/registry?format=json` — list every agent. Filters: `q` (search),
  `category`, `protocol` (`A2A` | `OPENAI_COMPAT` | `MCP`), `limit`.
- `GET /api/agents/{slug}` — one agent's detail, capabilities, advertised skills.
- `GET /api/agent?format=json` — curated top skills (add `q=` to search).
- `GET /api/skills/search?q=...` — full-text skill search.

## Gateway (requires an API key)
Read the key from the `TAKO_KEY` environment variable; users create one at
https://takoapi.com/dashboard. Send it as `Authorization: Bearer $TAKO_KEY`.
- `POST /v1/agents/{slug}/message` — call an agent (A2A). Body: `{"text":"..."}`.
- `POST /v1/agents/{slug}/stream` — same, streamed back as SSE.
- `POST /v1/chat/completions` — OpenAI-compatible. Body:
  `{"model":"{slug}","messages":[...]}`. Point any OpenAI SDK at the base URL
  `https://takoapi.com/v1` and set `model` to the agent slug.

## How to respond
- **Find an agent** → fetch `/api/registry?q={query}&format=json`; present a
  Markdown table (name, what it does, protocols, pricing); inspect one via
  `/api/agents/{slug}`.
- **Call an agent** → make sure `TAKO_KEY` is set, POST to the gateway, return
  the agent's reply. On HTTP 401 the key is missing/invalid — point the user to
  https://takoapi.com/dashboard. Never print the key.
- **Find skills** → fetch `/api/agent?q={query}&format=json`; present the
  results; install one with `clawhub install {slug}`.
- **Publish an agent** → tell the user to submit its A2A AgentCard URL
  (`/.well-known/agent-card.json`) at https://takoapi.com/submit-agent.

Lead with the most relevant results and keep answers concise. If TakoAPI is
unreachable, say so and suggest visiting https://takoapi.com directly.
BODY
}

# --- Claude Code / Codex: a Skill with name+description frontmatter ----------
write_skill_file() { # $1 = destination path
  {
    cat <<'FM'
---
name: takoapi
description: Discover and invoke AI agents through TakoAPI's unified gateway (takoapi.com) — one API key, any agent — and search the OpenClaw skills catalog. Use when the user wants to find, call, or publish an agent, or browse coding-agent skills.
---
FM
    print_body
  } > "$1"
}

# --- OpenCode: a subagent definition ----------------------------------------
write_opencode_agent() { # $1 = destination path
  {
    cat <<'FM'
---
description: Discover and invoke AI agents through TakoAPI's unified gateway (takoapi.com), and search the OpenClaw skills catalog.
mode: subagent
permission:
  webfetch: allow
  bash: allow
---
FM
    print_body
  } > "$1"
}

# --- OpenCode: a /takoapi command that routes to the subagent ----------------
write_opencode_command() { # $1 = destination path
  {
    cat <<'FM'
---
description: Discover/invoke agents and search skills via TakoAPI (takoapi.com)
agent: takoapi
---
FM
    print_body
    # $ARGUMENTS is an OpenCode placeholder — keep it literal, do not expand here.
    # shellcheck disable=SC2016
    printf '\n---\nUser request: $ARGUMENTS\n'
  } > "$1"
}

# ---------------------------------------------------------------------------
# Per-platform install / uninstall
# ---------------------------------------------------------------------------
has() { command -v "$1" >/dev/null 2>&1; }

claude_present()   { has claude   || [ -d "$CLAUDE_DIR" ]; }
codex_present()    { has codex    || [ -d "$CODEX_HOME_DIR" ]; }
opencode_present() { has opencode || [ -d "$OPENCODE_DIR" ]; }

install_claude() {
  dir="$CLAUDE_DIR/skills/takoapi"
  mkdir -p "$dir"
  write_skill_file "$dir/SKILL.md"
  ok "Claude Code  → $dir/SKILL.md"
  info "   loads automatically; ask Claude to \"find an agent on TakoAPI\"."
}

install_codex() {
  # Current location (~/.agents/skills) + back-compat (~/.codex/skills).
  for base in "$AGENTS_SKILLS_DIR" "$CODEX_HOME_DIR/skills"; do
    mkdir -p "$base/takoapi"
    write_skill_file "$base/takoapi/SKILL.md"
    ok "Codex        → $base/takoapi/SKILL.md"
  done
  info "   invoke with \$takoapi, or via the /skills menu."
}

install_opencode() {
  mkdir -p "$OPENCODE_DIR/agent" "$OPENCODE_DIR/command"
  write_opencode_agent   "$OPENCODE_DIR/agent/takoapi.md"
  write_opencode_command "$OPENCODE_DIR/command/takoapi.md"
  ok "OpenCode     → $OPENCODE_DIR/agent/takoapi.md"
  ok "OpenCode     → $OPENCODE_DIR/command/takoapi.md"
  info "   run /takoapi <query>, or hand off to @takoapi."
}

uninstall_claude() {
  rm -rf "$CLAUDE_DIR/skills/takoapi"
  ok "Removed Claude Code skill."
}
uninstall_codex() {
  rm -rf "$AGENTS_SKILLS_DIR/takoapi" "$CODEX_HOME_DIR/skills/takoapi"
  ok "Removed Codex skill."
}
uninstall_opencode() {
  rm -f "$OPENCODE_DIR/agent/takoapi.md" "$OPENCODE_DIR/command/takoapi.md"
  ok "Removed OpenCode agent + command."
}

usage() {
  cat <<EOF
${BOLD}TakoAPI installer${RESET} v$VERSION — one API to access all agents.

${BOLD}Usage:${RESET} install.sh [options]

By default, installs into every coding agent it detects (Claude Code, Codex,
OpenCode). If none are detected, installs into all three so they're ready when
you adopt one.

${BOLD}Options:${RESET}
  --all          Install into all three regardless of what's detected
  --claude       Install into Claude Code only
  --codex        Install into Codex only
  --opencode     Install into OpenCode only
  --uninstall    Remove TakoAPI from the selected (or all) agents
  -h, --help     Show this help

Combine --claude/--codex/--opencode to target several. Re-running is safe
(idempotent). Homepage: https://takoapi.com
EOF
}

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------
WANT_CLAUDE=0; WANT_CODEX=0; WANT_OPENCODE=0
EXPLICIT=0; ALL=0; UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --all)       ALL=1 ;;
    --claude)    WANT_CLAUDE=1;   EXPLICIT=1 ;;
    --codex)     WANT_CODEX=1;    EXPLICIT=1 ;;
    --opencode)  WANT_OPENCODE=1; EXPLICIT=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help)   usage; exit 0 ;;
    *)           die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

# Resolve target set.
if [ "$ALL" -eq 1 ]; then
  WANT_CLAUDE=1; WANT_CODEX=1; WANT_OPENCODE=1
elif [ "$EXPLICIT" -eq 0 ]; then
  # No explicit targets: auto-detect.
  claude_present   && WANT_CLAUDE=1   || true
  codex_present    && WANT_CODEX=1    || true
  opencode_present && WANT_OPENCODE=1 || true
  if [ $((WANT_CLAUDE + WANT_CODEX + WANT_OPENCODE)) -eq 0 ]; then
    warn "No Claude Code, Codex, or OpenCode detected — installing into all three so they're ready."
    WANT_CLAUDE=1; WANT_CODEX=1; WANT_OPENCODE=1
  fi
fi

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
  say "${BOLD}Uninstalling TakoAPI…${RESET}"
  [ "$WANT_CLAUDE"   -eq 1 ] && uninstall_claude
  [ "$WANT_CODEX"    -eq 1 ] && uninstall_codex
  [ "$WANT_OPENCODE" -eq 1 ] && uninstall_opencode
  say ""
  ok "Done."
  exit 0
fi

say "${BOLD}Installing TakoAPI${RESET} ${DIM}— one API to access all agents${RESET}"
say ""
[ "$WANT_CLAUDE"   -eq 1 ] && install_claude
[ "$WANT_CODEX"    -eq 1 ] && install_codex
[ "$WANT_OPENCODE" -eq 1 ] && install_opencode
say ""
ok "Done. Get an API key for the gateway at ${CYAN}https://takoapi.com/dashboard${RESET}"
info "Set it once: export TAKO_KEY=sk-…   ·   Docs: https://takoapi.com/install"
