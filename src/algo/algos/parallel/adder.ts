/**
 * Sčítačka (Průvodce 15.2, s. 386–390) – čistá logika bez Reactu (testy v adder.test.ts proti
 * adderBook.fixtures.ts).
 *
 * Bity se drží od nejnižšího řádu (`x[i]` = xᵢ); v textu a v tabulce se píšou od nejvyššího (jako
 * v knize). Školní sčítání (obr. 15.3) = řetěz krabiček Σ, krabička i potřebuje přenos cᵢ z krabičky
 * i − 1, takže leží v hladině i + 1 → hloubka n. Paralelní (obr. 15.4) = chování kanonických bloků
 * (0 pohlcuje, 1 vytváří, < kopíruje přenos) po hladinách 1, 2, 4, …, n, pak přenosy „zahušťováním“
 * a nakonec součet – hloubka 2·log₂ n + 3.
 */
import type { Step, StepGen } from "../../core/steps";
import type { Bit } from "./circuit";
import { plural, subscript } from "./circuit";

export type { Bit } from "./circuit";
/** chování bloku: konstantní 0 (pohlcuje přenos), konstantní 1 (vytváří), identita < (kopíruje) */
export type Behavior = "0" | "1" | "<";
export type AdderMode = "par" | "school" | "both";

// ---------- bloky (s. 388–389) ----------

/** jednobitový blok: (0,0) → 0, (1,1) → 1, jinak < */
export const bitBlock = (x: Bit, y: Bit): Behavior =>
  x === y ? (x ? "1" : "0") : "<";

/** B = H ∘ D: horní blok H (vyšší řády) se použije na výstup dolního D */
export const compose = (h: Behavior, d: Behavior): Behavior =>
  h === "<" ? d : h;

/** přenos, který blok pošle nahoru, když do něj zespodu vstoupí c */
export const applyBlock = (b: Behavior, c: Bit): Bit =>
  b === "<" ? c : b === "1" ? 1 : 0;

/** kódování (s. 389): (1, ∗) = <, (0, 0) = 0, (0, 1) = 1 */
export const toPQ = (b: Behavior): [Bit, Bit] =>
  b === "<" ? [1, 0] : b === "1" ? [0, 1] : [0, 0];
export const fromPQ = ([p, q]: readonly [Bit, Bit]): Behavior =>
  p ? "<" : q ? "1" : "0";

/** p_B = p_H ∧ p_D, q_B = (¬p_H ∧ q_H) ∨ (p_H ∧ q_D) */
export function composePQ(
  [pH, qH]: readonly [Bit, Bit],
  [pD, qD]: readonly [Bit, Bit],
): [Bit, Bit] {
  return [(pH & pD) as Bit, ((~pH & 1 & qH) | (pH & qD)) as Bit];
}

/** průchod přenosu blokem: cᵢ₊₁ = (p ∧ cᵢ) ∨ (¬p ∧ q) */
export const carryPQ = ([p, q]: readonly [Bit, Bit], c: Bit): Bit =>
  ((p & c) | (~p & 1 & q)) as Bit;

// ---------- čísla ----------

/** „0110“ (nejvyšší řád vlevo) → bity od nejnižšího */
export const bitsOf = (s: string): Bit[] =>
  [...s.trim()].reverse().map((ch) => (ch === "1" ? 1 : 0));
/** bity od nejnižšího → text od nejvyššího */
export const strOf = (bits: readonly (Bit | null)[]): string =>
  [...bits]
    .reverse()
    .map((b) => b ?? "?")
    .join("");
export const valueOf = (bits: readonly (Bit | null)[]): number =>
  bits.reduce<number>((a, b, i) => a + (b ?? 0) * 2 ** i, 0);

const log2 = (n: number) => Math.round(Math.log2(n));
/** hladin paralelní sčítačky: bloky (k + 1) + zahušťování (k + 1) + součet (1), n = 2ᵏ */
export const parallelDepth = (n: number) => 2 * log2(n) + 3;
/** hladin školní sčítačky: krabička Σᵢ čeká na přenos z krabičky i − 1 */
export const schoolDepth = (n: number) => n;

// ---------- výpočet ----------

/**
 * Chování kanonických bloků po hladinách: `levels[j][b]` = blok velikosti 2ʲ přes řády
 * [b·2ʲ, (b + 1)·2ʲ). n musí být mocnina dvou.
 */
export function blockLevels(
  x: readonly Bit[],
  y: readonly Bit[],
): Behavior[][] {
  const levels: Behavior[][] = [x.map((xi, i) => bitBlock(xi, y[i]))];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next: Behavior[] = [];
    for (let b = 0; b < prev.length / 2; b++)
      next.push(compose(prev[2 * b + 1], prev[2 * b]));
    levels.push(next);
  }
  return levels;
}

/** jeden přenos zahušťování: c[to] = blok (level, block) použitý na c[from] */
export interface CarryMove {
  to: number;
  from: number;
  level: number;
  block: number;
}

/**
 * Přenosy zahušťováním (s. 389): krok 0 zná c₀ = 0 a cₙ = [0, n)(c₀); v kroku s (bloky velikosti
 * b = n / 2ˢ) se současně pro každé i dělitelné 2b spočte c_{i+b} = [i, i + b)(cᵢ).
 */
export function carryPlan(
  x: readonly Bit[],
  y: readonly Bit[],
  levels = blockLevels(x, y),
): { c: Bit[]; rounds: CarryMove[][] } {
  const n = x.length;
  const k = levels.length - 1;
  const c: Bit[] = new Array<Bit>(n + 1).fill(0);
  c[0] = 0;
  c[n] = applyBlock(levels[k][0], 0);
  const rounds: CarryMove[][] = [
    [
      { to: n, from: 0, level: k, block: 0 },
      { to: 0, from: 0, level: -1, block: -1 },
    ],
  ];
  for (let s = 1; s <= k; s++) {
    const level = k - s;
    const b = 2 ** level;
    const round: CarryMove[] = [];
    for (let i = n - 2 * b; i >= 0; i -= 2 * b) {
      const move = { to: i + b, from: i, level, block: i / b };
      c[move.to] = applyBlock(levels[level][move.block], c[i]);
      round.push(move);
    }
    rounds.push(round);
  }
  return { c, rounds };
}

const xor3 = (a: Bit, b: Bit, c: Bit) => (a ^ b ^ c) as Bit;
const maj = (a: Bit, b: Bit, c: Bit) => ((a & b) | (a & c) | (b & c)) as Bit;

/** paralelní sčítání: z má n + 1 bitů (zₙ = cₙ), c = c₀ … cₙ */
export function parallelAdd(x: readonly Bit[], y: readonly Bit[]) {
  const { c } = carryPlan(x, y);
  const z = x.map((xi, i) => xor3(xi, y[i], c[i]));
  z.push(c[x.length]);
  return { z, c };
}

/** školní sčítání (s. 386–387): c₀ = 0, zᵢ = xᵢ ⊕ yᵢ ⊕ cᵢ, cᵢ₊₁ = majorita */
export function schoolAdd(x: readonly Bit[], y: readonly Bit[]) {
  const c: Bit[] = [0];
  const z: Bit[] = [];
  x.forEach((xi, i) => {
    z.push(xor3(xi, y[i], c[i]));
    c.push(maj(xi, y[i], c[i]));
  });
  z.push(c[x.length]);
  return { z, c };
}

// ---------- kroky ----------

export interface ParState {
  /** spočtené hladiny bloků (levels[j][b] jako blockLevels) */
  levels: Behavior[][];
  /** c₀ … cₙ, null = ještě neznámý */
  carries: (Bit | null)[];
  /** krok zahušťování, ve kterém přenos vznikl (řádek tabulky) */
  carryRound: (number | null)[];
  /** z₀ … zₙ */
  z: (Bit | null)[];
  /** právě spočtená hladina bloků */
  hotLevel: number | null;
  /** právě proběhlý krok zahušťování */
  hotRound: number | null;
  /** bloky použité v tomto kroku zahušťování (obrys) */
  used: { level: number; block: number }[];
  /** přenosy, ze kterých se v tomto kroku počítalo */
  sources: number[];
  /** buňky tabulky H ∘ D použité v tomto kroku („H|D“) */
  composed: string[];
  /** v tomto kroku se sčítá (řádek výstup) */
  outHot: boolean;
  /** hotových hladin */
  level: number;
  done: boolean;
}

export interface SchoolState {
  c: (Bit | null)[];
  z: (Bit | null)[];
  /** krabička Σᵢ, která právě počítá */
  hot: number | null;
  level: number;
  done: boolean;
}

export interface AdderState {
  n: number;
  x: Bit[];
  y: Bit[];
  par: ParState | null;
  school: SchoolState | null;
}

const SCHOOL_CODE = [
  "Školní sčítání (x, y: n bitů):",
  "  c₀ ← 0",
  "  Pro i = 0, …, n − 1:   // Σᵢ = hladina i + 1",
  "    zᵢ ← xᵢ ⊕ yᵢ ⊕ cᵢ",
  "    cᵢ₊₁ ← (xᵢ ∧ yᵢ) ∨ (xᵢ ∧ cᵢ) ∨ (yᵢ ∧ cᵢ)",
  "  zₙ ← cₙ",
];
const PAR_CODE = [
  "Paralelní sčítání (x, y: n = 2ᵏ bitů):",
  "  (1) Chování kanonických bloků:",
  "    blok [i] ← (xᵢ, yᵢ): 00 → 0, 11 → 1, jinak <",
  "    Pro j = 1, …, k: každý blok B velikosti 2ʲ současně:",
  "      B ← H ∘ D   (H = 0 ⇒ 0;  H = 1 ⇒ 1;  H = < ⇒ D)",
  "  (2) Přenosy zahušťováním:",
  "    c₀ ← 0;  cₙ ← blok [0, n) použitý na c₀",
  "    Pro s = 1, …, k (bloky velikosti b = n / 2ˢ):",
  "      pro i dělitelná 2b: c[i + b] ← blok [i, i + b) na cᵢ",
  "  (3) Současně pro všechna i: zᵢ ← xᵢ ⊕ yᵢ ⊕ cᵢ;  zₙ ← cₙ",
];
/** v režimu Obě je školní pseudokód nahoře, pod ním (za prázdným řádkem) paralelní */
const PAR_OFFSET = SCHOOL_CODE.length + 1;

export const ADDER_PSEUDOCODE: Record<AdderMode, string[]> = {
  par: PAR_CODE,
  school: SCHOOL_CODE,
  both: [...SCHOOL_CODE, "", ...PAR_CODE],
};

interface Frame<S> {
  state: S;
  line: number;
  message: string;
}

const sub = subscript;
const cName = (i: number) => `c${sub(i)}`;
const hladin = (n: number) => plural(n, "hladina", "hladiny", "hladin");
const B_NAME: Record<Behavior, string> = {
  "0": "0 (pohlcuje)",
  "1": "1 (vytváří)",
  "<": "< (kopíruje)",
};
const range = (level: number, block: number) =>
  `[${block * 2 ** level}, ${(block + 1) * 2 ** level})`;
/** „c₇ = 1, c₅ = 1, …“ – u n = 16 jen prvních pár */
function list(items: string[], max = 4) {
  return items.length > max
    ? `${items.slice(0, max).join(", ")}, … (celkem ${items.length})`
    : items.join(", ");
}

function parFrames(x: readonly Bit[], y: readonly Bit[]): Frame<ParState>[] {
  const n = x.length;
  const k = log2(n);
  const levels = blockLevels(x, y);
  const plan = carryPlan(x, y, levels);
  const out: Frame<ParState>[] = [];
  const st: ParState = {
    levels: [],
    carries: new Array<Bit | null>(n + 1).fill(null),
    carryRound: new Array<number | null>(n + 1).fill(null),
    z: new Array<Bit | null>(n + 1).fill(null),
    hotLevel: null,
    hotRound: null,
    used: [],
    sources: [],
    composed: [],
    outHot: false,
    level: 0,
    done: false,
  };
  const push = (line: number, message: string) =>
    out.push({ state: structuredClone(st), line, message });
  const reset = () => {
    st.hotLevel = null;
    st.hotRound = null;
    st.used = [];
    st.sources = [];
    st.composed = [];
    st.outHot = false;
  };

  push(
    0,
    `Vstup x = ${strOf(x)} (${valueOf(x)}), y = ${strOf(y)} (${valueOf(y)}), n = ${n} = 2${sup(k)}. Paralelní sčítačka má ${hladin(parallelDepth(n))}.`,
  );
  // (1) bloky
  for (let j = 0; j <= k; j++) {
    reset();
    st.levels.push(levels[j]);
    st.hotLevel = j;
    st.level++;
    if (j === 0) {
      const counts = (b: Behavior) => levels[0].filter((v) => v === b).length;
      push(
        2,
        `Hladina ${st.level}: bloky velikosti 1 – (0, 0) → 0, (1, 1) → 1, jinak < (${counts("0")}× 0, ${counts("1")}× 1, ${counts("<")}× <).`,
      );
    } else {
      const cells = new Set<string>();
      const parts = levels[j].map((v, b) => {
        const hi = levels[j - 1][2 * b + 1];
        const lo = levels[j - 1][2 * b];
        cells.add(`${hi}|${lo}`);
        return `${range(j, b)} = ${hi} ∘ ${lo} = ${v}`;
      });
      st.composed = [...cells];
      push(
        4,
        `Hladina ${st.level}: bloky velikosti ${2 ** j} skládáním dvojic: ${list([...parts].reverse())}.`,
      );
    }
  }
  // (2) přenosy
  plan.rounds.forEach((round, s) => {
    reset();
    st.hotRound = s;
    st.level++;
    for (const m of round) {
      st.carries[m.to] = plan.c[m.to];
      st.carryRound[m.to] = s;
      if (m.level >= 0) {
        st.used.push({ level: m.level, block: m.block });
        if (s > 0) st.sources.push(m.from);
      }
    }
    if (s === 0)
      push(
        6,
        `Hladina ${st.level}: c₀ = 0 a ${cName(n)} = blok [0, ${n}) = ${B_NAME[levels[k][0]]} použitý na c₀ = ${plan.c[n]}.`,
      );
    else
      push(
        8,
        `Hladina ${st.level}: zahušťování bloky velikosti ${2 ** (k - s)}: ${list(
          round.map(
            (m) =>
              `${cName(m.to)} = ${range(m.level, m.block)}(${cName(m.from)}) = ${plan.c[m.to]}`,
          ),
        )}.`,
      );
  });
  // (3) součet
  reset();
  st.level++;
  st.outHot = true;
  st.done = true;
  for (let i = 0; i < n; i++) st.z[i] = xor3(x[i], y[i], plan.c[i]);
  st.z[n] = plan.c[n];
  const zv = valueOf(st.z);
  push(
    9,
    `Hladina ${st.level}: zᵢ = xᵢ ⊕ yᵢ ⊕ cᵢ pro všechna i současně → z = ${strOf(st.z)}, tj. ${valueOf(x)} + ${valueOf(y)} = ${zv}${st.z[n] ? ` (přetečení: z${sub(n)} = c${sub(n)} = 1)` : ""}.`,
  );
  return out;
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (v: number) =>
  String(v)
    .split("")
    .map((d) => SUP[Number(d)])
    .join("");

function schoolFrames(
  x: readonly Bit[],
  y: readonly Bit[],
): Frame<SchoolState>[] {
  const n = x.length;
  const out: Frame<SchoolState>[] = [];
  const st: SchoolState = {
    c: new Array<Bit | null>(n + 1).fill(null),
    z: new Array<Bit | null>(n + 1).fill(null),
    hot: null,
    level: 0,
    done: false,
  };
  const push = (line: number, message: string) =>
    out.push({ state: structuredClone(st), line, message });
  st.c[0] = 0;
  push(
    1,
    `c₀ = 0. Krabička Σᵢ potřebuje přenos cᵢ z krabičky i − 1, takže krabičky počítají jedna po druhé – ${hladin(schoolDepth(n))}.`,
  );
  for (let i = 0; i < n; i++) {
    const c = st.c[i] as Bit;
    st.z[i] = xor3(x[i], y[i], c);
    st.c[i + 1] = maj(x[i], y[i], c);
    st.hot = i;
    st.level++;
    push(
      3,
      `Hladina ${st.level}, krabička Σ${sub(i)}: z${sub(i)} = ${x[i]} ⊕ ${y[i]} ⊕ ${c} = ${st.z[i]}, ${cName(i + 1)} = majorita(${x[i]}, ${y[i]}, ${c}) = ${st.c[i + 1]}.`,
    );
  }
  st.hot = null;
  st.z[n] = st.c[n];
  st.done = true;
  push(
    5,
    `z${sub(n)} = ${cName(n)} = ${st.z[n]} → z = ${strOf(st.z)}, tj. ${valueOf(x)} + ${valueOf(y)} = ${valueOf(st.z)}.`,
  );
  return out;
}

/** stav po skončení (zvýraznění pryč) – v režimu Obě pro sčítačku, která už doběhla */
function settledPar(s: ParState): ParState {
  return {
    ...s,
    hotLevel: null,
    hotRound: null,
    used: [],
    sources: [],
    composed: [],
    outHot: false,
  };
}

/**
 * Kroky sčítání: `par` = obr. 15.4 (úvod + 2·log n + 3 hladin), `school` = obr. 15.3 (c₀, n krabiček,
 * zₙ ← cₙ), `both` = obě sčítačky souběžně po hladinách (v kroku t hladina t obou) + shrnutí hloubek.
 */
export function* adderSteps(
  x: readonly Bit[],
  y: readonly Bit[],
  mode: AdderMode,
): StepGen<AdderState> {
  const n = x.length;
  const base = { n, x: [...x], y: [...y] };
  const step = (
    par: ParState | null,
    school: SchoolState | null,
    line: number,
    message: string,
  ): Step<AdderState> => ({
    state: { ...base, par, school },
    line,
    message,
  });
  if (mode === "par") {
    for (const f of parFrames(x, y))
      yield step(f.state, null, f.line, f.message);
    return;
  }
  const S = schoolFrames(x, y);
  if (mode === "school") {
    for (const f of S) yield step(null, f.state, f.line, f.message);
    return;
  }
  const P = parFrames(x, y);
  const pd = parallelDepth(n);
  const sd = schoolDepth(n);
  const T = Math.max(pd, sd);
  yield step(
    P[0].state,
    S[0].state,
    PAR_OFFSET,
    `Obě sčítačky současně, v každém kroku jedna hladina: x = ${strOf(x)} (${valueOf(x)}), y = ${strOf(y)} (${valueOf(y)}), n = ${n}. Školní potřebuje ${hladin(sd)}, paralelní ${hladin(pd)}.`,
  );
  for (let t = 1; t <= T; t++) {
    const p = t <= pd ? P[t] : null;
    const s = t <= sd ? S[t] : null;
    const parState = p ? p.state : settledPar(P[pd].state);
    const schoolState = s ? s.state : { ...S[sd].state, hot: null };
    const parts = [
      p
        ? `Paralelní – ${p.message.replace(/^Hladina \d+: /, "")}`
        : "Paralelní je hotová.",
      s
        ? `Školní – ${s.message.replace(/^Hladina \d+, /, "")}`
        : "Školní je hotová.",
    ];
    yield step(
      parState,
      schoolState,
      p ? PAR_OFFSET + p.line : s!.line,
      `Hladina ${t}: ${parts.join(" ")}`,
    );
  }
  const last = S[S.length - 1];
  const winner =
    pd < sd
      ? "paralelní je rychlejší"
      : pd === sd
        ? "obě stejně"
        : `pro tak malé n je ještě rychlejší školní (paralelní vyhraje od n = 16: 11 proti 16)`;
  yield step(
    settledPar(P[pd].state),
    last.state,
    last.line,
    `Hotovo: ${valueOf(x)} + ${valueOf(y)} = ${valueOf(last.state.z)}. Hloubka: školní ${hladin(sd)} (Θ(n)), paralelní ${hladin(pd)} (Θ(log n)) – ${winner}.`,
  );
}
