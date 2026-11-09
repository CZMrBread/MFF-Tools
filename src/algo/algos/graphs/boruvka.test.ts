/**
 * Borůvkův algoritmus (Průvodce 7.3, str. 173–174, obr. 7.5): výběry hran po iteracích přesně podle obrázku,
 * cena proti referenčnímu minimálnímu lesu, počet iterací ≤ ⌊log₂ n⌋, neunikátní váhy (cvičení 7.3.1).
 */
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step } from "../../core/steps";
import { boruvka } from "./boruvka";
import { boruvkaPresets } from "./boruvka.presets";
import { MST3_7_2 } from "./book.fixtures";
import { parseGraph, type Graph, type GraphState } from "./graph";
import { weightTerm } from "./graphActions";
import { defaultPresetId } from "./graphPageModel";
import { presetById, presetGraph } from "./presets";

const run = (g: Graph): Step<GraphState>[] => materialize(boruvka.run(g, 0));
const last = <T>(a: readonly T[]): T => a[a.length - 1];

/** Komponenty podle hran se zadanou třídou (union-find) – pole reprezentantů. */
function comps(g: Graph, edgeIds: readonly number[]): number[] {
  const p = g.nodes.map((n) => n.id);
  const root = (x: number): number => (p[x] === x ? x : (p[x] = root(p[x])));
  for (const id of edgeIds) {
    const e = g.edges[id];
    p[root(e.u)] = root(e.v);
  }
  return g.nodes.map((n) => root(n.id));
}

const treeIds = (st: GraphState) =>
  Object.entries(st.edgeMarks)
    .filter(([, c]) => c === "e-tree")
    .map(([id]) => Number(id));

/** Cena minimálního napnutého lesa (Kruskal s pořadím (váha, id)) a počet jeho hran. */
function refMsf(g: Graph): { cost: number; edges: number } {
  const p = g.nodes.map((n) => n.id);
  const root = (x: number): number => (p[x] === x ? x : (p[x] = root(p[x])));
  let cost = 0;
  let edges = 0;
  for (const e of [...g.edges].sort((a, b) => a.w - b.w || a.id - b.id)) {
    if (root(e.u) === root(e.v)) continue;
    p[root(e.u)] = root(e.v);
    cost += e.w;
    edges++;
  }
  return { cost, edges };
}

function gen(seed: number): Graph {
  const r = rng(seed * 7727 + 3);
  const n = 1 + Math.floor(r() * 10);
  const m = Math.floor(r() * 2.5 * n);
  const lines: string[] = [];
  for (let v = 1; v <= n; v++) if (r() < 0.3) lines.push(String(v));
  for (let i = 0; i < m; i++) {
    const a = 1 + Math.floor(r() * n);
    const b = 1 + Math.floor(r() * n);
    // malý rozsah vah → hodně shod (cvičení 7.3.1), občas záporné
    lines.push(`${a} ${b} ${Math.floor(r() * 5) - (seed % 4 === 0 ? 2 : 0)}`);
  }
  if (!lines.length) lines.push("1");
  return parseGraph(lines.join("\n"), false, true);
}

describe("Borůvka – definice modulu", () => {
  it("výchozí příklad je obr. 7.5 (= obr. 7.2), váhy hran, pseudokód z knihy", () => {
    expect(defaultPresetId(boruvka)).toBe("mst3");
    expect(weightTerm(boruvka).action).toBe("Váhy hran");
    const code = boruvka.pseudocode.join("\n");
    for (const s of [
      "T ← (V, ∅)",
      "začneme triviálním lesem izolovaných vrcholů",
      "Dokud T není souvislý:",
      "Rozložíme T na komponenty souvislosti T₁, …, Tₖ.",
      "Pro každý strom Tᵢ najdeme nejlehčí z hran mezi Tᵢ a zbytkem grafu a označíme ji eᵢ.",
      "Přidáme do T hrany {e₁, …, eₖ}.",
      "Výstup: minimální kostra T",
    ])
      expect(code).toContain(s);
  });

  it("vlastní předvolba ke cvičení 7.3.1: trojúhelník se stejnými vahami", () => {
    expect(boruvkaPresets.map((p) => p.id)).toEqual(["equal-triangle"]);
    expect(presetById("equal-triangle")!.weighted).toBe(true);
  });

  it("terminologie: váhy w(e) a nejlehčí hrana, ne ceny; tip bez „▶ Spustit“", () => {
    const g = parseGraph(presetById("mst3")!.text, false, true);
    const t = [
      boruvka.description,
      boruvka.tip,
      ...boruvka.pseudocode,
      ...run(g).map((s) => s.message),
      ...run(g).flatMap((s) => Object.keys(s.state.vars)),
      ...run(g).map((s) => s.state.table?.title ?? ""),
    ].join("\n");
    expect(t).not.toMatch(/cen[auyěo]\b|nejlevn|ℓ\(/i);
    expect(t).toContain("váha T");
    expect(t).toMatch(/nejlehčí/);
    expect(boruvka.tip).not.toContain("▶ Spustit");
  });
});

describe("Borůvka – obr. 7.5 (mřížka 3 × 3)", () => {
  const g = parseGraph(presetById("mst3")!.text, false, true);
  const steps = run(g);
  /** tabulka v kroku přidání hran (ř. 5, index 4) dané iterace: komponenta → vybraná hrana */
  const choices = (iter: number) => {
    const s = steps.filter((x) => x.line === 4)[iter - 1];
    return s.state.table!.rows;
  };

  it("iterace 1: každý vrchol si vybere svou nejlehčí hranu (směr šipek z obrázku)", () => {
    const rows = choices(1);
    expect(rows).toHaveLength(9);
    const got = Object.fromEntries(
      rows.map((r) => {
        const [from, to] = r[2].split("→");
        expect(r[1]).toBe(from); // jednovrcholová komponenta vybírá hranu ze svého vrcholu
        return [from, [from, to].sort().join("")];
      }),
    );
    expect(got).toEqual(MST3_7_2.boruvka.phase1);
  });

  it("iterace 2: zbývají dvě komponenty a obě si vyberou hranu E–F; kostra má váhu 32", () => {
    const rows = choices(2);
    expect(rows).toHaveLength(2);
    for (const r of rows)
      expect([...r[2].replace("→", "")].sort().join("")).toBe(
        MST3_7_2.boruvka.phase2,
      );
    const end = last(steps);
    expect(end.message).toMatch(/^Hotovo/);
    expect(end.message).toContain(`${MST3_7_2.mstWeight}`);
    expect(end.message).toMatch(/2 iterac/);
    expect(end.state.vars["váha T"]).toBe("32");
    expect(treeIds(end.state)).toHaveLength(8);
  });

  it("hrany vybrané z obou stran (C–F, D–G, E–F) se přidají jen jednou a hláška to říká", () => {
    const add1 = steps.filter((x) => x.line === 4)[0].message;
    expect(add1).toMatch(/C–F/);
    expect(add1).toMatch(/D–G/);
    expect(add1).toMatch(/obě/);
    expect(add1).toMatch(/7 hran/); // 9 výběrů, 2 zdvojené
  });

  it("tip je pravdivý (oba konce C–F, druhá iterace E–F, váha 32 po 2 iteracích)", () => {
    expect(boruvka.tip).toMatch(/C–F/);
    expect(boruvka.tip).toMatch(/E–F/);
    expect(boruvka.tip).toMatch(/32/);
  });

  it("popisky a barvy komponent odpovídají lesu T v každém kroku; sousední komponenty mají různé barvy", () => {
    for (const s of steps.slice(1)) {
      const c = comps(g, treeIds(s.state));
      for (const a of g.nodes)
        for (const b of g.nodes) {
          const same = c[a.id] === c[b.id];
          expect(
            s.state.nodeSub[a.id] === s.state.nodeSub[b.id],
            s.message,
          ).toBe(same);
          if (same)
            expect(s.state.nodeMarks[a.id]).toBe(s.state.nodeMarks[b.id]);
        }
      for (const e of g.edges)
        if (c[e.u] !== c[e.v])
          expect(s.state.nodeMarks[e.u], s.message).not.toBe(
            s.state.nodeMarks[e.v],
          );
    }
  });

  it("tabulka: nová iterace už na ř. 2 (bez staré iterace), konec = souhrn iterací; hrany mimo T čárkované", () => {
    const starts = steps.filter((x) => x.line === 1);
    expect(starts.map((x) => x.state.table?.title)).toEqual([
      "Iterace 1: nejlehčí hrana z každé komponenty ven",
      "Iterace 2: nejlehčí hrana z každé komponenty ven",
    ]);
    expect(starts[1].state.table!.rows.map((r) => r[2])).toEqual(["", ""]);
    const end = last(steps).state;
    expect(end.table!.title).toBe("Kostra T po iteracích");
    expect(end.table!.rows).toEqual([
      ["1", "B–C, A–D, C–F, D–G, E–H, F–I, G–H", "28"],
      ["2", "E–F", "32"],
    ]);
    for (const e of g.edges)
      expect(["e-tree", "e-rejected"]).toContain(end.edgeMarks[e.id]);
  });

  it("řádky pseudokódu: 1 start, 3 rozklad, 4 jeden krok na komponentu, 5 přidání, konec ř. 6 (Výstup)", () => {
    expect(steps[0].line).toBe(0);
    const perIter = steps.filter((x) => x.line === 3).length;
    expect(perIter).toBe(9 + 2);
    expect(steps.filter((x) => x.line === 2)).toHaveLength(2);
    expect(last(steps).line).toBe(5);
  });
});

describe("Borůvka – proti referenci", () => {
  it("náhodné grafy (shodné i záporné váhy, nesouvislé, smyčky): minimální les bez kružnice, ≤ ⌊log₂ n⌋ iterací", () => {
    let disconnected = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const g = gen(seed);
      const steps = run(g);
      for (const s of steps) {
        expect(s.message).not.toMatch(/undefined|NaN/);
        if (s.line !== null)
          expect(s.line).toBeLessThan(boruvka.pseudocode.length);
      }
      const end = last(steps);
      expect(end.message, `${seed}`).toMatch(/^Hotovo/);
      const ids = treeIds(end.state);
      const ref = refMsf(g);
      expect(ids.length, `${seed}`).toBe(ref.edges);
      expect(ids.reduce((s, id) => s + g.edges[id].w, 0)).toBe(ref.cost);
      // bez kružnice: počet komponent = n − počet hran
      expect(new Set(comps(g, ids)).size).toBe(g.nodes.length - ids.length);
      const iters = steps.filter((x) => x.line === 4).length;
      expect(iters).toBeLessThanOrEqual(
        Math.max(0, Math.floor(Math.log2(g.nodes.length))),
      );
      if (ref.edges < g.nodes.length - 1) {
        disconnected++;
        expect(end.message).toMatch(/není souvislý/);
      }
    }
    expect(disconnected).toBeGreaterThan(10);
  });

  it("cvičení 7.3.1: stejné váhy rozhodne pořadí hran – trojúhelník dá 2 hrany, ne kružnici", () => {
    const g = parseGraph(presetById("equal-triangle")!.text, false, true);
    const steps = run(g);
    expect(steps[0].message).toMatch(/nejsou unikátní/);
    expect(treeIds(last(steps).state)).toHaveLength(2);
  });

  it("jeden vrchol: hned souvislý, váha 0", () => {
    const end = last(run(parseGraph("a", false, true)));
    expect(end.message).toMatch(/^Hotovo/);
    expect(end.state.vars["váha T"]).toBe("0");
  });
});

describe("Borůvka – šipky vybraných hran jako obr. 7.5 (UX-17)", () => {
  it("v ř. 4 má vybraná hrana eᵢ šipku od komponenty, která ji vybrala; hrana vybraná z obou stran oboustrannou", () => {
    const g = presetGraph(presetById("mst3")!);
    const steps = materialize(boruvka.run(g, 0));
    const lab = (id: number) => g.nodes[id].label;
    // hrany se šipkou na konci 1. iterace (krok ř. 5 = přidání)
    const add = steps.find((s) => s.line === 4)!;
    const arrows = add.state.edgeArrow!;
    const seen: string[] = [];
    for (const [id, dir] of Object.entries(arrows)) {
      const e = g.edges[Number(id)];
      seen.push(
        dir === "both"
          ? `${lab(e.u)}↔${lab(e.v)}`
          : dir === "v"
            ? `${lab(e.u)}→${lab(e.v)}`
            : `${lab(e.v)}→${lab(e.u)}`,
      );
    }
    // každá komponenta (vrchol) si v 1. iteraci vybrala právě jednu hranu (tabulka v posledním kroku ř. 4)
    const pick = steps[steps.indexOf(add) - 1];
    expect(pick.line).toBe(3);
    const chosen = pick.state.table!.rows.map((r) => r[2]);
    for (const c of chosen) {
      const [a, b] = c.split("→");
      expect(
        seen.includes(`${a}→${b}`) ||
          seen.includes(`${a}↔${b}`) ||
          seen.includes(`${b}↔${a}`),
        c,
      ).toBe(true);
    }
    // nová iterace začíná bez šipek
    const next = steps.findIndex(
      (s, i) => i > steps.indexOf(add) && s.line === 1,
    );
    if (next >= 0)
      expect(Object.keys(steps[next].state.edgeArrow ?? {})).toHaveLength(0);
  });
});
