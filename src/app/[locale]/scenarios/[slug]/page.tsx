import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import AgentCard from "@/components/ui/AgentCard";
import { JsonLd } from "@/components/JsonLd";
import { getScenarioCounts } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { SCENARIOS, findScenario } from "@/lib/scenarios";
import { absoluteUrl, SITE_NAME, localizedAlternates } from "@/lib/seo";
import { localeOg } from "@/lib/locales";

// Which page of the scenario is shown comes from the query string, so there is
// nothing to prerender. The scenario counts come from the tagged catalog cache.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;
/** Page numbers rendered around the current one; the rest are reached by paging. */
const PAGE_WINDOW = 5;
/** How many other scenarios the foot of the page offers. */
const RELATED_COUNT = 5;

// Below this many approved agents the page is thin content — a heading and four
// cards — so it is served `noindex, follow`: crawlers still walk through to the
// agent detail pages behind it, but Google is not asked to rank a four-item list
// against real ones. Keep in step with WELL_POPULATED_MIN in ../page.tsx, which
// draws the same line on the index.
const MIN_INDEXABLE_AGENTS = 10;

// Exactly what AgentCard renders, healthStatus included so its health dot has
// something to show. An Agent row also carries `reviewNote` and `publisherId`,
// neither of which belongs on a public page.
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
} satisfies Prisma.AgentSelect;

// Most rows in a scenario are tied — no calls, no rating, no stars — and without
// a deterministic last key Postgres may order the ties differently per query,
// which makes a row appear on two pages or on none. `stars` is nullable and
// Postgres sorts NULLS FIRST on DESC, so it needs `nulls: "last"` or every
// unstarred project would outrank the starred ones.
const ORDER_BY: Prisma.AgentOrderByWithRelationInput[] = [
  { featured: "desc" },
  { callsCount: "desc" },
  { stars: { sort: "desc", nulls: "last" } },
  { id: "asc" },
];

type SearchParams = Record<string, string | string[] | undefined>;

/** A repeated key (`?page=1&page=2`) arrives as an array; the first value wins. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The one reading of `?page`, shared by the page and its metadata. */
function parsePage(sp: SearchParams): number {
  return Math.max(1, Math.trunc(Number(firstValue(sp.page))) || 1);
}

/** Page 1 keeps the bare path, so the canonical and the first page never differ. */
function pageHref(slug: string, page: number): string {
  return page <= 1 ? `/scenarios/${slug}` : `/scenarios/${slug}?page=${page}`;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const sc = findScenario(slug);
  if (!sc) return {};

  const tScenario = await getTranslations({ locale, namespace: "Scenarios" });
  const t = await getTranslations({ locale, namespace: "ScenarioPage" });
  const label = tScenario(slug);

  // The cached per-scenario counts, not a second COUNT per request: neither the
  // page a visitor is clamped to nor whether a scenario is worth indexing turns
  // on the agent approved a minute ago.
  const counts = await getScenarioCounts();
  const total = counts[slug] ?? 0;

  // Clamped the same way the body clamps, so `?page=999` canonicalizes to the
  // last real page instead of declaring itself the canonical of a page that does
  // not exist — otherwise every out-of-range number is its own indexable URL.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(parsePage(await searchParams), totalPages);
  const path = pageHref(slug, page);

  const description = t("metaDescription", { scenario: label });
  const title =
    page > 1 ? t("metaTitlePaged", { scenario: label, page }) : t("metaTitle", { scenario: label });

  const metadata: Metadata = {
    metadataBase: new URL(absoluteUrl("")),
    title,
    description,
    // Deeper pages are how a crawler walks past the first 24 of a thousand-agent
    // scenario, so each one canonicalizes to itself rather than folding into
    // page 1 — which would leave everything after row 24 unreachable.
    alternates: localizedAlternates(locale, path),
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: absoluteUrl(path),
      type: "website",
      locale: localeOg(locale),
      images: [absoluteUrl("/opengraph-image")],
    },
    twitter: { card: "summary_large_image", title: `${title} — ${SITE_NAME}`, description },
  };

  if (total < MIN_INDEXABLE_AGENTS) {
    metadata.robots = { index: false, follow: true };
  }
  return metadata;
}

export default async function ScenarioLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const sc = findScenario(slug);
  if (!sc) notFound();

  const t = await getTranslations("ScenarioPage");
  const tScenario = await getTranslations("Scenarios");
  const tAgents = await getTranslations("Agents");
  const tDetail = await getTranslations("AgentDetail");
  const label = tScenario(slug);

  const requestedPage = parsePage(await searchParams);
  const where: Prisma.AgentWhereInput = { status: "APPROVED", scenarios: { has: slug } };

  // The true total has to land before the rows do: `?page=999` should show the
  // last page rather than an empty grid, and that needs totalPages first.
  const [total, counts] = await Promise.all([prisma.agent.count({ where }), getScenarioCounts()]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const agents =
    total === 0
      ? []
      : await prisma.agent.findMany({
          where,
          select: AGENT_CARD_SELECT,
          orderBy: ORDER_BY,
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        });

  // The next-largest scenarios. A four-agent page is a dead end otherwise, and
  // the visitor who landed on one from search needs somewhere to go that is not
  // the back button. Empty scenarios are never offered as a destination.
  const related = SCENARIOS.map((scenario) => ({ scenario, count: counts[scenario.slug] ?? 0 }))
    .filter((r) => r.scenario.slug !== slug && r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, RELATED_COUNT);

  const sparse = total < MIN_INDEXABLE_AGENTS;
  const canonical = absoluteUrl(pageHref(slug, page));
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("metaTitle", { scenario: label }),
    description: t("metaDescription", { scenario: label }),
    url: canonical,
    mainEntity: {
      "@type": "ItemList",
      // The collection is the scenario, not the slice of it on screen: the count
      // is the true total and the positions are absolute, so page 3 declares
      // items 49–72 rather than a second list that also starts at 1.
      numberOfItems: total,
      itemListElement: agents.map((a, i) => ({
        "@type": "ListItem",
        position: (page - 1) * PAGE_SIZE + i + 1,
        url: absoluteUrl(`/agents/${a.slug}`),
        name: a.name,
      })),
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: tDetail("breadcrumbHome"), item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: t("breadcrumbScenarios"), item: absoluteUrl("/scenarios") },
      { "@type": "ListItem", position: 3, name: label, item: absoluteUrl(`/scenarios/${slug}`) },
    ],
  };

  const windowSize = Math.min(PAGE_WINDOW, totalPages);
  const windowStart = Math.max(1, Math.min(page - 2, totalPages - windowSize + 1));
  const pageNumbers = Array.from({ length: windowSize }, (_, i) => windowStart + i);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <JsonLd data={collectionLd} />
      <JsonLd data={breadcrumbLd} />
      <Link href="/scenarios" className="text-sm text-gray-600 hover:text-gray-900">
        {t("back")}
      </Link>
      <div className="mt-3 mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <span aria-hidden="true">{sc.emoji}</span>
          {t("metaTitle", { scenario: label })}
        </h1>
        <p className="text-gray-600 mt-2 max-w-2xl">{t("heroSubtitle", { scenario: label })}</p>
        <p className="text-sm text-gray-600 mt-2">{tAgents("count", { count: total })}</p>
      </div>

      {total === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <p className="text-gray-600">{t("empty")}</p>
          <Link href="/agents" className="text-purple-600 text-sm mt-1 inline-block hover:underline">
            {t("browseAll")} →
          </Link>
        </div>
      ) : (
        <>
          <h2 className="sr-only">{t("resultsLabel", { scenario: label })}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((a) => (
              <AgentCard key={a.slug} agent={a} />
            ))}
          </div>
        </>
      )}

      {totalPages > 1 && (
        <nav
          aria-label={t("paginationLabel")}
          className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-8 pt-4 border-t border-gray-200"
        >
          <p className="text-sm text-gray-600">
            {t("showingRange", {
              from: (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, total),
              total,
            })}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={pageHref(slug, page - 1)}
                rel="prev"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                {t("prev")}
              </Link>
            )}

            <div className="flex items-center gap-1">
              {pageNumbers.map((n) => (
                <Link
                  key={n}
                  href={pageHref(slug, n)}
                  aria-label={t("goToPage", { page: n })}
                  aria-current={n === page ? "page" : undefined}
                  className={`w-8 h-8 inline-flex items-center justify-center rounded-lg text-sm font-medium tabular-nums transition-colors ${
                    n === page ? "bg-purple-600 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {n}
                </Link>
              ))}
            </div>

            {page < totalPages && (
              <Link
                href={pageHref(slug, page + 1)}
                rel="next"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t("next")}
                <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            )}
          </div>
        </nav>
      )}

      {sparse && (
        <section className="mt-10 rounded-2xl border border-purple-100 bg-purple-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-gray-900">{t("ctaTitle", { scenario: label })}</h2>
          <p className="text-sm text-gray-600 mt-1 max-w-xl mx-auto">{t("ctaBody", { scenario: label })}</p>
          <Link
            href="/submit-agent"
            className="mt-4 inline-flex rounded-full bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700"
          >
            {t("ctaButton")}
          </Link>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-12 border-t border-gray-200 pt-6">
          <h2 className="text-sm font-semibold text-gray-900">{t("relatedHeading")}</h2>
          <ul className="flex flex-wrap gap-2 mt-3">
            {related.map(({ scenario, count }) => (
              <li key={scenario.slug}>
                <Link
                  href={`/scenarios/${scenario.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-purple-300 hover:text-purple-700 transition-colors"
                >
                  <span aria-hidden="true">{scenario.emoji}</span>
                  <span className="font-medium">{tScenario(scenario.slug)}</span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {tAgents("count", { count })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
