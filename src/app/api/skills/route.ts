import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "24");
  const category = searchParams.get("category");
  const sort = searchParams.get("sort") || "latest";

  const where = category ? { category: { slug: category } } : {};

  const orderBy =
    sort === "popular"
      ? { likesCount: "desc" as const }
      : sort === "views"
        ? { viewsCount: "desc" as const }
        : sort === "downloads"
          ? { downloads: "desc" as const }
          : sort === "stars"
            ? { stars: "desc" as const }
            : { createdAt: "desc" as const };

  const [skills, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      include: { category: { select: { name: true, slug: true } } },
      orderBy,
      skip: (page - 1) * limit,
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
