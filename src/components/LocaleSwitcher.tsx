"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LOCALE_META } from "@/lib/locales";

/**
 * Language selector. Switches the active locale while preserving the current
 * path and query string. Uses next-intl's locale-aware router so the locale
 * prefix is added/removed automatically (default locale stays unprefixed).
 *
 * The current query is read from `window.location` at click time rather than
 * via `useSearchParams()` to avoid forcing a Suspense boundary on the layout.
 */
export default function LocaleSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("LocaleSwitcher");
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSelect(next: string) {
    if (next === locale) return;
    const search = typeof window !== "undefined" ? window.location.search : "";
    startTransition(() => {
      router.replace(`${pathname}${search}`, { locale: next });
    });
  }

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <Languages className="pointer-events-none absolute start-2.5 h-4 w-4 text-gray-400" aria-hidden />
      <select
        value={locale}
        onChange={(e) => onSelect(e.target.value)}
        disabled={isPending}
        aria-label={t("label")}
        className="appearance-none rounded-full border border-gray-300 bg-gray-50 py-1.5 ps-8 pe-7 text-sm text-gray-700 outline-none transition-colors hover:border-purple-300 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 disabled:opacity-60"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_META[l].nativeLabel}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute end-2.5 h-3.5 w-3.5 text-gray-400"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
