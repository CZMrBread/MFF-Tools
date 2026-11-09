// @vitest-environment jsdom
/*
 * Toky po ověření oprav editoru (8.–9. 11. 2026, nálezy X-01…X-08):
 * - síť párování vyplní panel (fitAspect) a husté kresby zmenší kroužky (dense) – X-01, X-03, X-04;
 * - kresba výšek párování se vejde do šířky panelu (X-02);
 * - „↶ Vrátit operaci“ v editoru nejdřív zahodí sezení úprav, načtený příklad zůstane (X-05, jako G-08);
 * - fokus po vstupu do editoru z „jen rezervy / výšky“ a po Hotovo nepadá na <body> (X-06).
 */
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { click, mount, type, type Mounted } from "../../core/domTest";
import { DinicPage } from "./DinicPage";
import { FordFulkersonPage } from "./FordFulkersonPage";
import { GoldbergPage } from "./GoldbergPage";
import { flowPresetById } from "./flowPresets";
import { exampleInput, netOf } from "./flowPageModel";
import { heightLayout } from "./goldbergView";
import { materialize } from "../../core/steps";
import { GraphView } from "../../views/GraphView";
import { dinic } from "./dinic";
import { residualArcs } from "./flowNet";
import {
  layeredFitAspect,
  layeredView,
  MATCH_FIT_ASPECT,
  netState,
} from "./flowView";

let page: Mounted | null = null;
const cleanups: (() => void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) c();
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

const circles = (root: Element) =>
  [...root.querySelectorAll<SVGGElement>("g.graph-node")].map((g) => {
    const t = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(g.style.transform)!;
    const c = g.querySelector("circle:not(.node-hit)")!;
    return { x: +t[1], y: +t[2], r: +c.getAttribute("r")! };
  });
const minGap = (cs: { x: number; y: number; r: number }[]) => {
  let g = Infinity;
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++)
      g = Math.min(
        g,
        Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y) - cs[i].r - cs[j].r,
      );
  return g;
};
const viewRadio = (el: HTMLElement, name: string, value: string) =>
  el.querySelector<HTMLInputElement>(
    `input[name="${name}"][value="${value}"]`,
  )!;
const history = (el: HTMLElement) =>
  el.querySelector(".viz-history-items")?.textContent ?? "";
const textarea = (el: HTMLElement) =>
  el.querySelector<HTMLTextAreaElement>(".flow-panel-net textarea")!;

const MODULES = [
  { path: "/flow/ford-fulkerson", radio: "flow-view-ff", only: "rezervy" },
  { path: "/flow/dinic", radio: "flow-view-dinic", only: "rezervy" },
  { path: "/flow/goldberg", radio: "gb-view-goldberg", only: "vysky" },
] as const;

describe("síť párování vyplní panel (R2, X-03)", () => {
  const net = netOf(exampleInput(flowPresetById("obr-14-6")!));
  // rozměry panelů v prohlížeči při 1280 × 720: „jen síť“ 598 × 219, „obě“ 292 × 247
  it.each([
    [598, 219],
    [292, 247],
  ])(
    "obr. 14.6 v panelu %i × %i px: řádky partity mají rozestup ≥ 2r + 10 px, sloupce využijí šířku",
    async (w, hh) => {
      page = await mount(
        h(GraphView, {
          graph: net.graph,
          state: netState(net, undefined),
          width: w,
          height: hh,
          dense: true,
          fitAspect: MATCH_FIT_ASPECT,
        }),
      );
      const cs = circles(page.el);
      const left = cs.slice(1, 6).map((c) => c.y);
      for (let i = 1; i < left.length; i++)
        expect(left[i] - left[i - 1]).toBeGreaterThanOrEqual(
          2 * cs[1].r + 10 - 0.5,
        );
      const xs = cs.map((c) => c.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(w * 0.6);
    },
  );

  it.each(MODULES)(
    "$path?ex=obr-14-6: rozložení má třídu flow-match",
    async ({ path }) => {
      const p = await open(`${path}?ex=obr-14-6`);
      expect(
        p.el.querySelector(".flow-layout")!.classList.contains("flow-match"),
      ).toBe(true);
    },
  );
});

describe("Dinic – vrstevnatá síť párování na konci běhu (X-04)", () => {
  it.each([
    [292, 263],
    [323, 300],
  ])(
    "obr. 14.6, konec běhu, panel %i × %i px: kroužky se nepřekrývají",
    async (w, hh) => {
      const net = netOf(exampleInput(flowPresetById("obr-14-6")!));
      const steps = materialize(dinic(net));
      const lay = layeredView(
        net,
        steps[steps.length - 1].state,
        residualArcs(net.graph),
      );
      page = await mount(
        h(GraphView, {
          graph: lay.graph,
          state: lay.state,
          groups: lay.groups,
          width: w,
          height: hh,
          dense: true,
          fitAspect: layeredFitAspect(lay.graph.aspect!),
        }),
      );
      expect(minGap(circles(page.el))).toBeGreaterThanOrEqual(4);
    },
  );
});

describe("Goldberg – kresba výšek párování se vejde do šířky panelu (X-02)", () => {
  const net = netOf(exampleInput(flowPresetById("obr-14-6")!));
  it.each([380, 358, 332])(
    "obr. 14.6 (12 vrcholů) v panelu %i px: bez vodorovného posunu, kroužky se nepřekrývají",
    (w) => {
      const lay = heightLayout(net, 24, w, 320);
      expect(lay.width).toBeLessThanOrEqual(w);
      const xs = lay.columns.map((v) => lay.colX(v));
      for (let i = 1; i < xs.length; i++)
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(
          2 * lay.r + 1.5 - 1e-6,
        );
    },
  );
});

describe("Goldberg – kroužky kresby výšek co největší, co se do sloupce vejde", () => {
  const net = netOf(exampleInput(flowPresetById("obr-14-6")!));
  it("obr. 14.6 v panelu 350 px (1280 × 720, 3/5 šířky): průměr kroužku ≥ 22 px", () => {
    const lay = heightLayout(net, 24, 350, 280);
    expect(lay.width).toBeLessThanOrEqual(350);
    expect(2 * lay.r).toBeGreaterThanOrEqual(22);
  });
});

describe("↶ Vrátit operaci v editoru toků nejdřív zahodí sezení úprav (X-05)", () => {
  it.each([
    { path: "/flow/ford-fulkerson", ex: "Obr. 14.4" },
    { path: "/flow/dinic", ex: "Obr. 14.3" },
    { path: "/flow/goldberg", ex: "Obr. 14.3" },
  ])("$path: příklad $ex zůstane v historii i v síti", async ({ path, ex }) => {
    const p = await open(path);
    const action = [
      ...p.el.querySelectorAll<HTMLButtonElement>(".am-action"),
    ].find((x) => x.textContent?.trim().startsWith("Příklady z knihy"))!;
    await click(action);
    const item = [
      ...p.el.querySelectorAll<HTMLButtonElement>(".am-variants button"),
    ].find((b) => b.textContent?.trim().startsWith(ex));
    expect(item, `položka ${ex}`).toBeTruthy();
    await click(item!);
    expect(history(p.el)).toContain(ex);
    const edges = () =>
      p.el.querySelectorAll(".flow-panel-net .graph-edge").length;
    const before = edges();
    await click(p.button("Upravit graf"));
    await type(textarea(p.el), `${textarea(p.el).value}\nz s 3`);
    await click(p.button("Použít text"));
    expect(edges()).toBe(before + 1);
    await click(p.button("↶ Vrátit operaci"));
    expect(edges()).toBe(before);
    expect(history(p.el)).toContain(ex);
    expect(p.el.querySelector(".graph-editor.is-editing")).not.toBeNull();
  });
});

describe("fokus po editoru z „jen rezervy / výšky“ (X-06)", () => {
  it.each(MODULES)(
    "$path: Upravit síť → fokus v editoru sítě; Hotovo → fokus na Upravit síť",
    async ({ path, radio, only }) => {
      const p = await open(path);
      await click(viewRadio(p.el, radio, only));
      const enter = p.el.querySelector<HTMLButtonElement>(".flow-edit-net")!;
      enter.focus();
      await click(enter);
      const a1 = document.activeElement as HTMLElement | null;
      expect(a1 && a1 !== document.body).toBe(true);
      expect(a1!.closest(".flow-panel-net")).not.toBeNull();
      const done = p.button("Hotovo");
      done.focus();
      await click(done);
      const a2 = document.activeElement as HTMLElement | null;
      expect(a2?.classList.contains("flow-edit-net")).toBe(true);
    },
  );
});

describe("Goldberg – hustá síť se mezi kroky ani při vstupu do editoru nepřeměří (popisky h a přebytků)", () => {
  it("viewBox sítě je na kroku 1, po krocích i v editoru stejný", async () => {
    const p = await open("/flow/goldberg?ex=obr-14-2");
    const vb = () =>
      p.el
        .querySelector(".flow-panel-net svg.graph-svg")!
        .getAttribute("viewBox");
    const first = vb();
    const seen = new Set([first]);
    for (let i = 0; i < 12; i++) {
      await click(p.button("Krok vpřed"));
      seen.add(vb());
    }
    await click(p.button("Upravit graf"));
    seen.add(vb());
    expect([...seen]).toEqual([first]);
  });
});

describe("telefon: široká síť (obr. 14.7) v editoru i v běhu bez vodorovného posunu (X-09)", () => {
  it.each([
    "/flow/ford-fulkerson?ex=obr-14-7",
    "/flow/dinic?ex=obr-14-7",
    "/flow/goldberg?ex=obr-14-7",
  ])("%s: kresby nejsou širší než panel telefonu (332 px)", async (url) => {
    // telefon: každý obal měří 332 px (jsdom jinak vrací náhradní šířku 900)
    const desc = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "clientWidth",
    );
    Object.defineProperty(Element.prototype, "clientWidth", {
      configurable: true,
      get: () => 332,
    });
    cleanups.push(() => {
      if (desc) Object.defineProperty(Element.prototype, "clientWidth", desc);
    });
    const p = await open(url);
    const kresba = p.el.querySelector<HTMLInputElement>(
      'fieldset input[value="obe"]',
    )!;
    await click(kresba);
    await click(p.button("Upravit graf"));
    for (const svg of p.el.querySelectorAll(".flow-layout svg.graph-svg"))
      expect(Number(svg.getAttribute("width"))).toBeLessThanOrEqual(332);
  });
});
