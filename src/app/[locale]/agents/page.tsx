import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import AgentCard from "@/components/ui/AgentCard";
import { SITE_NAME, localizedAlternates, absoluteUrl } from "@/lib/seo";
import { SCENARIOS, isScenarioSlug } from "@/lib/scenarios";
import type { Prisma } from "@prisma/client";

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

const PROTOCOLS = ["A2A", "OPENAI_COMPAT", "MCP"];
const PRICING = ["FREE", "PER_CALL", "PER_TASK", "PER_TOKEN"];
const SORTS = ["latest", "stars", "popular", "calls", "rating"] as const;
const KINDS = [
  { key: "", labelKey: "all" },
  { key: "HOSTED", labelKey: "kindAgents" },
  { key: "PROJECT", labelKey: "kindProjects" },
] as const;
const PAGE_SIZE = 24;

type SP = Record<string, string | undefined>;

function hrefWith(base: SP, patch: SP): string {
  const merged: SP = { ...base, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `/agents?${qs}` : "/agents";
}

function chip(active: boolean): string {
  return `px-3 py-1 rounded-full text-xs font-medium border transition ${
    active
      ? "bg-purple-600 text-white border-purple-600"
      : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
  }`;
}

// Map each pricing enum to its translation key (rendered as a chip label).
const PRICING_LABEL_KEY: Record<string, string> = {
  FREE: "pricingFree",
  PER_CALL: "pricingPerCall",
  PER_TASK: "pricingPerTask",
  PER_TOKEN: "pricingPerToken",
};

// Map each sort option to its translation key.
const SORT_LABEL_KEY: Record<(typeof SORTS)[number], string> = {
  latest: "sortLatest",
  stars: "sortStars",
  popular: "sortPopular",
  calls: "sortCalls",
  rating: "sortRating",
};

export default async function AgentsMarketplacePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SP>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Agents");
  const tScenario = await getTranslations("Scenarios");

  const sp = await searchParams;
  const category = sp.category;
  const scenario = isScenarioSlug(sp.scenario) ? sp.scenario : undefined;
  const protocol = PROTOCOLS.includes(sp.protocol || "") ? sp.protocol : undefined;
  const pricing = PRICING.includes(sp.pricing || "") ? sp.pricing : undefined;
  const q = sp.q?.trim() || undefined;
  const kind = ["HOSTED", "PROJECT"].includes(sp.kind || "") ? sp.kind : undefined;
  const sort = SORTS.some((s) => s === sp.sort)
    ? sp.sort!
    : kind === "PROJECT"
      ? "stars"
      : "latest";
  const page = Math.max(1, parseInt(sp.page || "1") || 1);

  const where: Prisma.AgentWhereInput = { status: "APPROVED" };
  if (kind) where.kind = kind as Prisma.AgentWhereInput["kind"];
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

  const orderBy: Prisma.AgentOrderByWithRelationInput =
    sort === "stars"
      ? { stars: "desc" }
      : sort === "popular"
        ? { likesCount: "desc" }
        : sort === "calls"
          ? { callsCount: "desc" }
          : sort === "rating"
            ? { avgRating: "desc" }
            : { createdAt: "desc" };

  const [agents, total, categories] = await Promise.all([
    prisma.agent.findMany({
      where,
      include: {
        category: { select: { name: true, slug: true } },
        _count: { select: { skills: true } },
      },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.agent.count({ where }),
    prisma.category.findMany({
      where: { agents: { some: { status: "APPROVED" } } },
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const base: SP = {
    kind,
    scenario,
    category,
    protocol,
    pricing,
    q,
    sort: sort === "latest" ? undefined : sort,
  };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t("heroTitle")}</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-2xl">
          <span className="font-medium text-purple-600">{t("heroTagline")}</span>{" "}
          {t("heroSubtitle")}
        </p>
      </div>

      {/* Search */}
      <form action="/agents" method="get" className="mb-5 flex gap-2 max-w-xl">
        {kind && <input type="hidden" name="kind" value={kind} />}
        {scenario && <input type="hidden" name="scenario" value={scenario} />}
        {protocol && <input type="hidden" name="protocol" value={protocol} />}
        {pricing && <input type="hidden" name="pricing" value={pricing} />}
        {category && <input type="hidden" name="category" value={category} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
        <button className="rounded-full bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-700">
          {t("search")}
        </button>
      </form>

      {/* Kind toggle */}
      <div className="flex items-center gap-2 mb-3">
        {KINDS.map((k) => (
          <Link
            key={k.key || "all"}
            href={hrefWith(base, { kind: k.key || undefined, page: undefined })}
            className={chip((kind || "") === k.key)}
          >
            {t(k.labelKey)}
          </Link>
        ))}
      </div>

      {/* Scenario — the primary "what would you use it for" dimension */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-400 me-1">{t("scenarioFilter")}</span>
        <Link href={hrefWith(base, { scenario: undefined, page: undefined })} className={chip(!scenario)}>
          {t("all")}
        </Link>
        {SCENARIOS.map((s) => (
          <Link
            key={s.slug}
            href={hrefWith(base, { scenario: s.slug, page: undefined })}
            className={chip(scenario === s.slug)}
            title={tScenario(s.slug)}
          >
            <span className="me-1">{s.emoji}</span>
            {tScenario(s.slug)}
          </Link>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs text-gray-400 me-1">{t("protocolFilter")}</span>
        <Link href={hrefWith(base, { protocol: undefined, page: undefined })} className={chip(!protocol)}>
          {t("all")}
        </Link>
        {PROTOCOLS.map((p) => (
          <Link key={p} href={hrefWith(base, { protocol: p, page: undefined })} className={chip(protocol === p)}>
            {p === "OPENAI_COMPAT" ? "OpenAI" : p}
          </Link>
        ))}
        <span className="text-xs text-gray-400 mx-1 ms-3">{t("pricingFilter")}</span>
        <Link href={hrefWith(base, { pricing: undefined, page: undefined })} className={chip(!pricing)}>
          {t("all")}
        </Link>
        {PRICING.map((p) => (
          <Link key={p} href={hrefWith(base, { pricing: p, page: undefined })} className={chip(pricing === p)}>
            {t(PRICING_LABEL_KEY[p])}
          </Link>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="text-xs text-gray-400 me-1">{t("categoryFilter")}</span>
          <Link href={hrefWith(base, { category: undefined, page: undefined })} className={chip(!category)}>
            {t("all")}
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={hrefWith(base, { category: c.slug, page: undefined })}
              className={chip(category === c.slug)}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {/* Sort + count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{t("count", { count: total })}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{t("sortLabel")}</span>
          {SORTS.map((s) => (
            <Link
              key={s}
              href={hrefWith(base, { sort: s === "latest" ? undefined : s, page: undefined })}
              className={`text-xs ${sort === s ? "text-purple-600 font-semibold" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t(SORT_LABEL_KEY[s])}
            </Link>
          ))}
        </div>
      </div>

      {/* Grid */}
      {agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-gray-500">{t("emptyTitle")}</p>
          <Link href="/submit-agent" className="text-purple-600 text-sm font-medium hover:underline mt-2 inline-block">
            {t("emptyCta")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <AgentCard key={a.slug} agent={a} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          {page > 1 && (
            <Link href={hrefWith(base, { page: String(page - 1) })} className="text-sm text-purple-600 hover:underline">
              {t("prev")}
            </Link>
          )}
          <span className="text-sm text-gray-400">{t("pageOf", { page, total: totalPages })}</span>
          {page < totalPages && (
            <Link href={hrefWith(base, { page: String(page + 1) })} className="text-sm text-purple-600 hover:underline">
              {t("next")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
