import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "./config";
import commonEn from "../../locales/en-US/common.json";
import recordingEn from "../../locales/en-US/recording.json";
import transcriptEn from "../../locales/en-US/transcript.json";
import summaryEn from "../../locales/en-US/summary.json";
import settingsEn from "../../locales/en-US/settings.json";
import errorsEn from "../../locales/en-US/errors.json";
import commonZh from "../../locales/zh-CN/common.json";
import recordingZh from "../../locales/zh-CN/recording.json";
import transcriptZh from "../../locales/zh-CN/transcript.json";
import summaryZh from "../../locales/zh-CN/summary.json";
import settingsZh from "../../locales/zh-CN/settings.json";
import errorsZh from "../../locales/zh-CN/errors.json";

/**
 * Read the user stored UI language. In Wave 1 this is a placeholder
 * returning the default because the Tauri command is not yet registered
 * (PR-12 will own it). The function is also called from the client
 * (LocaleProvider) once PR-12 lands.
 */
export async function getStoredLocale(): Promise<Locale> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const stored = await invoke<string>("get_ui_language");
    if (isSupportedLocale(stored)) return stored;
  } catch {
    // Tauri command not available (e.g. plain next dev without Tauri shell).
  }
  return DEFAULT_LOCALE;
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