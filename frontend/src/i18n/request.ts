import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "./config";

/**
 * Read the user stored UI language. In Wave 1 this is a placeholder
 * returning the default because the Tauri command is not yet registered
 * (PR-12 will own it). The function is also called from the client
 * (LocaleProvider) once PR-12 lands.
 */
export async function getStoredLocale(): Promise<Locale> {
  try {
    // Dynamic import so the build does not require @tauri-apps/api
    // when running unit tests outside a Tauri context.
    const { invoke } = await import("@tauri-apps/api/core");
    const stored = await invoke<string>("get_ui_language");
    if (isSupportedLocale(stored)) return stored;
  } catch {
    // Tauri command not available (e.g. plain next dev without Tauri shell).
    // PR-19 will add OS locale fallback. For now, return default.
  }
  return DEFAULT_LOCALE;
}

// Build the messages import using runtime concatenation so this module
// compiles even before the JSON files exist (PR-11 ships them in the same wave).
function localePath(locale: Locale, file: string) {
  return "../../locales/" + locale + "/" + file + ".json";
}

export async function loadMessages(locale: Locale) {
  const [common, recording, transcript, summary, settings, errors] = await Promise.all([
    import(localePath(locale, "common")),
    import(localePath(locale, "recording")),
    import(localePath(locale, "transcript")),
    import(localePath(locale, "summary")),
    import(localePath(locale, "settings")),
    import(localePath(locale, "errors")),
  ]);
  return {
    common: common.default,
    recording: recording.default,
    transcript: transcript.default,
    summary: summary.default,
    settings: settings.default,
    errors: errors.default,
  };
}

export default getRequestConfig(async ({ locale }) => ({
  messages: await loadMessages((locale as Locale) ?? DEFAULT_LOCALE),
}));