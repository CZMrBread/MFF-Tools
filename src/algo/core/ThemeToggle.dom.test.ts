// @vitest-environment jsdom
// Přepínač tématu (CROSS-13): skupina tlačítek s aria-pressed (ne radiogroup bez šipek), klíč algo-theme.
import { createElement as h } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { click, mount } from "./domTest";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle", () => {
  it("role=group s aria-label, tlačítka s aria-pressed, žádné role=radio", async () => {
    const m = await mount(h(ThemeToggle));
    const g = m.el.querySelector(".theme-toggle")!;
    expect(g.getAttribute("role")).toBe("group");
    expect(g.getAttribute("aria-label")).toBe("Barevné téma");
    expect(
      m.el.querySelectorAll('[role="radio"], [role="radiogroup"]').length,
    ).toBe(0);
    const pressed = () =>
      [...m.el.querySelectorAll("button")]
        .filter((b) => b.getAttribute("aria-pressed") === "true")
        .map((b) => b.textContent);
    expect(pressed()).toEqual(["auto"]);
    await click(m.button("☾ tmavý"));
    expect(pressed()).toEqual(["☾ tmavý"]);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("algo-theme")).toBe("dark");
    await click(m.button("auto"));
    expect(localStorage.getItem("algo-theme")).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    for (const b of m.el.querySelectorAll("button"))
      expect(b.getAttribute("type")).toBe("button");
    await m.unmount();
  });
});
