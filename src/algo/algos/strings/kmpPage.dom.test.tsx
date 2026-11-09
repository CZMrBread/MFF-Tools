// @vitest-environment jsdom
/*
 * Stránka KMP jako celek (jsdom): výchozí příklad z knihy = jedna sada kroků (stavba automatu, pak
 * hledání), pseudokód podle fáze kroku, automat a tabulka Z, odkaz ?j=&s=, Enter v poli spustí běh
 * (stojí na kroku 1), klik na seno vyplní argument „Přečti znak(x)“, legenda jen se značkami z CSS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, key, mount, type, type Mounted } from "../../core/domTest";
import { moduleByPath } from "../../registry";
import { KmpPage } from "./KmpPage";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const op = (el: HTMLElement) => el.querySelector(".viz-op")?.textContent ?? "";
const code = (el: HTMLElement) =>
  el.querySelector(".viz-code .pseudocode")?.textContent ?? "";
const playing = (el: HTMLElement) =>
  el.querySelector(".ctl-play")?.getAttribute("aria-label") === "Pozastavit";
const zRow = (el: HTMLElement) =>
  [...el.querySelectorAll(".kmp-table tr.kmp-z td")].map(
    (td) => td.textContent,
  );

describe("KMP – stránka", () => {
  let search = "";
  function Spy() {
    search = useLocation().search;
    return null;
  }
  const open = (url: string) =>
    mount(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(Routes, null, h(Route, { path: "/string/kmp", element: h(KmpPage) })),
        h(Spy),
      ),
    );
  it("nadpis z registru, výchozí příklad kokos (str. 320–321) stojí na kroku 1 se stavbou automatu", async () => {
    page = await open("/string/kmp");
    const el = page.el;
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/string/kmp")!.title,
    );
    expect(op(el)).toContain("ι = „kokos“, σ = „clanekokokosu“ – str. 320–321");
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    expect(code(el)).toContain("KmpKonstrukce");
    // automat: 6 stavů (ε … kokos), pás textu, tabulka Z v posouvacím obalu
    expect(el.querySelectorAll(".automaton-svg .au-node")).toHaveLength(6);
    expect(el.querySelector(".strip-svg")).not.toBeNull();
    expect(el.querySelector(".table-scroll .kmp-table")).not.toBeNull();
    // na konci: hledání, výskyt na pozici 7, Z = [–, 0, 0, 1, 2, 0]
    await click(page.button("Na konec"));
    expect(code(el)).toContain("KmpHledej");
    expect(zRow(el)).toEqual(["–", "0", "0", "1", "2", "0"]);
    expect(el.querySelector(".viz-message")?.textContent).toContain(
      "1 výskyt (7)",
    );
    expect(el.querySelectorAll(".strip-bracket")).toHaveLength(1);
  });

  it("odkaz ?j=ana&s=bananas; Enter v poli σ akce Hledat(σ) spustí hledání (krok 1, pozastaveno), na konci 2 výskyty", async () => {
    page = await open("/string/kmp?j=ana&s=bananas");
    const el = page.el;
    expect(op(el)).toContain("str. 319");
    await click(page.button("Hledat(σ)"));
    expect(page.input("σ =").value).toBe("bananas");
    await type(page.input("σ ="), "banananas");
    await key(page.input("σ ="), { key: "Enter" });
    expect(op(el)).toContain("KmpHledej: ι = „ana“, σ = „banananas“");
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    expect(search).toContain("s=banananas");
    expect(search).toContain("j=ana");
    await click(page.button("Na konec"));
    expect(el.querySelector(".viz-message")?.textContent).toContain(
      "3 výskyty (1, 3, 5)",
    );
    expect(zRow(el)).toEqual(["–", "0", "0", "1"]);
  });

  it("Postavit automat(ι): jen konstrukce – pseudokód KmpKonstrukce i na posledním kroku", async () => {
    page = await open("/string/kmp");
    await click(page.button("Postavit automat(ι)"));
    await type(page.input("ι ="), "barbarossa");
    await key(page.input("ι ="), { key: "Enter" });
    expect(op(page.el)).toContain("KmpKonstrukce: ι = „barbarossa“");
    await click(page.button("Na konec"));
    expect(code(page.el)).toContain("KmpKonstrukce");
    expect(zRow(page.el)).toEqual([
      "–",
      "0",
      "0",
      "0",
      "1",
      "2",
      "3",
      "0",
      "0",
      "0",
      "0",
    ]);
  });

  it("Příklady z knihy: barbarossa (obr. 13.1) dvěma kliky", async () => {
    page = await open("/string/kmp");
    await click(page.button("Příklady z knihy"));
    await click(page.button("barbarossa (obr. 13.1)"));
    expect(op(page.el)).toContain("Obr. 13.1 (str. 321)");
    expect(counter(page.el)).toMatch(/^krok 1 \/ \d+$/);
    expect(search).toContain("j=barbarossa");
  });

  it("klik na znak sena vyplní argument akce Přečti znak(x) a otevře ji", async () => {
    page = await open("/string/kmp");
    await click(page.button("Na konec"));
    const cell = page.el.querySelector<SVGElement>(".strip-cell.pickable");
    expect(cell).not.toBeNull();
    await click(cell!);
    expect(page.input("x =").value).toMatch(/^\S$/);
  });

  it("odkaz na Aho-Corasickovou se stejnou jehlou a senem (AC zobecňuje KMP)", async () => {
    page = await open("/string/kmp?j=ana&s=bananas");
    const a = page.el.querySelector<HTMLAnchorElement>("a.kmp-to-ac");
    expect(a).not.toBeNull();
    expect(a!.getAttribute("href")).toBe(
      "/string/aho-corasick?j=ana&s=bananas",
    );
  });

  it("jehla s čárkou nebo středníkem: odkaz na AC chybí (AC by ji rozdělil na víc jehel)", async () => {
    page = await open("/string/kmp?j=a%2Cb&s=xa%2Cbx");
    expect(page.el.querySelector("a.kmp-to-ac")).toBeNull();
    expect(page.el.textContent).toMatch(/čárk/);
  });

  it("Vlastní s mezerami: ⚠ ve formuláři ještě před Enterem; hláška na stránce jen jednou", async () => {
    page = await open("/string/kmp");
    await click(page.button("Vytvořit"));
    await click(
      [...page.el.querySelectorAll<HTMLButtonElement>(".am-variant")].find(
        (b) => b.textContent?.trim() === "Vlastní",
      )!,
    );
    await type(page.input("σ ="), "a ko ko b");
    const m = page.el.querySelector(".am-body .am-msg")!;
    expect(m.textContent).toBe("⚠ Mezery ze sena vynechány.");
    expect(m.classList.contains("warn")).toBe(true);
    await key(page.input("σ ="), { key: "Enter" });
    const n =
      (page.el.textContent ?? "").split("Mezery ze sena vynechány.").length - 1;
    expect(n).toBe(1);
  });

  it("legenda: každá třída sw-* existuje v index.css", async () => {
    page = await open("/string/kmp");
    const css = readFileSync(
      resolve(process.cwd(), "src/algo/index.css"),
      "utf8",
    );
    const used = [...page.el.querySelectorAll(".legend .swatch")].flatMap((s) =>
      [...s.classList].filter((c) => c.startsWith("sw-")),
    );
    expect(used.length).toBeGreaterThan(3);
    for (const c of used)
      expect(css, c).toMatch(new RegExp(`\\.swatch\\.${c}\\b`));
  });
});
