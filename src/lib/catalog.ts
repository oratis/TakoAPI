import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

// Cached reads of the public catalog.
//
// Every catalog page was `force-dynamic` with no caching, so each visit ran its
// full query set against a db-f1-micro — the home page alone issued nine. None of
// this data is per-visitor and none of it changes faster than a scraper run, so it
// is cached by tag and revalidated in the background.
//
// Invalidation: `revalidateTag(CATALOG_TAGS.agents | .skills | .categories)` from
// the admin mutations and the ingestion crons (see lib/revalidate.ts). The time
// bound is the backstop for anything that writes without calling those.

export const CATALOG_TAGS = {
  agents: "catalog:agents",
  skills: "catalog:skills",
  categories: "catalog:categories",
} as const;

const AGENT_CARD_SELECT = {
  slug: true,
  name: true,
  description: true,
  kind: true,
  pricingModel: true,
  unitPriceUsd: true,
  protocols: true,
  streaming: true,
  callsCount: true,
  avgRating: true,
  healthStatus: true,
  stars: true,
  githubUrl: true,
  repoOwner: true,
  scenarios: true,
  category: { select: { name: true, slug: true } },
  _count: { select: { skills: true } },
} as const;

const SKILL_CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  brief: true,
  description: true,
  author: true,
  githubUrl: true,
  clawSkillsUrl: true,
  installCmd: true,
  likesCount: true,
  viewsCount: true,
  downloads: true,
  stars: true,
  category: { select: { name: true, slug: true } },
} as const;

/** Decimal → number so the result is a plain JSON value the cache can store. */
function plain<T extends { unitPriceUsd?: unknown }>(row: T) {
  return { ...row, unitPriceUsd: row.unitPriceUsd == null ? null : Number(row.unitPriceUsd) };
}

async function loadHomeData() {
  const [categories, topSkills, latestSkills, totalSkills, agents, totalAgents, projects, totalProjects, scenarioRows] =
    await Promise.all([
      prisma.category.findMany({ orderBy: { skillCount: "desc" } }),
      prisma.skill.findMany({
        where: { status: "APPROVED" },
        orderBy: { downloads: "desc" },
        take: 4,
        select: SKILL_CARD_SELECT,
      }),
      prisma.skill.findMany({
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: SKILL_CARD_SELECT,
      }),
      prisma.skill.count({ where: { status: "APPROVED" } }),
      prisma.agent.findMany({
        // Never feature an agent whose last probe said "down" — the front page is
        // the one place a dead endpoint costs the most trust.
        where: { status: "APPROVED", kind: "HOSTED", OR: [{ healthStatus: null }, { healthStatus: { not: "down" } }] },
        orderBy: [{ featured: "desc" }, { callsCount: "desc" }, { ratingCount: "desc" }, { createdAt: "desc" }],
        take: 8,
        select: AGENT_CARD_SELECT,
      }),
      prisma.agent.count({ where: { status: "APPROVED", kind: "HOSTED" } }),
      prisma.agent.findMany({
        where: { status: "APPROVED", kind: "PROJECT" },
        orderBy: [{ stars: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: 8,
        select: AGENT_CARD_SELECT,
      }),
      prisma.agent.count({ where: { status: "APPROVED", kind: "PROJECT" } }),
      prisma.agent.findMany({ where: { status: "APPROVED" }, select: { scenarios: true } }),
    ]);

  const scenarioCounts: Record<string, number> = {};
  for (const row of scenarioRows) for (const s of row.scenarios) scenarioCounts[s] = (scenarioCounts[s] ?? 0) + 1;

  return {
    categories,
    topSkills,
    latestSkills,
    totalSkills,
    agents: agents.map(plain),
    totalAgents,
    projects: projects.map(plain),
    totalProjects,
    scenarioCounts,
  };
}

/** Everything the home page renders, in one cached read. */
export const getHomeData = unstable_cache(loadHomeData, ["home-data-v1"], {
  revalidate: 300,
  tags: [CATALOG_TAGS.agents, CATALOG_TAGS.skills, CATALOG_TAGS.categories],
});

/** Per-scenario agent counts, for the scenario index. */
export const getScenarioCounts = unstable_cache(
  async () => {
    const rows = await prisma.agent.findMany({ where: { status: "APPROVED" }, select: { scenarios: true } });
    const counts: Record<string, number> = {};
    for (const r of rows) for (const s of r.scenarios) counts[s] = (counts[s] ?? 0) + 1;
    return counts;
  },
  ["scenario-counts-v1"],
  { revalidate: 300, tags: [CATALOG_TAGS.agents] }
);

/** Categories that have at least one approved agent — the marketplace filter row. */
export const getAgentCategories = unstable_cache(
  async () =>
    prisma.category.findMany({
      where: { agents: { some: { status: "APPROVED" } } },
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ["agent-categories-v1"],
  { revalidate: 600, tags: [CATALOG_TAGS.agents, CATALOG_TAGS.categories] }
);

/** All categories with their skill counts — the skills filter row. */
export const getSkillCategories = unstable_cache(
  async () => prisma.category.findMany({ orderBy: { skillCount: "desc" } }),
  ["skill-categories-v1"],
  { revalidate: 600, tags: [CATALOG_TAGS.categories] }
);
