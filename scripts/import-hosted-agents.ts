/**
 * Import REAL hosted A2A agents (kind=HOSTED) into the registry from a list of
 * AgentCard URLs. Each URL is fetched and validated as an A2A AgentCard
 * (src/lib/agentcard.ts) before insert; unreachable/invalid cards are skipped
 * and reported. Idempotent: upserts by slug and refreshes skills + scenarios.
 *
 *   # from the community a2a-registry seed list (default), into the local DB:
 *   npx tsx scripts/import-hosted-agents.ts
 *
 *   # from a custom registry index (JSON: string[] or [{url|cardUrl|endpoint}]):
 *   REGISTRY_URL=https://example.com/agents.json npx tsx scripts/import-hosted-agents.ts
 *
 *   # from a local newline-delimited file of card URLs:
 *   CARDS_FILE=./cards.txt npx tsx scripts/import-hosted-agents.ts
 *
 *   # cap how many to process, and auto-approve (default PENDING → /admin/agents):
 *   MAX=10 STATUS=APPROVED npx tsx scripts/import-hosted-agents.ts
 *
 *   # target PRODUCTION via the Cloud SQL proxy (see docs HANDOFF §5):
 *   PROD_URL=postgresql://... npx tsx scripts/import-hosted-agents.ts
 *
 * Logic lives in src/lib/import-hosted.ts (shared with the /api/cron/import-hosted
 * endpoint that runs this on a schedule server-side).
 *
 * NOTE: these are THIRD-PARTY agents. Default status is PENDING so an admin
 * reviews them in /admin/agents before they go public. Importing to production
 * is a deliberate, consent-aware step — review the candidates first.
 */
import { PrismaClient, type AgentStatus } from "@prisma/client";
import { importHostedAgents } from "@/lib/import-hosted";

const db = new PrismaClient(
  process.env.PROD_URL ? { datasources: { db: { url: process.env.PROD_URL } } } : undefined
);

(async () => {
  const status: AgentStatus = process.env.STATUS === "APPROVED" ? "APPROVED" : "PENDING";
  const r = await importHostedAgents(
    {
      registryUrl: process.env.REGISTRY_URL,
      cardsFile: process.env.CARDS_FILE,
      status,
      max: Number(process.env.MAX) || 0,
      onProgress: (m) => console.log(m),
    },
    db
  );
  console.log(`imported/updated ${r.imported} agent(s), ${r.skipped} skipped.`);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
