import { NextRequest, NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Cron-only endpoint: ping HOSTED agents' AgentCards and update
// healthStatus / healthCheckedAt. Wire to Cloud Scheduler, which sends
// `Authorization: Bearer <CRON_SECRET>` (the tako-cron-secret value).
export const dynamic = "force-dynamic";
// Bounded probes (8-wide, 8s each) — give the run headroom as HOSTED count grows.
export const maxDuration = 120;

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const summary = await runHealthChecks();
  return NextResponse.json({ ...summary, durationMs: Date.now() - startedAt });
}

export const GET = handle;
export const POST = handle;
