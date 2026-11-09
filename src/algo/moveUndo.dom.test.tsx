// @vitest-environment jsdom
/*
 * V-4 (validace 8. 11. 2026): přesun vrcholu v režimu algoritmu (tah, Shift+šipky) i sezení v „Upravit
 * graf“, které jen přesouvalo, jde vrátit tlačítkem „↶ Vrátit operaci“ – grafy, toky i Goldberg. Vrácení
 * přesunu nespouští nový běh ani přehrávání (krok zůstane, pozastaveno).
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, key, mount, type Mounted } from "./core/domTest";
import { GraphPage } from "./algos/graphs/GraphPage";
import { DinicPage } from "./algos/flows/DinicPage";
import { FordFulkersonPage } from "./algos/flows/FordFulkersonPage";
import { GoldbergPage } from "./algos/flows/GoldbergPage";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

const open = async (url: string) => {
  page = await mount(
    h(
      MemoryRouter,
      { initialEntries: [url] },
      h(
        Routes,
        null,
        h(Route, { path: "/graph/:id", element: h(GraphPage) }),
        h(Route, {
          path: "/flow/ford-fulkerson",
          element: h(FordFulkersonPage),
        }),
        h(Route, { path: "/flow/dinic", element: h(DinicPage) }),
        h(Route, { path: "/flow/goldberg", element: h(GoldbergPage) }),
      ),
    ),
  );
  return page;
};

/** první vrchol hlavní kresby (síť / graf) */
const vertex = (el: HTMLElement) =>
  el.querySelector<SVGGElement>("svg.graph-svg g.graph-node")!;
const at = (el: HTMLElement) => vertex(el).style.transform;
const counter = (el: HTMLElement) =>
  el.querySelector(".step-counter")?.textContent ?? "";
const historyText = (el: HTMLElement) =>
  el.querySelector(".viz-history-items")?.textContent ?? "";

describe("↶ Vrátit operaci vrací přesun vrcholu (V-4)", () => {
  it.each([
    "/graph/dfs",
    "/flow/ford-fulkerson",
    "/flow/dinic?k=sit",
    "/flow/goldberg",
  ])(
    "%s: Shift+šipky = jedna položka „Přesun vrcholu“, vrácení bez nového běhu",
    async (url) => {
      const m = await open(url);
      const el = m.el;
      const undoBtn = () => m.button("↶ Vrátit operaci");
      expect(undoBtn().disabled).toBe(true);
      await click(m.button("Krok vpřed"));
      const step = counter(el);
      const p0 = at(el);
      for (let i = 0; i < 3; i++)
        await key(vertex(el), { key: "ArrowDown", shiftKey: true });
      expect(at(el)).not.toBe(p0);
      expect(undoBtn().disabled).toBe(false);
      expect(historyText(el)).toMatch(/Přesun vrcholu \S+$/);
      expect(historyText(el).match(/Přesun vrcholu/g)).toHaveLength(1);
      await click(undoBtn());
      expect(at(el)).toBe(p0);
      expect(undoBtn().disabled).toBe(true);
      // přesun nebyl nový běh – krok zůstal
      expect(counter(el)).toBe(step);
    },
  );

  it.each(["/graph/dfs", "/flow/ford-fulkerson", "/flow/goldberg"])(
    "%s: sezení „Upravit graf“, které jen přesouvalo, je položka historie",
    async (url) => {
      const m = await open(url);
      const el = m.el;
      const p0 = at(el);
      await click(m.button("Upravit graf"));
      await key(vertex(el), { key: "ArrowRight", shiftKey: true });
      await click(m.button("Hotovo"));
      expect(at(el)).not.toBe(p0);
      expect(m.button("↶ Vrátit operaci").disabled).toBe(false);
      await click(m.button("↶ Vrátit operaci"));
      expect(at(el)).toBe(p0);
    },
  );

  it("Ctrl+Z na kresbě v režimu algoritmu = ↶ Vrátit operaci", async () => {
    const m = await open("/flow/ford-fulkerson");
    const el = m.el;
    const p0 = at(el);
    await key(vertex(el), { key: "ArrowUp", shiftKey: true });
    expect(at(el)).not.toBe(p0);
    await key(vertex(el), { key: "z", ctrlKey: true });
    expect(at(el)).toBe(p0);
  });
});
