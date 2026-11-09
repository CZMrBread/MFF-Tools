// @vitest-environment jsdom
/*
 * Stránka stránkování jako celek.
 * - SSR (vždy): výchozí příklad, jednotné popisky, tabulka v .table-scroll, sdílený odkaz (?q=…&P=…).
 * - jsdom (prostředí souboru, nikdy se nepřeskočí): P platí hned; Spustit(σ) z nabídky – Enter spustí
 *   (krok 1, přehraje až ▶); zlá posloupnost, výchozí příklad a příklad z přednášky L04 jedním až dvěma kliky.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { click, key, mount, type } from "../../core/domTest";
import { PagingPage } from "./PagingPage";

const routes = () =>
  h(Routes, null, h(Route, { path: "/cache/paging", element: h(PagingPage) }));
const ssr = (url: string) =>
  renderToStaticMarkup(h(MemoryRouter, { initialEntries: [url] }, routes()));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

describe("stránkování – SSR", () => {
  it("výchozí příklad, nabídka operací, limity, tabulka se posouvá", () => {
    const html = ssr("/cache/paging");
    const t = text(html);
    for (const s of [
      "P =",
      "Vytvořit",
      "Příklady",
      "↶ Vrátit operaci",
      "Výchozí příklad",
      "Zkuste:",
      "Kopírovat odkaz",
      "poslední požadavek",
    ]) {
      expect(t, s).toContain(s);
    }
    expect(t).toContain("Simulace: P = 3, 12 požadavků");
    // limity vstupu jsou ve vysvětlivce varianty Vytvořit ▸ Vlastní (pageModel.test.ts)
    expect(html).toContain('class="table-scroll"');
    expect(html).toContain('class="action-menu"');
    // stará pole Vstup / Parametry jsou pryč
    expect(html).not.toContain("<fieldset");
    // na plátně je přesně simulovaná posloupnost
    expect(t.includes("123412512345"), "posloupnost požadavků na plátně").toBe(
      true,
    );
    // UI používá „zásah“ / „výpadek“, anglicky jen jednou v popisu
    expect(t).not.toMatch(/\bmiss\b(?!\))/);
    expect(t).not.toContain("Reset");
  });

  it("sdílený odkaz nastaví posloupnost i P; neplatné hodnoty se nepoužijí", () => {
    const t = text(ssr("/cache/paging?q=1,2,3,1&P=2"));
    expect(t).toContain("Simulace: P = 2, 4 požadavky");
    expect(t).toContain("slot 2");
    expect(t).not.toContain("slot 3");
    expect(text(ssr("/cache/paging?q=a,b&P=99"))).toContain(
      "Simulace: P = 3, 12 požadavků",
    );
  });
});

/* ---------------------------------------------------------------- jsdom */

describe("stránkování v DOM (jsdom)", () => {
  let search = "";
  function Spy() {
    search = useLocation().search;
    return null;
  }
  const open = (url: string) =>
    mount(h(MemoryRouter, { initialEntries: [url] }, routes(), h(Spy)));
  const op = (el: HTMLElement) =>
    el.querySelector(".viz-op")?.textContent ?? "";
  const slots = (el: HTMLElement) =>
    el.querySelectorAll(".paging-table thead th").length - 3;
  const playing = (el: HTMLElement) =>
    el.querySelector(".ctl-play")!.getAttribute("aria-label") === "Pozastavit";
  const enter = (i: HTMLElement) => key(i, { key: "Enter" });

  it("P platí hned (žádný rozpor mezi polem a tabulkou) a zapíše se do adresy", async () => {
    const p = await open("/cache/paging");
    await type(p.input("P ="), "4");
    expect(slots(p.el)).toBe(4);
    expect(op(p.el)).toContain("P = 4");
    expect(search).toContain("P=4");
    // neplatné P se neuplatní a pole to řekne
    await type(p.input("P ="), "9");
    expect(slots(p.el)).toBe(4);
    expect(p.el.textContent).toContain("Zadejte celé číslo od 1 do 8");
    await p.unmount();
  });

  it("Vytvořit ▸ Vlastní: pole je předvyplněné, ignorované tokeny hlásí hned, Enter spustí (stojí na kroku 1, ▶ přehraje)", async () => {
    const p = await open("/cache/paging");
    expect(playing(p.el)).toBe(false);
    await click(p.button("Vytvořit"));
    expect(p.button("Simulovat")).toBeTruthy();
    expect(p.input("Požadavky").value).toBe(
      "1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5",
    );
    await type(p.input("Požadavky"), "1 2 x 3 1");
    expect(p.el.querySelector(".am-msg")!.textContent).toContain(
      "Ignorováno: x",
    );
    await enter(p.input("Požadavky"));
    expect(op(p.el)).toContain("Simulace: P = 3, 4 požadavky");
    expect(playing(p.el)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(search).toContain("q=1,2,3,1");
    // pole ukazuje přesně použitou posloupnost
    expect(p.input("Požadavky").value).toBe("1, 2, 3, 1");
    await p.unmount();
  });

  it("Vytvořit ▸ Zlá posloupnost a Výchozí příklad jedním klikem; pole požadavků je pak ukazuje; ↶ vrací σ i P", async () => {
    const p = await open("/cache/paging");
    await click(p.button("Vytvořit"));
    await click(p.button("Zlá posloupnost pro LRU"));
    expect(op(p.el)).toContain("Simulace: P = 3, 16 požadavků");
    expect(playing(p.el)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await click(p.button("Vlastní"));
    expect(p.input("Požadavky").value).toBe(
      "1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4",
    );
    await type(p.input("P ="), "5");
    await click(p.button("Výchozí příklad"));
    expect(p.input("Požadavky").value).toBe(
      "1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5",
    );
    expect(p.input("P =").value).toBe("3");
    expect(search).toContain("P=3");
    expect(p.el.querySelector(".viz-history-list")?.textContent).toContain(
      "Zlá posloupnost pro LRU",
    );
    // ↶ Vrátit operaci: zpět P = 5 nad zlou posloupností (pole, tabulka i adresa)
    await click(p.button("↶ Vrátit operaci"));
    expect(p.input("P =").value).toBe("5");
    expect(slots(p.el)).toBe(5);
    expect(search).toContain("P=5");
    expect(op(p.el)).toContain("Simulace: P = 5, 16 požadavků");
    expect(playing(p.el)).toBe(false);
    // v nabídce Výchozí příklad není
    expect(
      [...p.el.querySelectorAll(".action-menu button")].map((b) =>
        b.textContent?.trim(),
      ),
    ).not.toContain("Výchozí příklad");
    await p.unmount();
  });

  it("příklad z přednášky L04 nastaví posloupnost i P a uvede zdroj", async () => {
    const p = await open("/cache/paging?P=6");
    await click(p.button("Příklady"));
    await click(p.button("Matice po sloupcích"));
    expect(op(p.el)).toContain(
      "Simulace: P = 3, 25 požadavků – Matice po sloupcích (Přednáška L04, slide 10)",
    );
    expect(playing(p.el)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(p.input("P =").value).toBe("3");
    expect(slots(p.el)).toBe(3);
    expect(search).toContain("q=1,2,3,4,6");
    await p.unmount();
  });
});
