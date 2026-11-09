// @vitest-environment jsdom
// Sdílený bezpečný přístup k localStorage (player.ts – algo-speed, landing/recent.ts – algo-recent)
// a sdílený dotaz „omezit pohyb“ (validace F8: dřív zkopírované na více místech).
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeLocalStorage } from "./storage";
import { prefersReducedMotion } from "./stepTransition";

afterEach(() => vi.unstubAllGlobals());

describe("safeLocalStorage", () => {
  it("vrátí localStorage, když je k dispozici", () => {
    expect(safeLocalStorage()).toBe(localStorage);
  });
  it("přístup, který vyhodí výjimku (zakázané cookies), dá null místo pádu", () => {
    const desc = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      expect(safeLocalStorage()).toBeNull();
    } finally {
      Object.defineProperty(window, "localStorage", desc);
    }
  });
});

describe("prefersReducedMotion", () => {
  it("čte prefers-reduced-motion: reduce; bez matchMedia = false", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q === "(prefers-reduced-motion: reduce)",
    }));
    expect(prefersReducedMotion()).toBe(true);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
