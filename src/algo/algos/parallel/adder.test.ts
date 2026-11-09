// Sčítačka (Průvodce 15.2, s. 386–390): bloky a jejich skládání, kódování (p, q), školní sčítání
// (obr. 15.3), paralelní sčítání (obr. 15.4) – výsledky proti datům z knihy (adderBook.fixtures.ts).
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import {
  ADDER_PSEUDOCODE,
  adderSteps,
  applyBlock,
  bitBlock,
  bitsOf,
  blockLevels,
  carryPlan,
  compose,
  composePQ,
  carryPQ,
  fromPQ,
  parallelAdd,
  parallelDepth,
  schoolAdd,
  schoolDepth,
  strOf,
  toPQ,
  type Behavior,
  type Bit,
} from "./adder";
import { COMPOSITION, FIG_15_4, ONE_BIT_BLOCKS } from "./adderBook.fixtures";

const B: Behavior[] = ["0", "1", "<"];
const num = (bits: readonly Bit[]) =>
  bits.reduce<number>((a, b, i) => a + b * 2 ** i, 0);
const bin = (v: number, n: number) => v.toString(2).padStart(n, "0");

describe("bloky a skládání (s. 388–389)", () => {
  it("jednobitové bloky: (0,0) → 0, (0,1) → <, (1,0) → <, (1,1) → 1", () => {
    for (const { x, y, b } of ONE_BIT_BLOCKS) expect(bitBlock(x, y)).toBe(b);
  });

  it("tabulka skládání H ∘ D je skládání funkcí", () => {
    COMPOSITION.order.forEach((h, r) =>
      COMPOSITION.order.forEach((d, s) => {
        expect(compose(h, d), `${h} ∘ ${d}`).toBe(COMPOSITION.rows[r][s]);
        for (const c of [0, 1] as Bit[])
          expect(applyBlock(compose(h, d), c)).toBe(
            applyBlock(h, applyBlock(d, c)),
          );
      }),
    );
  });

  it("chování bloku: 0 pohlcuje, 1 vytváří, < kopíruje přenos", () => {
    expect([applyBlock("0", 0), applyBlock("0", 1)]).toEqual([0, 0]);
    expect([applyBlock("1", 0), applyBlock("1", 1)]).toEqual([1, 1]);
    expect([applyBlock("<", 0), applyBlock("<", 1)]).toEqual([0, 1]);
  });

  it("kódování (p, q): (1,∗) = <, (0,0) = 0, (0,1) = 1; vzorce p_B, q_B a průchod přenosu dávají totéž co tabulka", () => {
    expect(toPQ("<")[0]).toBe(1);
    expect(toPQ("0")).toEqual([0, 0]);
    expect(toPQ("1")).toEqual([0, 1]);
    expect(fromPQ([1, 0])).toBe("<");
    expect(fromPQ([1, 1])).toBe("<");
    for (const h of B)
      for (const d of B) {
        // (1, ∗): obě hodnoty q musí dát stejný výsledek
        for (const qh of h === "<" ? [0, 1] : [toPQ(h)[1]])
          for (const qd of d === "<" ? [0, 1] : [toPQ(d)[1]]) {
            const pqH: [Bit, Bit] = [toPQ(h)[0], qh as Bit];
            const pqD: [Bit, Bit] = [toPQ(d)[0], qd as Bit];
            expect(fromPQ(composePQ(pqH, pqD)), `${h} ∘ ${d}`).toBe(
              compose(h, d),
            );
          }
        for (const c of [0, 1] as Bit[])
          expect(carryPQ(toPQ(h), c)).toBe(applyBlock(h, c));
      }
  });
});

describe("obr. 15.4 – paralelní sčítání pro n = 8 (s. 390)", () => {
  const x = bitsOf(FIG_15_4.x);
  const y = bitsOf(FIG_15_4.y);

  it("vstup se čte od nejvyššího řádu: x = 116, y = 59", () => {
    expect(num(x)).toBe(116);
    expect(num(y)).toBe(59);
    expect(strOf(x)).toBe(FIG_15_4.x);
  });

  it("řádky bloků velikosti 1, 2, 4, 8 přesně jako v obrázku", () => {
    const levels = blockLevels(x, y);
    expect(levels.map((l) => [...l].reverse())).toEqual(FIG_15_4.blocks);
  });

  it("přenosy po krocích zahušťování: {c₀, c₈}, {c₄}, {c₆, c₂}, {c₇, c₅, c₃, c₁}", () => {
    const plan = carryPlan(x, y);
    expect(plan.rounds).toHaveLength(4);
    plan.rounds.forEach((round, s) => {
      const got = Object.fromEntries(round.map((r) => [r.to, plan.c[r.to]]));
      expect(got, `krok ${s}`).toEqual(
        Object.fromEntries(
          Object.entries(FIG_15_4.carryRounds[s]).map(([k, v]) => [
            Number(k),
            v,
          ]),
        ),
      );
    });
    // c_{i+b} se počítá z cᵢ blokem [i, i + b)
    expect(plan.rounds[2].find((r) => r.to === 6)).toMatchObject({
      from: 4,
      level: 1,
      block: 2,
    });
  });

  it("výstup 1 0 1 0 1 1 1 1 = 175, z₈ = c₈ = 0", () => {
    const r = parallelAdd(x, y);
    expect(strOf(r.z.slice(0, 8))).toBe(FIG_15_4.z);
    expect(r.z[8]).toBe(0);
    expect(num(r.z)).toBe(FIG_15_4.sum);
  });

  it("školní algoritmus (obr. 15.3): přenosy c₀ … c₈ = 0 0 0 0 0 1 1 1 0, týž výsledek", () => {
    const r = schoolAdd(x, y);
    expect(r.c).toEqual(FIG_15_4.schoolCarries);
    expect(strOf(r.z.slice(0, 8))).toBe(FIG_15_4.z);
  });
});

describe("správnost a hloubka", () => {
  it("paralelní = školní = x + y pro všechny dvojice 4bitových čísel (i přetečení); přenosy se shodují", () => {
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++) {
        const x = bitsOf(bin(a, 4));
        const y = bitsOf(bin(b, 4));
        const p = parallelAdd(x, y);
        const s = schoolAdd(x, y);
        expect(num(p.z), `${a} + ${b}`).toBe(a + b);
        expect(num(s.z)).toBe(a + b);
        expect(p.c).toEqual(s.c);
        expect(p.z[4]).toBe(a + b >= 16 ? 1 : 0);
      }
  });

  it("náhodná 16bitová čísla i nejhorší přenos 0111…1 + 0…01", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let t = 0; t < 200; t++) {
      const a = rnd() % 65536;
      const b = rnd() % 65536;
      const p = parallelAdd(bitsOf(bin(a, 16)), bitsOf(bin(b, 16)));
      expect(num(p.z)).toBe(a + b);
    }
    const w = parallelAdd(
      bitsOf("0111111111111111"),
      bitsOf("0000000000000001"),
    );
    expect(strOf(w.z)).toBe("01000000000000000");
  });

  it("žádný blok se nechová jako negace – všechny bloky všech vstupů n = 4 jsou 0, 1 nebo <", () => {
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++)
        for (const level of blockLevels(bitsOf(bin(a, 4)), bitsOf(bin(b, 4))))
          for (const blk of level) expect(B).toContain(blk);
  });

  it("hloubka: paralelní 2·log₂ n + 3 hladin (8 → 9, 16 → 11), školní n krabiček", () => {
    expect([4, 8, 16].map(parallelDepth)).toEqual([7, 9, 11]);
    expect([4, 8, 16].map(schoolDepth)).toEqual([4, 8, 16]);
    const levels = blockLevels(bitsOf(bin(1, 16)), bitsOf(bin(2, 16)));
    const plan = carryPlan(bitsOf(bin(1, 16)), bitsOf(bin(2, 16)));
    // bloky (k + 1 hladin) + zahušťování (k + 1) + součet (1)
    expect(levels.length + plan.rounds.length + 1).toBe(parallelDepth(16));
  });
});

describe("kroky (přehrávač stojí na kroku 1 – kroky jen připraví stav)", () => {
  const x = bitsOf(FIG_15_4.x);
  const y = bitsOf(FIG_15_4.y);

  it("paralelně: úvod + 9 hladin = 10 kroků; hladiny přibývají postupně, poslední krok = výsledek", () => {
    const steps = materialize(adderSteps(x, y, "par"));
    expect(steps).toHaveLength(1 + parallelDepth(8));
    const par = steps.map((s) => s.state.par!);
    expect(par[0].levels).toHaveLength(0);
    expect(par[1].levels).toHaveLength(1);
    expect(par[1].hotLevel).toBe(0);
    expect(par[4].levels).toHaveLength(4);
    // krok 5 = zahušťování, krok 0: c₀ a c₈
    expect(par[5].carries[0]).toBe(0);
    expect(par[5].carries[8]).toBe(0);
    expect(par[5].carries[4]).toBeNull();
    expect(par[5].hotRound).toBe(0);
    expect(par[7].carries[6]).toBe(1);
    expect(par[7].used).toEqual(
      expect.arrayContaining([
        { level: 1, block: 2 },
        { level: 1, block: 0 },
      ]),
    );
    expect(par[8].z.every((b) => b === null)).toBe(true);
    const last = steps[steps.length - 1];
    expect(strOf(last.state.par!.z.slice(0, 8))).toBe(FIG_15_4.z);
    expect(last.state.par!.done).toBe(true);
    expect(last.message).toContain("116 + 59 = 175");
    expect(steps.every((s) => s.state.school === null)).toBe(true);
    // skládání: v kroku hladiny 2ʲ se zvýrazní použité buňky tabulky H ∘ D
    expect(par[2].composed).toContain("0|<");
    for (const s of steps) expect(ADDER_PSEUDOCODE.par[s.line!]).toBeDefined();
  });

  it("školně: c₀, pak krabička po krabičce (n = 8) a zₙ ← cₙ = 10 kroků", () => {
    const steps = materialize(adderSteps(x, y, "school"));
    expect(steps).toHaveLength(schoolDepth(8) + 2);
    const sc = steps.map((s) => s.state.school!);
    expect(sc[0].c[0]).toBe(0);
    expect(sc[0].c[1]).toBeNull();
    expect(sc[5].hot).toBe(4);
    expect(sc[5].c[5]).toBe(1);
    expect(sc[5].c[6]).toBeNull();
    expect(sc[8].z[8]).toBeNull();
    expect(sc[9].z[8]).toBe(0);
    expect(sc[9].c).toEqual(FIG_15_4.schoolCarries);
    expect(steps[5].message).toContain("Σ₄");
    expect(steps[9].state.school!.done).toBe(true);
  });

  it("obě souběžně po hladinách: max(9, 8) hladin + úvod + shrnutí; školní skončí v hladině 8, paralelní v 9", () => {
    const steps = materialize(adderSteps(x, y, "both"));
    expect(steps).toHaveLength(1 + 9 + 1);
    expect(steps[8].state.school!.hot).toBe(7);
    expect(steps[9].state.school!.hot).toBeNull();
    expect(steps[9].state.par!.done).toBe(true);
    const last = steps[steps.length - 1];
    expect(last.state.school!.done).toBe(true);
    expect(last.message).toMatch(/školní 8 hladin.*paralelní 9/);
    for (const s of steps) expect(ADDER_PSEUDOCODE.both[s.line!]).toBeDefined();
    // n = 16: paralelní skončí dřív (11 < 16)
    const big = materialize(
      adderSteps(bitsOf(bin(1, 16)), bitsOf(bin(65535, 16)), "both"),
    );
    expect(big).toHaveLength(1 + 16 + 1);
    expect(big[11].state.par!.done).toBe(true);
    expect(big[11].state.school!.done).toBe(false);
  });
});
