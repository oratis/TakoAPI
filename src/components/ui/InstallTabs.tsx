"use client";

import { useState } from "react";
import { Terminal, Copy, Check, FileText, Play } from "lucide-react";

const UNIVERSAL = "curl -fsSL https://takoapi.com/install.sh | sh";
const UNINSTALL = "curl -fsSL https://takoapi.com/install.sh | sh -s -- --uninstall";

const PLATFORMS = [
  {
    key: "claude",
    name: "Claude Code",
    tagline: "Anthropic's CLI",
    native: [
      "claude plugin marketplace add oratis/TakoAPI",
      "claude plugin install takoapi@takoapi",
    ],
    writes: ["~/.claude/skills/takoapi/SKILL.md"],
    use: "Loads automatically — just ask Claude to find an agent on TakoAPI.",
  },
  {
    key: "codex",
    name: "Codex",
    tagline: "OpenAI's CLI",
    native: ["curl -fsSL https://takoapi.com/install.sh | sh -s -- --codex"],
    writes: [
      "~/.agents/skills/takoapi/SKILL.md",
      "~/.codex/skills/takoapi/SKILL.md",
    ],
    use: "Invoke with $takoapi, or pick it from the /skills menu.",
  },
  {
    key: "opencode",
    name: "OpenCode",
    tagline: "opencode.ai",
    native: ["curl -fsSL https://takoapi.com/install.sh | sh -s -- --opencode"],
    writes: [
      "~/.config/opencode/agent/takoapi.md",
      "~/.config/opencode/command/takoapi.md",
    ],
    use: "Run /takoapi <query>, or hand off to @takoapi.",
  },
] as const;

type PlatformKey = (typeof PLATFORMS)[number]["key"];

function CopyButton({ text }: { text: string }) {
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
      aria-label={copied ? "Copied" : "Copy command"}
    >
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function CommandLine({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center bg-gray-900 rounded-lg overflow-hidden">
      <Terminal className="h-4 w-4 ml-3 text-gray-500 shrink-0" />
      <code className="flex-1 px-3 py-2.5 text-sm font-mono text-gray-100 overflow-x-auto whitespace-pre">
        {cmd}
      </code>
      <CopyButton text={cmd} />
    </div>
  );
}

export default function InstallTabs() {
  const [active, setActive] = useState<PlatformKey>("claude");
  const p = PLATFORMS.find((x) => x.key === active) ?? PLATFORMS[0];

  return (
    <div className="space-y-10">
      {/* Universal one-liner */}
      <div>
        <CommandLine cmd={UNIVERSAL} />
        <p className="mt-2 text-sm text-gray-500">
          Auto-detects Claude Code, Codex, and OpenCode and installs into each. Safe to re-run, no root needed.
        </p>
      </div>

      {/* Per-platform tabs */}
      <div>
        <div role="tablist" aria-label="Coding agents" className="flex flex-wrap gap-2">
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

        <div className="mt-5 rounded-2xl border border-gray-200 p-5 sm:p-6">
          <div className="flex items-baseline gap-2 mb-4">
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <span className="text-sm text-gray-400">{p.tagline}</span>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Install
          </p>
          <div className="space-y-2">
            {p.native.map((c) => (
              <CommandLine key={c} cmd={c} />
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            …or use the universal command above — it covers {p.name} too.
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                <FileText className="h-3.5 w-3.5" /> Writes
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
                <Play className="h-3.5 w-3.5" /> How to use
              </p>
              <p className="text-sm text-gray-600">{p.use}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Uninstall */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Uninstall</h3>
        <CommandLine cmd={UNINSTALL} />
        <p className="mt-2 text-sm text-gray-500">
          Removes only TakoAPI&apos;s own files — it never touches your other agent config.
        </p>
      </div>
    </div>
  );
}
