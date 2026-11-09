// @vitest-environment jsdom
// Sdílená rozšíření GraphView pro fázi 4 (toky, nové grafové algoritmy): popisky hran ze stavu
// (GraphState.edgeText – „f/c“ toku, rezerva…) a šipky vlastních tříd hran (prop markers). Bez nich je
// kresba beze změny.
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { emptyState, type Graph } from "../algos/graphs/graph";
import { mount } from "../core/domTest";
import { GraphView } from "./GraphView";

const G = (weighted: boolean): Graph => ({
  directed: true,
  weighted,
  nodes: [
    { id: 0, label: "z", x: 0.1, y: 0.5 },
    { id: 1, label: "a", x: 0.5, y: 0.2 },
    { id: 2, label: "s", x: 0.9, y: 0.5 },
  ],
  edges: [
    { id: 0, u: 0, v: 1, w: 5 },
    { id: 1, u: 1, v: 2, w: 3 },
  ],
});

const labels = (el: HTMLElement) =>
  [...el.querySelectorAll(".graph-edge .edge-label")].map((t) => t.textContent);

describe("GraphView – popisky hran ze stavu (edgeText)", () => {
  it("bez edgeText: ceny hran jako dřív", async () => {
    const m = await mount(
      h(GraphView, { graph: G(true), state: emptyState(), width: 600 }),
    );
    expect(labels(m.el)).toEqual(["5", "3"]);
    await m.unmount();
  });

  it("edgeText nahradí cenu u uvedených hran (tok f/c), ostatní hrany ukážou cenu", async () => {
    const state = { ...emptyState(), edgeText: { 0: "2/5" } };
    const m = await mount(h(GraphView, { graph: G(true), state, width: 600 }));
    expect(labels(m.el)).toEqual(["2/5", "3"]);
    await m.unmount();
  });

  it("neohodnocený graf ukáže jen popisky z edgeText", async () => {
    const state = { ...emptyState(), edgeText: { 1: "r = 4" } };
    const m = await mount(h(GraphView, { graph: G(false), state, width: 600 }));
    expect(labels(m.el)).toEqual(["r = 4"]);
    await m.unmount();
  });
});

describe("GraphView – šipky vlastních tříd hran (markers)", () => {
  // id značek mají předponu instance (useId) – v testu porovnáváme jen třídu na konci
  const ids = (el: HTMLElement) =>
    [...el.querySelectorAll("marker")].map((x) =>
      x.id.replace(/^gar[^-]*-/, "gar"),
    );

  it("bez markers: stejné šipky jako dřív", async () => {
    const m = await mount(
      h(GraphView, { graph: G(true), state: emptyState(), width: 600 }),
    );
    expect(ids(m.el)).not.toContain("gare-flow");
    await m.unmount();
  });

  it("markers přidají šipku třídy; hrana s touto třídou na ni odkazuje", async () => {
    const state = { ...emptyState(), edgeMarks: { 0: "e-flow" } };
    const m = await mount(
      h(GraphView, {
        graph: G(true),
        state,
        width: 600,
        markers: ["e-flow", "e-tree"],
      }),
    );
    expect(ids(m.el)).toContain("gare-flow");
    // e-tree už mezi šipkami je – nezdvojí se
    expect(ids(m.el).filter((x) => x === "gare-tree")).toHaveLength(1);
    const path = m.el.querySelector(".graph-edge.e-flow path")!;
    const ref = /^url\(#(.+)\)$/.exec(path.getAttribute("marker-end")!)![1];
    expect(m.el.querySelector(`marker[id="${ref}"]`)!.id).toMatch(/e-flow$/);
    await m.unmount();
  });
});

describe("GraphView – dvě kresby na stránce (UX-01)", () => {
  it("id šipek jsou v dokumentu jedinečná a každá hrana ukazuje na šipku ve vlastním SVG (i když je první kresba skrytá)", async () => {
    const state = { ...emptyState(), edgeMarks: { 0: "e-flow" } };
    const one = (hidden: boolean) =>
      h(
        "div",
        { style: hidden ? { display: "none" } : undefined },
        h(GraphView, {
          graph: G(true),
          state,
          width: 600,
          markers: ["e-flow"],
        }),
      );
    const m = await mount(h("div", null, one(true), one(false)));
    const all = [...m.el.querySelectorAll("marker")].map((x) => x.id);
    expect(new Set(all).size).toBe(all.length);
    const svgs = [...m.el.querySelectorAll("svg")].filter((s) =>
      s.querySelector("marker"),
    );
    expect(svgs).toHaveLength(2);
    for (const svg of svgs)
      for (const p of svg.querySelectorAll("path[marker-end]")) {
        const ref = /^url\(#(.+)\)$/.exec(p.getAttribute("marker-end")!)![1];
        expect(svg.querySelector(`marker[id="${ref}"]`)).not.toBeNull();
      }
    await m.unmount();
  });
});

describe("GraphView – šipky na hranách neorientovaného grafu (edgeArrow, UX-17)", () => {
  const U: Graph = {
    directed: false,
    weighted: true,
    nodes: [
      { id: 0, label: "a", x: 0.1, y: 0.5 },
      { id: 1, label: "b", x: 0.5, y: 0.2 },
      { id: 2, label: "c", x: 0.9, y: 0.5 },
      { id: 3, label: "d", x: 0.5, y: 0.9 },
    ],
    edges: [
      { id: 0, u: 0, v: 1, w: 1 },
      { id: 1, u: 1, v: 2, w: 2 },
      { id: 2, u: 2, v: 3, w: 3 },
      { id: 3, u: 3, v: 0, w: 4 },
    ],
  };
  const ends = (el: HTMLElement, id: number) => {
    const p = el.querySelectorAll(".graph-edge path")[id];
    return [!!p.getAttribute("marker-start"), !!p.getAttribute("marker-end")];
  };

  it("bez edgeArrow žádné šipky; „v“ = šipka do v, „u“ = do u, „both“ = oboustranná", async () => {
    const plain = await mount(
      h(GraphView, { graph: U, state: emptyState(), width: 600 }),
    );
    for (let i = 0; i < 4; i++)
      expect(ends(plain.el, i)).toEqual([false, false]);
    await plain.unmount();
    const state = {
      ...emptyState(),
      edgeMarks: { 0: "e-active" },
      edgeArrow: { 0: "v", 1: "u", 2: "both" } as const,
    };
    const m = await mount(h(GraphView, { graph: U, state, width: 600 }));
    expect(ends(m.el, 0)).toEqual([false, true]);
    expect(ends(m.el, 1)).toEqual([true, false]);
    expect(ends(m.el, 2)).toEqual([true, true]);
    expect(ends(m.el, 3)).toEqual([false, false]);
    // každá šipka ukazuje na značku ve vlastním SVG
    for (const p of m.el.querySelectorAll(
      "path[marker-start], path[marker-end]",
    ))
      for (const a of ["marker-start", "marker-end"]) {
        const v = p.getAttribute(a);
        if (!v) continue;
        const ref = /^url\(#(.+)\)$/.exec(v)![1];
        expect(m.el.querySelector(`marker[id="${ref}"]`), a).not.toBeNull();
      }
    await m.unmount();
  });
});
