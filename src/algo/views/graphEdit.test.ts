// Editor grafu (čistý reducer): vrcholy, hrany, ceny, mazání, přesun, zpět, popisky, orientace,
// import / export textem se zachováním souřadnic.
import { describe, expect, it } from "vitest";
import {
  MAX_EDGES,
  MAX_NODES,
  parseGraph,
  type Graph,
} from "../algos/graphs/graph";
import { presetGraph, PRESETS } from "../algos/graphs/presets";
import {
  edgeLabel,
  graphEditReducer,
  graphEditText,
  importGraphText,
  initGraphEdit,
  nextLabel,
  topologyKey,
  type GraphEditAction,
  type GraphEditState,
} from "./graphEdit";

const g0 = (text = "1 2\n2 3", directed = false, weighted = false): Graph => {
  const g = parseGraph(text, directed, weighted);
  return g;
};
const run = (st: GraphEditState, ...a: GraphEditAction[]) =>
  a.reduce(graphEditReducer, st);
const labels = (g: Graph) => g.nodes.map((n) => n.label);
const edges = (g: Graph) =>
  g.edges.map(
    (e) =>
      `${g.nodes[e.u].label}${g.directed ? ">" : "-"}${g.nodes[e.v].label}${g.weighted ? ":" + e.w : ""}`,
  );
/** id odpovídají pozicím (algoritmy i edgeMarks na to spoléhají) */
const consistent = (g: Graph) =>
  g.nodes.every((n, i) => n.id === i) &&
  g.edges.every(
    (e, i) =>
      e.id === i && g.nodes[e.u] !== undefined && g.nodes[e.v] !== undefined,
  );

describe("nextLabel – další volný popisek", () => {
  it("čísla: nejmenší volné od 0 (od 1, když graf čísluje od 1)", () => {
    expect(nextLabel([])).toBe("0");
    expect(nextLabel(["0", "1", "3"])).toBe("2");
    expect(nextLabel(["1", "2", "3"])).toBe("4");
    expect(nextLabel(["2", "5"])).toBe("1");
  });
  it("písmena: další volné písmeno (A–Z, a–z), po Z čísla", () => {
    expect(nextLabel(["A", "B", "D"])).toBe("C");
    expect(nextLabel(["a", "b"])).toBe("c");
    const all = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    expect(nextLabel(all)).toBe("0");
  });
  it("smíšené popisky: číslo, které ještě není", () => {
    expect(nextLabel(["s", "t", "1"])).toBe("0");
  });
});

describe("vrcholy", () => {
  it("addVertex přidá vrchol s dalším popiskem a souřadnicemi v 0…1, s možností Zpět", () => {
    const st = run(initGraphEdit(g0()), { type: "addVertex", x: 0.5, y: 1.7 });
    expect(labels(st.graph)).toEqual(["1", "2", "3", "4"]);
    expect(st.graph.nodes[3]).toMatchObject({ id: 3, x: 0.5, y: 1 });
    expect(st.undo).toHaveLength(1);
    expect(consistent(st.graph)).toBe(true);
  });
  it("limit MAX_NODES: další vrchol se nepřidá a editor to řekne", () => {
    const text = Array.from({ length: MAX_NODES }, (_, i) => String(i)).join(
      "\n",
    );
    const st = run(initGraphEdit(g0(text)), {
      type: "addVertex",
      x: 0.1,
      y: 0.1,
    });
    expect(st.graph.nodes).toHaveLength(MAX_NODES);
    expect(st.message).toBe(`Graf má nejvýše ${MAX_NODES} vrcholů.`);
  });
  it("removeVertex smaže i incidentní hrany a přečísluje id", () => {
    const st = run(initGraphEdit(g0("1 2\n2 3\n3 1\n3 4")), {
      type: "remove",
      target: { kind: "node", id: 1 },
    });
    expect(labels(st.graph)).toEqual(["1", "3", "4"]);
    expect(edges(st.graph)).toEqual(["3-1", "3-4"]);
    expect(consistent(st.graph)).toBe(true);
  });
  it("move přesune vrchol; tah (jedno gesto) je v historii jen jednou", () => {
    let st = initGraphEdit(g0());
    st = run(
      st,
      { type: "move", id: 0, x: 0.2, y: 0.3, gesture: 7 },
      { type: "move", id: 0, x: 0.25, y: 0.35, gesture: 7 },
    );
    expect(st.graph.nodes[0]).toMatchObject({ x: 0.25, y: 0.35 });
    expect(st.undo).toHaveLength(1);
    st = run(st, { type: "move", id: 0, x: 0.9, y: 0.9, gesture: 8 });
    expect(st.undo).toHaveLength(2);
  });
});

describe("hrany", () => {
  it("connect přidá hranu (cena 1); u ohodnoceného zadanou cenu", () => {
    const st = run(initGraphEdit(g0("1 2\n3", false, true)), {
      type: "connect",
      from: 1,
      to: 2,
      w: 5,
    });
    expect(edges(st.graph)).toEqual(["1-2:1", "2-3:5"]);
    expect(st.selected).toEqual({ kind: "edge", id: 1 });
  });
  it("odmítne smyčku a duplicitu; v neorientovaném je u–v totéž co v–u", () => {
    const base = initGraphEdit(g0());
    const loop = run(base, { type: "connect", from: 0, to: 0 });
    expect(loop.graph.edges).toHaveLength(2);
    expect(loop.message).toBe(
      "Smyčku (hranu z vrcholu do něj samého) editor nepřidá.",
    );
    const dup = run(base, { type: "connect", from: 1, to: 0 });
    expect(dup.graph.edges).toHaveLength(2);
    expect(dup.message).toBe("Hrana 2–1 už v grafu je.");
    expect(dup.undo).toHaveLength(0);
  });
  it("orientovaný: u→v a v→u jsou různé hrany, duplicita u→v ne", () => {
    const st = run(initGraphEdit(g0("1 2", true)), {
      type: "connect",
      from: 1,
      to: 0,
    });
    expect(edges(st.graph)).toEqual(["1>2", "2>1"]);
    const dup = run(st, { type: "connect", from: 0, to: 1 });
    expect(dup.message).toBe("Hrana 1→2 už v grafu je.");
  });
  it("smyčky a násobné hrany jen s povolením v options", () => {
    const st = run(
      initGraphEdit(g0(), { allowLoops: true, allowMulti: true }),
      { type: "connect", from: 0, to: 0 },
      {
        type: "connect",
        from: 0,
        to: 1,
      },
    );
    expect(edges(st.graph)).toEqual(["1-2", "2-3", "1-1", "1-2"]);
  });
  it("limit MAX_EDGES", () => {
    const text = Array.from(
      { length: MAX_EDGES },
      (_, i) => `a${i} b${i}`,
    ).join("\n");
    const st = run(initGraphEdit(g0(text)), {
      type: "connect",
      from: 0,
      to: 3,
    });
    expect(st.graph.edges).toHaveLength(MAX_EDGES);
    expect(st.message).toBe(`Graf má nejvýše ${MAX_EDGES} hran.`);
  });
  it("ťuknutí na vrchol a pak na druhý = hrana (dotyk i klávesnice); znovu na tentýž = zrušit", () => {
    let st = run(initGraphEdit(g0("1 2\n3")), { type: "tapVertex", id: 0 });
    expect(st.source).toBe(0);
    expect(st.selected).toEqual({ kind: "node", id: 0 });
    st = run(st, { type: "tapVertex", id: 2 });
    expect(edges(st.graph)).toEqual(["1-2", "1-3"]);
    expect(st.source).toBeNull();
    const cancel = run(
      initGraphEdit(g0()),
      { type: "tapVertex", id: 0 },
      { type: "tapVertex", id: 0 },
    );
    expect(cancel.source).toBeNull();
    expect(cancel.selected).toBeNull();
  });
  it("setWeight: číslo (i desetinná čárka a typografické minus), jinak hláška a beze změny", () => {
    const base = initGraphEdit(g0("1 2 4", false, true));
    expect(
      run(base, { type: "setWeight", edge: 0, text: "2,5" }).graph.edges[0].w,
    ).toBe(2.5);
    expect(
      run(base, { type: "setWeight", edge: 0, text: "−3" }).graph.edges[0].w,
    ).toBe(-3);
    const bad = run(base, { type: "setWeight", edge: 0, text: "abc" });
    expect(bad.graph).toBe(base.graph);
    expect(bad.message).toBe("Cena „abc“ není číslo.");
  });
  it("remove bez cíle smaže vybranou hranu; bez výběru nic", () => {
    const st = run(
      initGraphEdit(g0()),
      { type: "select", target: { kind: "edge", id: 0 } },
      { type: "remove" },
    );
    expect(edges(st.graph)).toEqual(["2-3"]);
    expect(consistent(st.graph)).toBe(true);
    const none = initGraphEdit(g0());
    expect(run(none, { type: "remove" })).toBe(none);
  });
});

describe("orientace, ohodnocení, Zpět, načtení", () => {
  it("přepnutí na neorientovaný slije u→v a v→u do jedné hrany", () => {
    const st = run(initGraphEdit(g0("1 2\n2 1\n2 3", true)), {
      type: "setDirected",
      value: false,
    });
    expect(st.graph.directed).toBe(false);
    expect(edges(st.graph)).toEqual(["1-2", "2-3"]);
    expect(st.message).toBe("Sloučeny 1 dvojice protisměrných hran.");
    expect(consistent(st.graph)).toBe(true);
  });
  it("ohodnocení jde zapnout i vypnout, ceny zůstanou", () => {
    const st = run(initGraphEdit(g0("1 2 7", false, true)), {
      type: "setWeighted",
      value: false,
    });
    expect(st.graph.weighted).toBe(false);
    expect(run(st, { type: "setWeighted", value: true }).graph.edges[0].w).toBe(
      7,
    );
  });
  it("undo vrátí poslední úpravu (i mazání a přepnutí); prázdná historie nic", () => {
    const start = initGraphEdit(g0());
    const st = run(
      start,
      { type: "addVertex", x: 0.1, y: 0.1 },
      { type: "connect", from: 3, to: 0 },
      { type: "undo" },
    );
    expect(edges(st.graph)).toEqual(["1-2", "2-3"]);
    expect(labels(st.graph)).toHaveLength(4);
    expect(run(st, { type: "undo" }).graph).toBe(start.graph);
    expect(run(start, { type: "undo" })).toBe(start);
  });
  it("load (import, předvolba) jde vrátit; reset historii smaže", () => {
    const st = run(initGraphEdit(g0()), { type: "load", graph: g0("a b") });
    expect(labels(st.graph)).toEqual(["a", "b"]);
    expect(labels(run(st, { type: "undo" }).graph)).toEqual(["1", "2", "3"]);
    expect(run(st, { type: "reset", graph: g0("x y") }).undo).toEqual([]);
  });
  it("úpravy nemění původní graf (neměnná data – přehrávač drží staré kroky)", () => {
    const g = g0();
    const copy = structuredClone(g);
    run(
      initGraphEdit(g),
      { type: "move", id: 0, x: 0, y: 0 },
      { type: "remove", target: { kind: "node", id: 0 } },
    );
    expect(g).toEqual(copy);
  });
});

describe("text ↔ editor", () => {
  it("export: hrany v pořadí a izolované vrcholy na konci", () => {
    expect(graphEditText(g0("1 2\n3", false, false))).toBe("1 2\n3");
    expect(graphEditText(g0("a b 2.5\nc", true, true))).toBe("a b 2.5\nc");
  });
  it("import zachová souřadnice vrcholů se stejným jménem, nové umístí do volného místa", () => {
    const st = run(initGraphEdit(g0()), {
      type: "move",
      id: 0,
      x: 0.11,
      y: 0.22,
    });
    const r = importGraphText(st.graph, "1 2\n2 3\n3 9");
    expect(r.errors).toEqual([]);
    const one = r.graph.nodes.find((n) => n.label === "1")!;
    expect(one).toMatchObject({ x: 0.11, y: 0.22 });
    const nine = r.graph.nodes.find((n) => n.label === "9")!;
    expect(nine.x).toBeGreaterThanOrEqual(0);
    expect(nine.x).toBeLessThanOrEqual(1);
    // nový vrchol nesedí na žádném starém
    for (const n of r.graph.nodes.filter((m) => m.label !== "9"))
      expect(Math.hypot(n.x - nine.x, n.y - nine.y)).toBeGreaterThan(0.05);
  });
  it("import knižní předvolby (prasátko) zachová poměr stran, ohnutí i souřadnice", () => {
    const pig = presetGraph(PRESETS.find((p) => p.id === "pig")!);
    const r = importGraphText(pig, graphEditText(pig));
    expect(r.graph.aspect).toBe(pig.aspect);
    expect(r.graph.nodes.map((n) => [n.label, n.x, n.y])).toEqual(
      pig.nodes.map((n) => [n.label, n.x, n.y]),
    );
    expect(r.graph.edges.map((e) => e.bend)).toEqual(
      pig.edges.map((e) => e.bend),
    );
  });
  it("chyby ve vstupu se vrátí s číslem řádku a graf se neupraví", () => {
    const r = importGraphText(g0(), "1 2\n1 2 x");
    expect(r.errors[0].message).toContain("Řádek 2");
  });
  it("edgeLabel pro hlášky: 1–2 / 1→2", () => {
    const g = g0("1 2", true);
    expect(edgeLabel(g, 0, 1)).toBe("1→2");
    expect(edgeLabel(g0(), 0, 1)).toBe("1–2");
  });
});

describe("topologyKey – co mění výsledek algoritmu", () => {
  it("přesun vrcholu klíč nemění; hrana, cena, popisek ani orientace ano", () => {
    const st = initGraphEdit(g0("1 2 3\n2 3 1", false, true));
    const k = topologyKey(st.graph);
    expect(
      topologyKey(run(st, { type: "move", id: 0, x: 0.9, y: 0.1 }).graph),
    ).toBe(k);
    expect(
      topologyKey(run(st, { type: "connect", from: 0, to: 2 }).graph),
    ).not.toBe(k);
    expect(
      topologyKey(run(st, { type: "setWeight", edge: 0, text: "9" }).graph),
    ).not.toBe(k);
    expect(
      topologyKey(run(st, { type: "setDirected", value: true }).graph),
    ).not.toBe(k);
    expect(
      topologyKey(run(st, { type: "addVertex", x: 0, y: 0 }).graph),
    ).not.toBe(k);
  });
});
