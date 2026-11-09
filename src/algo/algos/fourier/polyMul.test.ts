// Násobení polynomů přes FFT (Průvodce 17.1 Algoritmus NásobeníPolynomů str. 425, věta str. 432,
// cvičení 17.5.2 str. 440 – násobení čísel; ℤ₁₇ podle 17.5 str. 439).
import { describe, expect, it } from "vitest";
import { parseMath } from "../../core/format";
import { materialize, MAX_STEPS } from "../../core/steps";
import { c, cClose, type C } from "./complex";
import { codeFor } from "./fft";
import {
  carryDigits,
  mulPoly,
  mulSize,
  mulSteps,
  naiveMul,
  PC_MUL,
} from "./polyMul";

function expectVec(got: readonly (C | null)[] | null, want: readonly C[]) {
  expect(got).not.toBeNull();
  expect(got!.length).toBe(want.length);
  got!.forEach((z, i) =>
    expect(cClose(z!, want[i], 1e-3), `[${i}] ${JSON.stringify(z)}`).toBe(true),
  );
}

describe("velikost transformace (str. 432: mocnina dvojky a aspoň 2n)", () => {
  it.each([
    [3, 3, 8],
    [2, 2, 4],
    [1, 1, 4],
    [3, 2, 8],
    [8, 8, 16],
    [5, 1, 16],
  ])("|P| = %i, |Q| = %i → N = %i", (a, b, n) => {
    expect(mulSize(a, b)).toBe(n);
  });
  it("víc než 8 koeficientů se odmítne (N by přesáhlo 16)", () => {
    expect(() => mulSize(9, 1)).toThrow();
  });
});

describe("mulPoly – ℂ", () => {
  it("(1, 2, 3) · (4, 5, 6) = (4, 13, 28, 27, 18) a mezivýsledky P̂, Q̂, R̂ z fft.md §3", () => {
    const r = mulPoly([1, 2, 3], [4, 5, 6], "C");
    expect(r.N).toBe(8);
    expect(r.rounded).toEqual([4, 13, 28, 27, 18]);
    expectVec(r.Phat, [
      c(6),
      c(2.414, 4.414),
      c(-2, 2),
      c(-0.414, -1.586),
      c(2),
      c(-0.414, 1.586),
      c(-2, -2),
      c(2.414, -4.414),
    ]);
    expectVec(r.Qhat.slice(0, 3), [c(15), c(7.536, 9.536), c(-2, 5)]);
    expectVec(r.Rhat.slice(0, 3), [c(90), c(-23.899, 56.284), c(-6, -14)]);
    expect(r.maxErr).toBeLessThan(1e-9);
  });

  it.each([
    [[1, 1], [1, 1], [1, 2, 1], 4],
    [[1, 2], [3, 4], [3, 10, 8], 4],
    [[3, 2, 1], [6, 5, 4], [18, 27, 28, 13, 4], 8],
  ])("%j · %j = %j (N = %i)", (p, q, want, n) => {
    const r = mulPoly(p, q, "C");
    expect(r.N).toBe(n);
    expect(r.rounded).toEqual(want);
  });

  it("123 × 456 = 56088: číslice od nejnižšího řádu, R(10) s přenosy (cvičení 17.5.2)", () => {
    const r = mulPoly([3, 2, 1], [6, 5, 4], "C");
    expect(r.rounded).toEqual([18, 27, 28, 13, 4]);
    expect(carryDigits(r.rounded, 10)).toEqual({
      digits: [8, 8, 0, 6, 5],
      value: 56088,
    });
  });

  it("shoda s přímým Θ(n²) součinem pro náhodné polynomy (i záporné koeficienty)", () => {
    let s = 11;
    const rnd = () => ((s = (s * 48271) % 2147483647) % 19) - 9;
    for (let t = 0; t < 40; t++) {
      const p = Array.from({ length: 1 + (t % 8) }, rnd);
      const q = Array.from({ length: 1 + ((t * 3) % 8) }, rnd);
      expect(mulPoly(p, q, "C").rounded).toEqual(naiveMul(p, q));
    }
  });
});

describe("mulPoly – ℤ₁₇ (17.5, str. 439)", () => {
  it("(1, 2, 3) · (4, 5, 6): P̂, Q̂, R̂ a R = (4, 13, 11, 10, 1) – 28 a 27 se přetočí", () => {
    const r = mulPoly([1, 2, 3], [4, 5, 6], "Z17");
    expect(r.Phat.map((z) => z.re)).toEqual([6, 0, 6, 5, 2, 9, 7, 7]);
    expect(r.Qhat.map((z) => z.re)).toEqual([15, 4, 1, 3, 5, 1, 12, 8]);
    expect(r.Rhat.map((z) => z.re)).toEqual([5, 0, 6, 15, 10, 9, 16, 5]);
    expect(r.rounded).toEqual([4, 13, 11, 10, 1]);
    expect(r.wrapped).toBe(true);
  });
  it("malé koeficienty se nepřetočí: (1, 1) · (1, 1) = (1, 2, 1)", () => {
    const r = mulPoly([1, 1], [1, 1], "Z17");
    expect(r.rounded).toEqual([1, 2, 1]);
    expect(r.wrapped).toBe(false);
  });
});

describe("kroky NásobeníPolynomů", () => {
  it("jen kroky algoritmu: řádky 0, 1, 2, 3, 3, 4 × N, 5, 5 a nejvýš 15 kroků pro N = 8", () => {
    const steps = materialize(mulSteps([1, 2, 3], [4, 5, 6], "C", "alg"));
    expect(steps.every((s) => s.state.code === "mul")).toBe(true);
    expect(steps.map((s) => s.line)).toEqual([
      0, 1, 2, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5,
    ]);
    const end = steps[steps.length - 1].state.mul!;
    expect(end.stage).toBe("done");
    expect(end.rounded).toEqual([4, 13, 28, 27, 18]);
  });

  it("s kroky FFT: vnořené FFT(P), FFT(Q) a inverzní FFT přepnou pseudokód; méně než MAX_STEPS", () => {
    const steps = materialize(mulSteps([1, 2, 3], [4, 5, 6], "C", "bf"));
    expect(steps.length).toBeLessThan(MAX_STEPS);
    // pevný počet kroků – změnu je potřeba vědomě schválit
    expect(steps.length).toBe(226);
    const codes = steps.map((s) => s.state.code);
    expect(codes).toContain("fft");
    expect(codes).toContain("ifft");
    expect(steps[0].state.code).toBe("mul");
    expect(steps[steps.length - 1].state.code).toBe("mul");
    for (const s of steps) {
      expect(s.line!).toBeLessThan(codeFor(s.state).length);
      expect(s.state.mul).not.toBeNull();
    }
    expect(steps[steps.length - 1].state.mul!.rounded).toEqual([
      4, 13, 28, 27, 18,
    ]);
  });

  it("bodový součin (ř. 4) zapíše R̂_i = P̂_i · Q̂_i po jednom sloupci", () => {
    const steps = materialize(mulSteps([1, 1], [1, 1], "C", "alg"));
    const pw = steps.filter((s) => s.line === 4);
    expect(pw.map((s) => s.state.mul!.col)).toEqual([0, 1, 2, 3]);
    expectVec(pw[3].state.mul!.Rhat, [c(4), c(0, 2), c(0), c(0, -2)]);
  });

  it("násobení čísel: poslední zpráva uvede R(10) = 56088", () => {
    const steps = materialize(
      mulSteps([3, 2, 1], [6, 5, 4], "C", "alg", { a: 123, b: 456 }),
    );
    expect(steps[steps.length - 1].message).toContain("56088");
    expect(steps[steps.length - 1].message).toContain("123 × 456");
  });

  it("ℤ₁₇ s přetočením ohlásí, že koeficienty součinu musí být menší než 17", () => {
    const steps = materialize(mulSteps([1, 2, 3], [4, 5, 6], "Z17", "alg"));
    expect(steps[steps.length - 1].message).toMatch(/17/);
    expect(steps[steps.length - 1].state.mul!.wrapped).toBe(true);
  });

  it("pseudokód NásobeníPolynomů bez knižních čísel a s vysázenými indexy", () => {
    for (const line of PC_MUL) {
      expect(line).not.toMatch(/^\s*\d+\./);
      const flat = parseMath(line)
        .filter((n) => typeof n === "string")
        .join("");
      expect(flat).not.toMatch(/[\p{L}\p{N})][\^_]/u);
    }
  });
});
