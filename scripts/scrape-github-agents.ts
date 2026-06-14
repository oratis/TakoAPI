/**
 * Import top open-source agent PROJECTS from GitHub into the registry (kind=PROJECT).
 *
 *   GITHUB_TOKEN=ghp_... PAGES=2 MIN_STARS=200 MAX_AGENTS=2000 npx tsx scripts/scrape-github-agents.ts
 *   # add PROD_URL=postgresql://... to target production via the Cloud SQL proxy
 *
 * Logic lives in src/lib/scrape-agents.ts (shared with the /api/cron/scrape-agents
 * endpoint that runs this on a schedule server-side). Knobs via env: PAGES,
 * MIN_STARS, MAX_AGENTS, REQ_DELAY_MS. PAGES=1 ≈ 1.1k unique repos, PAGES=2 ≈ 2.7k.
 * Rate-limit-aware. Re-runnable: upserts by slug and refreshes star counts.
 */
import { PrismaClient } from "@prisma/client";
import { scrapeGithubAgents } from "@/lib/scrape-agents";

const db = new PrismaClient(
  process.env.PROD_URL ? { datasources: { db: { url: process.env.PROD_URL } } } : undefined
);

(async () => {
  const r = await scrapeGithubAgents(
    {
      token: process.env.GITHUB_TOKEN,
      pages: Number(process.env.PAGES) || 1,
      maxAgents: Number(process.env.MAX_AGENTS) || 500,
      minStars: Number(process.env.MIN_STARS) || 0,
      reqDelayMs: Number(process.env.REQ_DELAY_MS) || 1000,
      onProgress: (m) => console.log(m),
    },
    db
  );
  console.log(`imported/updated ${r.imported} project(s).`);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
