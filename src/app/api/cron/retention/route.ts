import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Cron-only endpoint: age out RequestLog rows. Nothing had ever deleted from this
// table — `maybeClean()` in ratelimit.ts only sweeps RateLimitBucket — so it grew
// without bound on a db-f1-micro with a 10 GB disk.
//
// Wire to Cloud Scheduler with `Authorization: Bearer <CRON_SECRET>`, same shape as
// the takoapi-health job. Until that job exists this route is inert: it is only
// reachable by something that already holds the cron secret.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Rows older than this are removed. */
const RETENTION_DAYS = 90;
/** Rows per statement — small enough not to hold a long lock on a shared-core instance. */
const BATCH_SIZE = 5_000;
/** Ceiling on batches per run, so one invocation cannot run past maxDuration. */
const MAX_BATCHES = 20;

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  let deleted = 0;
  let batches = 0;
  let exhausted = false;

  try {
    for (; batches < MAX_BATCHES; batches++) {
      // Deleted in batches because a single unbounded DELETE over a large backlog
      // would hold locks and bloat WAL on a shared-core instance.
      //
      // PostgreSQL's DELETE has no LIMIT clause — the batching has to go through a
      // subquery, and `ctid` is the cheapest row identifier to drive it with.
      const n = await prisma.$executeRaw`
        DELETE FROM "RequestLog"
        WHERE ctid IN (
          SELECT ctid FROM "RequestLog"
          WHERE "createdAt" < now() - make_interval(days => ${RETENTION_DAYS}::int)
          LIMIT ${BATCH_SIZE}::int
        )
      `;
      deleted += n;
      if (n < BATCH_SIZE) {
        exhausted = true;
        break;
      }
    }
  } catch (err) {
    console.error("[retention] RequestLog purge failed", {
      deleted,
      batches,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "retention sweep failed", deleted, batches },
      { status: 500 }
    );
  }

  // `exhausted: false` means the backlog outlived MAX_BATCHES — the next scheduled
  // run continues where this one stopped. Surfaced so a permanent backlog is visible
  // rather than looking like a successful run every time.
  return NextResponse.json({
    table: "RequestLog",
    retentionDays: RETENTION_DAYS,
    deleted,
    batches,
    exhausted,
    durationMs: Date.now() - startedAt,
  });
}

export const GET = handle;
export const POST = handle;
