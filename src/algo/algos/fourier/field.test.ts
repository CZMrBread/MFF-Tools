// Tělesa pro FFT: ℂ a ℤ₁₇ (Průvodce 17.5 „FFT v konečných tělesech“, str. 439–440).
import { describe, expect, it } from "vitest";
import { c, cClose } from "./complex";
import { FIELDS, invMod, mod, powMod, z17Notice, z17Omega } from "./field";

describe("ℤ₁₇ – aritmetika modulo 17", () => {
  it("mod dává nezáporný zbytek, mocnina, inverze", () => {
    expect(mod(-1, 17)).toBe(16);
    expect(mod(28, 17)).toBe(11);
    expect(powMod(2, 4, 17)).toBe(16); // 2^4 = 16 = −1 (p = 2^4 + 1, str. 439)
    expect(powMod(2, 8, 17)).toBe(1);
    expect(invMod(8, 17)).toBe(15); // 8⁻¹ = 15
    expect(invMod(2, 17)).toBe(9); // ω⁻¹ = 9
  });

  it("2 je primitivní 8. odmocnina z jedné: mocniny 1, 2, 4, 8, 16, 15, 13, 9 (str. 439)", () => {
    const pw = Array.from({ length: 8 }, (_, k) => powMod(2, k, 17));
    expect(pw).toEqual([1, 2, 4, 8, 16, 15, 13, 9]);
    expect(new Set(pw).size).toBe(8);
  });

  it("ω pro n = 2, 4, 8, 16: 16, 4, 2 a generátor 3 (všechny primitivní)", () => {
    expect(z17Omega(2)).toBe(16);
    expect(z17Omega(4)).toBe(4);
    expect(z17Omega(8)).toBe(2);
    expect(z17Omega(16)).toBe(3);
    for (const n of [2, 4, 8, 16]) {
      const w = z17Omega(n);
      expect(powMod(w, n, 17)).toBe(1);
      for (let k = 1; k < n; k++) expect(powMod(w, k, 17)).not.toBe(1);
    }
  });
});

describe("FIELDS – společné rozhraní pro FFT", () => {
  it("ℂ: ω_n^k a ω̄_n^k = sdružené (str. 429, 432)", () => {
    const C = FIELDS.C;
    expect(C.omega(8, 2, false)).toEqual(c(0, 1));
    expect(C.omega(8, 2, true)).toEqual(c(0, -1));
    expect(cClose(C.divN(c(8, 4), 8), c(1, 0.5))).toBe(true);
    expect(C.from(-3)).toEqual(c(-3));
  });

  it("ℤ₁₇: ω_8^k = 2^k, inverzní ω⁻¹ = 9, dělení n = násobení n⁻¹", () => {
    const Z = FIELDS.Z17;
    expect(Z.omega(8, 3, false)).toEqual(c(8));
    expect(Z.omega(8, 1, true)).toEqual(c(9));
    expect(Z.divN(c(5), 8)).toEqual(c(mod(5 * 15, 17)));
    expect(Z.from(-1)).toEqual(c(16));
    expect(Z.mul(c(13), c(9))).toEqual(c(15));
    expect(Z.fmt(c(11))).toBe("11");
  });

  it("symbol odmocniny v textu: ω, ω̄ (ℂ), ω⁻¹ (ℤ₁₇)", () => {
    expect(FIELDS.C.sym(false)).toBe("ω");
    expect(FIELDS.C.sym(true)).toBe("ω̄");
    expect(FIELDS.Z17.sym(true)).toBe("ω⁻¹");
  });
});

describe("upozornění na hodnoty mimo ℤ₁₇", () => {
  it("vypíše, na co se hodnoty zredukují; v rozsahu 0–16 nic", () => {
    expect(z17Notice([20, 30, 40, 50])).toBe(
      "V ℤ₁₇ se počítá mod 17: 20 → 3, 30 → 13, 40 → 6, 50 → 16.",
    );
    expect(z17Notice([1, 2, -1])).toBe("V ℤ₁₇ se počítá mod 17: −1 → 16.");
    expect(z17Notice([0, 16, 5])).toBeNull();
    expect(z17Notice([17, 18, 19, 20, 21, 22, 23, 24])).toBe(
      "V ℤ₁₇ se počítá mod 17: 17 → 0, 18 → 1, 19 → 2, 20 → 3, 21 → 4, 22 → 5, …",
    );
  });
});
