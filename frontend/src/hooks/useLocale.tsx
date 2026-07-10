"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "../i18n/config";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: async () => {
    throw new Error("LocaleProvider not mounted");
  },
});

export function LocaleProvider({
  initial,
  children,
}: {
  initial: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initial);

  const setLocale = useCallback(async (next: Locale) => {
    if (!isSupportedLocale(next)) {
      throw new Error("Unsupported locale: " + next);
    }
    // Persist to Tauri settings (PR-12 will own this command).
    // Wave 1 falls back to a no-op if the command is not yet registered.
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_ui_language", { language: next });
    } catch {
      // PR-12 not yet merged - accept the change in-memory only.
    }
    setLocaleState(next);
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}