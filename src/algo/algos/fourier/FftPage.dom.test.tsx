// @vitest-environment jsdom
/*
 * Stránka #/fft/fft jako celek (jsdom): výchozí příklad, kružnice s ωᵏ, strom volání, tabulka
 * koeficienty → hodnoty, pseudokód přepnutý při vnořené FFT, odkaz, přehrávač stojí na kroku 1.
 */
import { createElement as h, useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { click, key, mount, type } from "../../core/domTest";
import { FftPage } from "./FftPage";

let search = "";
function Spy() {
  const loc = useLocation();
  useEffect(() => {
    search = loc.search;
  });
  return null;
}
const open = (url: string) =>
  mount(
    h(
      MemoryRouter,
      { initialEntries: [url] },
      h(Routes, null, h(Route, { path: "/fft/fft", element: h(FftPage) })),
      h(Spy),
    ),
  );
const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const playing = (el: HTMLElement) =>
  el.querySelector(".ctl-play")!.getAttribute("aria-label") === "Pozastavit";
const op = (el: HTMLElement) => el.querySelector(".viz-op")?.textContent ?? "";
const row = (el: HTMLElement, key: string) =>
  [...el.querySelectorAll(`.fft-table tr[data-row="${key}"] td`)].map(
    (td) => td.textContent,
  );
const col = (el: HTMLElement, key: string) =>
  [...el.querySelectorAll(`.fft-table td[data-col="${key}"]`)].map(
    (td) => td.textContent,
  );
const codeLines = (el: HTMLElement) =>
  [...el.querySelectorAll(".viz-code .pc-text")].map(
    (x) => x.textContent ?? "",
  );

describe("FFT – stránka", () => {
  it("výchozí příklad: nadpis, kružnice s 8 body ωᵏ, strom 15 volání, tabulka, krok 1 a stojí", async () => {
    const p = await open("/fft/fft");
    expect(p.el.querySelector("h1")?.textContent).toContain(
      "Rychlá Fourierova transformace (FFT)",
    );
    expect(p.el.querySelectorAll(".uc-point").length).toBe(8);
    expect(p.el.querySelectorAll(".mtree-node").length).toBe(15);
    expect(row(p.el, "p")).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
    expect(counter(p.el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(p.el)).toBe(false);
    expect(op(p.el)).toContain("FFT(0, 1, 2, 3, 4, 5, 6, 7)");
    expect(codeLines(p.el).join("\n")).toContain("FFT");
    await p.unmount();
  });

  it("odkaz ?p=1,0,1,0,1,0,1,0 – na konci y = (4, 0, 0, 0, 4, 0, 0, 0) (cvičení 17.3.2)", async () => {
    const p = await open("/fft/fft?p=1,0,1,0,1,0,1,0");
    expect(counter(p.el)).toMatch(/^krok 1 \//);
    await click(p.button("Na konec"));
    expect(row(p.el, "y")).toEqual(["4", "0", "0", "0", "4", "0", "0", "0"]);
    await p.unmount();
  });

  it("FFT(p) z nabídky: Enter v poli spustí, adresa nese vstup, přehrávač stojí na kroku 1", async () => {
    const p = await open("/fft/fft");
    await click(p.button("FFT(p)"));
    await type(p.input("p ="), "1, 2, 3, 4");
    await key(p.input("p ="), { key: "Enter" });
    expect(op(p.el)).toContain("FFT(1, 2, 3, 4)");
    expect(search).toContain("p=1,2,3,4");
    expect(p.el.querySelectorAll(".uc-point").length).toBe(4);
    expect(counter(p.el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(p.el)).toBe(false);
    await p.unmount();
  });

  it("Násobení P · Q (123 × 456 z knihy): tabulka násobení, na konci R = 18, 27, 28, 13, 4 a 56088", async () => {
    const p = await open("/fft/fft");
    await click(p.button("Příklady z knihy"));
    await click(p.button("123 × 456"));
    expect(op(p.el)).toContain("17.5.2");
    expect(p.el.querySelector(".fft-table.mul")).not.toBeNull();
    expect(playing(p.el)).toBe(false);
    await click(p.button("Na konec"));
    expect(col(p.el, "R").slice(0, 5)).toEqual(["18", "27", "28", "13", "4"]);
    expect(p.el.textContent).toContain("56088");
    await p.unmount();
  });

  it("násobení s kroky FFT: vnořená FFT přepne pseudokód na Algoritmus FFT a číslo kroku se nemění", async () => {
    const p = await open("/fft/fft?op=mul&p=1,1&q=1,1&d=bf");
    expect(codeLines(p.el)[0]).toContain("NásobeníPolynomů");
    // krokovat, dokud se neobjeví vnořená FFT
    for (
      let i = 0;
      i < 8 && !codeLines(p.el)[0].startsWith("Algoritmus FFT");
      i++
    )
      await click(p.button("Krok vpřed"));
    expect(codeLines(p.el)[0]).toContain("Algoritmus FFT");
    const n = counter(p.el);
    expect(
      p.el.querySelector(".viz-code .pc-line.active")?.textContent,
    ).toContain("FFT");
    expect(counter(p.el)).toBe(n);
    expect(p.el.querySelector(".fft-crumb")?.textContent).toContain(
      "NásobeníPolynomů",
    );
    await p.unmount();
  });

  it("ℤ₁₇ z nabídky FFT(p): ω = 2 pro n = 8, výsledek (11, 8, 14, 6, 13, 3, 12, 1)", async () => {
    const p = await open("/fft/fft?p=0,1,2,3,4,5,6,7&f=z17");
    await click(p.button("Na konec"));
    expect(row(p.el, "y")).toEqual([
      "11",
      "8",
      "14",
      "6",
      "13",
      "3",
      "12",
      "1",
    ]);
    expect(p.el.textContent).toContain("ℤ₁₇");
    await p.unmount();
  });
});

describe("FFT – klik na volání ve stromu vyplní argument", () => {
  it("klik na volání (p₀, p₂, p₄, p₆) otevře FFT(p) s jeho koeficienty; Enter je spustí (krok 1, stojí)", async () => {
    const p = await open("/fft/fft");
    const nodes = [
      ...p.el.querySelectorAll<SVGGElement>(
        ".fft-calltree .mtree-node[role=button]",
      ),
    ];
    expect(nodes.length).toBe(15);
    const even = nodes.find(
      (n) =>
        n.getAttribute("aria-label") === "Volání FFT(p₀, p₂, p₄, p₆) – vybrat",
    )!;
    expect(even).toBeDefined();
    await click(even);
    expect(p.input("p =").value).toBe("0, 2, 4, 6");
    await key(p.input("p ="), { key: "Enter" });
    expect(search).toContain("p=0,2,4,6");
    expect(counter(p.el)).toMatch(/^krok 1 \//);
    expect(playing(p.el)).toBe(false);
    await p.unmount();
  });
});
