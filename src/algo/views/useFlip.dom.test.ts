// @vitest-environment jsdom
// Přesun sloupců / krabiček (FLIP přes Web Animations API): React při prohození přesune uzel v DOM,
// a to v prohlížeči ruší CSS přechod transformace – druhý z prohozených sloupců by skočil. Proto se
// po vykreslení každý přesunutý prvek rozjede z předchozí polohy do nové přes el.animate (běží
// v kompozitoru, žádný setState po snímcích). Délka z Visualizeru; 0 ms (skok, omezit pohyb) = bez animace.
import { createElement as h } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepTransitionContext } from "../core/stepTransition";
import { mount } from "../core/domTest";
import { ArrayView } from "./ArrayView";
import { BoxListView } from "./BoxListView";

const proto = Element.prototype as unknown as Record<string, unknown>;
let animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  animate = vi.fn(() => ({ id: "", cancel: () => {} }));
  proto.animate = animate;
  proto.getAnimations = () => [];
});
afterEach(() => {
  delete proto.animate;
  delete proto.getAnimations;
});

const items = [
  { id: 1, v: 5 },
  { id: 2, v: 9 },
  { id: 3, v: 7 },
];
const arr = (ms: number | null, it: typeof items) => {
  const view = h(ArrayView, { items: it, marks: {}, max: 9, width: 300 });
  return ms === null
    ? view
    : h(StepTransitionContext.Provider, { value: ms }, view);
};
const xOf = (frames: Keyframe[]) =>
  frames.map((f) =>
    Number(/translateX?\(([-\d.]+)px/.exec(String(f.transform))![1]),
  );

describe("useFlip – přesun sloupců a krabiček", () => {
  it("prohození dvou sloupců: oba se rozjedou z dosavadní polohy do nové", async () => {
    const m = await mount(arr(200, items));
    const of5 = () =>
      [...m.el.querySelectorAll<SVGGElement>("g.bar")].find(
        (g) => g.textContent === "5",
      )!.style.transform;
    const before = of5();
    await m.render(arr(200, [items[2], items[1], items[0]]));
    expect(animate).toHaveBeenCalledTimes(2);
    for (const call of animate.mock.calls) {
      const [frames, opts] = call as [Keyframe[], KeyframeAnimationOptions];
      expect(opts.duration).toBe(200);
      const [from, to] = xOf(frames);
      expect(from).not.toBe(to);
    }
    // výsledná poloha je v inline stylu (bez animace by prvek stál v cíli)
    expect(of5()).not.toBe(before);
    await m.unmount();
  });

  it("0 ms (skok posuvníkem, omezit pohyb) a mimo Visualizer: bez animace", async () => {
    for (const ms of [0, null]) {
      const m = await mount(arr(ms, items));
      await m.render(arr(ms, [items[2], items[1], items[0]]));
      await m.unmount();
    }
    expect(animate).not.toHaveBeenCalled();
  });

  it("pořadí v DOM (tabulátor) zůstává podle indexu", async () => {
    const m = await mount(arr(200, items));
    await m.render(arr(200, [items[2], items[1], items[0]]));
    const vals = [...m.el.querySelectorAll("g.bar .bar-value")].map(
      (t) => t.textContent,
    );
    expect(vals).toEqual(["7", "9", "5"]);
    await m.unmount();
  });

  it("krabičky (fronta po Dequeue) se posunou stejně", async () => {
    const boxes = [1, 2, 3].map((id) => ({ id, label: String(id) }));
    const view = (b: typeof boxes) =>
      h(
        StepTransitionContext.Provider,
        { value: 200 },
        h(BoxListView, { boxes: b }),
      );
    const m = await mount(view(boxes));
    await m.render(view(boxes.slice(1)));
    // 2 a 3 jedou o pozici doleva
    expect(animate).toHaveBeenCalledTimes(2);
    await m.unmount();
  });

  it("změna šířky plátna (resetKey) se neanimuje – sloupce stojí rovnou v nové poloze (validace F5)", async () => {
    const at = (width: number) =>
      h(
        StepTransitionContext.Provider,
        { value: 200 },
        h(ArrayView, { items, marks: {}, max: 9, width }),
      );
    const m = await mount(at(300));
    await m.render(at(420));
    expect(animate).not.toHaveBeenCalled();
    await m.unmount();
  });

  it("přesun během ještě běžícího přesunu naváže z okamžité polohy a běžící animaci zruší (validace F5)", async () => {
    const cancel = vi.fn();
    const m = await mount(arr(200, items));
    // od teď „jede“ předchozí přesun: okamžitá poloha x = 42 px
    proto.getAnimations = () => [{ id: "algo-flip", cancel }];
    const origCS = window.getComputedStyle;
    const hadMatrix = "DOMMatrix" in globalThis;
    const g = globalThis as unknown as Record<string, unknown>;
    if (!hadMatrix)
      g.DOMMatrix = class {
        e = 0;
        f = 0;
        constructor(t?: string) {
          const n = /matrix\(([^)]*)\)/.exec(t ?? "");
          if (n) {
            const v = n[1]!.split(",").map(Number);
            this.e = v[4]!;
            this.f = v[5]!;
          }
        }
      };
    window.getComputedStyle = ((el: Element) => ({
      ...origCS(el),
      transform: "matrix(1, 0, 0, 1, 42, 0)",
    })) as typeof window.getComputedStyle;
    try {
      await m.render(arr(200, [items[2], items[1], items[0]]));
    } finally {
      window.getComputedStyle = origCS;
      if (!hadMatrix) delete g.DOMMatrix;
    }
    expect(cancel).toHaveBeenCalled();
    expect(animate).toHaveBeenCalled();
    for (const call of animate.mock.calls) {
      const [frames] = call as [Keyframe[]];
      expect(xOf(frames)[0], "start = okamžitá poloha").toBe(42);
    }
    await m.unmount();
  });

  it("změna výšky kresby (canvasFit, okno) neanimuje výšku sloupců; další krok už ano (validace F10)", async () => {
    const tall = (height: number, it: typeof items) =>
      h(
        StepTransitionContext.Provider,
        { value: 300 },
        h(ArrayView, { items: it, marks: {}, max: 9, width: 300, height }),
      );
    const svg = () => m.el.querySelector("svg.array-svg")!;
    const m = await mount(tall(200, items));
    expect(svg().classList.contains("relayout")).toBe(false);
    await m.render(tall(260, items));
    expect(svg().classList.contains("relayout"), "relayout").toBe(true);
    // po vykreslení (2 snímky) se přechody vrátí – další krok se zase animuje
    await new Promise((r) => setTimeout(r, 80));
    expect(svg().classList.contains("relayout")).toBe(false);
    await m.render(tall(260, [items[1], items[0], items[2]]));
    expect(svg().classList.contains("relayout")).toBe(false);
    await m.unmount();
  });
});
