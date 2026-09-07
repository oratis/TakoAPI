import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import { Link, getPathname } from "@/i18n/navigation";
import SkillCard from "@/components/ui/SkillCard";
import { getSkillCategories } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { SITE_NAME, localizedAlternates } from "@/lib/seo";
import type { Skill } from "@/lib/types";

// The listing is driven entirely by `searchParams` (a request-time API), so it
// renders per request. Only the category row comes from the tagged catalog cache.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

// Every AgentType in the schema. The old client page omitted ZED, so skills
// tagged for Zed were unreachable from the UI.
const AGENT_TYPES = [
  { value: "CLAUDE_CODE", labelKey: "agentClaudeCode" },
  { value: "CURSOR", labelKey: "agentCursor" },
  { value: "WINDSURF", labelKey: "agentWindsurf" },
  { value: "ZED", labelKey: "agentZed" },
  { value: "CODEX", labelKey: "agentCodex" },
  { value: "COPILOT", labelKey: "agentCopilot" },
  { value: "AIDER", labelKey: "agentAider" },
  { value: "CLINE", labelKey: "agentCline" },
  { value: "GENERIC", labelKey: "agentGeneric" },
] as const;

// Query-string spellings of SkillSource, matching /api/skills.
const SOURCES = [
  { value: "github", labelKey: "sourceGithub" },
  { value: "user", labelKey: "sourceCommunity" },
  { value: "curated", labelKey: "sourceCurated" },
] as const;

const SORTS = [
  { value: "relevance", labelKey: "sortRelevance" },
  { value: "latest", labelKey: "sortLatest" },
  { value: "popular", labelKey: "sortPopular" },
  { value: "views", labelKey: "sortViews" },
  { value: "stars", labelKey: "sortStars" },
] as const;

type AgentValue = (typeof AGENT_TYPES)[number]["value"];
type SourceValue = (typeof SOURCES)[number]["value"];
type SortValue = (typeof SORTS)[number]["value"];

const SOURCE_DB_VALUE: Record<SourceValue, Prisma.SkillWhereInput["source"]> = {
  github: "GITHUB_SCRAPE",
  user: "USER_SUBMITTED",
  curated: "CURATED",
};

type RawSearchParams = Record<string, string | string[] | undefined>;
type QueryString = Record<string, string | undefined>;

/** A repeated param (`?sort=a&sort=b`) arrives as an array; every filter here is single-valued. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The single reading of the URL, shared by the page and its metadata so the two
 * can never disagree about what is filtered.
 */
function parseSkillQuery(sp: RawSearchParams) {
  const q = first(sp.q)?.trim() || undefined;
  const category = first(sp.category)?.trim() || undefined;

  // Accept the spellings /api/skills accepts, so a link built for the API works here.
  const rawAgent = first(sp.agent)?.toUpperCase().replace(/-/g, "_");
  const agent: AgentValue | undefined = AGENT_TYPES.find((a) => a.value === rawAgent)?.value;
  const source: SourceValue | undefined = SOURCES.find((s) => s.value === first(sp.source))?.value;

  // "Newest first" is a poor answer to a search, so a query with no explicit
  // sort keeps the ranking /api/skills/search used. Without a query there is
  // nothing to be relevant to, and the option is neither offered nor accepted.
  const defaultSort: SortValue = q ? "relevance" : "latest";
  const rawSort = first(sp.sort);
  const sort: SortValue =
    SORTS.find((s) => s.value === rawSort && (s.value !== "relevance" || q))?.value ?? defaultSort;

  const rawPage = Number(first(sp.page) ?? "1");
  const requestedPage = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  // A filter, a search or a re-sort produces a permutation of the same catalog
  // rather than a page of its own; metadata uses this to keep them unindexed.
  const filtered = Boolean(q || category || agent || source || sort !== defaultSort);

  return { q, category, agent, source, sort, defaultSort, requestedPage, filtered };
}

type SkillQuery = ReturnType<typeof parseSkillQuery>;

function buildWhere({ q, category, agent, source }: SkillQuery): Prisma.SkillWhereInput {
  const where: Prisma.SkillWhereInput = { status: "APPROVED" };
  if (category) where.category = { slug: category };
  if (agent) where.agentType = agent;
  if (source) where.source = SOURCE_DB_VALUE[source];
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { author: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

// Every branch ends in `{ id: "asc" }` for the reason trending/page.tsx and
// agents/page.tsx already document: ties are the common case (most skills sit at
// zero likes, views and stars), and page N / page N+1 are two independent
// statements, so without a unique final key Postgres may order a tie block
// differently between them — rows then repeat on one page and vanish from another.
function buildOrderBy(sort: SortValue): Prisma.SkillOrderByWithRelationInput[] {
  switch (sort) {
    case "relevance":
      return [{ downloads: "desc" }, { likesCount: "desc" }, { id: "asc" }];
    case "popular":
      return [{ likesCount: "desc" }, { id: "asc" }];
    case "views":
      return [{ viewsCount: "desc" }, { id: "asc" }];
    case "stars":
      // ghStars is nullable and Postgres sorts NULLS FIRST on DESC, which would
      // otherwise open "most starred" with every skill that has no star count.
      return [{ ghStars: { sort: "desc", nulls: "last" } }, { id: "asc" }];
    default:
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

/** Patch the current query string; dropped keys are the ones whose value is falsy. */
function hrefWith(base: QueryString, patch: QueryString): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...base, ...patch })) if (value) params.set(key, value);
  const qs = params.toString();
  return qs ? `/skills?${qs}` : "/skills";
}

/** First page, last page, and a window around the current one — with gaps marked. */
function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  const wanted = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= totalPages) wanted.add(p);

  const out: Array<number | "gap"> = [];
  let previous = 0;
  for (const p of [...wanted].sort((a, b) => a - b)) {
    if (previous && p - previous > 1) out.push("gap");
    out.push(p);
    previous = p;
  }
  return out;
}

function chip(active: boolean): string {
  return `px-3 py-1 rounded-full text-xs font-medium border transition ${
    active
      ? "bg-purple-600 text-white border-purple-600"
      : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
  }`;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Skills" });
  const { q, filtered, requestedPage } = parseSkillQuery(await searchParams);

  // The intermediate skills/layout.tsx sets a plain title, which breaks the root
  // layout's `%s — TakoAPI` template for this segment, so titles are absolute here.
  const metadata: Metadata = {};
  if (q) metadata.title = { absolute: `${t("metaTitleSearch", { query: q })} — ${SITE_NAME}` };

  if (filtered) {
    // Thousands of filter permutations of one catalog are not thousands of pages.
    // They stay crawlable (follow) so detail pages behind them are still reached,
    // and the layout's canonical already points at the bare /skills.
    metadata.robots = { index: false, follow: true };
  } else if (requestedPage > 1) {
    // Deeper pages are how a crawler walks past the first 24 of ~5k skills, so
    // they stay indexable — but they need their own canonical, or the layout's
    // static /skills canonical would fold every one of them into page 1.
    metadata.title = { absolute: `${t("metaTitlePaged", { page: requestedPage })} — ${SITE_NAME}` };
    metadata.alternates = localizedAlternates(locale, `/skills?page=${requestedPage}`);
  }
  return metadata;
}

export default async function SkillsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Skills");

  const query = parseSkillQuery(await searchParams);
  const { q, category, agent, source, sort, defaultSort, filtered } = query;
  const where = buildWhere(query);

  // The total has to land before the rows do: `?page=999` should show the last
  // page of results rather than an empty grid, and that needs totalPages first.
  const [total, categories] = await Promise.all([prisma.skill.count({ where }), getSkillCategories()]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(query.requestedPage, totalPages);

  const skills = await prisma.skill.findMany({
    where,
    // A listing never needs the README (up to 500 KB per row) or reviewer notes.
    omit: { readme: true, reviewNote: true },
    include: { category: { select: { name: true, slug: true } } },
    orderBy: buildOrderBy(sort),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // Every control below is a link that patches this, so filters compose, survive
  // a refresh, and can be opened in a new tab.
  const base: QueryString = {
    q,
    category,
    agent,
    source,
    sort: sort === defaultSort ? undefined : sort,
  };
  const sortOptions = SORTS.filter((s) => s.value !== "relevance" || q);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {q ? t("searchLabel", { query: q }) : t("heading")}
        </h1>
        <p className="text-sm text-gray-600 mt-1">{t("count", { count: total })}</p>
      </div>

      {/* A plain GET form: search works with no JavaScript, and the hidden
          fields keep the active filters instead of resetting them. */}
      <form
        action={getPathname({ href: "/skills", locale })}
        method="get"
        role="search"
        className="mb-5 flex gap-2 max-w-xl"
      >
        {category && <input type="hidden" name="category" value={category} />}
        {agent && <input type="hidden" name="agent" value={agent} />}
        {source && <input type="hidden" name="source" value={source} />}
        {base.sort && <input type="hidden" name="sort" value={base.sort} />}
        <label className="sr-only" htmlFor="skills-search">
          {t("searchInputLabel")}
        </label>
        <input
          id="skills-search"
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
        <button
          type="submit"
          className="rounded-full bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          {t("searchButton")}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-600 me-1">{t("agentFilter")}</span>
        <Link
          href={hrefWith(base, { agent: undefined, page: undefined })}
          className={chip(!agent)}
          aria-current={!agent ? "true" : undefined}
        >
          {t("agentAll")}
        </Link>
        {AGENT_TYPES.map((a) => (
          <Link
            key={a.value}
            href={hrefWith(base, { agent: a.value, page: undefined })}
            className={chip(agent === a.value)}
            aria-current={agent === a.value ? "true" : undefined}
          >
            {t(a.labelKey)}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-600 me-1">{t("sourceFilter")}</span>
        <Link
          href={hrefWith(base, { source: undefined, page: undefined })}
          className={chip(!source)}
          aria-current={!source ? "true" : undefined}
        >
          {t("all")}
        </Link>
        {SOURCES.map((s) => (
          <Link
            key={s.value}
            href={hrefWith(base, { source: s.value, page: undefined })}
            className={chip(source === s.value)}
            aria-current={source === s.value ? "true" : undefined}
          >
            {t(s.labelKey)}
          </Link>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="text-xs text-gray-600 me-1">{t("categoryFilter")}</span>
          <Link
            href={hrefWith(base, { category: undefined, page: undefined })}
            className={chip(!category)}
            aria-current={!category ? "true" : undefined}
          >
            {t("all")}
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={hrefWith(base, { category: c.slug, page: undefined })}
              className={chip(category === c.slug)}
              aria-current={category === c.slug ? "true" : undefined}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {filtered && (
            <Link href="/skills" className="text-sm text-purple-600 font-medium hover:underline">
              {t("clearFilters")}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-gray-600">{t("sortLabel")}</span>
          {sortOptions.map((s) => (
            <Link
              key={s.value}
              href={hrefWith(base, {
                sort: s.value === defaultSort ? undefined : s.value,
                page: undefined,
              })}
              aria-current={sort === s.value ? "true" : undefined}
              className={`text-xs ${
                sort === s.value ? "text-purple-600 font-semibold" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t(s.labelKey)}
            </Link>
          ))}
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-lg text-gray-600">{t("emptyTitle")}</p>
          <p className="text-sm text-gray-500 mt-1">{t("emptyHint")}</p>
          {filtered && (
            <Link
              href="/skills"
              className="mt-4 inline-block rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              {t("clearFilters")}
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map((skill) => (
            // SkillCard is typed against the JSON API shape (lib/types.Skill, dates
            // as strings) while Prisma returns Date objects and no `readme`; the row
            // carries every field the card actually reads.
            <SkillCard key={skill.id} skill={skill as unknown as Skill} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label={t("paginationLabel")} className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              rel="prev"
              href={hrefWith(base, { page: page - 1 === 1 ? undefined : String(page - 1) })}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("prev")}
            </Link>
          )}

          {/* Numbers need room; on a phone the position is all that fits. */}
          <span className="text-sm text-gray-600 sm:hidden">
            {t("pageOf", { page, total: totalPages })}
          </span>

          <ol className="hidden sm:flex items-center gap-1">
            {pageWindow(page, totalPages).map((entry, i) =>
              entry === "gap" ? (
                <li key={`gap-${i}`} aria-hidden className="px-1 text-sm text-gray-500">
                  &hellip;
                </li>
              ) : (
                <li key={entry}>
                  <Link
                    href={hrefWith(base, { page: entry === 1 ? undefined : String(entry) })}
                    aria-label={t("goToPage", { page: entry })}
                    aria-current={entry === page ? "page" : undefined}
                    className={`inline-block min-w-9 rounded-lg border px-2.5 py-1.5 text-center text-sm ${
                      entry === page
                        ? "border-purple-600 bg-purple-600 text-white font-semibold"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {entry}
                  </Link>
                </li>
              )
            )}
          </ol>

          {page < totalPages && (
            <Link
              rel="next"
              href={hrefWith(base, { page: String(page + 1) })}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("next")}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
