import { prisma } from "@/lib/prisma";
import { fetchAgentCard, AgentCardError } from "@/lib/agentcard";

// Health checks for HOSTED agents — fetch each agent's AgentCard and record a
// status so the marketplace can flag dead/degraded endpoints. Run on a cron via
// /api/cron/health. See docs/agent-marketplace/03-technical-architecture.md §7.

export type Health = "ok" | "degraded" | "down";

const PROBE_CONCURRENCY = 8;

function classify(err: unknown): Health {
  // Reachable host but no valid card (HTTP error / malformed JSON) → degraded:
  // the A2A endpoint may still serve calls even without a published card.
  // Unreachable / timeout / blocked URL → down.
  if (err instanceof AgentCardError) {
    return /could not reach|invalid url|private\/loopback|only http/i.test(err.message) ? "down" : "degraded";
  }
  return "down";
}

export async function probeAgentHealth(agent: { cardUrl: string | null; endpointUrl: string | null }): Promise<Health> {
  const target = agent.cardUrl || agent.endpointUrl;
  if (!target) return "down";
  try {
    await fetchAgentCard(target);
    return "ok";
  } catch (e) {
    return classify(e);
  }
}

export type HealthSummary = {
  checked: number;
  ok: number;
  degraded: number;
  down: number;
  /** Persist failures — surfaced instead of being silently swallowed. */
  writeErrors: number;
  checkedAt: string;
};

/** Probe all APPROVED HOSTED agents (bounded concurrency) and persist their health. */
export async function runHealthChecks(): Promise<HealthSummary> {
  const agents = await prisma.agent.findMany({
    where: { kind: "HOSTED", status: "APPROVED" },
    select: { id: true, cardUrl: true, endpointUrl: true },
  });

  const now = new Date();
  const summary: HealthSummary = { checked: agents.length, ok: 0, degraded: 0, down: 0, writeErrors: 0, checkedAt: now.toISOString() };

  for (let i = 0; i < agents.length; i += PROBE_CONCURRENCY) {
    const batch = agents.slice(i, i + PROBE_CONCURRENCY);
    const results = await Promise.all(batch.map(async (a) => ({ id: a.id, health: await probeAgentHealth(a) })));
    await Promise.all(
      results.map((r) => {
        summary[r.health]++;
        // Don't let one failed write abort the batch, but do count it so a
        // systemic DB problem shows up in the summary rather than vanishing.
        return prisma.agent
          .update({ where: { id: r.id }, data: { healthStatus: r.health, healthCheckedAt: now } })
          .catch(() => {
            summary.writeErrors++;
          });
      })
    );
  }
  return summary;
}
