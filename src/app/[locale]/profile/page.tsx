import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Heart, Eye, Package, Bot, Clock, CheckCircle2, XCircle, Ban, Activity, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { SignInPrompt } from "@/components/SignInPrompt";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Profile" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

type Tab = "agents" | "skills";
type Status = "" | "APPROVED" | "PENDING" | "REJECTED" | "DISABLED";

const STATUS_STYLE: Record<string, { cls: string; Icon: typeof Clock }> = {
  APPROVED: { cls: "bg-green-100 text-green-700", Icon: CheckCircle2 },
  PENDING: { cls: "bg-yellow-100 text-yellow-800", Icon: Clock },
  REJECTED: { cls: "bg-red-100 text-red-700", Icon: XCircle },
  DISABLED: { cls: "bg-gray-100 text-gray-600", Icon: Ban },
};

// "My listings": everything the signed-in user has published — agents AND skills —
// with moderation status and the reviewer's note. Server-rendered: the session is
// read on the server and the tabs are plain links, so there is no loading flash and
// the URL is shareable/bookmarkable.
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Profile");
  const session = await auth();
  if (!session?.user?.id) {
    return <SignInPrompt title={t("title")} description={t("signInPrompt")} />;
  }
  const userId = session.user.id;

  const sp = await searchParams;
  const tab: Tab = sp.tab === "skills" ? "skills" : "agents";
  const status: Status = (["APPROVED", "PENDING", "REJECTED", "DISABLED"] as const).includes(sp.status as never)
    ? (sp.status as Status)
    : "";

  const [agents, skills] = await Promise.all([
    prisma.agent.findMany({
      where: { publisherId: userId },
      select: {
        id: true, slug: true, name: true, description: true, kind: true, status: true, reviewNote: true,
        healthStatus: true, callsCount: true, avgRating: true, ratingCount: true, createdAt: true,
        _count: { select: { skills: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.skill.findMany({
      where: { submitterId: userId },
      select: {
        id: true, slug: true, name: true, brief: true, description: true, status: true, reviewNote: true,
        likesCount: true, viewsCount: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const count = (rows: { status: string }[], s: Status) => (s ? rows.filter((r) => r.status === s).length : rows.length);
  const rowsAll = tab === "agents" ? agents : skills;
  const statusTabs: Status[] = ["", "APPROVED", "PENDING", "REJECTED", ...(tab === "agents" ? (["DISABLED"] as Status[]) : [])];
  const href = (patch: { tab?: Tab; status?: Status }) => {
    const q: Record<string, string> = {};
    const nt = patch.tab ?? tab;
    const ns = patch.status ?? (patch.tab ? "" : status);
    if (nt !== "agents") q.tab = nt;
    if (ns) q.status = ns;
    return { pathname: "/profile", query: q } as const;
  };
  const totalCalls = agents.reduce((n, a) => n + a.callsCount, 0);
  const totalLikes = skills.reduce((n, s) => n + s.likesCount, 0);
  const totalViews = skills.reduce((n, s) => n + s.viewsCount, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{session.user.name || t("title")}</h1>
          <p className="text-sm text-gray-600">{session.user.email}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/submit-agent" className="inline-flex items-center gap-1.5 text-sm bg-purple-600 text-white px-4 py-2 rounded-full hover:bg-purple-700">
            <Plus className="h-4 w-4" /> {t("publishAgent")}
          </Link>
          <Link href="/submit" className="inline-flex items-center gap-1.5 text-sm border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-full hover:border-purple-300">
            {t("submitSkill")}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Stat icon={<Bot className="h-5 w-5 text-purple-500" />} value={agents.length} label={t("statAgents")} />
        <Stat icon={<Activity className="h-5 w-5 text-blue-500" />} value={totalCalls} label={t("statCalls")} />
        <Stat icon={<Package className="h-5 w-5 text-emerald-500" />} value={skills.length} label={t("statSkills")} />
        <Stat icon={<Heart className="h-5 w-5 text-red-500" />} value={totalLikes} label={t("likes")} sub={`${totalViews.toLocaleString()} ${t("views")}`} />
      </div>

      {/* Primary tab: agents | skills */}
      <div className="flex gap-2 mb-3" role="tablist" aria-label={t("mySubmissions")}>
        {(["agents", "skills"] as Tab[]).map((k) => (
          <Link
            key={k}
            href={href({ tab: k })}
            role="tab"
            aria-selected={tab === k}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
              tab === k ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-purple-300"
            }`}
          >
            {k === "agents" ? t("tabAgents") : t("tabSkills")}
            <span className={`ms-1.5 text-xs ${tab === k ? "text-purple-200" : "text-gray-500"}`}>{k === "agents" ? agents.length : skills.length}</span>
          </Link>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-5 border-b border-gray-200 pb-3">
        {statusTabs.map((s) => (
          <Link
            key={s || "all"}
            href={href({ status: s })}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
              status === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {s === "" ? t("tab_all") : s === "APPROVED" ? t("statusApproved") : s === "PENDING" ? t("statusPending") : s === "REJECTED" ? t("statusRejected") : t("statusDisabled")}
            <span className="ms-1 opacity-70">{count(rowsAll, s)}</span>
          </Link>
        ))}
      </div>

      {tab === "agents" ? (
        agents.filter((a) => !status || a.status === status).length === 0 ? (
          <Empty text={t("noAgents")} cta={t("publishFirstAgent")} href="/submit-agent" />
        ) : (
          <ul className="space-y-3">
            {agents
              .filter((a) => !status || a.status === status)
              .map((a) => {
                const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.PENDING;
                const live = a.status === "APPROVED";
                return (
                  <li key={a.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {live ? (
                            <Link href={`/agents/${a.slug}`} className="font-medium text-gray-900 hover:text-purple-700">
                              {a.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-gray-900">{a.name}</span>
                          )}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${st.cls}`}>
                            <st.Icon className="h-3 w-3" />
                            {a.status === "APPROVED" ? t("statusApproved") : a.status === "PENDING" ? t("statusPending") : a.status === "REJECTED" ? t("statusRejected") : t("statusDisabled")}
                          </span>
                          <span className="text-xs text-gray-500">{a.kind === "PROJECT" ? t("kindProject") : t("kindHosted")}</span>
                          {live && a.healthStatus && (
                            <span className={`text-xs ${a.healthStatus === "ok" ? "text-green-700" : a.healthStatus === "degraded" ? "text-amber-700" : "text-red-700"}`}>
                              ● {a.healthStatus}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-1">{a.description}</p>
                        {a.reviewNote && (
                          <p className="text-xs text-gray-700 mt-2 bg-amber-50 border border-amber-100 px-2 py-1 rounded">
                            {t("reviewerNote")} {a.reviewNote}
                          </p>
                        )}
                      </div>
                      {live && (
                        <div className="flex items-center gap-4 text-sm text-gray-500 shrink-0">
                          <span className="flex items-center gap-1" title={t("statCalls")}>
                            <Activity className="h-3.5 w-3.5" /> {a.callsCount}
                          </span>
                          {a.ratingCount > 0 && <span>★ {a.avgRating.toFixed(1)}</span>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        )
      ) : skills.filter((s) => !status || s.status === status).length === 0 ? (
        <Empty text={t("emptyTab")} cta={t("submitFirst")} href="/submit" />
      ) : (
        <ul className="space-y-3">
          {skills
            .filter((s) => !status || s.status === status)
            .map((skill) => {
              const st = STATUS_STYLE[skill.status] ?? STATUS_STYLE.PENDING;
              const live = skill.status === "APPROVED";
              return (
                <li key={skill.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {live ? (
                          <Link href={`/skills/${skill.slug}`} className="font-medium text-gray-900 hover:text-purple-700">
                            {skill.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-gray-900">{skill.name}</span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${st.cls}`}>
                          <st.Icon className="h-3 w-3" />
                          {skill.status === "APPROVED" ? t("statusApproved") : skill.status === "PENDING" ? t("statusPending") : t("statusRejected")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-1">{skill.brief || skill.description}</p>
                      {skill.status === "REJECTED" && skill.reviewNote && (
                        <p className="text-xs text-red-700 mt-2 bg-red-50 px-2 py-1 rounded">
                          {t("reviewerNote")} {skill.reviewNote}
                        </p>
                      )}
                    </div>
                    {live && (
                      <div className="flex items-center gap-4 text-sm text-gray-500 shrink-0">
                        <span className="flex items-center gap-1">
                          <Heart className="h-3.5 w-3.5" /> {skill.likesCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" /> {skill.viewsCount}
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

function Stat({ icon, value, label, sub }: { icon: React.ReactNode; value: number; label: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
      <div className="mx-auto mb-2 w-fit">{icon}</div>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-600">{label}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Empty({ text, cta, href }: { text: string; cta: string; href: string }) {
  return (
    <div className="text-center py-12 bg-gray-50 rounded-xl">
      <p className="text-gray-600">{text}</p>
      <Link href={href} className="text-purple-600 text-sm mt-1 inline-block hover:underline">
        {cta}
      </Link>
    </div>
  );
}
