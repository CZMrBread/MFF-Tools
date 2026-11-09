// @vitest-environment jsdom
// UnionFindView (Kruskal, E5): les keříků v panelu výsledku – šipky syn → otec, H u kořenů, zvýrazněná
// cesta Find a právě připojený kořen; kresba jen ukazuje (role img, žádná zastávka Tabu, mezerník nebere).
// Třídy podle sdíleného kontraktu .viz-ufforest v index.css (uf-node is-root/is-path/is-hot, uf-edge, uf-arrow, uf-rank).
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import type { UnionFindState } from "../algos/graphs/graph";
import { key, mount } from "../core/domTest";
import { UnionFindView } from "./UnionFindView";

const LABELS = ["a", "b", "c", "d", "e"];
/** a ← b, a ← c, c ← d; e samostatně */
const UF: UnionFindState = {
  parent: [null, 0, 0, 2, null],
  depth: [2, 0, 1, 0, 0],
  path: [],
  linked: null,
};
const setup = (uf: UnionFindState) =>
  mount(h(UnionFindView, { uf, labels: LABELS }));

const nodeOf = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll("g.uf-node")].find(
    (g) => g.querySelector(".uf-label")?.textContent === label,
  )!;
const edgeOf = (el: HTMLElement, child: string) =>
  el.querySelector(`g.uf-link[data-child="${child}"] .uf-edge`)!;

describe("UnionFindView", () => {
  it("vrcholy a šipky syn → otec podle kontraktu .viz-ufforest, H jen u kořenů, popis lesu pro čtečku", async () => {
    const m = await setup(UF);
    const svg = m.el.querySelector("svg.uf-svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe(
      "Union-Find, 2 keříky: keřík a, H = 2: P(b) = a, P(c) = a, P(d) = c; keřík e, H = 0.",
    );
    expect(m.el.querySelectorAll("g.uf-node")).toHaveLength(5);
    expect(m.el.querySelectorAll(".uf-edge")).toHaveLength(3);
    expect(svg.getAttribute("class")).toContain("viz-ufforest");
    expect(nodeOf(m.el, "a").getAttribute("class")).toContain("is-root");
    expect(nodeOf(m.el, "b").getAttribute("class")).not.toContain("is-root");
    // jen třídy kontraktu .viz-ufforest – třídy grafu (graph-node, n-comp…) by se s ním přebíjely
    // (v tmavém tématu tmavý text na tmavém kroužku); bez barev grafu žádná barva komponenty
    for (const g of m.el.querySelectorAll("g.uf-node"))
      expect(g.getAttribute("class")).not.toMatch(/graph-node|n-comp|uf-comp/);
    // H jen u kořenů, krátce (vejde se nad kroužek i v řadě samostatných vrcholů)
    const hs = [...m.el.querySelectorAll(".uf-node .uf-rank")].map(
      (t) => t.textContent,
    );
    expect(hs).toEqual(["H=2", "H=0"]);
    // šipka končí u otce: hrot (uf-arrow) patří ke každé hraně
    expect(m.el.querySelectorAll(".uf-link .uf-arrow")).toHaveLength(3);
    // titulek panelu
    expect(m.el.querySelector(".gtable-title")?.textContent).toMatch(
      /Union-Find/,
    );
    await m.unmount();
  });

  it("cesta Find: vrcholy i šipky na cestě zvýrazněné, ostatní ne; Union: nová šipka připojeného kořene", async () => {
    const m = await setup({ ...UF, path: [3, 2, 0] });
    for (const l of ["d", "c", "a"])
      expect(nodeOf(m.el, l).getAttribute("class"), l).toContain("is-path");
    for (const l of ["b", "e"])
      expect(nodeOf(m.el, l).getAttribute("class"), l).not.toContain("is-path");
    expect(edgeOf(m.el, "d").getAttribute("class")).toContain("is-path");
    expect(edgeOf(m.el, "c").getAttribute("class")).toContain("is-path");
    expect(edgeOf(m.el, "b").getAttribute("class")).not.toContain("is-path");

    await m.render(
      h(UnionFindView, {
        uf: { ...UF, linked: 2 },
        labels: LABELS,
      }),
    );
    // nová šipka P(c) = a zvýrazněná, připojený kořen c „horký“; jiná šipka ani vrchol cesty ne
    expect(edgeOf(m.el, "c").getAttribute("class")).toContain("is-new");
    expect(edgeOf(m.el, "c").getAttribute("class")).toContain("is-path");
    expect(edgeOf(m.el, "b").getAttribute("class")).not.toContain("is-path");
    expect(nodeOf(m.el, "c").getAttribute("class")).toContain("is-hot");
    expect(m.el.querySelectorAll(".uf-node.is-path")).toHaveLength(0);
    await m.unmount();
  });

  it("barvy komponent: keřík má barvu komponenty z kresby grafu (n-compK → uf-compK), jiné značky se nepřenesou", async () => {
    const marks = {
      0: "n-comp2",
      1: "n-comp2",
      2: "n-comp2",
      3: "n-comp2",
      4: "n-comp5",
    };
    const m = await mount(
      h(UnionFindView, { uf: UF, labels: LABELS, nodeMarks: marks }),
    );
    for (const l of ["a", "b", "c", "d"])
      expect(nodeOf(m.el, l).getAttribute("class"), l).toMatch(/\buf-comp2\b/);
    expect(nodeOf(m.el, "e").getAttribute("class")).toMatch(/\buf-comp5\b/);
    // jen třída kontraktu .viz-ufforest, ne třída kresby grafu
    for (const g of m.el.querySelectorAll("g.uf-node"))
      expect(g.getAttribute("class")).not.toMatch(/n-comp|graph-node/);
    // cesta Find dál zvýrazněná i na barevném vrcholu
    await m.render(
      h(UnionFindView, {
        uf: { ...UF, path: [3, 2, 0] },
        labels: LABELS,
        nodeMarks: marks,
      }),
    );
    expect(nodeOf(m.el, "d").getAttribute("class")).toMatch(
      /uf-comp2.*is-path|is-path.*uf-comp2/,
    );
    // jiné značky vrcholu (n-closed…) les nebarví
    await m.render(
      h(UnionFindView, {
        uf: UF,
        labels: LABELS,
        nodeMarks: { 0: "n-closed", 4: "n-active" },
      }),
    );
    for (const g of m.el.querySelectorAll("g.uf-node"))
      expect(g.getAttribute("class")).not.toMatch(/uf-comp|n-closed|n-active/);
    await m.unmount();
  });

  it("jen ukazuje: žádná zastávka Tabu ani prvky kresby; mezerník zůstává přehrávači", async () => {
    const m = await setup(UF);
    expect(m.el.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(m.el.querySelectorAll("[data-canvas-item]")).toHaveLength(0);
    const ev = await key(m.el.querySelector("svg")!, { key: " " });
    expect(ev.defaultPrevented).toBe(false);
    await m.unmount();
  });

  it("reserveH / reserveW: kresba drží místo pro nejvyšší a nejširší les běhu (panel ani graf vedle mezi kroky neposkočí)", async () => {
    const m = await mount(
      h(UnionFindView, {
        uf: UF,
        labels: LABELS,
        reserveH: 300,
        reserveW: 400,
      }),
    );
    const svg = m.el.querySelector("svg")!;
    expect(svg.getAttribute("height")).toBe("300");
    expect(svg.getAttribute("width")).toBe("400");
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 300");
    // les je ve vyhrazené šířce vodorovně uprostřed
    const xs = [...m.el.querySelectorAll("g.uf-node")].map((g) =>
      Number(/translate\(([\d.]+),/.exec(g.getAttribute("transform")!)![1]),
    );
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(400, 0);
    // menší rezerva než skutečná výška kresbu neořízne
    await m.render(h(UnionFindView, { uf: UF, labels: LABELS, reserveH: 5 }));
    expect(Number(svg.getAttribute("height"))).toBeGreaterThan(5);
    await m.unmount();
  });

  it("kresba má rozměry z rozvržení (1 jednotka = 1 px) a dlouhý popisek se zkrátí, celý je v <title>", async () => {
    const m = await mount(
      h(UnionFindView, {
        uf: { parent: [null, 0], depth: [1, 0], path: [], linked: null },
        labels: ["vrchol1", "x"],
      }),
    );
    const svg = m.el.querySelector("svg")!;
    const vb = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect(Number(svg.getAttribute("width"))).toBe(vb[2]);
    expect(Number(svg.getAttribute("height"))).toBe(vb[3]);
    const g = m.el.querySelector("g.uf-node")!;
    expect(g.querySelector(".uf-label")?.textContent).toBe("vr…");
    expect(g.querySelector("title")?.textContent).toBe("vrchol1");
    await m.unmount();
  });
});
