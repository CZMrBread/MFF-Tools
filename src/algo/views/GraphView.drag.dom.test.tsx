// @vitest-environment jsdom
// Tah vrcholu v GraphView (grafy, toky): chyba vlastníka 8. 11. 2026 „v tocích během přesouvání bodů se
// graf resizuje a graf potom je miniaturní“ a „těžké chytit a táhnout“. Kresba s pevným poměrem stran
// (knižní předvolby, sítě toků) se během tahu nesmí přepočítat (zmrazené měřítko) a po puštění se nesmí
// zmenšit; vrchol jde chytit i kousek vedle kruhu, jede s ukazatelem bez skoku, klik ≠ tah (práh).
import { act, createElement as h, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { emptyState, type Graph } from "../algos/graphs/graph";
import { mount } from "../core/domTest";
import { GraphView } from "./GraphView";

const ID = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

/** kosočtverec s poměrem stran 2 : 1 (jako sítě toků z knihy) */
const BOOK: Graph = {
  directed: true,
  weighted: true,
  aspect: 2,
  nodes: [
    { id: 0, label: "z", x: 0, y: 0.5 },
    { id: 1, label: "a", x: 0.5, y: 0 },
    { id: 2, label: "b", x: 0.5, y: 1 },
    { id: 3, label: "s", x: 1, y: 0.5 },
  ],
  edges: [
    { id: 0, u: 0, v: 1, w: 3 },
    { id: 1, u: 0, v: 2, w: 2 },
    { id: 2, u: 1, v: 3, w: 2 },
    { id: 3, u: 2, v: 3, w: 3 },
  ],
};

async function fire(
  target: Element,
  type: string,
  x: number,
  y: number,
  extra: PointerEventInit = {},
) {
  await act(async () => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        button: type === "pointerdown" ? 0 : -1,
        ...extra,
      }),
    );
  });
}

/** stránka v režimu algoritmu: přesun vrcholu mění graf hned (jako GraphEditor → reducer „move“) */
function Live({
  initial,
  onPick,
  onMoveSpy,
}: {
  initial: Graph;
  onPick?: (id: number) => void;
  onMoveSpy?: (id: number, x: number, y: number) => void;
}) {
  const [g, setG] = useState(initial);
  return h(GraphView, {
    graph: g,
    state: emptyState(),
    width: 600,
    height: 300,
    screenMatrix: ID,
    onPickVertex: onPick,
    onMove: (id: number, x: number, y: number) => {
      onMoveSpy?.(id, x, y);
      setG((old) => ({
        ...old,
        nodes: old.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
      }));
    },
  });
}

async function setup(props: Parameters<typeof Live>[0] = { initial: BOOK }) {
  const m = await mount(h(Live, props));
  const svg = m.el.querySelector("svg.graph-svg")!;
  const nodes = () => [...m.el.querySelectorAll<SVGGElement>("g.graph-node")];
  const pos = (i: number) => {
    const t = nodes()[i].style.transform;
    const [, x, y] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(t) ?? [];
    return { x: Number(x), y: Number(y) };
  };
  const dist = (i: number, j: number) =>
    Math.hypot(pos(i).x - pos(j).x, pos(i).y - pos(j).y);
  return { m, svg, nodes, pos, dist };
}

describe("GraphView – tah vrcholu kresby s pevným poměrem stran (chyba „miniaturní graf“)", () => {
  it("během tahu se měřítko ani viewBox nemění – ostatní vrcholy stojí, i když se táhne daleko mimo plátno", async () => {
    const t = await setup();
    const vb0 = t.svg.getAttribute("viewBox");
    const others0 = [0, 2, 3].map((i) => t.pos(i));
    const a = t.pos(1);
    await fire(t.nodes()[1], "pointerdown", a.x, a.y);
    for (const [x, y] of [
      [a.x + 40, a.y + 10],
      [a.x + 300, a.y + 40],
      [2000, 900],
      [2000, 900],
      [2000, 900],
      [-500, -400],
      [3000, 3000],
    ]) {
      await fire(t.svg, "pointermove", x, y);
      expect(t.svg.getAttribute("viewBox")).toBe(vb0);
      expect([0, 2, 3].map((i) => t.pos(i))).toEqual(others0);
    }
    await fire(t.svg, "pointerup", 3000, 3000);
    await t.m.unmount();
  });

  it("po puštění daleko mimo plátno se kresba nezmenší (vzdálenost ostatních vrcholů nejméně stejná)", async () => {
    const t = await setup();
    const d0 = t.dist(0, 3);
    const h0 = Number(t.svg.getAttribute("height"));
    for (const target of [
      [5000, 4000],
      [-4000, -3000],
      [5000, -3000],
    ]) {
      const a = t.pos(1);
      await fire(t.nodes()[1], "pointerdown", a.x, a.y);
      for (let k = 1; k <= 6; k++)
        await fire(
          t.svg,
          "pointermove",
          a.x + ((target[0] - a.x) * k) / 6,
          a.y + ((target[1] - a.y) * k) / 6,
        );
      await fire(t.svg, "pointerup", target[0], target[1]);
      expect(t.dist(0, 3)).toBeGreaterThanOrEqual(d0 - 0.5);
    }
    // plátno se nanejvýš zvětší do povolené výšky, nezmenší
    expect(Number(t.svg.getAttribute("height"))).toBeGreaterThanOrEqual(h0);
    await t.m.unmount();
  });

  it("tažený vrchol jede s ukazatelem o posun z uchopení – při chycení u okraje kruhu nepřeskočí", async () => {
    const spy = vi.fn();
    const t = await setup({ initial: BOOK, onMoveSpy: spy });
    const a = t.pos(1);
    // chycení 12 px vpravo a 6 px pod středem
    await fire(t.nodes()[1], "pointerdown", a.x + 12, a.y + 6);
    await fire(t.svg, "pointermove", a.x + 12 + 30, a.y + 6 + 20);
    const p = t.pos(1);
    expect(p.x).toBeCloseTo(a.x + 30, 0);
    expect(p.y).toBeCloseTo(a.y + 20, 0);
    await fire(t.svg, "pointerup", a.x + 42, a.y + 26);
    await t.m.unmount();
  });

  it("klik s chvěním pod prahem (2 px) vrchol nepřesune a vybere ho (v₀)", async () => {
    const spy = vi.fn();
    const pick = vi.fn();
    const t = await setup({ initial: BOOK, onMoveSpy: spy, onPick: pick });
    const a = t.pos(2);
    await fire(t.nodes()[2], "pointerdown", a.x, a.y);
    await fire(t.svg, "pointermove", a.x + 2, a.y + 1);
    await fire(t.svg, "pointerup", a.x + 2, a.y + 1);
    expect(spy).not.toHaveBeenCalled();
    expect(pick).toHaveBeenCalledWith(2);
    await t.m.unmount();
  });

  it("úchop: myš chytí vrchol i 25 px od středu (mimo viditelný kruh), prst i 40 px; dál ne", async () => {
    const spy = vi.fn();
    const t = await setup({ initial: BOOK, onMoveSpy: spy });
    const b = t.pos(2);
    await fire(t.svg, "pointerdown", b.x + 25, b.y);
    await fire(t.svg, "pointermove", b.x + 25, b.y - 30);
    await fire(t.svg, "pointerup", b.x + 25, b.y - 30);
    expect(spy).toHaveBeenLastCalledWith(
      2,
      expect.any(Number),
      expect.any(Number),
    );
    spy.mockClear();

    const c = t.pos(2);
    await fire(t.svg, "pointerdown", c.x - 40, c.y, { pointerType: "touch" });
    await fire(t.svg, "pointermove", c.x - 40, c.y - 30, {
      pointerType: "touch",
    });
    await fire(t.svg, "pointerup", c.x - 40, c.y - 30, {
      pointerType: "touch",
    });
    expect(spy).toHaveBeenLastCalledWith(
      2,
      expect.any(Number),
      expect.any(Number),
    );
    spy.mockClear();

    const d = t.pos(2);
    await fire(t.svg, "pointerdown", d.x - 40, d.y);
    await fire(t.svg, "pointermove", d.x - 40, d.y - 30);
    await fire(t.svg, "pointerup", d.x - 40, d.y - 30);
    expect(spy).not.toHaveBeenCalled();
    await t.m.unmount();
  });

  it("během tahu má kresba třídu is-dragging (kurzor „grabbing“), po puštění ne", async () => {
    const t = await setup();
    const a = t.pos(0);
    await fire(t.nodes()[0], "pointerdown", a.x, a.y);
    expect(t.svg.getAttribute("class")).not.toContain("is-dragging");
    await fire(t.svg, "pointermove", a.x + 20, a.y);
    expect(t.svg.getAttribute("class")).toContain("is-dragging");
    await fire(t.svg, "pointerup", a.x + 20, a.y);
    expect(t.svg.getAttribute("class")).not.toContain("is-dragging");
    await t.m.unmount();
  });
});

describe("GraphView – po puštění kresba neposkočí (V-1) a vrcholy se nepřekryjí (V-5)", () => {
  /** tah vrcholu i do (x, y) po šesti krocích a puštění */
  const drag = async (
    t: Awaited<ReturnType<typeof setup>>,
    i: number,
    x: number,
    y: number,
  ) => {
    const a = t.pos(i);
    await fire(t.nodes()[i], "pointerdown", a.x, a.y);
    for (let k = 1; k <= 6; k++)
      await fire(
        t.svg,
        "pointermove",
        a.x + ((x - a.x) * k) / 6,
        a.y + ((y - a.y) * k) / 6,
      );
    await fire(t.svg, "pointerup", x, y);
  };

  it("vrchol puštěný vlevo od všech ostatních (plátno širší než kresba): ostatní vrcholy stojí, tažený zůstane, kde byl puštěn", async () => {
    const t = await setup();
    const others0 = [0, 1, 3].map((i) => t.pos(i));
    const vb0 = t.svg.getAttribute("viewBox");
    // b (x = 0,5) až k levému okraji plátna – za z (x = 0)
    await drag(t, 2, 40, t.pos(2).y);
    const b = t.pos(2);
    expect(b.x).toBeLessThan(others0[0].x - 10);
    expect(b.x).toBeCloseTo(40, 0);
    [0, 1, 3].forEach((i, k) => {
      expect(t.pos(i).x).toBeCloseTo(others0[k].x, 0);
      expect(t.pos(i).y).toBeCloseTo(others0[k].y, 0);
    });
    expect(t.svg.getAttribute("viewBox")).toBe(vb0);
    await t.m.unmount();
  });

  it("vrchol puštěný nad všechny ostatní: kresba se neposune dolů", async () => {
    const t = await setup();
    const others0 = [0, 2, 3].map((i) => t.pos(i));
    // a (nahoře) ještě výš – k hornímu okraji
    await drag(t, 1, t.pos(1).x + 60, 0);
    [0, 2, 3].forEach((i, k) => {
      expect(t.pos(i).x).toBeCloseTo(others0[k].x, 0);
      expect(t.pos(i).y).toBeCloseTo(others0[k].y, 0);
    });
    await t.m.unmount();
  });

  it("dva vrcholy puštěné za tentýž okraj se nepřekryjí (aspoň 2R od sebe)", async () => {
    const t = await setup();
    await drag(t, 1, -3000, -3000);
    await drag(t, 2, -3000, -3000);
    expect(t.dist(1, 2)).toBeGreaterThanOrEqual(36);
    // ani puštění přímo na jiný vrchol v režimu algoritmu
    const s = t.pos(3);
    await drag(t, 0, s.x, s.y);
    expect(t.dist(0, 3)).toBeGreaterThanOrEqual(36);
    await t.m.unmount();
  });
});

describe("GraphView – Upravit graf: tah s pevným poměrem stran", () => {
  it("náhled taženého vrcholu zůstává na plátně a puštění daleko mimo kresbu nezmenší (move v mezích)", async () => {
    const dispatch = vi.fn();
    const props = {
      graph: BOOK,
      state: emptyState(),
      width: 600,
      height: 300,
      screenMatrix: ID,
      edit: { selected: null, source: null, dispatch },
    };
    const m = await mount(h(GraphView, props));
    const svg = m.el.querySelector("svg.graph-svg")!;
    const node = (i: number) =>
      m.el.querySelectorAll<SVGGElement>("g.graph-node")[i];
    const at = (i: number) => {
      const [, x, y] =
        /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(node(i).style.transform) ??
        [];
      return { x: Number(x), y: Number(y) };
    };
    const vb = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const a = at(1);
    await fire(node(1), "pointerdown", a.x, a.y);
    await fire(svg, "pointermove", 4000, 4000);
    const p = at(1);
    expect(p.x).toBeLessThanOrEqual(vb[0] + vb[2]);
    expect(p.y).toBeLessThanOrEqual(vb[1] + vb[3]);
    await fire(svg, "pointerup", 4000, 4000);
    const mv = dispatch.mock.calls.find(([x]) => x.type === "move")?.[0];
    expect(mv).toBeDefined();
    const d0 = Math.hypot(at(0).x - at(3).x, at(0).y - at(3).y);
    await m.render(
      h(GraphView, {
        ...props,
        graph: {
          ...BOOK,
          nodes: BOOK.nodes.map((n) =>
            n.id === 1 ? { ...n, x: mv.x, y: mv.y } : n,
          ),
        },
      }),
    );
    const d1 = Math.hypot(at(0).x - at(3).x, at(0).y - at(3).y);
    expect(d1).toBeGreaterThanOrEqual(d0 - 0.5);
    await m.unmount();
  });
});

describe("GraphView – prst v režimu algoritmu", () => {
  it("prst, který chytil vrchol, nerozjede posun stránky (touchstart zrušen); dotyk do prázdna ano", async () => {
    const t = await setup();
    const ts = async (el: Element) => {
      const ev = new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
      });
      await act(async () => {
        el.dispatchEvent(ev);
      });
      return ev.defaultPrevented;
    };
    const a = t.pos(1);
    await fire(t.nodes()[1], "pointerdown", a.x, a.y, {
      pointerType: "touch",
    });
    expect(await ts(t.nodes()[1])).toBe(true);
    await fire(t.svg, "pointerup", a.x, a.y, { pointerType: "touch" });
    expect(await ts(t.svg)).toBe(false);
    await t.m.unmount();
  });
});
