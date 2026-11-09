/**
 * Splay a BB[α]-strom (trees2.ts): invarianty a regrese nálezů auditu (potenciál Φ po strukturální
 * změně, řádky pseudokódu, platnost α, kontrola celého stromu po snížení α, plovoucí čárka v mezi α·s_u).
 */
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step, type StepGen } from "../../core/steps";
import { emptyTree, insertSilent, type TreeState } from "./bst";
import {
  PC_BB_DELETE,
  PC_BB_INSERT,
  PC_SPLAY_DELETE,
  PC_SPLAY_FIND,
  PC_SPLAY_INSERT,
  alphaError,
  bbDelete,
  bbInsert,
  bbPotential,
  bbViolations,
  buildBalanced,
  potential,
  splayDelete,
  splayFind,
  splayInsert,
  sizeLabels,
} from "./trees2";

function apply<S>(
  state: S,
  op: (s: S) => StepGen<S>,
): { steps: Step<S>[]; state: S } {
  const steps = materialize(op(structuredClone(state)));
  return { steps, state: steps.length ? steps[steps.length - 1].state : state };
}

function buildBst(values: number[]): TreeState {
  const st = emptyTree(false);
  for (const v of values) insertSilent(st, v);
  st.marks = {};
  st.edgeMarks = {};
  st.vars = {};
  return st;
}

function buildBb(values: number[]): TreeState {
  const st = emptyTree(false);
  buildBalanced(st, values);
  return st;
}

function inorder(st: TreeState): number[] {
  const out: number[] = [];
  let reached = 0;
  const walk = (id: number | null) => {
    if (id === null) return;
    const n = st.nodes[id];
    expect(n).toBeDefined();
    reached++;
    walk(n.left);
    out.push(n.key);
    walk(n.right);
  };
  walk(st.root);
  expect(reached).toBe(Object.keys(st.nodes).length);
  return out;
}

const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
const outOfRange = (steps: Step<unknown>[], pc: string[]) =>
  steps
    .filter((s) => s.line !== null && (s.line < 0 || s.line >= pc.length))
    .map((s) => `${s.line}: ${s.message}`);
const depth = (st: TreeState, id: number | null): number =>
  id === null
    ? 0
    : 1 + Math.max(depth(st, st.nodes[id].left), depth(st, st.nodes[id].right));
const PATH7 = [10, 20, 30, 40, 50, 60, 70]; // výchozí strom stránky /tree/splay

/* ================================================================== splay */

describe("splay strom – invarianty", () => {
  it("náhodné posloupnosti: množina klíčů, splayovaný vrchol v kořeni, řádky v pseudokódu, Φ odpovídá stromu", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const r = rng(seed * 104729);
      let st = emptyTree(false);
      const ref = new Set<number>();
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(r() * 30) - 3;
        const p = r();
        const ctx = `splay seed ${seed} op ${i} x=${x}`;
        if (p < 0.45) {
          const res = apply(st, (s) => splayInsert(s, x));
          expect(outOfRange(res.steps, PC_SPLAY_INSERT), ctx).toEqual([]);
          st = res.state;
          ref.add(x);
          expect(st.nodes[st.root!].key, ctx).toBe(x);
        } else if (p < 0.75) {
          const res = apply(st, (s) => splayDelete(s, x));
          expect(outOfRange(res.steps, PC_SPLAY_DELETE), ctx).toEqual([]);
          st = res.state;
          ref.delete(x);
        } else {
          const res = apply(st, (s) => splayFind(s, x));
          expect(outOfRange(res.steps, PC_SPLAY_FIND), ctx).toEqual([]);
          st = res.state;
          if (ref.has(x)) expect(st.nodes[st.root!].key, ctx).toBe(x);
        }
        expect(inorder(st), ctx).toEqual(sorted(ref));
        if (st.vars["Φ"] !== undefined)
          expect(st.vars["Φ"], ctx).toBe(potential(st));
      }
    }
  });

  it("amortizovaná mez: rotace + ΔΦ ≤ 3·(r′(x) − r(x)) + 1 pro Splay nejhlubšího vrcholu cesty", () => {
    for (let n = 2; n <= 30; n += 4) {
      const st = buildBst(Array.from({ length: n }, (_, i) => i + 1));
      const res = apply(st, (s) => splayFind(s, n));
      const rot = Number(res.state.vars.rotace);
      expect(rot).toBe(n - 1);
      expect(rot + potential(res.state) - potential(st)).toBeLessThanOrEqual(
        3 * Math.log2(n) + 1 + 0.05,
      );
    }
  });

  it("počet rotací a Φ v mezikrocích odpovídají právě zobrazenému stromu (i uprostřed zig-zig)", () => {
    const steps = apply(buildBst(PATH7), (s) => splayFind(s, 70)).steps;
    for (const s of steps)
      if (s.state.vars["Φ"] !== undefined)
        expect(s.state.vars["Φ"], s.message).toBe(potential(s.state));
  });

  it("splay Delete chybějícího klíče svítí na řádku o posledním navštíveném vrcholu", () => {
    const steps = apply(buildBst(PATH7), (s) => splayDelete(s, 65)).steps;
    const step = steps.find((s) => s.message.includes("ve stromu není"))!;
    expect(PC_SPLAY_DELETE[step.line!]).toMatch(/naposledy navštíveného/);
  });
});

describe("regrese: phi-stale-after-structural-change", () => {
  it("splay Delete kořene s jediným synem: koncové Φ odpovídá stromu", () => {
    const res = apply(buildBst(PATH7), (s) => splayDelete(s, 10));
    expect(Object.keys(res.state.nodes).length).toBe(6);
    expect(res.state.vars["Φ"]).toBe(potential(res.state));
  });

  it("splay Delete: po odebrání kořene je Φ součtem potenciálů levého a pravého podstromu (kniha 9.5)", () => {
    const st = buildBst([40, 20, 60, 10, 30, 50, 70, 25]);
    const steps = apply(st, (s) => splayDelete(s, 40)).steps;
    const step = steps.find((s) => s.message.startsWith("Odebereme kořen"))!;
    expect(step).toBeDefined();
    const S = step.state;
    const root = S.nodes[S.root!];
    expect(root.key).toBe(40);
    expect(S.marks[root.id]).toBe("n-removed");
    const phiOf = (id: number | null): number => {
      let sum = 0;
      const rec = (v: number | null): number => {
        if (v === null) return 0;
        const m = 1 + rec(S.nodes[v].left) + rec(S.nodes[v].right);
        sum += Math.log2(m);
        return m;
      };
      rec(id);
      return sum;
    };
    expect(Number(step.state.vars["Φ"])).toBeCloseTo(
      phiOf(root.left) + phiOf(root.right),
      2,
    );
  });
});

describe("splay Delete podle Průvodce 9.5 (obr. 9.7)", () => {
  /** předchůdce x v množině klíčů */
  const pred = (keys: number[], x: number) =>
    keys.filter((k) => k < x).reduce((m, k) => Math.max(m, k), -Infinity);
  const keysOf = (st: TreeState, id: number | null): number[] =>
    id === null
      ? []
      : [
          ...keysOf(st, st.nodes[id].left),
          st.nodes[id].key,
          ...keysOf(st, st.nodes[id].right),
        ];

  it("nalezené x se vysplayuje do kořene, odebere a kořenem je maximum levého podstromu s pravým podstromem vpravo", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = rng(seed * 7919);
      const keys = [
        ...new Set(Array.from({ length: 12 }, () => Math.floor(r() * 50))),
      ];
      const st = buildBst(keys);
      for (const x of keys) {
        const res = apply(st, (s) => splayDelete(s, x));
        const ctx = `seed ${seed} x=${x}`;
        // x se nejdřív dostane do kořene
        expect(
          res.steps.some(
            (s) =>
              s.state.nodes[s.state.root!]?.key === x &&
              s.message.startsWith("Odebereme kořen"),
          ),
          ctx,
        ).toBe(true);
        const rest = keys.filter((k) => k !== x).sort((a, b) => a - b);
        expect(inorder(res.state), ctx).toEqual(rest);
        const p = pred(keys, x);
        if (Number.isFinite(p)) {
          const root = res.state.nodes[res.state.root!];
          expect(root.key, ctx).toBe(p);
          expect(keysOf(res.state, root.right), ctx).toEqual(
            rest.filter((k) => k > x),
          );
        }
        expect(res.state.vars["Φ"], ctx).toBe(potential(res.state));
      }
    }
  });

  it("prázdný levý podstrom: kořenem se stane pravý podstrom", () => {
    const res = apply(buildBst(PATH7), (s) => splayDelete(s, 10));
    expect(res.state.nodes[res.state.root!].key).toBe(20);
    expect(
      res.steps.some((s) => /Levý podstrom je prázdný/.test(s.message)),
    ).toBe(true);
  });

  it("pseudokód popisuje postup z knihy a řádky kroků jsou v jeho rozsahu", () => {
    const text = PC_SPLAY_DELETE.join("\n");
    expect(text).toMatch(/maximum/);
    expect(text).toMatch(/pravého syna/);
    const steps = apply(buildBst([5, 0, 6, 2, 1, 4, 3]), (s) =>
      splayDelete(s, 2),
    ).steps;
    expect(outOfRange(steps, PC_SPLAY_DELETE)).toEqual([]);
    const lines = new Set(steps.map((s) => s.line));
    // odebrání kořene, hledání maxima a připojení pravého podstromu mají své řádky
    for (const re of [/Odebereme/, /maximum/, /připojíme/])
      expect(
        [...lines].some((l) => l !== null && re.test(PC_SPLAY_DELETE[l])),
        String(re),
      ).toBe(true);
  });

  it("splay Insert: krok „Připojíme nový list“ ukazuje Φ stromu s novým listem", () => {
    const step = apply(buildBst(PATH7), (s) => splayInsert(s, 80)).steps.find(
      (s) => s.message.startsWith("Připojíme nový list"),
    )!;
    expect(Object.keys(step.state.nodes).length).toBe(8);
    expect(step.state.vars["Φ"]).toBe(potential(step.state));
  });

  it("BB[α] Delete kořene s jediným synem: koncové Φ odpovídá stromu", () => {
    let cur = buildBb([10]);
    for (const x of [20, 30, 40, 50])
      cur = apply(cur, (s) => bbInsert(s, x, 0.9)).state;
    expect(cur.nodes[cur.root!].left).toBeNull();
    const res = apply(cur, (s) => bbDelete(s, 10, 0.9));
    expect(Object.keys(res.state.nodes).length).toBe(4);
    expect(res.state.vars["Φ"]).toBe(bbPotential(res.state));
  });

  it("BB[α] Insert: krok „Připojíme nový list“ ukazuje Φ stromu s novým listem", () => {
    const st = apply(buildBb([10, 20, 30]), (s) => bbInsert(s, 40, 0.9)).state;
    const step = apply(st, (s) => bbInsert(s, 50, 0.9)).steps.find((s) =>
      s.message.startsWith("Připojíme nový list"),
    )!;
    expect(Object.keys(step.state.nodes).length).toBe(5);
    expect(step.state.vars["Φ"]).toBe(bbPotential(step.state));
  });
});

/* ================================================================== BB[α] */

describe("BB[α]-strom – invarianty", () => {
  for (const alpha of [0.55, 0.7, 0.9]) {
    it(`α = ${alpha}: náhodné posloupnosti drží podmínku vyvážení a množinu klíčů`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const r = rng(seed * 31337 + Math.round(alpha * 100));
        const init = Array.from({ length: Math.floor(r() * 12) }, () =>
          Math.floor(r() * 45),
        );
        let st = buildBb(init);
        const ref = new Set(init);
        for (let i = 0; i < 40; i++) {
          // převážně rostoucí klíče, aby k přestavbám opravdu docházelo
          const x = r() < 0.5 ? 100 + i : Math.floor(r() * 45);
          const ctx = `BB[${alpha}] seed ${seed} op ${i} x=${x}`;
          const ins = r() < 0.6;
          const res = apply(st, (s) =>
            ins ? bbInsert(s, x, alpha) : bbDelete(s, x, alpha),
          );
          expect(
            outOfRange(res.steps, ins ? PC_BB_INSERT : PC_BB_DELETE),
            ctx,
          ).toEqual([]);
          st = res.state;
          if (ins) ref.add(x);
          else ref.delete(x);
          expect(inorder(st), ctx).toEqual(sorted(ref));
          expect(bbViolations(st, alpha), ctx).toEqual([]);
          expect(st.vars["Φ"], ctx).toBe(bbPotential(st));
        }
      }
    });
  }
});

describe("regrese: bb-delete-rebuild-line-out-of-range", () => {
  it("přestavba při Delete svítí na řádku „…přestavíme (Build)“ v PC_BB_DELETE", () => {
    let cur = buildBb([10, 20, 30, 40, 50, 60, 70]);
    const rebuilds: Step<TreeState>[] = [];
    for (const x of [10, 20, 30]) {
      const res = apply(cur, (s) => bbDelete(s, x, 0.7));
      expect(outOfRange(res.steps, PC_BB_DELETE)).toEqual([]);
      rebuilds.push(
        ...res.steps.filter((s) => s.message.startsWith("Přestavíme podstrom")),
      );
      cur = res.state;
    }
    expect(rebuilds.length).toBeGreaterThan(0);
    for (const s of rebuilds)
      expect(PC_BB_DELETE[s.line!]).toMatch(/přestavíme \(Build\)/);
  });
});

describe("regrese: bb-alpha-range-not-enforced", () => {
  it("alphaError přijme jen 1/2 < α < 1", () => {
    for (const a of [0.51, 0.55, 0.7, 0.95, 0.999])
      expect(alphaError(a)).toBeNull();
    for (const a of [0.5, 0.3, 0, -1, 1, 1.5, NaN, Infinity])
      expect(alphaError(a)).toMatch(/α musí být/);
  });

  it("Insert a Delete s neplatným α operaci odmítnou a strom nezmění", () => {
    const st = buildBb([40, 20, 60, 10, 30, 50, 70, 25]);
    for (const a of [0.3, 0, 1, NaN]) {
      for (const res of [
        apply(st, (s) => bbInsert(s, 35, a)),
        apply(st, (s) => bbDelete(s, 40, a)),
      ]) {
        expect(res.steps.length).toBe(1);
        expect(res.steps[0].error).toBe(true);
        expect(inorder(res.state)).toEqual(inorder(st));
      }
    }
  });

  it("plovoucí čárka: syn s 63 vrcholy pod vrcholem s 90 vrcholy podmínku α = 0.7 neporušuje (0.7 · 90 = 63)", () => {
    expect(0.7 * 90).toBeLessThan(63); // důvod tolerance v porovnání
    // kořen 64: vlevo dokonale vyvážený podstrom 1…63, vpravo 65…90 (26 vrcholů) → s = 90
    const st = emptyTree(false);
    const balancedOrder = (lo: number, hi: number): number[] => {
      if (lo > hi) return [];
      const mid = Math.floor((lo + hi) / 2);
      return [
        mid,
        ...balancedOrder(lo, mid - 1),
        ...balancedOrder(mid + 1, hi),
      ];
    };
    for (const k of [64, ...balancedOrder(1, 63), ...balancedOrder(65, 90)])
      insertSilent(st, k);
    expect(Object.keys(st.nodes).length).toBe(90);
    expect(bbViolations(st, 0.7)).not.toContain(64);
  });
});

describe("regrese: bb-alpha-change-stale-invariant", () => {
  it("po snížení α z 0.9 na 0.55 další operace nejdřív opraví celý strom", () => {
    let cur = emptyTree(false);
    for (const x of [50, 60, 70, 80, 40, 30, 20])
      cur = apply(cur, (s) => bbInsert(s, x, 0.9)).state;
    expect(bbViolations(cur, 0.9)).toEqual([]);
    expect(bbViolations(cur, 0.55).length).toBeGreaterThan(0);

    const ins = apply(cur, (s) => bbInsert(s, 10, 0.55));
    expect(
      ins.steps.some((s) => s.message.includes("snížil z 0,9 na 0,55")),
    ).toBe(true);
    expect(bbViolations(ins.state, 0.55)).toEqual([]);
    expect(inorder(ins.state)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(ins.state.vars["Φ"]).toBe(bbPotential(ins.state));

    const del = apply(ins.state, (s) => bbDelete(s, 10, 0.55));
    expect(bbViolations(del.state, 0.55)).toEqual([]);
    // α se nezměnilo → žádná kontrola celého stromu navíc
    expect(
      del.steps.some((s) =>
        s.message.includes("zkontrolujeme všechny vrcholy"),
      ),
    ).toBe(false);
  });

  it("zvýšení α celý strom nekontroluje; strom s neznámou historií se kontroluje jen při porušení", () => {
    let cur = buildBb([10, 20, 30, 40, 50, 60, 70]);
    const first = apply(cur, (s) => bbInsert(s, 80, 0.7));
    expect(
      first.steps.some((s) =>
        s.message.includes("zkontrolujeme všechny vrcholy"),
      ),
    ).toBe(false);
    cur = first.state;
    const up = apply(cur, (s) => bbInsert(s, 90, 0.9));
    expect(
      up.steps.some((s) => s.message.includes("zkontrolujeme všechny vrcholy")),
    ).toBe(false);
    // cesta vložená obyčejně (bez BB) porušuje podmínku → první operace ji opraví
    const path = buildBst([1, 2, 3, 4, 5, 6]);
    const fixed = apply(path, (s) => bbInsert(s, 7, 0.7));
    expect(
      fixed.steps.some((s) => s.message.includes("Strom nesplňuje podmínku")),
    ).toBe(true);
    expect(bbViolations(fixed.state, 0.7)).toEqual([]);
    expect(depth(fixed.state, fixed.state.root)).toBeLessThanOrEqual(4);
  });
});

describe("popisky s(v) pod vrcholy", () => {
  it("splay Delete: odebraný kořen velikost podstromu nemá (patří k němu dva samostatné podstromy)", () => {
    const steps = apply(buildBst([5, 0, 6, 2, 1, 4, 3]), (s) =>
      splayDelete(s, 2),
    ).steps;
    const ghost = steps.find((s) => s.message.startsWith("Odebereme kořen"))!;
    const subs = sizeLabels(ghost.state);
    expect(subs.get(ghost.state.root!)).toBeUndefined();
    const L = ghost.state.nodes[ghost.state.root!].left!;
    expect(subs.get(L)).toBe("s=2");
    // běžný strom: každý vrchol s(v)
    const st = buildBst(PATH7);
    expect(sizeLabels(st).get(st.root!)).toBe("s=7");
  });
});
