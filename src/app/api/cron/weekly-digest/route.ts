import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendWeeklyDigest } from "@/lib/email";
import { logIngestionRun } from "@/lib/ingestion-log";

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

  const startedAt = Date.now();

  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Only APPROVED skills are public; pending/rejected rows must never reach
    // subscribers' inboxes.
    const [newSkillsCount, topSkills, totalSkills, subscribers] = await Promise.all([
      prisma.skill.count({ where: { status: "APPROVED", createdAt: { gte: oneWeekAgo } } }),
      prisma.skill.findMany({
        where: { status: "APPROVED" },
        orderBy: { downloads: "desc" },
        take: 10,
        select: { name: true, slug: true, downloads: true },
      }),
      prisma.skill.count({ where: { status: "APPROVED" } }),
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

    const errors: string[] = [];
    // "Did work but produced nothing": there were recipients and not one email
    // went out, which is Resend down or an expired API key — never a quiet week.
    //
    // A PARTIAL failure is deliberately not escalated. Cloud Scheduler retries a
    // non-2xx and this endpoint is not idempotent: a retry re-sends to everyone who
    // already received the digest. Partial failures ride in `skipped` on the log
    // line instead, so an alert on `jsonPayload.job="weekly-digest" AND
    // jsonPayload.skipped > 0` still catches them without mailing anyone twice.
    if (subscribers.length > 0 && sent === 0) {
      errors.push(`digest reached none of ${subscribers.length} verified subscriber(s) — check the Resend key`);
    }

    const body = {
      sent,
      failed,
      total: subscribers.length,
      newSkillsCount,
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    };
    // No revalidation: this run only reads the catalog, it does not change it.
    const severity = logIngestionRun({
      job: "weekly-digest",
      // Zero verified subscribers is a genuine no-op, not a broken run — a young
      // list is normal and stays a 200.
      found: subscribers.length,
      imported: sent,
      skipped: failed,
      durationMs: body.durationMs,
      errors,
    });
    return NextResponse.json(body, { status: severity === "ERROR" ? 500 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "digest failed";
    console.error("Weekly digest error:", error);
    logIngestionRun({
      job: "weekly-digest",
      found: 0,
      imported: 0,
      skipped: 0,
      durationMs: Date.now() - startedAt,
      errors: [message],
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
