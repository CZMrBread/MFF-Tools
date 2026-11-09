/**
 * Rekurzivní FFT podle Průvodce 17.3 (Algoritmus FFT, str. 430), DFT podle definice (str. 431) a inverzní
 * transformace (Ω⁻¹ = (1/n) · Ω̄, str. 432) – čisté funkce a generátory kroků bez Reactu.
 *
 * Konvence knihy: ω = e^{2πi/n} a y_j = Σ_k x_k · ω^{jk} (numpy.fft má opačné znaménko!).
 * Stav kroku nese celý strom volání (vstupy, postupně plněné výstupy, stav vrcholů), aktuální motýlek
 * a u násobení polynomů i tabulku P, Q, P̂, Q̂, R̂, R (`mul`) – pohledy z něj jen kreslí.
 * Testy: fft.test.ts (proti cvičením 17.3.2, obr. 17.4 a ℤ₁₇ ze str. 439).
 */
import { snap, type Step } from "../../core/steps";
import { c, subDigits, supDigits, type C } from "./complex";
import { FIELDS, type Field, type FieldId } from "./field";
import { PC_IFFT } from "./fftCode";

export { codeFor, PC_FFT, PC_IFFT, PC_MUL } from "./fftCode";

/* ------------------------------------------------------------------ čisté výpočty */

/** prvky tělesa ze vstupních čísel (ℤ₁₇: zbytky) */
export const toField = (xs: readonly number[], field: FieldId): C[] =>
  xs.map((x) => FIELDS[field].from(x));

/** DFT přímo podle definice (str. 431): y_j = Σ_k x_k · ω^{jk}; Θ(n²) – reference pro testy */
export function dft(x: readonly C[], f: Field, inverse = false): C[] {
  const n = x.length;
  return Array.from({ length: n }, (_, j) => {
    let s = f.from(0);
    for (let k = 0; k < n; k++)
      s = f.add(s, f.mul(x[k], f.omega(n, j * k, inverse)));
    return s;
  });
}

/** Rekurzivní FFT (str. 430); n musí být mocnina dvojky. `inverse` = s ω̄ (bez dělení n). */
export function fft(x: readonly C[], f: Field, inverse = false): C[] {
  const N = x.length;
  const rec = (p: readonly C[]): C[] => {
    const n = p.length;
    if (n === 1) return [p[0]];
    const s = rec(p.filter((_, i) => i % 2 === 0));
    const l = rec(p.filter((_, i) => i % 2 === 1));
    const y: C[] = new Array<C>(n);
    for (let j = 0; j < n / 2; j++) {
      // ω tohoto volání je ω_N^{N/n}, jeho j-tá mocnina ω_N^{jN/n}
      const wl = f.mul(f.omega(N, (j * N) / n, inverse), l[j]);
      y[j] = f.add(s[j], wl);
      y[j + n / 2] = f.sub(s[j], wl);
    }
    return y;
  };
  return rec(x);
}

/** Inverzní DFT: FFT s ω̄ a vydělení n (str. 432). */
export const ifft = (y: readonly C[], f: Field): C[] =>
  fft(y, f, true).map((z) => f.divN(z, y.length));

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Největší velikost transformace na stránce (vlastník: n = 4 / 8 / 16). */
export const MAX_N = 16;

/** Velikost transformace pro vstup délky `len`: mocnina dvojky, aspoň 4, nejvýš 16. */
export function transformSize(len: number): number {
  if (len > MAX_N) throw new Error(`Nejvýš ${MAX_N} koeficientů.`);
  return Math.max(4, nextPow2(len));
}

/* ------------------------------------------------------------------ strom volání */

export interface CallSpec {
  id: number;
  parent: number | null;
  depth: number;
  /** indexy koeficientů původního vstupu, které volání dostane (p_0, p_4 …) */
  idx: number[];
  /** vodorovná poloha 0..1: listy zleva doprava, vnitřní vrchol uprostřed nad syny */
  x: number;
  /** id synů [sudá část s, lichá část ℓ]; list nemá */
  kids: [number, number] | null;
}

/**
 * Strom rekurzivních volání pro vstup velikosti n v pořadí volání (preorder: kořen, sudá část, lichá).
 * Listy zleva = bitové zrcadlení indexů (0, 4, 2, 6, 1, 5, 3, 7 pro n = 8 – levý sloupec obr. 17.4).
 */
export function callTree(n: number): CallSpec[] {
  const out: CallSpec[] = [];
  let leaf = 0;
  const build = (
    idx: number[],
    depth: number,
    parent: number | null,
  ): CallSpec => {
    const node: CallSpec = {
      id: out.length,
      parent,
      depth,
      idx,
      x: 0,
      kids: null,
    };
    out.push(node);
    if (idx.length === 1) {
      node.x = (leaf++ + 0.5) / n;
      return node;
    }
    const s = build(
      idx.filter((_, i) => i % 2 === 0),
      depth + 1,
      node.id,
    );
    const l = build(
      idx.filter((_, i) => i % 2 === 1),
      depth + 1,
      node.id,
    );
    node.kids = [s.id, l.id];
    node.x = (s.x + l.x) / 2;
    return node;
  };
  build(
    Array.from({ length: n }, (_, i) => i),
    0,
    null,
  );
  return out;
}

/* ------------------------------------------------------------------ stav kroků */

export type CodeId = "fft" | "ifft" | "mul";

export type CallStatus = "pending" | "active" | "waiting" | "done";

export interface CallNode extends CallSpec {
  input: C[];
  /** výstup volání – plní se postupně (null = ještě nespočítaný prvek); null = volání ještě neskládalo */
  out: (C | null)[] | null;
  status: CallStatus;
  /** ve vrcholu obarvit sudé / liché koeficienty (rozdělení, ř. 2–4) */
  split: boolean;
}

/** vstup volání jako celá čísla (jen ten jde vyplnit do FFT(p)); jinak null */
export function integerInput(v: CallNode): number[] | null {
  const out: number[] = [];
  for (const z of v.input) {
    if (Math.abs(z.im) > 1e-9 || Math.abs(z.re - Math.round(z.re)) > 1e-9)
      return null;
    out.push(Math.round(z.re));
  }
  return out;
}

/** motýlek ř. 7–8: y_j = s_j + ω^j ℓ_j, y_{j+n/2} = s_j − ω^j ℓ_j */
export interface Butterfly {
  j: number;
  s: C;
  l: C;
  w: C;
  wl: C;
  top: C | null;
  bot: C | null;
}

/** tabulka násobení polynomů (NásobeníPolynomů, str. 425) */
export interface MulState {
  stage:
    | "start"
    | "pad"
    | "points"
    | "fftP"
    | "fftQ"
    | "pointwise"
    | "ifft"
    | "done";
  /** koeficienty doplněné nulami na N */
  P: C[];
  Q: C[];
  lenP: number;
  lenQ: number;
  Phat: C[] | null;
  Qhat: C[] | null;
  Rhat: (C | null)[] | null;
  R: C[] | null;
  /** koeficienty R zaokrouhlené na celá čísla (normální tvar, velikost |P| + |Q| − 1) */
  rounded: number[] | null;
  /** největší odchylka R od celých čísel (ℂ) */
  maxErr: number | null;
  /** ℤ₁₇: skutečný koeficient součinu byl ≥ 17 a „přetočil se“ */
  wrapped: boolean;
  /** aktuální sloupec bodového součinu (ř. 4) */
  col: number | null;
}

export interface FftState {
  /** který pseudokód patří ke kroku (codeFor) */
  code: CodeId;
  field: FieldId;
  /** velikost transformace */
  N: number;
  /** FFT běží s ω̄ (ω⁻¹) – inverzní transformace */
  inverse: boolean;
  calls: CallNode[];
  /** volání v tabulce (aktivní); null = kořen */
  shown: number | null;
  /** aktuální j skládání (ř. 6–8) */
  j: number | null;
  /** právě zapsané y (index v rámci volání) */
  wrote: number[];
  bf: Butterfly | null;
  /** inverzní FFT: vstup y, z = FFT(ω̄, y), výsledek p = z / n */
  ifft: { y: C[]; z: C[] | null; p: C[] | null } | null;
  /** proměnné aktuálního volání (VarsView) */
  vars: Record<string, string>;
  mul: MulState | null;
  /** výsledek celé operace – jen na posledním kroku */
  result: C[] | null;
}

type Gen<R> = Generator<Step<FftState>, R, unknown>;

/** Nový prázdný stav (strom volání podle N, vstup x). */
export function newState(
  code: CodeId,
  field: FieldId,
  x: readonly C[],
  inverse: boolean,
): FftState {
  return {
    code,
    field,
    N: x.length,
    inverse,
    calls: freshCalls(x),
    shown: null,
    j: null,
    wrote: [],
    bf: null,
    ifft: null,
    vars: {},
    mul: null,
    result: null,
  };
}

function freshCalls(x: readonly C[]): CallNode[] {
  return callTree(x.length).map((s) => ({
    ...s,
    input: s.idx.map((i) => x[i]),
    out: null,
    status: "pending",
    split: false,
  }));
}

/** Strom volání po celém výpočtu (všechna volání hotová) – násobení „jen kroky algoritmu“. */
export function finishedCalls(
  x: readonly C[],
  f: Field,
  inverse: boolean,
): CallNode[] {
  const N = x.length;
  return freshCalls(x).map((n) => ({
    ...n,
    // výstup volání = FFT jeho vstupu s odmocninou ω_N^{2^d}; fft() bere ω z délky, proto přes N
    out: subFft(n.input, f, inverse, N),
    status: "done",
    split: n.idx.length > 1,
  }));
}

function subFft(p: C[], f: Field, inverse: boolean, N: number): C[] {
  const n = p.length;
  if (n === 1) return [p[0]];
  const s = subFft(
    p.filter((_, i) => i % 2 === 0),
    f,
    inverse,
    N,
  );
  const l = subFft(
    p.filter((_, i) => i % 2 === 1),
    f,
    inverse,
    N,
  );
  const y: C[] = new Array<C>(n);
  for (let j = 0; j < n / 2; j++) {
    const wl = f.mul(f.omega(N, (j * N) / n, inverse), l[j]);
    y[j] = f.add(s[j], wl);
    y[j + n / 2] = f.sub(s[j], wl);
  }
  return y;
}

/* ------------------------------------------------------------------ texty */

/** „ω“, „ω²“, „ω̄⁴“ – odmocnina volání v hloubce d (ω^{2^d}) */
export function wSym(f: Field, inverse: boolean, depth: number): string {
  const e = 2 ** depth;
  return f.sym(inverse) + (e === 1 ? "" : supDigits(e));
}

/** (p₀, p₂, p₄, p₆); dlouhé seznamy zkrátí: (p₀, p₂, …, p₁₄) */
export function pList(idx: readonly number[], name = "p"): string {
  const t = (i: number) => name + subDigits(i);
  if (idx.length <= 4) return "(" + idx.map(t).join(", ") + ")";
  return `(${t(idx[0])}, ${t(idx[1])}, …, ${t(idx[idx.length - 1])})`;
}

/** hodnota do vzorce: složené komplexní číslo nebo záporné do závorky */
export function par(v: string): string {
  return /[+−]/.test(v.slice(1)) || v.startsWith("−") ? `(${v})` : v;
}

export const vecText = (f: Field, v: readonly (C | null)[]): string =>
  "(" + v.map((z) => (z ? f.fmt(z) : "·")).join(", ") + ")";

/* ------------------------------------------------------------------ generátory */

function setShown(st: FftState, id: number) {
  st.shown = id;
  st.j = null;
  st.bf = null;
  st.wrote = [];
  const node = st.calls[id];
  const f = FIELDS[st.field];
  st.vars = {
    n: String(node.idx.length),
    [f.sym(st.inverse)]: f.fmt(f.omega(st.N, 1, st.inverse)),
  };
  if (node.depth > 0)
    st.vars[wSym(f, st.inverse, node.depth)] = f.fmt(
      f.omega(st.N, 2 ** node.depth, st.inverse),
    );
}

/**
 * Kroky FFT nad stavem `st` (vstup `x` velikosti mocniny dvojky). Mění `st` a vrací výstup y.
 * Krok vstupu do vnitřního volání: ř. 0 (kořen) / 3 (sudá část) / 4 (lichá); list: ř. 3/4 a ř. 1;
 * rozdělení ř. 2; skládání ř. 5; motýlek ř. 7 a hned ř. 8; návrat ř. 9.
 */
export function* fftRun(
  st: FftState,
  x: readonly C[],
  inverse: boolean,
): Gen<C[]> {
  const f = FIELDS[st.field];
  st.code = "fft";
  st.N = x.length;
  st.inverse = inverse;
  st.calls = freshCalls(x);
  const N = st.N;
  const W = (d: number) => wSym(f, inverse, d);
  const iname = st.ifft ? "y" : "p";

  function* call(id: number, via: 0 | 3 | 4): Gen<C[]> {
    const node = st.calls[id];
    const n = node.idx.length;
    const d = node.depth;
    const parent = node.parent === null ? null : st.calls[node.parent];
    if (parent) parent.status = "waiting";
    node.status = "active";
    setShown(st, id);
    const head = `FFT(${n}, ${W(d)}, ${pList(node.idx, iname)})`;
    const part =
      via === 3
        ? `(s₀${n > 1 ? `, …, s${subDigits(n - 1)}` : ""}) ← `
        : via === 4
          ? `(ℓ₀${n > 1 ? `, …, ℓ${subDigits(n - 1)}` : ""}) ← `
          : "";
    if (via !== 0 || n > 1)
      yield snap(
        st,
        via,
        via === 0
          ? `${head}: vyhodnotíme polynom v bodech ${W(0)}⁰, …, ${W(0)}${supDigits(N - 1)}.`
          : `${part}${head} – ${via === 3 ? "sudá" : "lichá"} část, ${n === 1 ? "jediný koeficient" : `vyhodnotíme v mocninách ${W(d)}`}.`,
      );
    if (n === 1) {
      node.out = [node.input[0]];
      st.wrote = [0];
      yield snap(
        st,
        1,
        `n = 1: y₀ ← ${iname}${subDigits(node.idx[0])} = ${f.fmt(node.input[0])}.`,
      );
      node.status = "done";
      return [node.input[0]];
    }
    node.split = true;
    const [sId, lId] = node.kids!;
    yield snap(
      st,
      2,
      `Rozdělíme koeficienty: sudé ${pList(st.calls[sId].idx, iname)} → s, liché ${pList(st.calls[lId].idx, iname)} → ℓ.`,
    );
    node.status = "waiting";
    const s = yield* call(sId, 3);
    const l = yield* call(lId, 4);
    if (parent) parent.status = "waiting";
    node.status = "active";
    setShown(st, id);
    const y: (C | null)[] = new Array<C | null>(n).fill(null);
    node.out = y;
    yield snap(
      st,
      5,
      `Z grafů s = ${vecText(f, s)} a ℓ = ${vecText(f, l)} poskládáme graf y (n = ${n}, ω tohoto volání = ${W(d)}).`,
    );
    const wj = (j: number) =>
      (d === 0 ? `${W(0)}` : `(${W(d)})`) + supDigits(j);
    for (let j = 0; j < n / 2; j++) {
      const w = f.omega(N, (j * N) / n, inverse);
      const wl = f.mul(w, l[j]);
      const top = f.add(s[j], wl);
      const bot = f.sub(s[j], wl);
      st.j = j;
      st.vars.j = String(j);
      st.vars[`${W(d)}ʲ`] = f.fmt(w);
      y[j] = top;
      st.wrote = [j];
      st.bf = { j, s: s[j], l: l[j], w, wl, top, bot: null };
      const term = `${par(f.fmt(w))}·${par(f.fmt(l[j]))}`;
      yield snap(
        st,
        7,
        `y${subDigits(j)} ← s${subDigits(j)} + ${wj(j)}·ℓ${subDigits(j)} = ${par(f.fmt(s[j]))} + ${term} = ${f.fmt(top)}`,
      );
      y[j + n / 2] = bot;
      st.wrote = [j + n / 2];
      st.bf = { ...st.bf, bot };
      yield snap(
        st,
        8,
        `y${subDigits(j + n / 2)} ← s${subDigits(j)} − ${wj(j)}·ℓ${subDigits(j)} = ${par(f.fmt(s[j]))} − ${term} = ${f.fmt(bot)}`,
      );
    }
    const out = y as C[];
    node.status = "done";
    st.j = null;
    st.bf = null;
    st.wrote = [];
    delete st.vars.j;
    delete st.vars[`${W(d)}ʲ`];
    yield snap(
      st,
      9,
      parent
        ? `${head} vrací ${vecText(f, out)}.`
        : `Výstup: y = ${vecText(f, out)} – graf polynomu v bodech ${W(0)}⁰, …, ${W(0)}${supDigits(N - 1)}.`,
    );
    return out;
  }

  return yield* call(0, 0);
}

/** Kroky inverzní FFT (PC_IFFT) s vnořenou FFT s ω̄ (PC_FFT). Vrací koeficienty p. */
export function* ifftRun(st: FftState, y: readonly C[]): Gen<C[]> {
  const f = FIELDS[st.field];
  const n = y.length;
  st.code = "ifft";
  st.N = n;
  st.inverse = true;
  st.calls = freshCalls(y);
  st.shown = null;
  st.ifft = { y: [...y], z: null, p: null };
  st.vars = { n: String(n), [f.sym(true)]: f.fmt(f.omega(n, 1, true)) };
  yield snap(
    st,
    0,
    `Inverzní FFT y = ${vecText(f, y)}: Ω⁻¹ = (1/n)·Ω̄, takže stačí FFT s ${f.sym(true)} a vydělit n = ${n}.`,
  );
  yield snap(
    st,
    1,
    `z ← FFT(${n}, ${f.sym(true)}, y) – ${f.sym(true)} = ${f.fmt(f.omega(n, 1, true))} je také primitivní ${n}. odmocnina z jedničky.`,
  );
  const z = yield* fftRun(st, y, true);
  st.code = "ifft";
  st.shown = null;
  st.j = null;
  st.bf = null;
  st.ifft.z = z;
  st.vars = { n: String(n), [f.sym(true)]: f.fmt(f.omega(n, 1, true)) };
  yield snap(st, 1, `z = ${vecText(f, z)}.`);
  const p = z.map((v) => f.divN(v, n));
  st.ifft.p = p;
  yield snap(
    st,
    2,
    st.field === "Z17"
      ? `p_j ← z_j / ${n} = z_j · ${f.fmt(f.divN(c(1), n))} (inverze ${n} v ℤ₁₇): p = ${vecText(f, p)}.`
      : `p_j ← z_j / ${n}: p = ${vecText(f, p)}.`,
  );
  return p;
}

/** Kroky FFT jako celé operace (#/fft/fft ▸ FFT(p)). */
export function* fftSteps(
  x: readonly C[],
  field: FieldId,
): Generator<Step<FftState>, void, unknown> {
  const xs = padTo(x, nextPow2(x.length), field);
  const st = newState("fft", field, xs, false);
  const run = fftRun(st, xs, false);
  // výsledek patří už do posledního kroku (ř. 9 kořene) – proto se poslední snímek doplní
  let last: Step<FftState> | null = null;
  for (;;) {
    const r = run.next();
    if (r.done) {
      if (last) {
        last.state.result = r.value;
        yield last;
      }
      return;
    }
    if (last) yield last;
    last = r.value;
  }
}

/** Kroky inverzní FFT jako celé operace (#/fft/fft ▸ Inverzní FFT(y)). */
export function* ifftSteps(
  y: readonly C[],
  field: FieldId,
): Generator<Step<FftState>, void, unknown> {
  const ys = padTo(y, nextPow2(y.length), field);
  const st = newState("ifft", field, ys, true);
  const p = yield* ifftRun(st, ys);
  st.result = p;
  const f = FIELDS[field];
  yield snap(
    st,
    PC_IFFT.length - 1,
    `Výstup: koeficienty p = ${vecText(f, p)}.`,
  );
}

function padTo(x: readonly C[], n: number, field: FieldId): C[] {
  const f = FIELDS[field];
  return [...x, ...Array.from({ length: n - x.length }, () => f.from(0))];
}

/* ------------------------------------------------------------------ odvozené pohledy */

export interface CircleMarks {
  /** počet bodů ω_N^k na kružnici */
  n: number;
  /** obíhá opačně (ω̄) */
  inverse: boolean;
  /** body, ve kterých aktivní volání vyhodnocuje (k pro ω_N^k) */
  active: number[];
  /** spárované body ω^j a −ω^j aktuálního motýlku */
  pair: [number, number] | null;
  /** jeden zvýrazněný bod (bodový součin) */
  hot: number | null;
}

/**
 * Body na kružnici podle kroku: volání v hloubce d vyhodnocuje v mocninách ω^{2^d} – n/2^d bodů, které
 * zůstávají spárované (±ω^j). Motýlek zvýrazní dvojici ω^j a ω^{j+n/2} = −ω^j (str. 430).
 */
export function circleMarks(st: FftState): CircleMarks {
  const N = st.N;
  const all = Array.from({ length: N }, (_, k) => k);
  if (st.code === "mul" || st.shown === null)
    return {
      n: N,
      inverse: st.code === "mul" ? false : st.inverse,
      active: all,
      pair: null,
      hot: st.code === "mul" ? (st.mul?.col ?? null) : null,
    };
  const node = st.calls[st.shown];
  const step = 2 ** node.depth;
  const n = node.idx.length;
  return {
    n: N,
    inverse: st.inverse,
    active: all.filter((k) => k % step === 0 && k / step < n),
    pair:
      st.j === null ? null : [(st.j * step) % N, ((st.j + n / 2) * step) % N],
    hot: null,
  };
}

export interface TableCell {
  text: string;
  cls?: string;
  /** plná přesnost do vysvětlivky */
  title?: string;
}
export interface TableRow {
  key: string;
  /** popisek řádku (sazba přes fmtMath: p_k, ω^j) */
  label: string;
  cells: TableCell[];
}
export interface TableModel {
  heads: string[];
  rows: TableRow[];
}

const full = (z: C) =>
  z.im === 0
    ? String(z.re)
    : `${z.re} ${z.im < 0 ? "−" : "+"} ${Math.abs(z.im)}i`;

/** Tabulka volání v tabulce (aktivní, jinak kořen): koeficienty → hodnoty, s, ℓ, ω^j, y. */
export function tableModel(st: FftState): TableModel {
  const f = FIELDS[st.field];
  const node = st.calls[st.shown ?? 0];
  const n = node.idx.length;
  const d = node.depth;
  const kids = node.kids ? node.kids.map((k) => st.calls[k]) : null;
  const s = kids?.[0].out ?? null;
  const l = kids?.[1].out ?? null;
  const half = n / 2;
  const bfj = st.j;
  const cell = (z: C | null | undefined, cls?: string): TableCell =>
    z ? { text: f.fmt(z), cls, title: full(z) } : { text: "", cls };
  const parity = (j: number) =>
    node.split ? (j % 2 === 0 ? "fft-even" : "fft-odd") : undefined;
  const inName = st.ifft ? "y" : "p";
  const outName = st.ifft ? "z" : "y";
  const range = Array.from({ length: n }, (_, j) => j);
  // indexy koeficientů ukazuje vrchol stromu volání a nadpis tabulky; buňka má index ve vysvětlivce
  const rows: TableRow[] = [
    {
      key: "p",
      label: `${inName}_k`,
      cells: range.map((j) => {
        const z = node.input[j];
        return {
          text: f.fmt(z),
          cls: parity(j),
          title: `${inName}${subDigits(node.idx[j])} = ${full(z)}`,
        };
      }),
    },
  ];
  if (n > 1) {
    rows.push(
      {
        key: "s",
        label: "s_j",
        cells: range.map((j) =>
          j < half
            ? cell(s?.[j], "fft-even" + (bfj === j ? " cell-active" : ""))
            : { text: "" },
        ),
      },
      {
        key: "l",
        label: "ℓ_j",
        cells: range.map((j) =>
          j < half
            ? cell(l?.[j], "fft-odd" + (bfj === j ? " cell-active" : ""))
            : { text: "" },
        ),
      },
    );
  }
  rows.push(
    {
      key: "w",
      // bod, ve kterém se y_j vyhodnocuje: symbolicky jako mocnina ω celé transformace (jako na kružnici);
      // hodnota ve vysvětlivce (ℤ₁₇: rovnou hodnota)
      // unicode mocnina: „ω̄“ má kombinující pruh a fmtMath by za ním ^ nevysázel
      label: `${f.sym(st.inverse)}${d === 0 ? "" : supDigits(2 ** d)}ʲ`,
      cells: range.map((j) => {
        const k = (j * st.N) / n;
        const z = f.omega(st.N, k, st.inverse);
        return {
          text:
            st.field === "Z17" ? f.fmt(z) : f.sym(st.inverse) + supDigits(k),
          title: `${f.sym(st.inverse)}${supDigits(k)} = ${full(z)}`,
          cls:
            bfj !== null && (j === bfj || j === bfj + half)
              ? "cell-active"
              : undefined,
        };
      }),
    },
    {
      key: "y",
      label: `${outName}_j`,
      cells: range.map((j) =>
        cell(
          node.out?.[j],
          st.wrote.includes(j)
            ? "cell-hot"
            : node.out?.[j]
              ? "cell-done"
              : undefined,
        ),
      ),
    },
  );
  if (st.ifft?.p && (st.shown === null || st.shown === 0))
    rows.push({
      key: "out",
      label: "p_j = z_j / n",
      cells: range.map((j) => cell(st.ifft!.p![j], "cell-done")),
    });
  return { heads: range.map(String), rows };
}

/** Tabulka násobení: ω^j, P, Q, P̂ = P(ω^j), Q̂, R̂ = P̂ · Q̂, R (NásobeníPolynomů). */
export function mulTableModel(st: FftState): TableModel {
  const f = FIELDS[st.field];
  const m = st.mul!;
  const N = st.N;
  const range = Array.from({ length: N }, (_, j) => j);
  const col = m.col;
  const cell = (z: C | null | undefined, cls?: string): TableCell =>
    z ? { text: f.fmt(z), cls, title: full(z) } : { text: "", cls };
  const hotCol = (j: number) => (col === j ? "cell-active" : undefined);
  const pad = (j: number, len: number) => (j >= len ? "fft-pad" : undefined);
  const stage = m.stage;
  const row = (
    key: string,
    label: string,
    v: readonly (C | null)[] | null,
    cls: (j: number) => string | undefined,
  ): TableRow => ({
    key,
    label,
    cells: range.map((j) => cell(v?.[j], cls(j))),
  });
  const showX = stage !== "start" && stage !== "pad";
  return {
    heads: range.map(String),
    rows: [
      {
        key: "x",
        label: "x_j",
        cells: range.map((j) => {
          const z = f.omega(N, j, false);
          return showX
            ? {
                text: st.field === "Z17" ? f.fmt(z) : "ω" + supDigits(j),
                title: `ω${supDigits(j)} = ${full(z)}`,
                cls: hotCol(j),
              }
            : { text: "" };
        }),
      },
      row("P", "p_j", stage === "start" ? null : m.P, (j) =>
        stage === "start" ? undefined : pad(j, m.lenP),
      ),
      row("Q", "q_j", stage === "start" ? null : m.Q, (j) =>
        stage === "start" ? undefined : pad(j, m.lenQ),
      ),
      row("Ph", "P(x_j)", m.Phat, (j) =>
        stage === "fftP" ? "cell-hot" : hotCol(j),
      ),
      row("Qh", "Q(x_j)", m.Qhat, (j) =>
        stage === "fftQ" ? "cell-hot" : hotCol(j),
      ),
      row("Rh", "R(x_j)", m.Rhat, (j) => (col === j ? "cell-hot" : undefined)),
      row("R", "r_j", m.R, (j) =>
        stage === "done" || stage === "ifft"
          ? j < m.lenP + m.lenQ - 1
            ? "cell-done"
            : "fft-pad"
          : undefined,
      ),
    ],
  };
}
