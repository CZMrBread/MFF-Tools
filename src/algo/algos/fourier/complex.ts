/**
 * Komplexní čísla pro FFT (Průvodce 17.2 „Intermezzo o komplexních číslech“, str. 427–429) – čisté funkce
 * bez Reactu. Hodnoty jsou prosté objekty {re, im}, takže je `snap` (structuredClone) kopíruje bez potíží.
 * Testy: complex.test.ts.
 */

export interface C {
  re: number;
  im: number;
}

/** komplexní číslo; „+ 0“ mění −0 na 0 (ve výpisu ani v porovnání se „−0“ neobjeví) */
export const c = (re: number, im = 0): C => ({ re: re + 0, im: im + 0 });
export const cAdd = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
export const cSub = (a: C, b: C): C => c(a.re - b.re, a.im - b.im);
export const cMul = (a: C, b: C): C =>
  c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const cConj = (a: C): C => c(a.re, -a.im);
export const cAbs = (a: C): number => Math.hypot(a.re, a.im);
export const cScale = (a: C, k: number): C => c(a.re * k, a.im * k);

/** a^k pro celé k ≥ 0 (opakovaným násobením – stačí pro malá k v testech a ukázkách) */
export function cPow(a: C, k: number): C {
  let r = c(1);
  for (let i = 0; i < k; i++) r = cMul(r, a);
  return r;
}

/** Shoda s tolerancí po složkách. */
export const cClose = (a: C, b: C, eps = 1e-9): boolean =>
  Math.abs(a.re - b.re) <= eps && Math.abs(a.im - b.im) <= eps;

/**
 * k-tá mocnina ω_n = e^{2πi/n}, tj. e^{2πik/n}. Násobky čtvrtiny kruhu vrací přesně (1, i, −1, −i), jinak
 * z cos/sin – kniha ř. 7 „mocninu ω^j průběžně přepočítáváme“, ale násobení by kumulovalo chybu, proto
 * se mocnina počítá přímo (stejně jako tabulka ω^0 … ω^{n−1} v FFT2, str. 439).
 */
export function root(n: number, k: number): C {
  const m = ((k % n) + n) % n;
  if ((4 * m) % n === 0) {
    const q = (4 * m) / n;
    return [c(1, 0), c(0, 1), c(-1, 0), c(0, -1)][q];
  }
  const a = (2 * Math.PI * m) / n;
  return c(Math.cos(a), Math.sin(a));
}

const MINUS = "−";

/** Číslo zaokrouhlené na `digits` desetinných míst, bez koncových nul a bez „−0“; unicode minus. */
function fmtReal(x: number, digits: number): string {
  const s = x.toFixed(digits).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s.replace("-", MINUS);
}

/**
 * Komplexní číslo na `digits` desetinných míst (vlastník: 2): „−4−9.66i“, „i“, „−i“, „4i“, „28“.
 * Složka, která se zaokrouhlí na nulu, se vynechá (žádné „+0i“ ani „−0“).
 */
export function fmtComplex(z: C, digits = 2): string {
  const eps = 0.5 * 10 ** -digits;
  const re = Math.abs(z.re) < eps ? 0 : z.re;
  const im = Math.abs(z.im) < eps ? 0 : z.im;
  if (im === 0) return fmtReal(re, digits);
  const imAbs = fmtReal(Math.abs(im), digits);
  const imPart = (imAbs === "1" ? "" : imAbs) + "i";
  if (re === 0) return (im < 0 ? MINUS : "") + imPart;
  return fmtReal(re, digits) + (im < 0 ? MINUS : "+") + imPart;
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** 10 → „₁₀“ (indexy v textu hlášek, které se nesázejí přes fmtMath) */
export const subDigits = (n: number): string =>
  String(n).replace(/\d/g, (d) => SUB[Number(d)]);

/** 16 → „¹⁶“, −1 → „⁻¹“ */
export const supDigits = (n: number): string =>
  String(n)
    .replace("-", "⁻")
    .replace(/\d/g, (d) => SUP[Number(d)]);
