import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { localizedUrl } from "@/lib/seo";
import { routing } from "@/i18n/routing";
import { SCENARIOS } from "@/lib/scenarios";
import { getAllPosts } from "@/lib/blog";

// Generated at request time against the live catalog (the app renders DB pages
// dynamically and the Docker build has no DB), so the sitemap stays fresh as
// agents/skills are imported.
//
// Why split (generateSitemaps): there are ~6.8k URLs, each carrying 15-locale
// hreflang alternates. As ONE document that serialized to ~12MB and ~13s per
// request, which made Google's sitemap fetcher time out ("Couldn't fetch").
// Splitting yields a tiny instant index at /sitemap.xml plus small children at
// /sitemap/{id}.xml that Google fetches independently — each child is fast and
// the whole catalog still gets covered.
export const dynamic = "force-dynamic";

// URLs per child sitemap. Well under Google's 50k/50MB cap; kept small because
// each entity URL expands to 15 hreflang lines, so ~1k URLs ≈ a couple of MB.
const CHUNK = 1000;

const APPROVED = { status: "APPROVED" } as const;

// hreflang alternates for a path: one entry per locale. The canonical `url` is
// the unprefixed English URL; `alternates.languages` carries every locale so a
// single row covers all 15 (the shape Google recommends).
function languagesFor(path: string): Record<string, string> {
  return Object.fromEntries(routing.locales.map((l) => [l, localizedUrl(l, path)]));
}

type SitemapEntry = MetadataRoute.Sitemap[number];
function entry(path: string, rest: Omit<SitemapEntry, "url" | "alternates">): SitemapEntry {
  return {
    url: localizedUrl(routing.defaultLocale, path),
    alternates: { languages: languagesFor(path) },
    ...rest,
  };
}

async function agentCount(): Promise<number> {
  try {
    return await prisma.agent.count({ where: APPROVED });
  } catch {
    return 0;
  }
}
async function skillCount(): Promise<number> {
  try {
    return await prisma.skill.count({ where: APPROVED });
  } catch {
    return 0;
  }
}

// Layout of the child sitemaps, by `id`:
//   0                                  -> static + blog + scenario pages
//   1 .. agentChunks                   -> APPROVED agents, CHUNK per file
//   agentChunks+1 .. +skillChunks      -> APPROVED skills, CHUNK per file
export async function generateSitemaps(): Promise<{ id: number }[]> {
  const [agents, skills] = await Promise.all([agentCount(), skillCount()]);
  const count = 1 + Math.ceil(agents / CHUNK) + Math.ceil(skills / CHUNK);
  return Array.from({ length: count }, (_, id) => ({ id }));
}

function pageRoutes(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    entry("", { lastModified: now, changeFrequency: "daily", priority: 1 }),
    entry("/agents", { lastModified: now, changeFrequency: "daily", priority: 0.9 }),
    entry("/scenarios", { lastModified: now, changeFrequency: "weekly", priority: 0.8 }),
    entry("/skills", { lastModified: now, changeFrequency: "daily", priority: 0.8 }),
    entry("/install", { lastModified: now, changeFrequency: "monthly", priority: 0.6 }),
    entry("/badge", { lastModified: now, changeFrequency: "monthly", priority: 0.5 }),
    entry("/trending", { lastModified: now, changeFrequency: "weekly", priority: 0.6 }),
    entry("/blog", { lastModified: now, changeFrequency: "weekly", priority: 0.7 }),
  ];

  const blogRoutes: MetadataRoute.Sitemap = getAllPosts().map((p) =>
    entry(`/blog/${p.slug}`, {
      lastModified: new Date(p.dateModified),
      changeFrequency: "monthly",
      priority: 0.6,
    }),
  );

  const scenarioRoutes: MetadataRoute.Sitemap = SCENARIOS.map((s) =>
    entry(`/scenarios/${s.slug}`, { lastModified: now, changeFrequency: "weekly", priority: 0.6 }),
  );

  return [...staticRoutes, ...blogRoutes, ...scenarioRoutes];
}

// Next passes `id` as a Promise<string> (the value from generateSitemaps).
export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const n = Number(await id);
  if (n === 0) return pageRoutes();

  const agents = await agentCount();
  const agentChunks = Math.ceil(agents / CHUNK);
  const chunkIndex = n - 1; // 0-based among entity chunks

  if (chunkIndex < agentChunks) {
    const rows = await prisma.agent.findMany({
      where: APPROVED,
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      skip: chunkIndex * CHUNK,
      take: CHUNK,
    });
    return rows.map((a) =>
      entry(`/agents/${a.slug}`, { lastModified: a.updatedAt, changeFrequency: "weekly", priority: 0.7 }),
    );
  }

  const skillChunkIndex = chunkIndex - agentChunks;
  const rows = await prisma.skill.findMany({
    where: APPROVED,
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    skip: skillChunkIndex * CHUNK,
    take: CHUNK,
  });
  return rows.map((s) =>
    entry(`/skills/${s.slug}`, { lastModified: s.updatedAt, changeFrequency: "weekly", priority: 0.5 }),
  );
}
