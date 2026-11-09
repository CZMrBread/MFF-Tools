// @vitest-environment jsdom
/*
 * Stránky nafukovacího pole a binárního počítadla jako celek.
 * - SSR (vždy): předvyplněný příklad s proměnnými, nabídka operací, legenda, tip; sdílený odkaz (?a=…&p=…, ?v=…).
 * - jsdom (prostředí souboru, nikdy se nepřeskočí): nabídka operací – Enter v poli x spustí Insert (krok 1, přehraje až ▶)
 *   ho, název operace je i s argumentem, Vytvořit zapíše vstup do adresy, Prázdné zakáže Delete, stav
 *   z přednášky L01 má kapacitu v adrese.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { click, key, mount, type } from "../../core/domTest";
import { AmortizedPage } from "./AmortizedPage";

const routes = () =>
  h(
    Routes,
    null,
    h(Route, { path: "/", element: h("p", null, "PŘEHLED") }),
    h(Route, { path: "/ds2/:id", element: h(AmortizedPage) }),
  );
const ssr = (url: string) =>
  renderToStaticMarkup(h(MemoryRouter, { initialEntries: [url] }, routes()));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

describe("amortizace – SSR", () => {
  it("nafukovací pole: výchozí plné pole s proměnnými, nabídka operací, legenda a tip", () => {
    const html = ssr("/ds2/array");
    const t = text(html);
    for (const s of [
      "Vytvořit",
      "Insert(x)",
      "Delete",
      "8× Insert",
      "8× Delete",
      "↶ Vrátit operaci",
      "Výchozí příklad",
      "Zkuste:",
      "Kopírovat odkaz",
    ]) {
      expect(t, s).toContain(s);
    }
    expect(html).toContain('aria-label="Pole kapacity 4, prvků 4: 1, 2, 3, 4"');
    expect(html).toContain('class="action-menu"');
    expect(html).not.toContain("<fieldset");
    // proměnné jsou vidět hned (dřív až po první operaci)
    expect(t).toContain("Σ amortizovaná + Φ₀ − Φ");
    // limity jsou ve vysvětlivce akce Vytvořit
    expect(html).toContain("nejvýše 64");
    // legenda jen se značkami, které pole kreslí; odebíraný prvek má čárkovaný vzorek jako na plátně
    expect(html).toContain("sw-removed-dashed");
    // volné buňky (.box-free) mají vzorek v legendě
    expect(html).toContain("sw-free");
    expect(t).toContain("volná buňka (kapacita p)");
    expect(t).not.toContain("Reset");
  });

  it("nafukovací pole: sdílený odkaz postaví pole s kapacitou nejbližší mocniny dvojky", () => {
    const html = ssr("/ds2/array?a=5,8,13,x,2000");
    expect(html).toContain('aria-label="Pole kapacity 4, prvků 3: 5, 8, 13"');
    expect(text(html)).toContain("ze sdíleného odkazu");
  });

  it("nafukovací pole: nepovinný parametr p= zachová kapacitu (stav z přednášky); neplatné p se ignoruje", () => {
    expect(ssr("/ds2/array?a=1,2,3,4&p=8")).toContain(
      'aria-label="Pole kapacity 8, prvků 4: 1, 2, 3, 4"',
    );
    expect(ssr("/ds2/array?a=1,2,3,4&p=6")).toContain(
      'aria-label="Pole kapacity 4, prvků 4: 1, 2, 3, 4"',
    );
  });

  it("binární počítadlo: výchozí hodnota 7, nabídka operací, sdílený odkaz ?v=", () => {
    const html = ssr("/ds2/counter");
    const t = text(html);
    for (const s of [
      "Vytvořit",
      "Increment",
      "8× Increment",
      "Výchozí příklad",
      "Zkuste:",
    ])
      expect(t, s).toContain(s);
    expect(html).toContain('aria-label="Počítadlo: 7, dvojkově 000111"');
    expect(html).toContain(
      'aria-label="Graf: skutečná cena operací (sloupce) a potenciál Φ (křivka): zatím žádná operace"',
    );
    expect(t).toContain("potenciál Φ (křivka)");
    expect(t).toContain("2³");
    expect(ssr("/ds2/counter?v=12")).toContain(
      'aria-label="Počítadlo: 12, dvojkově 001100"',
    );
    // neplatná hodnota v adrese → výchozí příklad
    expect(ssr("/ds2/counter?v=-3")).toContain('aria-label="Počítadlo: 7');
  });

  it("neznámé :id nevykreslí žádnou stránku (přesměrování proběhne v efektu)", () => {
    expect(ssr("/ds2/foo")).toBe("");
  });
});

/* ---------------------------------------------------------------- jsdom */

describe("amortizace v DOM (jsdom)", () => {
  let search = "";
  function Spy() {
    search = useLocation().search;
    return null;
  }
  const open = (url: string) =>
    mount(h(MemoryRouter, { initialEntries: [url] }, routes(), h(Spy)));
  const op = (el: HTMLElement) =>
    el.querySelector(".viz-op")?.textContent ?? "";
  const history = (el: HTMLElement) =>
    el.querySelector(".viz-history-list")?.textContent ?? "";
  const svg = (el: HTMLElement) =>
    el.querySelector("svg.array-svg")?.getAttribute("aria-label") ?? "";
  const playing = (el: HTMLElement) =>
    el.querySelector(".ctl-play")!.getAttribute("aria-label") === "Pozastavit";
  const enter = (i: HTMLElement) => key(i, { key: "Enter" });

  it("Insert(x): pole x je předvyplněné, Enter vloží (stojí na kroku 1), x se posune, krok zpět vrátí pole", async () => {
    const p = await open("/ds2/array");
    // Insert(x) je po načtení rozbalený (CROSS-06)
    expect(p.button("Insert(x)").getAttribute("aria-expanded")).toBe("true");
    // výchozí x navazuje na prvky pole
    expect(p.input("x =").value).toBe("5");
    await type(p.input("x ="), "42");
    await enter(p.input("x ="));
    expect(op(p.el)).toContain("Insert(42)");
    expect(playing(p.el)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(history(p.el)).toContain("Insert(42)");
    expect(p.input("x =").value).toBe("43");
    await click(p.button("↶ Vrátit operaci"));
    expect(history(p.el)).toContain("zatím žádná operace");
    expect(svg(p.el)).toBe("Pole kapacity 4, prvků 4: 1, 2, 3, 4");
    await p.unmount();
  });

  it("8× Insert začne od x v poli a posune ho; Delete jedním klikem", async () => {
    const p = await open("/ds2/array");
    await type(p.input("x ="), "10");
    await click(p.button("8× Insert"));
    expect(op(p.el)).toContain("8× Insert(10 … 17)");
    expect(p.input("x =").value).toBe("18");
    await click(p.button("Delete"));
    expect(op(p.el)).toContain("Delete (odebere 17)");
    await p.unmount();
  });

  it("Vytvořit ▸ Vlastní zapíše vstup do adresy, Prázdné ho smaže a Delete zakáže s vysvětlením", async () => {
    const p = await open("/ds2/array");
    await click(p.button("Vytvořit"));
    expect(p.input("A =").value).toBe("1, 2, 3, 4");
    await type(p.input("A ="), "9 4 7");
    await enter(p.input("A ="));
    expect(history(p.el)).toContain("Vytvořit(9, 4, 7)");
    expect(search).toBe("?a=9,4,7");
    expect(svg(p.el)).toBe("Pole kapacity 4, prvků 3: 9, 4, 7");
    await click(p.button("Prázdné"));
    expect(search).toBe("");
    expect(p.button("Delete").getAttribute("aria-disabled")).toBe("true");
    expect(p.button("Delete").title).toContain("prázdné");
    expect(p.button("8× Delete").getAttribute("aria-disabled")).toBe("true");
    await click(p.button("Výchozí příklad"));
    expect(svg(p.el)).toBe("Pole kapacity 4, prvků 4: 1, 2, 3, 4");
    await click(p.button("Vlastní"));
    expect(p.input("A =").value).toBe("1, 2, 3, 4");
    await p.unmount();
  });

  it("Vytvořit ▸ Z přednášky postaví stav z L01 (p = 2n, Φ = 0) i s kapacitou v adrese", async () => {
    const p = await open("/ds2/array");
    await click(p.button("Vytvořit"));
    await click(p.button("Z přednášky"));
    await type(p.input("stav"), "l01-half");
    await click(p.button("Provést"));
    expect(svg(p.el)).toBe("Pole kapacity 8, prvků 4: 1, 2, 3, 4");
    expect(history(p.el)).toContain("Vytvořit: p = 2n (Φ = 0)");
    expect(p.el.textContent).toContain("Přednáška L01, slide 13");
    expect(search).toBe("?a=1,2,3,4&p=8");
    await p.unmount();
  });

  it("řádek součtů zůstane i s neceločíselnou mezí (Prázdné → p = 1, Φ₀ = 0,5; dřív zmizel) a píše desetinnou čárku", async () => {
    const p = await open("/ds2/array");
    await click(p.button("Vytvořit"));
    await click(p.button("Prázdné"));
    const sums = () => p.el.querySelector(".amort-sums")?.textContent ?? "";
    expect(sums()).toBe("Σ skutečná = 0 = 0 = Σ amortizovaná + Φ₀ − Φ");
    await click(p.button("Insert(x)"));
    await enter(p.input("x ="));
    await click(p.button("Na konec"));
    // Insert do pole kapacity 1: skutečná 1, Σ amortizovaná 3, Φ₀ = 0,5, Φ = 1 → mez 2,5
    expect(sums()).toBe("Σ skutečná = 1 ≤ 2,5 = Σ amortizovaná + Φ₀ − Φ");
    expect(p.el.querySelector(".viz-canvas")?.textContent).not.toMatch(
      /\d\.\d/,
    );
    await p.unmount();
  });

  it("graf ceny operací (obr. 9.2) pod polem: prázdný s výzvou, sloupec roste s kroky Insertu, ↶ ho odebere", async () => {
    const p = await open("/ds2/array");
    const chart = () =>
      p.el.querySelector<SVGSVGElement>(
        'svg[aria-label^="Graf: skutečná cena operací"]',
      );
    const bars = () =>
      [...p.el.querySelectorAll("g.bar[aria-label]")].map((b) =>
        b.getAttribute("aria-label"),
      );
    expect(chart()?.getAttribute("role")).toBe("img");
    expect(chart()?.getAttribute("aria-label")).toContain(
      "zatím žádná operace",
    );
    await enter(p.input("x ="));
    // krok 1 (n = p): operace začala, zatím nic nestála – přehrávač stojí
    expect(playing(p.el)).toBe(false);
    expect(bars()).toEqual([
      "1. Insert(5): skutečná cena zatím 0, Φ = 4 (probíhá)",
    ]);
    await click(p.button("Na konec"));
    expect(bars()).toEqual(["1. Insert(5): skutečná cena 5, Φ = 2"]);
    expect(chart()?.getAttribute("role")).toBe("group");
    // jediná zastávka Tabu v grafu
    expect(chart()!.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    await click(p.button("↶ Vrátit operaci"));
    expect(bars()).toEqual([]);
    await p.unmount();
  });

  it("graf počítadla: 8× Increment z 0 dá sloupce 1, 2, 1, 3, 1, 2, 1, 4 jako obr. 9.2", async () => {
    const p = await open("/ds2/counter?v=0");
    await click(p.button("8× Increment"));
    await click(p.button("Na konec"));
    const bars = [...p.el.querySelectorAll("g.bar[aria-label]")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(bars.map((b) => Number(/cena (\d+)/.exec(b ?? "")?.[1]))).toEqual([
      1, 2, 1, 3, 1, 2, 1, 4,
    ]);
    expect(bars[7]).toBe("8. Increment 7 → 8: skutečná cena 4, Φ = 1");
    await p.unmount();
  });

  it("počítadlo: Vytvořit ▸ Hodnota + Enter, Increment se připraví (krok 1) a má v názvu přechod hodnot, Nula", async () => {
    const p = await open("/ds2/counter");
    await click(p.button("Vytvořit"));
    expect(p.input("hodnota =").value).toBe("7");
    await type(p.input("hodnota ="), "15");
    await enter(p.input("hodnota ="));
    expect(search).toBe("?v=15");
    expect(history(p.el)).toContain("Vytvořit(15)");
    await click(p.button("Increment"));
    expect(op(p.el)).toContain("Increment (15 → 16)");
    expect(playing(p.el)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await click(p.button("Nula"));
    expect(history(p.el)).toContain("Vynulovat");
    expect(search).toBe("");
    await p.unmount();
  });
});
