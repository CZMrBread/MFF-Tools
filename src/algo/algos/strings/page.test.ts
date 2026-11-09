// @vitest-environment jsdom
/*
 * Stránka sufixového pole jako celek.
 * - SSR (vždy): výchozí příklad, popisky, limity, tabulka v .table-scroll, legenda podle fáze, sdílený odkaz.
 * - jsdom (prostředí souboru, nikdy se nepřeskočí): nabídka operací – Enter v α = Postavit X, Enter v β =
 *   Hledat (obojí stojí na kroku 1), Kasai převezme změněné α, hledání po Kasai zachová sloupec L,
 *   příklad z přednášky L05 postaví slovo ze slidu.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { click, key, mount, type } from "../../core/domTest";
import { SuffixPage } from "./SuffixPage";
import { SATable } from "./SuffixViews";
import { suffixSteps } from "./suffix";
import { moduleByPath } from "../../registry";

const routes = () =>
  h(Routes, null, h(Route, { path: "/string/suffix", element: h(SuffixPage) }));
const ssr = (url: string) =>
  renderToStaticMarkup(h(MemoryRouter, { initialEntries: [url] }, routes()));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

describe("sufixové pole – SSR", () => {
  it("výchozí příklad banana z přednášky, nabídka operací, limity, posouvací tabulka a legenda stavby", () => {
    const html = ssr("/string/suffix");
    const t = text(html);
    for (const s of [
      "Postavit X(α)",
      "LCP pole (Kasai)",
      "Hledat(β)",
      "Vytvořit",
      "Příklady z knihy",
      "Výchozí příklad",
      "Zkuste:",
      "Kopírovat odkaz",
    ]) {
      expect(t, s).toContain(s);
    }
    // limity vstupu jsou ve vysvětlivce akce
    expect(html).toContain("nejvýše 24 znaků");
    expect(t).toContain(
      "Stavba X zdvojováním: α = „banana“ – Přednáška L05, slide 6 a 13",
    );
    expect(html).toContain('class="table-scroll"');
    expect(html).toContain('class="action-menu"');
    expect(html).not.toContain("<fieldset");
    // ve fázi stavby legenda neslibuje řádky, které se kreslí až při Kasai / hledání
    expect(t).toContain("právě počítaný sloupec Rₖ");
    expect(t).not.toContain("nalezený výskyt");
  });

  it("sdílený odkaz nastaví α (vyčištěné)", () => {
    const t = text(ssr("/string/suffix?a=missi%24ssippi&b=s%20si"));
    expect(t).toContain("Stavba X zdvojováním: α = „mississippi“");
    expect(t).not.toContain("Přednáška L05");
  });
});

/* ---------------------------------------------------------------- jsdom */

describe("sufixové pole v DOM (jsdom)", () => {
  let search = "";
  function Spy() {
    search = useLocation().search;
    return null;
  }
  const open = (url: string) =>
    mount(h(MemoryRouter, { initialEntries: [url] }, routes(), h(Spy)));
  const op = (el: HTMLElement) =>
    el.querySelector(".viz-op")?.textContent ?? "";
  const headers = (el: HTMLElement) =>
    [...el.querySelectorAll(".sa-table thead th")].map((th) => th.textContent);
  const playing = (el: HTMLElement) =>
    el.querySelector(".ctl-play")!.getAttribute("aria-label") === "Pozastavit";
  const enter = (i: HTMLElement) => key(i, { key: "Enter" });

  it("sdílený odkaz předvyplní pole α i β vyčištěnými hodnotami", async () => {
    const p = await open("/string/suffix?a=missi%24ssippi&b=s%20si");
    await click(p.button("Postavit X(α)"));
    expect(p.input("α =").value).toBe("mississippi");
    await click(p.button("Hledat(β)"));
    expect(p.input("β =").value).toBe("ssi");
    await p.unmount();
  });

  it("Postavit X(α): Enter postaví (krok 1, pozastaveno); Kasai převezme změněné α a řekne to", async () => {
    const p = await open("/string/suffix");
    await click(p.button("Postavit X(α)"));
    expect(p.input("α =").value).toBe("banana");
    await type(p.input("α ="), "abab");
    await click(p.button("LCP pole (Kasai)"));
    expect(op(p.el)).toContain("LCP pole (Kasai): α = „abab“");
    expect(p.el.textContent).toContain("postavili znovu pro „abab“");
    expect(playing(p.el)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    await type(p.input("α ="), "mississippi");
    await enter(p.input("α ="));
    expect(op(p.el)).toContain("Stavba X zdvojováním: α = „mississippi“");
    expect(search).toContain("a=mississippi");
    await p.unmount();
  });

  it("Hledat(β): Enter hledá; po Kasai zůstane sloupec L; prázdné β zablokuje Hledat", async () => {
    const p = await open("/string/suffix");
    await click(p.button("LCP pole (Kasai)"));
    await click(p.button("Hledat(β)"));
    expect(p.input("β =").value).toBe("ana");
    await type(p.input("β ="), "an");
    await enter(p.input("β ="));
    expect(op(p.el)).toContain("Hledání vzorku β = „an“");
    expect(playing(p.el)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(headers(p.el)).toContain("L[j]");
    expect(search).toContain("b=an");
    await type(p.input("β ="), " $ ");
    expect(p.button("Hledat β").getAttribute("aria-disabled")).toBe("true");
    expect(p.el.querySelector(".am-msg.error")!.textContent).toContain(
      "aspoň jeden znak",
    );
    await click(p.button("Výchozí příklad"));
    expect(p.input("β =").value).toBe("ana");
    expect(op(p.el)).toContain("Stavba X zdvojováním: α = „banana“");
    await click(p.button("Postavit X(α)"));
    expect(p.input("α =").value).toBe("banana");
    await p.unmount();
  });

  it("příklad z přednášky: barokoarokoko (slide 7) dvěma kliky postaví tabulku a uvede zdroj", async () => {
    const p = await open("/string/suffix");
    await click(p.button("Příklady z knihy"));
    await click(p.button("barokoarokoko / oko"));
    expect(op(p.el)).toContain(
      "Stavba X zdvojováním: α = „barokoarokoko“ – Přednáška L05, slide 7",
    );
    expect(playing(p.el)).toBe(false);
    expect(p.el.querySelector(".step-counter")?.textContent).toMatch(
      /^krok 1 \/ \d+$/,
    );
    expect(search).toContain("a=barokoarokoko");
    expect(search).toContain("b=oko");
    await click(p.button("Na konec"));
    // 13 znaků + sufix ε
    expect(p.el.querySelectorAll(".sa-table tbody tr")).toHaveLength(14);
    await click(p.button("Hledat(β)"));
    expect(p.input("β =").value).toBe("oko");
    await p.unmount();
  });
});

describe("nadpis (NEWMODS-13)", () => {
  it("H1 = title z registry", () => {
    const html = ssr("/string/suffix");
    const h1 = text(/<h1[^>]*>(.*?)<\/h1>/.exec(html)?.[1] ?? "");
    expect(h1).toBe(moduleByPath("/string/suffix")!.title);
  });
});

describe("tabulka sufixového pole na velkém plátně (NEWMODS-09)", () => {
  it("SATable se zoom zvětší písmo a vystředí se", () => {
    const html = renderToStaticMarkup(
      h(SATable, {
        st: suffixSteps("banana", { kind: "build" })[0].state,
        zoom: 1.5,
      }),
    );
    expect(html).toMatch(/font-size:1\.5em/);
    expect(html).toMatch(/margin(-inline)?:[^;"]*auto/);
  });
});
