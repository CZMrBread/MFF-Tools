import { describe, expect, it } from "vitest";
import {
  describeRange,
  listStatus,
  parseIntList,
  parseIntStrict,
  parseNumberList,
  sameNumbers,
} from "./input";
import { presetArray, type PresetKind } from "./presets";
import { rng } from "./steps";

describe("parseIntList", () => {
  it("vrací použitá čísla, ignorované tokeny i příznak oříznutí", () => {
    const r = parseIntList("3 1 x 7.5, 4; 0x10", {
      min: 1,
      max: 9,
      maxCount: 2,
    });
    expect(r.values).toEqual([3, 1]);
    expect(r.ignored).toEqual(["x", "7.5", "0x10"]);
    expect(r.valid).toBe(3);
    expect(r.truncated).toBe(true);
  });
  it("čísla mimo rozsah se neztratí potichu – jsou v ignored", () => {
    expect(parseIntList("0 5 10 99 100", { min: 1, max: 99 })).toMatchObject({
      values: [5, 10, 99],
      ignored: ["0", "100"],
    });
  });
  it("záporná čísla a typografické minus", () => {
    expect(parseIntList("-5 −3 +2").values).toEqual([-5, -3, 2]);
  });
  it("odmítá 1e9, 1_000, 12abc a čísla mimo bezpečný rozsah", () => {
    expect(parseIntList("1e9 1_000 12abc 99999999999999999999").values).toEqual(
      [],
    );
  });
  it("prázdný vstup = prázdný výsledek bez ignorovaných", () => {
    expect(parseIntList("  , ; ")).toEqual({
      values: [],
      ignored: [],
      valid: 0,
      truncated: false,
    });
  });
  it("náhodné vstupy: hodnoty v rozsahu, nejvýše maxCount, žádný token se neztratí", () => {
    const r = rng(2026);
    for (let t = 0; t < 40; t++) {
      const tokens = Array.from({ length: 1 + Math.floor(r() * 30) }, () => {
        const k = r();
        if (k < 0.1) return "ab";
        if (k < 0.2) return (r() * 10).toFixed(1);
        return String(Math.floor(r() * 300) - 100);
      });
      const res = parseIntList(tokens.join(r() < 0.5 ? " " : ", "), {
        min: -50,
        max: 150,
        maxCount: 10,
      });
      expect(res.values.length).toBeLessThanOrEqual(10);
      expect(
        res.values.every((v) => Number.isInteger(v) && v >= -50 && v <= 150),
      ).toBe(true);
      expect(res.valid + res.ignored.length).toBe(tokens.length);
      expect(res.truncated).toBe(res.valid > 10);
    }
  });
});

describe("zápis s přiřazením (ActionMenu: „A = 5, 3, 9“, „v = 7“)", () => {
  it("seznam smí začínat jménem a rovnítkem", () => {
    expect(parseIntList("A = 5, 3, 9").values).toEqual([5, 3, 9]);
    expect(parseIntList("A=5 3").ignored).toEqual([]);
    expect(parseIntList("  σ = 1 2 1").values).toEqual([1, 2, 1]);
  });
  it("jen na začátku; jinde je rovnítko chybný token", () => {
    expect(parseIntList("5 = 3").ignored).toEqual(["="]);
    expect(parseIntList("1 A = 2").ignored).toEqual(["A", "="]);
  });
  it("jedno číslo s přiřazením (IntField i pole akce)", () => {
    expect(parseIntStrict("v = 7").value).toBe(7);
    expect(parseIntStrict("x=−3").value).toBe(-3);
    expect(parseIntStrict("x =").empty).toBe(true);
    expect(parseIntStrict("= 3").value).toBeNull();
  });
});

describe("parseNumberList (integerOnly: false)", () => {
  it("připouští desetinná čísla s tečkou", () => {
    expect(parseNumberList("1.5 2", { integerOnly: false }).values).toEqual([
      1.5, 2,
    ]);
  });
});

describe("parseIntStrict (IntField)", () => {
  it("prázdné pole a samotné „-“ jsou jen neplatná hodnota", () => {
    expect(parseIntStrict("")).toEqual({ value: null, empty: true });
    expect(parseIntStrict("-")).toEqual({ value: null, empty: false });
  });
  it("celé číslo v rozsahu projde, ostatní ne", () => {
    expect(parseIntStrict(" 42 ", { min: 0, max: 99 }).value).toBe(42);
    expect(parseIntStrict("−7").value).toBe(-7);
    expect(parseIntStrict("1.5").value).toBeNull();
    expect(parseIntStrict("100", { max: 99 }).value).toBeNull();
    expect(parseIntStrict("0x10").value).toBeNull();
  });
});

describe("hlášky", () => {
  it("describeRange", () => {
    expect(describeRange({ min: 1, max: 99 })).toBe("celé číslo od 1 do 99");
    expect(describeRange({ min: -5, max: 5 }, true)).toBe(
      "celá čísla od −5 do 5",
    );
    expect(describeRange({ min: 0 })).toBe("celé číslo ≥ 0");
  });
  it("describeRange: desetinné meze s českou čárkou (E3)", () => {
    expect(describeRange({ min: -0.5, max: 2.5, integerOnly: false })).toBe(
      "číslo od −0,5 do 2,5",
    );
    expect(describeRange({ max: 0.75, integerOnly: false }, true)).toBe(
      "čísla ≤ 0,75",
    );
  });
  it("listStatus: oříznutí i ignorované tokeny v jedné větě", () => {
    const opts = { min: 1, max: 99, maxCount: 31 };
    const text =
      Array.from({ length: 40 }, (_, i) => i + 1).join(" ") + " a 7.5";
    expect(listStatus(parseIntList(text, opts), opts)).toBe(
      "Použito prvních 31 z 40 čísel; ignorováno: a, 7.5 (povolena jsou celá čísla od 1 do 99).",
    );
  });
  it("listStatus: všechno použito → null; nic platného → výzva", () => {
    expect(listStatus(parseIntList("1 2 3"))).toBeNull();
    expect(
      listStatus(parseIntList("x", { min: 1, max: 9 }), { min: 1, max: 9 }),
    ).toMatch(/^Zadejte aspoň jedno celé číslo od 1 do 9/);
  });
  it("sameNumbers", () => {
    expect(sameNumbers([1, 2], [1, 2])).toBe(true);
    expect(sameNumbers([1, 2], [2, 1])).toBe(false);
    expect(sameNumbers([1], [1, 1])).toBe(false);
  });
});

describe("presetArray (předvolby NumberInput)", () => {
  const kinds: PresetKind[] = [
    "random",
    "sorted",
    "reversed",
    "nearly",
    "dupes",
  ];
  it("všechny předvolby respektují rozsah a délku (i malý rozsah jako u Counting sortu 1..9)", () => {
    const cases: [number, number, number][] = [
      [12, 1, 9],
      [40, 1, 99],
      [5, 1, 3],
      [1, 1, 1],
    ];
    for (const kind of kinds)
      for (const [n, lo, hi] of cases) {
        const a = presetArray(kind, n, lo, hi, 7);
        expect(a).toHaveLength(n);
        expect(a.every((v) => Number.isInteger(v) && v >= lo && v <= hi)).toBe(
          true,
        );
      }
  });
  it("„Setříděné“ je neklesající, „Sestupné“ nerostoucí – i když je rozsah menší než n", () => {
    const asc = presetArray("sorted", 20, 1, 9, 1);
    const desc = presetArray("reversed", 20, 1, 9, 1);
    expect(asc.every((v, i) => i === 0 || asc[i - 1] <= v)).toBe(true);
    expect(desc.every((v, i) => i === 0 || desc[i - 1] >= v)).toBe(true);
  });
  it("stejné semínko → stejný výsledek", () => {
    expect(presetArray("random", 10, 1, 99, 5)).toEqual(
      presetArray("random", 10, 1, 99, 5),
    );
  });
});
