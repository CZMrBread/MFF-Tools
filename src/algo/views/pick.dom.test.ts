// @vitest-environment jsdom
// Výběr prvku klikem (onPick) na plátnech stromu, pole a krabiček: klik i Enter vyplní argument akce
// v ActionMenu; mezerník je vždy přehrávač (D3). Bez onPick zůstává SVG obrázkem (role img, bez fokusu).
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { click, key, mount } from "../core/domTest";
import { ArrayView } from "./ArrayView";
import { BoxListView } from "./BoxListView";
import { MultiTreeView } from "./MultiTreeView";
import { TreeView } from "./TreeView";

const nodes = [
  { id: 1, label: "8", x: 0.5, y: 0 },
  { id: 2, label: "3", x: 0, y: 1 },
  { id: 3, label: "12", x: 1, y: 1 },
];
const edges = [
  { from: 1, to: 2 },
  { from: 1, to: 3 },
];

describe("onPick (jsdom)", () => {
  it("TreeView: klik na vrchol předá vrchol; Enter také; popisek říká, co se stane", async () => {
    const onPick = vi.fn();
    const m = await mount(h(TreeView, { nodes, edges, width: 400, onPick }));
    const g = m.el.querySelectorAll<SVGGElement>("g.tree-node");
    expect(m.el.querySelector("svg")!.getAttribute("role")).toBe("group");
    // roving tabindex (D3): zastávkou Tabu je první vrchol, ostatní -1
    expect(g[0].getAttribute("tabindex")).toBe("0");
    expect(g[2].getAttribute("tabindex")).toBe("-1");
    expect(g[2].getAttribute("aria-label")).toBe("Vrchol 12 – vybrat");
    await click(g[2]);
    expect(onPick).toHaveBeenLastCalledWith(nodes[2]);
    await key(g[1], { key: "Enter" });
    expect(onPick).toHaveBeenLastCalledWith(nodes[1]);
    await m.unmount();
  });

  it("TreeView bez onPick: obrázek bez fokusu", async () => {
    const m = await mount(h(TreeView, { nodes, edges, width: 400 }));
    expect(m.el.querySelector("svg")!.getAttribute("role")).toBe("img");
    expect(m.el.querySelector("[tabindex]")).toBeNull();
    await m.unmount();
  });

  it("ArrayView: klik na sloupec předá index a hodnotu", async () => {
    const onPick = vi.fn();
    const items = [
      { id: 10, v: 5 },
      { id: 11, v: 9 },
    ];
    const m = await mount(
      h(ArrayView, { items, marks: {}, max: 10, width: 300, onPick }),
    );
    const bars = m.el.querySelectorAll<SVGGElement>("g.bar");
    expect(bars[1].getAttribute("aria-label")).toBe("Prvek 2: 9 – vybrat");
    await click(bars[1]);
    expect(onPick).toHaveBeenCalledWith(1, 9);
    await key(bars[0], { key: "Enter" });
    expect(onPick).toHaveBeenLastCalledWith(0, 5);
    await m.unmount();
  });

  it("BoxListView: klik a Enter na krabičku předají index a krabičku; mezerník prvek nechá přehrávači (D3)", async () => {
    const onPick = vi.fn();
    const boxes = [
      { id: 1, label: "5" },
      { id: 2, label: "12" },
    ];
    const m = await mount(h(BoxListView, { boxes, onPick }));
    const b = m.el.querySelectorAll<SVGGElement>("g.box");
    await click(b[1]);
    expect(onPick).toHaveBeenCalledWith(1, boxes[1]);
    const space = await key(b[0], { key: " " });
    expect(space.defaultPrevented).toBe(false);
    expect(onPick).toHaveBeenCalledTimes(1);
    const ev = await key(b[0], { key: "Enter" });
    expect(ev.defaultPrevented).toBe(true);
    expect(onPick).toHaveBeenLastCalledWith(0, boxes[0]);
    expect(b[0].hasAttribute("data-canvas-item")).toBe(true);
    expect(b[0].getAttribute("class")).toContain("pickable");
    await m.unmount();
  });
});

/** jsdom nemá rozvržení: obdélník prvku z jeho transform translate(x px, y px) (vrcholy stromu) */
function withTranslateRects<T>(run: () => Promise<T>): Promise<T> {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const t = (this as SVGElement).style?.transform ?? "";
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(t);
    const x = m ? Number(m[1]) : 0;
    const y = m ? Number(m[2]) : 0;
    return {
      x,
      y,
      left: x,
      top: y,
      right: x,
      bottom: y,
      width: 0,
      height: 0,
      toJSON() {},
    } as DOMRect;
  };
  return run().finally(() => {
    Element.prototype.getBoundingClientRect = original;
  });
}

describe("roving tabindex na kresbě (D3)", () => {
  const stops = (el: Element) =>
    [...el.querySelectorAll("[tabindex]")].filter(
      (e) => e.getAttribute("tabindex") === "0",
    );

  it("TreeView: jedna zastávka Tabu; šipka dolů = dítě, nahoru = rodič, vpravo = soused; Enter vybere", () =>
    withTranslateRects(async () => {
      const onPick = vi.fn();
      const m = await mount(h(TreeView, { nodes, edges, width: 400, onPick }));
      const g = [...m.el.querySelectorAll<SVGGElement>("g.tree-node")];
      expect(stops(m.el)).toEqual([g[0]]);
      g[0]!.focus();
      await key(g[0]!, { key: "ArrowDown" });
      expect(document.activeElement).toBe(g[1]);
      expect(stops(m.el)).toEqual([g[1]]);
      await key(g[1]!, { key: "ArrowRight" });
      expect(document.activeElement).toBe(g[2]);
      await key(g[2]!, { key: "ArrowUp" });
      expect(document.activeElement).toBe(g[0]);
      await key(g[0]!, { key: "Enter" });
      expect(onPick).toHaveBeenLastCalledWith(nodes[0]);
      await m.unmount();
    }));

  it("TreeView: zastávkou Tabu je kořen i tehdy, když vrcholy nepřijdou od kořene (BST v pořadí in-order)", async () => {
    const inorder = [nodes[1]!, nodes[0]!, nodes[2]!];
    const m = await mount(
      h(TreeView, { nodes: inorder, edges, width: 400, onPick: vi.fn() }),
    );
    expect(stops(m.el).map((e) => e.getAttribute("aria-label"))).toEqual([
      "Vrchol 8 – vybrat",
    ]);
    await m.unmount();
    const mt = await mount(
      h(MultiTreeView, {
        nodes: [
          { id: 2, keys: ["2"], x: 0, y: 1 },
          { id: 1, keys: ["5", "9"], x: 0.5, y: 0 },
        ],
        edges: [{ from: 1, to: 2 }],
        width: 300,
        onPickKey: vi.fn(),
      }),
    );
    expect(stops(mt.el).map((e) => e.getAttribute("aria-label"))).toEqual([
      "Klíč 5 – vybrat",
    ]);
    await mt.unmount();
  });

  it("ArrayView a MultiTreeView: jedna zastávka Tabu, šipka vpravo = další prvek", async () => {
    const items = [
      { id: 10, v: 5 },
      { id: 11, v: 9 },
    ];
    const a = await mount(
      h(ArrayView, { items, marks: {}, max: 10, width: 300, onPick: vi.fn() }),
    );
    const bars = [...a.el.querySelectorAll<SVGGElement>("g.bar")];
    expect(stops(a.el)).toEqual([bars[0]]);
    bars[0]!.focus();
    await key(bars[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(bars[1]);
    await a.unmount();

    const mt = await mount(
      h(MultiTreeView, {
        nodes: [
          { id: 1, keys: ["5", "9"], x: 0.5, y: 0 },
          { id: 2, keys: ["2"], x: 0, y: 1 },
        ],
        edges: [{ from: 1, to: 2 }],
        width: 300,
        onPickKey: vi.fn(),
      }),
    );
    const keys = [...mt.el.querySelectorAll("[data-canvas-item]")];
    expect(keys.length).toBe(3);
    expect(stops(mt.el)).toEqual([keys[0]]);
    await mt.unmount();
  });

  it("BoxListView zatím bez roving tabindexu – mezerník ale i tak nechá přehrávači", async () => {
    const m = await mount(
      h(BoxListView, { boxes: [{ id: 1, label: "5" }], onPick: vi.fn() }),
    );
    const ev = await key(m.el.querySelector("g.box")!, { key: " " });
    expect(ev.defaultPrevented).toBe(false);
    await m.unmount();
  });
});
