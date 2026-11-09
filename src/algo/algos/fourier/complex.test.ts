// Komplexní aritmetika a formát čísel pro FFT (Průvodce 17.2, str. 427–429).
import { describe, expect, it } from "vitest";
import {
  c,
  cAbs,
  cAdd,
  cClose,
  cConj,
  cMul,
  cPow,
  cSub,
  fmtComplex,
  root,
  subDigits,
  supDigits,
} from "./complex";

describe("komplexní čísla", () => {
  it("sčítání, odčítání, násobení, sdružení; i · i = −1; |3 + 4i| = 5", () => {
    expect(cAdd(c(1, 2), c(3, -1))).toEqual(c(4, 1));
    expect(cSub(c(1, 2), c(3, -1))).toEqual(c(-2, 3));
    expect(cMul(c(1, 2), c(3, 4))).toEqual(c(-5, 10));
    expect(cConj(c(2, 5))).toEqual(c(2, -5));
    expect(cClose(cMul(c(0, 1), c(0, 1)), c(-1))).toBe(true);
    expect(cAbs(c(3, 4))).toBe(5);
  });

  it("odmocniny z jedničky: ω₈ ≈ 0.7071 + 0.7071i, ω₈² = i, ω₈⁴ = −1 (str. 429)", () => {
    expect(cClose(root(8, 1), c(Math.SQRT1_2, Math.SQRT1_2))).toBe(true);
    expect(root(8, 2)).toEqual(c(0, 1)); // přesně, ne 6e-17 + 1i
    expect(root(8, 4)).toEqual(c(-1, 0));
    expect(root(4, 3)).toEqual(c(0, -1));
    expect(root(8, 8)).toEqual(c(1, 0));
  });

  it("ω^{n/2 + j} = −ω^j pro n = 8 a j = 0…3 (str. 430: body jsou spárované)", () => {
    for (let j = 0; j < 4; j++) {
      const a = root(8, 4 + j);
      const b = root(8, j);
      expect(cClose(a, c(-b.re, -b.im))).toBe(true);
    }
  });

  it("primitivní odmocniny: i a −i jsou primitivní 4. odmocniny, 1 a −1 ne (příklad str. 429); ω² je primitivní (n/2)-tá", () => {
    const primitive = (x: ReturnType<typeof c>, n: number) =>
      cClose(cPow(x, n), c(1)) &&
      Array.from({ length: n - 1 }, (_, k) => k + 1).every(
        (k) => !cClose(cPow(x, k), c(1)),
      );
    expect(primitive(c(0, 1), 4)).toBe(true);
    expect(primitive(c(0, -1), 4)).toBe(true);
    expect(primitive(c(1), 4)).toBe(false);
    expect(primitive(c(-1), 4)).toBe(false);
    expect(primitive(cPow(root(8, 1), 2), 4)).toBe(true);
  });
});

describe("fmtComplex – 2 desetinná místa (rozhodnutí vlastníka)", () => {
  it.each([
    [c(Math.SQRT1_2, Math.SQRT1_2), "0.71+0.71i"],
    [c(-4, -4 * (1 + Math.SQRT2)), "−4−9.66i"],
    [c(1e-17, -0), "0"],
    [c(-0, 0), "0"],
    [c(0, 1), "i"],
    [c(0, -1), "−i"],
    [c(0, 4), "4i"],
    [c(28, 0), "28"],
    [c(-4, 4), "−4+4i"],
    [c(0.5, 0), "0.5"],
    [c(-0.004, 0.003), "0"],
    [c(2.999999999, -1e-12), "3"],
  ])("%o → %s", (z, s) => {
    expect(fmtComplex(z)).toBe(s);
  });
});

describe("indexy a mocniny v textu hlášek", () => {
  it("číslice na unicode index a mocninu", () => {
    expect(subDigits(10)).toBe("₁₀");
    expect(supDigits(16)).toBe("¹⁶");
    expect(supDigits(-1)).toBe("⁻¹");
  });
});
