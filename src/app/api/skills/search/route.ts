import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clampPagination } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const category = searchParams.get("category");
  const { page, limit, skip } = clampPagination(searchParams);

  if (!q) {
    return NextResponse.json({
      skills: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    });
  }

  const where = {
    status: "APPROVED" as const,
    AND: [
      {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { description: { contains: q, mode: "insensitive" as const } },
          { author: { contains: q, mode: "insensitive" as const } },
        ],
      },
      ...(category ? [{ category: { slug: category } }] : []),
    ],
  };

  const [skills, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      include: { category: { select: { name: true, slug: true } } },
      orderBy: { likesCount: "desc" },
      skip,
      take: limit,
    }),
    prisma.skill.count({ where }),
  ]);

  return NextResponse.json({
    skills,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
