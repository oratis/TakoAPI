import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { importHostedAgents } from "@/lib/import-hosted";
import { logIngestionRun } from "@/lib/ingestion-log";
import { revalidateAgents } from "@/lib/revalidate";

// Cron-only endpoint: import/refresh REAL hosted A2A agents (kind=HOSTED) from
// the community registry index. Each card is fetched + validated before insert;
// idempotent (upserts by slug, refreshes skills + scenarios). Wire to Cloud
// Scheduler with `Authorization: Bearer <CRON_SECRET>`. Tunable via ?max=.
// Imported agents land as PENDING for admin review in /admin/agents.
export const dynamic = "force-dynamic";
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
  // 0 = no cap. Bounded to protect the request from an over-large registry.
  const max = intParam(sp.get("max"), 0, 0, 1000);
  try {
    // Default status PENDING — third-party agents await admin review.
    const result = await importHostedAgents({ max, status: "PENDING" }, prisma);

    // importHostedAgents reports one outcome per card URL it was handed, so
    // imported + skipped is the size of the registry index (after ?max=).
    const found = result.imported + result.skipped;

    const errors: string[] = [];
    // The registry index parsed to zero card URLs: reachable, well-formed JSON,
    // nothing in it. That is the broken-source signature — the index moved, or its
    // shape changed and loadUrls' "first array-valued property" heuristic missed.
    if (found === 0) {
      errors.push("registry index yielded no AgentCard URLs — check the index URL and its shape");
    } else if (result.imported === 0) {
      // Deliberate: this is NOT the "everything was already up to date" case that
      // makes `imported: 0` normal elsewhere. This importer re-upserts every card
      // it can fetch and counts each one, unchanged or not — so zero imports out of
      // a non-empty index means every single card failed to fetch or validate.
      errors.push(`all ${found} registry card(s) failed to fetch or validate`);
    }

    // Most imports land as PENDING and are invisible until an admin approves them,
    // but the same run refreshes endpoints, skills and scenarios on already-APPROVED
    // rows — public data — so the catalog caches still need marking stale.
    if (result.imported > 0) revalidateAgents();

    const body = {
      ...result,
      found,
      max,
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    };
    const severity = logIngestionRun({
      job: "import-hosted",
      found,
      imported: result.imported,
      skipped: result.skipped,
      durationMs: body.durationMs,
      errors,
    });
    // Non-2xx so Cloud Scheduler records a failed execution rather than a green tick.
    return NextResponse.json(body, { status: severity === "ERROR" ? 500 : 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "import failed";
    logIngestionRun({
      job: "import-hosted",
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
