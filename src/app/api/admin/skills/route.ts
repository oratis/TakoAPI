import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { clampPagination } from "@/lib/pagination";
import { NO_STORE_HEADERS } from "@/lib/http";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  return withAdmin(req, "/api/admin/skills", async () => {
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = clampPagination(searchParams);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const q = searchParams.get("q");

    const where: Prisma.SkillWhereInput = {};
    if (status) where.status = status as Prisma.SkillWhereInput["status"];
    if (category) where.category = { slug: category };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { author: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        where,
        // readme holds a whole scraped SKILL.md — up to 500 KB a row, and 100 rows
        // a page. The moderation table never renders it; fetch it on the detail
        // view instead of shipping ~50 MB through the list endpoint.
        omit: { readme: true },
        include: {
          category: { select: { name: true, slug: true } },
          submitter: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.skill.count({ where }),
    ]);

    return NextResponse.json(
      {
        skills,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      // Carries submitter emails and unpublished submissions — never cacheable.
      { headers: NO_STORE_HEADERS }
    );
  });
}
