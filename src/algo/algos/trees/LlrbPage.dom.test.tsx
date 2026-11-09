// @vitest-environment jsdom
/*
 * Stránka LLRB jako celek (jsdom): výchozí (2,3)-strom s červenými hranami, Insert(27) předvyplněný
 * a po Provést stojí na kroku 1, odkaz t= / v= / ab= = aktuální stav, varianta (2,4) zakáže mazání,
 * příklad z knihy předvyplní svou operaci, (2,3)-strom vedle, klik na vrchol vyplní x, Výchozí příklad.
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { click, mount, type, type Mounted } from "../../core/domTest";
import { moduleByPath } from "../../registry";
import { LlrbPage } from "./LlrbPage";
import { LLRB_DEFAULT_SPEC } from "./llrbPageModel";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const playing = (el: HTMLElement) =>
  el.querySelector(".ctl-play")?.getAttribute("aria-label") === "Pozastavit";
const code = (el: HTMLElement) =>
  el.querySelector(".viz-code .pseudocode")?.textContent ?? "";
const msg = (el: HTMLElement) =>
  el.querySelector(".viz-message")?.textContent ?? "";
const action = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>(".am-action")].find((b) =>
    b.textContent?.startsWith(label),
  )!;
const redEdges = (el: HTMLElement) =>
  el.querySelectorAll(".llrb-layout > .tree-wrap .tree-edge.e-red").length;
const labels = (el: HTMLElement) =>
  [...el.querySelectorAll(".llrb-layout > .tree-wrap .tree-node text")].map(
    (t) => t.textContent,
  );

describe("LLRB – stránka", () => {
  let search = "";
  function Spy() {
    search = decodeURIComponent(useLocation().search);
    return null;
  }
  const open = (url: string) =>
    mount(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(Routes, null, h(Route, { path: "/tree/llrb", element: h(LlrbPage) })),
        h(Spy),
      ),
    );

  it("nadpis z registru, výchozí (2,3)-strom se 4 červenými hranami, Insert(27) otevřený, stojí", async () => {
    page = await open("/tree/llrb");
    const el = page.el;
    expect(el.querySelector("h1")?.textContent).toBe(
      moduleByPath("/tree/llrb")!.title,
    );
    expect(redEdges(el)).toBe(4);
    expect(playing(el)).toBe(false);
    expect(code(el)).toContain("varianta (2,3)");
    expect(page.input("x =").value).toBe("27");
    expect(search).toBe("");

    await click(page.button("Provést"));
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    await click(page.button("Na konec"));
    expect(msg(el)).toMatch(/3 rotace, 1 přebarvení/);
    expect(labels(el)).toContain("27");
    expect(search).toBe("?t=40,27,70,20r,30,60,90,10,25,50r,80r,5r");
  });

  it("odkaz t= a v=24: přesný strom, varianta (2,4), mazání zakázané s vysvětlením", async () => {
    page = await open("/tree/llrb?t=4,1r,6r,0,3,5,8,2r,7r,9r&v=24");
    const el = page.el;
    expect(redEdges(el)).toBe(5);
    expect(action(el, "Varianta").textContent).toBe("Varianta: (2,4)");
    const del = action(el, "Delete(x)");
    expect(del.getAttribute("aria-disabled")).toBe("true");
    expect(del.title).toMatch(/\(2,3\)/);
    expect(code(el)).toContain("Jsou-li ℓ(v) i r(v) červené");
  });

  it("přepnutí varianty: (2,4)-strom → (2,3) postaví strom znovu; jde vrátit", async () => {
    page = await open("/tree/llrb?t=4,1r,6r,0,3,5,8,2r,7r,9r&v=24");
    const el = page.el;
    await click(action(el, "Varianta"));
    await click(page.button("(2,3) – LlrbFixup, mazání"));
    expect(action(el, "Varianta").textContent).toBe("Varianta: (2,3)");
    expect(msg(el)).toMatch(/4-vrchol/);
    expect(search).not.toContain("v=24");
    expect(action(el, "Delete(x)").getAttribute("aria-disabled")).toBeNull();
    await click(page.button("↶ Vrátit operaci"));
    expect(action(el, "Varianta").textContent).toBe("Varianta: (2,4)");
    expect(search).toContain("v=24");
  });

  it("příklad z knihy (str. 211): strom z obrázku, DeleteMin předvyplněný, po Provést krok 1", async () => {
    page = await open("/tree/llrb");
    const el = page.el;
    await click(action(el, "Vytvořit"));
    await click(page.button("Příklady z knihy"));
    await type(page.input("Obrázek"), "str-211-pujcka");
    await click(page.button("Postavit"));
    expect(msg(el)).toMatch(/s\. 211/);
    expect(search).toBe("?t=2,1,4,3r");
    const go = el.querySelector<HTMLButtonElement>(".am-go")!;
    expect(go.title).toMatch(/DeleteMin/);
    await click(go);
    expect(counter(el)).toMatch(/^krok 1 \/ \d+$/);
    expect(playing(el)).toBe(false);
    expect(code(el)).toContain("MoveRedLeft");
    await click(page.button("Na konec"));
    expect(labels(el).sort()).toEqual(["2", "3", "4"]);
  });

  it("obr. 8.11 (překlad (2,4)-stromu): otevře se s (2,4)-stromem vedle jako v knize (UX-16)", async () => {
    page = await open("/tree/llrb");
    const el = page.el;
    await click(action(el, "Vytvořit"));
    await click(page.button("Příklady z knihy"));
    await type(page.input("Obrázek"), "obr-8-11");
    await click(page.button("Postavit"));
    expect(page.input("(2,4)-strom vedle").checked).toBe(true);
    expect(el.querySelectorAll(".mtree-node").length).toBeGreaterThan(0);
    expect(search).toContain("ab=1");
  });

  it("(2,3)-strom vedle: ostrůvky jako vrcholy (a,b)-stromu, ab=1 v odkazu", async () => {
    page = await open("/tree/llrb");
    const el = page.el;
    await click(page.input("(2,3)-strom vedle"));
    const keys = [...el.querySelectorAll(".llrb-ab .mtree-node")].map((n) =>
      [...n.querySelectorAll("text")].map((t) => t.textContent).join(" "),
    );
    expect(keys).toHaveLength(7);
    expect(keys).toContain("25 30");
    expect(search).toContain("ab=1");
  });

  it("klik na vrchol vyplní x otevřené operace; Výchozí příklad vrátí strom i odkaz", async () => {
    page = await open("/tree/llrb");
    const el = page.el;
    const node = el.querySelector<SVGGElement>(
      '.llrb-layout .tree-node[aria-label^="Vrchol 30"]',
    )!;
    await act(async () => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(page.input("x =").value).toBe("30");
    await click(action(el, "DeleteMax"));
    expect(search).toContain("t=");
    await click(page.button("Výchozí příklad"));
    expect(search).toBe("");
    expect(redEdges(el)).toBe(4);
    expect(LLRB_DEFAULT_SPEC).toContain("25r");
  });

  it("odkaz ?v=99 se při otevření nepřepíše; stránka řekne, že varianta neexistuje (UX-09)", async () => {
    page = await open("/tree/llrb?v=99");
    expect(search).toBe("?v=99");
    expect(msg(page.el)).toMatch(/Varianta „99“ neexistuje/);
  });
});
