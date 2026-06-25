import { Prisma, type PrismaClient, type AgentStatus } from "@prisma/client";
import { fetchAgentCard, AgentCardError } from "@/lib/agentcard";
import { classifyScenarios } from "@/lib/scenarios";

// Import REAL hosted A2A agents (kind=HOSTED) into the registry from a list of
// AgentCard URLs. Each URL is fetched and validated as an A2A AgentCard
// (src/lib/agentcard.ts) before insert; unreachable/invalid cards are skipped.
// Idempotent: upserts by slug and refreshes skills + scenarios. Shared by
// scripts/import-hosted-agents.ts (CLI) and /api/cron/import-hosted (cron).
//
// NOTE: these are THIRD-PARTY agents. Default status is PENDING so an admin
// reviews them in /admin/agents before they go public; pass APPROVED to
// auto-approve.

// Community-maintained directory of live, hosted A2A agents (AgentCard URLs).
const DEFAULT_REGISTRY =
  "https://raw.githubusercontent.com/prassanna-ravishankar/a2a-registry/main/scripts/seed_data.json";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

const dedupe = (a: string[]) => Array.from(new Set(a));

// Resolve the list of AgentCard URLs from a local file, a registry index URL,
// or the default community registry. Index entries may be plain strings or
// objects with a url / cardUrl / endpoint field.
async function loadUrls(registryUrl: string | undefined, cardsFile: string | undefined): Promise<string[]> {
  if (cardsFile) {
    const fs = await import("node:fs/promises");
    const text = await fs.readFile(cardsFile, "utf8");
    return dedupe(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  }
  const url = registryUrl || DEFAULT_REGISTRY;
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

export type ImportHostedOpts = {
  registryUrl?: string;
  cardsFile?: string;
  status?: AgentStatus;
  max?: number;
  onProgress?: (m: string) => void;
};

export type ImportHostedResult = { imported: number; skipped: number };

/**
 * Validate and upsert hosted A2A agents (kind=HOSTED) from a registry index or
 * card-URL list. Idempotent (upserts by slug, refreshes skills + scenarios).
 * Pass a PrismaClient as `db` to target a specific database (e.g. prod via proxy).
 * Default status is PENDING; pass APPROVED to auto-approve.
 */
export async function importHostedAgents(
  opts: ImportHostedOpts,
  db: PrismaClient
): Promise<ImportHostedResult> {
  const status: AgentStatus = opts.status === "APPROVED" ? "APPROVED" : "PENDING";
  const max = opts.max ?? 0;
  const log = opts.onProgress ?? (() => {});

  const pub = await db.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!pub) throw new Error("no admin publisher found — create an admin user first");

  let urls = await loadUrls(opts.registryUrl, opts.cardsFile);
  if (max > 0) urls = urls.slice(0, max);
  log(`registry: ${urls.length} card URL(s); status=${status}`);

  let ok = 0;
  let failed = 0;
  for (const url of urls) {
    try {
      const card = await fetchAgentCard(url);
      const slug = slugify(card.name);
      if (!slug) {
        log(`✗ ${url} — empty slug from card name`);
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

      log(`✓ ${slug} — ${card.skills.length} skill(s), scenarios: ${scenarios.join("/") || "none"}`);
      ok++;
    } catch (e) {
      const msg = e instanceof AgentCardError ? e.message : (e as Error).message;
      log(`✗ ${url} — ${msg}`);
      failed++;
    }
  }
  log(`Done: ${ok} imported/updated, ${failed} skipped (status=${status}).`);
  return { imported: ok, skipped: failed };
}
