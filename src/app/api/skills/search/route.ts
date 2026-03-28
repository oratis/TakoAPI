import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "24");
  const category = searchParams.get("category");

  if (!q.trim()) {
    return NextResponse.json({ skills: [], pagination: { page, limit, total: 0, totalPages: 0 } });
  }

  const where = {
    AND: [
      {
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
          { author: { contains: q } },
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
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.skill.count({ where }),
  ]);

  return NextResponse.json({
    skills,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
