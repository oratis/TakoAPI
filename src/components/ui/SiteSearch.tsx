"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

// The one search box for the whole site. A scope switch (agents / projects /
// skills) replaces the two boxes that used to send people to different places
// depending on where they typed. Scope defaults to what the visitor is looking at.
export type SearchScope = "agents" | "projects" | "skills";

const ROUTES: Record<SearchScope, (q: string) => { pathname: string; query: Record<string, string> }> = {
  agents: (q) => ({ pathname: "/agents", query: { q } }),
  projects: (q) => ({ pathname: "/agents", query: { kind: "PROJECT", q } }),
  skills: (q) => ({ pathname: "/skills", query: { q } }),
};

export default function SiteSearch({
  variant = "header",
  className = "",
  defaultScope,
  autoFocus = false,
}: {
  variant?: "header" | "hero";
  className?: string;
  defaultScope?: SearchScope;
  autoFocus?: boolean;
}) {
  const t = useTranslations("Header");
  const router = useRouter();
  const pathname = usePathname();
  const inferred: SearchScope = pathname.startsWith("/skills") || pathname.startsWith("/trending") ? "skills" : "agents";
  const [scope, setScope] = useState<SearchScope>(defaultScope ?? inferred);
  const [query, setQuery] = useState("");

  const placeholder =
    scope === "skills"
      ? t("searchSkillsPlaceholder")
      : scope === "projects"
        ? t("searchProjectsPlaceholder")
        : t("searchAgentsPlaceholder");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(ROUTES[scope](q));
  };

  const hero = variant === "hero";
  return (
    <form onSubmit={onSubmit} role="search" className={`relative w-full ${className}`}>
      <div
        className={`flex items-center rounded-full border border-gray-300 bg-white transition-all focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100 ${
          hero ? "shadow-sm py-1 ps-2 pe-1.5" : "bg-gray-50 focus-within:bg-white py-0.5 ps-1.5 pe-1"
        }`}
      >
        <label className="sr-only" htmlFor={`site-search-scope-${variant}`}>
          {t("searchScope")}
        </label>
        <select
          id={`site-search-scope-${variant}`}
          value={scope}
          onChange={(e) => setScope(e.target.value as SearchScope)}
          className={`shrink-0 rounded-full border-0 bg-transparent font-medium text-gray-600 outline-none cursor-pointer hover:text-gray-900 ${
            hero ? "text-sm ps-2 pe-1 py-2" : "text-xs ps-2 pe-0.5 py-1.5"
          }`}
        >
          <option value="agents">{t("scopeAgents")}</option>
          <option value="projects">{t("scopeProjects")}</option>
          <option value="skills">{t("scopeSkills")}</option>
        </select>
        <span aria-hidden className="mx-1 h-5 w-px bg-gray-200" />
        <label className="sr-only" htmlFor={`site-search-${variant}`}>
          {placeholder}
        </label>
        <input
          id={`site-search-${variant}`}
          type="search"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`min-w-0 flex-1 bg-transparent outline-none text-gray-900 placeholder:text-gray-500 ${
            hero ? "text-base px-2 py-2" : "text-sm px-2 py-1.5"
          }`}
        />
        <button
          type="submit"
          aria-label={t("search")}
          className={`shrink-0 inline-flex items-center justify-center rounded-full bg-purple-600 text-white hover:bg-purple-700 ${
            hero ? "h-9 w-9" : "h-7 w-7"
          }`}
        >
          <Search className={hero ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </button>
      </div>
    </form>
  );
}
