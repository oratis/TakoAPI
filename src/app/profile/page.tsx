"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Heart, Eye, Package, Clock, CheckCircle2, XCircle } from "lucide-react";
import type { Skill, SkillStatus } from "@/lib/types";

interface Stats {
  totalSkills: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  totalLikes: number;
  totalViews: number;
}

type TabKey = "all" | "approved" | "pending" | "rejected";

const TABS: { key: TabKey; label: string; query: string }[] = [
  { key: "all", label: "All", query: "" },
  { key: "approved", label: "Approved", query: "approved" },
  { key: "pending", label: "Pending", query: "pending" },
  { key: "rejected", label: "Rejected", query: "rejected" },
];

function StatusBadge({ status }: { status: SkillStatus }) {
  if (status === "APPROVED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Approved
      </span>
    );
  }
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
        <Clock className="h-3 w-3" /> Pending review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
      <XCircle className="h-3 w-3" /> Rejected
    </span>
  );
}

const EMPTY_STATS: Stats = {
  totalSkills: 0,
  approvedCount: 0,
  pendingCount: 0,
  rejectedCount: 0,
  totalLikes: 0,
  totalViews: 0,
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("all");

  const load = useCallback((t: TabKey) => {
    const active = TABS.find((x) => x.key === t);
    const qs = active?.query ? `?status=${active.query}` : "";
    setLoading(true);
    fetch(`/api/user/skills${qs}`)
      .then((r) => r.json())
      .then((data) => {
        setSkills(data.skills || []);
        setStats(data.stats || EMPTY_STATS);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (session) load(tab);
  }, [session, tab, load]);

  if (status === "loading") return null;
  if (!session) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">My Profile</h1>
        <p className="text-gray-500 mb-6">Please sign in to view your profile.</p>
        <a
          href="/auth/signin"
          className="inline-flex bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700"
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{session.user?.name || "My Profile"}</h1>
        <p className="text-sm text-gray-500">{session.user?.email}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
          <Package className="h-5 w-5 text-purple-500 mx-auto mb-2" />
          <p className="text-2xl font-bold">{stats.totalSkills}</p>
          <p className="text-xs text-gray-500">Submissions</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
          <Heart className="h-5 w-5 text-red-500 mx-auto mb-2" />
          <p className="text-2xl font-bold">{stats.totalLikes}</p>
          <p className="text-xs text-gray-500">Likes</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
          <Eye className="h-5 w-5 text-blue-500 mx-auto mb-2" />
          <p className="text-2xl font-bold">{stats.totalViews}</p>
          <p className="text-xs text-gray-500">Views</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">My Submissions</h2>
        <Link
          href="/submit"
          className="text-sm bg-purple-600 text-white px-4 py-1.5 rounded-full hover:bg-purple-700"
        >
          Submit new
        </Link>
      </div>

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {TABS.map((t) => {
          const count =
            t.key === "all"
              ? stats.totalSkills
              : t.key === "approved"
              ? stats.approvedCount
              : t.key === "pending"
              ? stats.pendingCount
              : stats.rejectedCount;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-gray-400">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <p className="text-gray-500">No submissions in this tab</p>
          {tab === "all" && (
            <Link href="/submit" className="text-purple-600 text-sm mt-1 inline-block">
              Submit your first skill
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <Link
              key={skill.id}
              href={skill.status === "APPROVED" ? `/skills/${skill.slug}` : "#"}
              onClick={(e) => {
                if (skill.status !== "APPROVED") e.preventDefault();
              }}
              className={`block bg-white border border-gray-200 rounded-xl p-4 transition-shadow ${
                skill.status === "APPROVED" ? "hover:shadow-md" : "opacity-90 cursor-default"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-900">{skill.name}</h3>
                    <StatusBadge status={skill.status} />
                  </div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                    {skill.brief || skill.description}
                  </p>
                  {skill.status === "REJECTED" && skill.reviewNote && (
                    <p className="text-xs text-red-600 mt-2 bg-red-50 px-2 py-1 rounded">
                      Reviewer note: {skill.reviewNote}
                    </p>
                  )}
                </div>
                {skill.status === "APPROVED" && (
                  <div className="flex items-center gap-4 text-sm text-gray-400 shrink-0">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5" /> {skill.likesCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> {skill.viewsCount}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
