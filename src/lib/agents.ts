export type AgentKey =
  | "CLAUDE_CODE"
  | "CURSOR"
  | "WINDSURF"
  | "ZED"
  | "CODEX"
  | "COPILOT"
  | "AIDER"
  | "CLINE"
  | "GENERIC";

export interface AgentDescriptor {
  key: AgentKey;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  homepage: string;
  accent: string;
}

export const AGENTS: AgentDescriptor[] = [
  {
    key: "CLAUDE_CODE",
    slug: "claude-code",
    name: "Claude Code",
    tagline: "Anthropic's official CLI for agentic coding.",
    description:
      "Skills, slash commands, hooks, and MCP servers that ship in the Claude Code runtime.",
    homepage: "https://www.claude.com/product/claude-code",
    accent: "from-purple-500 to-indigo-500",
  },
  {
    key: "CURSOR",
    slug: "cursor",
    name: "Cursor",
    tagline: "AI-first editor with .cursorrules and rules packs.",
    description:
      "Curated rules, context files, and project templates consumed by the Cursor IDE.",
    homepage: "https://cursor.com",
    accent: "from-sky-500 to-blue-500",
  },
  {
    key: "WINDSURF",
    slug: "windsurf",
    name: "Windsurf",
    tagline: "Cascade workflows and rule packs for the Windsurf editor.",
    description:
      "Flows, memories, and rule files that plug into Windsurf's Cascade orchestration.",
    homepage: "https://windsurf.com",
    accent: "from-cyan-500 to-teal-500",
  },
  {
    key: "CODEX",
    slug: "codex",
    name: "Codex CLI",
    tagline: "OpenAI's open-source coding agent.",
    description: "Prompts, configs, and tools that extend the Codex CLI workflow.",
    homepage: "https://github.com/openai/codex",
    accent: "from-emerald-500 to-green-500",
  },
  {
    key: "AIDER",
    slug: "aider",
    name: "Aider",
    tagline: "AI pair programming in your terminal.",
    description: "Conventions files, model configs, and helper scripts used with Aider.",
    homepage: "https://aider.chat",
    accent: "from-orange-500 to-amber-500",
  },
  {
    key: "CLINE",
    slug: "cline",
    name: "Cline",
    tagline: "Autonomous coding agent for VS Code.",
    description:
      "Custom instruction packs and tool configurations for the Cline VS Code extension.",
    homepage: "https://cline.bot",
    accent: "from-rose-500 to-pink-500",
  },
  {
    key: "COPILOT",
    slug: "copilot",
    name: "GitHub Copilot",
    tagline: "Custom instructions for Copilot Chat and agent mode.",
    description:
      "copilot-instructions files and Copilot-flavored prompt packs for enterprise workflows.",
    homepage: "https://github.com/features/copilot",
    accent: "from-gray-600 to-slate-600",
  },
  {
    key: "ZED",
    slug: "zed",
    name: "Zed",
    tagline: "High-performance collaborative editor with AI hooks.",
    description: "Assistant configs, prompts, and extensions that target the Zed editor.",
    homepage: "https://zed.dev",
    accent: "from-violet-500 to-fuchsia-500",
  },
  {
    key: "GENERIC",
    slug: "generic",
    name: "Other agents",
    tagline: "Model-agnostic prompts and skill packs.",
    description:
      "Skills that target multiple coding agents or bring-your-own-LLM harnesses.",
    homepage: "https://github.com/topics/ai-coding-assistant",
    accent: "from-neutral-500 to-stone-500",
  },
];

export function findAgentBySlug(slug: string): AgentDescriptor | undefined {
  return AGENTS.find((a) => a.slug === slug);
}
