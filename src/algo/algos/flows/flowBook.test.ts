/* Příklady z knihy (flowPresets.ts) přesně podle obrázků kap. 14 – souřadnice, hrany, kapacity, toky. */
import { describe, expect, it } from "vitest";
import { NET_14_2, NET_14_3, NET_14_6, NET_14_7 } from "./flow.fixtures";
import {
  checkFlow,
  defaultEnds,
  flowByKey,
  flowValue,
  matchingOf,
  netProblem,
} from "./flowNet";
import {
  CAPS_14_7,
  FLOW_PRESETS,
  flowPresetById,
  presetNet,
  presetsFor,
} from "./flowPresets";
import type { Graph } from "../graphs/graph";

const edgesOf = (g: Graph) =>
  Object.fromEntries(
    g.edges.map((e) => [`${g.nodes[e.u].label}>${g.nodes[e.v].label}`, e.w]),
  );
/** souřadnice vrcholů normované jako book(): 0…1 v obdélníku středů, poměr stran z rozměrů */
function normalized(grid: Readonly<Record<string, readonly number[]>>) {
  const pts = Object.values(grid);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  return {
    aspect: (x1 - x0) / (y1 - y0),
    at: (l: string) => [
      (grid[l][0] - x0) / (x1 - x0),
      (grid[l][1] - y0) / (y1 - y0),
    ],
  };
}
function expectDrawing(
  g: Graph,
  grid: Readonly<Record<string, readonly number[]>>,
) {
  const n = normalized(grid);
  expect(g.aspect).toBeCloseTo(n.aspect, 5);
  expect(g.nodes.map((v) => v.label).sort()).toEqual(Object.keys(grid).sort());
  for (const v of g.nodes) {
    const [x, y] = n.at(v.label);
    expect(v.x, v.label).toBeCloseTo(x, 5);
    expect(v.y, v.label).toBeCloseTo(y, 5);
  }
}

describe("příklady z knihy – kresba a data jako na obrázcích", () => {
  it("všechny jsou platné sítě se zdrojem z a stokem s", () => {
    for (const p of FLOW_PRESETS) {
      const { graph } = presetNet(p);
      const ends = defaultEnds(graph);
      expect(graph.nodes[ends.z].label, p.id).toBe("z");
      expect(graph.nodes[ends.s].label, p.id).toBe("s");
      expect(netProblem({ graph, ...ends }), p.id).toBeNull();
      expect(p.note.length, p.id).toBeGreaterThan(40);
    }
  });

  it("obr. 14.2: šest vrcholů jako v knize (poměr stran 2 : 1) a kapacity hran", () => {
    const { graph, init } = presetNet(flowPresetById("obr-14-2")!);
    expectDrawing(graph, NET_14_2.grid);
    expect(graph.aspect).toBeCloseTo(2, 1);
    expect(edgesOf(graph)).toEqual(NET_14_2.capacities);
    expect(init).toBeNull();
  });

  it("obr. 14.4: stejná síť, počáteční tok 16 z obr. 14.2 vpravo, hledání DFS", () => {
    const p = flowPresetById("obr-14-4")!;
    const { graph, init } = presetNet(p);
    expect(edgesOf(graph)).toEqual(NET_14_2.capacities);
    const net = { graph, ...defaultEnds(graph) };
    expect(init).toEqual(flowByKey(graph, NET_14_2.flow16));
    expect(checkFlow(net, init!)).toBeNull();
    expect(flowValue(net, init!)).toBe(16);
    expect(p.search).toBe("dfs");
    expect(p.page).toBe(355);
  });

  it("obr. 14.3: čtyři vrcholy, pět hran s kapacitou 1", () => {
    const { graph } = presetNet(flowPresetById("obr-14-3")!);
    expectDrawing(graph, NET_14_3.grid);
    expect(edgesOf(graph)).toEqual(
      Object.fromEntries(NET_14_3.edges.map((k) => [k, 1])),
    );
  });

  it("obr. 14.6: z, L1…L5, R1…R5, s; hrany z obrázku, všechny kapacity 1; tučné párování je tok velikosti 4", () => {
    const { graph } = presetNet(flowPresetById("obr-14-6")!);
    expectDrawing(graph, NET_14_6.grid);
    const e = edgesOf(graph);
    expect(Object.keys(e)).toHaveLength(5 + NET_14_6.edges.length + 5);
    expect(Object.values(e).every((c) => c === 1)).toBe(true);
    for (const [a, b] of NET_14_6.edges) expect(e[`${a}>${b}`]).toBe(1);
    // tok podle tučných hran: z→L a R→s u spárovaných vrcholů
    const byKey: Record<string, number> = {};
    for (const k of NET_14_6.bold) {
      const [l, r] = k.split(">");
      byKey[k] = 1;
      byKey[`z>${l}`] = 1;
      byKey[`${r}>s`] = 1;
    }
    const net = { graph, ...defaultEnds(graph) };
    const f = flowByKey(graph, byKey);
    expect(checkFlow(net, f)).toBeNull();
    expect(flowValue(net, f)).toBe(NET_14_6.size);
    expect(matchingOf(net, f)!.pairs).toHaveLength(4);
  });

  it("obr. 14.7: vrcholy na místech z obrázku, hrany plné + tečkované + šedivé s doplněnými kapacitami", () => {
    const { graph } = presetNet(flowPresetById("obr-14-7")!);
    expectDrawing(graph, NET_14_7.grid);
    const all = [...NET_14_7.solid, ...NET_14_7.dotted, ...NET_14_7.gray];
    expect(Object.keys(edgesOf(graph)).sort()).toEqual([...all].sort());
    expect(Object.keys(CAPS_14_7).sort()).toEqual([...all].sort());
    expect(graph.edges.every((x) => x.w > 0)).toBe(true);
  });

  it("nabídky modulů: FordFulkerson má i příklad z toku 16, Dinic začíná obr. 14.7", () => {
    expect(presetsFor("ff").map((p) => p.id)).toContain("obr-14-4");
    expect(presetsFor("dinic").map((p) => p.id)).not.toContain("obr-14-4");
    expect(presetsFor("dinic").map((p) => p.id)).toContain("obr-14-7");
  });
});
