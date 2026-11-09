/**
 * Pseudokódy modulu FFT – přepis z Průvodce (bez knižních čísel řádků: `Pseudocode` čísluje sám,
 * 2 mezery = jedna úroveň odsazení, `x_{…}` / `ω^{…}` se vysází, komentář za `//`).
 * - PC_FFT: Algoritmus FFT, str. 430 (doslova; ř. 0 = hlavička se vstupem).
 * - PC_IFFT: inverzní DFT podle str. 431–432 (Ω⁻¹ = (1/n) · Ω̄) – kniha nemá samostatný pseudokód,
 *   je to doplněk stránky podle textu knihy.
 * - PC_MUL: Algoritmus NásobeníPolynomů, str. 425 (ř. 1 doslova); komentáře „// FFT“ apod. jsou doplněk
 *   stránky (kniha v 17.1 body ještě nevolí).
 * Stav kroku vybírá, který pseudokód se ukazuje (`codeFor`) – při vnořené FFT se panel přepne.
 */
import type { FftState } from "./fft";

export const PC_FFT = [
  "Algoritmus FFT(n, ω, (p_0, …, p_{n−1}))   // n = 2ᵏ, ω je primitivní n-tá odmocnina z jedničky",
  "Pokud n = 1, položíme y_0 ← p_0 a skončíme.",
  "Jinak se rekurzivně zavoláme na sudou a lichou část koeficientů:",
  "  (s_0, …, s_{n/2−1}) ← FFT(n/2, ω^2, (p_0, p_2, p_4, …, p_{n−2})).",
  "  (ℓ_0, …, ℓ_{n/2−1}) ← FFT(n/2, ω^2, (p_1, p_3, p_5, …, p_{n−1})).",
  "Z grafů obou částí poskládáme graf celého polynomu:",
  "  Pro j = 0, …, n/2 − 1:",
  "    y_j ← s_j + ω^j · ℓ_j   // mocninu ωʲ průběžně přepočítáváme",
  "    y_{j+n/2} ← s_j − ω^j · ℓ_j",
  "Výstup: graf polynomu P, tedy vektor (y_0, …, y_{n−1}), kde y_j = P(ω^j)",
];

export const PC_IFFT = [
  "InverzníFFT(n, ω, (y_0, …, y_{n−1}))   // Ω⁻¹ = (1/n) · Ω̄ (str. 432)",
  "(z_0, …, z_{n−1}) ← FFT(n, ω̄, (y_0, …, y_{n−1}))   // ω̄ = ω⁻¹ je také primitivní",
  "Pro j = 0, …, n − 1: p_j ← z_j / n",
  "Výstup: koeficienty (p_0, …, p_{n−1})",
];

export const PC_MUL = [
  "Algoritmus NásobeníPolynomů",
  "Jsou dány polynomy P a Q velikosti n, určené svými koeficienty. Bez újmy na obecnosti předpokládejme, že horních n/2 koeficientů je u obou polynomů nulových, takže součin R ≡ P · Q bude také polynom velikosti n.",
  "Zvolíme navzájem různá čísla x_0, …, x_{n−1}.   // zde xⱼ = ωʲ",
  "Spočítáme grafy polynomů P a Q, čili vektory (P(x_0), …, P(x_{n−1})) a (Q(x_0), …, Q(x_{n−1})).   // FFT",
  "Z toho vypočteme graf součinu R vynásobením po složkách: R(x_i) = P(x_i) · Q(x_i).",
  "Nalezneme koeficienty polynomu R tak, aby odpovídaly grafu.   // inverzní FFT",
];

/** Pseudokód, ke kterému patří `line` kroku s tímto stavem. */
export function codeFor(st: Pick<FftState, "code"> | undefined): string[] {
  if (!st) return PC_FFT;
  return st.code === "mul" ? PC_MUL : st.code === "ifft" ? PC_IFFT : PC_FFT;
}
