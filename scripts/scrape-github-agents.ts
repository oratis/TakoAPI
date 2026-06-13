/**
 * Import top open-source agent PROJECTS from GitHub (by stars) into the
 * registry as kind=PROJECT (discovery-only; not gateway-invokable).
 *
 *   GITHUB_TOKEN=ghp_... MAX_AGENTS=300 PAGES=1 npx tsx scripts/scrape-github-agents.ts
 *   # add PROD_URL=postgresql://... to target production via the Cloud SQL proxy
 *
 * Works unauthenticated (10 search req/min); a token raises that to 30/min and
 * lets you page deeper. Re-runnable: upserts by slug and refreshes star counts.
 */
import { PrismaClient } from "@prisma/client";

const TOKEN = process.env.GITHUB_TOKEN;
const PER_PAGE = 100;
const PAGES = Math.max(1, Number(process.env.PAGES || 1));
const MAX = Number(process.env.MAX_AGENTS || 300);

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
];

type Repo = {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  owner: { login: string };
  archived: boolean;
  fork: boolean;
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "project";
}

async function search(q: string, page: number): Promise<Repo[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "takoapi-scraper",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) {
    console.log(`search "${q}" p${page} -> HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { items?: Repo[] };
  return data.items ?? [];
}

async function main() {
  const prisma = new PrismaClient(
    process.env.PROD_URL ? { datasources: { db: { url: process.env.PROD_URL } } } : undefined
  );
  try {
    const pub = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
    if (!pub) throw new Error("no admin publisher found");

    const byName = new Map<string, Repo>();
    for (const q of QUERIES) {
      for (let page = 1; page <= PAGES; page++) {
        const items = await search(q, page);
        for (const r of items) {
          if (r.archived || r.fork) continue;
          if (!byName.has(r.full_name)) byName.set(r.full_name, r);
        }
        if (items.length < PER_PAGE) break; // no more pages
      }
    }
    const repos = [...byName.values()]
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, MAX);
    console.log(`found ${byName.size} unique repos; importing top ${repos.length} by stars`);

    let ok = 0;
    for (const r of repos) {
      const slug = slugify(`${r.owner.login}-${r.name}`);
      const description = (r.description || r.name).slice(0, 500);
      await prisma.agent.upsert({
        where: { slug },
        update: { stars: r.stargazers_count, description, status: "APPROVED" },
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
        },
      });
      ok++;
    }
    console.log(`imported/updated ${ok} project(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
