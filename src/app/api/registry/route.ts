import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const BASE = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://takoapi.com";

// Agent-readable curated registry: the "one API to discover all agents" directory.
// Defaults to Markdown (for agents/LLMs); ?format=json for structured A2A-style data.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "md";
  const q = searchParams.get("q");
  const category = searchParams.get("category");
  const protocol = searchParams.get("protocol");

  const where: Prisma.AgentWhereInput = { status: "APPROVED" };
  if (category) where.category = { slug: category };
  if (protocol && ["A2A", "OPENAI_COMPAT", "MCP"].includes(protocol.toUpperCase())) {
    where.protocols = { has: protocol.toUpperCase() } as Prisma.AgentWhereInput["protocols"];
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const agents = await prisma.agent.findMany({
    where,
    include: {
      category: { select: { slug: true } },
      skills: { select: { skillKey: true, name: true } },
    },
    orderBy: [{ featured: "desc" }, { callsCount: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  if (format === "json") {
    return NextResponse.json({
      name: "TakoAPI Agent Registry",
      description: "One API to access all agents.",
      count: agents.length,
      agents: agents.map((a) => ({
        name: a.name,
        slug: a.slug,
        description: a.description,
        url: `${BASE}/agents/${a.slug}`,
        kind: a.kind,
        endpoint: a.endpointUrl,
        github: a.githubUrl,
        stars: a.stars,
        protocols: a.protocols,
        streaming: a.streaming,
        pricing: { model: a.pricingModel, unitUsd: a.unitPriceUsd ? Number(a.unitPriceUsd) : null },
        category: a.category?.slug ?? null,
        agentCard: a.cardUrl,
        skills: a.skills.map((s) => ({ id: s.skillKey, name: s.name })),
      })),
    });
  }

  let md = `# TakoAPI Agent Registry\n\n`;
  md += `> One API to access all agents.\n`;
  md += `> JSON: ${BASE}/api/registry?format=json\n\n`;
  if (q) md += `## Search: "${q}"\n\n`;
  md += `| Agent | Description | Protocols | Pricing | Skills |\n`;
  md += `|-------|-------------|-----------|---------|--------|\n`;
  for (const a of agents) {
    const price =
      a.pricingModel === "FREE"
        ? "Free"
        : `${a.pricingModel.replace("PER_", "")}${a.unitPriceUsd ? ` $${Number(a.unitPriceUsd)}` : ""}`;
    md += `| [${a.name}](${BASE}/agents/${a.slug}) | ${a.description.slice(0, 80)} | ${a.protocols.join(", ")} | ${price} | ${a.skills.length} |\n`;
  }
  md += `\n---\n`;
  md += `Browse: ${BASE}/agents\n`;
  md += `Publish an agent: POST ${BASE}/api/agents/submit\n`;

  return new NextResponse(md, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
