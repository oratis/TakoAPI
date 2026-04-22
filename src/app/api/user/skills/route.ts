import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  let userId: string | null = null;

  if (apiKey) {
    const user = await prisma.user.findUnique({ where: { apiKey } });
    userId = user?.id || null;
  } else {
    const session = await auth();
    userId = session?.user?.id || null;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const where: { submitterId: string; status?: "PENDING" | "APPROVED" | "REJECTED" } = { submitterId: userId };
  if (statusFilter === "pending") where.status = "PENDING";
  else if (statusFilter === "approved") where.status = "APPROVED";
  else if (statusFilter === "rejected") where.status = "REJECTED";

  const skills = await prisma.skill.findMany({
    where,
    include: { category: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Stats use the full submission set (ignoring the filter) so counts stay stable across tabs.
  const allSkills = statusFilter
    ? await prisma.skill.findMany({
        where: { submitterId: userId },
        select: { status: true, likesCount: true, viewsCount: true },
      })
    : skills;

  const stats = {
    totalSkills: allSkills.length,
    approvedCount: allSkills.filter((s) => s.status === "APPROVED").length,
    pendingCount: allSkills.filter((s) => s.status === "PENDING").length,
    rejectedCount: allSkills.filter((s) => s.status === "REJECTED").length,
    totalLikes: allSkills.reduce((sum, s) => sum + s.likesCount, 0),
    totalViews: allSkills.reduce((sum, s) => sum + s.viewsCount, 0),
  };

  return NextResponse.json({ skills, stats });
}
