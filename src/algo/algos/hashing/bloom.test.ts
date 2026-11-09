/**
 * Bloomův filtr (bloom.ts) a pomocná funkce pro písmo v buňkách (cellText.ts).
 * Testy s „BUG:“ v názvu hlídají dříve nalezené chyby (audit, skupina Hešování).
 */
import { describe, expect, it } from "vitest";
import { randomArray, rng, type Step } from "../../core/steps";
import {
  blInsert,
  blInsertAll,
  blQuery,
  blTestForeign,
  bloomBits,
  bloomFp,
  mkB,
  PC_BL_INSERT,
  PC_BL_QUERY,
  type BloomState,
} from "./bloom";
import { fitCellText, textWidth } from "./cellText";

const drain = (gen: Iterable<unknown>) => {
  for (const s of gen) void s;
};

function run(
  st: BloomState,
  gen: Iterable<Step<BloomState>>,
  pc: string[],
): Step<BloomState>[] {
  const steps = [...gen];
  expect(steps.length).toBeGreaterThan(0);
  for (const s of steps)
    expect(
      s.line === null || (s.line >= 0 && s.line < pc.length),
      `řádek ${s.line}`,
    ).toBe(true);
  const last = steps[steps.length - 1].state;
  // nic se nesmí změnit až po posledním yield
  expect({ bits: st.bits, inserted: st.inserted }).toEqual({
    bits: last.bits,
    inserted: last.inserted,
  });
  return steps;
}

describe("Bloomův filtr", () => {
  it("Insert nastaví právě bity h₁(x) … h_k(x); proměnné sedí se stavem", () => {
    for (const [m, k] of [
      [16, 1],
      [32, 3],
      [64, 5],
    ]) {
      const st = mkB(m, k);
      expect(st.vars.n).toBe(0);
      const want = new Set<number>();
      const keys = randomArray(8, 999, m + k);
      for (const x of keys) {
        const pos = bloomBits(st, x);
        expect(pos).toHaveLength(k);
        for (const p of pos) {
          expect(Number.isInteger(p) && p >= 0 && p < m).toBe(true);
          want.add(p);
        }
        const steps = run(st, blInsert(st, x), PC_BL_INSERT);
        expect(steps).toHaveLength(k);
        expect(steps.every((s) => s.line === 2 && s.state.vars.x === x)).toBe(
          true,
        );
      }
      expect(st.bits.map((b, i) => (b ? i : -1)).filter((i) => i >= 0)).toEqual(
        [...want].sort((a, b) => a - b),
      );
      expect(st.bits).toHaveLength(m);
      expect(st.inserted).toEqual([...new Set(keys)]);
      expect(st.vars["jedničky"]).toBe(want.size);
      expect(st.vars.n).toBe(new Set(keys).size);
    }
  });

  it("žádné falešně negativní odpovědi: Lookup vloženého klíče vždy skončí ANO", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const st = mkB(32, 3);
      const keys = randomArray(10, 60000, seed);
      drain(blInsertAll(st, keys));
      for (const x of keys) {
        const steps = run(st, blQuery(st, x), PC_BL_QUERY);
        const last = steps[steps.length - 1];
        expect(last.line).toBe(3);
        expect(last.message).toContain("odpověď ANO");
        expect(last.message).toContain("opravdu vložen");
        expect(
          Object.values(last.state.marks).every((c) => c === "cell-hit"),
        ).toBe(true);
      }
    }
  });

  it("Lookup nevloženého klíče: NE při prvním nulovém bitu, jinak ANO označené jako falešně pozitivní", () => {
    const st = mkB(16, 2);
    drain(blInsertAll(st, randomArray(6, 999, 3)));
    let no = 0;
    let fp = 0;
    for (let x = 1000; x < 1200; x++) {
      const allOne = bloomBits(st, x).every((p) => st.bits[p]);
      const steps = run(st, blQuery(st, x), PC_BL_QUERY);
      const last = steps[steps.length - 1];
      if (allOne) {
        fp++;
        expect(last.line).toBe(3);
        expect(last.message).toContain("falešně pozitivní");
      } else {
        no++;
        expect(last.line).toBe(2);
        expect(last.message).toContain("určitě není");
        expect(Object.values(last.state.marks)).toContain("cell-removed");
      }
    }
    expect(no).toBeGreaterThan(0);
    expect(fp).toBeGreaterThan(0);
  });

  it("BUG: záporný, necelý nebo nekonečný klíč operaci neshodí a filtr nezmění (dřív RangeError z BigInt / bit na záporném indexu)", () => {
    const st = mkB(32, 3);
    drain(blInsertAll(st, [17, 42]));
    const before = structuredClone({ bits: st.bits, inserted: st.inserted });
    for (const x of [-5, -100, 1.5, 3.5, NaN, Infinity, 65536, 1e300])
      for (const [op, pc] of [
        [blInsert, PC_BL_INSERT],
        [blQuery, PC_BL_QUERY],
      ] as const) {
        const steps = run(st, op(st, x), pc);
        expect(steps, `${op.name}(${x})`).toHaveLength(1);
        expect(steps[0].message).toContain(
          "Klíč musí být celé číslo od 0 do 65535",
        );
        expect({ bits: st.bits, inserted: st.inserted }).toEqual(before);
        expect(Object.keys(st.bits)).toHaveLength(32);
      }
  });

  it("odhad falešně pozitivních odpovídá vzorci (1 − e^(−kn/m))^k", () => {
    const st = mkB(32, 3);
    expect(bloomFp(st)).toBe(0);
    drain(blInsertAll(st, [1, 2, 3, 4]));
    expect(bloomFp(st)).toBeCloseTo(Math.pow(1 - Math.exp(-12 / 32), 3), 12);
    expect(st.vars["odhad P(falešně pozitivní)"]).toBe("3,1 %");
  });

  it("test nevložených klíčů: testuje jen cizí klíče a na konci správně spočítá falešně pozitivní", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const st = mkB(16, 2);
      const r = rng(seed);
      drain(
        blInsertAll(
          st,
          Array.from({ length: 8 }, () => 1 + Math.floor(r() * 999)),
        ),
      );
      const before = structuredClone({ bits: st.bits, inserted: st.inserted });
      const steps = run(st, blTestForeign(st, 10, seed * 7), PC_BL_QUERY);
      const answers = steps.filter((s) => s.message.includes("odpověď"));
      expect(answers).toHaveLength(10);
      for (const s of answers)
        expect(st.inserted).not.toContain(s.state.vars.x);
      expect(new Set(answers.map((s) => s.state.vars.x)).size).toBe(10);
      const fp = answers.filter((s) =>
        s.message.includes("falešně pozitivní"),
      ).length;
      expect(
        answers.filter((s) => s.message.includes("opravdu vložen")),
      ).toHaveLength(0);
      const last = steps[steps.length - 1];
      expect(last.line).toBeNull();
      expect(last.message).toContain(`ANO u ${fp} `);
      expect(last.state.vars["falešně pozitivních"]).toBe(`${fp} z 10`);
      expect(last.state.marks).toEqual({});
      expect({ bits: st.bits, inserted: st.inserted }).toEqual(before);
    }
  });
});

describe("písmo v buňkách tabulky (cellText)", () => {
  it("BUG: i pěticiferný klíč se vejde do buňky při m = 32 (obdélník 24 px) i m = 16 (41 px)", () => {
    for (const [rect, base] of [
      [24, 11],
      [41, 14],
    ])
      for (const text of ["", "7", "42", "999", "4242", "65535", "†"]) {
        const t = fitCellText(text, rect, base);
        const width = t.textLength ?? textWidth(text, t.style.fontSize);
        expect(width, `„${text}“ v buňce ${rect} px`).toBeLessThanOrEqual(
          rect - 3,
        );
        expect(t.style.fontSize).toBeLessThanOrEqual(base);
        expect(t.style.fontSize).toBeGreaterThanOrEqual(9);
        if (t.textLength !== undefined)
          expect(t.lengthAdjust).toBe("spacingAndGlyphs");
      }
    // krátké klíče zůstávají ve výchozí velikosti a bez deformace
    expect(fitCellText("999", 24, 11)).toEqual({ style: { fontSize: 11 } });
    expect(fitCellText("4242", 41, 14)).toEqual({ style: { fontSize: 14 } });
    expect(fitCellText("65535", 24, 11).textLength).toBe(21);
  });
});
