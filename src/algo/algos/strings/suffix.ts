import {
  materialize,
  rng,
  snap,
  type Step,
  type StepGen,
} from "../../core/steps";

/**
 * Sufixové pole podle přednášky (L05): n = |α|, pracujeme se slovem α$ ($ je nejmenší znak),
 * sufixů je n + 1 a pole X, R mají indexy 0…n. R_k[i] = počet pozic j s α[j:j+k] < α[i:i+k],
 * takže výsledné R je inverze X (X[R[i]] = i).
 */
export interface SAState {
  s: string; // včetně $
  /** sloupce R_k */
  rounds: { k: number; R: number[] }[];
  /** dvojice (R_k[i], R_k[i+k]) právě tříděné v kole k; druhá složka −1 = mimo řetězec */
  pairs: { k: number; list: [number, number][] } | null;
  /** pořadí sufixů (X) – po dokončení */
  X: number[] | null;
  L: number[] | null;
  /** zvýraznění řádků podle pozice sufixu i */
  rowMarks: Record<number, string>;
  /** zvýrazněné sloupce (k) */
  colMark: number | null;
  /** zobrazit tabulku seřazenou podle X */
  sortedView: boolean;
  /** pro Kasai / hledání: společný prefix délky */
  cmp?: { i: number; j: number; len: number };
  vars: Record<string, string | number>;
}

export const PC_BUILD = [
  "Zdvojování (n = |α|, pracujeme s α$, sufixů je n + 1):",
  "  R₁[i] ← počet znaků menších než α[i]   // $ je nejmenší",
  "  k ← 1",
  "  Dokud k < n a některá pořadí v R_k jsou shodná:",
  "    Každému sufixu i přiřadíme dvojici (R_k[i], R_k[i+k])   // mimo řetězec „–“ = −∞",
  "    Dvojice setřídíme → R_{2k}[i] = počet menších dvojic (shodné dvojice = shodné pořadí)",
  "    k ← 2k",
  "  X ← inverze R (X[R[i]] = i)",
];
export const PC_KASAI = [
  "Kasai (LCP pole: L[j] = LCP sufixů X[j] a X[j+1]):",
  "  l ← 0",
  "  Pro i = 0, …, n:   // sufixy podle pozice v α$ (n = |α|)",
  "    j ← R[i]; pokud j = n, pokračujeme   // poslední v pořadí nemá následníka",
  "    q ← X[j+1]   // lexikografický následník sufixu i",
  "    Dokud α[i+l] = α[q+l]: l ← l + 1",
  "    L[j] ← l",
  "    l ← max(l − 1, 0)   // klíčové: L[R[i+1]] ≥ L[R[i]] − 1",
];
export const PC_SEARCH = [
  "Hledání vzorku β (binární vyhledávání v X):",
  "  lo ← 0, hi ← n + 1   // kandidáti jsou řádky X[lo … hi−1]",
  "  Dokud lo < hi:",
  "    mid ← ⌊(lo+hi)/2⌋",
  "    Porovnáme β s prvními |β| znaky sufixu X[mid]",
  "    β větší → lo ← mid + 1, jinak hi ← mid",
  "  Výskyty tvoří souvislý úsek v X začínající na lo.",
];

/* ---------- vstup ---------- */

/** Delší řetězec by se do tabulky nevešel. */
export const MAX_ALPHA = 24;

export interface CleanAlpha {
  value: string;
  /** ze vstupu zmizel znak $ nebo mezera */
  removed: boolean;
  /** vstup byl delší než MAX_ALPHA znaků */
  truncated: boolean;
}

/** Řetězec α: bez znaku $ (ten si přidáváme sami jako zarážku) a bez bílých znaků, nejvýše MAX_ALPHA znaků. */
export function cleanAlpha(text: string): CleanAlpha {
  const raw = String(text ?? "");
  const stripped = raw.replace(/[$\s]/g, "");
  return {
    value: stripped.slice(0, MAX_ALPHA),
    removed: stripped.length !== raw.length,
    truncated: stripped.length > MAX_ALPHA,
  };
}

/** Vzorek β: stejná pravidla jako pro α (bez $ a bílých znaků). */
export const cleanBeta = (text: string) =>
  String(text ?? "").replace(/[$\s]/g, "");

/**
 * Co se má stát po kliknutí na Postavit / Kasai / Hledat: vždy se nejdřív převezme aktuální text z pole α,
 * aby operace nikdy neběžela nad dříve postaveným (jiným) řetězcem. alpha = null → není co postavit.
 * announceRebuild: operace navazuje na hotové pole (Kasai, hledání) – změnu řetězce oznámíme.
 */
export function commitAlpha(
  text: string,
  applied: string,
  announceRebuild = false,
): { alpha: string | null; note: string } {
  const c = cleanAlpha(text);
  if (!c.value)
    return {
      alpha: null,
      note: "Zadejte neprázdný řetězec α (znak $ a mezery se nepočítají).",
    };
  const notes: string[] = [];
  if (c.removed)
    notes.push(
      "Znak $ a mezery jsme z α odstranili ($ se doplňuje automaticky).",
    );
  if (c.truncated)
    notes.push(`Řetězec α jsme zkrátili na prvních ${MAX_ALPHA} znaků.`);
  if (announceRebuild && c.value !== applied)
    notes.push(
      `Řetězec α se změnil – sufixové pole jsme nejdřív postavili znovu pro „${c.value}“.`,
    );
  return { alpha: c.value, note: notes.join(" ") };
}

/* ---------- pomocné ---------- */

const SUB = "₀₁₂₃₄₅₆₇₈₉";
/** dolní index: R₁, R₂, R₁₆ */
export const sub = (k: number) =>
  String(k).replace(/\d/g, (d) => SUB[Number(d)]);

/** pořadí znaků: $ je nejmenší, jinak podle kódu znaku (stejně jako porovnávání řetězců při hledání) */
const charLess = (a: string, b: string) =>
  a !== b && (a === "$" || (b !== "$" && a < b));

/** „po 1 kole“, „po 3 kolech“ */
const rounds = (k: number) => `${k} ${k === 1 ? "kole" : "kolech"}`;

/** krok, který jen oznamuje, že se operace neprovedla */
const failStep = (
  st: SAState,
  line: number | null,
  message: string,
): Step<SAState> => ({ ...snap(st, line, message), error: true });

const emptyState = (s: string): SAState => ({
  s,
  rounds: [],
  pairs: null,
  X: null,
  L: null,
  rowMarks: {},
  colMark: null,
  sortedView: false,
  vars: {},
});

/* ---------- stavba zdvojováním ---------- */

export function* build(input: string): StepGen<SAState> {
  const alpha = cleanAlpha(input).value;
  const s = alpha + "$";
  const n = alpha.length;
  const m = n + 1; // počet sufixů
  const st = emptyState(s);
  yield snap(
    st,
    0,
    `Řetězec „${alpha}“ doplníme o $ (nejmenší znak): n = ${n}, sufixů včetně prázdného je n + 1 = ${m} (pořadí 0…${n}).`,
  );

  // R₁[i] = počet znaků menších než α[i]
  const cs = s.split("");
  const chars = [...new Set(cs)].sort((a, b) => (charLess(a, b) ? -1 : 1));
  let R = cs.map((c) => cs.filter((d) => charLess(d, c)).length);
  let distinct = new Set(R).size;
  let k = 1;
  st.rounds.push({ k, R });
  st.colMark = k;
  st.vars = { k, n, "různých pořadí": distinct };
  yield snap(
    st,
    1,
    `R₁[i] = počet znaků menších než α[i] (${chars.join(" < ")}); stejné znaky mají stejné pořadí.`,
  );

  // pro k ≥ n jsou k-prefixy všech sufixů α$ různé, takže cyklus skončí nejpozději tam (k < m je jen pojistka)
  while (distinct < m && k < m) {
    st.pairs = null;
    st.colMark = k;
    st.vars = { k, n, "různých pořadí": distinct };
    yield snap(
      st,
      3,
      `k = ${k} < n = ${n} a v R${sub(k)} jsou shodná pořadí (různých hodnot ${distinct}, sufixů ${m}) → zdvojíme.`,
    );

    const cur = R;
    const pairs = cur.map((r, i): [number, number] => [
      r,
      i + k < m ? cur[i + k] : -1,
    ]);
    st.pairs = { k, list: pairs };
    yield snap(
      st,
      4,
      `Dvojice (R${sub(k)}[i], R${sub(k)}[i+${k}]) popisují začátek sufixu i délky ${2 * k}; druhá složka mimo řetězec je „–“ (menší než každé pořadí).`,
    );

    // R_2k[i] = počet menších dvojic = index prvního výskytu dvojice v setříděném pořadí
    const order = pairs
      .map((_, i) => i)
      .sort(
        (a, b) =>
          pairs[a][0] - pairs[b][0] || pairs[a][1] - pairs[b][1] || a - b,
      );
    const R2 = new Array<number>(m).fill(0);
    let rank = 0;
    distinct = 0;
    order.forEach((i, idx) => {
      const prev = idx > 0 ? pairs[order[idx - 1]] : null;
      if (!prev || prev[0] !== pairs[i][0] || prev[1] !== pairs[i][1]) {
        rank = idx;
        distinct++;
      }
      R2[i] = rank;
    });
    k *= 2;
    R = R2;
    st.rounds.push({ k, R });
    st.colMark = k;
    st.vars = { k, n, "různých pořadí": distinct };
    yield snap(
      st,
      5,
      `Dvojice setřídíme: R${sub(k)}[i] = počet menších dvojic, shodné dvojice dostanou shodné pořadí (různých hodnot ${distinct}, sufixů ${m}).`,
    );
  }

  st.pairs = null;
  st.colMark = k;
  st.vars = { k, n, "různých pořadí": distinct };
  yield snap(
    st,
    3,
    k < n
      ? `V R${sub(k)} jsou všechna pořadí různá → R${sub(k)} = R, končíme. (Další zdvojování až do k ≥ n by už nic nezměnilo.)`
      : `V R${sub(k)} jsou všechna pořadí různá → R${sub(k)} = R, končíme.`,
  );

  // X = inverze R; řazení podle R dává totéž a nerozbije se ani při shodných pořadích
  const X = R.map((_, i) => i).sort((a, b) => R[a] - R[b] || a - b);
  st.X = X;
  st.sortedView = true;
  st.colMark = null;
  yield snap(
    st,
    7,
    "X = inverze R (X[R[i]] = i): sufixy seřazené lexikograficky. Tabulka je teď seřazená podle X, sloupec j je pořadí R[i].",
  );
  const r = st.rounds.length - 1;
  st.vars = { n, "kol zdvojování": r };
  const how =
    r === 0
      ? "zdvojovat nebylo potřeba – pořadí se liší už v prvním znaku"
      : `hotovo po ${rounds(r)} zdvojování`;
  yield snap(
    st,
    null,
    `Sufixové pole pro „${alpha}“: X = (${X.join(", ")}); ${how}.`,
  );
}

/* ---------- LCP pole (Kasai) ---------- */

export function* kasai(st: SAState): StepGen<SAState> {
  const s = st.s;
  const m = s.length; // počet sufixů = n + 1
  st.rowMarks = {};
  st.cmp = undefined;
  st.pairs = null;
  st.colMark = null;
  if (!st.X) {
    yield failStep(st, null, "Nejdřív postavte sufixové pole X.");
    return;
  }
  const X = st.X;
  const Rk = new Array<number>(m);
  X.forEach((i, j) => (Rk[i] = j));
  const L = new Array<number>(m - 1).fill(-1);
  st.L = L;
  st.sortedView = true;
  let l = 0;
  st.vars = { l };
  yield snap(
    st,
    1,
    "l = 0; projdeme sufixy podle pozice v řetězci, ne podle pořadí.",
  );
  for (let i = 0; i < m; i++) {
    const j = Rk[i];
    st.rowMarks = { [i]: "row-active" };
    st.cmp = undefined;
    if (j === m - 1) {
      st.vars = { i, j, l };
      // tady je l vždy 0: kdyby se sufix i shodoval s něčím větším, nebyl by poslední
      yield snap(
        st,
        3,
        `Sufix ${i} („${s.slice(i)}“) je v pořadí poslední (j = n = ${m - 1}) – nemá následníka.`,
      );
      continue;
    }
    const q = X[j + 1];
    st.rowMarks[q] = "row-compare";
    st.vars = { i, j, q, l };
    yield snap(
      st,
      4,
      `Sufix ${i} („${s.slice(i)}“) má pořadí j = ${j}, jeho následník je sufix q = ${q} („${s.slice(q)}“). ${l > 0 ? `Z minulého kroku víme, že mají společný prefix délky aspoň l = ${l} – porovnáváme až za ním.` : "Porovnáváme od začátku (l = 0)."}`,
    );
    while (i + l < m && q + l < m && s[i + l] === s[q + l]) l++;
    L[j] = l;
    st.cmp = { i, j, len: l };
    st.vars = { i, j, q, l };
    yield snap(
      st,
      6,
      `Společný prefix má délku ${l} → L[${j}] = ${l}. Pro další sufix začneme od l = max(l − 1, 0) = ${Math.max(l - 1, 0)}.`,
    );
    l = Math.max(l - 1, 0);
  }
  st.rowMarks = {};
  st.cmp = undefined;
  st.vars = { "max L": L.length ? Math.max(...L) : 0 };
  yield snap(
    st,
    null,
    `LCP pole pro „${s.slice(0, -1)}“: L = (${L.join(", ")}). Čas O(n): l klesne nejvýše o 1 za krok, takže dohromady vzroste nejvýše 2n-krát.`,
  );
}

/* ---------- hledání vzorku ---------- */

export function* search(st: SAState, pattern: string): StepGen<SAState> {
  const beta = cleanBeta(pattern);
  st.rowMarks = {};
  st.cmp = undefined;
  st.pairs = null;
  st.colMark = null;
  if (!st.X) {
    yield failStep(st, null, "Nejdřív postavte sufixové pole X.");
    return;
  }
  const s = st.s;
  // prefixy bereme z textu BEZ $: kratší vlastní prefix je menší – stejné pořadí jako při stavbě ($ nejmenší)
  const text = s.slice(0, -1);
  const X = st.X;
  const m = s.length; // počet sufixů = n + 1
  st.sortedView = true;
  if (!beta) {
    st.vars = {};
    yield failStep(
      st,
      0,
      "Vzorek β je prázdný – zadejte aspoň jeden znak (znak $ a mezery se nepočítají).",
    );
    return;
  }
  if (beta.length > st.s.length - 1) {
    st.vars = {};
    yield failStep(
      st,
      0,
      `Vzorek β má ${beta.length} znaků, řetězec α jen ${st.s.length - 1} – nemůže se v něm vyskytovat.`,
    );
    return;
  }
  const show = (t: string) => (t ? `„${t}“` : "ε");
  const markRange = (lo: number, hi: number) => {
    st.rowMarks = {};
    for (let j = lo; j < hi; j++) st.rowMarks[X[j]] = "row-range";
  };
  let lo = 0;
  let hi = m;
  markRange(lo, hi);
  st.vars = { β: beta, lo, hi };
  yield snap(
    st,
    1,
    `Hledáme „${beta}“ binárním vyhledáváním mezi ${m} seřazenými sufixy (lo = 0, hi = n + 1 = ${m}).`,
  );
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const pre = text.slice(X[mid], X[mid] + beta.length);
    markRange(lo, hi);
    st.rowMarks[X[mid]] = "row-active";
    st.vars = { β: beta, lo, hi, mid };
    yield snap(
      st,
      4,
      `mid = ${mid}: sufix ${X[mid]} („${s.slice(X[mid])}“). Jeho prvních |β| = ${beta.length} znaků (bez $): ${show(pre)} – porovnáme s β.`,
    );
    const less = pre < beta;
    if (less) lo = mid + 1;
    else hi = mid;
    markRange(lo, hi);
    st.rowMarks[X[mid]] = "row-active";
    st.vars = { β: beta, lo, hi, mid };
    yield snap(
      st,
      5,
      less
        ? `${show(pre)} < „${beta}“ → β je větší, lo ← mid + 1 = ${lo}.`
        : `${show(pre)} ≥ „${beta}“ → hi ← mid = ${hi} (řádek mid může být první výskyt).`,
    );
  }
  // konec úseku
  let end = lo;
  while (end < m && text.slice(X[end], X[end] + beta.length) === beta) end++;
  st.rowMarks = {};
  for (let j = lo; j < end; j++) st.rowMarks[X[j]] = "row-found";
  const occ = X.slice(lo, end).sort((a, b) => a - b);
  st.vars = { β: beta, lo, výskytů: end - lo };
  yield snap(
    st,
    6,
    end > lo
      ? `lo = hi = ${lo}: výskyty tvoří souvislý úsek řádků od lo – sufixy na řádcích ${lo}${end - lo > 1 ? `…${end - 1}` : ""} začínají β.`
      : `lo = hi = ${lo}: ${lo < m ? `sufix na řádku lo = ${lo} β nezačíná` : "všechny sufixy jsou menší než β"}, úsek výskytů je prázdný.`,
  );
  // závěr: výsledek hledání
  yield snap(
    st,
    null,
    end > lo
      ? `Hledání „${beta}“: nalezeno ${end - lo}× – ${occ.length === 1 ? "na pozici" : "na pozicích"} ${occ.join(", ")}. Binární vyhledávání stojí O(|β| log n).`
      : `Hledání „${beta}“: vzorek se v řetězci nevyskytuje.`,
  );
}

/* ---------- kroky pro stránku ---------- */

export type Phase =
  { kind: "build" } | { kind: "kasai" } | { kind: "search"; beta: string };

const lastState = <S>(steps: Step<S>[]) =>
  structuredClone(steps[steps.length - 1].state);

/**
 * Kroky zvolené fáze; Kasai a hledání navazují na koncový stav stavby.
 * withLcp: hledání navazuje na stav po Kasai, takže sloupec L v tabulce zůstane (Kasai už student viděl).
 */
export function suffixSteps(
  alpha: string,
  phase: Phase,
  withLcp = false,
): Step<SAState>[] {
  const b = materialize(build(alpha));
  if (phase.kind === "build") return b;
  if (phase.kind === "kasai") return materialize(kasai(lastState(b)));
  const base = withLcp
    ? lastState(materialize(kasai(lastState(b))))
    : lastState(b);
  return materialize(search(base, phase.beta));
}

export const pseudocodeFor = (phase: Phase) =>
  phase.kind === "build"
    ? PC_BUILD
    : phase.kind === "kasai"
      ? PC_KASAI
      : PC_SEARCH;

/** Název operace nad zprávou. */
export function phaseTitle(alpha: string, phase: Phase): string {
  if (phase.kind === "build") return `Stavba X zdvojováním: α = „${alpha}“`;
  if (phase.kind === "kasai") return `LCP pole (Kasai): α = „${alpha}“`;
  return `Hledání vzorku β = „${cleanBeta(phase.beta)}“ v α = „${alpha}“`;
}

/** Náhodné slovo pro „Náhodný vstup“: 8–14 znaků nad malou abecedou, aby se opakovaly podřetězce. */
/** Náhodné slovo nad {a, b} nebo {a, b, c}; `length` = délka (jinak 8–14). */
export function randomAlpha(seed: number, length?: number): string {
  const r = rng(seed);
  const alphabet = r() < 0.5 ? "ab" : "abc";
  const free = 8 + Math.floor(r() * 7);
  const len =
    length === undefined
      ? free
      : Math.max(1, Math.min(MAX_ALPHA, Math.round(length)));
  return Array.from(
    { length: len },
    () => alphabet[Math.floor(r() * alphabet.length)],
  ).join("");
}

/** Vzorek, který se v α vyskytuje (podřetězec délky 2–3 od náhodné pozice) – ať hledání hned něco najde. */
export function patternFor(alpha: string, seed: number): string {
  if (alpha.length <= 2) return alpha;
  const r = rng(seed);
  const len = Math.min(alpha.length, 2 + Math.floor(r() * 2));
  const start = Math.floor(r() * (alpha.length - len + 1));
  return alpha.slice(start, start + len);
}
