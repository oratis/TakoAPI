import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveApiUser } from "@/lib/api-user";
import { NO_STORE_HEADERS } from "@/lib/http";

// The signed-in user's own skill submissions, every status, with the reviewer's
// note. Authentication goes through the shared resolver (session or API key)
// rather than a fourth hand-rolled copy of the same lookup.
export async function GET(req: NextRequest) {
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status")?.toUpperCase();
  const status = (["PENDING", "APPROVED", "REJECTED"] as const).find((s) => s === statusFilter);

  const skills = await prisma.skill.findMany({
    where: { submitterId: user.id, ...(status ? { status } : {}) },
    // A submissions list never needs the README body.
    omit: { readme: true },
    include: { category: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Stats always cover the full submission set, so the tab counts do not change
  // when a tab is selected.
  const all = status
    ? await prisma.skill.findMany({
        where: { submitterId: user.id },
        select: { status: true, likesCount: true, viewsCount: true },
      })
    : skills;

  const stats = {
    totalSkills: all.length,
    approvedCount: all.filter((s) => s.status === "APPROVED").length,
    pendingCount: all.filter((s) => s.status === "PENDING").length,
    rejectedCount: all.filter((s) => s.status === "REJECTED").length,
    totalLikes: all.reduce((sum, s) => sum + s.likesCount, 0),
    totalViews: all.reduce((sum, s) => sum + s.viewsCount, 0),
  };

  return NextResponse.json({ skills, stats }, { headers: NO_STORE_HEADERS });
}
