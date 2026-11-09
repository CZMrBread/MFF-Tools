// Souřadnice vrcholů v odkazu grafu (xy=, rozhodnutí vlastníka D2 ze 7. 11. 2026): volitelný parametr jen
// u ručně kreslených / přesunutých vrcholů; starší odkazy bez něj fungují beze změny (rozložení automaticky).
import { describe, expect, it } from "vitest";
import { bfs, dfs, dijkstra, GRAPH_ALGOS, jarnik } from "./algorithms";
import { type Graph } from "./graph";
import {
  buildGraph,
  decodeXY,
  defaultSpec,
  encodeXY,
  graphFromUrl,
  loadPresetGraph,
  pageParams,
  randomPageGraph,
  specFromParams,
} from "./graphPageModel";

/** Graf, který by se otevřel z parametrů (stejná cesta jako stránka). */
const reopen = (algo = bfs, out: Record<string, string>) =>
  graphFromUrl(specFromParams(algo, new URLSearchParams(out)));

/** souřadnice podle popisku */
const at = (g: Graph) =>
  Object.fromEntries(g.nodes.map((n) => [n.label, [n.x, n.y]]));

function expectSameDrawing(a: Graph, b: Graph) {
  expect(Object.keys(at(a)).sort()).toEqual(Object.keys(at(b)).sort());
  for (const n of a.nodes) {
    const m = b.nodes.find((q) => q.label === n.label)!;
    expect(Math.abs(m.x - n.x), n.label).toBeLessThanOrEqual(0.00005);
    expect(Math.abs(m.y - n.y), n.label).toBeLessThanOrEqual(0.00005);
  }
  expect(b.aspect === undefined).toBe(a.aspect === undefined);
  if (a.aspect !== undefined)
    expect(Math.abs(b.aspect! - a.aspect)).toBeLessThanOrEqual(0.00005);
}

const moved = (g: Graph, label: string, x: number, y: number): Graph => ({
  ...g,
  nodes: g.nodes.map((n) => (n.label === label ? { ...n, x, y } : n)),
});

/** ručně nakreslený graf (Vytvořit ▸ Prázdný, klepnutí a tahy): bez poměru stran, hrany „pozpátku“ */
const drawn: Graph = {
  directed: false,
  weighted: false,
  nodes: [
    { id: 0, label: "A", x: 0.1234, y: 0.2 },
    { id: 1, label: "B", x: 0.8, y: 0.15 },
    { id: 2, label: "C", x: 0.45, y: 0.9 },
    { id: 3, label: "D", x: 0.95, y: 0.95 },
  ],
  edges: [
    { id: 0, u: 2, v: 0, w: 1 },
    { id: 1, u: 0, v: 1, w: 1 },
  ],
};

describe("xy= v odkazu grafu", () => {
  it("kódování: celá čísla v desetitisícinách, jen znaky, které adresa nekóduje (%), tam a zpět", () => {
    const xy = encodeXY([
      [0.1234, 0.5],
      [-0.05, 1.2],
      [1, 0],
    ]);
    expect(xy).toBe("1234_5000_-500_12000_10000_0");
    expect(new URLSearchParams({ xy }).toString()).toBe(`xy=${xy}`);
    expect(decodeXY(xy)).toEqual({
      pts: [
        [0.1234, 0.5],
        [-0.05, 1.2],
        [1, 0],
      ],
    });
    // poměr stran kresby (jen když se liší od toho, co dá odkaz bez xy): a<desetitisíciny>, a0 = volná kresba
    expect(encodeXY([[0.5, 0.5]], 1.33337)).toBe("a13334_5000_5000");
    expect(decodeXY("a13334_5000_5000")).toEqual({
      aspect: 1.3334,
      pts: [[0.5, 0.5]],
    });
    expect(decodeXY("a0_5000_5000")).toEqual({
      aspect: null,
      pts: [[0.5, 0.5]],
    });
    // vzdálenost i poměr stran nejvýš 10 (vadný odkaz by kresbu zmenšil na tečku); malý poměr stran ≠ a0
    expect(decodeXY("100001_0")).toBeNull();
    expect(decodeXY("a100001_0_0")).toBeNull();
    expect(encodeXY([[0, 0]], 0.00001)).toBe("a1_0_0");
    for (const bad of ["", "1_2_3", "a_1_2", "1.5_2", "x_1", "1__2", "a5"])
      expect(decodeXY(bad), bad).toBeNull();
  });

  it("nezměněné kresby xy nemají: výchozí příklady, knižní a ostatní předvolby, náhodný graf", () => {
    for (const algo of GRAPH_ALGOS) {
      const g = buildGraph(defaultSpec(algo)).graph;
      expect(pageParams(algo, g, null, undefined), algo.id).toEqual({});
    }
    for (const id of [
      "pig",
      "condensation",
      "mst3",
      "weighted",
      "undirected10",
    ]) {
      const r = loadPresetGraph(dfs, id);
      expect(pageParams(dfs, r.graph, null, r.layout)?.xy, id).toBeUndefined();
    }
    const rnd = randomPageGraph(
      bfs,
      { directed: false, weighted: false },
      7,
      9,
      5,
    );
    expect(pageParams(bfs, rnd, null, undefined)?.xy).toBeUndefined();
  });

  it("přesunutý vrchol knižní předvolby: odkaz nese xy a otevře stejnou kresbu (poměr stran z knihy, bez a…)", () => {
    const r = loadPresetGraph(dfs, "pig");
    const g = moved(r.graph, "6", 0.3333, 0.7777);
    const out = pageParams(dfs, g, null, r.layout)!;
    expect(out.xy).toMatch(/^-?\d+(_-?\d+)+$/);
    const back = reopen(dfs, out);
    expectSameDrawing(g, back);
    // ohnutí hran z knihy zůstanou
    expect(back.edges.map((e) => e.bend)).toEqual(
      r.graph.edges.map((e) => e.bend),
    );
  });

  it("přesunutý vrchol výchozího příkladu: adresa je jen xy (g se nepíše) a otevře stejnou kresbu", () => {
    const g0 = buildGraph(defaultSpec(jarnik)).graph;
    const g = moved(g0, "A", 0.05, 0.05);
    const out = pageParams(jarnik, g, null, "mst3")!;
    expect(Object.keys(out)).toEqual(["xy"]);
    expectSameDrawing(g, reopen(jarnik, out));
  });

  it("ručně nakreslený graf: text z kresby + xy, znovu otevřený má stejné souřadnice a žádný poměr stran", () => {
    const out = pageParams(bfs, drawn, null, undefined)!;
    expect(out.g).toBe("C A\nA B\nD");
    expect(out.xy).toBeDefined();
    const back = reopen(bfs, out);
    expectSameDrawing(drawn, back);
    // stabilní: znovu otevřený graf dá tentýž odkaz
    expect(pageParams(bfs, back, null, undefined)).toEqual(out);
  });

  it("poměr stran se liší od rekonstrukce: kresba s aspect bez knihy nese a…, knižní struktura bez aspect a0", () => {
    const withAspect = { ...drawn, aspect: 1.5 };
    const out = pageParams(bfs, withAspect, null, undefined)!;
    expect(out.xy.startsWith("a15000_")).toBe(true);
    expectSameDrawing(withAspect, reopen(bfs, out));
    // prasátko nakreslené ručně (bez poměru stran knihy): otevře se bez knižní kresby i ohnutí
    const pig = loadPresetGraph(dfs, "pig").graph;
    const free: Graph = {
      directed: pig.directed,
      weighted: pig.weighted,
      nodes: pig.nodes,
      edges: pig.edges.map((e) => ({ id: e.id, u: e.u, v: e.v, w: e.w })),
    };
    const o2 = pageParams(dfs, free, null, undefined)!;
    expect(o2.xy.startsWith("a0_")).toBe(true);
    const back = reopen(dfs, o2);
    expectSameDrawing(free, back);
    expect(back.edges.every((e) => e.bend === undefined)).toBe(true);
  });

  it("starý odkaz bez xy: graf přesně jako dřív (buildGraph), žádná hláška", () => {
    for (const url of [
      "g=1+2%0A2+3&d=0&w=0",
      "g=A+B+3%0AB+C+2&d=0&w=1&s=B",
      "",
    ]) {
      const st = specFromParams(dijkstra, new URLSearchParams(url));
      expect(st.problem).toBeNull();
      expect(st).not.toHaveProperty("xy");
      expect(graphFromUrl(st)).toEqual(buildGraph(st.spec).graph);
    }
  });

  it("vadné xy (jiný počet vrcholů, nesmysl): rozložení automaticky a hláška nad plátnem; vadný graf xy ignoruje", () => {
    for (const xy of ["1_2", "abc", "1_2_3_4_5_6_7_8"]) {
      const st = specFromParams(
        bfs,
        new URLSearchParams({ g: "1 2\n2 3", xy }),
      );
      expect(st.xy, xy).toBeUndefined();
      expect(st.problem, xy).toBe(
        "Souřadnice vrcholů z odkazu nešly použít – graf je rozložen automaticky.",
      );
      expect(graphFromUrl(st)).toEqual(buildGraph(st.spec).graph);
    }
    const ok = specFromParams(
      bfs,
      new URLSearchParams({
        g: "1 2\n2 3",
        xy: "100_100_500_500_900_900",
        s: "Z",
      }),
    );
    expect(ok.xy).toBeDefined();
    expect(ok.problem).toBe("Vrchol Z v grafu není – začínáme z 1.");
    // vadný graf → výchozí příklad, xy z odkazu se na něj nepoužije
    const broken = specFromParams(
      dijkstra,
      new URLSearchParams({ g: "A B x", xy: "1_2_3_4" }),
    );
    expect(broken.xy).toBeUndefined();
    expect(broken.problem).toMatch(/^Graf z odkazu nešel použít/);
  });
});
