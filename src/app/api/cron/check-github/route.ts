import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Cron-only endpoint: probe skill GitHub URLs for dead links (404) and record
// ghStatus + ghCheckedAt. Batched (take 200, oldest-checked first) to stay under
// the request budget. Wire to Cloud Scheduler weekly with
// `Authorization: Bearer <CRON_SECRET>`.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const skills = await prisma.skill.findMany({
    where: {
      githubUrl: { not: null },
      OR: [{ ghCheckedAt: null }, { ghCheckedAt: { lt: oneWeekAgo } }],
    },
    select: { id: true, githubUrl: true },
    orderBy: { ghCheckedAt: { sort: "asc", nulls: "first" } },
    take: 200,
  });

  let ok = 0;
  let notFound = 0;
  let errored = 0;

  for (const skill of skills) {
    if (!skill.githubUrl) continue;
    try {
      const res = await fetch(skill.githubUrl, { method: "HEAD", redirect: "follow" });
      const status = res.status === 404 ? "404" : res.ok ? "ok" : "error";
      await prisma.skill.update({
        where: { id: skill.id },
        data: { ghStatus: status, ghCheckedAt: new Date() },
      });
      if (status === "ok") ok++;
      else if (status === "404") notFound++;
      else errored++;
    } catch {
      await prisma.skill.update({
        where: { id: skill.id },
        data: { ghStatus: "error", ghCheckedAt: new Date() },
      });
      errored++;
    }
    // Be polite to GitHub between probes.
    await new Promise((r) => setTimeout(r, 100));
  }

  return NextResponse.json({
    checked: skills.length,
    ok,
    notFound,
    errored,
    ranAt: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
