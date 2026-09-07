import { NextRequest, NextResponse } from "next/server";
import type { AgentKind, SkillSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { NO_STORE_HEADERS } from "@/lib/http";

// Cron-only, READ-ONLY endpoint: how fresh is each ingestion source?
//
// Why it exists: between 2026-07-04 and 2026-09-05 the ClawSkills sync ran nightly
// and imported nothing, and every existing signal said the system was fine — the
// scheduler was green, the service was up, error rates were flat. Nothing anywhere
// answered the one question that mattered: "when did a row last arrive?" This
// endpoint answers it per source, and would have raised the alarm on 2026-07-07.
//
// WHAT A MONITOR SHOULD ALERT ON (wiring lives in docs/06-cron-schedule.md):
//   1. `jsonPayload.event="ingestion_health" AND severity="ERROR"` — a source with a
//      scheduled job behind it has added nothing in STALE_AFTER_HOURS. This is the
//      only signal that catches "ran successfully, produced nothing", and it fires
//      on the source rather than on any one job, so it survives a job being
//      renamed, paused, or quietly removed from the scheduler.
//   2. `jsonPayload.event="ingestion_run" AND severity="ERROR"` — a specific run
//      came back empty (src/lib/ingestion-log.ts). Faster and more precise; fires
//      the same day, and names the job.
//   3. Cloud Scheduler failure count on `tako-ingestion-health` ≥ 1 — the monitor
//      itself is unreachable, or CRON_SECRET expired. Without this, a dead monitor
//      is indistinguishable from a healthy pipeline.
//
// Alerts 1 and 3 have to be separate, which is why this endpoint answers 200 even
// when everything it reports is stale: if the monitor returned 5xx for an unhealthy
// pipeline, "the pipeline stopped" and "the monitor stopped" would arrive as the
// same Cloud Scheduler failure. The verdict is in the body and in the log line;
// the status code is reserved for the health of the monitor itself. (Scheduler
// discards response bodies, so the log line is what an alert actually reads.)
export const dynamic = "force-dynamic";
// Six aggregate queries against a shared-core instance; nothing to wait on.
export const maxDuration = 60;

/** Nothing new in three days from a job that runs at least daily = broken. */
const STALE_AFTER_HOURS = 72;

// The scheduled job behind each source, or null when nothing schedules it.
//
// `null` sources are still reported — an operator wants the whole picture — but
// they never raise the alert, because "no user submitted a skill for three days"
// and "the GitHub skills script has not been run by hand" are not incidents. A
// monitor that cries wolf on those gets muted, and then it catches nothing.
//
// Written as exhaustive Records rather than arrays on purpose: adding a value to
// SkillSource or AgentKind fails the build here until someone decides whether the
// new source is monitored. A silent default is how the last outage stayed silent.
const SKILL_SOURCE_JOBS: Record<SkillSource, string | null> = {
  CURATED: "takoapi-daily-sync", // Cloud Run Job, daily 03:00 UTC (scripts/daily-sync.ts)
  GITHUB_SCRAPE: null, // scripts/scrape-github-skills.ts, run by hand
  USER_SUBMITTED: null, // humans
};

const AGENT_KIND_JOBS: Record<AgentKind, string | null> = {
  PROJECT: "tako-scrape-agents", // daily 04:00 UTC
  HOSTED: "tako-import-hosted", // daily 04:30 UTC
};

type SourceFreshness = {
  /** Namespaced so `skill:CURATED` and an agent kind can never collide. */
  source: string;
  job: string | null;
  monitored: boolean;
  total: number;
  newest: string | null;
  ageHours: number | null;
  added24h: number;
  added7d: number;
  stale: boolean;
};

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const since24h = new Date(startedAt - 24 * 60 * 60 * 1000);
  const since7d = new Date(startedAt - 7 * 24 * 60 * 60 * 1000);

  const [skillTotals, skill24h, skill7d, agentTotals, agent24h, agent7d] = await Promise.all([
    prisma.skill.groupBy({ by: ["source"], _max: { createdAt: true }, _count: { _all: true } }),
    prisma.skill.groupBy({ by: ["source"], where: { createdAt: { gte: since24h } }, _count: { _all: true } }),
    prisma.skill.groupBy({ by: ["source"], where: { createdAt: { gte: since7d } }, _count: { _all: true } }),
    prisma.agent.groupBy({ by: ["kind"], _max: { createdAt: true }, _count: { _all: true } }),
    prisma.agent.groupBy({ by: ["kind"], where: { createdAt: { gte: since24h } }, _count: { _all: true } }),
    prisma.agent.groupBy({ by: ["kind"], where: { createdAt: { gte: since7d } }, _count: { _all: true } }),
  ]);

  // Keys are namespaced (`skill:CURATED`, `agent:PROJECT`) throughout, so the two
  // enums can never collide in these maps if one later gains a value the other has.
  const newestByKey = new Map<string, Date | null>([
    ...skillTotals.map((r) => [`skill:${r.source}`, r._max.createdAt] as const),
    ...agentTotals.map((r) => [`agent:${r.kind}`, r._max.createdAt] as const),
  ]);
  const countByKey = new Map<string, number>([
    ...skillTotals.map((r) => [`total:skill:${r.source}`, r._count._all] as const),
    ...agentTotals.map((r) => [`total:agent:${r.kind}`, r._count._all] as const),
    ...skill24h.map((r) => [`24h:skill:${r.source}`, r._count._all] as const),
    ...agent24h.map((r) => [`24h:agent:${r.kind}`, r._count._all] as const),
    ...skill7d.map((r) => [`7d:skill:${r.source}`, r._count._all] as const),
    ...agent7d.map((r) => [`7d:agent:${r.kind}`, r._count._all] as const),
  ]);

  // A groupBy returns no row for a value with no matching records, so a source that
  // has produced nothing — ever, or in the window — is absent rather than zero.
  // Every lookup below defaults, and the source list comes from the Records above,
  // so a source that stopped completely still appears in the report.
  function freshness(prefix: string, value: string, job: string | null): SourceFreshness {
    const key = `${prefix}:${value}`;
    const newest = newestByKey.get(key) ?? null;
    const ageMs = newest ? startedAt - newest.getTime() : null;
    const ageHours = ageMs === null ? null : ageMs / 3_600_000;
    return {
      source: key,
      job,
      monitored: job !== null,
      total: countByKey.get(`total:${key}`) ?? 0,
      newest: newest ? newest.toISOString() : null,
      ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
      added24h: countByKey.get(`24h:${key}`) ?? 0,
      added7d: countByKey.get(`7d:${key}`) ?? 0,
      // No row at all counts as stale: a source that never produced anything is not
      // in better shape than one that stopped producing.
      stale: ageHours === null || ageHours > STALE_AFTER_HOURS,
    };
  }

  const sources: SourceFreshness[] = [
    ...(Object.keys(SKILL_SOURCE_JOBS) as SkillSource[]).map((s) =>
      freshness("skill", s, SKILL_SOURCE_JOBS[s])
    ),
    ...(Object.keys(AGENT_KIND_JOBS) as AgentKind[]).map((k) =>
      freshness("agent", k, AGENT_KIND_JOBS[k])
    ),
  ];

  const staleSources = sources.filter((s) => s.stale).map((s) => s.source);
  // Only scheduled sources can raise the alarm — see SKILL_SOURCE_JOBS.
  const alertSources = sources.filter((s) => s.monitored && s.stale).map((s) => s.source);
  const alert = alertSources.length > 0;

  const body = {
    checkedAt: new Date(startedAt).toISOString(),
    staleAfterHours: STALE_AFTER_HOURS,
    alert,
    alertSources,
    staleSources,
    sources,
    durationMs: Date.now() - startedAt,
  };

  try {
    console.log(
      JSON.stringify({
        severity: alert ? "ERROR" : "INFO",
        message: alert
          ? `ingestion_health STALE: ${alertSources.join(", ")} (nothing added in >${STALE_AFTER_HOURS}h)`
          : `ingestion_health ok — ${sources.length} source(s) checked`,
        // Distinct from `ingestion_run`: that event describes one run's output, this
        // one describes the catalogue's state. An alert on runs cannot see a job that
        // stopped being scheduled at all; an alert on this one can.
        event: "ingestion_health",
        ...body,
      })
    );
  } catch {
    // A telemetry line is never worth failing the probe over.
  }

  return NextResponse.json(body, { headers: NO_STORE_HEADERS });
}

export const GET = handle;
