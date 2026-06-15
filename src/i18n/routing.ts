import { defineRouting } from "next-intl/routing";

// Single source of truth for the locales we support. Imported by the proxy
// (request interceptor), the navigation helpers, the request config, the
// sitemap, and the language switcher. To add/remove a language, edit this list
// and add a matching `messages/<code>.json` + an entry in `src/lib/locales.ts`.
export const routing = defineRouting({
  locales: ["en", "zh", "es", "ar", "fr", "de", "ja", "ko", "pt", "ru", "hi", "id", "vi", "tr", "it"],
  defaultLocale: "en",
  // English stays unprefixed (`/agents`); every other locale is prefixed
  // (`/zh/agents`). Keeps existing English URLs byte-for-byte stable.
  localePrefix: "as-needed",
  // Don't auto-redirect by Accept-Language: `/` is deterministically English
  // unless the visitor explicitly switches (which sets the NEXT_LOCALE cookie).
  localeDetection: false,
});

export type AppLocale = (typeof routing.locales)[number];
