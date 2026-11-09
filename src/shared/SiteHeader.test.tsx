// @vitest-environment jsdom
// Hlavička webu: na úzkém displeji (390 px) se odkazy vejdou na jeden řádek díky zkráceným popiskům
// „Průvodce · Kredity · Mapa · Algoritmy“; desktop beze změny, plné jméno v aria-label (navLabel) a title.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PAGES, navLabel } from "./pages";
import { SiteHeader } from "./SiteHeader";

afterEach(cleanup);

describe("SiteHeader – zkrácené popisky na úzkém displeji", () => {
  it("každá stránka má krátký popisek (Průvodce · Kredity · Mapa · Algoritmy)", () => {
    expect(PAGES.map((p) => p.short)).toEqual([
      "Průvodce",
      "Kredity",
      "Mapa",
      "Algoritmy",
    ]);
  });

  it("odkaz nese plný text (desktop) i krátký popisek; přístupné jméno plné (+ krátké, když v plném není), title plný", () => {
    const { container } = render(<SiteHeader />);
    const links = [
      ...container.querySelectorAll<HTMLAnchorElement>(".main-nav a"),
    ];
    expect(links.map((a) => a.textContent)).toEqual(PAGES.map((p) => p.title));
    expect(links.map((a) => a.dataset.short)).toEqual(
      PAGES.map((p) => p.short),
    );
    for (const p of PAGES) {
      const a = screen.getByRole("link", { name: navLabel(p) });
      expect(a.getAttribute("title")).toBe(p.title);
    }
    expect(PAGES.map(navLabel)).toEqual([
      "Průvodce prváka",
      "Kalkulačka kreditů (Kredity)",
      "Mapa předmětů",
      "Algoritmy",
    ]);
  });

  it("přístupné jméno obsahuje viditelný text na každé šířce – plný i krátký (WCAG 2.5.3 Label in Name)", () => {
    // hlasové ovládání: „klikni Kredity“ na telefonu musí odkaz najít (validace F3)
    const { container } = render(<SiteHeader />);
    for (const a of container.querySelectorAll<HTMLAnchorElement>(
      ".main-nav a",
    )) {
      const name = (
        a.getAttribute("aria-label") ??
        a.textContent ??
        ""
      ).toLocaleLowerCase("cs");
      expect(name, a.dataset.short).toContain(
        a.dataset.short!.toLocaleLowerCase("cs"),
      );
      expect(name).toContain(a.textContent!.toLocaleLowerCase("cs"));
    }
  });

  it("CSS: jen pod 600 px se plný text schová a ukáže se krátký popisek", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/global.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const narrow = css.match(
      /@media \(max-width: 600px\) \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(narrow, "blok @media (max-width: 600px)").toBeDefined();
    expect(narrow).toMatch(
      /\.main-nav a\[data-short\]\s*\{[^}]*font-size:\s*0/,
    );
    expect(narrow).toMatch(
      /\.main-nav a\[data-short\]::after\s*\{[^}]*content:\s*attr\(data-short\)/,
    );
    // mimo úzký blok se krátký popisek nikde nevykresluje (desktop beze změny)
    const outside = css.replace(
      /@media \(max-width: 600px\) \{[\s\S]*?\n\}/,
      "",
    );
    expect(outside).not.toMatch(/attr\(data-short\)/);
  });
});
