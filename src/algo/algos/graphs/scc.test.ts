/**
 * Komponenty silné souvislosti (Průvodce 5.9–5.10): Tarjanův algoritmus KompSSTarjan / KSST (výchozí varianta)
 * a KompSilnéSouvislosti přes Gᵀ (varianta „kosaraju“). Obr. 5.13 přesně podle knihy, shoda s hrubou silou
 * (dosažitelnost oběma směry) na náhodných grafech, komponenty v opačném topologickém pořadí.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step } from "../../core/steps";
import { SCC_5_13 } from "./book.fixtures";
import { parseGraph, type Graph, type GraphState } from "./graph";
import { coversMark, usedMarks } from "./algorithms";
import { PRESETS, presetById, presetGraph } from "./presets";
import { moduleByPath } from "../../registry";
import { scc } from "./scc";
import { sccPresets } from "./scc.presets";

const run = (g: Graph, variant?: string) => materialize(scc.run(g, 0, variant));
const last = <T>(a: readonly T[]) => a[a.length - 1];
const id = (g: Graph, label: string) =>
  g.nodes.find((n) => n.label === label)!.id;
const pseudo = (variant: string) =>
  scc.variants!.find((v) => v.id === variant)!.pseudocode ?? scc.pseudocode;

/** komponenty podle tříd n-compK na konci běhu: seznam množin (popisky seřazené), v pořadí indexu barvy */
function compsByColor(g: Graph, st: GraphState): string[][] {
  const by = new Map<string, string[]>();
  for (const n of g.nodes) {
    const c = (st.nodeMarks[n.id] ?? "")
      .split(" ")
      .find((x) => x.startsWith("n-comp"));
    expect(c, `vrchol ${n.label} nemá komponentu`).toBeDefined();
    by.set(c!, [...(by.get(c!) ?? []), n.label]);
  }
  return [...by.values()].map((l) => l.sort());
}

/** komponenty z hlášky vars.komponenty „{d, e, f}, {c}, {a, b}“ (v pořadí nalezení) */
function compsFromVars(st: GraphState): string[][] {
  const s = String(st.vars["komponenty"] ?? "");
  return [...s.matchAll(/\{([^}]*)\}/g)].map((m) =>
    m[1].split(", ").filter(Boolean),
  );
}

function bruteComps(g: Graph): string[][] {
  const n = g.nodes.length;
  const reach = Array.from({ length: n }, (_, i) => {
    const seen = new Set([i]);
    const stack = [i];
    while (stack.length) {
      const u = stack.pop()!;
      for (const e of g.edges)
        if (e.u === u && !seen.has(e.v)) {
          seen.add(e.v);
          stack.push(e.v);
        }
    }
    return seen;
  });
  const done = new Set<number>();
  const out: string[][] = [];
  for (let i = 0; i < n; i++) {
    if (done.has(i)) continue;
    const comp = [...Array(n).keys()].filter(
      (j) => reach[i].has(j) && reach[j].has(i),
    );
    comp.forEach((j) => done.add(j));
    out.push(comp.map((j) => g.nodes[j].label).sort());
  }
  return out;
}

const canon = (cs: string[][]) =>
  cs
    .map((c) => [...c].sort().join(","))
    .sort()
    .join(" | ");

function randomText(seed: number): string {
  const r = rng(seed * 7727 + 3);
  const n = 1 + Math.floor(r() * 10);
  const m = Math.floor(r() * (2.5 * n + 1));
  const lines: string[] = [];
  for (let v = 1; v <= n; v++) if (r() < 0.2) lines.push(String(v));
  for (let i = 0; i < m; i++)
    lines.push(`${1 + Math.floor(r() * n)} ${1 + Math.floor(r() * n)}`);
  return lines.join("\n") || "1";
}

describe("SCC – obr. 5.13 podle knihy", () => {
  const g = presetGraph(presetById("scc")!);

  it("Tarjan: komponenty {a, b}, {c}, {d, e, f} (book.fixtures SCC_5_13), nalezené v opačném topologickém pořadí", () => {
    const steps = run(g);
    const st = last(steps).state;
    expect(canon(compsByColor(g, st))).toBe(
      canon(Object.values(SCC_5_13.components).map((c) => [...c])),
    );
    expect(compsFromVars(st)).toEqual([["d", "e", "f"], ["c"], ["a", "b"]]);
    expect(last(steps).message).toBe(
      "Hotovo: 3 komponenty silné souvislosti – {d, e, f}, {c}, {a, b} (v pořadí nalezení, tedy v opačném topologickém pořadí grafu komponent).",
    );
  });

  it("Tarjan: in/esc pod vrcholy a komp(v) = kořen komponenty", () => {
    const st = last(run(g)).state;
    const expected: Record<string, string> = {
      a: "1/1",
      b: "2/1",
      c: "3/4",
      f: "4/4",
      e: "5/4",
      d: "6/4",
    };
    for (const [l, sub] of Object.entries(expected))
      expect(st.nodeSub[id(g, l)], l).toBe(sub);
    expect(st.vars["kořeny"]).toBe("f, c, a");
  });

  it("Tarjan: kroky po řádcích KSST – esc z hrany d→f, kořen f, odebírání ze zásobníku Z", () => {
    const steps = run(g);
    const line = (s: string) => scc.pseudocode.findIndex((l) => l.includes(s));
    const df = steps.find(
      (s) =>
        s.line === line("esc(v) ← min(esc(v), in(w))") &&
        s.message.startsWith("Hrana d→f"),
    )!;
    expect(df.message).toBe(
      "Hrana d→f: in(f) = 4 je definován a komp(f) ne (zpětná hrana) – esc(d) ← min(∞, 4) = 4.",
    );
    const root = steps.find(
      (s) => s.line === line("esc(v) ≥ in(v)") && s.message.includes("(f)"),
    )!;
    expect(root.message).toBe(
      "esc(f) = 4 ≥ in(f) = 4 – f je kořen komponenty, odebereme ji ze zásobníku Z.",
    );
    expect(root.state.table?.rows[0]).toEqual(["a", "b", "c", "f", "e", "d"]);
    // hrana do hotové komponenty esc nemění (a→d)
    const ad = steps.find((s) => s.message.startsWith("Hrana a→d"))!;
    expect(ad.message).toMatch(
      /komp\(d\) = f je definovaná – esc\(a\) se nemění/,
    );
    expect(
      ad.state.edgeMarks[
        g.edges.find((e) => e.u === id(g, "a") && e.v === id(g, "d"))!.id
      ],
    ).toBe("e-rejected");
  });

  it("varianta přes Gᵀ (5.9): DFS v Gᵀ plní zásobník Z podle out, pak DFS v G – tytéž komponenty, kořeny d, c, a", () => {
    const steps = run(g, "kosaraju");
    const st = last(steps).state;
    expect(canon(compsByColor(g, st))).toBe(
      canon(Object.values(SCC_5_13.components).map((c) => [...c])),
    );
    expect(compsFromVars(st)).toEqual([["d", "e", "f"], ["c"], ["a", "b"]]);
    expect(st.vars["kořeny"]).toBe("d, c, a");
    // zásobník po první fázi (dno vlevo): b, a, c, f, e, d
    const full = steps.find((s) =>
      /Všechny vrcholy jsou v zásobníku Z/.test(s.message),
    )!;
    expect(full.state.table?.rows[0]).toEqual(["b", "a", "c", "f", "e", "d"]);
    const p = pseudo("kosaraju");
    for (const s of steps)
      if (s.line !== null) expect(s.line).toBeLessThan(p.length);
    expect(p.join("\n")).toMatch(/Gᵀ/);
  });

  it("tip je pravdivý: f je kořen {d, e, f} (esc(f) = in(f)), varianta přes Gᵀ dá stejné komponenty", () => {
    expect(scc.tip).toMatch(/esc\(f\) = in\(f\)/);
    expect(scc.tip).toMatch(/Gᵀ/);
  });
});

describe("SCC – řádek Výstup (UX-14)", () => {
  it("poslední krok obou variant zvýrazní „Výstup: … komp(v)“ (str. 137)", () => {
    const g = presetGraph(presetById("scc")!);
    for (const v of ["tarjan", "kosaraju"]) {
      const steps = run(g, v);
      const pc =
        scc.variants!.find((x) => x.id === v)!.pseudocode ?? scc.pseudocode;
      expect(pc[steps.at(-1)!.line!], v).toMatch(/^Výstup: .*komp\(v\)/);
    }
  });
});

describe("SCC – název (UX-19)", () => {
  it("termín knihy pro obě varianty – „Komponenty silné souvislosti“, ne „(Tarjan)“; registr i modul stejně", () => {
    expect(scc.title).toBe("Komponenty silné souvislosti");
    expect(moduleByPath("/graph/scc")!.title).toBe(scc.title);
    expect(moduleByPath("/graph/scc")!.desc).toMatch(/Tarjan/);
    expect(moduleByPath("/graph/scc")!.desc).toMatch(/Gᵀ/);
  });
});

describe("SCC – obecně", () => {
  it("Tarjan i varianta přes Gᵀ = hrubá síla (dosažitelnost oběma směry) na 300 náhodných grafech", () => {
    for (let s = 1; s <= 300; s++) {
      const g = parseGraph(randomText(s), true, false);
      const want = canon(bruteComps(g));
      for (const v of ["tarjan", "kosaraju"]) {
        const st = last(run(g, v)).state;
        expect(canon(compsFromVars(st)), `seed ${s} ${v}`).toBe(want);
        // barvy rozliší komponenty, pokud jich je nejvýš 8
        if (bruteComps(g).length <= 8)
          expect(canon(compsByColor(g, st)), `seed ${s} ${v}`).toBe(want);
      }
    }
  });

  it("komponenty vznikají v opačném topologickém pořadí: hrana mezi komponentami vede z později nalezené do dřívější", () => {
    for (let s = 1; s <= 200; s++) {
      const g = parseGraph(randomText(s), true, false);
      for (const v of ["tarjan", "kosaraju"]) {
        const comps = compsFromVars(last(run(g, v)).state);
        const idx = new Map<string, number>();
        comps.forEach((c, i) => c.forEach((l) => idx.set(l, i)));
        for (const e of g.edges) {
          const a = idx.get(g.nodes[e.u].label)!;
          const b = idx.get(g.nodes[e.v].label)!;
          if (a !== b) expect(a, `seed ${s} ${v}`).toBeGreaterThan(b);
        }
      }
    }
  });

  it("vlastní příklad: příčná hrana do dosud neodebrané komponenty esc sníží, do odebrané ne", () => {
    const p = sccPresets.find((x) => x.id === "scc-cross")!;
    expect(p.directed).toBe(true);
    const g = presetGraph(p);
    const steps = run(g);
    expect(compsFromVars(last(steps).state)).toEqual([
      ["f", "g"],
      ["a", "b", "c", "d"],
    ]);
    expect(
      steps.some((s) =>
        /^Hrana d→c: in\(c\) = 3 je definován a komp\(c\) ne \(příčná hrana\) – esc\(d\) ← min\(∞, 3\) = 3\.$/.test(
          s.message,
        ),
      ),
    ).toBe(true);
    expect(
      steps.some((s) =>
        /^Hrana d→g: komp\(g\) = f je definovaná – esc\(d\) se nemění/.test(
          s.message,
        ),
      ),
    ).toBe(true);
  });

  it("každý krok: řádek v rozsahu pseudokódu varianty, hlášky bez undefined/Infinity; zásobník Z od prvního kroku", () => {
    for (let s = 1; s <= 40; s++) {
      const g = parseGraph(randomText(s), true, false);
      for (const v of ["tarjan", "kosaraju"]) {
        const steps: Step<GraphState>[] = run(g, v);
        expect(steps[0].state.table?.title).toMatch(/Zásobník Z/);
        for (const x of steps) {
          expect(x.message).not.toMatch(/undefined|NaN|Infinity/);
          if (x.line !== null) expect(x.line).toBeLessThan(pseudo(v).length);
        }
        expect(last(steps).message).toMatch(/^Hotovo/);
      }
    }
  });

  it("varianty: výchozí Tarjan (5.10), druhá přes Gᵀ (5.9) s vlastním pseudokódem", () => {
    expect(scc.variants!.map((v) => v.id)).toEqual(["tarjan", "kosaraju"]);
    expect(pseudo("tarjan")).toBe(scc.pseudocode);
    expect(pseudo("kosaraju")).not.toBe(scc.pseudocode);
  });

  it("legenda pokrývá třídy obou variant na všech předvolbách (obecný test běží jen výchozí variantu)", () => {
    for (const p of PRESETS)
      for (const v of ["tarjan", "kosaraju"]) {
        const used = usedMarks(run(parseGraph(p.text, true, p.weighted), v));
        for (const c of used)
          expect(
            scc.legend.some((l) =>
              l.marks.some((m) => coversMark(m, new Set([c]))),
            ),
            `${p.id} ${v}: ${c}`,
          ).toBe(true);
      }
  });
});
