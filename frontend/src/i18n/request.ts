import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "./config";
import commonEn from "../../locales/en-US/common.json";
import recordingEn from "../../locales/en-US/recording.json";
import transcriptEn from "../../locales/en-US/transcript.json";
import summaryEn from "../../locales/en-US/summary.json";
import settingsEn from "../../locales/en-US/settings.json";
import errorsEn from "../../locales/en-US/errors.json";
import sidebarEn from "../../locales/en-US/sidebar.json";
import commonZh from "../../locales/zh-CN/common.json";
import recordingZh from "../../locales/zh-CN/recording.json";
import transcriptZh from "../../locales/zh-CN/transcript.json";
import summaryZh from "../../locales/zh-CN/summary.json";
import settingsZh from "../../locales/zh-CN/settings.json";
import errorsZh from "../../locales/zh-CN/errors.json";
import sidebarZh from "../../locales/zh-CN/sidebar.json";

/**
 * Read the user stored UI language via the get_ui_language Tauri command
 * (registered by PR-12). Returns DEFAULT_LOCALE if no value has been saved yet
 * (first launch) or the stored value is not a supported locale.
 */
export async function getStoredLocale(): Promise<Locale> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const stored = await invoke<string | null>("get_ui_language");
    if (stored && isSupportedLocale(stored)) return stored;
    return DEFAULT_LOCALE;
  } catch (e) {
    // SSR / build / non-Tauri context: the Tauri shell is not present.
    // We log a single warning the first time this fires, then fall back to
    // DEFAULT_LOCALE so the build and unit tests can render.
    if (typeof console !== "undefined") {
      console.warn("[i18n] get_ui_language unavailable, using default locale:", String(e));
    }
    return DEFAULT_LOCALE;
  }
}

type Messages = {
  common: typeof commonEn;
  recording: typeof recordingEn;
  transcript: typeof transcriptEn;
  summary: typeof summaryEn;
  settings: typeof settingsEn;
  errors: typeof errorsEn;
};

const MESSAGES: Record<Locale, Messages> = {
  "en-US": {
    common: commonEn,
    recording: recordingEn,
    transcript: transcriptEn,
    summary: summaryEn,
    settings: settingsEn,
    errors: errorsEn,
  },
  "zh-CN": {
    common: commonZh,
    recording: recordingZh,
    transcript: transcriptZh,
    summary: summaryZh,
    settings: settingsZh,
    errors: errorsZh,
  },
};

export function loadMessages(locale: Locale): Messages {
  if (!isSupportedLocale(locale)) return MESSAGES[DEFAULT_LOCALE];
  return MESSAGES[locale];
}

export default getRequestConfig(async ({ locale }) => {
  const safeLocale: Locale = locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    locale: safeLocale,
    messages: loadMessages(safeLocale),
  };
});