// Meze tahu vrcholu kresby s pevným poměrem stran: kam smí tažený vrchol, aby se kresba po puštění
// (nový drawingExtent → graphViewport) nezmenšila.
import { describe, expect, it } from "vitest";
import type { Graph } from "../algos/graphs/graph";
import { drawingExtent, graphViewport, keepScaleBox } from "./graphGeometry";

const G: Graph = {
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
    { id: 1, u: 2, v: 3, w: 3 },
  ],
};

/** px na jednotku výšky kresby (vzdálenost dvou bodů s rozdílem y = 1) */
const scaleOf = (g: Graph, W: number, Hmax: number) => {
  const vp = graphViewport(W, Hmax, g.aspect, drawingExtent(g));
  return vp.toPx(0, 1).y - vp.toPx(0, 0).y;
};

const moved = (g: Graph, id: number, x: number, y: number): Graph => ({
  ...g,
  nodes: g.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
});

describe("keepScaleBox", () => {
  it("bez poměru stran (silové rozložení) žádné meze – měřítko na poloze nezávisí", () => {
    const g = { ...G, aspect: undefined };
    expect(keepScaleBox(g, 1, graphViewport(600, 300))).toBeNull();
  });

  it.each([
    [600, 300],
    [600, 800],
    [300, 400],
    [1200, 300],
  ])(
    "plátno %i × %i: vrchol puštěný v kterémkoli rohu mezí kresbu nezmenší",
    (W, Hmax) => {
      const vp = graphViewport(W, Hmax, G.aspect, drawingExtent(G));
      const s0 = scaleOf(G, W, Hmax);
      for (const id of [0, 1, 2, 3]) {
        const box = keepScaleBox(G, id, vp)!;
        expect(box.x2).toBeGreaterThan(box.x1);
        expect(box.y2).toBeGreaterThan(box.y1);
        for (const [px, py] of [
          [box.x1, box.y1],
          [box.x2, box.y1],
          [box.x1, box.y2],
          [box.x2, box.y2],
        ]) {
          const q = vp.fromPx(px, py);
          // jako GraphView: souřadnice na 4 desetinná místa
          const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
          expect(scaleOf(moved(G, id, r4(q.x), r4(q.y)), W, Hmax)).toBeCloseTo(
            s0,
            6,
          );
        }
      }
    },
  );

  it("meze nejsou užší než dnešní kresba (vrchol jde posunout aspoň po celém rozsahu ostatních)", () => {
    const vp = graphViewport(600, 300, G.aspect, drawingExtent(G));
    const box = keepScaleBox(G, 1, vp)!;
    const lo = vp.toPx(0, 0);
    const hi = vp.toPx(1, 1);
    expect(box.x1).toBeLessThanOrEqual(lo.x + 1);
    expect(box.x2).toBeGreaterThanOrEqual(hi.x - 1);
    expect(box.y1).toBeLessThanOrEqual(lo.y + 1);
    expect(box.y2).toBeGreaterThanOrEqual(hi.y - 1);
  });
});
