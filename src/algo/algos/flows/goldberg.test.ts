/*
 * Goldbergův algoritmus (Průvodce 14.5–14.6, str. 368–376): výsledek proti FordFulkersonovi na příkladech
 * z knihy i náhodných sítích, invarianty A, S a V z knihy v každém kroku, lemma Z a S (počty operací),
 * volba vrcholu (seznam P / nejvyšší vrchol z 14.6), řádky pseudokódu a hlášky.
 */
import { describe, expect, it } from "vitest";
import { materialize, type Step } from "../../core/steps";
import {
  cutOf,
  excess,
  lbl,
  residual,
  residualArcs,
  type FlowNet,
} from "./flowNet";
import { randomNet } from "./flowPageModel";
import { flowPresetById, presetNet } from "./flowPresets";
import { maxFlowValue } from "./fordFulkerson";
import {
  goldberg,
  GOLDBERG_LINES,
  goldbergPseudocode,
  PC_GOLDBERG,
  PC_GOLDBERG_HIGHEST,
  type GoldbergState,
  type GoldbergVariant,
} from "./goldberg";
import { netFromText } from "./flowNet";

const bookNet = (id: string): FlowNet => {
  const p = flowPresetById(id)!;
  const graph = presetNet(p).graph;
  const z = graph.nodes.find((n) => n.label === "z")!.id;
  const s = graph.nodes.find((n) => n.label === "s")!.id;
  return { graph, z, s };
};

const run = (net: FlowNet, variant: GoldbergVariant = "zakladni") =>
  materialize(goldberg(net, { variant }));

const last = <T>(a: readonly T[]) => a[a.length - 1];

/** invarianty z knihy (str. 369–371) v jednom kroku; vrací text porušení */
function invariantProblem(net: FlowNet, st: GoldbergState): string | null {
  const g = net.graph;
  const n = g.nodes.length;
  for (const e of g.edges) {
    const f = st.f[e.id];
    if (f < 0 || f > e.w) return `vlna překročila kapacitu ${e.id}`;
  }
  for (const v of g.nodes) {
    const x = excess(g, st.f, v.id);
    if (x !== st.ex[v.id]) return `přebytek ${v.label}: ${st.ex[v.id]} ≠ ${x}`;
    if (v.id !== net.z && x < 0) return `záporný přebytek ${v.label}`;
    if (st.h[v.id] > 2 * n) return `h(${v.label}) > 2n (invariant V)`;
  }
  if (st.h[net.z] !== n) return "h(z) ≠ n";
  if (st.h[net.s] !== 0) return "h(s) ≠ 0";
  for (const a of residualArcs(g))
    if (residual(g, st.f, a) > 0 && st.h[a.u] - st.h[a.v] > 1)
      return `hrana ${lbl(g, a.u)}→${lbl(g, a.v)} s rezervou má spád > 1 (invariant S)`;
  return null;
}

describe("Goldbergův algoritmus – výsledek", () => {
  it.each(["obr-14-2", "obr-14-3", "obr-14-6", "obr-14-7"])(
    "%s: maximální tok stejný jako FordFulkerson, obě varianty",
    (id) => {
      const net = bookNet(id);
      for (const variant of ["zakladni", "nejvyssi"] as const) {
        const steps = run(net, variant);
        const st = last(steps).state;
        expect(steps.some((s) => s.truncated)).toBe(false);
        expect(st.value, variant).toBe(maxFlowValue(net));
        expect(st.done).toBe(true);
        // na konci je vlna tokem: přebytky všude mimo z a s nulové
        for (const v of net.graph.nodes)
          if (v.id !== net.z && v.id !== net.s) expect(st.ex[v.id]).toBe(0);
      }
    },
  );

  it("obr. 14.2: tok 18 a minimální řez A = {z, a, b, c} jako na obr. 14.5", () => {
    const net = bookNet("obr-14-2");
    const st = last(run(net)).state;
    expect(st.value).toBe(18);
    const A = st.cut!.A.map((v) => lbl(net.graph, v)).sort();
    expect(A).toEqual(["a", "b", "c", "z"]);
    expect(st.cut).toEqual({
      A: cutOf(net, st.f).A,
      edges: cutOf(net, st.f).edges,
    });
  });

  it("náhodné sítě (40 semínek): obě varianty = FordFulkerson", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = randomNet(5 + (seed % 8), 10 + (seed % 9), seed);
      const net: FlowNet = { graph: g, z: 0, s: g.nodes.length - 1 };
      const want = maxFlowValue(net);
      for (const variant of ["zakladni", "nejvyssi"] as const)
        expect(last(run(net, variant)).state.value, `${seed} ${variant}`).toBe(
          want,
        );
    }
  });

  it("síť, kde ze zdroje nic nevede: tok 0 hned po inicializaci", () => {
    const net = netFromText("a s 3\nz b 0");
    const steps = run(net);
    expect(last(steps).state.value).toBe(0);
    expect(last(steps).line).toBe(GOLDBERG_LINES.output);
  });

  it("nepoužitelná síť: jediný chybový krok", () => {
    const net = netFromText("z s 3\nz s 4");
    const steps = run(net);
    expect(steps).toHaveLength(1);
    expect(steps[0].error).toBe(true);
    expect(steps[0].message).toMatch(/^Síť nejde použít: Dvě hrany z→s/);
  });
});

describe("Goldbergův algoritmus – invarianty a počty operací (str. 369–374)", () => {
  it.each(["obr-14-2", "obr-14-3", "obr-14-6", "obr-14-7"])(
    "%s: invarianty A, S, V v každém kroku; zvednutí ≤ 2n², nasycená převedení ≤ nm",
    (id) => {
      const net = bookNet(id);
      const n = net.graph.nodes.length;
      const m = net.graph.edges.length;
      for (const variant of ["zakladni", "nejvyssi"] as const) {
        const steps = run(net, variant);
        // první krok (výšky) ještě vlnu nemá – invarianty platí od vytvoření vlny
        const from = steps.findIndex((s) => s.line === GOLDBERG_LINES.wave);
        expect(from).toBeGreaterThan(0);
        let prevH: number[] | null = null;
        for (const s of steps.slice(from)) {
          expect(invariantProblem(net, s.state), s.message).toBeNull();
          // výšky nikdy neklesají (invariant A.2)
          if (prevH)
            s.state.h.forEach((h, v) =>
              expect(h).toBeGreaterThanOrEqual(prevH![v]),
            );
          prevH = s.state.h;
        }
        const st = last(steps).state;
        expect(st.lifts).toBeLessThanOrEqual(2 * n * n);
        expect(st.satPushes).toBeLessThanOrEqual(n * m);
        expect(st.pushes).toBeGreaterThanOrEqual(st.satPushes);
      }
    },
  );

  it("náhodné sítě: invariant S a vlna v každém kroku", () => {
    for (let seed = 100; seed < 115; seed++) {
      const g = randomNet(7, 13, seed);
      const net: FlowNet = { graph: g, z: 0, s: g.nodes.length - 1 };
      const steps = run(net, seed % 2 ? "nejvyssi" : "zakladni");
      const from = steps.findIndex((s) => s.line === GOLDBERG_LINES.wave);
      for (const s of steps.slice(from))
        expect(
          invariantProblem(net, s.state),
          `${seed}: ${s.message}`,
        ).toBeNull();
    }
  });
});

describe("Goldbergův algoritmus – kroky", () => {
  const net = bookNet("obr-14-2");
  const steps = run(net);
  const st0 = steps[0].state;
  const L = (v: number) => lbl(net.graph, v);

  it("krok 1: výšky h(z) = n = 6, ostatní 0; krok 2: počáteční vlna – hrany ze z na maximum", () => {
    expect(steps[0].line).toBe(GOLDBERG_LINES.heights);
    expect(steps[0].message).toBe(
      "Počáteční výšky: h(z) ← n = 6, ostatní vrcholy (a, b, c, d, s) ve výšce 0.",
    );
    expect(st0.h[net.z]).toBe(6);
    expect(st0.f.every((f) => f === 0)).toBe(true);
    expect(steps[1].line).toBe(GOLDBERG_LINES.wave);
    expect(steps[1].message).toBe(
      "Počáteční vlna: hrany ze z na maximum – z→a 10, z→b 10. Přebytek mají a (10), b (10); seznam P = (a, b).",
    );
    expect(steps[1].state.P.map(L)).toEqual(["a", "b"]);
  });

  it("výběr vrcholu, převedení a zvednutí mají své řádky a české hlášky s desetinnou čárkou čísel", () => {
    const pick = steps.find((s) => s.line === GOLDBERG_LINES.loop)!;
    expect(pick.message).toBe(
      "Vrchol s přebytkem: u = a (přebytek 10, h(a) = 0) – první v seznamu P = (a, b).",
    );
    // a je ve výšce 0 jako všichni sousedé kromě z – musí se zvednout
    const lift = steps.find((s) => s.line === GOLDBERG_LINES.lift)!;
    expect(lift.message).toBe(
      "Z a nevede žádná hrana s kladnou rezervou dolů (rezervu mají a→c, a→d, a→z ve výškách 0, 0, 6) → zvedneme a: h(a) = 0 → 1.",
    );
    expect(lift.state.lift).toEqual({ v: 1, from: 0 });
    const push = steps.find((s) => s.line === GOLDBERG_LINES.push)!;
    expect(push.message).toBe(
      "Převedeme přebytek po hraně a→c (h 1 → 0): δ = min(10, 7) = 7 – nasycené převedení, r(a→c) = 0. Přebytky: a 3, c 7.",
    );
    expect(push.state.push).toMatchObject({ delta: 7, saturating: true });
  });

  it("převedení zpět po hraně s tokem (proti směru) odečte tok – hláška to řekne", () => {
    const back = steps.find(
      (s) => s.line === GOLDBERG_LINES.push && /proti směru/.test(s.message),
    );
    expect(back, "na obr. 14.2 se přebytek vrací ke zdroji").toBeDefined();
    expect(back!.message).toMatch(
      /^Převedeme přebytek po hraně [a-d]→[a-z] \(h \d+ → \d+\) proti směru hrany [a-z]→[a-d]: δ = min\(\d+, \d+\) = \d+/,
    );
  });

  it("konec: řádek Výstup, |f|, počty operací a minimální řez", () => {
    const end = last(steps);
    expect(end.line).toBe(GOLDBERG_LINES.output);
    expect(end.message).toMatch(
      /^Hotovo – žádný vrchol kromě z a s nemá přebytek, vlna je tok: maximální tok \|f\| = 18 \(\d+ převedení, z toho \d+ nasycených; \d+ zvednutí\)\. Minimální řez E\(A, B\) s A = \{z, a, b, c\} má kapacitu 18/,
    );
  });

  it("varianta nejvyšší vrchol (14.6): vybraný u má vždy největší výšku mezi vrcholy s přebytkem", () => {
    const hi = run(bookNet("obr-14-7"), "nejvyssi");
    let picks = 0;
    for (const s of hi) {
      const st = s.state;
      if (st.u === null || s.line === GOLDBERG_LINES.output) continue;
      if (s.line !== GOLDBERG_LINES.loop) continue;
      picks++;
      const hs = st.P.map((v) => st.h[v]);
      expect(st.h[st.u]).toBe(Math.max(...hs));
      expect(s.message).toMatch(/^Nejvyšší vrchol s přebytkem: u = /);
      expect(st.H).toBe(Math.max(...hs));
    }
    expect(picks).toBeGreaterThan(3);
  });

  it("varianty se liší počtem kroků na obr. 14.7 a pseudokód má vlastní řádek výběru", () => {
    const a = run(bookNet("obr-14-7"), "zakladni");
    const b = run(bookNet("obr-14-7"), "nejvyssi");
    expect(a.length).not.toBe(b.length);
    expect(goldbergPseudocode("zakladni")).toBe(PC_GOLDBERG);
    expect(goldbergPseudocode("nejvyssi")).toBe(PC_GOLDBERG_HIGHEST);
    expect(PC_GOLDBERG_HIGHEST[GOLDBERG_LINES.loop]).toMatch(/nejvyšší/);
    expect(PC_GOLDBERG.length).toBe(PC_GOLDBERG_HIGHEST.length);
    // pseudokód bez knižních čísel řádků
    for (const l of PC_GOLDBERG) expect(l).not.toMatch(/^\s*\d+\./);
  });

  it("pseudokód drží knižní komentáře (str. 369) a variantu 14.6 čitelně (V-8)", () => {
    expect(PC_GOLDBERG[GOLDBERG_LINES.heights - 1]).toContain(
      "// zdroj ve výšce n, ostatní ve výšce 0",
    );
    expect(PC_GOLDBERG[GOLDBERG_LINES.wave - 2]).toContain(
      "// všechny hrany ze z na maximum",
    );
    expect(PC_GOLDBERG_HIGHEST[GOLDBERG_LINES.loop]).not.toMatch(/ s s /);
    expect(PC_GOLDBERG_HIGHEST[GOLDBERG_LINES.loop]).toMatch(/nejvyšší/);
  });

  it("hláška zvednutí skloňuje podle počtu hran s rezervou (V-8)", () => {
    const msgs: string[] = [];
    for (const ex of ["obr-14-2", "obr-14-3", "obr-14-7"])
      for (const v of ["zakladni", "nejvyssi"] as const)
        for (const s of run(bookNet(ex), v))
          if (s.line === GOLDBERG_LINES.lift) msgs.push(s.message);
    const one = msgs.filter((m) => /\(rezervu má /.test(m));
    expect(one.length).toBeGreaterThan(0);
    for (const m of one) expect(m).toMatch(/rezervu má [^,()]+ ve výšce \d+\)/);
    for (const m of msgs)
      expect(m).not.toMatch(/rezervu mají [^,()]+ ve výškách \d+\)/);
  });

  it("každý krok nese řádek pseudokódu (mimo chybový) a stav je kopie", () => {
    for (const s of steps as Step<GoldbergState>[])
      expect(s.line).not.toBeNull();
    expect(steps[0].state).not.toBe(steps[1].state);
  });
});
