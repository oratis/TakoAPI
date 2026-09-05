import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clampPagination } from "@/lib/pagination";
import { withRequestLog } from "@/lib/requestLog";
import { isScenarioSlug } from "@/lib/scenarios";
import type { Prisma } from "@prisma/client";

const PROTOCOLS = new Set(["A2A", "OPENAI_COMPAT", "MCP"]);
const PRICING = new Set(["FREE", "PER_CALL", "PER_TASK", "PER_TOKEN"]);

export async function GET(req: NextRequest) {
  return withRequestLog(req, "/api/agents", async () => {
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = clampPagination(searchParams);
    const category = searchParams.get("category");
    const scenario = searchParams.get("scenario");
    const protocol = searchParams.get("protocol");
    const pricing = searchParams.get("pricing");
    const q = searchParams.get("q");
    const sort = searchParams.get("sort") || "latest";

    const where: Prisma.AgentWhereInput = { status: "APPROVED" };
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

    const orderBy: Prisma.AgentOrderByWithRelationInput =
      sort === "popular"
        ? { likesCount: "desc" }
        : sort === "calls"
          ? { callsCount: "desc" }
          : sort === "rating"
            ? { avgRating: "desc" }
            : { createdAt: "desc" };

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        include: {
          category: { select: { name: true, slug: true } },
          _count: { select: { skills: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.agent.count({ where }),
    ]);

    return NextResponse.json({
      agents,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });
}
