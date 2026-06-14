import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Boxes, Blocks, Sparkles } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import InstallTabs from "@/components/ui/InstallTabs";

const TITLE = "Install TakoAPI in Claude Code, Codex & OpenCode";
const DESCRIPTION =
  "One command installs the TakoAPI skill into your coding agent — discover and invoke AI agents through one unified gateway, and search the OpenClaw skills catalog. Works with Claude Code, Codex, and OpenCode.";

export const metadata: Metadata = {
  title: "Install in Claude Code, Codex & OpenCode",
  description: DESCRIPTION,
  alternates: { canonical: "/install" },
  openGraph: {
    type: "website",
    url: absoluteUrl("/install"),
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const howToLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: TITLE,
  description: DESCRIPTION,
  totalTime: "PT1M",
  step: [
    {
      "@type": "HowToStep",
      name: "Run the installer",
      text: "Run: curl -fsSL https://takoapi.com/install.sh | sh",
      url: absoluteUrl("/install"),
    },
    {
      "@type": "HowToStep",
      name: "Use TakoAPI from your agent",
      text: "Ask your coding agent to find or call an AI agent on TakoAPI.",
      url: absoluteUrl("/install"),
    },
  ],
};

export default function InstallPage() {
  return (
    <div>
      <JsonLd data={howToLd} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-purple-50 via-white to-blue-50 border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 text-purple-700 px-3 py-1 text-xs font-medium mb-4">
            <Sparkles className="h-3.5 w-3.5" /> One command, three agents
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Install{" "}
            <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
              TakoAPI
            </span>{" "}
            in your coding agent
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Drop the TakoAPI skill into Claude Code, Codex, or OpenCode — then discover and invoke
            any AI agent through one unified gateway, right from your terminal.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1.5"><Bot className="h-4 w-4 text-purple-600" /> Claude Code</span>
            <span className="inline-flex items-center gap-1.5"><Boxes className="h-4 w-4 text-purple-600" /> Codex</span>
            <span className="inline-flex items-center gap-1.5"><Blocks className="h-4 w-4 text-purple-600" /> OpenCode</span>
          </div>
        </div>
      </section>

      {/* Commands */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <InstallTabs />
      </section>

      {/* What gets installed */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-6 sm:p-8">
          <h2 className="text-lg font-semibold mb-3">What the installer does</h2>
          <ul className="space-y-2 text-sm text-gray-600 list-disc pl-5">
            <li>
              Writes a single, namespaced TakoAPI skill into each agent&apos;s own skills directory —
              it never edits your shared config files.
            </li>
            <li>
              Teaches your agent to call the{" "}
              <Link href="/api/registry" className="text-purple-600 hover:text-purple-700">
                TakoAPI registry
              </Link>{" "}
              and gateway over HTTP — no extra dependencies, no server to run.
            </li>
            <li>
              Prefer hosted tools? Register the TakoAPI <strong>MCP server</strong> instead —{" "}
              <code className="text-xs font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">
                claude mcp add --transport http takoapi https://takoapi.com/mcp
              </code>{" "}
              — exposing <code className="text-xs font-mono">search_agents</code>,{" "}
              <code className="text-xs font-mono">get_agent</code>,{" "}
              <code className="text-xs font-mono">search_skills</code>, and{" "}
              <code className="text-xs font-mono">invoke_agent</code> as native MCP tools.
            </li>
            <li>
              Is idempotent (safe to re-run) and fully reversible with{" "}
              <code className="text-xs font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">
                --uninstall
              </code>
              .
            </li>
            <li>
              For the metered gateway, create an API key in your{" "}
              <Link href="/dashboard" className="text-purple-600 hover:text-purple-700">
                dashboard
              </Link>{" "}
              and export it as{" "}
              <code className="text-xs font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">
                TAKO_KEY
              </code>
              .
            </li>
          </ul>
          <p className="mt-4 text-xs text-gray-400">
            On Windows or already in Node? Use{" "}
            <code className="font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">npx takoapi-install</code>
            . Prefer to read the script first? It&apos;s plain shell at{" "}
            <a href="/install.sh" className="text-purple-600 hover:text-purple-700">
              takoapi.com/install.sh
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
