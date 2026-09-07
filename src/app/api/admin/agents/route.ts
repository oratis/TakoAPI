import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { clampPagination } from "@/lib/pagination";
import { NO_STORE_HEADERS } from "@/lib/http";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  return withAdmin(req, "/api/admin/agents", async () => {
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = clampPagination(searchParams);
    const status = searchParams.get("status");
    const q = searchParams.get("q");

    const where: Prisma.AgentWhereInput = {};
    if (status) where.status = status as Prisma.AgentWhereInput["status"];
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        // `include` (rather than `select`) returns every Agent scalar, which is what
        // the moderation table needs — kind and healthStatus among them, so a
        // reviewer can see at a glance whether a hosted endpoint is answering.
        include: {
          category: { select: { name: true, slug: true } },
          publisher: { select: { id: true, name: true, email: true } },
          _count: { select: { skills: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.agent.count({ where }),
    ]);

    return NextResponse.json(
      {
        agents,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      // Carries publisher emails and unpublished submissions — never cacheable.
      { headers: NO_STORE_HEADERS }
    );
  });
}
