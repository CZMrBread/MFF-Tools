/**
 * Předvolby z Průvodce: kresba přesně podle obrázků (souřadnice, poměr stran, ohnuté hrany) a výsledky
 * algoritmů na nich podle knihy (obr. 5.8, 5.9, 7.1, 7.2/7.6). Očekávané hodnoty jsou v book.fixtures.ts.
 */
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { bfs, dfs, GRAPH_ALGOS, jarnik, kruskal, topo } from "./algorithms";
import {
  BFS_5_8,
  BRIDGES_5_10,
  DFS_5_9,
  MST3_7_2,
  MST4_7_1,
  PIG_5_5,
  RESIDUES_5_4,
  SCC_5_13,
} from "./book.fixtures";
import { parseGraph, type Graph, type GraphState } from "./graph";
import { bfsLayers } from "./layers";
import {
  drawingExtent,
  graphViewport,
  subLabelSides,
} from "../../views/graphGeometry";
import {
  isBookPreset,
  placeGraph,
  presetById,
  presetGraph,
  PRESETS,
  sourceText,
  type BookPreset,
} from "./presets";

const book = (id: string): BookPreset => {
  const p = presetById(id);
  if (!p || !isBookPreset(p)) throw new Error(`chybí knižní předvolba ${id}`);
  return p;
};
const id = (g: Graph, label: string) => {
  const n = g.nodes.find((x) => x.label === label);
  if (!n) throw new Error(`vrchol ${label} chybí`);
  return n.id;
};
const L = (g: Graph, v: number) => g.nodes[v].label;
const finalState = (steps: { state: GraphState }[]) =>
  steps[steps.length - 1].state;
/** hrany grafu jako množina „u-v“ (u neorientovaného seřazené) */
const edgeSet = (g: Graph, ids?: number[]) =>
  new Set(
    g.edges
      .filter((e) => !ids || ids.includes(e.id))
      .map((e) => {
        const [a, b] = [L(g, e.u), L(g, e.v)];
        return g.directed || a < b ? `${a}-${b}` : `${b}-${a}`;
      }),
  );
const pairSet = (
  pairs: readonly (readonly [string, string, ...unknown[]])[],
  directed: boolean,
) =>
  new Set(
    pairs.map(([a, b]) => (directed || a < b ? `${a}-${b}` : `${b}-${a}`)),
  );
const expectXY = (g: Graph, xy: Record<string, readonly [number, number]>) => {
  for (const [label, [x, y]] of Object.entries(xy)) {
    const n = g.nodes[id(g, label)];
    expect(n.x, `x(${label})`).toBeCloseTo(x, 2);
    expect(n.y, `y(${label})`).toBeCloseTo(y, 2);
  }
};

describe("knižní předvolby – kresba", () => {
  it("prasátko (obr. 5.5) má přesně souřadnice z knihy a poměr stran 11 : 7 – neprochází silovým rozložením", () => {
    const p = book("pig");
    expect(p.label).toBe("Obr. 5.5 „Prasátko“");
    expect(p.source).toBe("Průvodce");
    expect(p.page).toBe(113);
    const g = presetGraph(p);
    expectXY(g, PIG_5_5.xy);
    // silové rozložení normuje do [0,06; 0,94] – krajní 0 a 1 z knihy by nikdy nevyšly
    expect(Math.min(...g.nodes.map((n) => n.x))).toBe(0);
    expect(Math.max(...g.nodes.map((n) => n.y))).toBe(1);
    expect(g.aspect).toBeCloseTo(PIG_5_5.aspect, 3);
    expect(edgeSet(g)).toEqual(pairSet(PIG_5_5.edges, true));
    // seznamy následníků obr. 5.6
    for (const [u, succ] of Object.entries(PIG_5_5.successors))
      expect(
        g.edges.filter((e) => L(g, e.u) === u).map((e) => L(g, e.v)),
        u,
      ).toEqual(succ);
  });

  it("ostatní obrázky z knihy (5.4, 5.10, 5.13, 7.1, 7.2): hrany, ceny, směr i souřadnice podle knihy", () => {
    const cases: [
      string,
      {
        xy?: Record<string, readonly [number, number]>;
        aspect: number;
        edges: readonly (readonly [string, string, ...unknown[]])[];
      },
      boolean,
    ][] = [
      ["residues", RESIDUES_5_4, true],
      ["bridges", BRIDGES_5_10, false],
      ["scc", SCC_5_13, true],
      ["mst3", MST3_7_2, false],
      ["mst4", MST4_7_1, false],
      ["condensation", SCC_5_13.condensation, true],
    ];
    for (const [pid, fig, directed] of cases) {
      const p = book(pid);
      expect(p.label, pid).toMatch(/^Obr\. \d\.\d+/);
      const g = presetGraph(p);
      expect(g.directed, pid).toBe(directed);
      expect(edgeSet(g), pid).toEqual(pairSet(fig.edges, directed));
      for (const e of fig.edges)
        if (typeof e[2] === "number") {
          const found = g.edges.find(
            (x) =>
              (L(g, x.u) === e[0] && L(g, x.v) === e[1]) ||
              (!directed && L(g, x.u) === e[1] && L(g, x.v) === e[0]),
          );
          expect(found?.w, `${pid} ${e[0]}${e[1]}`).toBe(e[2]);
        }
      if (fig.xy) expectXY(g, fig.xy);
      expect(g.aspect, pid).toBeCloseTo(fig.aspect, 2);
    }
    // 7.1: mřížka po řádcích A–P, krok 1/3
    const g = presetGraph(book("mst4"));
    MST4_7_1.rows.forEach((row, r) =>
      [...row].forEach((label, c) => {
        expect(g.nodes[id(g, label)].x).toBeCloseTo(c / 3, 3);
        expect(g.nodes[id(g, label)].y).toBeCloseTo(r / 3, 3);
      }),
    );
  });

  it("graf zbytků (obr. 5.4): smyčka 0 vede doleva, smyčka 3 doprava a oblouky jsou ohnuté jako v knize", () => {
    const g = presetGraph(book("residues"));
    const edge = (a: string, b: string) =>
      g.edges.find((e) => L(g, e.u) === a && L(g, e.v) === b)!;
    expect(edge("0", "0").bend).toBe(180);
    expect(edge("3", "3").bend).toBe(0);
    for (const [a, b] of [
      ["0", "1"],
      ["2", "0"],
      ["4", "6"],
      ["6", "4"],
    ])
      expect(edge(a, b).bend, `${a}→${b}`).toBeTruthy();
    expect(edge("1", "3").bend).toBeUndefined();
  });

  it("každá knižní předvolba nese zdroj (obrázek, strana) a text hran odpovídá jejím hranám", () => {
    const books = PRESETS.filter(isBookPreset);
    expect(books.map((p) => p.id).sort()).toEqual(
      [
        "bridges",
        "condensation",
        "mst3",
        "mst4",
        "pig",
        "residues",
        "scc",
      ].sort(),
    );
    for (const p of books) {
      expect(sourceText(p)).toMatch(/^Průvodce labyrintem algoritmů, s\. \d+$/);
      const g = parseGraph(p.text, p.directed, p.weighted);
      expect(g.edges.length, p.id).toBe(p.edges.length);
      expect(g.nodes.length, p.id).toBe(p.nodes.length);
    }
    expect(sourceText(book("pig"))).toBe(
      "Průvodce labyrintem algoritmů, s. 113",
    );
  });
});

describe("knižní předvolby – výsledky algoritmů podle knihy", () => {
  it("BFS z 0 na prasátku = vrstvy obr. 5.8 (ve vrstvě v pořadí objevení), 5 a 8 nedosažitelné", () => {
    const g = presetGraph(book("pig"));
    const steps = materialize(bfs.run(g, id(g, BFS_5_8.start)));
    const st = finalState(steps);
    for (const [label, d] of Object.entries(BFS_5_8.dist))
      expect(st.nodeSub[id(g, label)], label).toBe(`D=${d}`);
    for (const label of BFS_5_8.unreachable)
      expect(st.nodeSub[id(g, label)], label).toBeUndefined();
    const { groups } = bfsLayers(g, id(g, BFS_5_8.start));
    expect(
      groups.slice(0, 4).map((gr) => gr.nodes.map((v) => L(g, v))),
    ).toEqual(BFS_5_8.layers);
    expect(groups.map((gr) => gr.label)).toEqual([
      "V₀",
      "V₁",
      "V₂",
      "V₃",
      "nedosažitelné",
    ]);
  });

  it("vrstvy BFS se kreslí jako v obr. 5.8: sloupce V₀…V₃ se souřadnicemi z knihy, 6→0 jako oblouk", () => {
    const g = presetGraph(book("pig"));
    const { graph: lg, groups } = bfsLayers(g, id(g, "0"));
    // nedosažitelné 5 a 8 (kniha je vynechává) mají vlastní pátý sloupec vpravo → sloupce knihy × 3/4
    const scaled = Object.fromEntries(
      Object.entries(BFS_5_8.xy).map(([k, [x, y]]) => [
        k,
        [(x * 3) / 4, y] as const,
      ]),
    );
    expectXY(lg, scaled);
    // rozestup sloupců = 2 × rozestup řádků jako v knize (4 sloupce: poměr 3,0)
    expect(lg.aspect).toBeCloseTo((BFS_5_8.aspect * 4) / 3, 0);
    expect(groups.at(-1)).toEqual({
      label: "nedosažitelné",
      nodes: BFS_5_8.unreachable.map((l) => id(g, l)),
      fullHeight: true,
    });
    const e60 = lg.edges.find((e) => L(lg, e.u) === "6" && L(lg, e.v) === "0")!;
    expect(e60.bend).toBeTruthy();
    // hrany mezi sousedními vrstvami zůstanou rovné
    const e01 = lg.edges.find((e) => L(lg, e.u) === "0" && L(lg, e.v) === "1")!;
    expect(e01.bend).toBeUndefined();
    for (const label of BFS_5_8.unreachable)
      expect(lg.nodes[id(lg, label)].x).toBe(1);
    // vrstvy se nemění: původní graf (souřadnice z obr. 5.5) zůstává netknutý
    expectXY(g, PIG_5_5.xy);
  });

  it("vrstvy BFS: zpětná hrana přes víc vrstev (6→0) je oblouk pod celou kresbou jako v obr. 5.8", () => {
    const g = presetGraph(book("pig"));
    const { graph: lg } = bfsLayers(g, id(g, "0"));
    for (const [a, b] of BFS_5_8.curved) {
      const e = lg.edges.find((x) => L(lg, x.u) === a && L(lg, x.v) === b)!;
      const u = lg.nodes[e.u];
      const v = lg.nodes[e.v];
      // vrchol oblouku = střed + normála × bend / 2 × délka (viz drawingExtent): y = střed + dx·aspect·bend/2
      const apexY = (u.y + v.y) / 2 + ((v.x - u.x) * lg.aspect! * e.bend!) / 2;
      expect(apexY, `${a}→${b}`).toBeGreaterThan(1);
    }
  });

  it("vrstvy BFS: popisek D= vrcholu se svislou hranou pod ním (1→3) se kreslí vpravo, ne přes hranu", () => {
    const g = presetGraph(book("pig"));
    const { graph: lg } = bfsLayers(g, id(g, "0"));
    const vp = graphViewport(600, 440, lg.aspect, drawingExtent(lg));
    const pos = lg.nodes.map((n) => vp.toPx(n.x, n.y));
    const side = subLabelSides(lg, pos);
    expect(side[id(lg, "1")]).toBe("right");
    expect(side[id(lg, "3")]).toBe("below"); // šipka 1→3 do něj vchází shora, 6→3 šikmo – pod ním je volno
    expect(side[id(lg, "2")]).toBe("below");
    // oblouk 6→0 do něj vchází zespodu (jako v knize) – popisek do strany, kde nevede hrana (UX-08)
    expect(["right", "left"]).toContain(side[id(lg, "0")]);
  });

  it("vrstvy BFS: ostatní oblouky vybočí nejvýš o půl řádku (i hrany k nedosažitelným) a obtažení vrstev má výšku celé kresby", () => {
    const g = presetGraph(book("pig"));
    const { graph: lg, groups } = bfsLayers(g, id(g, "0"));
    const rowGap = 1 / 2; // tři řádky → rozestup 0,5 v souřadnicích y
    const under = new Set(BFS_5_8.curved.map(([a, b]) => `${a}>${b}`));
    for (const e of lg.edges) {
      if (e.bend === undefined || e.u === e.v) continue;
      // zpětné hrany přes víc vrstev vedou pod celou kresbou (test výše)
      if (under.has(`${L(lg, e.u)}>${L(lg, e.v)}`)) continue;
      const a = lg.nodes[e.u];
      const b = lg.nodes[e.v];
      // délka ve skutečném poměru stran (x × aspect), vybočení oblouku = bend / 2 × délka
      const len = Math.hypot((b.x - a.x) * lg.aspect!, b.y - a.y);
      expect(
        (Math.abs(e.bend) * len) / 2,
        `${L(lg, e.u)}→${L(lg, e.v)}`,
      ).toBeLessThanOrEqual(rowGap / 2 + 1e-9);
    }
    expect(groups.every((gr) => gr.fullHeight)).toBe(true);
  });

  it("DFS z 0 na prasátku = obr. 5.9: časy in/out, závorky a třídy hran", () => {
    const g = presetGraph(book("pig"));
    const st = finalState(materialize(dfs.run(g, id(g, DFS_5_9.start))));
    for (const [label, io] of Object.entries(DFS_5_9.inOut))
      expect(st.nodeSub[id(g, label)], label).toBe(
        io ? `${io[0]}/${io[1]}` : undefined,
      );
    expect(st.vars.závorky).toBe(DFS_5_9.parens);
    const cls = {
      tree: "e-tree",
      forward: "e-forward",
      back: "e-back",
      cross: "e-cross",
    };
    for (const [key, c] of Object.entries(DFS_5_9.edgeClass)) {
      const [a, b] = key.split("-");
      const e = g.edges.find((x) => L(g, x.u) === a && L(g, x.v) === b)!;
      expect(st.edgeMarks[e.id], key).toBe(cls[c]);
    }
  });

  it("Jarník z E na obr. 7.2 přidává hrany v pořadí z knihy, cena 32", () => {
    const g = presetGraph(book("mst3"));
    const steps = materialize(jarnik.run(g, id(g, MST3_7_2.jarnik.start)));
    const order: string[] = [];
    let prev = new Set<number>();
    for (const s of steps) {
      const now = new Set(
        Object.entries(s.state.edgeMarks)
          .filter(([, m]) => m === "e-tree")
          .map(([k]) => Number(k)),
      );
      for (const e of now)
        if (!prev.has(e)) order.push([...edgeSet(g, [e])][0]);
      prev = now;
    }
    expect(order).toEqual([...pairSet(MST3_7_2.jarnik.order, false)]);
    expect(finalState(steps).vars["váha T"]).toBe(String(MST3_7_2.mstWeight));
  });

  it("Kruskal na obr. 7.6 přidá hrany s cenami 0, 1, 2, 3, 4, 6, 7, 9 v tomto pořadí a zahodí 5 a 8", () => {
    const g = presetGraph(book("mst3"));
    const steps = materialize(kruskal.run(g, 0));
    const added: number[] = [];
    let prev = new Set<number>();
    for (const s of steps) {
      const now = new Set(
        g.edges
          .filter((e) => s.state.edgeMarks[e.id] === "e-tree")
          .map((e) => e.id),
      );
      for (const e of now) if (!prev.has(e)) added.push(g.edges[e].w);
      prev = now;
    }
    expect(added).toEqual(MST3_7_2.kruskal.accepted);
    const st = finalState(steps);
    const rejected = g.edges
      .filter((e) => st.edgeMarks[e.id] === "e-rejected")
      .map((e) => e.w);
    // obr. 7.6 ukazuje jen přidávání; ceny 10 a 11 by smyčka „pro i = 1…m“ také zahodila – aplikace
    // po n − 1 hranách končí (tatáž kostra), takže je vůbec nezkoumá
    expect(rejected.sort((a, b) => a - b)).toEqual([5, 8]);
    for (const w of MST3_7_2.kruskal.rejected) expect(added).not.toContain(w);
    // E5: na konci jediný keřík (graf je souvislý) hloubky H ≤ log₂ n (Průvodce 7.4, důsledek o hloubce)
    const uf = st.uf!;
    const roots = uf.parent.flatMap((p, v) => (p === null ? [v] : []));
    expect(roots).toHaveLength(1);
    expect(2 ** uf.depth[roots[0]]).toBeLessThanOrEqual(g.nodes.length);
  });

  it("obr. 7.1 (neunikátní váhy): obě kostry z knihy jsou kostry o ceně 31 a Kruskal i Jarník z každého vrcholu najdou kostru o ceně 31", () => {
    const g = presetGraph(book("mst4"));
    const w = new Map(MST4_7_1.edges.map(([a, b, c]) => [`${a}-${b}`, c]));
    /** je to kostra grafu (n − 1 hran grafu bez kružnice)? */
    const isSpanningTree = (pairs: string[]) => {
      const parent = new Map(g.nodes.map((n) => [n.label, n.label]));
      const find = (x: string): string =>
        parent.get(x) === x ? x : find(parent.get(x)!);
      for (const p of pairs) {
        if (!w.has(p)) return false;
        const [a, b] = p.split("-").map(find);
        if (a === b) return false;
        parent.set(a, b);
      }
      return pairs.length === g.nodes.length - 1;
    };
    const cost = (pairs: string[]) =>
      pairs.reduce((s, p) => s + (w.get(p) ?? NaN), 0);
    // kniha: „dvě z jeho minimálních koster“ – minimálních koster je víc, testy přijmou kteroukoli
    for (const t of [MST4_7_1.mst1, MST4_7_1.mst2]) {
      const pairs = [...pairSet(t, false)];
      expect(isSpanningTree(pairs)).toBe(true);
      expect(cost(pairs)).toBe(MST4_7_1.mstWeight);
    }
    const runs = [
      finalState(materialize(kruskal.run(g, 0))),
      ...g.nodes.map((n) => finalState(materialize(jarnik.run(g, n.id)))),
    ];
    for (const st of runs) {
      const ids = g.edges
        .filter((e) => st.edgeMarks[e.id] === "e-tree")
        .map((e) => e.id);
      const pairs = [...edgeSet(g, ids)];
      expect(isSpanningTree(pairs), pairs.join(" ")).toBe(true);
      expect(cost(pairs)).toBe(MST4_7_1.mstWeight);
    }
  });

  it("graf komponent z obr. 5.13 je DAG: topologické uspořádání C₁, C₂, C₃", () => {
    const g = presetGraph(book("condensation"));
    const st = finalState(materialize(topo.run(g, 0)));
    expect(st.table?.rows[0]).toEqual(["C₁", "C₂", "C₃"]);
  });

  it("každý algoritmus doběhne na každé knižní předvolbě bez chyby", () => {
    for (const p of PRESETS.filter(isBookPreset))
      for (const algo of GRAPH_ALGOS) {
        const g = presetGraph({
          ...p,
          directed: algo.directed ?? p.directed,
          weighted: algo.weighted ?? p.weighted,
        });
        const steps = materialize(algo.run(g, 0));
        expect(
          steps.some((s) => s.error),
          `${p.id}/${algo.id}`,
        ).toBe(false);
      }
  });
});

describe("souřadnice po úpravě grafu", () => {
  it("vrcholy se stejným jménem si knižní souřadnice nechají, nové se rozmístí automaticky do plátna", () => {
    const pig = presetGraph(book("pig"));
    const edited = parseGraph(book("pig").text + "\n9 10\n10 11", true, false);
    const g = placeGraph(edited, pig);
    expectXY(g, PIG_5_5.xy);
    expect(g.aspect).toBeCloseTo(PIG_5_5.aspect, 3);
    const fresh = ["10", "11"].map((l) => g.nodes[id(g, l)]);
    for (const n of fresh) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(1);
      // nový vrchol neleží na žádném původním
      for (const o of pig.nodes)
        expect(
          Math.hypot(n.x - o.x, n.y - o.y),
          `${n.label} vs ${o.label}`,
        ).toBeGreaterThan(0.05);
    }
    // ohnutí hran se zachová u hran mezi stejně pojmenovanými vrcholy
    const res = presetGraph(book("residues"));
    const res2 = placeGraph(parseGraph(book("residues").text, true, true), res);
    expect(res2.edges.map((e) => e.bend)).toEqual(res.edges.map((e) => e.bend));
  });

  it("bez knižní předlohy (nebo bez společných vrcholů) je rozložení stejné jako dřív (silové)", () => {
    const text = "a b\nb c\nc a";
    const old = parseGraph(text, false, false);
    const g = placeGraph(parseGraph(text, false, false), null);
    expect(g.nodes).toEqual(old.nodes);
    expect(g.aspect).toBeUndefined();
    const other = placeGraph(
      parseGraph(text, false, false),
      presetGraph(book("pig")),
    );
    expect(other.nodes).toEqual(old.nodes);
    expect(other.aspect).toBeUndefined();
  });
});
