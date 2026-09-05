"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Terminal, Copy, Check, FileText, Play, Server, Boxes } from "lucide-react";

const UNIVERSAL = "curl -fsSL https://takoapi.com/install.sh | sh";
const UNINSTALL = "curl -fsSL https://takoapi.com/install.sh | sh -s -- --uninstall";
const NPX = "npx takoapi-install";

const PLATFORMS = [
  {
    key: "claude",
    name: "Claude Code",
    native: [
      "claude plugin marketplace add oratis/TakoAPI",
      "claude plugin install takoapi@takoapi",
    ],
    writes: ["~/.claude/skills/takoapi/SKILL.md"],
    mcp: "claude mcp add --transport http takoapi https://takoapi.com/mcp",
  },
  {
    key: "codex",
    name: "Codex",
    native: ["curl -fsSL https://takoapi.com/install.sh | sh -s -- --codex"],
    writes: [
      "~/.agents/skills/takoapi/SKILL.md",
      "~/.codex/skills/takoapi/SKILL.md",
    ],
    mcp: '[mcp_servers.takoapi]\nurl = "https://takoapi.com/mcp"\nbearer_token_env_var = "TAKO_KEY"',
  },
  {
    key: "opencode",
    name: "OpenCode",
    native: ["curl -fsSL https://takoapi.com/install.sh | sh -s -- --opencode"],
    writes: [
      "~/.config/opencode/agent/takoapi.md",
      "~/.config/opencode/command/takoapi.md",
    ],
    mcp:
      '{\n  "mcp": {\n    "takoapi": {\n      "type": "remote",\n      "url": "https://takoapi.com/mcp",\n      "headers": { "Authorization": "Bearer YOUR_TAKO_KEY" }\n    }\n  }\n}',
  },
] as const;

type PlatformKey = (typeof PLATFORMS)[number]["key"];

// Maps each platform to its namespaced translation keys for human prose.
const PLATFORM_I18N: Record<PlatformKey, { tagline: string; use: string; mcpHint: string }> = {
  claude: { tagline: "claudeCodeTagline", use: "claudeCodeUse", mcpHint: "claudeCodeMcpHint" },
  codex: { tagline: "codexTagline", use: "codexUse", mcpHint: "codexMcpHint" },
  opencode: { tagline: "opencodeTagline", use: "opencodeUse", mcpHint: "opencodeMcpHint" },
};

function CopyButton({ text }: { text: string }) {
  const t = useTranslations("InstallTabs");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className="shrink-0 px-3 py-2.5 text-gray-400 hover:text-white transition-colors"
      aria-label={copied ? t("copied") : t("copy")}
    >
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function CommandLine({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center bg-gray-900 rounded-lg overflow-hidden">
      <Terminal className="h-4 w-4 ms-3 text-gray-500 shrink-0" />
      <code className="flex-1 px-3 py-2.5 text-sm font-mono text-gray-100 overflow-x-auto whitespace-pre">
        {cmd}
      </code>
      <CopyButton text={cmd} />
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-start bg-gray-900 rounded-lg overflow-hidden">
      <code className="flex-1 px-3 py-2.5 text-sm font-mono text-gray-100 overflow-x-auto whitespace-pre">
        {code}
      </code>
      <CopyButton text={code} />
    </div>
  );
}

export default function InstallTabs() {
  const t = useTranslations("InstallTabs");
  const [active, setActive] = useState<PlatformKey>("claude");
  const p = PLATFORMS.find((x) => x.key === active) ?? PLATFORMS[0];
  const i18n = PLATFORM_I18N[p.key];

  return (
    <div className="space-y-10">
      {/* Universal one-liner */}
      <div>
        <CommandLine cmd={UNIVERSAL} />
        <p className="mt-2 text-sm text-gray-500">
          {t.rich("universalNote", {
            npx: () => (
              <code className="text-xs font-mono bg-gray-100 rounded px-1 py-0.5">{NPX}</code>
            ),
          })}
        </p>
      </div>

      {/* Per-platform tabs */}
      <div>
        <div role="tablist" aria-label={t("tablistLabel")} className="flex flex-wrap gap-2">
          {PLATFORMS.map((x) => {
            const selected = active === x.key;
            return (
              <button
                key={x.key}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setActive(x.key)}
                className={
                  "rounded-full px-4 py-2 text-sm font-medium border transition-colors " +
                  (selected
                    ? "bg-purple-600 border-purple-600 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-purple-300")
                }
              >
                {x.name}
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-6">
          <div className="flex items-baseline gap-2">
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <span className="text-sm text-gray-400">{t(i18n.tagline)}</span>
          </div>

          {/* Method 1 — Skill */}
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              <Boxes className="h-3.5 w-3.5" /> {t("skillHeading")}
            </p>
            <div className="space-y-2">
              {p.native.map((cmd) => (
                <CommandLine key={cmd} cmd={cmd} />
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">{t("skillUniversalHint", { name: p.name })}</p>

            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  <FileText className="h-3.5 w-3.5" /> {t("writesHeading")}
                </p>
                <ul className="space-y-1">
                  {p.writes.map((w) => (
                    <li key={w}>
                      <code className="text-xs font-mono text-gray-600 bg-gray-100 rounded px-1.5 py-0.5 break-all">
                        {w}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  <Play className="h-3.5 w-3.5" /> {t("howToUseHeading")}
                </p>
                <p className="text-sm text-gray-600">{t(i18n.use)}</p>
              </div>
            </div>
          </div>

          {/* Method 2 — MCP server */}
          <div className="border-t border-gray-100 pt-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              <Server className="h-3.5 w-3.5" /> {t("mcpHeading")}
            </p>
            {p.mcp.includes("\n") ? <CodeBlock code={p.mcp} /> : <CommandLine cmd={p.mcp} />}
            <p className="mt-2 text-xs text-gray-400">{t(i18n.mcpHint)}</p>
            <p className="mt-2 text-sm text-gray-600">
              {t.rich("mcpToolsNote", {
                tool: (chunks) => (
                  <code className="text-xs font-mono bg-gray-100 rounded px-1 py-0.5">{chunks}</code>
                ),
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Uninstall */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">{t("uninstallHeading")}</h3>
        <CommandLine cmd={UNINSTALL} />
        <p className="mt-2 text-sm text-gray-500">{t("uninstallNote")}</p>
      </div>
    </div>
  );
}
