"use client";

import Link from "next/link";
import { Heart, ExternalLink, Terminal, Download } from "lucide-react";
import type { Skill } from "@/lib/types";

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}

export default function SkillCard({
  skill,
  showDownloads = false,
}: {
  skill: Skill;
  showDownloads?: boolean;
}) {
  return (
    <Link
      href={`/skills/${skill.slug}`}
      className="group block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-purple-200 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-purple-600 transition-colors">
            {skill.name}
          </h3>
          {skill.author && (
            <p className="text-xs text-gray-400 mt-0.5">by {skill.author}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {showDownloads && skill.downloads > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
              <Download className="h-3 w-3" />
              {formatNumber(skill.downloads)}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <Heart className="h-3 w-3" />
            {skill.likesCount}
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-600 line-clamp-2 mb-3">
        {skill.brief || skill.description}
      </p>

      <div className="flex items-center justify-between">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-600 font-medium">
          {skill.category.name}
        </span>
        <div className="flex items-center gap-2">
          {skill.installCmd && (
            <Terminal className="h-3.5 w-3.5 text-gray-300" />
          )}
          {(skill.githubUrl || skill.clawSkillsUrl) && (
            <ExternalLink className="h-3.5 w-3.5 text-gray-300" />
          )}
        </div>
      </div>
    </Link>
  );
}
