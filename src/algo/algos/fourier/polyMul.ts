/**
 * Násobení polynomů přes FFT (Průvodce 17.1 Algoritmus NásobeníPolynomů, str. 425; věta a důkaz str. 432:
 * „vektory koeficientů doplníme nulami, tak aby jejich délka byla současně mocnina dvojky a alespoň 2n“).
 * Násobení čísel jako polynomů v soustavě o základu B – cvičení 17.5.2 (str. 440). ℤ₁₇ podle 17.5.
 * Čisté funkce a generátor kroků bez Reactu; testy polyMul.test.ts.
 */
import { snap, type Step } from "../../core/steps";
import { subDigits, supDigits, type C } from "./complex";
import { FIELDS, type FieldId } from "./field";
import {
  fft,
  fftRun,
  finishedCalls,
  ifft,
  ifftRun,
  MAX_N,
  newState,
  nextPow2,
  par,
  toField,
  vecText,
  type FftState,
} from "./fft";

export { PC_MUL } from "./fftCode";

/** nejvýš tolik koeficientů jednoho činitele (N = 2 · 8 = 16) */
export const MAX_FACTOR = MAX_N / 2;

/** Velikost transformace: mocnina dvojky, aspoň 2 · max(|P|, |Q|) a aspoň 4 (str. 432). */
export function mulSize(lenP: number, lenQ: number): number {
  const m = Math.max(lenP, lenQ);
  if (m > MAX_FACTOR)
    throw new Error(`Nejvýš ${MAX_FACTOR} koeficientů v jednom polynomu.`);
  return Math.max(4, nextPow2(2 * m));
}

/** Přímé násobení Θ(n²): r_k = Σ p_i q_{k−i} (kontrola výsledku). */
export function naiveMul(p: readonly number[], q: readonly number[]): number[] {
  const r = new Array<number>(p.length + q.length - 1).fill(0);
  p.forEach((a, i) => q.forEach((b, j) => (r[i + j] += a * b)));
  return r;
}

export interface MulResult {
  N: number;
  P: C[];
  Q: C[];
  Phat: C[];
  Qhat: C[];
  Rhat: C[];
  R: C[];
  rounded: number[];
  maxErr: number;
  wrapped: boolean;
}

const pad = (xs: readonly number[], n: number) => [
  ...xs,
  ...new Array<number>(n - xs.length).fill(0),
];

function roundOff(R: readonly C[], len: number, field: FieldId) {
  if (field === "Z17")
    return { rounded: R.slice(0, len).map((z) => z.re), maxErr: 0 };
  let maxErr = 0;
  for (const z of R)
    maxErr = Math.max(
      maxErr,
      Math.abs(z.re - Math.round(z.re)),
      Math.abs(z.im),
    );
  return {
    rounded: R.slice(0, len).map((z) => Math.round(z.re) + 0),
    maxErr,
  };
}

/** Celý výpočet najednou: FFT obou, součin po složkách, inverzní FFT a zaokrouhlení. */
export function mulPoly(
  p: readonly number[],
  q: readonly number[],
  field: FieldId,
): MulResult {
  const f = FIELDS[field];
  const N = mulSize(p.length, q.length);
  const P = toField(pad(p, N), field);
  const Q = toField(pad(q, N), field);
  const Phat = fft(P, f);
  const Qhat = fft(Q, f);
  const Rhat = Phat.map((a, i) => f.mul(a, Qhat[i]));
  const R = ifft(Rhat, f);
  const { rounded, maxErr } = roundOff(R, p.length + q.length - 1, field);
  const naive = naiveMul(p, q);
  return {
    N,
    P,
    Q,
    Phat,
    Qhat,
    Rhat,
    R,
    rounded,
    maxErr,
    wrapped: field === "Z17" && naive.some((v, i) => v !== rounded[i]),
  };
}

/** Číslice součinu v soustavě o základu `base` (přenosy od nejnižšího řádu) a hodnota R(base). */
export function carryDigits(
  r: readonly number[],
  base: number,
): { digits: number[]; value: number } {
  const digits: number[] = [];
  let carry = 0;
  for (const x of r) {
    const t = x + carry;
    digits.push(((t % base) + base) % base);
    carry = Math.floor(t / base);
  }
  while (carry > 0) {
    digits.push(carry % base);
    carry = Math.floor(carry / base);
  }
  return {
    digits,
    value: r.reduce((s, x, i) => s + x * base ** i, 0),
  };
}

/** „3·10⁻¹⁵“ */
function sci(x: number): string {
  if (x === 0) return "0";
  const [m, e] = x.toExponential(0).split("e");
  return `${m}·10${supDigits(Number(e))}`;
}

const intList = (xs: readonly number[]) =>
  "(" + xs.map((x) => String(x).replace("-", "−")).join(", ") + ")";

export type MulDetail = "alg" | "bf";

export interface MulNumbers {
  a: number;
  b: number;
  base?: number;
}

/**
 * Kroky NásobeníPolynomů (PC_MUL). `detail`: „alg“ = jen kroky algoritmu (FFT jako jeden krok, strom
 * volání se ukáže hotový), „bf“ = i všechny kroky vnořených FFT a inverzní FFT (pseudokód se přepne).
 */
export function* mulSteps(
  p: readonly number[],
  q: readonly number[],
  field: FieldId,
  detail: MulDetail,
  numbers?: MulNumbers,
): Generator<Step<FftState>, void, unknown> {
  const f = FIELDS[field];
  const res = mulPoly(p, q, field);
  const { N } = res;
  const st = newState("mul", field, res.P, false);
  st.mul = {
    stage: "start",
    P: res.P,
    Q: res.Q,
    lenP: p.length,
    lenQ: q.length,
    Phat: null,
    Qhat: null,
    Rhat: null,
    R: null,
    rounded: null,
    maxErr: null,
    wrapped: false,
    col: null,
  };
  const m = st.mul;
  st.vars = { n: String(N) };
  yield snap(
    st,
    0,
    `Násobení P · Q: P = ${intList(p)}, Q = ${intList(q)} (koeficienty od nejnižšího řádu)${field === "Z17" ? " v ℤ₁₇" : ""}.`,
  );
  m.stage = "pad";
  yield snap(
    st,
    1,
    `Doplníme nulami na n = ${N} (mocnina dvojky, aspoň 2 · ${Math.max(p.length, q.length)}): horní polovina koeficientů je nulová, součin se do n vejde.`,
  );
  m.stage = "points";
  st.vars["ω"] = f.fmt(f.omega(N, 1, false));
  yield snap(
    st,
    2,
    field === "Z17"
      ? `Body xⱼ = ωʲ pro j = 0, …, ${N - 1}, kde ω = ${f.fmt(f.omega(N, 1, false))} je primitivní ${N}. odmocnina z jedné v ℤ₁₇.`
      : `Body xⱼ = ωʲ pro j = 0, …, ${N - 1}, kde ω = exp(2πi/${N}) ≈ ${f.fmt(f.omega(N, 1, false))} – navzájem různé a spárované (±).`,
  );

  // grafy P a Q (ř. 3)
  for (const which of ["P", "Q"] as const) {
    const x = which === "P" ? res.P : res.Q;
    m.stage = which === "P" ? "fftP" : "fftQ";
    let y: C[];
    if (detail === "bf") {
      yield snap(
        st,
        3,
        `Graf ${which}: spočítáme ${which}(ω⁰), …, ${which}(ω${supDigits(N - 1)}) algoritmem FFT.`,
      );
      y = yield* fftRun(st, x, false);
      st.code = "mul";
      st.shown = null;
    } else {
      st.calls = finishedCalls(x, f, false);
      st.shown = null;
      st.inverse = false;
      y = which === "P" ? res.Phat : res.Qhat;
    }
    if (which === "P") m.Phat = y;
    else m.Qhat = y;
    st.vars = { n: String(N), ω: f.fmt(f.omega(N, 1, false)) };
    yield snap(
      st,
      3,
      `${which}̂ = FFT(${which.toLowerCase()}) = ${vecText(f, y)}.`,
    );
  }

  // součin po složkách (ř. 4)
  m.stage = "pointwise";
  m.Rhat = new Array<C | null>(N).fill(null);
  for (let i = 0; i < N; i++) {
    const r = f.mul(m.Phat![i], m.Qhat![i]);
    m.Rhat[i] = r;
    m.col = i;
    st.vars = { n: String(N), i: String(i) };
    yield snap(
      st,
      4,
      `R(x${subDigits(i)}) = P(x${subDigits(i)}) · Q(x${subDigits(i)}) = ${par(f.fmt(m.Phat![i]))} · ${par(f.fmt(m.Qhat![i]))} = ${f.fmt(r)}.`,
    );
  }
  m.col = null;

  // koeficienty R (ř. 5)
  m.stage = "ifft";
  const Rhat = m.Rhat as C[];
  let R: C[];
  if (detail === "bf") {
    yield snap(
      st,
      5,
      `Koeficienty R najdeme inverzní FFT grafu R̂ = ${vecText(f, Rhat)}.`,
    );
    R = yield* ifftRun(st, Rhat);
    st.code = "mul";
    st.ifft = null;
    st.shown = null;
  } else {
    st.calls = finishedCalls(Rhat, f, true);
    st.shown = null;
    st.inverse = true;
    R = res.R;
  }
  m.R = R;
  st.vars = { n: String(N) };
  yield snap(
    st,
    5,
    `Inverzní FFT: r = ${vecText(f, R)}${field === "C" ? " – kvůli zaokrouhlování jen přibližně" : ""}.`,
  );

  m.stage = "done";
  m.rounded = res.rounded;
  m.maxErr = res.maxErr;
  m.wrapped = res.wrapped;
  st.inverse = false;
  st.result = R;
  const len = p.length + q.length - 1;
  let msg = `Hotovo: R = P · Q = ${intList(res.rounded)} (velikost ${len} = |P| + |Q| − 1).`;
  if (field === "C")
    msg += ` Odchylka od celých čísel nejvýš ${sci(res.maxErr)}.`;
  if (res.wrapped) {
    const naive = naiveMul(p, q);
    const bad = naive.flatMap((v, i) =>
      v !== res.rounded[i] ? [`${v} → ${res.rounded[i]}`] : [],
    );
    msg += ` V ℤ₁₇ se koeficienty přetočily (${bad.join(", ")}): koeficienty součinu musí být menší než 17.`;
  }
  if (numbers) {
    const base = numbers.base ?? 10;
    const { value } = carryDigits(res.rounded, base);
    const terms = res.rounded
      .map((r, i) =>
        i === 0 ? String(r) : `${r}·${base}${i > 1 ? supDigits(i) : ""}`,
      )
      .join(" + ");
    msg += ` Čísla: R(${base}) = ${terms} = ${value} = ${numbers.a} × ${numbers.b}.`;
  }
  yield snap(st, 5, msg);
}
