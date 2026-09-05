import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import SkillCard from "@/components/ui/SkillCard";
import CategoryBadge from "@/components/ui/CategoryBadge";
import HomeSearch from "@/components/ui/HomeSearch";
import AgentCard from "@/components/ui/AgentCard";
import { Terminal, Download, TrendingUp, Bot, GitFork, Compass } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import { SCENARIOS } from "@/lib/scenarios";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const tScenario = await getTranslations("Scenarios");

  const [categories, mustHaveSkills, latestSkills, totalSkills, agents, totalAgents, projects, totalProjects, agentScenarioRows] =
    await Promise.all([
      prisma.category.findMany({ orderBy: { skillCount: "desc" } }),
      prisma.skill.findMany({
        orderBy: { downloads: "desc" },
        take: 8,
        include: { category: { select: { name: true, slug: true } } },
      }),
      prisma.skill.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { category: { select: { name: true, slug: true } } },
      }),
      prisma.skill.count(),
      prisma.agent.findMany({
        where: { status: "APPROVED", kind: "HOSTED" },
        orderBy: [{ featured: "desc" }, { callsCount: "desc" }, { createdAt: "desc" }],
        take: 8,
        include: {
          category: { select: { name: true, slug: true } },
          _count: { select: { skills: true } },
        },
      }),
      prisma.agent.count({ where: { status: "APPROVED", kind: "HOSTED" } }),
      prisma.agent.findMany({
        where: { status: "APPROVED", kind: "PROJECT" },
        orderBy: [{ stars: "desc" }, { createdAt: "desc" }],
        take: 8,
        include: {
          category: { select: { name: true, slug: true } },
          _count: { select: { skills: true } },
        },
      }),
      prisma.agent.count({ where: { status: "APPROVED", kind: "PROJECT" } }),
      // Just the scenario arrays for all approved agents — one cheap query we
      // tally in JS for the "Browse by scenario" tile counts.
      prisma.agent.findMany({ where: { status: "APPROVED" }, select: { scenarios: true } }),
    ]);

  // Show top 12 categories, collapse the rest
  const topCategories = categories.slice(0, 12);
  const hasMore = categories.length > 12;

  // Per-scenario agent counts (shown as a subtle badge when > 0).
  const scenarioCounts = new Map<string, number>();
  for (const row of agentScenarioRows)
    for (const slug of row.scenarios) scenarioCounts.set(slug, (scenarioCounts.get(slug) ?? 0) + 1);

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
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            {t.rich("heroTitle", {
              grad: (chunks) => (
                <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
                  {chunks}
                </span>
              ),
            })}
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto">
            {t.rich("heroSubtitle", {
              agents: totalAgents,
              skills: totalSkills,
              b: (chunks) => <span className="font-semibold text-gray-700">{chunks}</span>,
            })}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/agents"
              className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-6 py-3 text-sm font-medium text-white hover:bg-purple-700"
            >
              <Bot className="h-4 w-4" /> {t("browseAgents")}
            </Link>
            <Link
              href="/submit-agent"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:border-purple-300"
            >
              {t("publishAnAgent")}
            </Link>
          </div>

          <div className="mt-8 max-w-xl mx-auto">
            <HomeSearch />
          </div>

          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-gray-400">
            <span>{t("agentRegistry")}</span>
            <code className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-mono">
              GET /api/registry
            </code>
          </div>
        </div>
      </section>

      {/* Browse by scenario — primary use-case entry point */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-purple-600" />
            <h2 className="text-xl font-semibold">{t("browseByScenario")}</h2>
          </div>
          <Link href="/agents" className="text-sm text-purple-600 hover:text-purple-700">
            {t("allAgents")} →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {SCENARIOS.map((s) => {
            const n = scenarioCounts.get(s.slug) ?? 0;
            return (
              <Link
                key={s.slug}
                href={`/agents?scenario=${s.slug}`}
                className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 hover:border-purple-200 hover:bg-purple-50/40 transition-colors"
              >
                <span className="text-2xl shrink-0">{s.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 truncate group-hover:text-purple-600">
                    {tScenario(s.slug)}
                  </span>
                  {n > 0 && (
                    <span className="block text-xs text-gray-400 truncate">{n}</span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Featured Agents */}
      {agents.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-600" />
              <h2 className="text-xl font-semibold">{t("featuredAgents")}</h2>
            </div>
            <Link href="/agents" className="text-sm text-purple-600 hover:text-purple-700">
              {t("browseAll")} →
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <GitFork className="h-5 w-5 text-purple-600" />
              <h2 className="text-xl font-semibold">{t("popularProjects")}</h2>
              <span className="text-sm text-gray-400">{t("selfHostable", { count: totalProjects })}</span>
            </div>
            <Link href="/agents?kind=PROJECT" className="text-sm text-purple-600 hover:text-purple-700">
              {t("browseAll")} →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {projects.map((p) => (
              <AgentCard key={p.slug} agent={p} />
            ))}
          </div>
        </section>
      )}

      {/* Install TakoAPI Skill */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-gradient-to-r from-purple-600 to-blue-500 rounded-2xl p-6 sm:p-8 text-white">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🐙</span>
                <h2 className="text-xl font-bold">{t("skillTitle")}</h2>
                <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full font-medium">{t("official")}</span>
              </div>
              <p className="text-purple-100 text-sm">
                {t("skillDescription")}
              </p>
              <a
                href="https://github.com/oratis/skill-takoapi_skill_manage"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs text-purple-200 hover:text-white transition-colors"
              >
                {t("viewOnGithub")} →
              </a>
            </div>
            <div className="w-full md:w-auto space-y-2">
              <div className="flex items-center bg-black/20 rounded-lg overflow-hidden">
                <Terminal className="h-4 w-4 ms-3 text-purple-200 shrink-0" />
                <code className="flex-1 px-3 py-2.5 text-sm font-mono whitespace-nowrap">
                  clawhub install takoapi
                </code>
              </div>
              <p className="text-xs text-purple-200 text-center">{t("askAgent")}</p>
              <p className="text-xs text-purple-200 text-center">
                {t("usingCodingAgent")}{" "}
                <Link href="/install" className="underline hover:text-white">{t("oneCommandInstall")} →</Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Must-Have Skills */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-purple-600" />
            <h2 className="text-xl font-semibold">{t("mustHaveSkills")}</h2>
          </div>
          <Link href="/trending" className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700">
            <TrendingUp className="h-3.5 w-3.5" />
            {t("viewRankings")}
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {mustHaveSkills.map((skill, i) => (
            <div key={skill.id} className="relative">
              {i < 3 && (
                <span className={`absolute -top-2 -start-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  i === 0 ? "bg-yellow-500" : i === 1 ? "bg-gray-400" : "bg-amber-600"
                }`}>
                  {i + 1}
                </span>
              )}
              <SkillCard skill={skill as never} showDownloads />
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{t("categories")}</h2>
          <Link href="/skills" className="text-sm text-purple-600 hover:text-purple-700">
            {t("viewAll")}
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {topCategories.map((cat) => (
            <CategoryBadge key={cat.id} category={cat} compact />
          ))}
        </div>
        {hasMore && (
          <div className="mt-3 text-center">
            <Link
              href="/skills"
              className="text-sm text-gray-500 hover:text-purple-600 transition-colors"
            >
              {t("moreCategories", { count: categories.length - 12 })}
            </Link>
          </div>
        )}
      </section>

      {/* Latest Skills */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">{t("latestSkills")}</h2>
          <Link href="/skills?sort=latest" className="text-sm text-purple-600 hover:text-purple-700">
            {t("viewAll")}
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {latestSkills.map((skill) => (
            <SkillCard key={skill.id} skill={skill as never} />
          ))}
        </div>
      </section>
    </div>
  );
}
