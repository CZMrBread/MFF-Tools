// @vitest-environment jsdom
/*
 * Stránka #/fft/net jako celek (jsdom): síť obr. 17.4, hodnoty na drátech, pseudokód FFT2, odkaz,
 * nabídka, klik na kroužek a přehrávač, který po každé nové sadě kroků stojí na kroku 1.
 */
import { createElement as h, useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { click, key, mount, type } from "../../core/domTest";
import { FftNetPage } from "./FftNetPage";

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
      h(Routes, null, h(Route, { path: "/fft/net", element: h(FftNetPage) })),
      h(Spy),
    ),
  );
const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const playing = (el: HTMLElement) =>
  el.querySelector(".ctl-play")!.getAttribute("aria-label") === "Pozastavit";
const op = (el: HTMLElement) => el.querySelector(".viz-op")?.textContent ?? "";
const texts = (el: HTMLElement, sel: string) =>
  [...el.querySelectorAll(sel)].map((t) =>
    // bez <title> (plná přesnost ve vysvětlivce)
    [...t.childNodes]
      .filter((c) => c.nodeType === 3)
      .map((c) => c.textContent)
      .join(""),
  );
const lastCol = (el: HTMLElement, c: number) =>
  texts(el, `.bn-val[data-col="${c}"]`);
const activeLine = (el: HTMLElement) =>
  el.querySelector(".viz-code .pc-line.active")?.textContent ?? "";

describe("FFT2 – stránka", () => {
  it("ℤ₁₇ s hodnotami mimo 0–16: ⚠ ve formuláři „mod 17“ a po provedení zůstane", async () => {
    const p = await open("/fft/net?x=1,2,3,4&f=z17");
    await click(p.button("FFT2(x)"));
    await type(p.input("x ="), "20, 30, 40, 50");
    const m = p.el.querySelector(".am-body .am-msg")!;
    expect(m.textContent).toBe(
      "⚠ V ℤ₁₇ se počítá mod 17: 20 → 3, 30 → 13, 40 → 6, 50 → 16.",
    );
    await key(p.input("x ="), { key: "Enter" });
    expect(p.el.textContent).toContain("20 → 3");
    await p.unmount();
  });

  it("výchozí příklad: síť obr. 17.4 (24 kroužků, vstupy x₀, x₄, x₂, …), pseudokód FFT2, krok 1 a stojí", async () => {
    const p = await open("/fft/net");
    expect(p.el.querySelector("h1")?.textContent).toContain(
      "FFT jako hradlová síť (FFT2)",
    );
    expect(p.el.querySelectorAll(".bn-gate").length).toBe(24);
    expect(texts(p.el, ".bn-in")).toEqual([
      "x₀",
      "x₄",
      "x₂",
      "x₆",
      "x₁",
      "x₅",
      "x₃",
      "x₇",
    ]);
    expect(texts(p.el, '.bn-gate[data-layer="2"] text')).toEqual([
      "+0",
      "+1",
      "−0",
      "−1",
      "+0",
      "+1",
      "−0",
      "−1",
    ]);
    expect(counter(p.el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(p.el)).toBe(false);
    expect(op(p.el)).toContain("FFT2(0, 1, 2, 3, 4, 5, 6, 7)");
    expect(op(p.el)).toContain("Obr. 17.4");
    expect(p.el.querySelector(".viz-code")?.textContent).toContain(
      "bitového zrcadlení",
    );
    await p.unmount();
  });

  it("na konci: výstup y = F(0, …, 7) na posledním sloupci drátů, mezistav po b = 1 podle knihy", async () => {
    const p = await open("/fft/net");
    await click(p.button("Na konec"));
    expect(lastCol(p.el, 3)).toEqual([
      "28",
      "−4−9.66i",
      "−4−4i",
      "−4−1.66i",
      "−4",
      "−4+1.66i",
      "−4+4i",
      "−4+9.66i",
    ]);
    expect(lastCol(p.el, 0)).toEqual(["0", "4", "2", "6", "1", "5", "3", "7"]);
    expect(lastCol(p.el, 1)).toEqual([
      "4",
      "−4",
      "8",
      "−4",
      "6",
      "−4",
      "10",
      "−4",
    ]);
    expect(activeLine(p.el)).toContain("Výstup");
    await p.unmount();
  });

  it("odkaz ?x=1,0,1,0,1,0,1,0 (cv. 17.3.2) – stojí na kroku 1, na konci (4, 0, 0, 0, 4, 0, 0, 0)", async () => {
    const p = await open("/fft/net?x=1,0,1,0,1,0,1,0");
    expect(counter(p.el)).toMatch(/^krok 1 \//);
    await click(p.button("Na konec"));
    expect(lastCol(p.el, 3)).toEqual(["4", "0", "0", "0", "4", "0", "0", "0"]);
    await p.unmount();
  });

  it("ℤ₁₇ odkazem: výsledek (11, 8, 14, 6, 13, 3, 12, 1)", async () => {
    const p = await open("/fft/net?x=0,1,2,3,4,5,6,7&f=z17");
    await click(p.button("Na konec"));
    expect(lastCol(p.el, 3)).toEqual([
      "11",
      "8",
      "14",
      "6",
      "13",
      "3",
      "12",
      "1",
    ]);
    expect(op(p.el)).toContain("ℤ₁₇");
    await p.unmount();
  });

  it("FFT2(x) z nabídky: Enter spustí, n = 4 má 8 kroužků, adresa nese vstup, přehrávač stojí na kroku 1", async () => {
    const p = await open("/fft/net");
    await click(p.button("FFT2(x)"));
    await type(p.input("x ="), "1, 2, 3, 4");
    await key(p.input("x ="), { key: "Enter" });
    expect(op(p.el)).toContain("FFT2(1, 2, 3, 4)");
    expect(search).toContain("x=1,2,3,4");
    expect(p.el.querySelectorAll(".bn-gate").length).toBe(8);
    expect(counter(p.el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(p.el)).toBe(false);
    await p.unmount();
  });

  it("n = 16 odkazem: 4 vrstvy po 16 kroužcích", async () => {
    const p = await open("/fft/net?x=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15");
    expect(p.el.querySelectorAll(".bn-gate").length).toBe(64);
    expect(texts(p.el, ".bn-in").slice(0, 4)).toEqual([
      "x₀",
      "x₈",
      "x₄",
      "x₁₂",
    ]);
    await p.unmount();
  });

  it("klik na kroužek přeskočí na krok jeho motýlku (ř. 8), přehrávání se nespustí", async () => {
    const p = await open("/fft/net");
    const g = p.el.querySelector<SVGGElement>(
      '.bn-gate[data-layer="2"][data-row="3"]',
    )!;
    await click(g);
    expect(counter(p.el)).not.toMatch(/^krok 1 \//);
    expect(activeLine(p.el)).toContain("α · y");
    expect(g.classList.contains("is-hot")).toBe(true);
    expect(playing(p.el)).toBe(false);
    await p.unmount();
  });

  it("po vrstvách (příklad z knihy): 3 kroky ř. 8, vrstva má všech 8 kroužků aktivních", async () => {
    const p = await open("/fft/net");
    await click(p.button("Příklady z knihy"));
    await click(p.button("Obr. 17.4 po vrstvách"));
    expect(counter(p.el)).toMatch(/^krok 1 \//);
    expect(search).toContain("d=layer");
    for (let i = 0; i < 5; i++) await click(p.button("Krok vpřed"));
    expect(activeLine(p.el)).toContain("α · y");
    expect(p.el.querySelectorAll(".bn-gate.is-hot").length).toBe(8);
    await p.unmount();
  });
});
