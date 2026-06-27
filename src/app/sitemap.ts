import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { localizedUrl } from "@/lib/seo";
import { routing } from "@/i18n/routing";
import { SCENARIOS } from "@/lib/scenarios";
import { getAllPosts } from "@/lib/blog";

// Generated at request time against the live catalog (the app renders DB pages
// dynamically and the Docker build has no DB), so the sitemap stays fresh as
// agents/skills are imported. Crawlers hit this infrequently.
export const dynamic = "force-dynamic";

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let agents: { slug: string; updatedAt: Date }[] = [];
  let skills: { slug: string; updatedAt: Date }[] = [];
  try {
    [agents, skills] = await Promise.all([
      prisma.agent.findMany({
        where: { status: "APPROVED" },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.skill.findMany({
        where: { status: "APPROVED" },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
  } catch {
    // If the DB is unreachable at request time, still serve the static routes
    // rather than 500-ing the sitemap.
  }

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

  const agentRoutes: MetadataRoute.Sitemap = agents.map((a) =>
    entry(`/agents/${a.slug}`, { lastModified: a.updatedAt, changeFrequency: "weekly", priority: 0.7 }),
  );

  const skillRoutes: MetadataRoute.Sitemap = skills.map((s) =>
    entry(`/skills/${s.slug}`, { lastModified: s.updatedAt, changeFrequency: "weekly", priority: 0.5 }),
  );

  const scenarioRoutes: MetadataRoute.Sitemap = SCENARIOS.map((s) =>
    entry(`/scenarios/${s.slug}`, { lastModified: now, changeFrequency: "weekly", priority: 0.6 }),
  );

  return [...staticRoutes, ...blogRoutes, ...scenarioRoutes, ...agentRoutes, ...skillRoutes];
}
