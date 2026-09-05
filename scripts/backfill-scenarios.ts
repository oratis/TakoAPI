/**
 * Backfill Agent.scenarios for rows that predate the scenario taxonomy.
 *
 * Classifies each agent from its name + description (the GitHub scraper also
 * folds in repo topics on fresh runs; this one-off pass works from what's in
 * the DB). Idempotent — safe to re-run; re-classifies every time so taxonomy
 * tweaks propagate.
 *
 *   npx tsx scripts/backfill-scenarios.ts            # classify all agents
 *   npx tsx scripts/backfill-scenarios.ts --only-empty   # skip already-tagged
 *   npx tsx scripts/backfill-scenarios.ts --dry         # print, don't write
 *
 * Requires DATABASE_URL. Apply migration 007_agent_scenarios first.
 */
import { PrismaClient } from "@prisma/client";
import { classifyScenarios, scenarioLabel } from "../src/lib/scenarios";

const prisma = new PrismaClient();

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function main() {
  const onlyEmpty = process.argv.includes("--only-empty");
  const dry = process.argv.includes("--dry");

  const agents = await prisma.agent.findMany({
    select: { id: true, name: true, description: true, repoName: true, scenarios: true },
  });
  console.log(`Loaded ${agents.length} agents${onlyEmpty ? " (will skip already-tagged)" : ""}${dry ? " [dry run]" : ""}`);

  let updated = 0;
  let unchanged = 0;
  let unmatched = 0;
  const tally = new Map<string, number>();

  for (const a of agents) {
    if (onlyEmpty && a.scenarios.length > 0) continue;
    const scenarios = classifyScenarios([a.name, a.description ?? "", a.repoName ?? ""].join(" "));
    for (const s of scenarios) tally.set(s, (tally.get(s) ?? 0) + 1);
    if (scenarios.length === 0) unmatched++;

    if (arraysEqual(scenarios, a.scenarios)) {
      unchanged++;
      continue;
    }
    if (!dry) {
      await prisma.agent.update({ where: { id: a.id }, data: { scenarios } });
    }
    updated++;
    if (updated % 100 === 0) console.log(`  …${updated} updated`);
  }

  console.log(`\nDone: ${updated} updated, ${unchanged} unchanged, ${unmatched} unmatched (no scenario).`);
  console.log("\nScenario distribution:");
  for (const [slug, n] of [...tally.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`  ${String(n).padStart(5)}  ${scenarioLabel(slug)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
