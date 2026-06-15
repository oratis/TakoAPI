import type { AppLocale } from "@/i18n/routing";

export type LocaleInfo = {
  /** Native name shown in the language switcher. */
  nativeLabel: string;
  /** English name (for aria/debugging). */
  label: string;
  /** Text direction — Arabic is the only RTL locale in the set. */
  dir: "ltr" | "rtl";
  /** Open Graph locale string (e.g. `en_US`). */
  og: string;
};

// Keyed by AppLocale so TypeScript enforces that every supported locale has
// display metadata (a missing entry is a compile error).
export const LOCALE_META: Record<AppLocale, LocaleInfo> = {
  en: { nativeLabel: "English", label: "English", dir: "ltr", og: "en_US" },
  zh: { nativeLabel: "简体中文", label: "Chinese (Simplified)", dir: "ltr", og: "zh_CN" },
  es: { nativeLabel: "Español", label: "Spanish", dir: "ltr", og: "es_ES" },
  ar: { nativeLabel: "العربية", label: "Arabic", dir: "rtl", og: "ar_AR" },
  fr: { nativeLabel: "Français", label: "French", dir: "ltr", og: "fr_FR" },
  de: { nativeLabel: "Deutsch", label: "German", dir: "ltr", og: "de_DE" },
  ja: { nativeLabel: "日本語", label: "Japanese", dir: "ltr", og: "ja_JP" },
  ko: { nativeLabel: "한국어", label: "Korean", dir: "ltr", og: "ko_KR" },
  pt: { nativeLabel: "Português", label: "Portuguese", dir: "ltr", og: "pt_BR" },
  ru: { nativeLabel: "Русский", label: "Russian", dir: "ltr", og: "ru_RU" },
  hi: { nativeLabel: "हिन्दी", label: "Hindi", dir: "ltr", og: "hi_IN" },
  id: { nativeLabel: "Bahasa Indonesia", label: "Indonesian", dir: "ltr", og: "id_ID" },
  vi: { nativeLabel: "Tiếng Việt", label: "Vietnamese", dir: "ltr", og: "vi_VN" },
  tr: { nativeLabel: "Türkçe", label: "Turkish", dir: "ltr", og: "tr_TR" },
  it: { nativeLabel: "Italiano", label: "Italian", dir: "ltr", og: "it_IT" },
};

/** Text direction for a locale (defaults to ltr for unknown values). */
export function localeDir(locale: string): "ltr" | "rtl" {
  return (LOCALE_META as Record<string, LocaleInfo>)[locale]?.dir ?? "ltr";
}

/** Open Graph locale string for a locale (defaults to en_US). */
export function localeOg(locale: string): string {
  return (LOCALE_META as Record<string, LocaleInfo>)[locale]?.og ?? "en_US";
}
