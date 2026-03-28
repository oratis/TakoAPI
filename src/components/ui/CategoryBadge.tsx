"use client";

import Link from "next/link";
import type { Category } from "@/lib/types";

const CATEGORY_ICONS: Record<string, string> = {
  "git-and-github": "🔀",
  "coding-agents-and-ides": "💻",
  "browser-and-automation": "🌐",
  "web-and-frontend-development": "🎨",
  "devops-and-cloud": "☁️",
  "image-and-video-generation": "🖼️",
  "apple-apps-and-services": "🍎",
  "search-and-research": "🔍",
  "clawdbot-tools": "🤖",
  "cli-utilities": "⌨️",
  "marketing-and-sales": "📈",
  "productivity-and-tasks": "✅",
  "ai-and-llms": "🧠",
  "data-and-analytics": "📊",
  "media-and-streaming": "🎬",
  "notes-and-pkm": "📝",
  "ios-and-macos-development": "📱",
  "transportation": "🚗",
  "personal-development": "🌱",
  "health-and-fitness": "💪",
  "communication": "💬",
  "speech-and-transcription": "🎙️",
  "smart-home-and-iot": "🏠",
  "shopping-and-e-commerce": "🛒",
  "calendar-and-scheduling": "📅",
  "pdf-and-documents": "📄",
  "self-hosted-and-automation": "🔧",
  "security-and-passwords": "🔒",
  "moltbook": "📓",
  "gaming": "🎮",
};

export default function CategoryBadge({
  category,
  active = false,
  compact = false,
}: {
  category: Category;
  active?: boolean;
  compact?: boolean;
}) {
  const icon = CATEGORY_ICONS[category.slug] || "📦";

  if (compact) {
    return (
      <Link
        href={`/skills?category=${category.slug}`}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
          active
            ? "bg-purple-600 text-white shadow-md"
            : "bg-gray-50 text-gray-700 hover:bg-purple-50 hover:text-purple-600 border border-gray-100 hover:border-purple-200"
        }`}
      >
        <span className="text-base">{icon}</span>
        <div className="flex-1 min-w-0">
          <span className="block truncate text-xs">{category.name}</span>
        </div>
        <span className={`text-xs font-normal ${active ? "text-purple-200" : "text-gray-400"}`}>
          {category.skillCount}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/skills?category=${category.slug}`}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
        active
          ? "bg-purple-600 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-purple-50 hover:text-purple-600"
      }`}
    >
      <span>{icon}</span>
      <span>{category.name}</span>
      <span className={`text-xs ${active ? "text-purple-200" : "text-gray-400"}`}>
        {category.skillCount}
      </span>
    </Link>
  );
}
