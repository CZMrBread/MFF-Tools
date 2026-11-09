/**
 * Mosty a artikulace (Průvodce 5.7, str. 123–126): Mosty / Mosty2 s in a low, artikulace podle textu str. 126.
 * Obr. 5.10 přesně podle knihy (mosty c–d, g–j, g–k; artikulace c, d, g), shoda s hrubou silou na náhodných
 * grafech (i nesouvislých, se smyčkami a násobnými hranami), kroky po řádcích pseudokódu.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step } from "../../core/steps";
import { BRIDGES_5_10 } from "./book.fixtures";
import { bridges } from "./bridges";
import { bridgesPresets } from "./bridges.presets";
import { parseGraph, type Graph, type GraphState } from "./graph";
import { presetById, presetGraph } from "./presets";

const run = (g: Graph) => materialize(bridges.run(g, 0));
const last = <T>(a: readonly T[]) => a[a.length - 1];
const id = (g: Graph, label: string) =>
  g.nodes.find((n) => n.label === label)!.id;
const label = (g: Graph, v: number) => g.nodes[v].label;

/** hrany se třídou (jako „u–v“ s menším popiskem vlevo) */
function edgesWith(g: Graph, st: GraphState, cls: string): string[] {
  return g.edges
    .filter((e) => (st.edgeMarks[e.id] ?? "").split(" ").includes(cls))
    .map((e) => [label(g, e.u), label(g, e.v)].sort().join("–"))
    .sort();
}
function nodesWith(g: Graph, st: GraphState, cls: string): string[] {
  return g.nodes
    .filter((n) => (st.nodeMarks[n.id] ?? "").split(" ").includes(cls))
    .map((n) => n.label)
    .sort();
}

/* ------------------------------------------------------------------ hrubá síla */

function componentCount(
  n: number,
  edges: readonly [number, number][],
  skipV = -1,
): number {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (p[x] === x ? x : (p[x] = find(p[x])));
  for (const [a, b] of edges) {
    if (a === skipV || b === skipV) continue;
    p[find(a)] = find(b);
  }
  let c = 0;
  for (let i = 0; i < n; i++) if (i !== skipV && find(i) === i) c++;
  return c;
}

function bruteBridges(g: Graph): string[] {
  const all = g.edges.map((e) => [e.u, e.v] as [number, number]);
  const base = componentCount(g.nodes.length, all);
  return g.edges
    .filter(
      (e) =>
        componentCount(
          g.nodes.length,
          all.filter((_, i) => i !== e.id),
        ) > base,
    )
    .map((e) => [label(g, e.u), label(g, e.v)].sort().join("–"))
    .sort();
}

function bruteArticulations(g: Graph): string[] {
  const all = g.edges.map((e) => [e.u, e.v] as [number, number]);
  const base = componentCount(g.nodes.length, all);
  return g.nodes
    .filter((n) => {
      const isolated = !all.some(([a, b]) => (a === n.id) !== (b === n.id));
      return (
        componentCount(g.nodes.length, all, n.id) > base - (isolated ? 1 : 0)
      );
    })
    .map((n) => n.label)
    .sort();
}

function randomText(seed: number): string {
  const r = rng(seed * 104729 + 7);
  const n = 1 + Math.floor(r() * 10);
  const m = Math.floor(r() * (2 * n + 1));
  const lines: string[] = [];
  for (let v = 1; v <= n; v++) if (r() < 0.2) lines.push(String(v));
  for (let i = 0; i < m; i++) {
    const a = 1 + Math.floor(r() * n);
    const b = 1 + Math.floor(r() * n);
    lines.push(`${a} ${b}`); // i smyčky a násobné hrany
  }
  return lines.join("\n") || "1";
}

/* ------------------------------------------------------------------ testy */

describe("Mosty a artikulace – obr. 5.10", () => {
  const g = presetGraph(presetById("bridges")!);
  const steps = run(g);
  const st = last(steps).state;

  it("mosty a artikulace přesně podle knihy (book.fixtures BRIDGES_5_10)", () => {
    expect(edgesWith(g, st, "e-bridge")).toEqual(
      BRIDGES_5_10.bridges.map((e) => [...e].sort().join("–")).sort(),
    );
    expect(nodesWith(g, st, "n-art")).toEqual(
      [...BRIDGES_5_10.articulations].sort(),
    );
    expect(last(steps).message).toBe(
      "Hotovo. Mosty: c–d, g–j, g–k. Artikulace: c, d, g.",
    );
  });

  it("in a low pod vrcholy (DFS z a, sousedé podle názvu); low = +∞ jako ∞", () => {
    const expected: Record<string, string> = {
      a: "1/1",
      b: "2/1",
      c: "3/1",
      d: "4/4",
      e: "5/4",
      f: "6/4",
      g: "7/4",
      h: "8/4",
      i: "9/4",
      j: "10/∞",
      k: "11/∞",
    };
    for (const [l, sub] of Object.entries(expected))
      expect(st.nodeSub[id(g, l)], l).toBe(sub);
    // tabulka in/low v pořadí otevření, s otcem
    expect(st.table?.header).toEqual(["v", "in", "low", "p"]);
    expect(st.table?.rows.map((r) => r.join(" "))).toEqual([
      "a 1 1 –",
      "b 2 1 a",
      "c 3 1 b",
      "d 4 4 c",
      "e 5 4 d",
      "f 6 4 e",
      "g 7 4 f",
      "h 8 4 g",
      "i 9 4 h",
      "j 10 ∞ g",
      "k 11 ∞ g",
    ]);
    // seznamy M a A v pořadí nalezení (podstrom g se dokončí dřív než hrana c–d)
    expect(st.vars).toMatchObject({
      T: 11,
      M: "g–j, g–k, c–d",
      A: "g, d, c",
    });
  });

  it("ostatní hrany: stromové a zpětné (zpětné jsou a–c a d–i)", () => {
    expect(edgesWith(g, st, "e-back")).toEqual(["a–c", "d–i"]);
    expect(edgesWith(g, st, "e-tree")).toEqual(
      ["a–b", "b–c", "d–e", "e–f", "f–g", "g–h", "h–i"].sort(),
    );
  });

  it("kroky jdou po řádcích pseudokódu: test mostu (ř. Pokud low(w) ≥ in(w)) říká čísla", () => {
    const line = (s: string) =>
      bridges.pseudocode.findIndex((l) => l.includes(s));
    const testLine = line("low(w) ≥ in(w)");
    const cd = steps.find(
      (s) => s.line === testLine && s.message.includes("c–d"),
    )!;
    expect(cd.message).toBe(
      "low(d) = 4 ≥ in(d) = 4 – z podstromu d nevede zpětná hrana nad d, hrana c–d je most.",
    );
    const gh = steps.find(
      (s) => s.line === testLine && s.message.includes("g–h"),
    )!;
    expect(gh.message).toMatch(/^low\(h\) = 4 < in\(h\) = 8/);
    // otevření vrcholu: ř. T ← T + 1, in(v) ← T, pak low(v) ← +∞
    const open = steps.findIndex((s) => s.line === line("in(v) ← T"));
    expect(steps[open].message).toBe("Mosty2(a, –): T = 1, in(a) = 1.");
    expect(steps[open + 1].line).toBe(line("low(v) ← +∞"));
    // kořen a má jediného syna → není artikulace
    expect(steps.find((s) => s.line === line("Kořen"))!.message).toMatch(
      /Kořen a má v DFS stromu jediného syna – není artikulace\./,
    );
  });

  it("tip je pravdivý: s hranou b–e zbudou jen mosty g–j, g–k a artikulace g", () => {
    expect(bridges.tip).toMatch(/b–e/);
    const g2 = parseGraph(`${presetById("bridges")!.text}\nb e`, false, false);
    const st2 = last(run(g2)).state;
    expect(edgesWith(g2, st2, "e-bridge")).toEqual(["g–j", "g–k"]);
    expect(nodesWith(g2, st2, "n-art")).toEqual(["g"]);
  });
});

describe("Mosty – řádek Výstup (UX-14)", () => {
  it("poslední krok zvýrazní „Výstup: … M … A“ jako kniha (str. 124)", () => {
    const g = presetGraph(presetById("bridges")!);
    const steps = run(g);
    const line = steps.at(-1)!.line!;
    expect(bridges.pseudocode[line]).toMatch(/^Výstup: .*M.*A/);
  });
});

describe("Mosty a artikulace – obecně", () => {
  it("shoda s hrubou silou (odebrat hranu / vrchol) na 300 náhodných grafech i se smyčkami a násobnými hranami", () => {
    for (let s = 1; s <= 300; s++) {
      const g = parseGraph(randomText(s), false, false);
      const st = last(run(g)).state;
      expect(edgesWith(g, st, "e-bridge"), `seed ${s}`).toEqual(
        bruteBridges(g),
      );
      expect(nodesWith(g, st, "n-art"), `seed ${s}`).toEqual(
        bruteArticulations(g),
      );
    }
  });

  it("nesouvislý graf: Mosty2 i z dalších komponent; kořen se dvěma syny je artikulace (vlastní příklad)", () => {
    const p = bridgesPresets.find((x) => x.id === "bridges-root")!;
    expect(p.directed).toBe(false);
    const g = presetGraph(p);
    const steps = run(g);
    const st = last(steps).state;
    expect(nodesWith(g, st, "n-art")).toEqual(["1", "4"]);
    expect(edgesWith(g, st, "e-bridge")).toEqual(["1–4", "4–5", "6–7"]);
    expect(
      steps.some((s) => /Kořen 1 má v DFS stromu 2 syny/.test(s.message)),
    ).toBe(true);
    expect(
      steps.some((s) => /Graf není souvislý.*Mosty2\(6, –\)/.test(s.message)),
    ).toBe(true);
  });

  it("násobná hrana k otci se počítá jako zpětná (kniha násobné hrany nemá) – a b dvakrát není most", () => {
    const g = parseGraph("a b\na b", false, false);
    const steps = run(g);
    expect(edgesWith(g, last(steps).state, "e-bridge")).toEqual([]);
    expect(steps.some((s) => /násobná/.test(s.message))).toBe(true);
  });

  it("jediný vrchol, smyčka: doběhne bez mostů i artikulací", () => {
    for (const t of ["a", "a a"]) {
      const g = parseGraph(t, false, false);
      const steps = run(g);
      expect(last(steps).message).toBe(
        "Hotovo. Graf nemá žádný most ani artikulaci.",
      );
    }
  });

  it("každý krok: řádek v rozsahu pseudokódu, hláška bez undefined; tabulka od prvního kroku", () => {
    for (let s = 1; s <= 40; s++) {
      const g = parseGraph(randomText(s), false, false);
      const steps: Step<GraphState>[] = run(g);
      expect(steps[0].state.table?.header).toEqual(["v", "in", "low", "p"]);
      for (const x of steps) {
        expect(x.message).not.toMatch(/undefined|NaN|Infinity/);
        if (x.line !== null) {
          expect(x.line).toBeGreaterThanOrEqual(0);
          expect(x.line).toBeLessThan(bridges.pseudocode.length);
        }
      }
    }
  });

  it("legenda vysvětluje mosty a artikulace vlastními vzorky", () => {
    const cls = bridges.legend.map((l) => l.cls);
    expect(cls).toEqual(expect.arrayContaining(["sw-bridge", "sw-art"]));
    expect(bridges.legend.find((l) => l.cls === "sw-bridge")!.marks).toEqual([
      "e-bridge",
    ]);
    expect(bridges.legend.find((l) => l.cls === "sw-art")!.marks).toEqual([
      "n-art",
    ]);
  });
});
