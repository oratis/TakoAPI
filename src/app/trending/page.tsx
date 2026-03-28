"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Download,
  Star,
  Heart,
  Eye,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Trophy,
  Medal,
  Award,
} from "lucide-react";
import type { Skill, Category } from "@/lib/types";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

type SortKey = "downloads" | "stars" | "popular" | "views";

const SORT_OPTIONS: { key: SortKey; label: string; icon: typeof Download }[] = [
  { key: "downloads", label: "Downloads", icon: Download },
  { key: "stars", label: "Stars", icon: Star },
  { key: "popular", label: "Likes", icon: Heart },
  { key: "views", label: "Views", icon: Eye },
];

const LIMIT = 50;

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 text-white font-bold text-sm shadow-md shadow-amber-200">
        <Trophy className="h-4 w-4" />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 text-white font-bold text-sm shadow-md shadow-gray-200">
        <Medal className="h-4 w-4" />
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-500 text-white font-bold text-sm shadow-md shadow-orange-200">
        <Award className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-500 font-semibold text-sm">
      {rank}
    </span>
  );
}

function TrendingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialSort = (searchParams.get("sort") as SortKey) || "downloads";
  const initialCategory = searchParams.get("category") || "";
  const initialPage = parseInt(searchParams.get("page") || "1");
  const initialQ = searchParams.get("q") || "";

  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQ);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Fetch categories
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories);
  }, []);

  // Update URL params
  const updateUrl = useCallback(
    (s: SortKey, cat: string, p: number, q: string) => {
      const params = new URLSearchParams();
      if (s !== "downloads") params.set("sort", s);
      if (cat) params.set("category", cat);
      if (p > 1) params.set("page", String(p));
      if (q) params.set("q", q);
      const qs = params.toString();
      router.replace(`/trending${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router]
  );

  // Fetch skills
  useEffect(() => {
    setLoading(true);
    const isSearch = debouncedQuery.trim().length > 0;
    const endpoint = isSearch ? "/api/skills/search" : "/api/skills";
    const params = new URLSearchParams({
      page: String(page),
      limit: String(LIMIT),
      sort,
      ...(activeCategory ? { category: activeCategory } : {}),
      ...(isSearch ? { q: debouncedQuery.trim() } : {}),
    });

    fetch(`${endpoint}?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setSkills(data.skills || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      })
      .finally(() => setLoading(false));

    updateUrl(sort, activeCategory, page, debouncedQuery);
  }, [sort, activeCategory, page, debouncedQuery, updateUrl]);

  const handleSortChange = (key: SortKey) => {
    setSort(key);
    setPage(1);
  };

  const handleCategoryChange = (slug: string) => {
    setActiveCategory(slug);
    setPage(1);
  };

  const getSortValue = (skill: Skill) => {
    switch (sort) {
      case "downloads":
        return skill.downloads;
      case "stars":
        return skill.stars;
      case "popular":
        return skill.likesCount;
      case "views":
        return skill.viewsCount;
      default:
        return skill.downloads;
    }
  };

  const getSortIcon = () => {
    const opt = SORT_OPTIONS.find((o) => o.key === sort);
    return opt ? opt.icon : Download;
  };

  const SortIcon = getSortIcon();

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50/50 via-white to-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-blue-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-7 w-7 text-purple-200" />
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Trending Skills
            </h1>
          </div>
          <p className="text-purple-200 text-sm sm:text-base">
            Discover the most popular OpenClaw skills ranked by the community
          </p>

          {/* Search bar */}
          <div className="mt-5 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-300" />
              <input
                type="text"
                placeholder="Search trending skills..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-purple-300 focus:bg-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none transition-all text-sm backdrop-blur-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar - Categories */}
          <aside className="lg:w-56 shrink-0">
            <div className="lg:sticky lg:top-24">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Categories
              </h3>
              <div className="flex flex-row flex-wrap lg:flex-col gap-1.5">
                <button
                  onClick={() => handleCategoryChange("")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                    !activeCategory
                      ? "bg-purple-100 text-purple-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  All Categories
                  <span className="ml-1.5 text-xs text-gray-400">
                    ({categories.reduce((a, c) => a + c.skillCount, 0)})
                  </span>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryChange(cat.slug)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors truncate ${
                      activeCategory === cat.slug
                        ? "bg-purple-100 text-purple-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {cat.name}
                    <span className="ml-1.5 text-xs text-gray-400">
                      ({cat.skillCount})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Sort tabs + info */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {SORT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleSortChange(opt.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        sort === opt.key
                          ? "bg-white text-purple-700 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-gray-500">
                {total.toLocaleString()} skills
                {activeCategory && categories.length > 0 && (
                  <> in <span className="font-medium text-gray-700">{categories.find((c) => c.slug === activeCategory)?.name}</span></>
                )}
              </p>
            </div>

            {/* Table header */}
            <div className="hidden md:grid md:grid-cols-[3rem_1fr_8rem_6rem_6rem_6rem] gap-2 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">
              <span>#</span>
              <span>Skill</span>
              <span className="text-right">
                <span className="inline-flex items-center gap-1">
                  <Download className="h-3 w-3" /> Downloads
                </span>
              </span>
              <span className="text-right">
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3" /> Stars
                </span>
              </span>
              <span className="text-right">
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3 w-3" /> Likes
                </span>
              </span>
              <span className="text-right">
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Views
                </span>
              </span>
            </div>

            {/* Skills list */}
            {loading ? (
              <div className="space-y-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 bg-gray-50 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : skills.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <TrendingUp className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="text-lg font-medium">No skills found</p>
                <p className="text-sm mt-1">
                  Try adjusting your search or filters
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {skills.map((skill, idx) => {
                  const rank = (page - 1) * LIMIT + idx + 1;
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
                      {/* Rank */}
                      <div className="flex items-center justify-center">
                        <RankBadge rank={rank} />
                      </div>

                      {/* Skill info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-semibold truncate group-hover:text-purple-600 transition-colors ${
                              isTop3 ? "text-gray-900" : "text-gray-800"
                            }`}
                          >
                            {skill.name}
                          </span>
                          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-600 font-medium shrink-0">
                            {skill.category.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {skill.author && (
                            <span className="text-xs text-gray-400">
                              by {skill.author}
                            </span>
                          )}
                          {skill.brief && (
                            <span className="hidden lg:inline text-xs text-gray-400 truncate">
                              &mdash; {skill.brief}
                            </span>
                          )}
                        </div>

                        {/* Mobile stats */}
                        <div className="flex items-center gap-3 mt-1 md:hidden">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <SortIcon className="h-3 w-3 text-purple-500" />
                            {formatNumber(getSortValue(skill))}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <Star className="h-3 w-3" />
                            {formatNumber(skill.stars)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <Heart className="h-3 w-3" />
                            {formatNumber(skill.likesCount)}
                          </span>
                        </div>
                      </div>

                      {/* Downloads */}
                      <span
                        className={`hidden md:flex items-center justify-end gap-1 text-sm font-medium ${
                          sort === "downloads"
                            ? "text-purple-700"
                            : "text-gray-600"
                        }`}
                      >
                        {formatNumber(skill.downloads)}
                      </span>

                      {/* Stars */}
                      <span
                        className={`hidden md:flex items-center justify-end gap-1 text-sm font-medium ${
                          sort === "stars"
                            ? "text-purple-700"
                            : "text-gray-600"
                        }`}
                      >
                        {formatNumber(skill.stars)}
                      </span>

                      {/* Likes */}
                      <span
                        className={`hidden md:flex items-center justify-end gap-1 text-sm font-medium ${
                          sort === "popular"
                            ? "text-purple-700"
                            : "text-gray-600"
                        }`}
                      >
                        {formatNumber(skill.likesCount)}
                      </span>

                      {/* Views */}
                      <span
                        className={`hidden md:flex items-center justify-end gap-1 text-sm font-medium ${
                          sort === "views"
                            ? "text-purple-700"
                            : "text-gray-600"
                        }`}
                      >
                        {formatNumber(skill.viewsCount)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Showing {((page - 1) * LIMIT + 1).toLocaleString()}
                  &ndash;
                  {Math.min(page * LIMIT, total).toLocaleString()} of{" "}
                  {total.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white disabled:opacity-30 hover:bg-gray-50 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }).map(
                      (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (page <= 3) {
                          pageNum = i + 1;
                        } else if (page >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                              page === pageNum
                                ? "bg-purple-600 text-white"
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      }
                    )}
                  </div>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={page === totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white disabled:opacity-30 hover:bg-gray-50 transition-colors"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TrendingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-purple-50/50 via-white to-white">
          <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-blue-600">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="h-8 w-48 bg-white/20 rounded animate-pulse" />
              <div className="h-4 w-72 bg-white/10 rounded animate-pulse mt-3" />
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="h-96 bg-gray-50 rounded-xl animate-pulse" />
          </div>
        </div>
      }
    >
      <TrendingContent />
    </Suspense>
  );
}
