/**
 * Bellmanův–Fordův algoritmus (Průvodce 6.3, str. 149–153): relaxace s frontou otevřených vrcholů (výchozí
 * varianta) a „po fázích“ (cvičení 6.3.4), fáze Fᵢ, záporné délky hran a detekce záporného cyklu (cv. 6.3.2).
 * Výsledky proti nezávislé referenci a proti vlastním příkladům (kniha k oddílu obrázek nemá).
 */
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step } from "../../core/steps";
import { bellmanFord } from "./bellmanFord";
import { bellmanFordPresets } from "./bellmanFord.presets";
import { parseGraph, type Graph, type GraphState } from "./graph";
import { weightTerm } from "./graphActions";
import { defaultPresetId, variantPseudocode } from "./graphPageModel";
import { presetById } from "./presets";

const run = (g: Graph, start = 0, variant?: string): Step<GraphState>[] =>
  materialize(bellmanFord.run(g, start, variant));
const last = <T>(a: readonly T[]): T => a[a.length - 1];
const idOf = (g: Graph, label: string) =>
  g.nodes.find((n) => n.label === label)!.id;
const VARIANTS = ["queue", "phases"] as const;

/** Text předvolby podle id. */
const presetText = (id: string) => presetById(id)!.text;

/** Referenční vzdálenosti (Bellman–Ford po hranách) + zda je z s dosažitelný záporný cyklus. */
function reference(g: Graph, s: number) {
  const d = new Map<number, number>([[s, 0]]);
  const pass = () => {
    let changed = false;
    for (const e of g.edges) {
      const dirs: [number, number][] = g.directed
        ? [[e.u, e.v]]
        : [
            [e.u, e.v],
            [e.v, e.u],
          ];
      for (const [a, b] of dirs) {
        if (d.has(a) && (!d.has(b) || d.get(b)! > d.get(a)! + e.w)) {
          d.set(b, d.get(a)! + e.w);
          changed = true;
        }
      }
    }
    return changed;
  };
  for (let i = 0; i < g.nodes.length; i++) pass();
  return { d, negCycle: pass() };
}

/** Náhodný graf: 1–8 vrcholů, délky −3…9 (orientovaný) nebo 0…9 (neorientovaný). */
function gen(seed: number, directed: boolean): Graph {
  const r = rng(seed * 104729 + 7);
  const n = 1 + Math.floor(r() * 8);
  const m = Math.floor(r() * 2.5 * n);
  const lines: string[] = [];
  for (let v = 1; v <= n; v++) lines.push(String(v));
  for (let i = 0; i < m; i++) {
    const a = 1 + Math.floor(r() * n);
    const b = 1 + Math.floor(r() * n);
    const w = directed
      ? Math.floor(r() * 13) - 3
      : Math.floor(r() * 10) - (seed % 5 === 0 ? 2 : 0);
    lines.push(`${a} ${b} ${w}`);
  }
  return parseGraph(lines.join("\n"), directed, true);
}

/** Číslo z výpisu (−1, 2,5, ∞). */
const num = (s: string) =>
  s === "∞" ? Infinity : Number(s.replace("−", "-").replace(",", "."));

/** Hrany cyklu ze závěrečného stavu: posloupnost vrcholů z vars.cyklus, každý přechod po hraně e-back. */
function checkCycle(g: Graph, st: GraphState): number {
  const labels = String(st.vars.cyklus).split(" → ");
  expect(labels[0]).toBe(labels[labels.length - 1]);
  let sum = 0;
  for (let i = 0; i + 1 < labels.length; i++) {
    const [a, b] = [idOf(g, labels[i]), idOf(g, labels[i + 1])];
    const cand = g.edges.filter(
      (e) =>
        st.edgeMarks[e.id] === "e-back" &&
        ((e.u === a && e.v === b) || (!g.directed && e.u === b && e.v === a)),
    );
    expect(cand.length, `${labels[i]} → ${labels[i + 1]}`).toBeGreaterThan(0);
    sum += Math.min(...cand.map((e) => e.w));
    expect(st.nodeMarks[a]).toContain("n-bad");
  }
  expect(sum).toBeLessThan(0);
  expect(num(String(st.vars["délka cyklu"]))).toBe(sum);
  return sum;
}

describe("Bellman–Ford – definice modulu", () => {
  it("výchozí příklad je vlastní orientovaný graf se zápornou hranou (kniha k 6.3 obrázek nemá)", () => {
    expect(bellmanFord.defaultPreset).toBe("negative");
    expect(defaultPresetId(bellmanFord)).toBe("negative");
    const ids = bellmanFordPresets.map((p) => p.id);
    expect(ids).toEqual(["negative", "negative-cycle"]);
    for (const p of bellmanFordPresets) {
      expect(p.directed).toBe(true);
      expect(p.weighted).toBe(true);
      expect(presetById(p.id)).toBe(p);
    }
  });

  it("varianty: fronta (kniha, výchozí) a po fázích (cvičení 6.3.4) s vlastním pseudokódem", () => {
    expect(bellmanFord.variants!.map((v) => v.id)).toEqual(["queue", "phases"]);
    expect(variantPseudocode(bellmanFord, "queue")).toBe(
      bellmanFord.pseudocode,
    );
    const ph = variantPseudocode(bellmanFord, "phases");
    expect(ph).not.toBe(bellmanFord.pseudocode);
    expect(ph.join("\n")).toMatch(/Pro fáze i = 1, …, n/);
  });

  it("pseudokód podle algoritmu Relaxace (str. 150) s frontou (str. 152)", () => {
    const code = bellmanFord.pseudocode.join("\n");
    for (const s of [
      "stav(v) ← nenalezený, h(v) ← +∞, P(v) ← nedefinováno",
      "stav(v₀) ← otevřený, h(v₀) ← 0",
      "Dokud existují otevřené vrcholy:",
      "v ← nejstarší otevřený vrchol",
      "Pro všechny následníky w vrcholu v:",
      "Pokud h(w) > h(v) + ℓ(v, w):",
      "h(w) ← h(v) + ℓ(v, w)",
      "stav(w) ← otevřený",
      "P(w) ← v",
      "stav(v) ← uzavřený",
    ])
      expect(code).toContain(s);
  });

  it("terminologie: délky hran ℓ, ne ceny ani váhy; tip bez „▶ Spustit“", () => {
    expect(weightTerm(bellmanFord).action).toBe("Délky hran");
    const g = parseGraph(presetText("negative"), true, true);
    const all = [
      bellmanFord.description,
      bellmanFord.tip,
      ...VARIANTS.flatMap((v) => variantPseudocode(bellmanFord, v)),
      ...VARIANTS.flatMap((v) => run(g, 0, v).map((s) => s.message)),
    ].join("\n");
    expect(all).not.toMatch(/cen[auyěo]\b|váh|nejlevn/i);
    expect(bellmanFord.tip).not.toContain("▶ Spustit");
  });
});

describe("Bellman–Ford – vlastní příklad se zápornou hranou", () => {
  const g = parseGraph(presetText("negative"), true, true);
  const s = idOf(g, "s");

  it("záporná délka v součtu je v závorce: „2 + (−3) = −1“ (UX-11)", () => {
    const msgs = run(g, s, "queue").map((x) => x.message);
    expect(msgs.some((m) => m.includes("= 2 + (−3) = −1"))).toBe(true);
    expect(msgs.some((m) => /\+ −/.test(m))).toBe(false);
  });

  it("h = s 0, a −1, b 2, c 1; strom P: s→b, b→a, a→c", () => {
    for (const v of VARIANTS) {
      const fin = last(run(g, s, v)).state;
      const h = Object.fromEntries(
        g.nodes.map((n) => [n.label, fin.nodeSub[n.id]]),
      );
      expect(h, v).toEqual({ s: "0", a: "−1", b: "2", c: "1" });
      const tree = g.edges
        .filter((e) => fin.edgeMarks[e.id] === "e-tree")
        .map((e) => `${g.nodes[e.u].label}${g.nodes[e.v].label}`)
        .sort();
      expect(tree, v).toEqual(["ac", "ba", "sb"]);
    }
  });

  it("tip je pravdivý: h(a) je nejdřív 4, ve fázi F₂ se přes b zlepší na −1 a a se znovu otevře", () => {
    expect(bellmanFord.tip).toMatch(/h\(a\) = 4/);
    expect(bellmanFord.tip).toMatch(/−1/);
    const steps = run(g, s);
    const a = idOf(g, "a");
    const hs = steps.map((x) => x.state.nodeSub[a]);
    expect(hs.filter((h, i) => h !== hs[i - 1])).toEqual(["∞", "4", "−1"]);
    const better = steps.findIndex((x) => x.state.nodeSub[a] === "−1");
    expect(steps[better].state.vars.fáze).toBe("F₂");
    // a byl mezitím uzavřený a znovu se otevře (Dijkstra by ho už nezměnil)
    const marks = steps.map((x) => x.state.nodeMarks[a]);
    expect(marks.slice(0, better).some((m) => m === "n-closed")).toBe(true);
    expect(
      steps.slice(better).some((x) => x.state.nodeMarks[a] === "n-open"),
    ).toBe(true);
  });

  it("fronta: fáze F₀ … F₄ (≤ n), řádek pseudokódu podle akce, závěr jmenuje víckrát uzavřené vrcholy", () => {
    const steps = run(g, s);
    const phases = [...new Set(steps.map((x) => x.state.vars.fáze))].filter(
      Boolean,
    );
    expect(phases).toEqual(["F₀", "F₁", "F₂", "F₃", "F₄"]);
    const end = last(steps);
    expect(end.message).toMatch(/^Hotovo/);
    expect(end.message).toMatch(/4 fáz/);
    expect(end.message).toMatch(/a \(2×\)/);
    expect(end.message).toMatch(/c \(2×\)/);
    expect(end.outcome).toBeUndefined();
    // vyjmutí z fronty = index 3, změna h = index 6, zavření = index 10
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1].state;
      const cur = steps[i].state;
      for (const n of g.nodes) {
        if (prev.nodeSub[n.id] !== cur.nodeSub[n.id] && i > 1)
          expect(steps[i].line, steps[i].message).toBe(6);
        if (
          prev.nodeMarks[n.id] === "n-open" &&
          cur.nodeMarks[n.id] === "n-current"
        )
          expect(steps[i].line).toBe(3);
        if (
          prev.nodeMarks[n.id] === "n-current" &&
          cur.nodeMarks[n.id] === "n-closed"
        )
          expect(steps[i].line).toBe(10);
      }
    }
  });

  it("tabulka fronty = otevřené vrcholy v pořadí otevření (nejstarší nahoře) s fází otevření", () => {
    const steps = run(g, s);
    for (const x of steps) {
      const rows = x.state.table?.rows ?? [];
      const open = g.nodes
        .filter((n) => x.state.nodeMarks[n.id] === "n-open")
        .map((n) => n.label)
        .sort();
      // při vyjmutí (ř. index 3) je právě vyjímaný vrchol ještě zvýrazněný v čele fronty
      const shown = x.line === 3 ? rows.slice(1) : rows;
      if (x.line === 3) {
        expect(x.state.table!.highlight).toBe(0);
        expect(x.state.nodeMarks[idOf(g, rows[0][0])]).toBe("n-current");
      }
      expect(shown.map((r) => r[0]).sort(), x.message).toEqual(open);
      for (const r of rows) {
        expect(r[1]).toBe(x.state.nodeSub[idOf(g, r[0])]);
        expect(r[2]).toMatch(/^F[₀-₉]+$/);
      }
    }
    // po uzavření s (F₁) je ve frontě a před b (pořadí následníků podle názvu)
    const afterS = steps.find((x) => x.state.table?.rows.length === 2)!;
    expect(afterS.state.table!.rows.map((r) => r[0])).toEqual(["a", "b"]);
  });
});

describe("Bellman–Ford – záporný cyklus (cvičení 6.3.2)", () => {
  it("předvolba se záporným cyklem: konec s varováním, cyklus a → b → c → a délky −1", () => {
    const g = parseGraph(presetText("negative-cycle"), true, true);
    for (const v of VARIANTS) {
      const steps = run(g, idOf(g, "s"), v);
      const end = last(steps);
      expect(end.message, v).toMatch(/^Hotovo/);
      expect(end.message).toMatch(/záporný cyklus/);
      expect(end.outcome).toBe("warn");
      expect(end.message).not.toContain("✓");
      const st = end.state;
      const cyc = String(st.vars.cyklus).split(" → ");
      expect(new Set(cyc)).toEqual(new Set(["a", "b", "c"]));
      expect(checkCycle(g, st)).toBe(-1);
      expect(steps.some((x) => x.error)).toBe(false);
    }
  });

  it("neorientovaný graf se zápornou hranou = cyklus tam a zpět; záporná smyčka = cyklus délky 1", () => {
    const und = parseGraph("x y 3\ny z -2", false, true);
    const end = last(run(und, 0)).state;
    expect(end.vars.cyklus).toBe("y → z → y");
    expect(end.vars["délka cyklu"]).toBe("−4");
    const loop = parseGraph("a b 1\nb b -1", true, true);
    const e2 = last(run(loop, 0));
    expect(e2.state.vars.cyklus).toBe("b → b");
    expect(e2.outcome).toBe("warn");
  });

  it("nedosažitelný záporný cyklus nevadí: vzdálenosti dosažitelných vrcholů, ostatní ∞", () => {
    const g = parseGraph("s a 2\nx y -1\ny x -1", true, true);
    const end = last(run(g, 0));
    expect(end.outcome).toBeUndefined();
    expect(end.state.nodeSub[idOf(g, "a")]).toBe("2");
    expect(end.state.nodeSub[idOf(g, "x")]).toBe("∞");
    expect(end.message).toMatch(/Nedosažitelné vrcholy \(h = ∞\): x, y/);
  });
});

describe("Bellman–Ford – proti referenci na náhodných grafech", () => {
  it("bez záporného cyklu stejné h a strom P; se záporným cyklem varování a záporný cyklus z hran e-back", () => {
    let withCycle = 0;
    let withNeg = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const g = gen(seed, seed % 3 !== 0);
      const s = seed % g.nodes.length;
      const ref = reference(g, s);
      if (g.edges.some((e) => e.w < 0)) withNeg++;
      for (const v of VARIANTS) {
        const steps = run(g, s, v);
        const code = variantPseudocode(bellmanFord, v);
        for (const x of steps) {
          expect(x.message).not.toMatch(/undefined|NaN/);
          if (x.line !== null) {
            expect(x.line).toBeGreaterThanOrEqual(0);
            expect(x.line).toBeLessThan(code.length);
          }
        }
        const end = last(steps);
        expect(end.message).toMatch(/^Hotovo/);
        if (ref.negCycle) {
          expect(end.outcome, `${seed}/${v}`).toBe("warn");
          checkCycle(g, end.state);
          continue;
        }
        expect(end.outcome, `${seed}/${v}`).toBeUndefined();
        const st = end.state;
        for (const n of g.nodes) {
          const want = ref.d.has(n.id) ? ref.d.get(n.id)! : Infinity;
          expect(num(st.nodeSub[n.id]), `${seed}/${v}: ${n.label}`).toBe(want);
        }
        // strom P: jedna hrana do každého dosažitelného vrcholu kromě v₀, h(w) = h(u) + ℓ(u, w)
        const tree = g.edges.filter((e) => st.edgeMarks[e.id] === "e-tree");
        expect(tree.length).toBe(ref.d.size - 1);
        const comp = g.nodes.map((nd) => nd.id);
        const root = (x: number): number =>
          comp[x] === x ? x : (comp[x] = root(comp[x]));
        for (const e of tree) {
          const fits = (a: number, b: number) =>
            b !== s && ref.d.get(b) === ref.d.get(a)! + e.w;
          expect(
            fits(e.u, e.v) || (!g.directed && fits(e.v, e.u)),
            `${seed}/${v}: hrana stromu ${e.u}-${e.v}`,
          ).toBe(true);
          expect(root(e.u), `${seed}/${v}: kružnice ve stromu`).not.toBe(
            root(e.v),
          );
          comp[root(e.u)] = root(e.v);
        }
        // počet fází ≤ n (důsledek invariantu F)
        const maxPhase = Math.max(
          ...steps.map((x) =>
            Number(
              String(x.state.vars.fáze ?? "F₀")
                .slice(1)
                .replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080)),
            ),
          ),
        );
        expect(maxPhase).toBeLessThanOrEqual(g.nodes.length);
      }
      if (ref.negCycle) withCycle++;
    }
    expect(withCycle).toBeGreaterThan(5);
    expect(withNeg).toBeGreaterThan(30);
  });

  it("po fázích: fáze, ve které se nic nezměnilo, výpočet ukončí", () => {
    const g = parseGraph("s a 1\na b 1\nb c 1", true, true);
    const steps = run(g, 0, "phases");
    const stop = steps.filter((x) => x.line === 8);
    expect(stop.length).toBeGreaterThan(0);
    expect(last(stop).message).toMatch(/nezměnilo/);
    // cesta: F₁…F₃ mění, F₄ už ne → víc fází se nespustí
    expect(steps.some((x) => x.state.vars.fáze === "F₅")).toBe(false);
    expect(last(steps).message).toMatch(/^Hotovo/);
  });
});
