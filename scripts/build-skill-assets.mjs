#!/usr/bin/env node
// Single source of truth for the TakoAPI skill body.
//
// The same instructions ship in five places — the Claude Code plugin, the npx
// installer's three assets, and the heredoc inside public/install.sh — and they
// had already drifted from each other. This script regenerates all of them from
// the body in takoapi_skill/SKILL.md (everything after its frontmatter, up to the
// "Install this skill" divider that only the GitHub-facing copy carries).
//
//   node scripts/build-skill-assets.mjs          # rewrite the generated copies
//   node scripts/build-skill-assets.mjs --check  # exit 1 if any copy is stale (CI)
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CHECK = process.argv.includes("--check");

const SOURCE = "takoapi_skill/SKILL.md";
const src = readFileSync(resolve(ROOT, SOURCE), "utf8");

// Body = after the closing frontmatter fence, before the standalone "---" that
// precedes "## Install this skill into your coding agent".
const fm = src.match(/^---\n[\s\S]*?\n---\n/);
if (!fm) throw new Error(`${SOURCE}: frontmatter not found`);
let body = src.slice(fm[0].length);
const divider = body.search(/\n---\n\n## Install this skill/);
if (divider !== -1) body = body.slice(0, divider);
body = body.replace(/\s+$/, "") + "\n";

const SKILL_FM = `---
name: takoapi
description: Discover and invoke AI agents through TakoAPI's unified gateway (takoapi.com) — one API key, any agent — and search the OpenClaw skills catalog. Use when the user wants to find, call, or publish an agent, or browse coding-agent skills.
---
`;
const OPENCODE_AGENT_FM = `---
description: Discover and invoke AI agents through TakoAPI's unified gateway (takoapi.com), and search the OpenClaw skills catalog.
mode: subagent
permission:
  webfetch: allow
  bash: allow
---
`;
const OPENCODE_COMMAND_FM = `---
description: Discover/invoke agents and search skills via TakoAPI (takoapi.com)
agent: takoapi
---
`;

const targets = [
  { file: "plugins/takoapi/skills/takoapi/SKILL.md", content: SKILL_FM + body },
  { file: "packages/takoapi-install/assets/skill.md", content: SKILL_FM + body },
  { file: "packages/takoapi-install/assets/opencode-agent.md", content: OPENCODE_AGENT_FM + body },
  {
    file: "packages/takoapi-install/assets/opencode-command.md",
    content: OPENCODE_COMMAND_FM + body + "\n---\nUser request: $ARGUMENTS\n",
  },
  {
    file: "public/install.sh",
    content: (() => {
      const sh = readFileSync(resolve(ROOT, "public/install.sh"), "utf8");
      const start = sh.indexOf("  cat <<'BODY'\n");
      const end = sh.indexOf("\nBODY\n", start);
      if (start === -1 || end === -1) throw new Error("public/install.sh: BODY heredoc not found");
      return sh.slice(0, start) + "  cat <<'BODY'\n" + body + sh.slice(end + 1);
    })(),
  },
];

let stale = 0;
for (const t of targets) {
  const path = resolve(ROOT, t.file);
  let current = "";
  try {
    current = readFileSync(path, "utf8");
  } catch {
    /* missing → will be written / reported */
  }
  if (current === t.content) continue;
  stale++;
  if (CHECK) {
    console.error(`stale: ${t.file} (regenerate with: npm run build:skill-assets)`);
  } else {
    writeFileSync(path, t.content);
    console.log(`wrote ${t.file}`);
  }
}

if (CHECK) {
  if (stale) process.exit(1);
  console.log(`skill assets: ${targets.length} generated copies match ${SOURCE} ✓`);
} else if (!stale) {
  console.log("skill assets already up to date");
}
