import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LocaleProvider, useLocale } from "../../src/hooks/useLocale";

// Mock @tauri-apps/api/core before importing the hook
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

function LocaleReader() {
  const { locale, setLocale } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <button data-testid="switch" onClick={() => setLocale("zh-CN")}>
        switch
      </button>
    </div>
  );
}

describe("useLocale", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockRejectedValue(new Error("not registered"));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("exposes the initial locale from provider", () => {
    render(
      <LocaleProvider initial="en-US">
        <LocaleReader />
      </LocaleProvider>
    );
    expect(screen.getByTestId("locale").textContent).toBe("en-US");
  });

  it("updates locale in-memory when setLocale is called", async () => {
    render(
      <LocaleProvider initial="en-US">
        <LocaleReader />
      </LocaleProvider>
    );
    fireEvent.click(screen.getByTestId("switch"));
    await waitFor(() => {
      expect(screen.getByTestId("locale").textContent).toBe("zh-CN");
    });
  });

  it("calls invoke set_ui_language (with graceful fallback)", async () => {
    render(
      <LocaleProvider initial="en-US">
        <LocaleReader />
      </LocaleProvider>
    );
    fireEvent.click(screen.getByTestId("switch"));
    await waitFor(() => {
      expect(screen.getByTestId("locale").textContent).toBe("zh-CN");
    });
    // invoke is attempted once; the rejection is swallowed.
    expect(mockInvoke).toHaveBeenCalledWith("set_ui_language", { language: "zh-CN" });
  });
});