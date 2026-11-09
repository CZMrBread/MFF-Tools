// @vitest-environment jsdom
/*
 * GraphView pro husté kresby toků (chyba vlastníka 8. 11. 2026, nálezy X-01, X-03, X-04, X-08):
 * - `dense`: menší okraje a kroužky zmenšené tak, aby se nepřekrývaly (široká síť obr. 14.7 pod sebou,
 *   vrstevnatá síť párování s dlouhým řetězem); bez `dense` kresba beze změny (R = 18).
 * - `fitAspect`: poměr stran kresby podle plátna v mezích (síť párování využije celou výšku i šířku panelu).
 * - `holdLayout`: druhá kresba v editoru drží měřítko jako síť (přesun vrcholu ji nepřeměří).
 */
import { createElement as h } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { emptyState, type Graph } from "../algos/graphs/graph";
import { mount, type Mounted } from "../core/domTest";
import { GraphView } from "./GraphView";

let m: Mounted | null = null;
afterEach(async () => {
  await m?.unmount();
  m = null;
});

/** 4 řádky × 6 sloupců, poměr stran 3,7 (jako vrstvy obr. 14.7) */
const WIDE: Graph = {
  directed: true,
  weighted: true,
  aspect: 3.7,
  nodes: Array.from({ length: 16 }, (_, i) => ({
    id: i,
    label: String.fromCharCode(97 + i),
    x: (i % 6) / 5,
    y: Math.floor(i / 6) / 3 + ((i % 2) * 1) / 3,
  })).map((n) => ({ ...n, y: Math.min(1, n.y) })),
  edges: [
    { id: 0, u: 0, v: 1, w: 3 },
    { id: 1, u: 1, v: 2, w: 5 },
  ],
};

/** síť párování z | L1…L5 | R1…R5 | s s poměrem stran 1,15 */
const MATCH: Graph = (() => {
  const nodes = [{ id: 0, label: "z", x: 0, y: 0.5 }];
  for (let i = 0; i < 5; i++)
    nodes.push({ id: nodes.length, label: `L${i + 1}`, x: 1 / 3, y: i / 4 });
  for (let i = 0; i < 5; i++)
    nodes.push({ id: nodes.length, label: `R${i + 1}`, x: 2 / 3, y: i / 4 });
  nodes.push({ id: nodes.length, label: "s", x: 1, y: 0.5 });
  return {
    directed: true,
    weighted: true,
    aspect: 1.15,
    nodes,
    edges: [{ id: 0, u: 1, v: 6, w: 1 }],
  };
})();

const circles = (el: HTMLElement) =>
  [...el.querySelectorAll<SVGGElement>("g.graph-node")].map((g) => {
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
const viewBox = (el: HTMLElement) =>
  el.querySelector("svg.graph-svg")!.getAttribute("viewBox");

describe("GraphView dense – hustá kresba toků (X-01, X-04)", () => {
  it("bez dense je kresba beze změny: poloměr 18", async () => {
    m = await mount(
      h(GraphView, {
        graph: WIDE,
        state: emptyState(),
        width: 600,
        height: 150,
      }),
    );
    expect(circles(m.el).every((c) => c.r === 18)).toBe(true);
  });

  it("dense v nízkém plátně (obr. 14.7 pod sebou při 1280 × 720): kroužky se zmenší a nepřekrývají, nejmenší d ≥ 22 px", async () => {
    m = await mount(
      h(GraphView, {
        graph: WIDE,
        state: emptyState(),
        width: 600,
        height: 130,
        dense: true,
      }),
    );
    const cs = circles(m.el);
    expect(cs[0].r).toBeLessThan(18);
    expect(cs[0].r * 2).toBeGreaterThanOrEqual(22);
    expect(minGap(cs)).toBeGreaterThanOrEqual(4);
  });

  it("dense ve velkém plátně: poloměr zůstane 18", async () => {
    m = await mount(
      h(GraphView, {
        graph: WIDE,
        state: emptyState(),
        width: 1200,
        height: 500,
        dense: true,
      }),
    );
    expect(circles(m.el).every((c) => c.r === 18)).toBe(true);
  });
});

describe("GraphView fitAspect – síť párování vyplní panel (X-03)", () => {
  it("v širokém nízkém panelu se sloupce roztáhnou do šířky a řádky mají ≥ 2r + 10 px", async () => {
    m = await mount(
      h(GraphView, {
        graph: MATCH,
        state: emptyState(),
        width: 600,
        height: 300,
        dense: true,
        fitAspect: [0.6, 3] as const,
      }),
    );
    const cs = circles(m.el);
    const xs = cs.map((c) => c.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(400);
    const l = cs.slice(1, 6).map((c) => c.y);
    for (let i = 1; i < l.length; i++)
      expect(l[i] - l[i - 1]).toBeGreaterThanOrEqual(2 * cs[1].r + 10);
  });

  it("v úzkém vysokém panelu se řádky roztáhnou do výšky", async () => {
    m = await mount(
      h(GraphView, {
        graph: MATCH,
        state: emptyState(),
        width: 320,
        height: 420,
        dense: true,
        fitAspect: [0.6, 3] as const,
      }),
    );
    const ys = circles(m.el).map((c) => c.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(300);
  });

  it("bez fitAspect drží poměr stran kresby (sloupce u sebe)", async () => {
    m = await mount(
      h(GraphView, {
        graph: MATCH,
        state: emptyState(),
        width: 600,
        height: 300,
      }),
    );
    const xs = circles(m.el).map((c) => c.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(300);
  });
});

describe("GraphView holdLayout – druhá kresba v editoru drží měřítko (X-08)", () => {
  const moved: Graph = {
    ...MATCH,
    aspect: 1.5,
    nodes: MATCH.nodes.map((n) => (n.id === 0 ? { ...n, x: -0.05 } : n)),
  };
  it("s holdLayout přesun vrcholu za okraj kresbu nepřeměří (stejný viewBox i polohy ostatních)", async () => {
    const props = {
      state: emptyState(),
      width: 320,
      height: 300,
      holdLayout: true,
    };
    m = await mount(
      h(GraphView, { ...props, graph: { ...MATCH, aspect: 1.5 } }),
    );
    const vb = viewBox(m.el);
    const before = circles(m.el)[5];
    await m.render(h(GraphView, { ...props, graph: moved }));
    expect(viewBox(m.el)).toBe(vb);
    expect(circles(m.el)[5]).toEqual(before);
  });

  it("bez holdLayout se kresba přeměří (dnešní chování mimo editor)", async () => {
    const props = { state: emptyState(), width: 320, height: 300 };
    m = await mount(
      h(GraphView, { ...props, graph: { ...MATCH, aspect: 1.5 } }),
    );
    const before = circles(m.el)[5];
    await m.render(h(GraphView, { ...props, graph: moved }));
    expect(circles(m.el)[5]).not.toEqual(before);
  });
});

describe("GraphView dense se skupinami (vrstvy R) – kresba mezi kroky neposkočí", () => {
  it("viewBox je stejný bez popisků skupin i s nimi", async () => {
    const props = {
      graph: WIDE,
      state: emptyState(),
      width: 600,
      height: 300,
      dense: true,
    };
    m = await mount(h(GraphView, { ...props, groups: [] }));
    const vb = viewBox(m.el);
    const first = circles(m.el)[0];
    await m.render(
      h(GraphView, {
        ...props,
        groups: [
          { label: "0", nodes: [0, 6, 12] },
          { label: "1", nodes: [1, 7, 13] },
        ],
      }),
    );
    expect(viewBox(m.el)).toBe(vb);
    expect(circles(m.el)[0]).toEqual(first);
  });
});
