import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AGENTS } from "@/lib/agents";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Coding agents — TakoAPI",
  description:
    "Browse skills, rules, and prompt packs grouped by coding agent: Claude Code, Cursor, Windsurf, Codex, Aider, Cline, Copilot, Zed, and more.",
};

export default async function AgentsIndexPage() {
  const counts = await prisma.skill.groupBy({
    by: ["agentType"],
    where: { status: "APPROVED" },
    _count: { _all: true },
  });
  const countByAgent = new Map(counts.map((c) => [c.agentType, c._count._all]));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Coding agents</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-2xl">
          Skills and rule packs are organized by the coding agent they target. Pick an agent
          below to browse curated and community-submitted skills for it.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AGENTS.map((agent) => {
          const count = countByAgent.get(agent.key) ?? 0;
          return (
            <Link
              key={agent.key}
              href={`/agents/${agent.slug}`}
              className="group block rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-md transition"
            >
              <div className={`h-1.5 w-10 rounded-full mb-3 bg-gradient-to-r ${agent.accent}`} />
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900">{agent.name}</h2>
                <span className="text-xs text-gray-500 shrink-0">{count} skills</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{agent.tagline}</p>
              <p className="text-xs text-gray-400 mt-3 line-clamp-2">{agent.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
