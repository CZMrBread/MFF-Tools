/**
 * Příklady pro #/fft/fft (nabídka „Příklady z knihy“). Kniha nemá číselně propočtený příklad FFT – konkrétní
 * vektory jsou ve cvičeních (17.3.2 na str. 432, 17.5.2 na str. 440) a těleso ℤ_p v 17.5 (str. 439).
 * Příklady bez `source` jsou vlastní (označené v nabídce). Očekávané výsledky hlídají fft.test.ts
 * a polyMul.test.ts (spočítáno podle konvence knihy ω = e^{2πi/n}).
 */
import type { FieldId } from "./field";
import type { MulDetail } from "./polyMul";

export type FftOp = "fft" | "ifft" | "mul";

/** vstup jedné operace stránky (sdílí ho příklady, odkaz i nabídka) */
export interface FftInput {
  op: FftOp;
  field: FieldId;
  /** FFT: koeficienty p; inverzní FFT: hodnoty y (nebo p, z jejichž FFT se vychází); násobení: P */
  p: number[];
  /** násobení: Q */
  q: number[];
  /** násobení: podrobnost kroků */
  detail: MulDetail;
  /** inverzní FFT: y = FFT(p) – zpáteční cesta k p */
  yFromFft: boolean;
  /** násobení čísel: základ soustavy (číslice od nejnižšího řádu), jinak null */
  base: number | null;
}

export interface FftExample extends FftInput {
  id: string;
  /** krátký popisek tlačítka */
  label: string;
  /** „Cvičení 17.3.2, str. 432“; null = vlastní příklad */
  source: string | null;
  /** co v příkladu sledovat */
  note: string;
}

const base: Omit<FftInput, "op" | "p"> = {
  field: "C",
  q: [],
  detail: "alg",
  yFromFft: false,
  base: null,
};

const RANGE8 = [0, 1, 2, 3, 4, 5, 6, 7];

export const FFT_EXAMPLES: readonly FftExample[] = [
  {
    ...base,
    id: "range8",
    label: "p = (0, 1, …, 7)",
    op: "fft",
    p: RANGE8,
    source: null,
    note: "vlastní příklad – vstup x₀ … x₇ jako na obr. 17.4 (str. 438) s hodnotami rovnými indexům; listy stromu volání jdou v pořadí 0, 4, 2, 6, 1, 5, 3, 7",
  },
  {
    ...base,
    id: "ones",
    label: "(1, 1, …, 1)",
    op: "fft",
    p: [1, 1, 1, 1, 1, 1, 1, 1],
    source: "Cvičení 17.3.2, str. 432",
    note: "konstantní vektor (x, …, x) má obraz (n·x, 0, …, 0)",
  },
  {
    ...base,
    id: "alternating",
    label: "(1, −1, 1, −1, …)",
    op: "fft",
    p: [1, -1, 1, -1, 1, -1, 1, -1],
    source: "Cvičení 17.3.2, str. 432",
    note: "střídavý vektor má obraz (0, …, 0, n, 0, …, 0) s n na pozici n/2",
  },
  {
    ...base,
    id: "every-other",
    label: "(1, 0, 1, 0, …)",
    op: "fft",
    p: [1, 0, 1, 0, 1, 0, 1, 0],
    source: "Cvičení 17.3.2, str. 432",
    note: "obraz (4, 0, 0, 0, 4, 0, 0, 0) – lichá část ℓ je nulová",
  },
  {
    ...base,
    id: "inverse",
    label: "Inverzní FFT(F(0, …, 7))",
    op: "ifft",
    p: RANGE8,
    yFromFft: true,
    source: "Důsledek Ω⁻¹ = (1/n) · Ω̄, str. 432",
    note: "FFT s ω̄ a vydělení n vrátí původní koeficienty (0, 1, …, 7)",
  },
  {
    ...base,
    id: "numbers",
    label: "123 × 456",
    op: "mul",
    p: [3, 2, 1],
    q: [6, 5, 4],
    base: 10,
    source: "Cvičení 17.5.2, str. 440",
    note: "čísla jako polynomy v soustavě o základu 10 (číslice od nejnižšího řádu); R(10) = 56088",
  },
  {
    ...base,
    id: "z17-fft",
    label: "ℤ₁₇: p = (0, 1, …, 7)",
    op: "fft",
    field: "Z17",
    p: RANGE8,
    source: "FFT v konečných tělesech, str. 439",
    note: "p = 2⁴ + 1 = 17, ω = 2 je primitivní 8. odmocnina z jedné; obraz (11, 8, 14, 6, 13, 3, 12, 1) bez zaokrouhlovacích chyb",
  },
  {
    ...base,
    id: "z17-mul",
    label: "ℤ₁₇: (1, 2, 3) · (4, 5, 6)",
    op: "mul",
    field: "Z17",
    p: [1, 2, 3],
    q: [4, 5, 6],
    source: "FFT v konečných tělesech, str. 439",
    note: "přesně, ale 28 a 27 se modulo 17 přetočí na 11 a 10 – koeficienty součinu musí být menší než p",
  },
  {
    ...base,
    id: "mul-123-456",
    label: "(1, 2, 3) · (4, 5, 6)",
    op: "mul",
    p: [1, 2, 3],
    q: [4, 5, 6],
    detail: "bf",
    source: null,
    note: "vlastní příklad se všemi kroky vnořených FFT; R = (4, 13, 28, 27, 18)",
  },
];
