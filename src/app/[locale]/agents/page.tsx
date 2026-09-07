import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import { Link } from "@/i18n/navigation";
import AgentCard from "@/components/ui/AgentCard";
import SiteSearch from "@/components/ui/SiteSearch";
import { getAgentCategories } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { SCENARIOS, isScenarioSlug } from "@/lib/scenarios";
import { SITE_NAME, localizedAlternates, absoluteUrl } from "@/lib/seo";

// Every rendering of this page is a function of the query string, so there is
// nothing to prerender. The one read that is shared across visitors — the
// category list — is cached in lib/catalog instead.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Agents" });
  return {
    metadataBase: new URL(absoluteUrl("")),
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localizedAlternates(locale, "/agents"),
    openGraph: {
      title: t("ogTitle", { siteName: SITE_NAME }),
      description: t("ogDescription"),
      url: localizedAlternates(locale, "/agents").canonical,
      type: "website",
      images: [absoluteUrl("/opengraph-image")],
    },
  };
}

const PAGE_SIZE = 24;
/** Page numbers rendered around the current one; the rest are reachable by paging. */
const PAGE_WINDOW = 5;

const PROTOCOLS = ["A2A", "OPENAI_COMPAT", "MCP"];
const PRICING = ["FREE", "PER_CALL", "PER_TASK", "PER_TOKEN"];

type Kind = "HOSTED" | "PROJECT";
/** "" is the unfiltered listing — both kinds at once. */
type KindFilter = "" | Kind;

const KINDS: { key: KindFilter; labelKey: "all" | "kindAgents" | "kindProjects" }[] = [
  { key: "", labelKey: "all" },
  { key: "HOSTED", labelKey: "kindAgents" },
  { key: "PROJECT", labelKey: "kindProjects" },
];

const SORTS = ["latest", "stars", "calls", "rating"] as const;
type Sort = (typeof SORTS)[number];

// "popular" used to sort by likesCount, which is 0 on every row, so it handed
// back an arbitrary order — it is gone. The remaining columns are offered per
// kind: only PROJECT rows carry GitHub stars, and only HOSTED rows accrue calls
// and ratings, so offering all four everywhere sorts by a column of zeroes.
const SORTS_BY_KIND: Record<KindFilter, readonly Sort[]> = {
  "": SORTS,
  HOSTED: ["latest", "calls", "rating"],
  PROJECT: ["latest", "stars"],
};

const DEFAULT_SORT: Record<KindFilter, Sort> = {
  "": "latest",
  HOSTED: "calls",
  PROJECT: "stars",
};

// Ties are the norm here (most rows sit at zero calls and no rating), and
// without a deterministic last key Postgres may order them differently on each
// query — which makes rows repeat or vanish as you page through.
const ORDER_BY: Record<Sort, Prisma.AgentOrderByWithRelationInput[]> = {
  latest: [{ createdAt: "desc" }, { id: "asc" }],
  stars: [{ stars: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }],
  calls: [{ callsCount: "desc" }, { createdAt: "desc" }, { id: "asc" }],
  rating: [{ avgRating: "desc" }, { ratingCount: "desc" }, { createdAt: "desc" }, { id: "asc" }],
};

const SORT_LABEL_KEY: Record<Sort, string> = {
  latest: "sortLatest",
  stars: "sortStars",
  calls: "sortCalls",
  rating: "sortRating",
};

// Map each pricing enum to its translation key (rendered as a filter label).
const PRICING_LABEL_KEY: Record<string, string> = {
  FREE: "pricingFree",
  PER_CALL: "pricingPerCall",
  PER_TASK: "pricingPerTask",
  PER_TOKEN: "pricingPerToken",
};

// Exactly what AgentCard renders — healthStatus included, so the card's health
// dot has something to show. Agent rows also carry `reviewNote` and
// `publisherId`, neither of which belongs on a public page.
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

type MarketplaceAgent = Prisma.AgentGetPayload<{ select: typeof AGENT_CARD_SELECT }>;

type SearchParams = Record<string, string | string[] | undefined>;
type Query = Record<string, string | undefined>;

/** A repeated key (`?q=a&q=b`) arrives as an array; the first value wins. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hrefWith(base: Query, patch: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...base, ...patch })) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/agents?${qs}` : "/agents";
}

function protocolLabel(protocol: string): string {
  return protocol === "OPENAI_COMPAT" ? "OpenAI" : protocol;
}

function chip(active: boolean): string {
  return `px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
    active
      ? "bg-purple-600 text-white border-purple-600"
      : "bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-gray-900"
  }`;
}

type FilterOption = {
  /** Unique within its group; only used as the React key. */
  value: string;
  label: string;
  emoji?: string;
  href: string;
  active: boolean;
};

type FilterGroup = {
  id: string;
  title: string;
  options: FilterOption[];
  /** Long groups (the 17 scenarios) get their own scroll area on desktop. */
  scroll?: boolean;
};

function FilterPanel({ groups, label }: { groups: FilterGroup[]; label: string }) {
  return (
    <nav aria-label={label} className="space-y-6">
      {groups.map((group) => (
        <div key={group.id}>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {group.title}
          </h2>
          <ul
            className={`flex flex-row flex-wrap lg:flex-col gap-1 ${
              group.scroll ? "lg:max-h-72 lg:overflow-y-auto lg:pe-1" : ""
            }`}
          >
            {group.options.map((option) => (
              <li key={option.value}>
                <Link
                  href={option.href}
                  aria-current={option.active ? "true" : undefined}
                  className={`block px-3 py-1.5 rounded-lg text-sm font-medium text-start transition-colors truncate ${
                    option.active
                      ? "bg-purple-100 text-purple-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  {option.emoji && (
                    <span aria-hidden="true" className="me-1.5">
                      {option.emoji}
                    </span>
                  )}
                  {option.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default async function AgentsMarketplacePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Agents");
  const tScenario = await getTranslations("Scenarios");

  const sp = await searchParams;
  const rawScenario = firstValue(sp.scenario);
  const rawProtocol = firstValue(sp.protocol);
  const rawPricing = firstValue(sp.pricing);
  const rawKind = firstValue(sp.kind);

  const category = firstValue(sp.category)?.trim() || undefined;
  const scenario = isScenarioSlug(rawScenario) ? rawScenario : undefined;
  const protocol = rawProtocol && PROTOCOLS.includes(rawProtocol) ? rawProtocol : undefined;
  const pricing = rawPricing && PRICING.includes(rawPricing) ? rawPricing : undefined;
  const q = firstValue(sp.q)?.trim() || undefined;
  const kind: KindFilter = rawKind === "HOSTED" || rawKind === "PROJECT" ? rawKind : "";

  const availableSorts = SORTS_BY_KIND[kind];
  const defaultSort = DEFAULT_SORT[kind];
  // A sort the current kind cannot rank by (`?kind=PROJECT&sort=calls`) falls
  // back to that kind's default, so the toolbar never disagrees with the order.
  const sort: Sort = availableSorts.find((s) => s === firstValue(sp.sort)) ?? defaultSort;
  const requestedPage = Math.max(1, Math.trunc(Number(firstValue(sp.page))) || 1);

  const where: Prisma.AgentWhereInput = { status: "APPROVED" };
  if (kind) where.kind = kind;
  if (category) where.category = { slug: category };
  if (scenario) where.scenarios = { has: scenario };
  if (protocol) where.protocols = { has: protocol } as Prisma.AgentWhereInput["protocols"];
  if (pricing) where.pricingModel = pricing as Prisma.AgentWhereInput["pricingModel"];
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, categories] = await Promise.all([
    prisma.agent.count({ where }),
    getAgentCategories(),
  ]);

  // Clamp before querying so `?page=9999` shows the last page rather than an
  // empty grid with no way back.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const agents: MarketplaceAgent[] =
    total === 0
      ? []
      : await prisma.agent.findMany({
          where,
          select: AGENT_CARD_SELECT,
          orderBy: ORDER_BY[sort],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        });

  // Carried into every filter link. `sort` is omitted while it matches the
  // kind's default so the common URLs stay short and shareable.
  const base: Query = {
    kind: kind || undefined,
    scenario,
    category,
    protocol,
    pricing,
    q,
    sort: sort === defaultSort ? undefined : sort,
  };

  const scenarioGroup: FilterGroup = {
    id: "scenario",
    title: t("scenarioGroup"),
    scroll: true,
    options: [
      {
        value: "all",
        label: t("all"),
        href: hrefWith(base, { scenario: undefined, page: undefined }),
        active: !scenario,
      },
      ...SCENARIOS.map((s) => ({
        value: s.slug,
        label: tScenario(s.slug),
        emoji: s.emoji,
        href: hrefWith(base, { scenario: s.slug, page: undefined }),
        active: scenario === s.slug,
      })),
    ],
  };

  const protocolGroup: FilterGroup = {
    id: "protocol",
    title: t("protocolGroup"),
    options: [
      {
        value: "all",
        label: t("all"),
        href: hrefWith(base, { protocol: undefined, page: undefined }),
        active: !protocol,
      },
      ...PROTOCOLS.map((p) => ({
        value: p,
        label: protocolLabel(p),
        href: hrefWith(base, { protocol: p, page: undefined }),
        active: protocol === p,
      })),
    ],
  };

  const pricingGroup: FilterGroup = {
    id: "pricing",
    title: t("pricingGroup"),
    options: [
      {
        value: "all",
        label: t("all"),
        href: hrefWith(base, { pricing: undefined, page: undefined }),
        active: !pricing,
      },
      ...PRICING.map((p) => ({
        value: p,
        label: t(PRICING_LABEL_KEY[p]),
        href: hrefWith(base, { pricing: p, page: undefined }),
        active: pricing === p,
      })),
    ],
  };

  const categoryGroup: FilterGroup = {
    id: "category",
    title: t("categoryGroup"),
    scroll: true,
    options: [
      {
        value: "all",
        label: t("all"),
        href: hrefWith(base, { category: undefined, page: undefined }),
        active: !category,
      },
      ...categories.map((c) => ({
        value: c.slug,
        label: c.name,
        href: hrefWith(base, { category: c.slug, page: undefined }),
        active: category === c.slug,
      })),
    ],
  };

  // Protocols and pricing describe a hosted endpoint; an open-source project has
  // neither, so those groups would only ever filter the list down to nothing.
  const groups: FilterGroup[] = [scenarioGroup];
  if (kind !== "PROJECT") groups.push(protocolGroup, pricingGroup);
  if (categories.length > 0) groups.push(categoryGroup);

  // The summary of what is currently narrowing the list. `kind` and `sort` are
  // left out: both are always-visible controls in the toolbar, not hidden state.
  const activeFilters: { key: string; label: string; href: string }[] = [];
  if (q) {
    activeFilters.push({
      key: "q",
      label: t("searchChip", { query: q }),
      href: hrefWith(base, { q: undefined, page: undefined }),
    });
  }
  if (scenario) {
    activeFilters.push({
      key: "scenario",
      label: tScenario(scenario),
      href: hrefWith(base, { scenario: undefined, page: undefined }),
    });
  }
  if (protocol) {
    activeFilters.push({
      key: "protocol",
      label: protocolLabel(protocol),
      href: hrefWith(base, { protocol: undefined, page: undefined }),
    });
  }
  if (pricing) {
    activeFilters.push({
      key: "pricing",
      label: t(PRICING_LABEL_KEY[pricing]),
      href: hrefWith(base, { pricing: undefined, page: undefined }),
    });
  }
  if (category) {
    activeFilters.push({
      key: "category",
      label: categories.find((c) => c.slug === category)?.name ?? category,
      href: hrefWith(base, { category: undefined, page: undefined }),
    });
  }

  // Clearing keeps the kind you are browsing and the column you are sorting by.
  const clearAllHref = hrefWith({}, { kind: kind || undefined, sort: base.sort });

  const windowSize = Math.min(PAGE_WINDOW, totalPages);
  const windowStart = Math.max(1, Math.min(page - 2, totalPages - windowSize + 1));
  const pageNumbers = Array.from({ length: windowSize }, (_, i) => windowStart + i);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t("heroTitle")}</h1>
        <p className="text-sm text-gray-600 mt-2 max-w-2xl">
          <span className="font-medium text-purple-600">{t("heroTagline")}</span>{" "}
          {t("heroSubtitle")}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Desktop sidebar. The same panel is rendered again below inside a
            <details> for narrow screens: native disclosure content cannot be
            forced open with CSS, and rebuilding it as a client toggle would ship
            JavaScript for what is a list of links. Only one copy is ever
            displayed, so the hidden one stays out of the accessibility tree. */}
        <aside className="hidden lg:block lg:w-60 shrink-0">
          <div className="lg:sticky lg:top-24">
            <FilterPanel groups={groups} label={t("filtersTitle")} />
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {/* Search. A native <form action="/agents"> dropped the visitor back on
              the English listing from every other locale; SiteSearch routes
              through the locale-aware router instead. */}
          <div className="max-w-xl mb-5">
            <SiteSearch variant="hero" defaultScope={kind === "PROJECT" ? "projects" : "agents"} />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <nav aria-label={t("kindLabel")} className="flex items-center gap-2">
              {KINDS.map((k) => (
                <Link
                  key={k.key || "all"}
                  href={hrefWith(base, {
                    kind: k.key || undefined,
                    page: undefined,
                    // Each kind ranks by a different column, so switching starts
                    // from the new kind's default rather than carrying over a
                    // sort it has no data for.
                    sort: undefined,
                    ...(k.key === "PROJECT" ? { protocol: undefined, pricing: undefined } : {}),
                  })}
                  aria-current={kind === k.key ? "true" : undefined}
                  className={chip(kind === k.key)}
                >
                  {t(k.labelKey)}
                </Link>
              ))}
            </nav>

            <nav
              aria-label={t("sortLabel")}
              className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 self-start sm:self-auto"
            >
              {availableSorts.map((s) => (
                <Link
                  key={s}
                  href={hrefWith(base, {
                    sort: s === defaultSort ? undefined : s,
                    page: undefined,
                  })}
                  aria-current={sort === s ? "true" : undefined}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    sort === s ? "bg-white text-purple-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {t(SORT_LABEL_KEY[s])}
                </Link>
              ))}
            </nav>
          </div>

          {/* Mobile filters — collapsed by default so the results are the first
              thing on screen instead of forty chips. */}
          <details className="lg:hidden mb-4 rounded-xl border border-gray-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 marker:text-gray-500">
              <span className="inline-flex items-center gap-2 align-middle">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                {activeFilters.length > 0
                  ? t("filtersWithCount", { count: activeFilters.length })
                  : t("filtersTitle")}
              </span>
            </summary>
            <div className="border-t border-gray-100 px-4 py-4">
              <FilterPanel groups={groups} label={t("filtersTitle")} />
            </div>
          </details>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs font-medium text-gray-500 me-1">{t("activeFiltersLabel")}</span>
              {activeFilters.map((f) => (
                <Link
                  key={f.key}
                  href={f.href}
                  aria-label={t("removeFilter", { label: f.label })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 hover:border-purple-300 transition-colors"
                >
                  {f.label}
                  <X className="h-3 w-3" aria-hidden="true" />
                </Link>
              ))}
              <Link
                href={clearAllHref}
                className="text-xs font-medium text-gray-600 hover:text-purple-600 underline underline-offset-2"
              >
                {t("clearAll")}
              </Link>
            </div>
          )}

          <p className="text-sm text-gray-600 mb-4">{t("count", { count: total })}</p>

          <h2 className="sr-only">{t("resultsLabel")}</h2>
          {agents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
              <p className="text-gray-600">{t("emptyTitle")}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
                {activeFilters.length > 0 && (
                  <Link
                    href={clearAllHref}
                    className="text-sm font-medium text-gray-600 hover:text-purple-600 underline underline-offset-2"
                  >
                    {t("clearAll")}
                  </Link>
                )}
                <Link href="/submit-agent" className="text-purple-600 text-sm font-medium hover:underline">
                  {t("emptyCta")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {agents.map((a) => (
                <AgentCard key={a.slug} agent={a} />
              ))}
            </div>
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
                {page > 1 ? (
                  <Link
                    href={hrefWith(base, { page: page - 1 === 1 ? undefined : String(page - 1) })}
                    rel="prev"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                    {t("prev")}
                  </Link>
                ) : (
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
                  >
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                    {t("prev")}
                  </span>
                )}

                <div className="flex items-center gap-1">
                  {pageNumbers.map((n) => (
                    <Link
                      key={n}
                      href={hrefWith(base, { page: n === 1 ? undefined : String(n) })}
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

                {page < totalPages ? (
                  <Link
                    href={hrefWith(base, { page: String(page + 1) })}
                    rel="next"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {t("next")}
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                ) : (
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
                  >
                    {t("next")}
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </span>
                )}
              </div>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
