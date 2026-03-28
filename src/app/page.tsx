import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SkillCard from "@/components/ui/SkillCard";
import CategoryBadge from "@/components/ui/CategoryBadge";
import HomeSearch from "@/components/ui/HomeSearch";
import { Terminal, Download, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}

export default async function HomePage() {
  const [categories, mustHaveSkills, latestSkills, totalSkills] = await Promise.all([
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
  ]);

  // Show top 12 categories, collapse the rest
  const topCategories = categories.slice(0, 12);
  const hasMore = categories.length > 12;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
              All in One
            </span>{" "}
            OpenClaw Skills
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto">
            Marketplace for you and for your agent. Discover, install, and share{" "}
            <span className="font-semibold text-gray-700">{totalSkills.toLocaleString()}</span> community-built skills.
          </p>

          <HomeSearch />

          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-gray-400">
            <span>Agent API:</span>
            <code className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-mono">
              GET /api/agent
            </code>
          </div>
        </div>
      </section>

      {/* Install TakoAPI Skill */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-gradient-to-r from-purple-600 to-blue-500 rounded-2xl p-6 sm:p-8 text-white">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🐙</span>
                <h2 className="text-xl font-bold">TakoAPI Skill for OpenClaw</h2>
                <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full font-medium">Official</span>
              </div>
              <p className="text-purple-100 text-sm">
                Search, install, and manage OpenClaw skills through natural conversation — powered by the TakoAPI marketplace.
              </p>
              <a
                href="https://github.com/oratis/skill-takoapi_skill_manage"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs text-purple-200 hover:text-white transition-colors"
              >
                View on GitHub →
              </a>
            </div>
            <div className="w-full md:w-auto space-y-2">
              <div className="flex items-center bg-black/20 rounded-lg overflow-hidden">
                <Terminal className="h-4 w-4 ml-3 text-purple-200 shrink-0" />
                <code className="flex-1 px-3 py-2.5 text-sm font-mono whitespace-nowrap">
                  clawhub install takoapi
                </code>
              </div>
              <p className="text-xs text-purple-200 text-center">or ask your agent: &quot;Install the TakoAPI skill&quot;</p>
            </div>
          </div>
        </div>
      </section>

      {/* Must-Have Skills */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-purple-600" />
            <h2 className="text-xl font-semibold">Must-Have Skills</h2>
          </div>
          <Link href="/trending" className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700">
            <TrendingUp className="h-3.5 w-3.5" />
            View rankings
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {mustHaveSkills.map((skill, i) => (
            <div key={skill.id} className="relative">
              {i < 3 && (
                <span className={`absolute -top-2 -left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
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
          <h2 className="text-xl font-semibold">Categories</h2>
          <Link href="/skills" className="text-sm text-purple-600 hover:text-purple-700">
            View all
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
              +{categories.length - 12} more categories
            </Link>
          </div>
        )}
      </section>

      {/* Latest Skills */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Latest Skills</h2>
          <Link href="/skills?sort=latest" className="text-sm text-purple-600 hover:text-purple-700">
            View all
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
