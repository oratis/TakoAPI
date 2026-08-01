import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendWeeklyDigest } from "@/lib/email";

// Cron-only endpoint: email the weekly digest (new-skill count, top skills,
// total) to every verified subscriber. Sends are throttled to ~2/sec to stay
// within Resend limits. No verified subscribers => no-op. Wire to Cloud
// Scheduler weekly with `Authorization: Bearer <CRON_SECRET>`.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [newSkillsCount, topSkills, totalSkills, subscribers] = await Promise.all([
      prisma.skill.count({ where: { createdAt: { gte: oneWeekAgo } } }),
      prisma.skill.findMany({
        orderBy: { downloads: "desc" },
        take: 10,
        select: { name: true, slug: true, downloads: true },
      }),
      prisma.skill.count(),
      prisma.subscriber.findMany({
        where: { verified: true },
        select: { email: true },
      }),
    ]);

    let sent = 0;
    let failed = 0;
    for (const sub of subscribers) {
      try {
        await sendWeeklyDigest(sub.email, { newSkillsCount, topSkills, totalSkills });
        sent++;
      } catch {
        failed++;
      }
      // Rate limit: ~2/sec to stay within Resend limits.
      await new Promise((r) => setTimeout(r, 500));
    }

    return NextResponse.json({
      sent,
      failed,
      total: subscribers.length,
      newSkillsCount,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Weekly digest error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
