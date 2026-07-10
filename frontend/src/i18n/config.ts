// Supported locales for the Meetily desktop app.
// Add new locales here when extending language support.
export const LOCALES = ["en-US", "en-GB", "zh-CN", "zh-TW"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en-US";

// Map OS locale (e.g. "zh-CN", "zh-TW", "en-US", "en-GB") to a supported locale.
// Returns DEFAULT_LOCALE if no match.
export function resolveLocaleFromOs(osLocale: string | null | undefined): Locale {
  if (!osLocale) return DEFAULT_LOCALE;
  const lower = osLocale.toLowerCase();
  if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-mo" || lower === "zh-hant") return "zh-TW";
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower === "en-gb") return "en-GB";
  if (lower.startsWith("en")) return "en-US";
  return DEFAULT_LOCALE;
}

export function isSupportedLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
