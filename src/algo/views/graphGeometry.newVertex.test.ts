// Nový vrchol klikem do prázdna (G-05): leží pod kurzorem i v okraji letterboxu kresby s pevným poměrem
// stran (souřadnice smí mimo 0…1, kresba se nezmenší), nikdy na jiném vrcholu; když posunout musí, řekne to.
import { describe, expect, it } from "vitest";
import type { Graph } from "../algos/graphs/graph";
import {
  drawingExtent,
  graphViewport,
  newVertexSpot,
  R,
} from "./graphGeometry";
import { graphEditReducer, initGraphEdit } from "./graphEdit";

const G: Graph = {
  directed: false,
  weighted: false,
  aspect: 1,
  nodes: [
    { id: 0, label: "A", x: 0, y: 0 },
    { id: 1, label: "B", x: 1, y: 0 },
    { id: 2, label: "C", x: 0, y: 1 },
    { id: 3, label: "D", x: 1, y: 1 },
  ],
  edges: [{ id: 0, u: 0, v: 1, w: 1 }],
};
const W = 900;
const vp = graphViewport(W, 400, G.aspect, drawingExtent(G));
const pos = G.nodes.map((n) => vp.toPx(n.x, n.y));
const radius = () => R;

describe("newVertexSpot (G-05)", () => {
  it("klik vlevo do okraje letterboxu: vrchol ≤ 4 px od kliku, souřadnice x < 0, bez hlášky", () => {
    const left = pos[0]!.x;
    expect(left).toBeGreaterThan(200); // kresba je vepsaná doprostřed širokého plátna
    const click = { x: left - 120, y: (pos[0]!.y + pos[2]!.y) / 2 };
    const r = newVertexSpot(G, vp, W, click, radius, pos);
    expect(Math.hypot(r.p.x - click.x, r.p.y - click.y)).toBeLessThanOrEqual(4);
    expect(r.moved).toBe(false);
    expect(vp.fromPx(r.p.x, r.p.y).x).toBeLessThan(0);
  });

  it("klik na jiný vrchol: nový je od něj aspoň r1 + r2 + 6 a ohlásí posun", () => {
    const r = newVertexSpot(
      G,
      vp,
      W,
      { x: pos[3]!.x, y: pos[3]!.y },
      radius,
      pos,
    );
    for (const p of pos)
      expect(Math.hypot(r.p.x - p!.x, r.p.y - p!.y)).toBeGreaterThanOrEqual(
        2 * R + 6 - 1e-6,
      );
    expect(r.moved).toBe(true);
  });

  it("klik za viditelný okraj plátna: vrchol na okraji, ohlásí posun", () => {
    const r = newVertexSpot(G, vp, W, { x: 2, y: 200 }, radius, pos);
    expect(r.p.x).toBeGreaterThanOrEqual(R + 6 - 1e-6);
    expect(r.moved).toBe(true);
  });
});

describe("graphEditReducer addVertex (G-05)", () => {
  it("kresba s pevným poměrem stran: souřadnice mimo 0…1 zůstanou (vrchol pod kliknutím)", () => {
    const st = graphEditReducer(initGraphEdit(G), {
      type: "addVertex",
      x: -0.3,
      y: 0.5,
    });
    expect(st.graph.nodes[4]).toMatchObject({ x: -0.3, y: 0.5 });
    expect(st.message).toBeNull();
  });

  it("posunutý vrchol (moved) dostane hlášku v .ge-message", () => {
    const st = graphEditReducer(initGraphEdit(G), {
      type: "addVertex",
      x: 0.5,
      y: 0.5,
      moved: true,
    });
    expect(st.message).toMatch(/posunut/);
  });

  it("bez pevného poměru stran se souřadnice dál omezí na 0…1", () => {
    const st = graphEditReducer(initGraphEdit({ ...G, aspect: undefined }), {
      type: "addVertex",
      x: -0.3,
      y: 1.4,
    });
    expect(st.graph.nodes[4]).toMatchObject({ x: 0, y: 1 });
  });
});
