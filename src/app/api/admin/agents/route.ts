import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  return withAdmin(req, "/api/admin/agents", async () => {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
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
        include: {
          category: { select: { name: true, slug: true } },
          publisher: { select: { id: true, name: true, email: true } },
          _count: { select: { skills: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
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
