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
 * NOTE: these are THIRD-PARTY agents. Default status is PENDING so an admin
 * reviews them in /admin/agents before they go public. Importing to production
 * is a deliberate, consent-aware step — review the candidates first.
 */
import { PrismaClient, Prisma, type AgentStatus } from "@prisma/client";
import { fetchAgentCard, AgentCardError } from "@/lib/agentcard";
import { classifyScenarios } from "@/lib/scenarios";

// Community-maintained directory of live, hosted A2A agents (AgentCard URLs).
const DEFAULT_REGISTRY =
  "https://raw.githubusercontent.com/prassanna-ravishankar/a2a-registry/main/scripts/seed_data.json";

const db = new PrismaClient(
  process.env.PROD_URL ? { datasources: { db: { url: process.env.PROD_URL } } } : undefined
);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

const dedupe = (a: string[]) => Array.from(new Set(a));

// Resolve the list of AgentCard URLs from a local file, a registry index URL,
// or the default community registry. Index entries may be plain strings or
// objects with a url / cardUrl / endpoint field.
async function loadUrls(): Promise<string[]> {
  if (process.env.CARDS_FILE) {
    const fs = await import("node:fs/promises");
    const text = await fs.readFile(process.env.CARDS_FILE, "utf8");
    return dedupe(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  }
  const url = process.env.REGISTRY_URL || DEFAULT_REGISTRY;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`registry fetch failed: HTTP ${res.status} (${url})`);
  const json: unknown = await res.json();
  // Accept a bare array, or an object whose first array-valued property holds the
  // entries (e.g. { wellKnownURIs: [...] }, { agents: [...] }).
  const arr: unknown[] = Array.isArray(json)
    ? json
    : json && typeof json === "object"
      ? ((Object.values(json as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ?? [])
      : [];
  const urls = arr
    .map((e) => {
      if (typeof e === "string") return e;
      const o = e as { url?: string; cardUrl?: string; endpoint?: string };
      return o?.cardUrl ?? o?.url ?? o?.endpoint ?? "";
    })
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  return dedupe(urls);
}

async function main() {
  const status: AgentStatus = process.env.STATUS === "APPROVED" ? "APPROVED" : "PENDING";
  const max = Number(process.env.MAX) || 0;

  const pub = await db.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!pub) throw new Error("no admin publisher found — create an admin user first");

  let urls = await loadUrls();
  if (max > 0) urls = urls.slice(0, max);
  console.log(`registry: ${urls.length} card URL(s); status=${status}${process.env.PROD_URL ? " [PROD]" : ""}\n`);

  let ok = 0;
  let failed = 0;
  for (const url of urls) {
    try {
      const card = await fetchAgentCard(url);
      const slug = slugify(card.name);
      if (!slug) {
        console.log(`✗ ${url} — empty slug from card name`);
        failed++;
        continue;
      }
      const scenarios = classifyScenarios(
        [card.name, card.description, card.skills.map((s) => s.name).join(" ")].join(" ")
      );
      const security =
        card.securitySchemes == null ? undefined : (card.securitySchemes as Prisma.InputJsonValue);

      await db.agent.upsert({
        where: { slug },
        update: {
          name: card.name,
          description: card.description || card.name,
          endpointUrl: card.endpointUrl,
          cardUrl: card.cardUrl,
          streaming: card.streaming,
          pushNotify: card.pushNotify,
          securitySchemes: security,
          cardFetchedAt: new Date(),
          scenarios,
        },
        create: {
          slug,
          name: card.name,
          description: card.description || card.name,
          kind: "HOSTED",
          status,
          publisherId: pub.id,
          protocols: ["A2A"],
          endpointUrl: card.endpointUrl,
          cardUrl: card.cardUrl,
          streaming: card.streaming,
          pushNotify: card.pushNotify,
          securitySchemes: security,
          pricingModel: "FREE",
          cardFetchedAt: new Date(),
          scenarios,
        },
      });

      // Refresh the agent's declared skills from the card.
      const agent = await db.agent.findUnique({ where: { slug }, select: { id: true } });
      if (agent) {
        await db.agentSkillDef.deleteMany({ where: { agentId: agent.id } });
        if (card.skills.length) {
          await db.agentSkillDef.createMany({
            data: card.skills.map((s) => ({
              agentId: agent.id,
              skillKey: s.skillKey,
              name: s.name,
              description: s.description ?? undefined,
              inputModes: s.inputModes,
              outputModes: s.outputModes,
              examples: s.examples,
            })),
          });
        }
      }

      console.log(`✓ ${slug} — ${card.skills.length} skill(s), scenarios: ${scenarios.join("/") || "none"}`);
      ok++;
    } catch (e) {
      const msg = e instanceof AgentCardError ? e.message : (e as Error).message;
      console.log(`✗ ${url} — ${msg}`);
      failed++;
    }
  }
  console.log(`\nDone: ${ok} imported/updated, ${failed} skipped (status=${status}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
