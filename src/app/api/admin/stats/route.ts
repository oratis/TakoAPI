import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const [
    totalSkills,
    totalUsers,
    totalCategories,
    totalLikes,
    pendingSkills,
    totalViews,
    totalDownloads,
    recentSkills,
    topSkills,
  ] = await Promise.all([
    prisma.skill.count(),
    prisma.user.count(),
    prisma.category.count(),
    prisma.like.count(),
    prisma.skill.count({ where: { status: "PENDING" } }),
    prisma.skill.aggregate({ _sum: { viewsCount: true } }),
    prisma.skill.aggregate({ _sum: { downloads: true } }),
    prisma.skill.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, slug: true, author: true, createdAt: true, status: true },
    }),
    prisma.skill.findMany({
      orderBy: { downloads: "desc" },
      take: 5,
      select: { id: true, name: true, slug: true, downloads: true, likesCount: true, viewsCount: true },
    }),
  ]);

  return NextResponse.json({
    totalSkills,
    totalUsers,
    totalCategories,
    totalLikes,
    pendingSkills,
    totalViews: totalViews._sum.viewsCount || 0,
    totalDownloads: totalDownloads._sum.downloads || 0,
    recentSkills,
    topSkills,
  });
}
