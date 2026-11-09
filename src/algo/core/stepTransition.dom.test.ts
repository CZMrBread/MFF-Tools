// @vitest-environment jsdom
// Plynulé přechody mezi kroky v DOM: Visualizer předá pohledům délku přechodu podle toho, jak se
// přehrávač na krok dostal. Ruční krok = krátký přechod, posuvník / Home / End = okamžitě,
// „omezit pohyb“ = okamžitě. Přechody nikdy nespustí přehrávání.
import { act, createElement as h } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArrayView } from "../views/ArrayView";
import { BoxListView, type Box } from "../views/BoxListView";
import { TreeView } from "../views/TreeView";
import { mount, type } from "./domTest";
import { MANUAL_MS } from "./motion";
import { StepTransitionContext } from "./stepTransition";
import type { Step } from "./steps";
import { usePlayer } from "./usePlayer";
import { Visualizer } from "./Visualizer";

interface TState {
  x2: number;
  boxes: Box[];
}
const box = (id: number): Box => ({ id, label: String(id * 10) });
const STEPS: Step<TState>[] = [
  {
    state: { x2: 0, boxes: [box(1), box(2), box(3)] },
    line: null,
    message: "a",
  },
  { state: { x2: 0.25, boxes: [box(1), box(2)] }, line: null, message: "b" },
  { state: { x2: 0.5, boxes: [box(1)] }, line: null, message: "c" },
  { state: { x2: 0.5, boxes: [box(1)] }, line: null, message: "d" },
];

function Harness() {
  const player = usePlayer(STEPS);
  const s = player.current!.state;
  const nodes = [
    { id: 1, label: "8", x: 0.5, y: 0 },
    { id: 2, label: "3", x: s.x2, y: 1 },
  ];
  return h(Visualizer<TState>, {
    title: "T",
    description: "d",
    player,
    pseudocode: [],
    children: [
      h(TreeView, {
        key: "t",
        nodes,
        edges: [{ from: 1, to: 2 }],
        width: 600,
      }),
      h(BoxListView, { key: "b", boxes: s.boxes }),
    ],
  });
}

/** rAF, který se nikdy nezavolá: animovaný prvek zůstane v první mezipoloze (= výchozí poloze) */
const g = globalThis as Record<string, unknown>;
let saved: { raf: unknown; caf: unknown; mm: unknown };
beforeEach(() => {
  saved = {
    raf: g.requestAnimationFrame,
    caf: g.cancelAnimationFrame,
    mm: window.matchMedia,
  };
  g.requestAnimationFrame = () => 1;
  g.cancelAnimationFrame = () => {};
});
afterEach(() => {
  g.requestAnimationFrame = saved.raf;
  g.cancelAnimationFrame = saved.caf;
  (window as unknown as Record<string, unknown>).matchMedia = saved.mm;
  vi.useRealTimers();
});

const node2X = (el: HTMLElement) =>
  Number(
    /translate\(([-\d.]+)px/.exec(
      el.querySelectorAll<SVGGElement>("g.tree-node")[1].style.transform,
    )![1],
  );
const stepMs = (el: HTMLElement) =>
  el
    .querySelector<HTMLElement>(".viz-canvas")!
    .style.getPropertyValue("--algo-step-ms");
const boxIds = (el: HTMLElement) =>
  [...el.querySelectorAll<SVGGElement>("g.box")].map(
    (b) => b.textContent + (b.classList.contains("leaving") ? "×" : ""),
  );
const click = (b: HTMLElement) => act(async () => b.click());

function reduceMotion(on: boolean) {
  (window as unknown as Record<string, unknown>).matchMedia = (q: string) => ({
    matches: on && q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
}

describe("přechody mezi kroky (jsdom)", () => {
  it("po otevření je přechod 0 ms a přehrávač stojí", async () => {
    const m = await mount(h(Harness));
    expect(stepMs(m.el)).toBe("0ms");
    expect(m.button("Přehrát")).toBeTruthy();
    await m.unmount();
  });

  it("ruční krok (Další) = krátký přechod: vrchol vyjede z dosavadní polohy, přehrávání se nespustí", async () => {
    const m = await mount(h(Harness));
    const before = node2X(m.el);
    await click(m.button("Krok vpřed"));
    expect(stepMs(m.el)).toBe(`${MANUAL_MS}ms`);
    expect(node2X(m.el)).toBe(before); // rAF stojí → první mezipoloha = výchozí poloha
    expect(m.button("Přehrát")).toBeTruthy();
    await m.unmount();
  });

  it("posuvník (i o jediný krok) = okamžitě: vrchol rovnou v cíli", async () => {
    const m = await mount(h(Harness));
    const before = node2X(m.el);
    const slider = m.el.querySelector<HTMLInputElement>(
      'input[aria-label="Krok"]',
    )!;
    await type(slider, "1");
    expect(stepMs(m.el)).toBe("0ms");
    expect(node2X(m.el)).not.toBe(before);
    await m.unmount();
  });

  it("Na konec = okamžitě", async () => {
    const m = await mount(h(Harness));
    await click(m.button("Krok vpřed"));
    await click(m.button("Na konec"));
    expect(stepMs(m.el)).toBe("0ms");
    await m.unmount();
  });

  it("prefers-reduced-motion: reduce → ruční krok bez animace", async () => {
    reduceMotion(true);
    const m = await mount(h(Harness));
    const before = node2X(m.el);
    await click(m.button("Krok vpřed"));
    expect(stepMs(m.el)).toBe("0ms");
    expect(node2X(m.el)).not.toBe(before);
    expect(boxIds(m.el)).toEqual(["10", "20"]);
    await m.unmount();
  });

  it("odebraná krabička při ručním kroku chvíli odchází (třída leaving), pak zmizí", async () => {
    vi.useFakeTimers();
    const m = await mount(h(Harness));
    await click(m.button("Krok vpřed"));
    expect(boxIds(m.el)).toEqual(["10", "20", "30×"]);
    await act(async () => {
      vi.advanceTimersByTime(MANUAL_MS + 50);
    });
    expect(boxIds(m.el)).toEqual(["10", "20"]);
    await m.unmount();
  });

  it("při skoku posuvníkem odebrané krabičky zmizí hned", async () => {
    const m = await mount(h(Harness));
    const slider = m.el.querySelector<HTMLInputElement>(
      'input[aria-label="Krok"]',
    )!;
    await type(slider, "2");
    expect(boxIds(m.el)).toEqual(["10"]);
    await m.unmount();
  });
});

describe("odchod prvků v dalších pohledech (kontext s délkou přechodu)", () => {
  const inCtx = (ms: number, child: ReturnType<typeof h>) =>
    h(StepTransitionContext.Provider, { value: ms }, child);
  const leavingIn = (el: HTMLElement, sel: string) =>
    [...el.querySelectorAll(sel + ".leaving")].map((x) => x.textContent);

  it("TreeView: smazaný vrchol doznívá, při 0 ms zmizí hned", async () => {
    const n = [
      { id: 1, label: "8", x: 0.5, y: 0 },
      { id: 2, label: "3", x: 0, y: 1 },
    ];
    const e = [{ from: 1, to: 2 }];
    const tree = (nodes: typeof n) =>
      h(TreeView, {
        nodes,
        edges: e.filter(() => nodes.length > 1),
        width: 600,
      });
    const m = await mount(inCtx(MANUAL_MS, tree(n)));
    await m.render(inCtx(MANUAL_MS, tree(n.slice(0, 1))));
    expect(leavingIn(m.el, "g.tree-node")).toEqual(["3"]);
    await m.render(inCtx(0, tree(n)));
    await m.render(inCtx(0, tree(n.slice(0, 1))));
    expect(leavingIn(m.el, "g.tree-node")).toEqual([]);
    await m.unmount();
  });

  it("ArrayView: odebraný sloupec (ExtractMin) doznívá a nejde vybrat", async () => {
    const items = [
      { id: 1, v: 5 },
      { id: 2, v: 9 },
    ];
    const arr = (it: typeof items) =>
      h(ArrayView, {
        items: it,
        marks: {},
        max: 9,
        width: 400,
        onPick: () => {},
      });
    const m = await mount(inCtx(MANUAL_MS, arr(items)));
    await m.render(inCtx(MANUAL_MS, arr(items.slice(0, 1))));
    const gone = m.el.querySelector("g.bar.leaving");
    expect(gone?.textContent).toContain("9");
    expect(gone?.getAttribute("role")).toBeNull();
    expect(gone?.getAttribute("tabindex")).toBeNull();
    await m.unmount();
  });
});
