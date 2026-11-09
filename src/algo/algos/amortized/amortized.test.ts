import { describe, expect, it } from "vitest";
import { materialize, rng, type Step, type StepGen } from "../../core/steps";
import {
  AMORT_DELETE,
  arrDeleteMany,
  arrInsertMany,
  batchCount,
  buildArr,
  capacityFor,
  CNT_MAX_START,
  cntValue,
  incrementMany,
  VAR_BOUND,
  AMORT_INSERT,
  ARR_MAX_N,
  ARR_MAX_VALUE,
  arrayLayout,
  arrDelete,
  arrInsert,
  CELLS_PER_ROW,
  increment,
  mkArr,
  mkCounter,
  PC_ARR_DELETE,
  PC_ARR_INSERT,
  PC_CNT,
  phiArr,
  VAR_AMORT_ARR,
  VAR_REAL,
  type ArrState,
  type CntState,
} from "./amortized";

/** Stejně jako useStructure: operace běží nad kopií koncového stavu té předchozí. */
function apply<S>(
  st: S,
  op: (s: S) => StepGen<S>,
): { steps: Step<S>[]; st: S } {
  const steps = materialize(op(structuredClone(st)));
  return { steps, st: steps[steps.length - 1].state };
}
const insert = (st: ArrState, x: number) => apply(st, (s) => arrInsert(s, x));
const remove = (st: ArrState) => apply(st, (s) => arrDelete(s));
const phi = (st: ArrState) => phiArr(st.items.length, st.p);
const values = (st: ArrState) => st.items.map((it) => it.v);

describe("nafukovací pole", () => {
  it("obsah, kapacita a skutečná cena odpovídají jednoduchému modelu (40 náhodných posloupností)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const fromEmpty = r() < 0.4;
      let st = fromEmpty ? mkArr(1, []) : mkArr(4, [1, 2, 3]);
      // referenční model
      let p = fromEmpty ? 1 : 4;
      const vals = fromEmpty ? [] : [1, 2, 3];
      let real = 0;
      let x = 4;
      const ops = 5 + Math.floor(r() * 60);
      for (let o = 0; o < ops; o++) {
        if (r() < 0.6) {
          const res = insert(st, x);
          if (vals.length === p) {
            real += vals.length;
            p *= 2;
          }
          vals.push(x++);
          real++;
          for (const s of res.steps)
            expect(s.state.items.length).toBeLessThanOrEqual(s.state.p);
          st = res.st;
        } else {
          const res = remove(st);
          if (vals.length) {
            vals.pop();
            real++;
            if (p === 4 * vals.length) {
              real += vals.length;
              p /= 2;
            }
          }
          st = res.st;
        }
        expect(values(st)).toEqual(vals);
        expect(st.p).toBe(p);
        expect(st.real).toBe(real);
        expect(Number.isInteger(Math.log2(st.p))).toBe(true);
        if (vals.length > 0) expect(st.p).toBeLessThanOrEqual(4 * vals.length);
        expect(new Set(st.items.map((it) => it.id)).size).toBe(st.items.length);
      }
    }
  });

  it("výchozí stav + 8× Insert: Σ skutečná nepřesáhne Σ amortizovanou + Φ₀ (dřív 20 > 16 + 2)", () => {
    let st = mkArr(4, [1, 2, 3]);
    for (let i = 0; i < 8; i++) st = insert(st, 4 + i).st;
    expect(st.real).toBe(20); // 8 zápisů + kopírování 4 + 8
    expect(st.amort).toBe(8 * AMORT_INSERT);
    expect(st.real).toBeLessThanOrEqual(st.amort + phiArr(3, 4));
  });

  it("už po dvou Insertech z výchozího stavu jsou zobrazené součty konzistentní", () => {
    let st = mkArr(4, [1, 2, 3]);
    st = insert(st, 4).st;
    st = insert(st, 5).st;
    expect(st.real).toBeLessThanOrEqual(st.amort + st.phi0 - phi(st));
  });

  it("potenciálová nerovnost Σ skutečná ≤ Σ amortizovaná + Φ₀ − Φ platí v každém kroku; jedna operace stojí amortizovaně ≤ 3 resp. ≤ 2", () => {
    let maxIns = -Infinity;
    let maxDel = -Infinity;
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed * 7);
      let st = r() < 0.5 ? mkArr(1, []) : mkArr(4, [1, 2, 3]);
      const phi0 = phi(st);
      expect(st.phi0).toBe(phi0);
      for (let o = 0; o < 50; o++) {
        const ins = r() < 0.6;
        if (!ins && !st.items.length) continue;
        const before = st;
        const res = ins ? insert(st, o) : remove(st);
        for (const s of res.steps)
          expect(
            s.state.real,
            `seed ${seed}, operace ${o}`,
          ).toBeLessThanOrEqual(s.state.amort + phi0 - phi(s.state));
        st = res.st;
        const amortized = st.real - before.real + phi(st) - phi(before);
        expect(st.amort - before.amort).toBe(ins ? AMORT_INSERT : AMORT_DELETE);
        if (ins) maxIns = Math.max(maxIns, amortized);
        else maxDel = Math.max(maxDel, amortized);
      }
    }
    // meze z pseudokódu jsou těsné
    expect(maxIns).toBe(AMORT_INSERT);
    expect(maxDel).toBe(AMORT_DELETE);
    expect(PC_ARR_INSERT.join("\n")).toContain(`≤ ${AMORT_INSERT}`);
    expect(PC_ARR_DELETE.join("\n")).toContain(`≤ ${AMORT_DELETE}`);
    expect(VAR_AMORT_ARR).toContain(`Insert ${AMORT_INSERT}`);
    expect(VAR_AMORT_ARR).toContain(`Delete ${AMORT_DELETE}`);
  });

  it("proměnné (n, p, Φ, Σ) jsou vidět v počátečním i vyprázdněném stavu a v každém kroku odpovídají stavu", () => {
    for (const init of [mkArr(4, [1, 2, 3]), mkArr(1, [])]) {
      expect(init.vars.n).toBe(init.items.length);
      expect(init.vars.p).toBe(init.p);
      expect(init.vars[VAR_REAL]).toBe(0);
      expect(init.vars[VAR_AMORT_ARR]).toBe(0);
      let st = init;
      const r = rng(11);
      for (let o = 0; o < 30; o++) {
        const res = r() < 0.6 ? insert(st, o) : remove(st);
        for (const s of res.steps) {
          expect(s.state.vars.n).toBe(s.state.items.length);
          expect(s.state.vars.p).toBe(s.state.p);
          expect(s.state.vars[VAR_REAL]).toBe(s.state.real);
          expect(s.state.vars[VAR_AMORT_ARR]).toBe(s.state.amort);
        }
        st = res.st;
      }
    }
    // první krok operace hned po načtení (dřív vars = {})
    expect(
      Object.keys(remove(mkArr(4, [1, 2, 3])).steps[0].state.vars).length,
    ).toBeGreaterThan(0);
    // Delete na prázdném poli nic neúčtuje
    const empty = remove(mkArr(1, []));
    expect(empty.steps).toHaveLength(1);
    expect(empty.st.amort).toBe(0);
    expect(empty.st.real).toBe(0);
  });

  it("řádky pseudokódu sedí na děj kroku", () => {
    const full = insert(mkArr(4, [1, 2, 3, 4]), 5);
    expect(full.steps.map((s) => s.line)).toEqual([1, 2, 3, null]);
    expect(PC_ARR_INSERT[1]).toContain("n = p");
    expect(PC_ARR_INSERT[2]).toContain("2p");
    expect(PC_ARR_INSERT[3]).toContain("A[n] ← x");
    expect(insert(mkArr(4, [1, 2, 3]), 4).steps.map((s) => s.line)).toEqual([
      3,
      null,
    ]);

    const sparse = remove(mkArr(8, [1, 2, 3]));
    expect(sparse.steps.map((s) => s.line)).toEqual([1, 2, 3, null]);
    expect(sparse.st.p).toBe(4);
    expect(PC_ARR_DELETE[1]).toContain("n ← n − 1");
    expect(PC_ARR_DELETE[2]).toContain("p = 4n");
    expect(PC_ARR_DELETE[3]).toContain("p/2");
    expect(remove(mkArr(4, [1, 2, 3])).steps.map((s) => s.line)).toEqual([
      1,
      2,
      null,
    ]);
    // po operaci nezůstane zvýrazněný odebraný prvek
    expect(Object.values(sparse.st.marks)).not.toContain("box-removed");
  });

  it("nesmyslné x nic nerozbije: NaN/∞ se odmítne hláškou, desetinné a obří číslo se upraví", () => {
    const base = mkArr(4, [1, 2, 3]);
    for (const bad of [NaN, Infinity, -Infinity]) {
      const res = insert(base, bad);
      expect(res.steps).toHaveLength(1);
      expect(res.steps[0].message).toMatch(/není číslo/);
      expect(values(res.st)).toEqual([1, 2, 3]);
      expect(res.st.amort).toBe(0);
    }
    expect(values(insert(base, 2.7).st)).toEqual([1, 2, 3, 2]);
    expect(values(insert(base, -0.5).st)).toEqual([1, 2, 3, 0]);
    expect(values(insert(base, 1e21).st)).toEqual([1, 2, 3, ARR_MAX_VALUE]);
    expect(values(insert(base, -1e21).st)).toEqual([1, 2, 3, -ARR_MAX_VALUE]);
    // i nesmyslná počáteční kapacita dá použitelný stav
    for (const p of [NaN, 0, -3, 2.5, Infinity]) {
      const st = mkArr(p, [1, 2, 3]);
      expect(st.p).toBeGreaterThanOrEqual(3);
      expect(Number.isInteger(st.p)).toBe(true);
    }
  });

  it(`nad ${ARR_MAX_N} prvků se Insert neprovede a oznámí to`, () => {
    let st = mkArr(1, []);
    for (let i = 0; i < ARR_MAX_N; i++) st = insert(st, i % 100).st;
    expect(st.items.length).toBe(ARR_MAX_N);
    const res = insert(st, 1);
    expect(res.steps).toHaveLength(1);
    expect(res.steps[0].message).toMatch(/omezená/);
    expect(res.st.items.length).toBe(ARR_MAX_N);
    expect(res.st.amort).toBe(st.amort);
    expect(res.st.p).toBeLessThanOrEqual(ARR_MAX_N);
  });

  it("rozložení buněk: kladná šířka, žádné překryvy a vše uvnitř viewBoxu pro každou kapacitu (dřív p = 512 → šířka −1)", () => {
    for (const p of [1, 2, 4, 8, 16, 17, 32, 64, 128, 256, 512]) {
      const lay = arrayLayout(p);
      expect(lay.cells).toBe(p);
      expect(lay.cellW).toBeGreaterThanOrEqual(30);
      expect(lay.perRow).toBeLessThanOrEqual(CELLS_PER_ROW);
      const seen = new Set<string>();
      for (let i = 0; i < lay.cells; i++) {
        const x = lay.x(i);
        const y = lay.y(i);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x + lay.cellW).toBeLessThanOrEqual(lay.width);
        expect(y + 42).toBeLessThanOrEqual(lay.height); // buňka + popisek indexu
        seen.add(`${x},${y}`);
        if (i % lay.perRow > 0)
          expect(x - lay.x(i - 1)).toBeGreaterThanOrEqual(lay.cellW);
      }
      expect(seen.size).toBe(lay.cells);
    }
    // malé pole se nekreslí zmenšeně: šířka viewBoxu roste s počtem buněk (dřív pevných 300)
    expect(arrayLayout(1).width).toBeLessThan(60);
    expect(arrayLayout(4).width).toBeLessThan(180);
    for (const p of [NaN, 0, -1, 0.5, Infinity]) {
      const lay = arrayLayout(p);
      expect(lay.cells).toBe(1);
      expect(Number.isFinite(lay.width) && Number.isFinite(lay.height)).toBe(
        true,
      );
    }
  });
});

describe("binární počítadlo", () => {
  it("po k incrementech je hodnota k, Σ skutečná = 2k − počet jedniček, Σ amortizovaná = 2k", () => {
    let st: CntState = mkCounter();
    expect(Object.keys(st.vars).length).toBeGreaterThan(0);
    for (let k = 1; k <= 200; k++) {
      const res = apply(st, (s) => increment(s));
      for (const s of res.steps) {
        expect(s.state.real).toBeLessThanOrEqual(s.state.amort);
        expect(s.line === null || PC_CNT[s.line] !== undefined).toBe(true);
      }
      // poslední krok nastavuje jedničku, předchozí shazují
      expect(res.steps.map((s) => s.line)).toEqual([
        ...Array(res.steps.length - 2).fill(3),
        4,
        null,
      ]);
      st = res.st;
      const value = st.bits.reduce((acc, b, i) => acc + b * 2 ** i, 0);
      const ones = st.bits.filter((b) => b === 1).length;
      expect(value).toBe(k);
      expect(st.vars["hodnota"]).toBe(k);
      expect(st.amort).toBe(2 * k);
      expect(st.real).toBe(2 * k - ones);
      expect(st.bits.every((b) => b === 0 || b === 1)).toBe(true);
    }
    expect(mkCounter().bits.every((b) => b === 0)).toBe(true);
  });
});

describe("nafukovací pole – závěr operace, chyby, dávky a stavba", () => {
  it("každá operace končí krokem bez řádku pseudokódu, který shrne výsledek a účet", () => {
    const ins = insert(mkArr(4, [1, 2, 3, 4]), 5);
    const last = ins.steps[ins.steps.length - 1];
    expect(last.line).toBeNull();
    expect(last.message).toMatch(
      /^Insert\(5\): n = 5, p = 8; skutečná cena 5, ΔΦ = −2 → amortizovaně 3 ≤ 3\.$/,
    );
    const del = remove(mkArr(8, [1, 2, 3]));
    expect(del.steps[del.steps.length - 1].message).toMatch(
      /^Delete: odebráno 3; n = 2, p = 4; skutečná cena 3, ΔΦ = −1 → amortizovaně 2 ≤ 2\.$/,
    );
    // na konci nezůstane žádné zvýraznění
    expect(del.st.marks).toEqual({});
  });

  it("neprovedená operace je jediný krok označený jako chyba (Delete na prázdném poli, NaN, limit)", () => {
    const empty = remove(mkArr(1, []));
    expect(empty.steps).toHaveLength(1);
    expect(empty.steps[0].error).toBe(true);
    expect(insert(mkArr(1, []), NaN).steps[0].error).toBe(true);
    // úspěšná operace chybu nehlásí
    expect(insert(mkArr(1, []), 1).steps.some((s) => s.error)).toBe(false);
  });

  it("dávky: provede se jen tolik operací, kolik dovolí stav, a souhrn sedí na součty", () => {
    const st = mkArr(4, [1, 2, 3]);
    expect(batchCount(st, 8, false)).toBe(3);
    expect(batchCount(st, 8, true)).toBe(8);
    expect(batchCount(mkArr(1, []), 8, false)).toBe(0);

    const ins = apply(st, (s) => arrInsertMany(s, 4, 8));
    expect(values(ins.st)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(ins.st.amort).toBe(8 * AMORT_INSERT);
    const sum = ins.steps[ins.steps.length - 1];
    expect(sum.line).toBeNull();
    expect(sum.message).toMatch(
      /^8× Insert: n = 11, p = 16; skutečná cena dávky 20, ΔΦ = \+4 → amortizovaně 24 ≤ 8·3 = 24\.$/,
    );

    const del = apply(st, (s) => arrDeleteMany(s, 8));
    expect(values(del.st)).toEqual([]);
    expect(del.st.amort).toBe(3 * AMORT_DELETE);
    expect(del.steps[del.steps.length - 1].message).toMatch(
      /^3× Delete: n = 0/,
    );
    // prázdná dávka = jediný chybový krok, nic se neúčtuje
    const none = apply(mkArr(1, []), (s) => arrDeleteMany(s, 8));
    expect(none.steps).toHaveLength(1);
    expect(none.steps[0].error).toBe(true);
    expect(none.st.amort).toBe(0);
  });

  it("Postavit: kapacita je nejbližší vyšší mocnina dvojky, nečísla zmizí, nejvýše ARR_MAX_N prvků", () => {
    expect([0, 1, 2, 3, 4, 5, 8, 9, 256].map(capacityFor)).toEqual([
      1, 1, 2, 4, 4, 8, 8, 16, 256,
    ]);
    const st = buildArr([5, 7, NaN, 2.5, 9, 1, 4]);
    expect(values(st)).toEqual([5, 7, 2, 9, 1, 4]);
    expect(st.p).toBe(8);
    expect(st.phi0).toBe(phiArr(6, 8));
    expect(st.vars.n).toBe(6);
    expect(buildArr([]).p).toBe(1);
    expect(
      buildArr(Array.from({ length: 300 }, (_, i) => i)).items,
    ).toHaveLength(ARR_MAX_N);
  });
});

describe("binární počítadlo – počáteční hodnota a dávka", () => {
  it("mkCounter(start) nastaví bity, Φ₀ a nerovnost Σ skutečná ≤ Σ amortizovaná + Φ₀ − Φ platí v každém kroku", () => {
    for (const start of [0, 1, 7, 255, 1000, CNT_MAX_START]) {
      let st = mkCounter(start);
      expect(cntValue(st)).toBe(start);
      expect(st.bits.length).toBeGreaterThanOrEqual(6);
      expect(st.phi0).toBe(st.bits.filter((b) => b).length);
      expect(st.vars[VAR_BOUND]).toBe(st.phi0 - st.phi0);
      for (let k = 1; k <= 20; k++) {
        const res = apply(st, (s) => increment(s));
        for (const s of res.steps)
          expect(s.state.real).toBeLessThanOrEqual(
            s.state.amort + st.phi0 - s.state.bits.filter((b) => b).length,
          );
        st = res.st;
        expect(cntValue(st)).toBe(start + k);
      }
    }
    expect(cntValue(mkCounter(-5))).toBe(0);
    expect(cntValue(mkCounter(NaN))).toBe(0);
    expect(cntValue(mkCounter(1e9))).toBe(CNT_MAX_START);
  });

  it("Increment z 7 shodí tři bity a závěrečný krok shrne účet; dávka 8× sečte ceny", () => {
    const one = apply(mkCounter(7), (s) => increment(s));
    expect(one.steps.map((s) => s.line)).toEqual([3, 3, 3, 4, null]);
    expect(one.steps[4].message).toBe(
      "Increment: 7 → 8; skutečná cena 4, ΔΦ = −2 → amortizovaně 2.",
    );
    const many = apply(mkCounter(0), (s) => incrementMany(s, 8));
    const last = many.steps[many.steps.length - 1];
    expect(cntValue(many.st)).toBe(8);
    expect(last.line).toBeNull();
    expect(last.message).toBe(
      "8× Increment: 0 → 8; skutečná cena dávky 15, ΔΦ = +1 → amortizovaně 16 = 8·2.",
    );
    expect(many.st.marks).toEqual({});
  });
});

describe("pole na telefonu (SORTDS-03)", () => {
  it("arrayLayout s nejvýš 8 buňkami v řádku: 16 buněk ve 2 řádcích, šířka pro 390 px", () => {
    const lay = arrayLayout(16, 8);
    expect(lay.perRow).toBe(8);
    expect(lay.rows).toBe(2);
    expect(lay.width).toBeLessThanOrEqual(358);
    // bez meze beze změny
    expect(arrayLayout(16).perRow).toBe(16);
  });
});

/* ---------------------------------------------------------------- graf ceny operací (E6, obr. 9.2) */

describe("graf skutečné ceny a potenciálu (obr. 9.2)", () => {
  const popcount = (v: number) => v.toString(2).replace(/0/g, "").length;
  /** počet jedniček na konci čísla */
  const trailingOnes = (v: number) => {
    let j = 0;
    while (v & 1) {
      j++;
      v >>= 1;
    }
    return j;
  };

  it("počítadlo 0 → 64 jako obr. 9.2: sloupec = skutečná cena 1 + j, křivka = počet jedniček", () => {
    const run = apply(mkCounter(0), (s) => incrementMany(s, 64));
    const c = run.st.chart;
    expect(c.phi0).toBe(0);
    expect(c.first).toBe(1);
    expect(c.ops).toHaveLength(64);
    expect(c.ops.map((o) => o.real)).toEqual(
      Array.from({ length: 64 }, (_, i) => 1 + trailingOnes(i)),
    );
    expect(c.ops.map((o) => o.phi)).toEqual(
      Array.from({ length: 64 }, (_, i) => popcount(i + 1)),
    );
    expect(c.ops[7].label).toBe("Increment 7 → 8");
    expect(c.live).toBe(false);
    // Σ sloupců = Σ skutečná cena v proměnných
    expect(c.ops.reduce((a, o) => a + o.real, 0)).toBe(run.st.real);
  });

  it("sloupec roste s kroky operace: Insert do plného pole má po kopírování cenu 4, na konci 5", () => {
    const run = insert(mkArr(4, [1, 2, 3, 4]), 5);
    const charts = run.steps.map((s) => s.state.chart);
    // první krok (n = p): operace začala, zatím nic nestála
    expect(charts[0].ops).toEqual([{ real: 0, phi: 4, label: "Insert(5)" }]);
    expect(charts[0].live).toBe(true);
    expect(charts[0].phi0).toBe(4);
    // po realokaci: zkopírované 4 prvky, Φ(4, 8) = 0
    expect(charts[1].ops[0]).toMatchObject({ real: 4, phi: 0 });
    const end = charts[charts.length - 1];
    expect(end.ops).toEqual([{ real: 5, phi: 2, label: "Insert(5)" }]);
    expect(end.live).toBe(false);
  });

  it("Delete se zmenšením i dávka: jeden sloupec za každou operaci, neprovedená operace graf nemění", () => {
    // p = 8, n = 3: Delete → n = 2, p = 4n → zmenšení na 4 (cena 1 + 2)
    const del = remove(mkArr(8, [1, 2, 3]));
    expect(del.st.chart.ops).toEqual([
      { real: 3, phi: phiArr(2, 4), label: "Delete" },
    ]);
    const many = apply(mkArr(4, [1, 2, 3, 4]), (s) => arrInsertMany(s, 5, 8));
    expect(many.st.chart.ops.map((o) => o.real)).toEqual([
      5, 1, 1, 1, 9, 1, 1, 1,
    ]);
    const empty = remove(mkArr(1, []));
    expect(empty.st.chart.ops).toEqual([]);
    expect(empty.st.chart.phi0).toBe(0.5);
  });

  it(`graf drží posledních ${64} operací: starší odpadnou, křivka začne potenciálem před první zobrazenou`, () => {
    const run = apply(mkCounter(0), (s) => incrementMany(s, 70));
    const c = run.st.chart;
    expect(c.ops).toHaveLength(64);
    expect(c.first).toBe(7);
    expect(c.phi0).toBe(popcount(6));
    expect(c.ops[0].label).toBe("Increment 6 → 7");
  });
});
