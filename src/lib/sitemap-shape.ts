import { Prisma } from "@prisma/client";
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

// A description shorter than this is a stub, not content. Mirrors the `thin`
// test in src/app/[locale]/agents/[slug]/page.tsx generateMetadata — the two
// numbers must stay identical, see INDEXABLE_AGENTS below.
const THIN_DESCRIPTION_CHARS = 80;

type Entry = {
  path: string;
  lastModified: Date;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
};

/**
 * Agents worth submitting to Google, as a WHERE fragment shared by the count and
 * the row query so the two can never drift apart (see the chunking invariant on
 * childCount).
 *
 * The exclusion mirrors generateMetadata in src/app/[locale]/agents/[slug]/page.tsx:
 * a scraped PROJECT with no declared skills and a stub description renders with
 * `robots: noindex`. Submitting such a URL earns a "Submitted URL marked noindex"
 * error in Search Console and spends crawl budget proving the page is not worth
 * indexing — so keep the two rules in step whenever either moves.
 *
 * One deliberate divergence: the page un-thins an entry when GitHub's README
 * yields an excerpt, which the sitemap cannot check — that is a GitHub round-trip
 * per row, thousands of rows per request. The sitemap is therefore the stricter
 * of the two. A README-rescued entry is merely absent here while staying
 * crawlable and indexable via /agents (its noindex rule is `follow: true`
 * anyway); that is the cheap direction to be wrong in.
 */
const INDEXABLE_AGENTS = Prisma.sql`
  a."status" = 'APPROVED'
  AND NOT (
    a."kind" = 'PROJECT'
    AND length(a."description") < ${THIN_DESCRIPTION_CHARS}::int
    AND NOT EXISTS (SELECT 1 FROM "AgentSkillDef" d WHERE d."agentId" = a."id")
  )
`;

/**
 * Skills worth submitting, same contract as INDEXABLE_AGENTS.
 *
 * Most of the catalog is GitHub-scraped rows whose whole body is a one-line
 * repo description; a README is the only other substance the detail page can
 * render, so a stub description with no README has nothing unique to index.
 * The skill page does not (yet) set `robots: noindex` for these — it only
 * noindexes non-APPROVED rows — so this is a sitemap-side judgment. If the page
 * ever adopts a thin rule it should reuse THIN_DESCRIPTION_CHARS.
 */
const INDEXABLE_SKILLS = Prisma.sql`
  s."status" = 'APPROVED'
  AND NOT (
    length(s."description") < ${THIN_DESCRIPTION_CHARS}::int
    AND (s."readme" IS NULL OR length(btrim(s."readme")) = 0)
  )
`;

// Raw SQL rather than findMany because the thin-content rules turn on
// length(description), which Prisma's query API cannot express — and doing it in
// JS would mean filtering after skip/take, i.e. ragged chunks and a count that
// no longer matches the rows.
export async function indexableCounts(): Promise<{ agents: number; skills: number }> {
  try {
    const [agents, skills] = await Promise.all([
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS "count" FROM "Agent" a WHERE ${INDEXABLE_AGENTS}
      `,
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS "count" FROM "Skill" s WHERE ${INDEXABLE_SKILLS}
      `,
    ]);
    return { agents: agents[0]?.count ?? 0, skills: skills[0]?.count ?? 0 };
  } catch {
    // DB unreachable (e.g. the DB-less Docker build): degrade to no entity chunks.
    return { agents: 0, skills: 0 };
  }
}

/**
 * How many chunks each entity section occupies.
 *
 * INVARIANT: childCount() === 1 + agentChunks + skillChunks, and entriesFor(n)
 * must resolve every n in [0, childCount()) to that same section split — child 0
 * is the static/blog/scenario page, then agentChunks agent chunks, then
 * skillChunks skill chunks. The index and the children are separate requests, so
 * the only thing holding them together is that both derive their bounds from
 * this one helper, over the same predicates the row queries use. Get it wrong by
 * one and the index advertises a child that answers with an empty <urlset>,
 * which Search Console reports as a broken sitemap.
 */
async function chunkPlan(): Promise<{ agentChunks: number; skillChunks: number }> {
  const { agents, skills } = await indexableCounts();
  return { agentChunks: Math.ceil(agents / CHUNK), skillChunks: Math.ceil(skills / CHUNK) };
}

export async function childCount(): Promise<number> {
  const { agentChunks, skillChunks } = await chunkPlan();
  return 1 + agentChunks + skillChunks;
}

function pageEntries(): Entry[] {
  const now = new Date();
  const staticRoutes: Entry[] = [
    { path: "", lastModified: now, changeFrequency: "daily", priority: 1 },
    { path: "/agents", lastModified: now, changeFrequency: "daily", priority: 0.9 },
    // The API docs are a primary developer landing page — the page most of our
    // non-brand search intent ("agent api", "one api for agents") lands on.
    { path: "/docs", lastModified: now, changeFrequency: "weekly", priority: 0.9 },
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
  // Every SCENARIOS slug has a page: /scenarios/[slug] resolves through
  // findScenario() over this same list and notFound()s on anything else.
  const scenarioRoutes: Entry[] = SCENARIOS.map((s) => ({
    path: `/scenarios/${s.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  return [...staticRoutes, ...blogRoutes, ...scenarioRoutes];
}

type SlugRow = { slug: string; updatedAt: Date };

// updatedAt alone is not a total order — the nightly scraper stamps thousands of
// rows within the same transaction — and OFFSET over a tied ORDER BY may repeat
// a row in one chunk and drop it from the next. slug is unique, so it breaks
// every tie.
async function agentRows(skip: number): Promise<SlugRow[]> {
  return prisma.$queryRaw<SlugRow[]>`
    SELECT a."slug", a."updatedAt"
    FROM "Agent" a
    WHERE ${INDEXABLE_AGENTS}
    ORDER BY a."updatedAt" DESC, a."slug" ASC
    OFFSET ${skip}::int LIMIT ${CHUNK}::int
  `;
}

async function skillRows(skip: number): Promise<SlugRow[]> {
  return prisma.$queryRaw<SlugRow[]>`
    SELECT s."slug", s."updatedAt"
    FROM "Skill" s
    WHERE ${INDEXABLE_SKILLS}
    ORDER BY s."updatedAt" DESC, s."slug" ASC
    OFFSET ${skip}::int LIMIT ${CHUNK}::int
  `;
}

// Entries for child sitemap `n` (0-based). Out-of-range ids yield [].
export async function entriesFor(n: number): Promise<Entry[]> {
  if (n === 0) return pageEntries();

  const { agentChunks, skillChunks } = await chunkPlan();
  const chunkIndex = n - 1; // 0-based among entity chunks
  // Past the plan: an id the index never advertised, or one it advertised before
  // the catalog shrank. Answer empty instead of paging off the end of the table.
  if (chunkIndex >= agentChunks + skillChunks) return [];

  // A DB blip degrades a child to an empty <urlset> rather than a 500.
  try {
    if (chunkIndex < agentChunks) {
      const rows = await agentRows(chunkIndex * CHUNK);
      return rows.map((a) => ({
        path: `/agents/${a.slug}`,
        lastModified: a.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      }));
    }

    const rows = await skillRows((chunkIndex - agentChunks) * CHUNK);
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
