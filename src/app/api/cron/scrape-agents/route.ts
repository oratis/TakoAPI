import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { scrapeGithubAgents } from "@/lib/scrape-agents";

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
    return NextResponse.json({
      ...result,
      pages,
      minStars,
      maxAgents,
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "scrape failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
