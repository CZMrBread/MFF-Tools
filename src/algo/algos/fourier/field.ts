/**
 * Tělesa, nad kterými FFT počítá: ℂ (ω = e^{2πi/n}) a ℤ₁₇ (Průvodce 17.5 „FFT v konečných tělesech“,
 * str. 439–440). Hodnoty ℤ₁₇ jsou také {re, im} s im = 0 a re ∈ {0, …, 16} – jeden typ pro celý modul.
 *
 * ℤ₁₇: p = 2⁴ + 1, takže 2⁴ = −1 a 2 je primitivní 8. odmocnina z jedné (kniha: „Číslo 2 je tedy
 * primitivní 2k-tá odmocnina z jedné“). Pro n = 4 a 2 se bere ω = 2² = 4 a 2⁴ = 16. Pro n = 16 je potřeba
 * generátor grupy ℤ₁₇* (kniha str. 439: všech p − 1 nenulových prvků jsou mocniny generátoru g) – g = 3.
 * Testy: field.test.ts.
 */
import {
  c,
  cAdd,
  cConj,
  cMul,
  cScale,
  cSub,
  fmtComplex,
  root,
  type C,
} from "./complex";

export type FieldId = "C" | "Z17";

export const P17 = 17;

/** nezáporný zbytek a mod p */
export const mod = (a: number, p = P17): number => ((a % p) + p) % p;

export function powMod(b: number, e: number, p = P17): number {
  let r = 1;
  let x = mod(b, p);
  let k = e;
  while (k > 0) {
    if (k & 1) r = (r * x) % p;
    x = (x * x) % p;
    k >>= 1;
  }
  return r;
}

/** inverze v ℤ_p (p prvočíslo): a^{p−2} */
export const invMod = (a: number, p = P17): number => powMod(a, p - 2, p);

/** primitivní n-tá odmocnina z jedné v ℤ₁₇ pro n | 16 */
export function z17Omega(n: number): number {
  if (n === 16) return 3;
  if (8 % n !== 0) throw new Error(`ℤ₁₇ nemá primitivní ${n}. odmocninu`);
  return powMod(2, 8 / n);
}

export interface Field {
  id: FieldId;
  /** krátký název do textu („ℂ“, „ℤ₁₇“) */
  name: string;
  add: (a: C, b: C) => C;
  sub: (a: C, b: C) => C;
  mul: (a: C, b: C) => C;
  /** ω_n^k; `inverse` = ω̄^k (ℂ), resp. ω^{−k} (ℤ₁₇) – odmocnina pro inverzní transformaci */
  omega: (n: number, k: number, inverse: boolean) => C;
  /** a / n (dělení velikostí v inverzní transformaci) */
  divN: (a: C, n: number) => C;
  /** celé číslo ze vstupu jako prvek tělesa (ℤ₁₇: zbytek) */
  from: (x: number) => C;
  fmt: (a: C) => string;
  /** symbol odmocniny: „ω“, inverzní „ω̄“ (ℂ) / „ω⁻¹“ (ℤ₁₇) */
  sym: (inverse: boolean) => string;
}

const COMPLEX: Field = {
  id: "C",
  name: "ℂ",
  add: cAdd,
  sub: cSub,
  mul: cMul,
  omega: (n, k, inverse) => (inverse ? cConj(root(n, k)) : root(n, k)),
  divN: (a, n) => cScale(a, 1 / n),
  from: (x) => c(x),
  fmt: (a) => fmtComplex(a),
  sym: (inverse) => (inverse ? "ω̄" : "ω"),
};

const Z17: Field = {
  id: "Z17",
  name: "ℤ₁₇",
  add: (a, b) => c(mod(a.re + b.re)),
  sub: (a, b) => c(mod(a.re - b.re)),
  mul: (a, b) => c(mod(a.re * b.re)),
  omega: (n, k, inverse) => {
    const w = z17Omega(n);
    return c(powMod(inverse ? invMod(w) : w, mod(k, n)));
  },
  divN: (a, n) => c(mod(a.re * invMod(n))),
  from: (x) => c(mod(Math.round(x))),
  fmt: (a) => String(a.re),
  sym: (inverse) => (inverse ? "ω⁻¹" : "ω"),
};

export const FIELDS: Record<FieldId, Field> = { C: COMPLEX, Z17 };

/**
 * Upozornění pro formulář: které hodnoty mimo 0–16 se v ℤ₁₇ zredukují a na co („20 → 3“); null = žádné.
 * Ukáže nejvýš 6 dvojic.
 */
export function z17Notice(values: readonly number[]): string | null {
  const out = values.filter((v) => v !== mod(v));
  if (!out.length) return null;
  const show = (v: number) => String(v).replace("-", "−");
  const pairs = out.slice(0, 6).map((v) => `${show(v)} → ${mod(v)}`);
  return `V ℤ₁₇ se počítá mod 17: ${pairs.join(", ")}${out.length > 6 ? ", …" : "."}`;
}
