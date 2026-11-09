import { describe, expect, it } from "vitest";
import { FIG_14_4, FIG_14_5, NET_14_2 } from "./flow.fixtures";
import {
  augmentArc,
  checkFlow,
  cutOf,
  defaultEnds,
  FLOW_MAX_CAP,
  flowByKey,
  flowValue,
  matchingOf,
  netFromText,
  netProblem,
  residual,
  residualArcs,
  type FlowNet,
} from "./flowNet";

const caps = (o: Readonly<Record<string, number>>) =>
  Object.entries(o)
    .map(([k, c]) => `${k.replace(">", " ")} ${c}`)
    .join("\n");

const net142 = (): FlowNet => netFromText(caps(NET_14_2.capacities));
const lab = (n: FlowNet, v: number) => n.graph.nodes[v].label;
const arcKey = (n: FlowNet, a: { u: number; v: number }) =>
  `${lab(n, a.u)}>${lab(n, a.v)}`;

describe("síť a zdroj/stok", () => {
  it("netFromText: orientovaná síť s kapacitami, z a s podle popisků", () => {
    const n = net142();
    expect(n.graph.directed).toBe(true);
    expect(n.graph.weighted).toBe(true);
    expect(n.graph.edges).toHaveLength(8);
    expect(lab(n, n.z)).toBe("z");
    expect(lab(n, n.s)).toBe("s");
  });

  it("defaultEnds: bez vrcholů z a s je zdrojem první a stokem poslední vrchol", () => {
    const n = netFromText("A B 3\nB C 2");
    expect(defaultEnds(n.graph)).toEqual({ z: 0, s: 2 });
  });

  it("netProblem: platná síť je v pořádku", () => {
    expect(netProblem(net142())).toBeNull();
  });

  it.each([
    ["", /prázdná/],
    ["z s 1\ns s 2", /smyčk/i],
    ["z s 1\nz s 2", /dvě hrany z→s/i],
    ["z s 2.5", /celé číslo/],
    ["z s -1", /celé číslo/],
    [`z s ${FLOW_MAX_CAP + 1}`, /celé číslo/],
  ])("netProblem(%j) hlásí chybu", (text, re) => {
    expect(netProblem(netFromText(text))).toMatch(re);
  });

  it("netProblem: zdroj a stok musí být různé a síť orientovaná", () => {
    const n = net142();
    expect(netProblem({ ...n, s: n.z })).toMatch(/různé/);
    expect(
      netProblem({ ...n, graph: { ...n.graph, directed: false } }),
    ).toMatch(/orientovan/);
  });
});

describe("rezervy (str. 355: r(uv) = c(uv) − f(uv) + f(vu))", () => {
  it("každá dvojice sousedů má dva oblouky – i když síť má hranu jen jedním směrem", () => {
    const n = net142();
    const arcs = residualArcs(n.graph);
    expect(arcs).toHaveLength(16);
    expect(arcs.map((a) => arcKey(n, a)).slice(0, 4)).toEqual([
      "z>a",
      "a>z",
      "z>b",
      "b>z",
    ]);
  });

  it("rezervy k toku 16 jsou přesně ty z obr. 14.4 vpravo", () => {
    const n = net142();
    const f = flowByKey(n.graph, NET_14_2.flow16);
    const got = Object.fromEntries(
      residualArcs(n.graph).map((a) => [arcKey(n, a), residual(n.graph, f, a)]),
    );
    expect(got).toEqual(FIG_14_4.residualPairs);
  });

  it("protisměrné hrany v síti: rezerva sčítá kapacitu i tok v protisměru", () => {
    const n = netFromText("z a 5\na z 3\na s 5");
    const arcs = residualArcs(n.graph);
    expect(arcs).toHaveLength(4);
    const za = arcs.find((a) => arcKey(n, a) === "z>a")!;
    expect(za.fwd).toBe(0);
    expect(za.back).toBe(1);
    // f(za) = 2, f(az) = 1 → r(za) = 5 − 2 + 1 = 4, r(az) = 3 − 1 + 2 = 4
    expect(residual(n.graph, [2, 1, 0], za)).toBe(4);
  });
});

describe("tok", () => {
  it("tok z obr. 14.2 vpravo má velikost 16 a splňuje kapacity i Kirchhoffův zákon", () => {
    const n = net142();
    const f = flowByKey(n.graph, NET_14_2.flow16);
    expect(flowValue(n, f)).toBe(16);
    expect(checkFlow(n, f)).toBeNull();
  });

  it("checkFlow najde porušenou kapacitu i Kirchhoffův zákon", () => {
    const n = net142();
    const f = flowByKey(n.graph, NET_14_2.flow16);
    expect(
      checkFlow(
        n,
        f.map((x, i) => (i === 0 ? 11 : x)),
      ),
    ).toMatch(/kapacit/);
    expect(
      checkFlow(
        n,
        f.map((x, i) => (i === 7 ? 6 : x)),
      ),
    ).toMatch(/Kirchhoff/);
  });

  it("augmentArc = řádky 5–7: nejdřív odečte v protisměru (δ), zbytek přičte po směru", () => {
    const n = netFromText("z a 5\na z 3\na s 5");
    const za = residualArcs(n.graph).find((a) => arcKey(n, a) === "z>a")!;
    // f(az) = 2: δ = min{2, 3} = 2 → f(az) = 0, f(za) += 1
    const r = augmentArc(n.graph, [0, 2, 0], za, 3);
    expect(r).toEqual({ f: [1, 0, 0], delta: 2 });
    // f(az) = 5 > ε: jen odečteme
    expect(augmentArc(n.graph, [0, 3, 0], za, 2).f).toEqual([0, 1, 0]);
  });

  it("minimální řez k toku z obr. 14.5: A = {z, a, b, c}, hrany a→d, b→d, c→s, kapacita 18", () => {
    const n = net142();
    const f = flowByKey(n.graph, FIG_14_5.flow);
    expect(flowValue(n, f)).toBe(18);
    const cut = cutOf(n, f);
    expect(cut.A.map((v) => lab(n, v))).toEqual(FIG_14_5.cutA);
    expect(
      cut.edges.map(
        (e) => `${lab(n, n.graph.edges[e].u)}>${lab(n, n.graph.edges[e].v)}`,
      ),
    ).toEqual(FIG_14_5.cutEdges);
    expect(cut.capacity).toBe(18);
  });
});

describe("párování (14.3)", () => {
  const text = [
    "z L1 1",
    "z L2 1",
    "L1 R1 1",
    "L1 R2 1",
    "L2 R1 1",
    "R1 s 1",
    "R2 s 1",
  ].join("\n");

  it("síť ve tvaru z → L → R → s s jednotkovými kapacitami: hrany L→R s tokem 1 = párování", () => {
    const n = netFromText(text);
    const f = [1, 1, 0, 1, 1, 1, 1];
    const m = matchingOf(n, f);
    expect(m).not.toBeNull();
    expect(m!.pairs.map(([a, b]) => `${lab(n, a)}–${lab(n, b)}`)).toEqual([
      "L1–R2",
      "L2–R1",
    ]);
    expect(m!.edges).toEqual([3, 4]);
  });

  it("obecná síť párováním není", () => {
    const n = net142();
    expect(matchingOf(n, new Array(8).fill(0))).toBeNull();
    // kapacita 2 → není síť párování
    expect(
      matchingOf(netFromText(text.replace("L1 R1 1", "L1 R1 2")), []),
    ).toBeNull();
  });
});
