import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clampPagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

const AGENT_TYPES = new Set([
  "CLAUDE_CODE",
  "CURSOR",
  "WINDSURF",
  "ZED",
  "CODEX",
  "COPILOT",
  "AIDER",
  "CLINE",
  "GENERIC",
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = clampPagination(searchParams);
  const category = searchParams.get("category");
  const sort = searchParams.get("sort") || "latest";
  const agentParam = searchParams.get("agent");
  const source = searchParams.get("source");

  const where: Prisma.SkillWhereInput = { status: "APPROVED" };
  if (category) where.category = { slug: category };
  if (agentParam) {
    const normalized = agentParam.toUpperCase().replace(/-/g, "_");
    if (AGENT_TYPES.has(normalized)) {
      where.agentType = normalized as Prisma.SkillWhereInput["agentType"];
    }
  }
  if (source === "github") where.source = "GITHUB_SCRAPE";
  else if (source === "user") where.source = "USER_SUBMITTED";
  else if (source === "curated") where.source = "CURATED";

  const orderBy: Prisma.SkillOrderByWithRelationInput =
    sort === "popular"
      ? { likesCount: "desc" }
      : sort === "views"
        ? { viewsCount: "desc" }
        : sort === "downloads"
          ? { downloads: "desc" }
          : sort === "stars"
            ? { ghStars: "desc" }
            : { createdAt: "desc" };

  const [skills, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      include: { category: { select: { name: true, slug: true } } },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.skill.count({ where }),
  ]);

  return NextResponse.json({
    skills,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
