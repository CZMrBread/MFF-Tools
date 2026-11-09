/**
 * Testy grafových algoritmů (BFS, DFS, topologické uspořádání, Dijkstra, Jarník, Kruskal):
 * invarianty proti jednoduchým referenčním implementacím, příklady z Průvodce a regresní testy opravených chyb.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step } from "../../core/steps";
import {
  bfs,
  coversMark,
  dfs,
  dijkstra,
  GRAPH_ALGOS,
  inputProblem,
  jarnik,
  kruskal,
  legendFor,
  topo,
  usedMarks,
  type GraphAlgorithm,
} from "./algorithms";
import {
  cmpLabel,
  MAX_NODES,
  parseGraph,
  randomGraph,
  type Graph,
  type GraphState,
} from "./graph";
import { presetOffered, PRESETS } from "./presets";

/* ------------------------------------------------------------------ pomůcky */

const SEEDS = 40;

interface GenOpts {
  directed: boolean;
  weighted: boolean;
  /** povolit smyčky a násobné hrany */
  messy?: boolean;
  maxW?: number;
}

/** Náhodný graf jako text (nezávisle na randomGraph z aplikace): 1–9 vrcholů, i nesouvislý. */
function genText(seed: number, o: GenOpts): string {
  const r = rng(seed * 7919 + 13);
  const n = 1 + Math.floor(r() * 9);
  const m = Math.floor(r() * (2 * n + 2));
  const lines: string[] = [];
  for (let v = 1; v <= n; v++) if (r() < 0.25) lines.push(String(v)); // izolované / předem zmíněné vrcholy
  const seen = new Set<string>();
  for (let i = 0; i < m; i++) {
    const a = 1 + Math.floor(r() * n);
    const b = 1 + Math.floor(r() * n);
    if (!o.messy) {
      if (a === b) continue;
      const k = o.directed
        ? `${a}:${b}`
        : `${Math.min(a, b)}:${Math.max(a, b)}`;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    lines.push(
      `${a} ${b}${o.weighted ? " " + Math.floor(r() * ((o.maxW ?? 9) + 1)) : ""}`,
    );
  }
  if (!lines.length) lines.push("1");
  return lines.join("\n");
}

const gen = (seed: number, o: GenOpts): Graph =>
  parseGraph(genText(seed, o), o.directed, o.weighted);
const run = (algo: GraphAlgorithm, g: Graph, start = 0): Step<GraphState>[] =>
  materialize(algo.run(g, start));
const last = <T>(a: T[]): T => a[a.length - 1];
const idOf = (g: Graph, label: string) =>
  g.nodes.find((n) => n.label === label)!.id;

/** Sousedé v pořadí podle popisku – nezávislá referenční verze. */
function refNeighbors(
  g: Graph,
  u: number,
): { v: number; id: number; w: number }[] {
  const out: { v: number; id: number; w: number }[] = [];
  for (const e of g.edges) {
    if (e.u === u) out.push({ v: e.v, id: e.id, w: e.w });
    else if (!g.directed && e.v === u) out.push({ v: e.u, id: e.id, w: e.w });
  }
  // stabilní řazení podle popisku (při shodě podle pořadí hran)
  return out
    .map((x, i) => ({ x, i }))
    .sort(
      (a, b) =>
        cmpLabel(g.nodes[a.x.v].label, g.nodes[b.x.v].label) || a.i - b.i,
    )
    .map((p) => p.x);
}

function refBfs(g: Graph, s: number): Map<number, number> {
  const D = new Map<number, number>([[s, 0]]);
  const q = [s];
  while (q.length) {
    const v = q.shift()!;
    for (const { v: w } of refNeighbors(g, v)) {
      if (!D.has(w)) {
        D.set(w, D.get(v)! + 1);
        q.push(w);
      }
    }
  }
  return D;
}

/** Bellman–Ford: referenční vzdálenosti. */
function refDist(g: Graph, s: number): Map<number, number> {
  const d = new Map<number, number>([[s, 0]]);
  for (let it = 0; it <= g.nodes.length; it++) {
    for (const e of g.edges) {
      for (const [a, b] of g.directed
        ? [[e.u, e.v]]
        : [
            [e.u, e.v],
            [e.v, e.u],
          ]) {
        if (d.has(a) && (!d.has(b) || d.get(b)! > d.get(a)! + e.w))
          d.set(b, d.get(a)! + e.w);
      }
    }
  }
  return d;
}

/** Komponenty souvislosti (neorientovaně) – pole reprezentantů. */
function components(
  g: Graph,
  edgeFilter: (id: number) => boolean = () => true,
): number[] {
  const comp = g.nodes.map((n) => n.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of g.edges) {
      if (!edgeFilter(e.id)) continue;
      const m = Math.min(comp[e.u], comp[e.v]);
      if (comp[e.u] !== m || comp[e.v] !== m) {
        comp[e.u] = m;
        comp[e.v] = m;
        changed = true;
      }
    }
  }
  return comp;
}

/** Cena minimálního napnutého lesa – naivní Kruskal s přebarvováním komponent. */
function refMsfCost(
  g: Graph,
  restrictTo?: Set<number>,
): { cost: number; edges: number } {
  const comp = g.nodes.map((n) => n.id);
  let cost = 0;
  let edges = 0;
  for (const e of [...g.edges].sort((a, b) => a.w - b.w)) {
    if (restrictTo && !(restrictTo.has(e.u) && restrictTo.has(e.v))) continue;
    if (comp[e.u] === comp[e.v]) continue;
    const from = comp[e.v];
    const to = comp[e.u];
    for (let i = 0; i < comp.length; i++) if (comp[i] === from) comp[i] = to;
    cost += e.w;
    edges++;
  }
  return { cost, edges };
}

/** Kahnův algoritmus. */
function hasCycleDirected(g: Graph): boolean {
  const indeg = g.nodes.map(() => 0);
  for (const e of g.edges) indeg[e.v]++;
  const q = g.nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
  let removed = 0;
  while (q.length) {
    const v = q.pop()!;
    removed++;
    for (const e of g.edges) if (e.u === v && --indeg[e.v] === 0) q.push(e.v);
  }
  return removed !== g.nodes.length;
}

function checkSteps(algo: GraphAlgorithm, steps: Step<GraphState>[]) {
  expect(steps.length).toBeGreaterThan(0);
  for (const s of steps) {
    expect(s.message.length).toBeGreaterThan(0);
    expect(s.message).not.toMatch(/undefined|NaN|\d\.\d{10,}/);
    expect(s.message).toBe(s.message.trim());
    if (s.line === null) continue;
    expect(s.line).toBeGreaterThanOrEqual(0);
    expect(s.line).toBeLessThan(algo.pseudocode.length);
    expect(
      algo.pseudocode[s.line].trim(),
      `řádek ${s.line} je prázdný`,
    ).not.toBe("");
  }
}

const edgesWith = (st: GraphState, cls: string) =>
  Object.entries(st.edgeMarks)
    .filter(([, c]) => c === cls)
    .map(([id]) => Number(id));

/** Kolize barev: barva → množina komponent, které ji mají (Kruskal). */
function colorClashes(g: Graph, st: GraphState): string[] {
  const byColor = new Map<string, Set<string>>();
  for (const n of g.nodes)
    byColor.set(
      st.nodeMarks[n.id],
      (byColor.get(st.nodeMarks[n.id]) ?? new Set()).add(st.nodeSub[n.id]),
    );
  return [...byColor]
    .filter(([, s]) => s.size > 1)
    .map(([c, s]) => `${c}: ${[...s].join(" + ")}`);
}

/* ------------------------------------------------------------------ obecné vlastnosti */

describe("všechny algoritmy – obecné vlastnosti kroků", () => {
  it("řádky pseudokódu jsou v rozsahu a neprázdné, hlášky bez undefined/NaN (i smyčky, násobné hrany, nesouvislé grafy)", () => {
    for (let s = 1; s <= SEEDS; s++) {
      for (const algo of GRAPH_ALGOS) {
        const g = gen(s, {
          directed: algo.directed ?? s % 2 === 0,
          weighted: algo.weighted ?? false,
          messy: s % 3 === 0,
        });
        for (const start of [0, g.nodes.length - 1])
          checkSteps(algo, run(algo, g, start));
      }
    }
  });

  it("předvolby: každý algoritmus doběhne na každé předvolbě", () => {
    for (const p of PRESETS) {
      for (const algo of GRAPH_ALGOS) {
        if (!presetOffered(p, algo.id)) continue; // nabídka ji tomuto algoritmu neukáže (UX-07)
        const steps = run(
          algo,
          parseGraph(
            p.text,
            algo.directed ?? p.directed,
            algo.weighted ?? p.weighted,
          ),
          0,
        );
        expect(steps.length).toBeGreaterThan(1);
        checkSteps(algo, steps);
      }
    }
  });

  it("špatný počáteční vrchol, prázdný, obří nebo poškozený graf: jedna srozumitelná hláška, žádná výjimka", () => {
    const g = parseGraph(PRESETS[2].text, false, true);
    const node = (id: number) => ({ id, label: String(id), x: 0, y: 0 });
    const empty: Graph = {
      nodes: [],
      edges: [],
      directed: false,
      weighted: true,
    };
    const huge: Graph = {
      nodes: Array.from({ length: 5000 }, (_, i) => node(i)),
      edges: Array.from({ length: 4999 }, (_, i) => ({
        id: i,
        u: i,
        v: i + 1,
        w: 1,
      })),
      directed: false,
      weighted: true,
    };
    const broken: Graph = {
      nodes: [node(0), node(1)],
      edges: [{ id: 0, u: 0, v: 5, w: 1 }],
      directed: false,
      weighted: true,
    };
    const nanWeight: Graph = {
      nodes: [node(0), node(1)],
      edges: [{ id: 0, u: 0, v: 1, w: NaN }],
      directed: false,
      weighted: true,
    };
    for (const algo of GRAPH_ALGOS) {
      if (algo.needsStart) {
        for (const start of [NaN, -1, 1.5, 7, 1e9, Infinity]) {
          const steps = run(algo, g, start);
          expect(steps, `${algo.id}, start ${start}`).toHaveLength(1);
          expect(steps[0].message).toMatch(/Počáteční vrchol/);
          expect(steps[0].line).toBeNull();
        }
      }
      expect(run(algo, empty, 0).map((s) => s.message)).toEqual([
        "Graf je prázdný – zadejte alespoň jeden vrchol nebo hranu.",
      ]);
      const big = run(algo, huge, 0); // dříve: DFS na dlouhé cestě trvalo desítky sekund / RangeError
      expect(big).toHaveLength(1);
      expect(big[0].message).toMatch(
        /příliš velký \(5000 vrcholů, 4999 hran\) – nejvýše 60 vrcholů a 200 hran/,
      );
      expect(run(algo, broken, 0).map((s) => s.message)).toEqual([
        "Graf je poškozený: hrana vede do neexistujícího vrcholu.",
      ]);
      if (algo.weighted)
        expect(run(algo, nanWeight, 0).map((s) => s.message)).toEqual([
          "Hrana 0–1 nemá číselnou cenu.",
        ]);
    }
    expect(inputProblem(g, 0)).toBeNull();
    expect(inputProblem(g, null)).toBeNull();
    // největší přijímaný graf se krokuje (cesta o MAX_NODES vrcholech – nejhlubší možná rekurze DFS)
    const pathText = Array.from(
      { length: MAX_NODES - 1 },
      (_, i) => `${i + 1} ${i + 2}`,
    ).join("\n");
    for (const algo of GRAPH_ALGOS)
      expect(
        run(algo, parseGraph(pathText, algo.directed ?? false, true), 0).length,
      ).toBeGreaterThan(MAX_NODES);
  });

  it("legenda vysvětluje každou třídu, kterou kroky používají (dříve chyběla sestupná/vybraná hrana, vrchol cyklu, e-seen)", () => {
    for (const algo of GRAPH_ALGOS) {
      const cls = algo.legend.map((l) => l.cls);
      expect(new Set(cls).size, `${algo.id}: vzorek v legendě dvakrát`).toBe(
        cls.length,
      );
      const marks = algo.legend.flatMap((l) => l.marks);
      expect(new Set(marks).size, `${algo.id}: třída vysvětlená dvakrát`).toBe(
        marks.length,
      );
      for (const p of PRESETS) {
        const g = parseGraph(
          p.text,
          algo.directed ?? p.directed,
          algo.weighted ?? p.weighted,
        );
        const steps = run(algo, g, 0);
        const used = usedMarks(steps);
        for (const c of used) {
          expect(
            algo.legend.some((l) =>
              l.marks.some((m) => coversMark(m, new Set([c]))),
            ),
            `${algo.id} / ${p.label}: třída ${c} není v legendě`,
          ).toBe(true);
        }
        // legenda daného běhu ukazuje jen to, co v něm opravdu nastane
        for (const item of legendFor(algo, steps, g)) {
          const src = algo.legend.find((l) => l.cls === item.cls)!;
          expect(
            src.marks.some((m) => coversMark(m, used)),
            `${algo.id}: ${item.cls} v legendě, ale v běhu není`,
          ).toBe(true);
        }
      }
    }
  });

  it("legenda: hrany mají tvar čáry (čárkované tam, kde jsou čárkované na plátně), e-seen má vlastní vzorek", () => {
    const dashedOnCanvas = new Set([
      "e-back",
      "e-forward",
      "e-cross",
      "e-rejected",
      "e-seen",
    ]);
    for (const algo of GRAPH_ALGOS) {
      for (const l of algo.legend) {
        if (!l.marks.every((m) => m.startsWith("e-"))) {
          expect(
            l.shape === undefined || l.shape === "fill",
            `${algo.id}: ${l.cls}`,
          ).toBe(true);
          continue;
        }
        expect(l.shape, `${algo.id}: ${l.cls}`).toBe(
          l.marks.some((m) => dashedOnCanvas.has(m)) ? "line-dashed" : "line",
        );
        if (l.marks.includes("e-seen")) expect(l.cls).toBe("sw-seen");
      }
    }
  });

  it("legenda podle běhu: DFS v neorientovaném grafu bez dopředných a příčných hran; Kruskal přizná opakování barev", () => {
    const und = parseGraph(PRESETS[1].text, false, false);
    const dfsUnd = legendFor(dfs, run(dfs, und, 0), und).map((l) => l.cls);
    expect(dfsUnd).toContain("sw-back");
    expect(dfsUnd).not.toContain("sw-forward");
    expect(dfsUnd).not.toContain("sw-cross");
    const pig = parseGraph(PRESETS[0].text, true, false);
    expect(legendFor(dfs, run(dfs, pig, 0), pig).map((l) => l.cls)).toEqual(
      expect.arrayContaining(["sw-forward", "sw-cross", "sw-back"]),
    );
    // izolovaný vrchol: žádná hrana, tedy ani hrany v legendě
    const one = parseGraph("a", false, false);
    expect(legendFor(bfs, run(bfs, one, 0), one).map((l) => l.cls)).toEqual([
      "sw-open",
      "sw-current",
      "sw-closed",
    ]);
    // Kruskal: do 8 vrcholů bez poznámky, u 12 vrcholů (mřížka) s poznámkou
    const small = parseGraph(PRESETS[2].text, false, true);
    expect(
      legendFor(kruskal, run(kruskal, small), small).find(
        (l) => l.cls === "sw-comp",
      )!.label,
    ).not.toMatch(/opakují/);
    // stejná barva v kresbě grafu i v lese Union-Find – legenda to říká
    expect(
      legendFor(kruskal, run(kruskal, small), small).find(
        (l) => l.cls === "sw-comp",
      )!.label,
    ).toBe(
      "barva vrcholu v grafu i v lese = jeho komponenta (keřík Union-Findu)",
    );
    const grid = parseGraph(PRESETS[5].text, false, true);
    expect(
      legendFor(kruskal, run(kruskal, grid), grid).find(
        (l) => l.cls === "sw-comp",
      )!.label,
    ).toMatch(/opakují/);
  });

  it("chybový krok je označený (Visualizer ho ukáže červeně), běžné kroky ne; každý běh končí výsledkem", () => {
    for (const algo of GRAPH_ALGOS) {
      const bad = run(algo, parseGraph("", false, true), 0);
      expect(bad).toHaveLength(1);
      expect(bad[0].error).toBe(true);
      for (const p of PRESETS) {
        if (!presetOffered(p, algo.id)) continue;
        const g = parseGraph(
          p.text,
          algo.directed ?? p.directed,
          algo.weighted ?? p.weighted,
        );
        const steps = run(algo, g, 0);
        expect(steps.some((s) => s.error)).toBe(false);
        // závěrečný krok říká, že je hotovo (nebo že topologické uspořádání neexistuje)
        expect(last(steps).message, `${algo.id} / ${p.label}`).toMatch(
          /^Hotovo|Topologické uspořádání neexistuje\.$/,
        );
      }
    }
    expect(run(dijkstra, parseGraph("a b -1", false, true), 0)[0].error).toBe(
      true,
    );
  });

  it("tipy na stránce jsou pravdivé (Dijkstra: h(D) je nejdřív 14 přes B, po uzavření E 9)", () => {
    const g = parseGraph(PRESETS[2].text, false, true);
    const D = idOf(g, "D");
    const hs = run(dijkstra, g, idOf(g, "A")).map((s) => s.state.nodeSub[D]);
    expect(hs.filter((h, i) => h !== hs[i - 1])).toEqual(["∞", "14", "9"]);
    for (const algo of GRAPH_ALGOS)
      expect(algo.tip.length, algo.id).toBeGreaterThan(20);
  });
});

/* ------------------------------------------------------------------ BFS / DFS */

describe("BFS", () => {
  it("vzdálenosti a strom nejkratších cest odpovídají referenci; fronta = otevřené vrcholy", () => {
    for (let s = 1; s <= SEEDS; s++) {
      const g = gen(s, {
        directed: s % 2 === 0,
        weighted: false,
        messy: s % 3 === 0,
      });
      for (const start of g.nodes.map((n) => n.id)) {
        const steps = run(bfs, g, start);
        const D = refBfs(g, start);
        const fin = last(steps).state;
        for (const n of g.nodes) {
          expect(fin.nodeSub[n.id]).toBe(
            D.has(n.id) ? `D=${D.get(n.id)}` : undefined,
          );
          expect(fin.nodeMarks[n.id]).toBe(
            D.has(n.id) ? "n-closed" : undefined,
          );
        }
        // stromové hrany: právě |dosažené| − 1, každá spojuje sousední vrstvy
        const tree = edgesWith(fin, "e-tree");
        expect(tree.length).toBe(D.size - 1);
        for (const id of tree)
          expect(Math.abs(D.get(g.edges[id].u)! - D.get(g.edges[id].v)!)).toBe(
            1,
          );
        // v každém kroku: tabulka fronty obsahuje právě otevřené vrcholy
        for (const st of steps) {
          if (!st.state.table) continue;
          const open = g.nodes
            .filter((n) => st.state.nodeMarks[n.id] === "n-open")
            .map((n) => n.label);
          expect([...st.state.table.rows[0]].sort()).toEqual(open.sort());
        }
      }
    }
  });

  it("„prasátko“ z vrcholu 0 = vrstvy z obr. 5.8 v Průvodci", () => {
    const g = parseGraph(PRESETS[0].text, true, false);
    const fin = last(run(bfs, g, idOf(g, "0")));
    const layers: Record<string, number> = {
      "0": 0,
      "1": 1,
      "3": 1,
      "9": 1,
      "2": 2,
      "4": 2,
      "6": 2,
      "7": 3,
    };
    for (const n of g.nodes)
      expect(fin.state.nodeSub[n.id], `vrchol ${n.label}`).toBe(
        n.label in layers ? `D=${layers[n.label]}` : undefined,
      );
    expect(fin.message).toBe(
      "Hotovo – fronta je prázdná. Nejvzdálenější je 7 s D = 3. Nedosažitelné vrcholy: 5, 8.",
    );
  });
});

describe("DFS", () => {
  it("in/out a klasifikace hran odpovídají referenčnímu DFS; zásobník = otevřené vrcholy", () => {
    for (let s = 1; s <= SEEDS; s++) {
      const g = gen(s, {
        directed: s % 2 === 0,
        weighted: false,
        messy: s % 3 === 0,
      });
      for (const start of g.nodes.map((n) => n.id)) {
        // referenční rekurzivní DFS
        let T = 0;
        const tin = new Map<number, number>();
        const tout = new Map<number, number>();
        const cls = new Map<number, string>();
        const visit = (v: number, pe: number | null) => {
          tin.set(v, ++T);
          for (const { v: w, id } of refNeighbors(g, v)) {
            if (!g.directed && id === pe) continue;
            if (!tin.has(w)) {
              cls.set(id, "e-tree");
              visit(w, id);
            } else if (!g.directed) {
              if (!cls.has(id)) cls.set(id, "e-back");
            } else if (!tout.has(w)) cls.set(id, "e-back");
            else if (tin.get(w)! > tin.get(v)!) cls.set(id, "e-forward");
            else cls.set(id, "e-cross");
          }
          tout.set(v, ++T);
        };
        visit(start, null);

        const steps = run(dfs, g, start);
        const fin = last(steps).state;
        for (const n of g.nodes) {
          expect(fin.nodeSub[n.id]).toBe(
            tin.has(n.id) ? `${tin.get(n.id)}/${tout.get(n.id)}` : undefined,
          );
          expect(fin.nodeMarks[n.id]).toBe(
            tin.has(n.id) ? "n-closed" : undefined,
          );
        }
        for (const e of g.edges)
          expect(fin.edgeMarks[e.id], `hrana ${e.id}`).toBe(cls.get(e.id));
        for (const st of steps) {
          if (!st.state.table) continue;
          const open = g.nodes
            .filter((n) => st.state.nodeMarks[n.id] === "n-open")
            .map((n) => n.label);
          expect([...st.state.table.rows[0]].sort()).toEqual(open.sort());
          // sestupná hrana je zvýrazněná nejvýše jedna a jen do vstupu do vrcholu
          expect(edgesWith(st.state, "e-relax").length).toBeLessThanOrEqual(1);
        }
        expect(edgesWith(fin, "e-relax")).toEqual([]);
      }
    }
  });

  it("„prasátko“ z vrcholu 0 = obr. 5.9 v Průvodci (in/out, závorky, klasifikace hran)", () => {
    const g = parseGraph(PRESETS[0].text, true, false);
    const fin = last(run(dfs, g, idOf(g, "0")));
    const expected: Record<string, string | undefined> = {
      "0": "1/16",
      "1": "2/9",
      "2": "3/4",
      "3": "5/8",
      "4": "6/7",
      "5": undefined,
      "6": "11/14",
      "7": "12/13",
      "8": undefined,
      "9": "10/15",
    };
    for (const n of g.nodes)
      expect(fin.state.nodeSub[n.id], `vrchol ${n.label}`).toBe(
        expected[n.label],
      );
    expect(fin.state.vars["závorky"]).toBe("(0(1(2)2(3(4)4)3)1(9(6(7)7)6)9)0");
    const mark = (u: string, v: string) =>
      fin.state.edgeMarks[
        g.edges.find((e) => e.u === idOf(g, u) && e.v === idOf(g, v))!.id
      ];
    expect(mark("6", "0")).toBe("e-back");
    expect(mark("0", "3")).toBe("e-forward");
    expect(mark("6", "3")).toBe("e-cross");
    expect(fin.message).toBe(
      "Hotovo. Z 0 nejsou dosažitelné vrcholy 5, 8 – zůstaly nenalezené.",
    );
  });

  it("závěrečná hláška je celá věta i když je dosažitelné vše (dříve „Hotovo. “ s mezerou na konci)", () => {
    const g = parseGraph("a b\nb c\nc a", false, false);
    expect(last(run(dfs, g, 0)).message).toBe(
      "Hotovo, z a jsme navštívili všechny vrcholy.",
    );
  });

  it("smyčka a zdvojená hrana v neorientovaném grafu jsou zpětné hrany", () => {
    const g = parseGraph("a a\na b\nb a", false, false);
    const steps = run(dfs, g, 0);
    expect(last(steps).state.edgeMarks).toEqual({
      0: "e-back",
      1: "e-tree",
      2: "e-back",
    });
    expect(
      steps.some((s) => s.message === "Hrana a–a: smyčka → zpětná hrana."),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ topologické uspořádání */

describe("Topologické uspořádání", () => {
  it("acyklický graf → platné uspořádání všech vrcholů; cyklus → ohlášen i s vypsaným cyklem", () => {
    let cyclic = 0;
    const N = 3 * SEEDS;
    for (let s = 1; s <= N; s++) {
      const g = gen(s, { directed: true, weighted: false, messy: s % 4 === 0 });
      const steps = run(topo, g);
      const fin = last(steps);
      if (hasCycleDirected(g)) {
        cyclic++;
        expect(edgesWith(fin.state, "e-back").length).toBe(1);
        // vypsaný cyklus je opravdu cyklus v grafu a začíná i končí ve zvýrazněném vrcholu
        const m =
          /našli jsme cyklus (.+)\. Topologické uspořádání neexistuje\.$/.exec(
            fin.message,
          );
        expect(m, fin.message).not.toBeNull();
        const cyc = m![1].split(" → ").map((l) => idOf(g, l));
        expect(cyc.length).toBeGreaterThanOrEqual(2);
        expect(cyc[0]).toBe(last(cyc));
        expect(fin.state.nodeMarks[cyc[0]]).toBe("n-open n-bad");
        for (let i = 0; i + 1 < cyc.length; i++)
          expect(
            g.edges.some((e) => e.u === cyc[i] && e.v === cyc[i + 1]),
          ).toBe(true);
        // vrcholy cyklu jsou stále otevřené
        for (const v of cyc) expect(fin.state.nodeMarks[v]).toMatch(/n-open/);
      } else {
        expect(fin.message).toMatch(/^Hotovo/);
        const order = fin.state.table!.rows[0];
        expect([...order].sort()).toEqual(g.nodes.map((n) => n.label).sort());
        const pos = new Map(order.map((l, i) => [l, i]));
        for (const e of g.edges)
          expect(pos.get(g.nodes[e.u].label)!).toBeLessThan(
            pos.get(g.nodes[e.v].label)!,
          );
        for (const n of g.nodes)
          expect(fin.state.nodeSub[n.id]).toBe(`#${pos.get(n.label)! + 1}`);
      }
    }
    expect(cyclic).toBeGreaterThan(N / 15);
    expect(cyclic).toBeLessThan(N - N / 15);
  });

  it("tlačítko „Náhodný graf“ (volba acyclic) dává graf, na kterém uspořádání existuje", () => {
    for (let s = 1; s <= SEEDS; s++) {
      const g = parseGraph(
        randomGraph(8, 12, true, false, s, { acyclic: true }),
        true,
        false,
      );
      const fin = last(run(topo, g));
      expect(fin.message, `seed ${s}`).toMatch(/^Hotovo: /);
      expect(fin.state.table!.rows[0]).toHaveLength(8);
    }
  });

  it("smyčka je cyklus délky 1", () => {
    const fin = last(run(topo, parseGraph("a a\na b", true, false)));
    expect(fin.message).toBe(
      "Hrana a→a vede do otevřeného vrcholu – našli jsme cyklus a → a. Topologické uspořádání neexistuje.",
    );
  });
});

/* ------------------------------------------------------------------ Dijkstra */

describe("Dijkstra", () => {
  it("vzdálenosti odpovídají Bellman–Fordovi, e-tree je strom nejkratších cest, uzavřený vrchol má přesné h", () => {
    for (let s = 1; s <= SEEDS; s++) {
      const g = gen(s, {
        directed: s % 2 === 0,
        weighted: true,
        messy: s % 3 === 0,
      });
      for (const start of g.nodes.map((n) => n.id)) {
        const steps = run(dijkstra, g, start);
        const d = refDist(g, start);
        const fin = last(steps).state;
        for (const n of g.nodes)
          expect(fin.nodeSub[n.id]).toBe(
            d.has(n.id) ? String(d.get(n.id)) : "∞",
          );
        const tree = edgesWith(fin, "e-tree");
        expect(tree.length).toBe(d.size - 1);
        for (const id of tree) {
          const e = g.edges[id];
          expect(
            d.get(e.u)! + e.w === d.get(e.v)! ||
              (!g.directed && d.get(e.v)! + e.w === d.get(e.u)!),
          ).toBe(true);
        }
        expect(edgesWith(fin, "e-relax")).toEqual([]);
        // v okamžiku uzavření je odhad už přesný; tabulka = otevřené vrcholy seřazené podle h
        for (const st of steps) {
          for (const n of g.nodes) {
            const mark = st.state.nodeMarks[n.id];
            if (mark === "n-closed" || mark === "n-current")
              expect(st.state.nodeSub[n.id]).toBe(String(d.get(n.id)));
          }
          if (!st.state.table) continue;
          const open = g.nodes
            .filter((n) => st.state.nodeMarks[n.id] === "n-open")
            .map((n) => n.label);
          expect(st.state.table.rows.map((r) => r[0]).sort()).toEqual(
            open.sort(),
          );
          const hs = st.state.table.rows.map((r) => Number(r[1]));
          expect(hs).toEqual([...hs].sort((a, b) => a - b));
        }
        const unreached = g.nodes
          .filter((n) => !d.has(n.id))
          .map((n) => n.label);
        expect(last(steps).message.includes("Nedosažitelné vrcholy")).toBe(
          unreached.length > 0,
        );
      }
    }
  });

  it("záporná hrana → algoritmus odmítne s vysvětlením a jmenuje hranu", () => {
    const steps = run(dijkstra, parseGraph("a b 1\nb c -2", true, true), 0);
    expect(steps).toHaveLength(1);
    expect(steps[0].message).toBe(
      "Dijkstrův algoritmus vyžaduje nezáporné délky hran – hrana b→c má délku −2.",
    );
  });

  it("desetinné délky: zobrazené hodnoty nemají artefakty plovoucí čárky (0.1 + 0.2) a mají desetinnou čárku (E3)", () => {
    const g = parseGraph("A B 0.1\nB C 0.2\nA C 0.7", false, true);
    const steps = run(dijkstra, g, 0);
    expect(last(steps).state.nodeSub).toEqual({ 0: "0", 1: "0,1", 2: "0,3" });
    expect(steps.map((s) => s.message)).toContain(
      "Hrana do C: je h(C) = 0,7 > 0,1 + 0,2 = 0,3?",
    );
    // proměnné pod tabulkou: h(v) s čárkou (VarsView vypisuje hodnotu tak, jak je)
    expect(steps.map((s) => s.state.vars["h(v)"])).toContain("0,1");
    for (const s of steps) {
      expect(s.message).not.toMatch(/0000000/);
      expect(JSON.stringify(s.state)).not.toMatch(/0000000/);
    }
  });
});

/* ------------------------------------------------------------------ minimální kostra */

describe("Jarník", () => {
  it("cena = minimální kostra komponenty startu, e-tree je strom na vrcholech T, kandidáti = hrany přes řez", () => {
    for (let s = 1; s <= SEEDS; s++) {
      const g = gen(s, {
        directed: false,
        weighted: true,
        messy: s % 3 === 0,
        maxW: s % 5 === 0 ? 2 : 20,
      });
      const comp = components(g);
      for (const start of g.nodes.map((n) => n.id)) {
        const steps = run(jarnik, g, start);
        const fin = last(steps).state;
        const inComp = new Set(
          g.nodes.filter((n) => comp[n.id] === comp[start]).map((n) => n.id),
        );
        const ref = refMsfCost(g, inComp);
        expect(fin.vars["váha T"]).toBe(String(ref.cost));
        const tree = edgesWith(fin, "e-tree");
        expect(tree.length).toBe(inComp.size - 1);
        expect(tree.reduce((a, id) => a + g.edges[id].w, 0)).toBe(ref.cost);
        for (const n of g.nodes)
          expect(fin.nodeMarks[n.id]).toBe(
            inComp.has(n.id) ? "n-closed" : undefined,
          );
        expect(edgesWith(fin, "e-active")).toEqual([]);
        expect(edgesWith(fin, "e-candidate")).toEqual([]);
        for (const st of steps) {
          const T = new Set(
            g.nodes
              .filter((n) => st.state.nodeMarks[n.id] === "n-closed")
              .map((n) => n.id),
          );
          const tr = new Set(edgesWith(st.state, "e-tree"));
          expect(tr.size).toBe(T.size - 1);
          const c = components(g, (id) => tr.has(id));
          expect(new Set([...T].map((v) => c[v])).size).toBe(1);
          for (const e of g.edges) {
            const m = st.state.edgeMarks[e.id];
            if (m === "e-candidate" || m === "e-active")
              expect(T.has(e.u) !== T.has(e.v)).toBe(true);
            if (m === "e-rejected") expect(T.has(e.u) && T.has(e.v)).toBe(true);
          }
          // tabulka: hrany přes řez zapsané „vrchol v T – vrchol mimo T“, podle ceny
          for (const row of st.state.table!.rows) {
            const [a, b] = row[0].split("–").map((l) => idOf(g, l));
            expect(T.has(a) && !T.has(b), `řádek ${row[0]}`).toBe(true);
          }
          const ws = st.state.table!.rows.map((r) => Number(r[1]));
          expect(ws).toEqual([...ws].sort((x, y) => x - y));
        }
      }
    }
  });

  it("nesouvislý graf: hláška se správným skloňováním a cenou kostry komponenty", () => {
    const msg = (text: string) =>
      last(run(jarnik, parseGraph(text, false, true), 0)).message;
    expect(msg("a b 2\nc")).toBe(
      "Hotovo, ale graf není souvislý – 1 vrchol zůstal mimo. Máme minimální kostru komponenty vrcholu a (váha 2).",
    );
    expect(msg("a b 2\nc d 1")).toMatch(/2 vrcholy zůstaly mimo/);
    expect(msg("a b 2\nc\nd\ne\nf\ng")).toMatch(/5 vrcholů zůstalo mimo/);
    expect(msg("a b 0.1\nb c 0.2")).toBe(
      "Hotovo, váha minimální kostry je 0,3.",
    );
    expect(
      last(run(jarnik, parseGraph("a b 0.1\nb c 0.2", false, true), 0)).state
        .vars["váha T"],
    ).toBe("0,3");
  });
});

describe("Kruskal", () => {
  it("cena = minimální napnutý les, popisky komponent odpovídají lesu T v každém kroku, hrany jdou podle ceny", () => {
    for (let s = 1; s <= SEEDS; s++) {
      const g = gen(s, {
        directed: false,
        weighted: true,
        messy: s % 3 === 0,
        maxW: s % 5 === 0 ? 2 : 20,
      });
      const steps = run(kruskal, g);
      const fin = last(steps).state;
      const ref = refMsfCost(g);
      const tree = edgesWith(fin, "e-tree");
      expect(tree.length).toBe(ref.edges);
      expect(tree.reduce((a, id) => a + g.edges[id].w, 0)).toBe(ref.cost);
      expect(fin.vars["váha T"] ?? "0").toBe(String(ref.cost));
      const connected = ref.edges === g.nodes.length - 1;
      if (connected)
        expect(last(steps).message).toMatch(
          new RegExp(`váha (kostry )?${ref.cost}[.)]`),
        );
      else
        expect(last(steps).message).toContain(
          `Počet komponent: ${g.nodes.length - ref.edges}, váha ${ref.cost}.`,
        );
      for (const st of steps.slice(1)) {
        const tr = new Set(edgesWith(st.state, "e-tree"));
        const c = components(g, (id) => tr.has(id));
        for (const a of g.nodes)
          for (const b of g.nodes)
            expect(st.state.nodeSub[a.id] === st.state.nodeSub[b.id]).toBe(
              c[a.id] === c[b.id],
            );
        // vrcholy jedné komponenty mají stejnou barvu; do 8 komponent mají různé komponenty různé barvy
        for (const a of g.nodes)
          for (const b of g.nodes)
            if (c[a.id] === c[b.id])
              expect(st.state.nodeMarks[a.id]).toBe(st.state.nodeMarks[b.id]);
        if (new Set(c).size <= 8) expect(colorClashes(g, st.state)).toEqual([]);
      }
      const ws = fin.table!.rows.map((r) => Number(r[2]));
      expect(ws).toEqual([...ws].sort((a, b) => a - b));
    }
  });

  it("různé komponenty mají různou barvu, pokud jich je nejvýše 8 (dříve barva = id kořene mod 8)", () => {
    // vrcholy: a,b (id 0,1), c..h (id 2..7, izolované), i,j (id 8,9) → na konci 8 komponent
    const g = parseGraph("a b 1\nc\nd\ne\nf\ng\nh\ni j 1", false, true);
    const fin = last(run(kruskal, g)).state;
    expect(new Set(g.nodes.map((n) => fin.nodeSub[n.id])).size).toBe(8);
    expect(colorClashes(g, fin)).toEqual([]);
    // předvolby s 10 a 12 vrcholy: jakmile komponent ubude na 8, žádná kolize; barva přeživší komponenty se při Union nemění
    for (const p of PRESETS) {
      const h = parseGraph(p.text, false, true);
      const steps = run(kruskal, h).slice(1);
      let prev: GraphState | null = null;
      for (const s of steps) {
        const comps = new Set(h.nodes.map((n) => s.state.nodeSub[n.id])).size;
        if (comps <= 8)
          expect(
            colorClashes(h, s.state),
            `${p.label}, ${comps} komponent`,
          ).toEqual([]);
        if (prev && h.nodes.length <= 8) {
          // bez nutnosti přebarvovat (n ≤ 8) smí barvu změnit jen komponenta, která při Union zanikla
          const changed = new Set(
            h.nodes
              .filter((n) => prev!.nodeMarks[n.id] !== s.state.nodeMarks[n.id])
              .map((n) => prev!.nodeSub[n.id]),
          );
          expect(changed.size).toBeLessThanOrEqual(1);
        }
        prev = s.state;
      }
    }
  });

  it("Union-Find podle Průvodce (7.4): Union podle hloubky keříku bez komprese cest, hlášky mluví o Kořen/Find/Union", () => {
    // a–b, c–d (dva keříky hloubky 1), pak b–d: stejně hluboké → kořen c pod a; pak e–a: mělčí e pod a
    const g = parseGraph("a b 1\nc d 2\nb d 3\ne d 4", false, true);
    const steps = run(kruskal, g);
    const msgs = steps.map((s) => s.message);
    expect(msgs).toContain("Find(b, d): Kořen(b) = a, Kořen(d) = c.");
    expect(msgs).toContain(
      "Různé komponenty – hranu přidáme do T. Union: keříky jsou stejně hluboké, c připojíme pod a a keřík se prohloubí. Váha T = 6.",
    );
    expect(msgs).toContain("Find(e, d): Kořen(e) = e, Kořen(d) = a.");
    expect(msgs).toContain(
      "Různé komponenty – hranu přidáme do T. Union: mělčí keřík e připojíme pod kořen a. Váha T = 10.",
    );
    expect(last(steps).message).toBe(
      "Hotovo: máme n − 1 = 4 hrany, kostra je hotová (váha 10).",
    );
    expect(new Set(Object.values(last(steps).state.nodeSub))).toEqual(
      new Set(["komp. a"]),
    );
    // výklad netvrdí nic o kompresi cest ani o „skoro konstantním“ čase a pseudokód používá Kořen z knihy
    expect(kruskal.description).not.toMatch(/kompres|konstantn|rank/i);
    expect(kruskal.description).toMatch(/O\(log n\)/);
    // E5: tip vede ke kresbě keříků (Find = zvýrazněné cesty do kořenů)
    expect(kruskal.tip).toMatch(/keřík/);
    expect(kruskal.tip).toMatch(/Find/);
    expect(kruskal.pseudocode.join("\n")).toMatch(/Kořen\(u\) ≠ Kořen\(v\)/);
  });

  it("závěrečné hlášky: předčasný konec jen když opravdu zbývají hrany, les, skloňování, desetinné ceny", () => {
    const msgs = (text: string) =>
      run(kruskal, parseGraph(text, false, true)).map((s) => s.message);
    expect(last(msgs("a b 1\nb c 2\na c 3"))).toBe(
      "Hotovo: máme n − 1 = 2 hrany, kostra je hotová (váha 3). Zbývající hrany není třeba zkoumat.",
    );
    expect(last(msgs("a b 5"))).toBe(
      "Hotovo: máme n − 1 = 1 hranu, kostra je hotová (váha 5).",
    );
    expect(msgs("a b 5")[0]).toBe("Setřídili jsme 1 hranu podle váhy.");
    expect(last(msgs("a b 1\nc d 2\ne"))).toBe(
      "Hotovo, ale graf není souvislý – místo kostry vznikl minimální les (kostra každé komponenty). Počet komponent: 3, váha 3.",
    );
    expect(last(msgs("a"))).toBe("Hotovo, váha kostry 0.");
    expect(last(msgs("A B 0.1\nB C 0.2"))).toBe(
      "Hotovo: máme n − 1 = 2 hrany, kostra je hotová (váha 0,3).",
    );
    // tabulka hran: váha s desetinnou čárkou (E3)
    const t = last(run(kruskal, parseGraph("A B 2.5", false, true))).state
      .table!;
    expect(t.rows[0][2]).toBe("2,5");
    expect(msgs("a a 1\na b 2")).toContain(
      "Smyčka – oba konce jsou tentýž vrchol, hranu zahodíme.",
    );
  });
});

describe("Kruskal – les Union-Find v krocích (E5)", () => {
  /** kořen keříku podle otců P ze stavu */
  const rootOf = (uf: NonNullable<GraphState["uf"]>, x: number) => {
    while (uf.parent[x] !== null) x = uf.parent[x]!;
    return x;
  };
  /** cesta z x do kořene (včetně obou konců) */
  const chain = (uf: NonNullable<GraphState["uf"]>, x: number) => {
    const out = [x];
    while (uf.parent[x] !== null) out.push((x = uf.parent[x]!));
    return out;
  };
  /** výška keříku s kořenem r (počet hran nejdelší cesty dolů) */
  const height = (uf: NonNullable<GraphState["uf"]>, r: number): number => {
    let h = 0;
    uf.parent.forEach((p, v) => {
      if (p !== null && rootOf(uf, v) === r)
        h = Math.max(h, chain(uf, v).length - 1);
    });
    return h;
  };

  it("každý krok nese les keříků: kořeny odpovídají popiskům komponent, H(kořen) = výška keříku ≤ log₂ n", () => {
    for (let s = 1; s <= SEEDS; s++) {
      const g = gen(s, { directed: false, weighted: true, messy: s % 3 === 0 });
      for (const st of run(kruskal, g)) {
        const uf = st.state.uf!;
        expect(uf, `seed ${s}`).toBeDefined();
        expect(uf.parent).toHaveLength(g.nodes.length);
        for (const n of g.nodes) {
          const r = rootOf(uf, n.id);
          if (st.state.nodeSub[n.id])
            expect(st.state.nodeSub[n.id]).toBe(`komp. ${g.nodes[r].label}`);
          if (uf.parent[n.id] === null) {
            expect(uf.depth[n.id]).toBe(height(uf, n.id));
            expect(2 ** uf.depth[n.id]).toBeLessThanOrEqual(g.nodes.length);
          }
        }
      }
    }
  });

  it("Find zvýrazní obě cesty do kořenů, Union nový odkaz P, zahozená hrana nechá cesty vidět", () => {
    // a–b, c–d (dva keříky hloubky 1), pak b–d: stejně hluboké → kořen c pod a; pak e–d: mělčí e pod a; a–d zahodíme
    const g = parseGraph("a b 1\nc d 2\nb d 3\ne d 4\na d 5", false, true);
    const id = (l: string) => g.nodes.findIndex((n) => n.label === l);
    const steps = run(kruskal, g);
    const at = (msg: string) => steps.find((s) => s.message.startsWith(msg))!;
    const set = (ids: number[]) => new Set(ids.map((i) => g.nodes[i].label));

    // na začátku samé kořeny hloubky 0, nic zvýrazněno
    const init = steps[0].state.uf!;
    expect(init.parent.every((p) => p === null)).toBe(true);
    expect(init.depth.every((h) => h === 0)).toBe(true);
    expect(init.path).toEqual([]);
    expect(init.linked).toBeNull();

    const find = at("Find(b, d)").state.uf!;
    expect(set(find.path)).toEqual(new Set(["a", "b", "c", "d"]));
    expect(find.linked).toBeNull();

    const union = steps[steps.indexOf(at("Find(b, d)")) + 1].state.uf!;
    expect(union.parent[id("c")]).toBe(id("a"));
    expect(union.depth[id("a")]).toBe(2);
    expect(union.linked).toBe(id("c"));
    expect(union.path).toEqual([]);

    const find2 = at("Find(e, d)").state.uf!;
    expect(set(find2.path)).toEqual(new Set(["e", "d", "c", "a"]));

    // a–d: oba konce ve stejném keříku – cesty zůstanou zvýrazněné i u „zahodíme“
    const findAd = at("Find(a, d)");
    expect(findAd).toBeUndefined(); // n − 1 hran už po e–d → konec
    const fin = steps[steps.length - 1].state.uf!;
    expect(
      fin.parent.map((p) => (p === null ? null : g.nodes[p].label)),
    ).toEqual([null, "a", "a", "c", "a"]);
    expect(fin.path).toEqual([]);
    expect(fin.linked).toBeNull();

    // a–b, b–c (c pod a), a–c zahodíme: cesty z a i z c do kořene a zůstanou zvýrazněné
    const g2 = parseGraph("a b 1\nb c 2\na c 3\nc d 4", false, true);
    const rej = run(kruskal, g2).find((s) => s.line === 6)!.state.uf!;
    expect(new Set(rej.path.map((i) => g2.nodes[i].label))).toEqual(
      new Set(["a", "c"]),
    );
    expect(rej.linked).toBeNull();
  });
});

describe("terminologie a konec běhu (GRAPH-07, GRAPH-08, GRAPH-14)", () => {
  const texts = (algo: GraphAlgorithm, g: Graph, start = 0) => {
    const steps = materialize(algo.run(g, start));
    return [
      algo.description,
      algo.tip,
      ...algo.pseudocode,
      ...steps.map((s) => s.message),
      ...steps.flatMap((s) => Object.keys(s.state.vars ?? {})),
      ...steps.map((s) => s.state.table?.title ?? ""),
    ].join("\n");
  };
  const G = parseGraph("A B 4\nB C 2\nA C 7\nC D 1", false, true);

  it("Jarník a Kruskal mluví o vahách w(e) a nejlehčí hraně, ne o cenách", () => {
    for (const algo of [jarnik, kruskal]) {
      const t = texts(algo, G);
      expect(t, algo.id).not.toMatch(/cen[auyěo]|nejlevn|ℓ\(/i);
      expect(t, algo.id).toContain("váha T");
      expect(t, algo.id).toMatch(/nejlehčí/);
    }
    expect(kruskal.pseudocode.join("\n")).toContain(
      "podle vah: w(e₁) ≤ w(e₂) ≤ … ≤ w(eₘ)",
    );
  });

  it("Dijkstra mluví o délkách hran; tipy nevedou na „▶ Spustit“", () => {
    expect(dijkstra.tip).toContain("„Délky hran“");
    expect(dijkstra.tip).not.toMatch(/Ceny hran|cenu/);
    for (const algo of GRAPH_ALGOS)
      expect(algo.tip, algo.id).not.toContain("▶ Spustit");
  });

  it("topologické uspořádání s cyklem končí varováním (outcome warn), bez ✓; DAG končí úspěchem", () => {
    const cyc = materialize(
      topo.run(parseGraph("a b\nb c\nc a", true, false), 0),
    );
    const last = cyc[cyc.length - 1];
    expect(last.outcome).toBe("warn");
    expect(last.message).not.toContain("✓");
    const dag = materialize(topo.run(parseGraph("a b\nb c", true, false), 0));
    expect(dag[dag.length - 1].outcome).toBeUndefined();
  });
});
