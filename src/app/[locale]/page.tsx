import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Bot, GitFork, Compass, KeyRound, Terminal, ArrowRight } from "lucide-react";
import SkillCard from "@/components/ui/SkillCard";
import CategoryBadge from "@/components/ui/CategoryBadge";
import SiteSearch from "@/components/ui/SiteSearch";
import CodeTabs from "@/components/ui/CodeTabs";
import AgentCard from "@/components/ui/AgentCard";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import { discoverySamples } from "@/lib/samples";
import { getHomeData } from "@/lib/catalog";
import { findScenario } from "@/lib/scenarios";

// Cached at the data layer (see lib/catalog), so this page no longer runs nine
// uncached queries per request. Still dynamic so a fresh catalog shows up within
// the cache window rather than at the next deploy.
export const dynamic = "force-dynamic";

/** Scenarios with fewer than this many agents are hidden — a tile that leads to
 *  four results reads as an empty shelf, and the landing page behind it is thin. */
const MIN_SCENARIO_AGENTS = 20;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const tScenario = await getTranslations("Scenarios");

  const { categories, topSkills, latestSkills, totalSkills, agents, totalAgents, projects, totalProjects, scenarioCounts } =
    await getHomeData();

  const topCategories = categories.slice(0, 12);
  const hasMoreCategories = categories.length > 12;
  const scenarios = Object.entries(scenarioCounts)
    .filter(([slug, n]) => n >= MIN_SCENARIO_AGENTS && findScenario(slug))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const siteLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/agents?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
    },
  ];

  return (
    <div>
      <JsonLd data={siteLd} />

      {/* Hero — what it is, then the two things a developer does next. */}
      <section className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-blue-50 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="text-center lg:text-start">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-balance">
                {t.rich("heroTitle", {
                  grad: (chunks) => (
                    <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">{chunks}</span>
                  ),
                })}
              </h1>
              <p className="mt-4 text-lg text-gray-600 max-w-xl mx-auto lg:mx-0">{t("heroSubtitle")}</p>

              <div className="mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-6 py-3 text-sm font-medium text-white hover:bg-purple-700"
                >
                  <KeyRound className="h-4 w-4" /> {t("getApiKey")}
                </Link>
                <Link
                  href="/agents"
                  className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:border-purple-300"
                >
                  <Bot className="h-4 w-4" /> {t("browseAgents")}
                </Link>
              </div>

              <p className="mt-5 text-sm text-gray-600">
                {t("catalogSummary", { agents: totalAgents, projects: totalProjects, skills: totalSkills })}
              </p>

              <div className="mt-5 max-w-lg mx-auto lg:mx-0">
                <SiteSearch variant="hero" />
              </div>
            </div>

            {/* Quickstart: the whole product in three copy-pasteable steps. */}
            <div className="lg:pt-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">{t("quickstartLabel")}</p>
              <CodeTabs samples={discoverySamples((k) =>
                  t(k === "discover" ? "quickstartTabDiscover" : k === "call" ? "quickstartTabCall" : "quickstartTabFromAgent")
                )} ariaLabel={t("quickstartLabel")} />
              <p className="mt-2 text-xs text-gray-600">
                {t.rich("quickstartNote", {
                  link: (chunks) => (
                    <Link href="/install" className="text-purple-600 hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Browse by scenario — the use-case entry point, hiding near-empty shelves. */}
      {scenarios.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-purple-600" />
              <h2 className="text-xl font-semibold">{t("browseByScenario")}</h2>
            </div>
            <Link href="/scenarios" className="text-sm text-purple-600 hover:text-purple-700">
              {t("allScenarios")} <ArrowRight className="inline h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {scenarios.map(([slug, n]) => {
              const sc = findScenario(slug)!;
              return (
                <Link
                  key={slug}
                  href={`/agents?scenario=${slug}`}
                  className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:border-purple-300 hover:bg-purple-50/40 transition-colors"
                >
                  <span className="text-2xl shrink-0" aria-hidden>{sc.emoji}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate group-hover:text-purple-700">
                      {tScenario(slug)}
                    </span>
                    <span className="block text-xs text-gray-600 tabular-nums">{n}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Featured agents — curated, and never one whose last probe said "down". */}
      {agents.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-600" />
              <h2 className="text-xl font-semibold">{t("featuredAgents")}</h2>
              <span className="text-sm text-gray-600">{t("callableNow", { count: totalAgents })}</span>
            </div>
            <Link href="/agents" className="text-sm text-purple-600 hover:text-purple-700">
              {t("browseAll")} <ArrowRight className="inline h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {agents.map((a) => (
              <AgentCard key={a.slug} agent={a} />
            ))}
          </div>
        </section>
      )}

      {/* Popular open-source projects */}
      {projects.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <GitFork className="h-5 w-5 text-purple-600" />
              <h2 className="text-xl font-semibold">{t("popularProjects")}</h2>
              <span className="text-sm text-gray-600">{t("selfHostable", { count: totalProjects })}</span>
            </div>
            <Link href="/agents?kind=PROJECT" className="text-sm text-purple-600 hover:text-purple-700">
              {t("browseAll")} <ArrowRight className="inline h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {projects.map((p) => (
              <AgentCard key={p.slug} agent={p} />
            ))}
          </div>
        </section>
      )}

      {/* Install into a coding agent */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-blue-500 p-6 sm:p-8 text-white">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-5 w-5" aria-hidden />
                <h2 className="text-xl font-bold">{t("installTitle")}</h2>
              </div>
              <p className="text-purple-100 text-sm max-w-xl">{t("installDescription")}</p>
              <Link
                href="/install"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25"
              >
                {t("installCta")} <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
              </Link>
            </div>
            <div className="w-full md:w-auto md:min-w-[22rem]">
              <div className="flex items-center bg-black/25 rounded-lg overflow-hidden">
                <code className="flex-1 px-3 py-2.5 text-sm font-mono whitespace-pre overflow-x-auto">
                  curl -fsSL takoapi.com/install.sh | sh
                </code>
              </div>
              <p className="mt-2 text-xs text-purple-100">{t("installPlatforms")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Skills — one section, not four */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-16">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold">{t("skillsTitle")}</h2>
          <Link href="/skills" className="text-sm text-purple-600 hover:text-purple-700">
            {t("browseAll")} <ArrowRight className="inline h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
          </Link>
        </div>
        <p className="text-sm text-gray-600 mb-5">{t("skillsSubtitle", { count: totalSkills })}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topSkills.slice(0, 4).map((skill) => (
            <SkillCard key={skill.id} skill={skill as never} showDownloads />
          ))}
          {latestSkills.slice(0, 4).map((skill) => (
            <SkillCard key={skill.id} skill={skill as never} />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-600 me-1">{t("categories")}</span>
          {topCategories.map((cat) => (
            <CategoryBadge key={cat.id} category={cat} />
          ))}
          {hasMoreCategories && (
            <Link href="/skills" className="text-xs text-gray-600 hover:text-purple-600">
              {t("moreCategories", { count: categories.length - 12 })}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
