"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type FilterOption = {
  value: string;
  label: string;
  emoji?: string;
  href: string;
  active: boolean;
};

export type FilterGroup = {
  id: string;
  title: string;
  options: FilterOption[];
  scroll?: boolean;
};

export default function FilterPanel({ groups, label, onNavigate }: {
  groups: FilterGroup[];
  label: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("Agents");
  const uid = useId();
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();

  return (
    <nav aria-label={label} className="divide-y divide-gray-100">
      {groups.map((group) => {
        const isScenario = group.id === "scenario";
        const options = isScenario && term
          ? group.options.filter((option) => option.value === "all" || option.label.toLocaleLowerCase().includes(term) || option.value.includes(term))
          : group.options;
        const titleId = `${uid}-${group.id}`;
        const content = (
          <>
            {isScenario && (
              <div className="relative mb-3">
                <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-3 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={t("searchScenarios")}
                  placeholder={t("searchScenarios")}
                  className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 py-2 ps-9 pe-3 text-base text-gray-900 outline-none placeholder:text-gray-500 focus:border-purple-400 focus:bg-white focus:ring-2 focus:ring-purple-100 lg:text-sm"
                />
              </div>
            )}
            {/* A grid cannot wrap a height-constrained column into clipped
                horizontal columns, as the old flex-wrap list did. */}
            <ul
              aria-labelledby={titleId}
              className={group.scroll
                ? "marketplace-filter-list grid max-h-80 grid-cols-1 gap-1 overflow-y-auto overscroll-contain pe-1"
                : "flex flex-wrap gap-2"}
            >
              {options.map((option) => (
                <li key={option.value} className="min-w-0">
                  <Link
                    href={option.href}
                    scroll={false}
                    onNavigate={onNavigate}
                    aria-current={option.active ? "true" : undefined}
                    className={`flex min-h-10 items-center gap-2.5 rounded-lg border px-3 py-2 text-start text-sm leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 ${
                      option.active
                        ? "border-purple-100 bg-purple-50 font-semibold text-purple-700"
                        : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                    } ${group.scroll ? "w-full" : "border-gray-200"}`}
                  >
                    {option.emoji && <span aria-hidden="true" className="w-5 shrink-0 text-center">{option.emoji}</span>}
                    <span className="min-w-0 flex-1 break-words">{isScenario && option.value === "all" ? t("allScenarios") : option.label}</span>
                    {option.active && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
                  </Link>
                </li>
              ))}
            </ul>
            {isScenario && term && options.length === 1 && (
              <div role="status" className="px-2 pt-3 text-sm text-gray-500">
                <p>{t("noScenarios")}</p>
                <button type="button" onClick={() => setQuery("")} className="mt-2 inline-flex items-center gap-1 text-purple-700 hover:underline">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />{t("allScenarios")}
                </button>
              </div>
            )}
          </>
        );

        return group.id === "category" ? (
          <details key={group.id} open={group.options.some((option) => option.value !== "all" && option.active) || undefined} className="group/category p-4">
            <summary id={titleId} className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 [&::-webkit-details-marker]:hidden">
              {group.title}
              <ChevronDown className="h-4 w-4 transition-transform group-open/category:rotate-180" aria-hidden="true" />
            </summary>
            <div className="pt-3">{content}</div>
          </details>
        ) : (
          <section key={group.id} className="p-4" aria-labelledby={titleId}>
            <h2 id={titleId} className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {group.title}
              {isScenario && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500">{group.options.length - 1}</span>}
            </h2>
            {content}
          </section>
        );
      })}
    </nav>
  );
}

export function MobileFilters({ groups, activeCount }: { groups: FilterGroup[]; activeCount: number }) {
  const t = useTranslations("Agents");
  const disclosure = useRef<HTMLDetailsElement>(null);

  function close() {
    if (!disclosure.current) return;
    disclosure.current.open = false;
    disclosure.current.querySelector("summary")?.focus({ preventScroll: true });
    // Selecting a lower option can leave the page scrolled past the results
    // after the tall disclosure collapses. Return to the filter summary.
    disclosure.current.scrollIntoView({ block: "start" });
  }

  return (
    <details ref={disclosure} className="group/filters mb-4 scroll-mt-20 rounded-xl border border-gray-200 bg-white lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-gray-700 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {activeCount > 0 ? t("filtersWithCount", { count: activeCount }) : t("filtersTitle")}
        </span>
        <ChevronDown className="h-4 w-4 transition-transform group-open/filters:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-gray-100">
        <FilterPanel groups={groups} label={t("filtersTitle")} onNavigate={close} />
      </div>
    </details>
  );
}
