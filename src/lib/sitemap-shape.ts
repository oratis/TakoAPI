import { prisma } from "@/lib/prisma";
import { localizedUrl, SITE_URL } from "@/lib/seo";
import { routing } from "@/i18n/routing";
import { SCENARIOS } from "@/lib/scenarios";
import { getAllPosts } from "@/lib/blog";

// Shared logic for the split sitemap. We hand-roll the XML (instead of Next's
// app/sitemap.ts metadata convention) because that convention reserves
// /sitemap.xml and, when combined with generateSitemaps(), 404s the parent
// index there. Hand-rolling lets us serve a real <sitemapindex> at /sitemap.xml
// (app/sitemap.xml/route.ts) plus chunked <urlset> children at /sitemap/{id}.xml
// (app/sitemap/[id]/route.ts) — all force-dynamic, so the live catalog is always
// complete and each child is small enough that Google never times out.

// URLs per child sitemap. Well under Google's 50k/50MB cap; kept small because
// each entity URL expands to 15 hreflang lines, so ~1k URLs ≈ a couple of MB.
export const CHUNK = 1000;

const APPROVED = { status: "APPROVED" } as const;

type Entry = {
  path: string;
  lastModified: Date;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
};

export async function approvedCounts(): Promise<{ agents: number; skills: number }> {
  try {
    const [agents, skills] = await Promise.all([
      prisma.agent.count({ where: APPROVED }),
      prisma.skill.count({ where: APPROVED }),
    ]);
    return { agents, skills };
  } catch {
    // DB unreachable (e.g. the DB-less Docker build): degrade to no entity chunks.
    return { agents: 0, skills: 0 };
  }
}

// Number of child sitemaps:
//   id 0                          -> static + blog + scenario pages
//   1 .. ceil(agents/CHUNK)       -> APPROVED agents
//   then ceil(skills/CHUNK) more  -> APPROVED skills
export async function childCount(): Promise<number> {
  const { agents, skills } = await approvedCounts();
  return 1 + Math.ceil(agents / CHUNK) + Math.ceil(skills / CHUNK);
}

function pageEntries(): Entry[] {
  const now = new Date();
  const staticRoutes: Entry[] = [
    { path: "", lastModified: now, changeFrequency: "daily", priority: 1 },
    { path: "/agents", lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { path: "/scenarios", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { path: "/skills", lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { path: "/install", lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { path: "/badge", lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { path: "/trending", lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { path: "/blog", lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];
  const blogRoutes: Entry[] = getAllPosts().map((p) => ({
    path: `/blog/${p.slug}`,
    lastModified: new Date(p.dateModified),
    changeFrequency: "monthly",
    priority: 0.6,
  }));
  const scenarioRoutes: Entry[] = SCENARIOS.map((s) => ({
    path: `/scenarios/${s.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  return [...staticRoutes, ...blogRoutes, ...scenarioRoutes];
}

// Entries for child sitemap `n` (0-based). Out-of-range ids yield [].
export async function entriesFor(n: number): Promise<Entry[]> {
  if (n === 0) return pageEntries();

  const { agents } = await approvedCounts();
  const agentChunks = Math.ceil(agents / CHUNK);
  const chunkIndex = n - 1; // 0-based among entity chunks

  // A DB blip degrades a child to an empty <urlset> rather than a 500.
  try {
    if (chunkIndex < agentChunks) {
      const rows = await prisma.agent.findMany({
        where: APPROVED,
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        skip: chunkIndex * CHUNK,
        take: CHUNK,
      });
      return rows.map((a) => ({
        path: `/agents/${a.slug}`,
        lastModified: a.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      }));
    }

    const rows = await prisma.skill.findMany({
      where: APPROVED,
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      skip: (chunkIndex - agentChunks) * CHUNK,
      take: CHUNK,
    });
    return rows.map((s) => ({
      path: `/skills/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly",
      priority: 0.5,
    }));
  } catch {
    return [];
  }
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The canonical `loc` is the unprefixed English URL; hreflang alternates list
// every locale (the shape Google recommends — one row covers all 15).
function renderUrl(e: Entry): string {
  const loc = xmlEscape(localizedUrl(routing.defaultLocale, e.path));
  const alts = routing.locales
    .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${xmlEscape(localizedUrl(l, e.path))}" />`)
    .join("");
  return (
    `<url><loc>${loc}</loc>${alts}` +
    `<lastmod>${e.lastModified.toISOString()}</lastmod>` +
    `<changefreq>${e.changeFrequency}</changefreq>` +
    `<priority>${e.priority}</priority></url>`
  );
}

export function renderUrlset(entries: Entry[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">` +
    entries.map(renderUrl).join("") +
    `</urlset>`
  );
}

export function renderIndex(n: number, lastmod: string): string {
  const entries = Array.from(
    { length: n },
    (_, id) => `<sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`,
  ).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`
  );
}

export const SITEMAP_HEADERS = {
  "Content-Type": "application/xml",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
} as const;
