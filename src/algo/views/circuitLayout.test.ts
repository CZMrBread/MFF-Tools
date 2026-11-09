// Geometrie hradlové sítě: knižní kresby (obr. 15.1, 15.2), porty, pravoúhlé vodiče s tečkami
// rozvětvení, automatické rozvržení po vrstvách, pruhy vrstev, zásah ukazatelem.
import { describe, expect, it } from "vitest";
import { circuitLayers, type Circuit } from "../algos/parallel/circuit";
import { FIG_15_1 } from "../algos/parallel/circuitBook.fixtures";
import {
  majority,
  orChain,
  orTree,
  randomCircuit,
  rippleAdder,
} from "../algos/parallel/circuitPresets";
import {
  autoLayout,
  circuitBounds,
  clampInto,
  growBounds,
  GATE_SPAN,
  GRID,
  inPort,
  inPortAt,
  layerBands,
  nodeAt,
  nodeBox,
  outPort,
  outPortAt,
  overlaps,
  routeWires,
  STUB,
} from "./circuitLayout";

const node = (c: Circuit, id: string) => c.nodes.find((n) => n.id === id)!;

describe("obr. 15.1 – kresba jako v knize", () => {
  const c = majority();
  it("středy vrcholů podle obrázku (±0,01) a poměr stran 2,40 ± 0,05", () => {
    const x0 = node(c, "x").x;
    const xs = node(c, "q").x - x0;
    const y0 = node(c, "A1").y;
    const ys = node(c, "A3").y - y0;
    for (const [id, [nx, ny]] of Object.entries(FIG_15_1.coords)) {
      expect((node(c, id).x - x0) / xs, `${id}.x`).toBeCloseTo(nx, 1);
      expect(
        Math.abs((node(c, id).x - x0) / xs - nx),
        `${id}.x`,
      ).toBeLessThanOrEqual(0.01);
      expect(
        Math.abs((node(c, id).y - y0) / ys - ny),
        `${id}.y`,
      ).toBeLessThanOrEqual(0.01);
    }
    expect(Math.abs(xs / ys - FIG_15_1.aspect)).toBeLessThanOrEqual(0.05);
  });

  it("x a z vedou rovně do dolního portu A1 / horního portu A3 (jako v knize)", () => {
    const r = routeWires(c);
    const w = (to: string, port: number) =>
      r.wires.find((x) => x.to === to && x.port === port)!;
    expect(w("A1", 1).points).toHaveLength(2);
    expect(w("A3", 0).points).toHaveLength(2);
    expect(w("q", 0).points).toHaveLength(2);
  });

  it("tečky rozvětvení: x (odbočka dolů), y (sběrnice nahoru i dolů), z (odbočka nahoru)", () => {
    const j = routeWires(c)
      .junctions.map((p) => `${p.x},${p.y}`)
      .sort();
    expect(
      routeWires(c)
        .junctions.map((p) => p.from)
        .sort(),
    ).toEqual(["x", "y", "z"]);
    expect(j).toEqual(["36,80", "63,12", "63,148"].sort());
  });

  it("vrstvy oddělené po směru toku: popisky S₀ … S₄ zleva doprava, 4 dělicí čáry", () => {
    const b = layerBands(c, circuitLayers(c))!;
    expect(b).not.toBeNull();
    expect(b.labels.map((l) => l.layer)).toEqual([0, 1, 2, 3, 4]);
    expect(b.separators).toHaveLength(4);
    const at = b.labels.map((l) => l.at);
    expect([...at].sort((p, q) => p - q)).toEqual(at);
    b.separators.forEach((s, i) => {
      expect(s).toBeGreaterThan(at[i]);
      expect(s).toBeLessThan(at[i + 1]);
    });
  });
});

describe("obr. 15.2 – kresby jako v knize", () => {
  it("vlevo: hradla pod sebou ve stejném sloupci, výstup hradla vede zpět do horního vstupu dalšího", () => {
    const c = orChain(4);
    const gates = c.nodes.filter((n) => n.kind === "gate");
    expect(new Set(gates.map((g) => g.x)).size).toBe(1);
    expect(gates.map((g) => g.y)).toEqual(
      [...gates.map((g) => g.y)].sort((a, b) => a - b),
    );
    const back = routeWires(c).wires.find(
      (w) => w.to === "O2" && w.port === 0,
    )!;
    expect(back.from).toBe("O1");
    expect(back.points).toHaveLength(6);
    // vodič vede mezi hradly (pod O1, nad O2)
    const mid = back.points[2].y;
    expect(mid).toBeGreaterThan(nodeBox(node(c, "O1")).y1);
    expect(mid).toBeLessThan(nodeBox(node(c, "O2")).y0);
    // vrstvy nejdou po směru toku oddělit (hradla jsou v jednom sloupci)
    expect(layerBands(c, circuitLayers(c))).toBeNull();
  });

  it("vpravo: tok shora dolů, vstupy nahoře, dvojice vedou rovně dolů do hradla, y dole", () => {
    const c = orTree(8);
    expect(c.flow).toBe("down");
    const ins = c.nodes.filter((n) => n.kind === "in");
    expect(new Set(ins.map((n) => n.y)).size).toBe(1);
    const y = node(c, "y");
    expect(y.y).toBeGreaterThan(
      Math.max(...c.nodes.filter((n) => n.kind === "gate").map((g) => g.y)),
    );
    const r = routeWires(c);
    for (const w of r.wires.filter((w) => w.from.startsWith("x")))
      expect(w.points, w.key).toHaveLength(2);
    // porty hradla nahoře v ¼ a ¾ šířky, výstup dole uprostřed
    const g = node(c, "O1");
    const b = nodeBox(g, "down");
    expect(inPort(g, 0, "down")).toEqual({ x: g.x - GATE_SPAN / 4, y: b.y0 });
    expect(inPort(g, 1, "down")).toEqual({ x: g.x + GATE_SPAN / 4, y: b.y0 });
    expect(outPort(g, "down")).toEqual({ x: g.x, y: b.y1 });
    expect(layerBands(c, circuitLayers(c))!.labels).toHaveLength(5);
  });
});

describe("porty a vodiče", () => {
  it("hradlo: vstupy vlevo v ¼ a ¾ výšky, not uprostřed, výstup vpravo uprostřed", () => {
    const c = majority();
    const a = node(c, "A1");
    const b = nodeBox(a);
    expect(inPort(a, 0)).toEqual({ x: b.x0, y: a.y - GATE_SPAN / 4 });
    expect(inPort(a, 1)).toEqual({ x: b.x0, y: a.y + GATE_SPAN / 4 });
    expect(outPort(a)).toEqual({ x: b.x1, y: a.y });
    const not = { ...a, fn: "not" as const, inputs: ["x"] };
    expect(inPort(not, 0)).toEqual({ x: b.x0, y: a.y });
    expect(outPort(node(c, "q"))).toBeNull();
  });

  it("každý vodič je pravoúhlý a vede z výstupního portu zdroje do vstupního portu cíle", () => {
    for (const c of [
      majority(),
      orChain(5),
      orTree(4),
      rippleAdder(2),
      randomCircuit(3, 7, 4),
    ]) {
      const flow = c.flow ?? "right";
      for (const w of routeWires(c).wires) {
        const pts = w.points;
        expect(pts[0]).toEqual(outPort(node(c, w.from), flow));
        expect(pts[pts.length - 1]).toEqual(
          inPort(node(c, w.to), w.port, flow),
        );
        for (let i = 1; i < pts.length; i++) {
          const dx = Math.abs(pts[i].x - pts[i - 1].x);
          const dy = Math.abs(pts[i].y - pts[i - 1].y);
          expect(Math.min(dx, dy), `${w.key} úsek ${i}`).toBeLessThan(1e-9);
        }
      }
    }
  });
});

describe("autoLayout – po vrstvách", () => {
  it("sloupec = vrstva, vrcholy se nepřekrývají a leží na mřížce", () => {
    for (const src of [
      rippleAdder(2),
      randomCircuit(4, 9, 11),
      randomCircuit(3, 5, 2),
    ]) {
      const c = autoLayout({
        ...src,
        nodes: src.nodes.map((n) => ({ ...n, x: 0, y: 0 })),
      });
      const L = circuitLayers(c);
      for (const a of c.nodes) {
        expect(a.x % GRID, a.id).toBe(0);
        expect(a.y % GRID, a.id).toBe(0);
        expect(overlaps(c, a), a.id).toBe(false);
        for (const b of c.nodes) {
          if (L[a.id] === L[b.id]) expect(a.x, `${a.id}/${b.id}`).toBe(b.x);
          if (L[a.id] < L[b.id])
            expect(a.x, `${a.id}/${b.id}`).toBeLessThan(b.x);
        }
      }
      expect(layerBands(c, L)).not.toBeNull();
    }
  });

  it("mezi sousedními vrstvami zbude místo na pravoúhlé vodiče (2 pahýly + krok mřížky)", () => {
    for (const src of [rippleAdder(2), randomCircuit(4, 9, 11), majority()]) {
      const c = autoLayout({
        ...src,
        nodes: src.nodes.map((n) => ({ ...n, x: 0, y: 0 })),
      });
      const L = circuitLayers(c);
      for (const a of c.nodes)
        for (const b of c.nodes)
          if (L[b.id] === L[a.id] + 1)
            expect(
              nodeBox(b).x0 - nodeBox(a).x1,
              `${a.id} → ${b.id}`,
            ).toBeGreaterThanOrEqual(2 * STUB + GRID);
    }
  });

  it("kroužek vstupu / výstupu je menší než hradlo a vejde se do kroku vrstvy", () => {
    const c = majority();
    const x = nodeBox(node(c, "x"));
    const a1 = nodeBox(node(c, "A1"));
    expect(x.x1 - x.x0).toBeLessThan(a1.x1 - a1.x0);
    expect(x.y1 - x.y0).toBeLessThanOrEqual(a1.y1 - a1.y0);
    expect(x.x1 - x.x0).toBeLessThanOrEqual(GRID);
  });

  it("vstupy zůstanou v pořadí sítě shora dolů", () => {
    const c = autoLayout(rippleAdder(2));
    const ins = c.nodes.filter((n) => n.kind === "in");
    expect(ins.map((n) => n.y)).toEqual(
      [...ins.map((n) => n.y)].sort((a, b) => a - b),
    );
  });
});

describe("zásah ukazatelem a hranice", () => {
  const c = majority();
  it("vstupní port, výstupní port a vrchol pod ukazatelem", () => {
    const p = inPort(node(c, "O2"), 1);
    expect(inPortAt(c, { x: p.x + 3, y: p.y - 4 })).toEqual({
      node: "O2",
      port: 1,
    });
    expect(inPortAt(c, { x: p.x + 40, y: p.y })).toBeNull();
    const o = outPort(node(c, "A2"))!;
    expect(outPortAt(c, { x: o.x + 2, y: o.y })).toBe("A2");
    expect(nodeAt(c, { x: node(c, "O1").x, y: node(c, "O1").y })).toBe("O1");
    expect(nodeAt(c, { x: 170, y: 140 })).toBeNull();
  });

  it("hranice obsahují všechny vrcholy, popisky vstupů a pruh popisků vrstev", () => {
    const b = circuitBounds(c, { bandLabels: true });
    for (const n of c.nodes) {
      const r = nodeBox(n);
      expect(r.x0).toBeGreaterThanOrEqual(b.x);
      expect(r.x1).toBeLessThanOrEqual(b.x + b.w);
      expect(r.y1).toBeLessThanOrEqual(b.y + b.h);
    }
    expect(b.x).toBeLessThan(node(c, "x").x - 16); // popisek „x“ vlevo od kroužku
    expect(b.y + b.h).toBeGreaterThan(nodeBox(node(c, "A3")).y1 + 20);
  });
});

describe("výřez editoru drží místo (klik = prvek pod kurzorem)", () => {
  const vb = { x: -40, y: -40, w: 480, h: 240 };
  it("growBounds: síť uvnitř výřezu → stejný výřez; přesah → jen zvětšit, nic nesmrštit", () => {
    const c: Circuit = {
      flow: "right",
      nodes: [
        {
          id: "A1",
          kind: "gate",
          fn: "and",
          inputs: [null, null],
          x: 100,
          y: 80,
        },
      ],
    };
    expect(growBounds(vb, c, false)).toBe(vb);
    const far: Circuit = {
      ...c,
      nodes: [{ ...c.nodes[0], x: 600, y: 80 }],
    };
    const g = growBounds(vb, far, false);
    expect(g.x).toBe(vb.x);
    expect(g.y).toBe(vb.y);
    expect(g.x + g.w).toBeGreaterThan(600 + nodeBox(far.nodes[0]).x1 - 600);
    expect(g.h).toBeGreaterThanOrEqual(vb.h);
    expect(growBounds(vb, { nodes: [], flow: "right" }, false)).toBe(vb);
  });

  it("clampInto: vrchol u okraje se posune dovnitř i s popiskem (na mřížce), uvnitř zůstane", () => {
    const g = {
      id: "A1",
      kind: "gate" as const,
      fn: "and" as const,
      inputs: [null, null],
      x: 440,
      y: 200,
    };
    const c: Circuit = { flow: "right", nodes: [g] };
    const p = clampInto(c, g, vb);
    expect(p.x % GRID).toBe(0);
    expect(p.y % GRID).toBe(0);
    const moved: Circuit = { ...c, nodes: [{ ...g, ...p }] };
    expect(growBounds(vb, moved, false)).toBe(vb);
    expect(Math.abs(p.x - g.x) + Math.abs(p.y - g.y)).toBeLessThan(160);
    const inside = { ...g, x: 200, y: 100 };
    expect(clampInto({ ...c, nodes: [inside] }, inside, vb)).toEqual({
      x: 200,
      y: 100,
    });
    const inp = { id: "x", kind: "in" as const, inputs: [], x: -40, y: 0 };
    const q = clampInto({ flow: "right", nodes: [inp] }, inp, vb);
    expect(
      growBounds(vb, { flow: "right", nodes: [{ ...inp, ...q }] }, false),
    ).toBe(vb);
  });
});
