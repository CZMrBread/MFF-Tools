// @vitest-environment jsdom
/*
 * Stránka Aho–Corasickové jako celek (jsdom): výchozí obr. 13.2 se senem barbara = jedna sada kroků
 * (stavba, pak hledání), pseudokód podle fáze kroku, strom a tabulka stavů, odkaz ?j=&s=, Enter
 * v poli spustí běh (stojí na kroku 1), klik na seno a na stav vyplní argument, přidat/odebrat slovo,
 * odkaz do KMP u jediné jehly, legenda jen se značkami z CSS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, key, mount, type, type Mounted } from "../../core/domTest";
import { moduleByPath } from "../../registry";
import { AhoCorasickPage } from "./AhoCorasickPage";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const op = (el: HTMLElement) => el.querySelector(".viz-op")?.textContent ?? "";
const msg = (el: HTMLElement) =>
  el.querySelector(".viz-message")?.textContent ?? "";
const code = (el: HTMLElement) =>
  el.querySelector(".viz-code .pseudocode")?.textContent ?? "";
const playing = (el: HTMLElement) =>
  el.querySelector(".ctl-play")?.getAttribute("aria-label") === "Pozastavit";
const rows = (el: HTMLElement) =>
  [...el.querySelectorAll(".ac-table tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td, th")].map((c) => c.textContent).join(" | "),
  );

describe("Aho–Corasicková – stránka", () => {
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
        h(
          Routes,
          null,
          h(Route, {
            path: "/string/aho-corasick",
            element: h(AhoCorasickPage),
          }),
        ),
        h(Spy),
      ),
    );

  it("nadpis z registru, výchozí obr. 13.2 / barbara stojí na kroku 1 se stavbou; na konci 4 výskyty", async () => {
    page = await open("/string/aho-corasick");
    const el = page.el;
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/string/aho-corasick")!.title,
    );
    expect(op(el)).toContain("Obr. 13.2 (str. 326)");
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    expect(code(el)).toContain("AcKonstrukce");
    // krok 1: jen kořen
    expect(el.querySelectorAll(".automaton-svg .au-node")).toHaveLength(1);
    await click(page.button("Na konec"));
    expect(code(el)).toContain("AcHledej");
    expect(el.querySelectorAll(".automaton-svg .au-node")).toHaveLength(15);
    expect(el.querySelectorAll(".automaton-svg .au-short")).toHaveLength(4);
    expect(msg(el)).toContain("4 výskyty");
    expect(el.querySelectorAll(".strip-bracket")).toHaveLength(4);
    expect(rows(el)).toContain("8 | bara | ara | ara | –");
    expect(rows(el)).toContain("14 | barbara | bara | ara | barbara");
    expect(el.querySelector(".ac-line")?.textContent).toContain(
      "(0, bar) (3, bar) (0, barbara) (4, ara)",
    );
  });

  it("odkaz ?j=…&s=bara; Enter v poli σ akce Hledat(S) spustí hledání (krok 1, pozastaveno)", async () => {
    page = await open(
      "/string/aho-corasick?j=ara,bar,arab,baraba,barbara&s=bara",
    );
    const el = page.el;
    expect(op(el)).toContain("str. 325–326");
    await click(page.button("Hledat(S)"));
    expect(page.input("σ =").value).toBe("bara");
    await type(page.input("σ ="), "barbarabaraba");
    await key(page.input("σ ="), { key: "Enter" });
    expect(op(el)).toContain("AcHledej");
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    expect(search).toContain("s=barbarabaraba");
    await click(page.button("Na konec"));
    expect(msg(el)).toContain("10 výskytů");
  });

  it("Postavit automat(slovník): jen konstrukce – pseudokód AcKonstrukce i na posledním kroku", async () => {
    page = await open("/string/aho-corasick");
    await click(page.button("Postavit automat(slovník)"));
    await type(page.input("slova ="), "he, she, his, hers");
    await key(page.input("slova ="), { key: "Enter" });
    expect(op(page.el)).toContain("AcKonstrukce: he, she, his, hers");
    await click(page.button("Na konec"));
    expect(code(page.el)).toContain("AcKonstrukce");
    expect(msg(page.el)).toMatch(/10 stavů/u);
    expect(search).toContain("j=he,she,his,hers");
  });

  it("Příklady z knihy: cvičení 2 dvěma kliky; Přidat a Odebrat slovo", async () => {
    page = await open("/string/aho-corasick");
    await click(page.button("Příklady z knihy"));
    await click(page.button("a, aa, aaa v aaaa"));
    expect(op(page.el)).toContain("cvičení 2, str. 329");
    expect(counter(page.el)).toMatch(/^krok 1 \/ \d+$/);
    await click(page.button("Přidat slovo(ι)"));
    await type(page.input("ι ="), "aaaa");
    await key(page.input("ι ="), { key: "Enter" });
    expect(search).toContain("j=a,aa,aaa,aaaa");
    await click(page.button("Na konec"));
    expect(msg(page.el)).toContain("10 výskytů");
  });

  it("Přidat slovo a ↶ Vrátit operaci vrátí slovník i odkaz; Výchozí příklad pod akcemi; přehrávač stojí (CROSS-05)", async () => {
    page = await open("/string/aho-corasick");
    await click(page.button("Přidat slovo(ι)"));
    await type(page.input("ι ="), "zz");
    await key(page.input("ι ="), { key: "Enter" });
    expect(search).toContain("zz");
    expect(page.el.querySelector(".viz-history")?.textContent).toContain(
      "Přidat slovo(zz)",
    );
    await click(page.button("↶ Vrátit operaci"));
    expect(search).not.toContain("zz");
    expect(op(page.el)).not.toContain("zz");
    expect(counter(page.el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(page.el)).toBe(false);
    await click(page.button("Příklady z knihy"));
    await click(page.button("a, aa, aaa v aaaa"));
    await click(page.button("Výchozí příklad"));
    expect(search).not.toContain("aaaa");
    expect(playing(page.el)).toBe(false);
  });

  it("klik na znak sena vyplní Přečti znak(x); klik na koncový stav vyplní Odebrat slovo", async () => {
    page = await open("/string/aho-corasick");
    await click(page.button("Na konec"));
    const cell = page.el.querySelector<SVGElement>(".strip-cell.pickable");
    expect(cell).not.toBeNull();
    await click(cell!);
    expect(page.input("x =").value).toMatch(/^\S$/u);
    const node = [
      ...page.el.querySelectorAll<SVGElement>(".au-node.pickable"),
    ].find((n) => n.querySelector("title")?.textContent?.endsWith("barbara"));
    expect(node).toBeDefined();
    await click(node!);
    expect(page.input("ι =").value).toBe("barbara");
  });

  it("s jedinou jehlou odkaz na stejný automat v KMP", async () => {
    page = await open("/string/aho-corasick?j=barbarossa&s=barbarbarossa");
    const a = page.el.querySelector<HTMLAnchorElement>("a.ac-to-kmp");
    expect(a).not.toBeNull();
    expect(a!.getAttribute("href")).toBe(
      "/string/kmp?j=barbarossa&s=barbarbarossa",
    );
  });

  it("Vlastní s duplicitní jehlou: ⚠ ve formuláři ještě před Enterem", async () => {
    page = await open("/string/aho-corasick");
    await click(page.button("Vytvořit"));
    const v = [
      ...page.el.querySelectorAll<HTMLButtonElement>(".am-variant"),
    ].find((b) => b.textContent?.trim() === "Vlastní")!;
    await click(v);
    await type(page.input("slova ="), "a, a, ab");
    const m = page.el.querySelector(".am-body .am-msg")!;
    expect(m.textContent).toBe("⚠ Duplicitní jehly vynechány.");
    await key(page.input("slova ="), { key: "Enter" });
    const n =
      (page.el.textContent ?? "").split("Duplicitní jehly vynechány.").length -
      1;
    expect(n).toBe(1);
  });

  it("legenda: každá třída sw-* existuje v index.css", async () => {
    page = await open("/string/aho-corasick");
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
