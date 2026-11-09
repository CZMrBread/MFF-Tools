// @vitest-environment jsdom
// useTween v DOM: změna šířky plátna (první změření, otočení telefonu) se neanimuje – vrcholy jsou v novém
// rozložení hned ve stejném snímku. Přesun po operaci (stejná šířka) se dál animuje.
import { createElement as h } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount } from "../core/domTest";
import { treeLayout } from "./treeLayout";
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

/** rAF, který se nikdy nezavolá (jako vyhladovělé snímky v headless prohlížeči) */
const g = globalThis as Record<string, unknown>;
let saved: { raf: unknown; caf: unknown };
beforeEach(() => {
  saved = { raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
  g.requestAnimationFrame = () => 1;
  g.cancelAnimationFrame = () => {};
});
afterEach(() => {
  g.requestAnimationFrame = saved.raf;
  g.cancelAnimationFrame = saved.caf;
});

const xs = (el: HTMLElement) =>
  [...el.querySelectorAll<SVGGElement>("g.tree-node")].map((n) =>
    Number(/translate\(([-\d.]+)px/.exec(n.style.transform)![1]),
  );
const expected = (list: typeof nodes, width: number) => {
  const L = treeLayout(list, width, {
    levelHeight: 72,
    radius: 20,
    minHeight: 120,
  });
  return list.map((n) => L.px(n));
};

describe("useTween (jsdom, rAF stojí)", () => {
  it("změna šířky: vrcholy hned v novém rozložení, bez animace", async () => {
    const m = await mount(h(TreeView, { nodes, edges, width: 900 }));
    expect(xs(m.el)).toEqual(expected(nodes, 900));
    await m.render(h(TreeView, { nodes, edges, width: 620 }));
    expect(xs(m.el)).toEqual(expected(nodes, 620));
    await m.unmount();
  });

  it("přesun po operaci při stejné šířce se animuje (první snímek = dosavadní poloha)", async () => {
    const m = await mount(h(TreeView, { nodes, edges, width: 620 }));
    const before = xs(m.el);
    const moved = nodes.map((n) => (n.id === 2 ? { ...n, x: 0.25 } : n));
    await m.render(h(TreeView, { nodes: moved, edges, width: 620 }));
    expect(xs(m.el)).toEqual(before);
    expect(expected(moved, 620)).not.toEqual(before);
    await m.unmount();
  });
});
