import { NextRequest, NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Cron-only endpoint: ping HOSTED agents' AgentCards and update
// healthStatus / healthCheckedAt. Wire to Cloud Scheduler, which sends
// `Authorization: Bearer <CRON_SECRET>` (the tako-cron-secret value).
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runHealthChecks();
  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
