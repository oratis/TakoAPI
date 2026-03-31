"use client";

import { useEffect, useState } from "react";
import { Package, Users, FolderTree, Heart, Eye, Download, Clock, TrendingUp } from "lucide-react";
import Link from "next/link";

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
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toLocaleString();
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats").then((r) => r.json()).then(setStats);
  }, []);

  if (!stats) {
    return <div className="animate-pulse space-y-4"><div className="h-32 bg-gray-200 rounded-xl" /><div className="h-64 bg-gray-200 rounded-xl" /></div>;
  }

  const cards = [
    { label: "Total Skills", value: formatNum(stats.totalSkills), icon: Package, color: "bg-purple-500" },
    { label: "Total Users", value: formatNum(stats.totalUsers), icon: Users, color: "bg-blue-500" },
    { label: "Categories", value: stats.totalCategories.toString(), icon: FolderTree, color: "bg-green-500" },
    { label: "Total Likes", value: formatNum(stats.totalLikes), icon: Heart, color: "bg-red-500" },
    { label: "Total Views", value: formatNum(stats.totalViews), icon: Eye, color: "bg-amber-500" },
    { label: "Total Downloads", value: formatNum(stats.totalDownloads), icon: Download, color: "bg-cyan-500" },
    { label: "Pending Review", value: stats.pendingSkills.toString(), icon: Clock, color: stats.pendingSkills > 0 ? "bg-orange-500" : "bg-gray-400" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-4 border border-gray-200">
            <div className={`inline-flex p-2 rounded-lg ${card.color} text-white mb-2`}>
              <card.icon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="text-xs text-gray-500">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Skills */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              Recent Skills
            </h2>
            <Link href="/admin/skills" className="text-xs text-purple-600 hover:text-purple-700">View all</Link>
          </div>
          <div className="space-y-3">
            {stats.recentSkills.map((skill) => (
              <div key={skill.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900">{skill.name}</span>
                  <span className="text-gray-400 ml-2">by {skill.author}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  skill.status === "approved" ? "bg-green-50 text-green-600" :
                  skill.status === "pending" ? "bg-yellow-50 text-yellow-600" :
                  "bg-red-50 text-red-600"
                }`}>
                  {skill.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Skills */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-400" />
              Top Skills by Downloads
            </h2>
          </div>
          <div className="space-y-3">
            {stats.topSkills.map((skill, i) => (
              <div key={skill.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    i === 0 ? "bg-yellow-500" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-600" : "bg-gray-300"
                  }`}>{i + 1}</span>
                  <span className="font-medium text-gray-900">{skill.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
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
