"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LOCALE_META } from "@/lib/locales";

/**
 * Compact language selector. The visible chip shows only the uppercase locale
 * code (e.g. `EN`, `ZH`) so its width stays small and fixed regardless of how
 * long the active language's native name is (e.g. "Bahasa Indonesia"). A
 * transparent native <select> is overlaid on top: it keeps full keyboard and
 * screen-reader accessibility and renders the OS-native option list with the
 * full native language names, so discoverability isn't lost.
 *
 * Switching preserves the current path and query string via next-intl's
 * locale-aware router (the default locale stays unprefixed). The current query
 * is read from `window.location` at change time rather than via
 * `useSearchParams()` to avoid forcing a Suspense boundary on the layout.
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
    <div
      className={`relative inline-flex items-center rounded-full border border-gray-300 bg-gray-50 text-sm text-gray-700 transition-colors hover:border-purple-300 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100 ${
        isPending ? "opacity-60" : ""
      } ${className}`}
    >
      <Languages className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
      {/* Visible label — just the short code, keeps the chip narrow. */}
      <span className="pointer-events-none py-1.5 ps-8 pe-7 font-medium uppercase">{locale}</span>
      <svg
        className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* Transparent native <select> on top: drives selection + a11y, while the
          OS option list still shows full native language names. */}
      <select
        value={locale}
        onChange={(e) => onSelect(e.target.value)}
        disabled={isPending}
        aria-label={t("label")}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 outline-none disabled:cursor-default"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_META[l].nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
