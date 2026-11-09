// @vitest-environment jsdom
/*
 * Toky – přesun vrcholu nesmí přepočítat velikost kresby (chyba vlastníka 8. 11. 2026: „v tocích během
 * přesouvání bodů se graf resizuje a graf potom je miniaturní“). Na úzkém okně (jsdom: bez matchMedia =
 * stránka se posouvá) má široká knižní kresba čitelnou šířku podle rozložení sítě při načtení – přisunutí
 * vrcholu k jinému ji nesmí nafouknout (předtím až na tisíce px, celá kresba se pak zmenšila).
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { readableSearch } from "../../core/linkParams";
import { key, mount, type Mounted } from "../../core/domTest";
import {
  defaultSettings,
  exampleInput,
  flowParams,
  type FlowKind,
} from "./flowPageModel";
import { flowPresetById } from "./flowPresets";
import { goldbergParams } from "./goldbergPageModel";
import { DinicPage } from "./DinicPage";
import { FordFulkersonPage } from "./FordFulkersonPage";
import { GoldbergPage } from "./GoldbergPage";

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

const netSvg = (el: HTMLElement) =>
  el.querySelector<SVGSVGElement>(".flow-panel-net svg.graph-svg")!;
const vertex = (el: HTMLElement, label: string) =>
  [...netSvg(el).querySelectorAll<SVGGElement>("g.graph-node")].find((g) =>
    (g.getAttribute("aria-label") ?? "").startsWith(`Vrchol ${label}`),
  )!;

describe("toky – přesun vrcholu nemění velikost kresby", () => {
  it.each([
    ["/flow/ford-fulkerson?ex=obr-14-2", "a", "ArrowDown"],
    ["/flow/dinic?ex=obr-14-2&k=sit", "a", "ArrowDown"],
    // V-2: Goldberg počítal čitelnou šířku z poloh při každém vykreslení (telefon: 332 → až 1200 px)
    ["/flow/goldberg?ex=obr-14-2", "a", "ArrowDown"],
    ["/flow/goldberg?ex=obr-14-7", "c", "ArrowRight"],
  ])(
    "%s: vrchol %s přisunutý Shift+šipkami těsně k sousedovi – šířka plátna sítě beze změny",
    async (url, label, arrow) => {
      const el = (await open(url)).el;
      const w0 = netSvg(el).getAttribute("width");
      expect(w0).not.toBeNull();
      for (let i = 0; i < 49; i++)
        await key(vertex(el, label), { key: arrow, shiftKey: true });
      expect(netSvg(el).getAttribute("width")).toBe(w0);
    },
  );
});

describe("toky – odkaz s posunutým vrcholem (xy=) má stejnou šířku plátna jako příklad (V-7)", () => {
  const movedUrl = (path: string, kind: FlowKind | "goldberg", ex: string) => {
    const p = flowPresetById(ex)!;
    const input = exampleInput(p);
    const g = input.graph;
    // vrchol 1 těsně k vrcholu 2
    const graph = {
      ...g,
      nodes: g.nodes.map((n, i) =>
        i === 1 ? { ...n, x: g.nodes[2].x + 0.01, y: g.nodes[2].y } : n,
      ),
    };
    const q =
      kind === "goldberg"
        ? goldbergParams({ ...input, graph }, "zakladni")
        : flowParams(kind, { ...input, graph }, defaultSettings(p));
    expect(q.xy).toBeDefined();
    return `${path}${readableSearch(q)}`;
  };
  it.each([
    ["/flow/ford-fulkerson", "ff", "obr-14-2", ""],
    ["/flow/dinic", "dinic", "obr-14-2", "&k=sit"],
    ["/flow/goldberg", "goldberg", "obr-14-2", ""],
  ] as const)("%s", async (path, kind, ex, extra) => {
    const plain = (await open(`${path}?ex=${ex}${extra}`)).el;
    const w0 = netSvg(plain).getAttribute("width");
    await page?.unmount();
    page = null;
    const url = movedUrl(path, kind, ex) + extra;
    const el = (await open(url)).el;
    expect(netSvg(el).getAttribute("width")).toBe(w0);
  });
});
