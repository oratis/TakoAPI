import type { PrismaClient, AgentStatus } from "@prisma/client";
import { classifyScenarios } from "./scenarios";

// Import top open-source agent PROJECTS from GitHub (by stars) into the registry
// as kind=PROJECT (discovery-only). Re-runnable: upserts by slug and refreshes
// star counts, so a scheduled run keeps the directory fresh and adds new entrants.
// Shared by scripts/scrape-github-agents.ts (CLI) and /api/cron/scrape-agents (cron).

const PER_PAGE = 100;

const QUERIES = [
  "topic:ai-agent",
  "topic:ai-agents",
  "topic:autonomous-agents",
  "topic:llm-agent",
  "topic:llm-agents",
  "topic:agentic-ai",
  "topic:agentic",
  "topic:multi-agent-systems",
  "topic:multi-agent",
  "topic:ai-agent-framework",
  "topic:agent-framework",
  "topic:autonomous-ai-agents",
  "topic:autonomous-agent",
  "topic:rag-agent",
  "topic:ai-agents-framework",
  "topic:agents",
  "topic:agentic-workflow",
  "topic:agentic-framework",
  "topic:autonomous-ai",
  "topic:ai-agent-tools",
];

type Repo = {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  owner: { login: string };
  archived: boolean;
  fork: boolean;
  topics?: string[];
};

// Conservative star-farm heuristic: genuine popular repos accrue forks, padded
// ones almost never do. Drop only the most extreme mismatches (many stars, a
// near-zero fork ratio) so real repos are never filtered. See memory note on
// the star-farmed band polluting the newest-by-recency slice of the catalog.
function looksStarFarmed(r: Repo): boolean {
  const stars = r.stargazers_count;
  // The 150 floor is deliberately permissive to avoid false positives on small
  // real projects. Note: the observed star-farm band sits higher (~340★), so
  // some farmed repos in 150–400★ can slip past the fork-ratio test. That's an
  // accepted trade-off — the durable backstop is admin REJECT/DISABLE, which a
  // scheduled re-scrape now honors (see scenarios loop below), not this heuristic.
  if (stars < 150) return false; // small repos: don't judge on fork ratio
  return (r.forks_count ?? 0) / stars < 0.01; // < 1 fork per 100 stars → suspicious
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "project";
}

async function search(q: string, page: number, token: string | undefined, log: (m: string) => void): Promise<Repo[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "takoapi-scraper",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers });
    // On 403/429 (primary or secondary rate limit), wait for the reset window
    // (or Retry-After) and retry — don't silently drop pages of results.
    if (res.status === 403 || res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") || 0);
      const reset = Number(res.headers.get("x-ratelimit-reset") || 0);
      const waitMs =
        retryAfter > 0
          ? retryAfter * 1000
          : reset > 0
            ? Math.max(0, reset * 1000 - Date.now()) + 1000
            : 60_000;
      log(`rate limited on "${q}" p${page}; waiting ${Math.ceil(waitMs / 1000)}s`);
      await sleep(Math.min(waitMs, 120_000));
      continue;
    }
    if (!res.ok) {
      log(`search "${q}" p${page} -> HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { items?: Repo[] };
    const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "999");
    const reset = Number(res.headers.get("x-ratelimit-reset") || 0);
    if (remaining <= 1 && reset > 0) {
      await sleep(Math.min(Math.max(0, reset * 1000 - Date.now()) + 1000, 120_000));
    }
    return data.items ?? [];
  }
  log(`search "${q}" p${page} -> gave up after retries`);
  return [];
}

export type ScrapeOpts = {
  token?: string;
  pages?: number;
  maxAgents?: number;
  minStars?: number;
  reqDelayMs?: number;
  onProgress?: (msg: string) => void;
};

export type ScrapeResult = { found: number; eligible: number; skipped: number; imported: number };

/**
 * Discover agent projects on GitHub and upsert them as kind=PROJECT. Idempotent.
 * Pass a PrismaClient as `db` to target a specific database (e.g. prod via proxy);
 * defaults to the app's shared client.
 */
export async function scrapeGithubAgents(opts: ScrapeOpts, db: PrismaClient): Promise<ScrapeResult> {
  const token = opts.token;
  const pages = Math.max(1, opts.pages ?? 1);
  const max = opts.maxAgents ?? 500;
  const minStars = Math.max(0, opts.minStars ?? 0);
  const reqDelayMs = Math.max(0, opts.reqDelayMs ?? 1000);
  const log = opts.onProgress ?? (() => {});

  const pub = await db.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!pub) throw new Error("no admin publisher found");

  const byName = new Map<string, Repo>();
  let firstReq = true;
  for (const q of QUERIES) {
    for (let page = 1; page <= pages; page++) {
      if (!firstReq) await sleep(reqDelayMs);
      firstReq = false;
      const items = await search(q, page, token, log);
      for (const r of items) {
        if (r.archived || r.fork) continue;
        if (!byName.has(r.full_name)) byName.set(r.full_name, r);
      }
      if (items.length < PER_PAGE) break; // no more pages
    }
  }

  const all = [...byName.values()].sort((a, b) => b.stargazers_count - a.stargazers_count);
  const starred = minStars ? all.filter((r) => r.stargazers_count >= minStars) : all;
  const eligible = starred.filter((r) => !looksStarFarmed(r));
  const skipped = starred.length - eligible.length;
  const repos = eligible.slice(0, max);

  // Respect human governance: never resurrect a repo an admin has REJECTED or
  // DISABLED. Load those slugs up front (one query) so the loop can skip them —
  // otherwise the update path below would flip them back to APPROVED, and a prior
  // deletion would be re-created as APPROVED, silently undoing the moderation.
  const repoSlugs = repos.map((r) => slugify(`${r.owner.login}-${r.name}`));
  const governed = await db.agent.findMany({
    where: { slug: { in: repoSlugs }, status: { in: ["REJECTED", "DISABLED"] as AgentStatus[] } },
    select: { slug: true },
  });
  const tombstoned = new Set(governed.map((g) => g.slug));

  log(`found ${all.length} unique repos${minStars ? `, ${starred.length} with >=${minStars} stars` : ""}${skipped ? `, skipped ${skipped} likely star-farmed` : ""}${tombstoned.size ? `, skipping ${tombstoned.size} admin-rejected/disabled` : ""}; importing top ${repos.length} by stars`);

  let imported = 0;
  for (const r of repos) {
    const slug = slugify(`${r.owner.login}-${r.name}`);
    if (tombstoned.has(slug)) continue; // admin REJECTED/DISABLED — leave it alone
    const description = (r.description || r.name).slice(0, 500);
    // Classify by name + description + GitHub topics into use-case scenarios.
    const scenarios = classifyScenarios([r.name, r.description ?? "", (r.topics ?? []).join(" ")].join(" "));
    // NOTE: the update branch deliberately does NOT set `status` — a scheduled
    // refresh must not override an admin's moderation decision. Only newly
    // discovered repos (the create branch) land as APPROVED.
    await db.agent.upsert({
      where: { slug },
      update: { stars: r.stargazers_count, description, scenarios },
      create: {
        slug,
        name: r.name,
        description,
        kind: "PROJECT",
        status: "APPROVED",
        publisherId: pub.id,
        githubUrl: r.html_url,
        stars: r.stargazers_count,
        repoOwner: r.owner.login,
        repoName: r.name,
        homepage: r.homepage || null,
        pricingModel: "FREE",
        scenarios,
      },
    });
    imported++;
    if (imported % 100 === 0) log(`  …${imported}/${repos.length}`);
  }

  return { found: all.length, eligible: eligible.length, skipped, imported };
}
