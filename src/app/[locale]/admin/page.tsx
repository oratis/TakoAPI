"use client";

import { Package, Users, FolderTree, Heart, Eye, Download, Clock, TrendingUp, Bot, Server, GitBranch } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAsync, fetchJson } from "@/hooks/useAsync";

interface PendingAgent {
  id: string;
  name: string;
  kind?: string;
}

interface Stats {
  totalSkills: number;
  totalUsers: number;
  totalCategories: number;
  totalLikes: number;
  pendingSkills: number;
  totalViews: number;
  totalDownloads: number;
  recentSkills: { id: string; name: string; slug: string; author: string; createdAt: string; status: string }[];
  topSkills: { id: string; name: string; slug: string; downloads: number; likesCount: number; viewsCount: number }[];
  // Agent rollup. Optional because it was added after the skills-only version of
  // this endpoint shipped — every read below tolerates it being missing.
  agents?: { total: number; pending: number; hosted: number; project: number };
  pendingAgents?: PendingAgent[];
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toLocaleString();
}

const STATUS_LABEL_KEY: Record<string, "statusApproved" | "statusPending" | "statusRejected"> = {
  approved: "statusApproved",
  pending: "statusPending",
  rejected: "statusRejected",
};

type Card = {
  label: string;
  value: string;
  icon: typeof Package;
  color: string;
  href?: string;
};

function StatCards({ cards }: { cards: Card[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => {
        const body = (
          <>
            <div className={`inline-flex p-2 rounded-lg ${card.color} text-white mb-2`}>
              <card.icon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="text-xs text-gray-600">{card.label}</p>
          </>
        );
        return card.href ? (
          <Link
            key={card.label}
            href={card.href}
            className="bg-white rounded-xl p-4 border border-gray-200 hover:border-purple-300 transition-colors"
          >
            {body}
          </Link>
        ) : (
          <div key={card.label} className="bg-white rounded-xl p-4 border border-gray-200">
            {body}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const t = useTranslations("Admin");
  const { data: stats, loading, error, reload } = useAsync(() => fetchJson<Stats>("/api/admin/stats"), []);

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-32 bg-gray-200 rounded-xl" /><div className="h-64 bg-gray-200 rounded-xl" /></div>;
  }

  if (error || !stats) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-600 mb-3">{t("somethingWentWrong")}</p>
        <button
          onClick={reload}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  const agents = stats.agents;
  const agentCards: Card[] = [
    { label: t("statTotalAgents"), value: formatNum(agents?.total ?? 0), icon: Bot, color: "bg-purple-500", href: "/admin/agents" },
    {
      label: t("statPendingAgents"),
      value: (agents?.pending ?? 0).toString(),
      icon: Clock,
      color: (agents?.pending ?? 0) > 0 ? "bg-orange-500" : "bg-gray-500",
      href: "/admin/agents",
    },
    { label: t("statHostedAgents"), value: formatNum(agents?.hosted ?? 0), icon: Server, color: "bg-sky-500" },
    { label: t("statProjectAgents"), value: formatNum(agents?.project ?? 0), icon: GitBranch, color: "bg-teal-500" },
  ];

  const skillCards: Card[] = [
    { label: t("statTotalSkills"), value: formatNum(stats.totalSkills), icon: Package, color: "bg-purple-500", href: "/admin/skills" },
    { label: t("statPendingReview"), value: stats.pendingSkills.toString(), icon: Clock, color: stats.pendingSkills > 0 ? "bg-orange-500" : "bg-gray-500", href: "/admin/skills" },
    { label: t("statTotalUsers"), value: formatNum(stats.totalUsers), icon: Users, color: "bg-blue-500", href: "/admin/users" },
    { label: t("statCategories"), value: stats.totalCategories.toString(), icon: FolderTree, color: "bg-green-500", href: "/admin/categories" },
    { label: t("statTotalLikes"), value: formatNum(stats.totalLikes), icon: Heart, color: "bg-red-500" },
    { label: t("statTotalViews"), value: formatNum(stats.totalViews), icon: Eye, color: "bg-amber-500" },
    { label: t("statTotalDownloads"), value: formatNum(stats.totalDownloads), icon: Download, color: "bg-cyan-500" },
  ];

  // Older builds of /api/admin/stats have no `pendingAgents`; only render the
  // review queue once the field is actually there, so an empty panel is never
  // mistaken for "nothing to review".
  const pendingAgents = Array.isArray(stats.pendingAgents) ? stats.pendingAgents : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("dashboardTitle")}</h1>

      {/* Agents first: they are the primary catalog entity. */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">{t("sectionAgents")}</h2>
        <StatCards cards={agentCards} />
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">{t("sectionSkills")}</h2>
        <StatCards cards={skillCards} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {pendingAgents && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-gray-500" />
                {t("pendingAgentsTitle")}
              </h2>
              <Link href="/admin/agents" className="text-xs text-purple-600 hover:text-purple-700">{t("viewAll")}</Link>
            </div>
            {pendingAgents.length === 0 ? (
              <p className="text-sm text-gray-600">{t("noPendingAgents")}</p>
            ) : (
              <div className="space-y-3">
                {pendingAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between text-sm gap-3">
                    <span className="font-medium text-gray-900 truncate">{agent.name}</span>
                    {agent.kind && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 shrink-0">
                        {agent.kind === "PROJECT" ? t("kindProject") : t("kindHosted")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent Skills */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              {t("recentSkills")}
            </h2>
            <Link href="/admin/skills" className="text-xs text-purple-600 hover:text-purple-700">{t("viewAll")}</Link>
          </div>
          <div className="space-y-3">
            {stats.recentSkills.map((skill) => (
              <div key={skill.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900">{skill.name}</span>
                  <span className="text-gray-600 ms-2">{t("byAuthor", { author: skill.author })}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  skill.status === "approved" ? "bg-green-50 text-green-700" :
                  skill.status === "pending" ? "bg-yellow-50 text-yellow-700" :
                  "bg-red-50 text-red-700"
                }`}>
                  {STATUS_LABEL_KEY[skill.status] ? t(STATUS_LABEL_KEY[skill.status]) : skill.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Skills */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-500" />
              {t("topSkillsByDownloads")}
            </h2>
          </div>
          <div className="space-y-3">
            {stats.topSkills.map((skill, i) => (
              <div key={skill.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    i === 0 ? "bg-yellow-500" : i === 1 ? "bg-gray-500" : i === 2 ? "bg-amber-600" : "bg-gray-400"
                  }`}>{i + 1}</span>
                  <span className="font-medium text-gray-900">{skill.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1"><Download className="h-3 w-3" />{formatNum(skill.downloads)}</span>
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{skill.likesCount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
