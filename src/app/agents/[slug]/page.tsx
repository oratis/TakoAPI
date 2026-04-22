import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findAgentBySlug, AGENTS } from "@/lib/agents";
import SkillCard from "@/components/ui/SkillCard";
import type { Skill } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return AGENTS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = findAgentBySlug(slug);
  if (!agent) return { title: "Agent not found" };
  return {
    title: `${agent.name} skills — TakoAPI`,
    description: agent.description,
  };
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = findAgentBySlug(slug);
  if (!agent) notFound();

  const skills = await prisma.skill.findMany({
    where: { status: "APPROVED", agentType: agent.key },
    include: { category: { select: { name: true, slug: true } } },
    orderBy: [{ ghStars: "desc" }, { likesCount: "desc" }, { createdAt: "desc" }],
    take: 48,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/agents" className="text-sm text-gray-500 hover:text-gray-700">
        ← All agents
      </Link>

      <div className="mt-4 mb-8">
        <div className={`h-1.5 w-12 rounded-full mb-4 bg-gradient-to-r ${agent.accent}`} />
        <h1 className="text-3xl font-bold">{agent.name}</h1>
        <p className="text-sm text-gray-600 mt-2 max-w-2xl">{agent.description}</p>
        <a
          href={agent.homepage}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-3 text-sm text-purple-600 hover:underline"
        >
          {agent.homepage.replace(/^https?:\/\//, "")}
        </a>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Top skills</h2>
        <Link
          href={`/skills?agent=${agent.key}`}
          className="text-sm text-purple-600 hover:underline"
        >
          Browse all →
        </Link>
      </div>

      {skills.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <p className="text-gray-500">No {agent.name} skills yet</p>
          <Link
            href="/submit"
            className="mt-2 inline-block text-sm text-purple-600 hover:underline"
          >
            Submit the first one
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill as unknown as Skill} />
          ))}
        </div>
      )}
    </div>
  );
}
