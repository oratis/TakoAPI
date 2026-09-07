import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { logIngestionRun } from "@/lib/ingestion-log";

// Cron-only endpoint: probe skill GitHub URLs for dead links (404) and record
// ghStatus + ghCheckedAt. Batched (take 200, oldest-checked first) to stay under
// the request budget. Wire to Cloud Scheduler weekly with
// `Authorization: Bearer <CRON_SECRET>`.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Re-probe a link at most this often. Also the "is this row due?" cutoff. */
const RECHECK_DAYS = 7;
/** Rows per run — bounded by maxDuration at ~100ms of politeness delay each. */
const BATCH_SIZE = 200;

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const cutoff = new Date(Date.now() - RECHECK_DAYS * 24 * 60 * 60 * 1000);

  try {
    const skills = await prisma.skill.findMany({
      where: {
        githubUrl: { not: null },
        OR: [{ ghCheckedAt: null }, { ghCheckedAt: { lt: cutoff } }],
      },
      select: { id: true, githubUrl: true },
      orderBy: { ghCheckedAt: { sort: "asc", nulls: "first" } },
      take: BATCH_SIZE,
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

    const checked = ok + notFound + errored;
    const errors: string[] = [];

    if (skills.length === 0) {
      // Careful: "nothing was due" is the NORMAL steady state here — every link was
      // probed less than RECHECK_DAYS ago — and must stay a 200, or a weekly job
      // that is simply up to date would page someone. The genuinely broken case is
      // narrower: the catalogue holds no GitHub-linked skills at all, which means
      // the ingestion that creates them has stopped. Counted only on this branch so
      // the normal path costs no extra query.
      const linked = await prisma.skill.count({ where: { githubUrl: { not: null } } });
      if (linked === 0) {
        errors.push("no skill in the catalogue has a githubUrl — nothing to probe, ingestion has stopped");
      }
    } else if (ok === 0 && notFound === 0) {
      // Every probe threw. A batch of 200 URLs that all fail is our egress or
      // GitHub refusing us wholesale, not 200 individually broken repos — and it
      // would otherwise write ghStatus="error" across the catalogue unremarked.
      errors.push(`all ${errored} GitHub probe(s) failed — check egress and GitHub reachability`);
    }

    const body = {
      checked: skills.length,
      probed: checked,
      ok,
      notFound,
      errored,
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    };
    // No revalidation: ghStatus / ghCheckedAt are moderation signals and are not
    // part of any public catalog read, so nothing cached goes stale here.
    const severity = logIngestionRun({
      job: "check-github",
      found: skills.length,
      imported: checked,
      skipped: skills.length - checked,
      durationMs: body.durationMs,
      errors,
    });
    return NextResponse.json(body, { status: severity === "ERROR" ? 500 : 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "github check failed";
    logIngestionRun({
      job: "check-github",
      found: 0,
      imported: 0,
      skipped: 0,
      durationMs: Date.now() - startedAt,
      errors: [message],
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
