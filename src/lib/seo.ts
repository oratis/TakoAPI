// Centralized SEO constants. The canonical production origin is takoapi.com
// regardless of NEXTAUTH_URL (which is localhost in dev), so canonical/OG/sitemap
// URLs are always absolute and correct. Override with NEXT_PUBLIC_SITE_URL.
import { routing } from "@/i18n/routing";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://takoapi.com").replace(/\/$/, "");
export const SITE_NAME = "TakoAPI";
export const SITE_TAGLINE = "One API to access all agents";
export const SITE_DESCRIPTION =
  "Discover and invoke AI agents through one unified API — an OpenRouter for agents. Browse a directory of hundreds of open-source agent projects and thousands of OpenClaw skills for your coding agent.";

export const SITE_KEYWORDS = [
  "AI agents",
  "agent API",
  "agent marketplace",
  "agent directory",
  "A2A",
  "agent gateway",
  "OpenRouter for agents",
  "autonomous agents",
  "LLM agents",
  "OpenClaw skills",
  "MCP",
];

/** Join a path onto the canonical site origin. */
export function absoluteUrl(path = ""): string {
  if (!path) return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Locale-prefixed absolute URL. The default locale (English) is unprefixed,
 * matching `localePrefix: "as-needed"` in the routing config, so existing
 * English URLs stay stable.
 */
export function localizedUrl(locale: string, path = ""): string {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return absoluteUrl(`${prefix}${path}`);
}

/**
 * `alternates` object for Next's Metadata: a self-referential canonical for the
 * current locale, plus `languages` hreflang entries for every locale and an
 * `x-default` pointing at the unprefixed English URL.
 */
export function localizedAlternates(locale: string, path = ""): {
  canonical: string;
  languages: Record<string, string>;
} {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = localizedUrl(l, path);
  languages["x-default"] = localizedUrl(routing.defaultLocale, path);
  return { canonical: localizedUrl(locale, path), languages };
}
