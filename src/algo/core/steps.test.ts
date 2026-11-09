import { describe, expect, it } from "vitest";
import {
  isTruncated,
  materialize,
  MAX_STEPS,
  parseNumbers,
  randomArray,
  rng,
  snap,
  type StepGen,
} from "./steps";

function* count(n: number): StepGen<number> {
  for (let i = 0; i < n; i++) yield snap(i, null, `krok ${i}`);
}

describe("steps", () => {
  it("snap ukládá hlubokou kopii stavu", () => {
    const state = { a: [1, 2] };
    const step = snap(state, 0, "x");
    state.a.push(3);
    expect(step.state.a).toEqual([1, 2]);
  });

  it("materialize posbírá všechny kroky", () => {
    function* gen(): StepGen<number> {
      yield snap(1, null, "a");
      yield snap(2, null, "b");
    }
    expect(materialize(gen()).map((s) => s.state)).toEqual([1, 2]);
  });

  it("parseNumbers bere čísla oddělená mezerami, čárkami i středníky", () => {
    expect(parseNumbers("1, 2;3  4")).toEqual([1, 2, 3, 4]);
  });
});

describe("materialize – limit kroků", () => {
  it("běh s přesně `limit` kroky doběhne celý bez hlášky o limitu (dřív falešná hláška a limit + 1 kroků)", () => {
    const out = materialize(count(50), 50);
    expect(out).toHaveLength(50);
    expect(isTruncated(out)).toBe(false);
    expect(out.some((s) => s.message.includes("limit"))).toBe(false);
  });

  it("výchozí limit MAX_STEPS: přesně MAX_STEPS kroků projde, o jeden víc se ořízne", () => {
    expect(isTruncated(materialize(count(MAX_STEPS)))).toBe(false);
    const cut = materialize(count(MAX_STEPS + 1));
    expect(cut).toHaveLength(MAX_STEPS + 1);
    expect(isTruncated(cut)).toBe(true);
  });

  it("delší běh se ořízne: poslední krok nese příznak truncated a hlášku, generátor se ukončí", () => {
    let finished = false;
    function* endless(): StepGen<number> {
      try {
        for (let i = 0; ; i++) yield snap(i, 3, "x");
      } finally {
        finished = true; // gen.return() spustí finally
      }
    }
    const out = materialize(endless(), 10);
    expect(out).toHaveLength(11);
    expect(out[10].truncated).toBe(true);
    expect(out[10].message).toMatch(/limit 10 kroků/);
    expect(out[10].state).toBe(9); // stav posledního skutečného kroku
    expect(isTruncated(out)).toBe(true);
    expect(finished).toBe(true);
  });

  it("isTruncated na prázdném a běžném běhu vrací false", () => {
    expect(isTruncated([])).toBe(false);
    expect(isTruncated(materialize(count(3)))).toBe(false);
  });
});

describe("parseNumbers (zpětně kompatibilní: i desetinná čísla)", () => {
  it("nepřijímá 0x10, 0b11, 0o7, 1e9 ani 1_000", () => {
    expect(parseNumbers("0x10 0b11 0o7 1e9 1_000")).toEqual([]);
  });
  it("typografické minus z PDF znamená záporné číslo; −0 se vrací jako 0", () => {
    expect(parseNumbers("5 −3 2")).toEqual([5, -3, 2]);
    expect(Object.is(parseNumbers("-0")[0], -0)).toBe(false);
  });
  it("desetinná čísla s tečkou zůstávají (pro volající, kteří je chtějí), čárka je oddělovač", () => {
    expect(parseNumbers("1.5 -2.25 .5")).toEqual([1.5, -2.25, 0.5]);
    expect(parseNumbers("3,5")).toEqual([3, 5]);
  });
});

describe("rng a randomArray", () => {
  it("je deterministický pro stejné semínko", () => {
    const a = rng(42);
    const b = rng(42);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });
  it("semínka 0 a 1 dávají různé posloupnosti (nulový stav xorshiftu se nahrazuje konstantou)", () => {
    expect(Array.from({ length: 8 }, rng(0))).not.toEqual(
      Array.from({ length: 8 }, rng(1)),
    );
    expect(Array.from({ length: 8 }, rng(0)).every((v) => v === 0)).toBe(false);
  });
  it("hodnoty leží v intervalu [0, 1)", () => {
    const r = rng(7);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("randomArray dává n celých čísel z 1..max", () => {
    const a = randomArray(40, 9, 123);
    expect(a).toHaveLength(40);
    expect(a.every((v) => Number.isInteger(v) && v >= 1 && v <= 9)).toBe(true);
  });
});
