import {
  Award,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Heart,
  Medal,
  Search,
  Star,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import { Link, getPathname } from "@/i18n/navigation";
import { getSkillCategories } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";

// Every rendering of this page is a function of the query string, so there is
// nothing to prerender. The one read that is shared across visitors — the
// category sidebar — is cached in lib/catalog instead.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Anchors the "where do these numbers come from" note that the two upstream
// columns point at with aria-describedby.
const PROVENANCE_NOTE_ID = "trending-provenance";

const SORTS = ["downloads", "stars", "likes", "views"] as const;
type SortKey = (typeof SORTS)[number];

const DEFAULT_SORT: SortKey = "downloads";

// The previous client version put the likes column behind `sort=popular` (the
// value the /api/skills endpoint uses). Keep honouring it so leaderboard links
// people already shared don't silently fall back to the default sort.
const SORT_ALIASES: Record<string, SortKey> = { popular: "likes" };

type Column = {
  key: SortKey;
  /** Message key in the `Trending` namespace. */
  labelKey: "downloads" | "stars" | "likes" | "views";
  icon: LucideIcon;
  /** Scraped from a third party rather than measured here — see the note. */
  upstream: boolean;
  orderBy: Prisma.SkillOrderByWithRelationInput;
  value: (skill: LeaderboardSkill) => number;
};

// `downloads` and `stars` are mirrored from clawskills.sh / GitHub by the nightly
// sync; nothing in this codebase increments them (see the comment on
// Skill.downloads in prisma/schema.prisma). `likes` and `views` are ours. The
// distinction is surfaced to the reader rather than left implicit.
const COLUMNS: Column[] = [
  {
    key: "downloads",
    labelKey: "downloads",
    icon: Download,
    upstream: true,
    orderBy: { downloads: "desc" },
    value: (s) => s.downloads,
  },
  {
    key: "stars",
    labelKey: "stars",
    icon: Star,
    upstream: true,
    orderBy: { stars: "desc" },
    value: (s) => s.stars,
  },
  {
    key: "likes",
    labelKey: "likes",
    icon: Heart,
    upstream: false,
    orderBy: { likesCount: "desc" },
    value: (s) => s.likesCount,
  },
  {
    key: "views",
    labelKey: "views",
    icon: Eye,
    upstream: false,
    orderBy: { viewsCount: "desc" },
    value: (s) => s.viewsCount,
  },
];

const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

// Exactly the fields the leaderboard renders. Skill rows also carry `reviewNote`
// and `submitterId`, neither of which belongs on a public page.
const LEADERBOARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  brief: true,
  author: true,
  downloads: true,
  stars: true,
  likesCount: true,
  viewsCount: true,
  category: { select: { name: true, slug: true } },
} as const;

type LeaderboardSkill = {
  id: string;
  name: string;
  slug: string;
  brief: string | null;
  author: string | null;
  downloads: number;
  stars: number;
  likesCount: number;
  viewsCount: number;
  category: { name: string; slug: string };
};

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
  return qs ? `/trending?${qs}` : "/trending";
}

function RankBadge({ rank }: { rank: number }) {
  // The medal for the top three replaces the number, so the rank is repeated for
  // screen readers.
  const label = <span className="sr-only">{rank}</span>;
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 text-white shadow-md shadow-amber-200">
        <Trophy className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 text-white shadow-md shadow-gray-200">
        <Medal className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-md shadow-orange-200">
        <Award className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-semibold text-sm">
      {rank}
    </span>
  );
}

/**
 * One end of the pager. A null `href` means we are already on the first/last
 * page: the step stays on screen as an inert placeholder so the control row does
 * not reflow as you page through, but it is hidden from assistive tech.
 */
function PageStep({
  href,
  label,
  direction,
}: {
  href: string | null;
  label: string;
  direction: "prev" | "next";
}) {
  const Chevron = direction === "prev" ? ChevronLeft : ChevronRight;
  // The glyph points back/forward, which is mirrored under `dir="rtl"`.
  const chevron = <Chevron className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />;
  const body =
    direction === "prev" ? (
      <>
        {chevron}
        {label}
      </>
    ) : (
      <>
        {label}
        {chevron}
      </>
    );

  if (!href) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-500 opacity-50"
      >
        {body}
      </span>
    );
  }
  return (
    <Link
      href={href}
      rel={direction}
      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
    >
      {body}
    </Link>
  );
}

export default async function TrendingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Trending");

  const sp = await searchParams;
  const rawSort = firstValue(sp.sort) ?? "";
  const sort: SortKey =
    SORTS.find((s) => s === rawSort) ?? SORT_ALIASES[rawSort] ?? DEFAULT_SORT;
  const activeColumn = COLUMN_BY_KEY.get(sort) ?? COLUMNS[0];
  const ActiveIcon = activeColumn.icon;
  const category = firstValue(sp.category)?.trim() || undefined;
  const q = firstValue(sp.q)?.trim() || undefined;
  const requestedPage = Math.max(1, Math.trunc(Number(firstValue(sp.page))) || 1);

  const where: Prisma.SkillWhereInput = { status: "APPROVED" };
  if (category) where.category = { slug: category };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { brief: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, categories] = await Promise.all([
    prisma.skill.count({ where }),
    getSkillCategories(),
  ]);

  // Clamp before querying so `?page=9999` shows the last page rather than an
  // empty table.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const skills: LeaderboardSkill[] =
    total === 0
      ? []
      : await prisma.skill.findMany({
          where,
          select: LEADERBOARD_SELECT,
          // Ties are common (most skills sit at zero likes or views), and without a
          // deterministic second key Postgres may order them differently per query
          // — which makes rows repeat or vanish as you page through.
          orderBy: [activeColumn.orderBy, { id: "asc" }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        });

  const base: Query = {
    sort: sort === DEFAULT_SORT ? undefined : sort,
    category,
    q,
  };

  const compact = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const exact = new Intl.NumberFormat(locale);

  const activeCategoryName = category
    ? categories.find((c) => c.slug === category)?.name
    : undefined;

  // A search narrows the table but not the per-category totals, so showing both
  // at once would just look like a contradiction.
  const showCategoryCounts = !q;
  const visibleCategories = categories.filter(
    (c) => c.skillCount > 0 || c.slug === category
  );

  const pageWindow = Math.min(5, totalPages);
  const windowStart = Math.max(1, Math.min(page - 2, totalPages - pageWindow + 1));
  const pageNumbers = Array.from({ length: pageWindow }, (_, i) => windowStart + i);

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50/50 via-white to-white">
      {/* Hero */}
      <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-blue-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-7 w-7 text-purple-200" aria-hidden="true" />
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{t("title")}</h1>
          </div>
          <p className="text-purple-100 text-sm sm:text-base">{t("subtitle")}</p>

          {/* Search — a plain GET form, so results are linkable and work without JS.
              The action is resolved through getPathname so the locale prefix survives. */}
          <form
            action={getPathname({ href: "/trending", locale })}
            method="get"
            className="mt-5 flex gap-2 max-w-lg"
          >
            {sort !== DEFAULT_SORT && <input type="hidden" name="sort" value={sort} />}
            {category && <input type="hidden" name="category" value={category} />}
            <div className="relative flex-1">
              <Search
                className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-200"
                aria-hidden="true"
              />
              <input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                aria-label={t("searchPlaceholder")}
                placeholder={t("searchPlaceholder")}
                className="w-full ps-10 pe-4 py-2.5 rounded-lg bg-white/10 border border-white/30 text-white placeholder-purple-200 focus:bg-white/20 focus:border-white/60 focus:ring-2 focus:ring-white/40 outline-none transition-all text-sm backdrop-blur-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-purple-700 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-white/60"
            >
              {t("search")}
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Categories */}
          <nav aria-label={t("categories")} className="lg:w-56 shrink-0">
            <div className="lg:sticky lg:top-24">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {t("categories")}
              </h2>
              <ul className="flex flex-row flex-wrap lg:flex-col gap-1.5">
                <li>
                  <Link
                    href={hrefWith(base, { category: undefined, page: undefined })}
                    aria-current={!category ? "true" : undefined}
                    className={`block px-3 py-1.5 rounded-lg text-sm font-medium text-start transition-colors ${
                      !category
                        ? "bg-purple-100 text-purple-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {t("allCategories")}
                    {showCategoryCounts && (
                      <span className="ms-1.5 text-xs text-gray-500">
                        ({exact.format(categories.reduce((a, c) => a + c.skillCount, 0))})
                      </span>
                    )}
                  </Link>
                </li>
                {visibleCategories.map((cat) => (
                  <li key={cat.id}>
                    <Link
                      href={hrefWith(base, { category: cat.slug, page: undefined })}
                      aria-current={category === cat.slug ? "true" : undefined}
                      className={`block px-3 py-1.5 rounded-lg text-sm font-medium text-start transition-colors truncate ${
                        category === cat.slug
                          ? "bg-purple-100 text-purple-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {cat.name}
                      {showCategoryCounts && (
                        <span className="ms-1.5 text-xs text-gray-500">
                          ({exact.format(cat.skillCount)})
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* Leaderboard */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <nav
                aria-label={t("sortLabel")}
                className="flex items-center gap-1 bg-gray-100 rounded-lg p-1"
              >
                {COLUMNS.map((col) => {
                  const Icon = col.icon;
                  const active = sort === col.key;
                  return (
                    <Link
                      key={col.key}
                      href={hrefWith(base, {
                        sort: col.key === DEFAULT_SORT ? undefined : col.key,
                        page: undefined,
                      })}
                      aria-current={active ? "true" : undefined}
                      aria-label={t(col.labelKey)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        active
                          ? "bg-white text-purple-700 shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">{t(col.labelKey)}</span>
                    </Link>
                  );
                })}
              </nav>
              <p className="text-sm text-gray-600">
                {activeCategoryName
                  ? t("countInCategory", { count: total, category: activeCategoryName })
                  : t("count", { count: total })}
              </p>
            </div>

            {/* Where the numbers come from. Two of these four columns are not ours. */}
            <p
              id={PROVENANCE_NOTE_ID}
              className="mb-4 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600"
            >
              <span aria-hidden="true" className="me-1">
                †
              </span>
              {t("provenanceNote")}
            </p>

            {/* Table header */}
            <div className="hidden md:grid md:grid-cols-[3rem_1fr_8rem_6rem_6rem_6rem] gap-2 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
              <span>
                <span aria-hidden="true">#</span>
                <span className="sr-only">{t("rank")}</span>
              </span>
              <span>{t("skill")}</span>
              {COLUMNS.map((col) => {
                const Icon = col.icon;
                return (
                  <span
                    key={col.key}
                    className="text-end"
                    aria-describedby={col.upstream ? PROVENANCE_NOTE_ID : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      {t(col.labelKey)}
                      {col.upstream && <span aria-hidden="true">†</span>}
                    </span>
                  </span>
                );
              })}
            </div>

            {/* Rows */}
            {skills.length === 0 ? (
              <div className="text-center py-20 text-gray-600">
                <TrendingUp className="h-12 w-12 mx-auto mb-3 text-gray-300" aria-hidden="true" />
                <p className="text-lg font-medium">{t("emptyTitle")}</p>
                <p className="text-sm mt-1">{t("emptySubtitle")}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {skills.map((skill, idx) => {
                  const rank = (page - 1) * PAGE_SIZE + idx + 1;
                  const isTop3 = rank <= 3;
                  return (
                    <Link
                      key={skill.id}
                      href={`/skills/${skill.slug}`}
                      className={`group grid grid-cols-[3rem_1fr] md:grid-cols-[3rem_1fr_8rem_6rem_6rem_6rem] gap-2 items-center px-4 py-3 transition-colors ${
                        isTop3
                          ? "bg-gradient-to-r from-purple-50/60 to-transparent hover:from-purple-100/60"
                          : idx % 2 === 0
                            ? "bg-white hover:bg-gray-50"
                            : "bg-gray-50/50 hover:bg-gray-100/50"
                      }`}
                    >
                      <div className="flex items-center justify-center">
                        <RankBadge rank={rank} />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 truncate group-hover:text-purple-600 transition-colors">
                            {skill.name}
                          </span>
                          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 font-medium shrink-0">
                            {skill.category.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {skill.author && (
                            <span className="text-xs text-gray-500">
                              {t("byAuthor", { author: skill.author })}
                            </span>
                          )}
                          {skill.brief && (
                            <span className="hidden lg:inline text-xs text-gray-500 truncate">
                              &mdash; {skill.brief}
                            </span>
                          )}
                        </div>

                        {/* Mobile: only the metric the table is currently sorted by —
                            four columns of numbers do not fit, and the other three
                            would be noise next to the ranking that is on screen. */}
                        <div className="flex items-center gap-3 mt-1 md:hidden">
                          <span
                            className="inline-flex items-center gap-1 text-xs text-gray-600"
                            aria-describedby={
                              activeColumn.upstream ? PROVENANCE_NOTE_ID : undefined
                            }
                          >
                            <ActiveIcon className="h-3 w-3 text-purple-600" aria-hidden="true" />
                            {t(activeColumn.labelKey)}{" "}
                            <span className="tabular-nums font-medium">
                              {compact.format(activeColumn.value(skill))}
                            </span>
                          </span>
                        </div>
                      </div>

                      {COLUMNS.map((col) => (
                        <span
                          key={col.key}
                          title={exact.format(col.value(skill))}
                          className={`hidden md:flex items-center justify-end text-sm font-medium tabular-nums ${
                            sort === col.key ? "text-purple-700" : "text-gray-600"
                          }`}
                        >
                          {compact.format(col.value(skill))}
                        </span>
                      ))}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <nav
                aria-label={t("paginationLabel")}
                className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-4 border-t border-gray-200"
              >
                <p className="text-sm text-gray-600">
                  {t("showing", {
                    from: (page - 1) * PAGE_SIZE + 1,
                    to: Math.min(page * PAGE_SIZE, total),
                    total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <PageStep
                    direction="prev"
                    label={t("prev")}
                    href={
                      page > 1
                        ? hrefWith(base, {
                            page: page - 1 === 1 ? undefined : String(page - 1),
                          })
                        : null
                    }
                  />

                  <div className="flex items-center gap-1">
                    {pageNumbers.map((n) => (
                      <Link
                        key={n}
                        href={hrefWith(base, { page: n === 1 ? undefined : String(n) })}
                        aria-label={t("goToPage", { page: n })}
                        aria-current={n === page ? "page" : undefined}
                        className={`w-8 h-8 inline-flex items-center justify-center rounded-lg text-sm font-medium tabular-nums transition-colors ${
                          n === page
                            ? "bg-purple-600 text-white"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {n}
                      </Link>
                    ))}
                  </div>

                  <PageStep
                    direction="next"
                    label={t("next")}
                    href={
                      page < totalPages
                        ? hrefWith(base, { page: String(page + 1) })
                        : null
                    }
                  />
                </div>
              </nav>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
