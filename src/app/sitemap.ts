import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";

// Generated at request time against the live catalog (the app renders DB pages
// dynamically and the Docker build has no DB), so the sitemap stays fresh as
// agents/skills are imported. Crawlers hit this infrequently.
export const dynamic = "force-dynamic";

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
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/agents`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/skills`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/trending`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];

  const agentRoutes: MetadataRoute.Sitemap = agents.map((a) => ({
    url: `${SITE_URL}/agents/${a.slug}`,
    lastModified: a.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const skillRoutes: MetadataRoute.Sitemap = skills.map((s) => ({
    url: `${SITE_URL}/skills/${s.slug}`,
    lastModified: s.updatedAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...agentRoutes, ...skillRoutes];
}
