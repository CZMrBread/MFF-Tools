/**
 * Knuth–Morris–Pratt podle Průvodce 13.2 (str. 320–324): vyhledávací automat se zpětnou funkcí Z,
 * jeho konstrukce „sám na sebe“ (KmpKonstrukce) a spuštění na seno (KmpHledej). Čisté funkce
 * a generátor kroků; stránka (KmpPage.tsx) jen přehrává. Testy v kmp.test.ts a bookStrings.test.ts.
 *
 * Značení jako v knize: jehla ι délky J, seno σ délky S, stav s = délka prefixu jehly, indexy od 0.
 * Zarážka ι[J] je fiktivní znak ⊥ různý od všech znaků (str. 322) – v kódu se ι[s] porovnává jen
 * pro s < J, ⊥ se jen kreslí.
 */
import { snap, type StepGen } from "../../core/steps";
import { hitsWord } from "./pageModel";

/** fiktivní znak ι[J] (str. 322) */
export const ENDMARK = "⊥";
/** nejdelší jehla (automat i tabulka Z se vejdou na plátno) */
export const MAX_NEEDLE = 16;
/** nejdelší seno */
export const MAX_HAYSTACK = 40;

/* ------------------------------------------------------------------ pseudokód (str. 322 a 324) */

export const PC_KMP_SEARCH = [
  "Algoritmus KmpHledej (spuštění automatu na řetězec σ)",
  "  Vstup: Seno σ, zkonstruovaný automat",
  "  s ← 0",
  "  Pro znaky x ∈ σ postupně provádíme:",
  "    s ← KmpKrok(s, x)",
  "    Pokud s = J, ohlásíme výskyt.",
  "Procedura KmpKrok (jeden krok automatu)",
  "  Vstup: Jsme ve stavu s, přečetli jsme znak x",
  "  Dokud ι[s] ≠ x ∧ s ≠ 0: s ← Z[s].   // zpětné hrany",
  "  Pokud ι[s] = x, pak s ← s + 1.   // dopředná hrana",
  "  Výstup: Nový stav s",
];

export const PC_KMP_BUILD = [
  "Algoritmus KmpKonstrukce",
  "  Vstup: Jehla ι délky J",
  "  Z[0] ← nedefinováno, Z[1] ← 0",
  "  s ← 0",
  "  Pro i = 2, …, J:",
  "    s ← KmpKrok(s, ι[i − 1])",
  "    Z[i] ← s",
  "  Výstup: Pole zpětných hran Z",
  "Procedura KmpKrok (jeden krok automatu)",
  "  Vstup: Jsme ve stavu s, přečetli jsme znak x",
  "  Dokud ι[s] ≠ x ∧ s ≠ 0: s ← Z[s].   // zpětné hrany",
  "  Pokud ι[s] = x, pak s ← s + 1.   // dopředná hrana",
  "  Výstup: Nový stav s",
];

export type KmpPhase = "build" | "search";

export const pseudocodeForPhase = (phase: KmpPhase): string[] =>
  phase === "build" ? PC_KMP_BUILD : PC_KMP_SEARCH;

/** řádky pseudokódu, na které kroky ukazují */
const LINES = {
  build: { start: 2, read: 4, write: 6, done: 7, loop: 10, fwd: 11 },
  search: { start: 2, read: 3, hit: 5, loop: 8, fwd: 9 },
} as const;

/* ------------------------------------------------------------------ čisté funkce */

const chars = (s: string): string[] => [...s];

/** Zpětná funkce Z[0..J] (Z[0] = nedefinováno → null) přesně podle KmpKonstrukce. */
export function kmpTable(needle: string): (number | null)[] {
  const p = chars(needle);
  const J = p.length;
  const Z: (number | null)[] = [null];
  if (J === 0) return Z;
  Z[1] = 0;
  let s = 0;
  for (let i = 2; i <= J; i++) {
    const x = p[i - 1];
    while (p[s] !== x && s !== 0) s = Z[s] ?? 0;
    if (p[s] === x) s++;
    Z[i] = s;
  }
  return Z;
}

export interface KmpCount {
  /** dopředné hrany */
  fwd: number;
  /** zpětné hrany */
  back: number;
  /** porovnání ι[s] se čteným znakem (včetně zarážky ι[J]) */
  cmp: number;
}

/** Běh KmpHledej: stav po každém znaku sena, začátky výskytů a počítadla. */
export function kmpRun(
  needle: string,
  text: string,
): {
  states: number[];
  found: number[];
  count: KmpCount;
  Z: (number | null)[];
} {
  const p = chars(needle);
  const J = p.length;
  const Z = kmpTable(needle);
  const count: KmpCount = { fwd: 0, back: 0, cmp: 0 };
  const states: number[] = [];
  const found: number[] = [];
  const eq = (s: number, x: string) => s < J && p[s] === x;
  let s = 0;
  chars(text).forEach((x, k) => {
    count.cmp++;
    while (!eq(s, x) && s !== 0) {
      s = Z[s] ?? 0;
      count.back++;
      count.cmp++;
    }
    if (eq(s, x)) {
      s++;
      count.fwd++;
    }
    states.push(s);
    if (J > 0 && s === J) found.push(k - J + 1);
  });
  return { states, found, count, Z };
}

/** Výskyty hrubou silou (kontrola v testech). */
export function naiveFind(needle: string, text: string): number[] {
  const p = chars(needle);
  const t = chars(text);
  const out: number[] = [];
  if (!p.length) return out;
  for (let i = 0; i + p.length <= t.length; i++)
    if (p.every((c, j) => t[i + j] === c)) out.push(i);
  return out;
}

/** Počet porovnání znaků naivního algoritmu (každou pozici porovnává zleva do první neshody). */
export function naiveComparisons(needle: string, text: string): number {
  const p = chars(needle);
  const t = chars(text);
  let n = 0;
  for (let i = 0; i + p.length <= t.length; i++)
    for (let j = 0; j < p.length; j++) {
      n++;
      if (t[i + j] !== p[j]) break;
    }
  return n;
}

/* ------------------------------------------------------------------ vstup */

export interface Cleaned {
  value: string;
  /** co se se vstupem stalo (vynechané mezery, zkrácení); "" = nic */
  note: string;
}

function clean(text: string, max: number, what: string): Cleaned {
  const raw = String(text ?? "");
  const noSpace = raw.replace(/\s+/gu, "");
  const cs = chars(noSpace);
  const notes: string[] = [];
  if (noSpace !== "" && /\s/u.test(raw))
    notes.push(`Mezery ${what} vynechány.`);
  if (cs.length > max) notes.push(`Zkráceno na ${max} znaků.`);
  return { value: cs.slice(0, max).join(""), note: notes.join(" ") };
}

/** Jehla ι: bez bílých znaků, nejvýše MAX_NEEDLE znaků (velikost písmen i diakritika zůstávají). */
export const cleanNeedle = (text: string): Cleaned =>
  clean(text, MAX_NEEDLE, "z jehly");
/** Seno σ: bez bílých znaků, nejvýše MAX_HAYSTACK znaků. */
export const cleanHaystack = (text: string): Cleaned =>
  clean(text, MAX_HAYSTACK, "ze sena");

/* ------------------------------------------------------------------ kroky */

export interface KmpState {
  phase: KmpPhase;
  needle: string;
  /** čtený řetězec: při konstrukci jehla ι (čte se ι[1:]), při hledání seno σ */
  text: string;
  /** Z[0..J]; null = nedefinováno (Z[0]) nebo ještě nespočteno */
  Z: (number | null)[];
  /** Z[0..known] je hotové (při hledání J) – vyšší stavy ještě nemají zpětnou hranu */
  known: number;
  /** aktuální stav automatu */
  s: number;
  /** index právě čteného znaku v `text`; null = nic nečteme */
  k: number | null;
  /** posun řádku jehly pod čteným řetězcem (ι[0] stojí pod text[shift]) */
  shift: number;
  /** porovnání ι[i] se čteným znakem (i = J → zarážka ⊥) */
  cmp: { i: number; ok: boolean } | null;
  /** právě procházená hrana */
  edge: { from: number; to: number; kind: "fwd" | "back" } | null;
  /** začátky ohlášených výskytů */
  found: number[];
  /** při konstrukci právě zapsaný sloupec Z[i] */
  zCol: number | null;
  count: KmpCount;
}

export type KmpMode = "all" | "build" | "search";

/** jméno stavu s = prefix ι[:s] (ε pro 0) */
export function stateName(needle: string, s: number): string {
  return s === 0 ? "ε" : chars(needle).slice(0, s).join("");
}

const q = (c: string) => `„${c}“`;
const fmtZ = (Z: readonly (number | null)[]) =>
  "[" + Z.map((z) => (z === null ? "–" : String(z))).join(", ") + "]";

/**
 * Kroky KMP. `mode`: "all" = příklad z knihy – stavba automatu a hned hledání v jedné sadě kroků;
 * "build" = jen KmpKonstrukce; "search" = jen KmpHledej (automat se postaví bez kroků).
 * `from` (jen "search"): seno do pozice `from` se přečte bez kroků a krokuje se až od ní – navazující
 * čtení dalšího znaku (inkrementální algoritmus, str. 320).
 */
export function* kmpSteps(
  needle: string,
  text: string,
  mode: KmpMode = "all",
  from = 0,
): StepGen<KmpState> {
  const p = chars(needle);
  const J = p.length;
  const full = kmpTable(needle);
  const st: KmpState = {
    phase: mode === "search" ? "search" : "build",
    needle,
    text: mode === "search" ? text : needle,
    Z: mode === "search" ? [...full] : full.map((z, i) => (i <= 1 ? z : null)),
    known: mode === "search" ? J : Math.min(1, J),
    s: 0,
    k: null,
    shift: 0,
    cmp: null,
    edge: null,
    found: [],
    zCol: null,
    count: { fwd: 0, back: 0, cmp: 0 },
  };
  const eq = (s: number, x: string) => s < J && p[s] === x;
  const sym = (s: number) => (s < J ? q(p[s]) : ENDMARK);
  const name = (s: number) => `${s} (${stateName(needle, s)})`;

  /** jeden KmpKrok nad znakem text[k]; `lines` = řádky aktuálního pseudokódu */
  function* krok(
    x: string,
    lines: { read: number; loop: number; fwd: number },
    readMsg: string,
  ): StepGen<KmpState> {
    const k = st.k!;
    st.shift = k - st.s;
    st.edge = null;
    st.zCol = null;
    st.cmp = { i: st.s, ok: eq(st.s, x) };
    st.count.cmp++;
    const tail = (s: number) =>
      eq(s, x)
        ? `ι[${s}] = ${q(x)} = x ✓`
        : s === 0
          ? `ι[0] = ${sym(0)} ≠ x a s = 0 → zůstáváme v ε`
          : `ι[${s}] = ${sym(s)} ≠ x`;
    yield snap(
      st,
      lines.read,
      `${readMsg} ve stavu ${name(st.s)}: ${tail(st.s)}.`,
    );
    while (!eq(st.s, x) && st.s !== 0) {
      const from = st.s;
      const to = st.Z[from] ?? 0;
      st.s = to;
      st.shift = k - to;
      st.edge = { from, to, kind: "back" };
      st.cmp = { i: to, ok: eq(to, x) };
      st.count.back++;
      st.count.cmp++;
      yield snap(
        st,
        lines.loop,
        `Zpětná hrana ${from} → Z[${from}] = ${to} (${stateName(needle, to)}); ${tail(to)}.`,
      );
    }
    if (eq(st.s, x)) {
      const from = st.s;
      st.s = from + 1;
      st.edge = { from, to: from + 1, kind: "fwd" };
      st.count.fwd++;
      yield snap(
        st,
        lines.fwd,
        `Dopředná hrana ${from} → ${from + 1}: jsme ve stavu ${name(from + 1)}.`,
      );
    }
  }

  /* ---- KmpKonstrukce ---- */
  if (mode !== "search") {
    const B = LINES.build;
    if (J === 0) return;
    yield snap(
      st,
      B.start,
      `KmpKonstrukce pro ι = ${q(needle)} (J = ${J}): Z[0] nedefinováno, Z[1] ← 0, s ← 0. Automat teď hledá jehlu v ní samé – čte ι[1:].`,
    );
    for (let i = 2; i <= J; i++) {
      st.k = i - 1;
      yield* krok(
        p[i - 1],
        B,
        `i = ${i}: čteme x = ι[${i - 1}] = ${q(p[i - 1])}`,
      );
      st.Z[i] = st.s;
      st.known = i;
      st.zCol = i;
      st.edge = null;
      st.cmp = null;
      yield snap(
        st,
        B.write,
        `Z[${i}] ← ${st.s}: nejdelší vlastní sufix stavu ${stateName(needle, i)}, který je prefixem jehly, je ${stateName(needle, st.s)}.`,
      );
    }
    st.k = null;
    st.zCol = null;
    st.edge = null;
    st.cmp = null;
    yield snap(st, B.done, `Automat je postavený: Z = ${fmtZ(st.Z)}.`);
    if (mode === "build") return;
    // navazuje hledání ve stejné sadě kroků
    st.phase = "search";
    st.text = text;
    st.known = J;
    st.count = { fwd: 0, back: 0, cmp: 0 };
  }

  /* ---- KmpHledej ---- */
  const S = LINES.search;
  const t = chars(text);
  st.s = 0;
  st.k = null;
  st.shift = 0;
  st.edge = null;
  st.cmp = null;
  if (from > 0) {
    // navázání: prefix sena přečtený bez kroků
    const pre = kmpRun(needle, t.slice(0, from).join(""));
    st.s = pre.states[pre.states.length - 1] ?? 0;
    st.found = pre.found;
    st.count = { ...pre.count };
    st.shift = Math.max(0, from - st.s);
    yield snap(
      st,
      S.read,
      `Seno σ[0 : ${from}] je přečtené, automat je ve stavu ${name(st.s)}. Čteme další znak.`,
    );
  } else
    yield snap(
      st,
      S.start,
      mode === "all"
        ? `Automat je postavený (Z = ${fmtZ(st.Z)}). KmpHledej v seně σ = ${q(text)} (S = ${t.length}): s ← 0.`
        : `KmpHledej: automat pro ι = ${q(needle)} (Z = ${fmtZ(st.Z)}), seno σ = ${q(text)} (S = ${t.length}); s ← 0.`,
    );
  for (let k = from; k < t.length; k++) {
    st.k = k;
    yield* krok(t[k], S, `Čteme x = σ[${k}] = ${q(t[k])}`);
    if (J > 0 && st.s === J) {
      const at = k - J + 1;
      st.found.push(at);
      st.edge = null;
      st.cmp = null;
      yield snap(
        st,
        S.hit,
        `s = J = ${J} → ohlásíme výskyt na pozici ${at} (σ[${at} : ${k + 1}] = ι).`,
      );
    }
  }
  st.k = null;
  st.edge = null;
  st.cmp = null;
  const n = st.found.length;
  const where = n ? ` (${st.found.join(", ")})` : "";
  const what = hitsWord(n);
  yield snap(
    st,
    null,
    t.length === 0
      ? "Seno je prázdné – žádný výskyt."
      : `Hotovo: ${what}${where}. Dopředných hran ${st.count.fwd}, zpětných ${st.count.back} ≤ ${st.count.fwd} (lemma, str. 322), porovnání ${st.count.cmp}.`,
  );
}
