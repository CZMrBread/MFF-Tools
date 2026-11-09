import { describe, expect, it } from "vitest";
import {
  formatMinus,
  formatNum,
  formatNumPoint,
  formatTerm,
  parseMath,
  splitComment,
} from "./format";

const sub = (...children: unknown[]) => ({ kind: "sub", children });
const sup = (...children: unknown[]) => ({ kind: "sup", children });

describe("parseMath", () => {
  it("jednoduché indexy a mocniny", () => {
    expect(parseMath("x_i")).toEqual(["x", sub("i")]);
    expect(parseMath("2^k")).toEqual(["2", sup("k")]);
    expect(parseMath("2^10 + 1")).toEqual(["2", sup("10"), " + 1"]);
  });
  it("složené závorky i vnořené indexy", () => {
    expect(parseMath("R_{2k}")).toEqual(["R", sub("2k")]);
    expect(parseMath("p_{x_i} ← p_{x_i} + 1")).toEqual([
      "p",
      sub("x", sub("i")),
      " ← p",
      sub("x", sub("i")),
      " + 1",
    ]);
    expect(parseMath("e^{−kn/m}")).toEqual(["e", sup("−kn/m")]);
  });
  it("bez závorek bere celé slovo (s_syn, F_LRU), závorka slovo ukončí (klíč_i(v))", () => {
    expect(parseMath("s_syn > α · s_u")).toEqual([
      "s",
      sub("syn"),
      " > α · s",
      sub("u"),
    ]);
    expect(parseMath("F_LRU")).toEqual(["F", sub("LRU")]);
    expect(parseMath("klíč_i(v)")).toEqual(["klíč", sub("i"), "(v)"]);
    expect(parseMath("p_i-krát")).toEqual(["p", sub("i"), "-krát"]);
  });
  it("podtržítko či stříška bez základu nebo argumentu zůstanou textem", () => {
    expect(parseMath("a ^ b")).toEqual(["a ^ b"]);
    expect(parseMath("_x")).toEqual(["_x"]);
    expect(parseMath("x_")).toEqual(["x_"]);
    expect(parseMath("x_{")).toEqual(["x_{"]);
    expect(parseMath("x_{}")).toEqual(["x_{}"]);
  });
  it("text bez zápisu zůstane jedním řetězcem", () => {
    expect(parseMath("Insert(5)")).toEqual(["Insert(5)"]);
    expect(parseMath("")).toEqual([]);
  });
});

describe("splitComment", () => {
  it("oddělí komentář za // (na začátku nebo za mezerou)", () => {
    expect(splitComment("bit_i ← 1   // cena 1")).toEqual({
      code: "bit_i ← 1   ",
      comment: "// cena 1",
    });
    expect(splitComment("// celý řádek")).toEqual({
      code: "",
      comment: "// celý řádek",
    });
  });
  it("// uvnitř slova (URL) komentář není", () => {
    expect(splitComment("viz http://x")).toEqual({
      code: "viz http://x",
      comment: "",
    });
    expect(splitComment("a ← b")).toEqual({ code: "a ← b", comment: "" });
  });
});

describe("formatNum (česká desetinná čárka)", () => {
  it("desetinná čárka místo tečky", () => {
    expect(formatNum(0.7)).toBe("0,7");
    expect(formatNum(3.14159, 2)).toBe("3,14");
    expect(formatNum(-1.5)).toBe("-1,5");
  });
  it("celá čísla beze změny, digits doplní nuly jako toFixed", () => {
    expect(formatNum(42)).toBe("42");
    expect(formatNum(42, 1)).toBe("42,0");
    expect(formatNum(1234567)).toBe("1234567");
  });
  it("digits = 0 zaokrouhlí", () => {
    expect(formatNum(2.6, 0)).toBe("3");
  });
  it("záporná nula se nezobrazí jako -0", () => {
    expect(formatNum(-0)).toBe("0");
    expect(formatNum(-0.001, 1)).toBe("0,0");
    expect(formatNum(-0.04, 1)).toBe("0,0");
  });
  it("nekonečno jako ∞, NaN jako –", () => {
    expect(formatNum(Infinity)).toBe("∞");
    expect(formatNum(-Infinity)).toBe("−∞");
    expect(formatNum(NaN)).toBe("–");
  });
  it("formatNumPoint ponechá tečku (FFT)", () => {
    expect(formatNumPoint(0.7)).toBe("0.7");
    expect(formatNumPoint(3.14159, 2)).toBe("3.14");
    expect(formatNumPoint(-0.001, 1)).toBe("0.0");
    expect(formatNum(0.5, 1, { point: true })).toBe("0.5");
  });
});

describe("formatMinus a formatTerm (typografické minus, záporný sčítanec v závorce)", () => {
  it("formatMinus: −2, −1,5; kladná a nula beze změny", () => {
    expect(formatMinus(-2)).toBe("−2");
    expect(formatMinus(-1.5)).toBe("−1,5");
    expect(formatMinus(3)).toBe("3");
    expect(formatMinus(-0)).toBe("0");
  });
  it("formatTerm: záporné číslo za + nebo · do závorky – „2 + (−3)“ (UX-11)", () => {
    expect(`2 + ${formatTerm(-3)}`).toBe("2 + (−3)");
    expect(formatTerm(4)).toBe("4");
    expect(formatTerm(-0.5)).toBe("(−0,5)");
  });
});
