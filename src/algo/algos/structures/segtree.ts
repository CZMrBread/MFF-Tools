/**
 * Intervalový strom pro minima (Průvodce 4.5) – generátory kroků (bez UI).
 * S[1 … 2n−1], listy S[n … 2n−1], n mocnina dvojky; dotaz ⟨i,j⟩ znamená x_i … x_{j−1}.
 */
import { snap, type StepGen } from "../../core/steps";
import { failStep, ignoredList, inputNote, plural } from "./input";

export interface SegState {
  n: number;
  /** S[0] se nepoužívá; null = +∞ (doplněk do mocniny dvojky) */
  S: (number | null)[];
  marks: Record<number, string>;
  vars: Record<string, string | number>;
  /** podtržené listy = dotazovaný interval */
  queried: [number, number] | null;
}

/** nejvýše 16 listů (5 hladin) – víc se do stromu čitelně nevejde */
export const SEG_MAX = 16;

export const BUILD = [
  "Build(x_0 … x_{n−1}):",
  "  Listy S[n+k] ← x_k",
  "  Pro v = n−1, …, 1:",
  "    S[v] ← min(S[2v], S[2v+1])",
];
export const QUERY = [
  "IntCanon(v, ⟨a,b⟩, ⟨i,j⟩):   // dotaz ⟨i,j⟩ = x_i … x_{j−1}",
  "  Pokud a = i a b = j: nahlásíme vrchol v a skončíme.",
  "  s ← (a + b)/2   // střed",
  "  Pokud j ≤ s: IntCanon(2v, ⟨a,s⟩, ⟨i,j⟩)   // vlevo",
  "  Jinak je-li i ≥ s: IntCanon(2v+1, ⟨s,b⟩, ⟨i,j⟩)   // vpravo",
  "  Jinak:   // dotaz přes střed",
  "    IntCanon(2v, ⟨a,s⟩, ⟨i,s⟩)",
  "    IntCanon(2v+1, ⟨s,b⟩, ⟨s,j⟩)",
  "Výsledek = minimum z nahlášených (kanonických) vrcholů",
];
export const UPDATE = [
  "IntUpdate(i, x):",
  "  a ← n + i   // index listu",
  "  S[a] ← x",
  "  Dokud a > 1:",
  "    a ← ⌊a/2⌋",
  "    S[a] ← min(S[2a], S[2a+1])",
];

export const fmt = (v: number | null) => (v === null ? "∞" : String(v));
const mn = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.min(a, b);
const finite = (values: number[]) =>
  values.filter((v) => typeof v === "number" && Number.isFinite(v));
/** číslo do hlášky – i pro NaN (prázdné políčko) a nekonečno */
const shown = (v: number) => (Number.isFinite(v) ? String(v) : "?");

const SUB = "₀₁₂₃₄₅₆₇₈₉";
/** x s dolním indexem pro hlášky a popisky uzlů (prostý text, ne TeX): xs(12) = „x₁₂“ */
export const xs = (k: number) =>
  "x" + String(k).replace(/\d/g, (d) => SUB[Number(d)]);

/** nejmenší mocnina dvojky ≥ počet prvků (aspoň 1) */
function leafCount(len: number): number {
  let n = 1;
  while (n < len) n *= 2;
  return n;
}

/** Hotový strom bez animace (výchozí příklad). Bere nejvýše SEG_MAX konečných čísel. */
export function build(values: number[]): SegState {
  const used = finite(values).slice(0, SEG_MAX);
  const n = leafCount(used.length);
  const S: (number | null)[] = Array(2 * n).fill(null);
  for (let k = 0; k < n; k++) S[n + k] = k < used.length ? used[k] : null;
  for (let v = n - 1; v >= 1; v--) S[v] = mn(S[2 * v], S[2 * v + 1]);
  return { n, S, marks: {}, vars: {}, queried: null };
}

/** zruší zvýraznění z minulé operace (pro chybové hlášky – strom sám se nemění) */
function clear(st: SegState) {
  st.marks = {};
  st.vars = {};
  st.queried = null;
}

/**
 * values: čísla ze vstupu (NaN a nekonečna se přeskočí, nad SEG_MAX se ořízne – obojí se ohlásí),
 * ignored: tokeny vstupu, které nebyly číslo (jen pro hlášku). Bez jediného čísla se strom nemění.
 */
export function* buildSteps(
  st: SegState,
  values: number[],
  ignored: string[] = [],
): StepGen<SegState> {
  clear(st);
  const nums = finite(values);
  if (!nums.length) {
    const why = ignored.length
      ? ` (přeskočeno, není číslo: ${ignoredList(ignored)})`
      : "";
    yield failStep(
      st,
      `Ve vstupu není žádné číslo${why} – zadejte čísla oddělená mezerou nebo čárkou. Strom se nezměnil.`,
    );
    return;
  }
  const used = nums.slice(0, SEG_MAX);
  const n = leafCount(used.length);
  st.n = n;
  st.S = Array(2 * n).fill(null);
  st.vars = { n };
  for (let k = 0; k < n; k++) st.S[n + k] = k < used.length ? used[k] : null;
  for (let k = 0; k < n; k++) st.marks[n + k] = "n-swap";
  const where =
    n === 1
      ? "Jediný prvek uložíme do listu S[1], který je zároveň kořenem"
      : `Prvky uložíme do listů S[${n} … ${2 * n - 1}]`;
  const pad =
    used.length < n
      ? `, chybějící doplníme +∞ (n zaokrouhlíme nahoru na mocninu dvojky ${n})`
      : "";
  yield snap(
    st,
    1,
    `${where}${pad}${inputNote(used.length, nums.length, ignored)}.`,
  );
  for (let v = n - 1; v >= 1; v--) {
    st.S[v] = mn(st.S[2 * v], st.S[2 * v + 1]);
    st.marks = {
      [v]: "n-swap",
      [2 * v]: "n-compare",
      [2 * v + 1]: "n-compare",
    };
    st.vars = { n, v };
    yield snap(
      st,
      3,
      `S[${v}] ← min(${fmt(st.S[2 * v])}, ${fmt(st.S[2 * v + 1])}) = ${fmt(st.S[v])}`,
    );
  }
  st.marks = {};
  st.vars = {};
  const leaves = n === 1 ? "nad jediným listem" : `nad ${n} listy`;
  yield snap(
    st,
    null,
    `Build: hotovo – strom ${leaves} postaven v čase O(n), minimum celé posloupnosti je ${fmt(st.S[1])}.`,
  );
}

/** Dotaz na minimum z x_i … x_{j−1}. Neplatné meze (necelé, i ≥ j, mimo ⟨0, n⟩) se neopravují – ohlásí se. */
export function* querySteps(
  st: SegState,
  i: number,
  j: number,
): StepGen<SegState> {
  clear(st);
  const n = st.n;
  if (!Number.isInteger(i) || !Number.isInteger(j)) {
    yield failStep(
      st,
      `Meze dotazu musí být celá čísla (zadáno i = ${shown(i)}, j = ${shown(j)}).`,
    );
    return;
  }
  if (i >= j) {
    yield failStep(
      st,
      `Interval ⟨${i}, ${j}⟩ je prázdný – dotaz ⟨i, j⟩ znamená xᵢ … xⱼ₋₁, musí platit i < j.`,
    );
    return;
  }
  if (i < 0 || j > n) {
    yield failStep(
      st,
      `Dotaz ⟨${i}, ${j}⟩ sahá mimo posloupnost ${xs(0)} … ${xs(n - 1)} – musí platit 0 ≤ i < j ≤ ${n}.`,
    );
    return;
  }
  st.queried = [i, j];
  const reported: number[] = [];
  st.vars = { i, j, výsledek: "—" };
  yield snap(
    st,
    0,
    `Dotaz na minimum z ${xs(i)} … ${xs(j - 1)}, tj. interval ⟨${i}, ${j}⟩. Začínáme v kořeni.`,
  );

  function* rec(
    v: number,
    a: number,
    b: number,
    qi: number,
    qj: number,
  ): StepGen<SegState> {
    st.marks[v] = "n-active";
    st.vars.v = v;
    yield snap(
      st,
      0,
      `IntCanon(${v}, ⟨${a},${b}⟩, ⟨${qi},${qj}⟩) – vrchol v = ${v} ⟨${a},${b}⟩`,
    );
    if (a === qi && b === qj) {
      st.marks[v] = "n-min";
      reported.push(v);
      st.vars.výsledek = fmt(
        reported.reduce<number | null>((m, r) => mn(m, st.S[r]), null),
      );
      yield snap(
        st,
        1,
        `Vrchol v = ${v} ⟨${a},${b}⟩ pokrývá dotaz přesně – nahlásíme ho (minimum ${fmt(st.S[v])}).`,
      );
      return;
    }
    const s = (a + b) / 2;
    st.vars.s = s;
    yield snap(st, 2, `Střed s = ${s}.`);
    if (qj <= s) {
      yield snap(st, 3, "Dotaz leží celý vlevo.");
      yield* rec(2 * v, a, s, qi, qj);
    } else if (qi >= s) {
      yield snap(st, 4, "Dotaz leží celý vpravo.");
      yield* rec(2 * v + 1, s, b, qi, qj);
    } else {
      yield snap(
        st,
        5,
        `Dotaz prochází přes střed – rozdělíme na ⟨${qi},${s}⟩ a ⟨${s},${qj}⟩.`,
      );
      yield* rec(2 * v, a, s, qi, s);
      yield* rec(2 * v + 1, s, b, s, qj);
    }
    st.marks[v] = "n-visited";
  }
  yield* rec(1, 0, n, i, j);
  for (const r of reported) st.marks[r] = "n-min";
  delete st.vars.v;
  delete st.vars.s;
  // lemma z Průvodce: nejvýše 2 log₂ n kanonických intervalů (pro n = 1 je to jediný vrchol)
  const bound =
    n > 1 ? ` (nejvýše 2 log₂ n = ${2 * Math.round(Math.log2(n))})` : "";
  const parts = plural(
    reported.length,
    "kanonický interval",
    "kanonické intervaly",
    "kanonických intervalů",
  );
  yield snap(
    st,
    8,
    `Min⟨${i}, ${j}⟩: rozklad na ${parts}${bound}. Minimum = ${st.vars.výsledek}.`,
  );
}

/** x_i ← x. Index musí být celé číslo 0 … n−1 (i doplňkové listy +∞ jsou prvky posloupnosti), x konečné číslo. */
export function* updateSteps(
  st: SegState,
  i: number,
  x: number,
): StepGen<SegState> {
  clear(st);
  const n = st.n;
  if (!Number.isInteger(i) || i < 0 || i >= n) {
    const why = Number.isInteger(i)
      ? `Prvek ${xs(i)} neexistuje`
      : "Index i musí být celé číslo";
    yield failStep(
      st,
      `${why} – posloupnost má prvky ${xs(0)} … ${xs(n - 1)}.`,
    );
    return;
  }
  if (typeof x !== "number" || !Number.isFinite(x)) {
    yield failStep(st, "Nová hodnota x není číslo – změnu nelze provést.");
    return;
  }
  let a = n + i;
  st.vars = { i, x, a };
  st.marks[a] = "n-active";
  yield snap(st, 1, `List prvku ${xs(i)} má index ${a}.`);
  st.S[a] = x;
  st.marks[a] = "n-swap";
  yield snap(st, 2, `S[${a}] ← ${x}`);
  while (a > 1) {
    a = Math.floor(a / 2);
    st.vars.a = a;
    st.S[a] = mn(st.S[2 * a], st.S[2 * a + 1]);
    st.marks[a] = "n-swap";
    yield snap(
      st,
      5,
      `S[${a}] ← min(${fmt(st.S[2 * a])}, ${fmt(st.S[2 * a + 1])}) = ${fmt(st.S[a])}`,
    );
  }
  const done =
    n === 1
      ? "list je zároveň kořenem, není co přepočítávat"
      : `přepočítali jsme ${plural(Math.round(Math.log2(n)), "vrchol", "vrcholy", "vrcholů")} na cestě do kořene, O(log n)`;
  yield snap(
    st,
    null,
    `IntUpdate(${i}, ${x}): hotovo – ${done}. Minimum celé posloupnosti je ${fmt(st.S[1])}.`,
  );
}
