/**
 * Intervalový strom – regresní testy generátorů kroků.
 * Testy „BUG:“ jsou převzaté z auditu (src/_audit/structures*.test.ts) a hlídají opravené chyby.
 */
import { describe, expect, it } from "vitest";
import { rng, type StepGen } from "../../core/steps";
import {
  BUILD,
  QUERY,
  SEG_MAX,
  UPDATE,
  build,
  buildSteps,
  querySteps,
  updateSteps,
  type SegState,
} from "./segtree";
import { badLines, runOp, type OpResult } from "./testutil";

type Op = (st: SegState) => StepGen<SegState>;
const INF = Number.POSITIVE_INFINITY;
const val = (v: number | null) => (v === null ? INF : v);
const show = (v: number) => (v === INF ? "∞" : String(v));
const DEFAULT = [5, 2, 8, 1, 9, 3, 7, 4];

function page(initial = DEFAULT) {
  let st = build(initial);
  return {
    get st() {
      return st;
    },
    run(op: Op): OpResult<SegState> {
      const r = runOp(st, op);
      st = r.last;
      return r;
    },
  };
}

/** strom odpovídá posloupnosti values doplněné +∞ na mocninu dvojky */
function checkSeg(st: SegState, values: number[]) {
  let n = 1;
  while (n < values.length) n *= 2;
  expect(st.n).toBe(n);
  expect(st.S.length).toBe(2 * n);
  for (let k = 0; k < n; k++)
    expect(val(st.S[n + k])).toBe(k < values.length ? values[k] : INF);
  for (let v = n - 1; v >= 1; v--)
    expect(val(st.S[v])).toBe(Math.min(val(st.S[2 * v]), val(st.S[2 * v + 1])));
}

/** jediný krok bez řádku pseudokódu, strom beze změny a bez zvýraznění */
function expectRejected(r: OpResult<SegState>, before: SegState) {
  expect(r.steps).toHaveLength(1);
  expect(r.steps[0].line).toBeNull();
  expect(r.last.S).toEqual(before.S);
  expect(r.last.n).toBe(before.n);
  expect(r.last.marks).toEqual({});
  expect(r.last.queried).toBeNull();
  expect(r.last.vars).toEqual({});
  expect(Object.keys(r.last.S).every((k) => Number.isInteger(Number(k)))).toBe(
    true,
  );
}

describe("intervalový strom – neceločíselné indexy (segtree-non-integer-index)", () => {
  it("BUG: neceločíselné i (1.5) – dotaz se odmítne, nesestupuje pod listy a nevrací „NaN“", () => {
    const p = page();
    const r = p.run((st) => querySteps(st, 1.5, 6));
    expectRejected(r, build(DEFAULT));
    expect(r.steps[0].message).toBe(
      "Meze dotazu musí být celá čísla (zadáno i = 1.5, j = 6).",
    );
  });

  it("BUG: nedyadické i (1.3) ani neceločíselné j se nezanoří desítky hladin", () => {
    for (const [i, j] of [
      [1.3, 6],
      [2, 5.5],
      [0.1, 0.7],
      [NaN, 4],
      [1, NaN],
      [0, Infinity],
    ]) {
      const r = page().run((st) => querySteps(st, i, j));
      expectRejected(r, build(DEFAULT));
      expect(r.steps[0].message).toContain("Meze dotazu musí být celá čísla");
      expect(r.steps[0].message).not.toContain("NaN");
    }
  });

  it("BUG: neceločíselné i (2.5) u změny prvku – nic se nezapíše do S[10.5]", () => {
    const r = page().run((st) => updateSteps(st, 2.5, 0));
    expectRejected(r, build(DEFAULT));
    expect(r.steps[0].message).toBe(
      "Index i musí být celé číslo – posloupnost má prvky x₀ … x₇.",
    );
  });
});

describe("intervalový strom – neplatný vstup se neopravuje potichu (structures-silent-input-corrections)", () => {
  it("dotaz s i ≥ j se odmítne (dřív se tiše spustil ⟨i, i+1⟩)", () => {
    const r = page().run((st) => querySteps(st, 6, 2));
    expectRejected(r, build(DEFAULT));
    expect(r.steps[0].message).toBe(
      "Interval ⟨6, 2⟩ je prázdný – dotaz ⟨i, j⟩ znamená xᵢ … xⱼ₋₁, musí platit i < j.",
    );
    expectRejected(
      page().run((st) => querySteps(st, 3, 3)),
      build(DEFAULT),
    );
  });

  it("dotaz mimo ⟨0, n⟩ se odmítne (dřív se tiše ořízl)", () => {
    for (const [i, j] of [
      [-3, 99],
      [0, 9],
      [-1, 4],
      [99, 100],
      [0, 1e9],
    ]) {
      const r = page().run((st) => querySteps(st, i, j));
      expectRejected(r, build(DEFAULT));
      expect(r.steps[0].message).toContain("musí platit 0 ≤ i < j ≤ 8");
    }
  });

  it("změna prvku mimo 0 … n−1 nebo na nečíselnou hodnotu se odmítne", () => {
    for (const i of [-1, 8, 99, 1e9, NaN, Infinity])
      expectRejected(
        page().run((st) => updateSteps(st, i, 4)),
        build(DEFAULT),
      );
    expect(page().run((st) => updateSteps(st, 99, 4)).steps[0].message).toBe(
      "Prvek x₉₉ neexistuje – posloupnost má prvky x₀ … x₇.",
    );
    for (const x of [NaN, Infinity, -Infinity]) {
      const r = page().run((st) => updateSteps(st, 3, x));
      expectRejected(r, build(DEFAULT));
      expect(r.steps[0].message).toBe(
        "Nová hodnota x není číslo – změnu nelze provést.",
      );
    }
  });

  it("Postavit bez jediného čísla strom nesmaže a neohlásí úspěch", () => {
    for (const [values, ignored] of [
      [[], ["x", "y", "z"]],
      [[], []],
      [[NaN, -Infinity], []],
    ] as [number[], string[]][]) {
      const r = page().run((st) => buildSteps(st, values, ignored));
      expectRejected(r, build(DEFAULT));
      expect(r.steps[0].message).toContain("Ve vstupu není žádné číslo");
      expect(r.steps[0].message).toContain("Strom se nezměnil.");
    }
  });

  it(`Postavit bere nejvýše ${SEG_MAX} čísel a oříznutí i přeskočené tokeny ohlásí`, () => {
    const input = Array.from({ length: 20 }, (_, k) => 20 - k);
    const r = page().run((st) => buildSteps(st, input, ["abc"]));
    checkSeg(r.last, input.slice(0, SEG_MAX));
    expect(r.steps[0].message).toContain(
      "vstup má 20 čísel, vizualizace bere jen prvních 16",
    );
    expect(r.steps[0].message).toContain("přeskočeno, není číslo: abc");
    checkSeg(build(input), input.slice(0, SEG_MAX));
  });

  it("chybová hláška zruší zvýraznění předchozího dotazu", () => {
    const p = page();
    p.run((st) => querySteps(st, 2, 6));
    expect(p.st.queried).toEqual([2, 6]);
    const r = p.run((st) => querySteps(st, 6, 2));
    expect(r.last.queried).toBeNull();
    expect(r.last.marks).toEqual({});
  });
});

describe("intervalový strom – invarianty", () => {
  it("Build + dotazy ⟨i,j⟩ + změny prvků proti hrubé síle (náhodné vstupy)", () => {
    for (let seed = 1; seed <= 16; seed++) {
      const r = rng(seed * 7919);
      const len = 1 + Math.floor(r() * 16);
      const values = Array.from(
        { length: len },
        () => Math.floor(r() * 60) - 20,
      );
      const p = page();
      const b = p.run((st) => buildSteps(st, values));
      expect(badLines(b.steps, BUILD)).toEqual([]);
      checkSeg(p.st, values);
      const n = p.st.n;
      const padded = [...values, ...Array(n - len).fill(INF)] as number[];

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j <= n; j++) {
          if (n > 4 && r() > 0.3) continue;
          const q = p.run((st) => querySteps(st, i, j));
          expect(badLines(q.steps, QUERY)).toEqual([]);
          const fin = q.steps.at(-1)!;
          const expected = show(Math.min(...padded.slice(i, j)));
          expect(fin.state.vars["výsledek"], `seed ${seed} ⟨${i},${j}⟩`).toBe(
            expected,
          );
          expect(fin.message.endsWith(`Minimum = ${expected}.`)).toBe(true);
          expect(fin.state.queried).toEqual([i, j]);
          // kanonické vrcholy: disjunktní, pokrývají přesně ⟨i,j⟩, nejvýše 2 log n (lemma z Průvodce)
          const canon = Object.entries(fin.state.marks)
            .filter(([, c]) => c === "n-min")
            .map(([k]) => Number(k));
          const covered: number[] = [];
          for (const v of canon) {
            const d = Math.floor(Math.log2(v));
            const size = n / 2 ** d;
            const from = (v - 2 ** d) * size;
            for (let k = from; k < from + size; k++) covered.push(k);
          }
          expect(covered.sort((a, b) => a - b)).toEqual(
            Array.from({ length: j - i }, (_, k) => i + k),
          );
          expect(canon.length).toBeLessThanOrEqual(
            Math.max(1, 2 * Math.log2(n)),
          );
          // každý navštívený vrchol ve stromu existuje a dotaz strom nemění
          for (const s of q.steps)
            for (const k of Object.keys(s.state.marks))
              expect(Number(k)).toBeLessThan(2 * n);
          expect(fin.state.S).toEqual(q.steps[0].state.S);
        }
      }

      for (let u = 0; u < 4; u++) {
        const i = Math.floor(r() * len);
        const x = Math.floor(r() * 60) - 20;
        const up = p.run((st) => updateSteps(st, i, x));
        expect(badLines(up.steps, UPDATE)).toEqual([]);
        values[i] = x;
        checkSeg(p.st, values);
        expect(p.st.queried).toBeNull();
      }
    }
  });

  it("závěrečná hláška dotazu: správné skloňování a mez 2 log₂ n", () => {
    const p = page();
    expect(p.run((st) => querySteps(st, 0, 8)).steps.at(-1)!.message).toBe(
      "Min⟨0, 8⟩: rozklad na 1 kanonický interval (nejvýše 2 log₂ n = 6). Minimum = 1.",
    );
    expect(p.run((st) => querySteps(st, 2, 6)).steps.at(-1)!.message).toBe(
      "Min⟨2, 6⟩: rozklad na 2 kanonické intervaly (nejvýše 2 log₂ n = 6). Minimum = 1.",
    );
    expect(p.run((st) => querySteps(st, 1, 7)).steps.at(-1)!.message).toBe(
      "Min⟨1, 7⟩: rozklad na 4 kanonické intervaly (nejvýše 2 log₂ n = 6). Minimum = 1.",
    );
    // n = 1: jediný vrchol, mez 2 log₂ 1 = 0 by byla nepravdivá – neuvádí se
    const one = page([4]);
    expect(one.run((st) => querySteps(st, 0, 1)).steps.at(-1)!.message).toBe(
      "Min⟨0, 1⟩: rozklad na 1 kanonický interval. Minimum = 4.",
    );
  });

  it("doplňkové listy +∞ jsou prvky posloupnosti: lze se na ně ptát i je přepsat", () => {
    const p = page([1, 2, 3, 4, 5]); // n = 8, x_5 … x_7 = ∞
    expect(p.run((st) => querySteps(st, 5, 8)).last.vars["výsledek"]).toBe("∞");
    p.run((st) => updateSteps(st, 6, 0));
    expect(p.st.S.slice(8)).toEqual([1, 2, 3, 4, 5, null, 0, null]);
    expect(p.st.S[1]).toBe(0);
  });

  it("strom s jediným prvkem: Build, dotaz i změna", () => {
    const p = page();
    const b = p.run((st) => buildSteps(st, [7]));
    expect(p.st.S).toEqual([null, 7]);
    expect(badLines(b.steps, BUILD)).toEqual([]);
    expect(p.run((st) => querySteps(st, 0, 1)).last.vars["výsledek"]).toBe("7");
    const up = p.run((st) => updateSteps(st, 0, -2.5));
    expect(p.st.S).toEqual([null, -2.5]);
    expect(badLines(up.steps, UPDATE)).toEqual([]);
  });
});

describe("hlášky dotazu jmenují vrchol i jeho interval (SORTDS-08)", () => {
  it("„vrchol v = 5 ⟨2,4⟩“", async () => {
    const { build: b, querySteps: q } = await import("./segtree");
    const { materialize: m } = await import("../../core/steps");
    const steps = m(q(b([3, 1, 4, 1, 5, 9, 2, 6]), 2, 4));
    expect(steps.some((x) => /vrchol v = 5 ⟨2,4⟩/i.test(x.message))).toBe(true);
  });
});
