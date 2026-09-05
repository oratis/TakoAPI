import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { importHostedAgents } from "@/lib/import-hosted";

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
    return NextResponse.json({ ...result, max, durationMs: Date.now() - startedAt, ranAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "import failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
