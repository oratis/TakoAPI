import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clampPagination } from "@/lib/pagination";
import { withRequestLog } from "@/lib/requestLog";
import { isScenarioSlug } from "@/lib/scenarios";
import { PUBLIC_CACHE_HEADERS } from "@/lib/http";
import { PUBLIC_AGENT_SELECT, toPublicAgent } from "@/lib/agent-dto";
import type { Prisma } from "@prisma/client";

const PROTOCOLS = new Set(["A2A", "OPENAI_COMPAT", "MCP"]);
const PRICING = new Set(["FREE", "PER_CALL", "PER_TASK", "PER_TOKEN"]);
const KINDS = new Set(["HOSTED", "PROJECT"]);

// Public agent listing. Whitelisted shape (see lib/agent-dto), cacheable, and the
// `kind` filter that the marketplace page already understood is exposed here too.
export async function GET(req: NextRequest) {
  return withRequestLog(req, "/api/agents", async () => {
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = clampPagination(searchParams);
    const category = searchParams.get("category");
    const scenario = searchParams.get("scenario");
    const protocol = searchParams.get("protocol");
    const pricing = searchParams.get("pricing");
    const kind = searchParams.get("kind")?.toUpperCase();
    const q = searchParams.get("q")?.trim();
    const sort = searchParams.get("sort") || "latest";

    const where: Prisma.AgentWhereInput = { status: "APPROVED" };
    if (kind && KINDS.has(kind)) where.kind = kind as Prisma.AgentWhereInput["kind"];
    if (category) where.category = { slug: category };
    if (isScenarioSlug(scenario)) where.scenarios = { has: scenario };
    if (protocol) {
      const p = protocol.toUpperCase();
      if (PROTOCOLS.has(p)) where.protocols = { has: p } as Prisma.AgentWhereInput["protocols"];
    }
    if (pricing) {
      const p = pricing.toUpperCase();
      if (PRICING.has(p)) where.pricingModel = p as Prisma.AgentWhereInput["pricingModel"];
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const orderBy: Prisma.AgentOrderByWithRelationInput[] =
      sort === "popular"
        ? [{ likesCount: "desc" }, { callsCount: "desc" }]
        : sort === "calls"
          ? [{ callsCount: "desc" }, { createdAt: "desc" }]
          : sort === "rating"
            ? [{ avgRating: "desc" }, { ratingCount: "desc" }]
            : sort === "stars"
              ? [{ stars: { sort: "desc", nulls: "last" } }, { callsCount: "desc" }]
              : [{ createdAt: "desc" }];

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        select: { ...PUBLIC_AGENT_SELECT, _count: { select: { skills: true } } },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.agent.count({ where }),
    ]);

    return NextResponse.json(
      {
        agents: agents.map(toPublicAgent),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      { headers: PUBLIC_CACHE_HEADERS }
    );
  });
}
