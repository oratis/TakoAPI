import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import enMessages from "../../messages/en.json";

type Messages = typeof enMessages;

// Deep-merge a (possibly partial) locale's messages over the English base so a
// not-yet-fully-translated locale falls back to English key-by-key instead of
// throwing on a missing key.
function deepMerge<T>(base: T, override: unknown): T {
  if (
    typeof base !== "object" || base === null || Array.isArray(base) ||
    typeof override !== "object" || override === null || Array.isArray(override)
  ) {
    return (override === undefined ? base : (override as T));
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(override as Record<string, unknown>)) {
    result[key] = deepMerge(
      (base as Record<string, unknown>)[key],
      (override as Record<string, unknown>)[key],
    );
  }
  return result as T;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  let messages: Messages = enMessages;
  if (locale !== routing.defaultLocale) {
    try {
      const localeMessages = (await import(`../../messages/${locale}.json`)).default;
      messages = deepMerge(enMessages, localeMessages);
    } catch {
      // No translation file yet for this locale — fall back to English.
      messages = enMessages;
    }
  }

  return { locale, messages };
});
