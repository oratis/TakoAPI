#!/usr/bin/env node
// TakoAPI installer (npx) — cross-platform Node port of takoapi.com/install.sh.
//
//   npx takoapi-install            # auto-detect & install into your agents
//   npx takoapi-install --all      # install into all three
//   npx takoapi-install --mcp      # print native MCP-server register commands
//   npx takoapi-install --uninstall
//
// Zero dependencies (node: builtins only). Writes only TakoAPI's own namespaced
// files into each agent's skill directory — never edits a shared config, never
// needs root, idempotent, reversible with --uninstall. Same behavior as the
// shell installer, and Windows-friendly.
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const VERSION = "0.1.0";
const HERE = dirname(fileURLToPath(import.meta.url));
const asset = (name) => readFileSync(join(HERE, "..", "assets", name), "utf8");

// ---- output helpers --------------------------------------------------------
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (COLOR ? `[${code}m${s}[0m` : s);
const bold = (s) => c("1", s);
const ok = (s) => console.log(`${c("32", "✓")} ${s}`);
const info = (s) => console.log(`${c("36", "•")} ${s}`);
const warn = (s) => console.error(`${c("33", "!")} ${s}`);

// ---- target paths (respect XDG_CONFIG_HOME and CODEX_HOME) ------------------
const HOME = homedir();
const CODEX_HOME = process.env.CODEX_HOME || join(HOME, ".codex");
const XDG = process.env.XDG_CONFIG_HOME || join(HOME, ".config");

const CLAUDE_SKILL = join(HOME, ".claude", "skills", "takoapi", "SKILL.md");
// Codex reads the current ~/.agents/skills and the legacy ~/.codex/skills — write both.
const CODEX_SKILLS = [
  join(HOME, ".agents", "skills", "takoapi", "SKILL.md"),
  join(CODEX_HOME, "skills", "takoapi", "SKILL.md"),
];
const OPENCODE_AGENT = join(XDG, "opencode", "agent", "takoapi.md");
const OPENCODE_COMMAND = join(XDG, "opencode", "command", "takoapi.md");

const MCP_URL = "https://takoapi.com/mcp";

// ---- fs helpers ------------------------------------------------------------
function writeFile(dest, contents) {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, contents);
}
function remove(path) {
  rmSync(path, { force: true });
}
function pretty(path) {
  return path.startsWith(HOME) ? path.replace(HOME, "~") : path;
}

// ---- detection -------------------------------------------------------------
function onPath(bin) {
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of (process.env.PATH || "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      if (existsSync(join(dir, bin + ext))) return true;
    }
  }
  return false;
}
const claudePresent = () => onPath("claude") || existsSync(join(HOME, ".claude"));
const codexPresent = () => onPath("codex") || existsSync(CODEX_HOME) || existsSync(join(HOME, ".agents"));
const opencodePresent = () => onPath("opencode") || existsSync(join(XDG, "opencode"));

// ---- install / uninstall ---------------------------------------------------
function installClaude() {
  writeFile(CLAUDE_SKILL, asset("skill.md"));
  ok(`Claude Code  → ${pretty(CLAUDE_SKILL)}`);
  info("   loads automatically; ask Claude to \"find an agent on TakoAPI\".");
}
function installCodex() {
  for (const dest of CODEX_SKILLS) {
    writeFile(dest, asset("skill.md"));
    ok(`Codex        → ${pretty(dest)}`);
  }
  info("   invoke with $takoapi, or via the /skills menu.");
}
function installOpencode() {
  writeFile(OPENCODE_AGENT, asset("opencode-agent.md"));
  writeFile(OPENCODE_COMMAND, asset("opencode-command.md"));
  ok(`OpenCode     → ${pretty(OPENCODE_AGENT)}`);
  ok(`OpenCode     → ${pretty(OPENCODE_COMMAND)}`);
  info("   run /takoapi <query>, or hand off to @takoapi.");
}
function uninstallClaude() {
  rmSync(dirname(CLAUDE_SKILL), { recursive: true, force: true });
  ok("Removed Claude Code skill.");
}
function uninstallCodex() {
  for (const dest of CODEX_SKILLS) rmSync(dirname(dest), { recursive: true, force: true });
  ok("Removed Codex skill.");
}
function uninstallOpencode() {
  remove(OPENCODE_AGENT);
  remove(OPENCODE_COMMAND);
  ok("Removed OpenCode agent + command.");
}

// ---- --mcp: print native MCP-server register commands ----------------------
function printMcp() {
  console.log(bold("Register the TakoAPI MCP server (native, hosted):"));
  console.log("");
  console.log(c("36", "Claude Code"));
  console.log(`  claude mcp add --transport http takoapi ${MCP_URL}`);
  console.log(`  # for the gateway (invoke_agent), add your key:`);
  console.log(`  #   claude mcp add --transport http takoapi ${MCP_URL} --header "Authorization: Bearer $TAKO_KEY"`);
  console.log("");
  console.log(c("36", "Codex") + "  (~/.codex/config.toml)");
  console.log("  [mcp_servers.takoapi]");
  console.log(`  url = "${MCP_URL}"`);
  console.log(`  bearer_token_env_var = "TAKO_KEY"`);
  console.log("");
  console.log(c("36", "OpenCode") + "  (~/.config/opencode/opencode.json)");
  console.log('  { "mcp": { "takoapi": {');
  console.log(`      "type": "remote", "url": "${MCP_URL}", "enabled": true,`);
  console.log('      "headers": { "Authorization": "Bearer YOUR_TAKO_KEY" } } } }');
  console.log("");
  info("Read tools are anonymous; invoke_agent needs your key. Get one at https://takoapi.com/dashboard");
}

// ---- usage -----------------------------------------------------------------
function usage() {
  console.log(`${bold("TakoAPI installer")} v${VERSION} — one API to access all agents.

${bold("Usage:")} npx takoapi-install [options]

Installs the TakoAPI skill into every coding agent it detects (Claude Code,
Codex, OpenCode). If none are detected, installs into all three.

${bold("Options:")}
  --all          Install into all three regardless of what's detected
  --claude       Install into Claude Code only
  --codex        Install into Codex only
  --opencode     Install into OpenCode only
  --mcp          Print the native MCP-server register commands (no files written)
  --uninstall    Remove TakoAPI from the selected (or all) agents
  -h, --help     Show this help

Re-running is safe (idempotent). Homepage: https://takoapi.com/install`);
}

// ---- main ------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);

  if (has("-h") || has("--help")) return usage();
  for (const a of args) {
    if (!["--all", "--claude", "--codex", "--opencode", "--mcp", "--uninstall"].includes(a)) {
      warn(`unknown option: ${a} (try --help)`);
      process.exit(2);
    }
  }
  if (has("--mcp")) return printMcp();

  const explicit = has("--claude") || has("--codex") || has("--opencode");
  let want = {
    claude: has("--all") || has("--claude"),
    codex: has("--all") || has("--codex"),
    opencode: has("--all") || has("--opencode"),
  };
  if (!has("--all") && !explicit) {
    want = { claude: claudePresent(), codex: codexPresent(), opencode: opencodePresent() };
    if (!want.claude && !want.codex && !want.opencode) {
      warn("No Claude Code, Codex, or OpenCode detected — installing into all three so they're ready.");
      want = { claude: true, codex: true, opencode: true };
    }
  }

  if (has("--uninstall")) {
    console.log(bold("Uninstalling TakoAPI…"));
    if (want.claude) uninstallClaude();
    if (want.codex) uninstallCodex();
    if (want.opencode) uninstallOpencode();
    console.log("");
    ok("Done.");
    return;
  }

  console.log(`${bold("Installing TakoAPI")} ${c("2", "— one API to access all agents")}\n`);
  if (want.claude) installClaude();
  if (want.codex) installCodex();
  if (want.opencode) installOpencode();
  console.log("");
  ok(`Done. Get an API key for the gateway at ${c("36", "https://takoapi.com/dashboard")}`);
  info("Prefer a native MCP server? Run with --mcp, or see https://takoapi.com/install");
}

main();
