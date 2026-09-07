import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { scrapeGithubAgents } from "@/lib/scrape-agents";
import { logIngestionRun } from "@/lib/ingestion-log";
import { revalidateAgents } from "@/lib/revalidate";

// Cron-only endpoint: refresh the open-source PROJECT directory from GitHub.
// Idempotent (upserts by slug, refreshes stars), so a scheduled run keeps the
// catalog fresh and adds newly-popular repos. Wire to Cloud Scheduler with
// `Authorization: Bearer <CRON_SECRET>`. Tunable via ?pages=&minStars=&max=.
export const dynamic = "force-dynamic";
// NOTE: on Cloud Run (output: "standalone") the effective ceiling is the
// service's request timeout, not this Vercel-style export — keep the Cloud Run
// timeout ≥ this. `durationMs` in the response lets the scheduler log spot runs
// that approach the limit (a truncated run leaves partial, non-transactional writes).
export const maxDuration = 300;

function intParam(v: string | null, def: number, min: number, max: number): number {
  const n = parseInt(v || "", 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const sp = new URL(req.url).searchParams;
  // Defaults match the live catalog (PAGES=1 keeps it fast enough for a sync
  // request; raise pages for a deeper backfill). Bounded to protect the request.
  const pages = intParam(sp.get("pages"), 1, 1, 3);
  const minStars = intParam(sp.get("minStars"), 200, 0, 100_000);
  const maxAgents = intParam(sp.get("max"), 2000, 1, 3000);
  try {
    const result = await scrapeGithubAgents(
      { token: process.env.GITHUB_TOKEN, pages, minStars, maxAgents, reqDelayMs: 900 },
      prisma
    );

    // `found: 0` is the broken-scrape signature: GitHub answered, nothing threw,
    // and 20 topic queries matched nothing (revoked token, exhausted rate limit,
    // changed search API). scrapeGithubAgents already throws on that, so this is a
    // belt-and-braces check — a run that reports zero candidates must never leave
    // a green tick in Cloud Scheduler.
    //
    // `imported: 0` with `found > 0` is NOT a failure here: the minStars filter and
    // the admin-rejected tombstone list can legitimately consume every candidate.
    const errors =
      result.found === 0
        ? [
            `GitHub search returned no repositories (pages=${pages}, minStars=${minStars}) — check GITHUB_TOKEN and rate limits`,
          ]
        : [];

    // Upserts change stars, descriptions and status on public PROJECT rows, so the
    // cached catalog reads have to be marked stale or the home page shows last
    // night's numbers until the 5-minute time bound expires.
    if (result.imported > 0) revalidateAgents();

    const body = {
      ...result,
      pages,
      minStars,
      maxAgents,
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    };
    const severity = logIngestionRun({
      job: "scrape-agents",
      found: result.found,
      imported: result.imported,
      skipped: result.skipped,
      durationMs: body.durationMs,
      errors,
    });
    // Non-2xx so Cloud Scheduler records a failed execution. Cloud Scheduler
    // discards the response body, so the status code is the only part of this
    // reply an operator ever sees without opening Logs Explorer.
    return NextResponse.json(body, { status: severity === "ERROR" ? 500 : 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "scrape failed";
    logIngestionRun({
      job: "scrape-agents",
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
