import { describe, it, expect } from "vitest";
import { isSupportedLocale, resolveLocaleFromOs, DEFAULT_LOCALE } from "../../src/i18n/config";

describe("i18n/config", () => {
  it("isSupportedLocale returns true for known locales", () => {
    expect(isSupportedLocale("en-US")).toBe(true);
    expect(isSupportedLocale("zh-CN")).toBe(true);
  });

  it("isSupportedLocale returns false for unknown locales", () => {
    expect(isSupportedLocale("fr-FR")).toBe(false);
    expect(isSupportedLocale("zh-TW")).toBe(false);
    expect(isSupportedLocale("")).toBe(false);
  });

  it("resolveLocaleFromOs maps zh-* to zh-CN", () => {
    expect(resolveLocaleFromOs("zh-CN")).toBe("zh-CN");
    expect(resolveLocaleFromOs("zh-TW")).toBe("zh-CN");
    expect(resolveLocaleFromOs("zh-Hans")).toBe("zh-CN");
  });

  it("resolveLocaleFromOs maps en-* to en-US", () => {
    expect(resolveLocaleFromOs("en-US")).toBe("en-US");
    expect(resolveLocaleFromOs("en-GB")).toBe("en-US");
  });

  it("resolveLocaleFromOs falls back to DEFAULT_LOCALE", () => {
    expect(resolveLocaleFromOs("fr-FR")).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleFromOs(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleFromOs(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleFromOs("")).toBe(DEFAULT_LOCALE);
  });
});