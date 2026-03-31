"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Heart, Eye, Package } from "lucide-react";
import type { Skill } from "@/lib/types";

interface Stats {
  totalSkills: number;
  totalLikes: number;
  totalViews: number;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [stats, setStats] = useState<Stats>({ totalSkills: 0, totalLikes: 0, totalViews: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session) {
      fetch("/api/user/skills")
        .then((r) => r.json())
        .then((data) => {
          setSkills(data.skills || []);
          setStats(data.stats || { totalSkills: 0, totalLikes: 0, totalViews: 0 });
        })
        .finally(() => setLoading(false));
    }
  }, [session]);

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
      {/* Profile header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{session.user?.name || "My Profile"}</h1>
        <p className="text-sm text-gray-500">{session.user?.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
          <Package className="h-5 w-5 text-purple-500 mx-auto mb-2" />
          <p className="text-2xl font-bold">{stats.totalSkills}</p>
          <p className="text-xs text-gray-500">Skills</p>
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

      {/* My skills */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">My Skills</h2>
        <Link
          href="/submit"
          className="text-sm bg-purple-600 text-white px-4 py-1.5 rounded-full hover:bg-purple-700"
        >
          Submit new
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <p className="text-gray-500">No skills submitted yet</p>
          <Link href="/submit" className="text-purple-600 text-sm mt-1 inline-block">
            Submit your first skill
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <Link
              key={skill.id}
              href={`/skills/${skill.slug}`}
              className="block bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{skill.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                    {skill.description}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400 shrink-0 ml-4">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" /> {skill.likesCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> {skill.viewsCount}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
