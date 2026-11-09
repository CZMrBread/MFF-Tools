import { formatNum } from "../../core/format";
import { parseIntStrict, parseNumberList } from "../../core/input";
import { rng, snap, type StepGen } from "../../core/steps";

export type Strategy = "LRU" | "FIFO" | "OPT";
export const STRATS: Strategy[] = ["OPT", "LRU", "FIFO"];

export interface Cache {
  slots: (number | null)[];
  /** pro LRU: čas posledního použití; FIFO: čas načtení */
  stamp: number[];
  misses: number;
  /** co se právě stalo: zásah / výpadek / vyhozená stránka */
  last?: { hit: boolean; slot: number; evicted: number | null };
}
export interface PagingState {
  seq: number[];
  i: number;
  P: number;
  caches: Record<Strategy, Cache>;
  vars: Record<string, string | number>;
}

/** Řádky pseudokódu, na které se generátor odkazuje. */
export const LINE_HIT = 1;
export const LINE_FREE_SLOT = 2;
export const LINE_EVICT = 3;

export const PC = [
  "Pro každý požadavek na stránku x:",
  "  Je-li x v cache: zásah (hit), nic nenačítáme (LRU: aktualizujeme čas použití).",
  "  Jinak výpadek (miss): je-li volný slot, načteme x do něj.",
  "  Jinak vybereme oběť podle strategie:",
  "    OPT  – stránku, která bude potřeba nejpozději (nebo nikdy)",
  "    LRU  – stránku nejdéle nepoužitou",
  "    FIFO – stránku nejdéle v cache",
  "  Oběť nahradíme x.",
  "",
  "Sleator–Tarjan 1985: pro P_LRU > P_OPT je",
  "  F_LRU ≤ P_LRU/(P_LRU − P_OPT) · F_OPT + P_OPT",
];

export const MIN_P = 1;
export const MAX_P = 8;
/** Delší posloupnost by se na plátno nevešla – zbytek se ořízne a krok to oznámí. */
export const MAX_REQUESTS = 60;

/** Počet slotů: celé číslo MIN_P–MAX_P (desetinná část se zahodí, nesmysl → 1). */
export const normP = (v: number) =>
  Math.max(MIN_P, Math.min(MAX_P, Math.trunc(v) || MIN_P));

const plural = (n: number, one: string, few: string, many: string) =>
  `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
const slots = (n: number) => plural(n, "slot", "sloty", "slotů");
const requests = (n: number) =>
  plural(n, "požadavek", "požadavky", "požadavků");
/** číslo stránky je identifikátor – jen skutečné minus, jinak tak, jak ho uživatel zadal */
const fmt = (x: number) => String(x).replace("-", "−");

/* ---------- vstup ---------- */

/** Výchozí příklad: Béládyho posloupnost – FIFO na ní má s P = 4 víc výpadků (10) než s P = 3 (9). */
export const DEFAULT_SEQ = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
export const DEFAULT_P = 3;
/** čísla stránek v poli požadavků */
export const PAGE_MIN = 0;
export const PAGE_MAX = 99;
/** pravidla pole požadavků na stránce (ListField) i parametru v adrese */
export const SEQ_RULES = {
  min: PAGE_MIN,
  max: PAGE_MAX,
  maxCount: MAX_REQUESTS,
  integerOnly: true,
};

/** Posloupnost z parametru adresy (`?q=1,2,3`); nic platného → null (použije se výchozí příklad). */
export function readSeq(param: string | null): number[] | null {
  if (!param) return null;
  const r = parseNumberList(param, SEQ_RULES);
  return r.values.length ? r.values : null;
}

/** P z parametru adresy; neplatné → null. */
export const readP = (param: string | null): number | null =>
  param ? parseIntStrict(param, { min: MIN_P, max: MAX_P }).value : null;

/** Název běhu nad zprávou, např. „Simulace: P = 3, 12 požadavků“. */
export const runTitle = (P: number, n: number) =>
  `Simulace: P = ${normP(P)}, ${requests(Math.min(n, MAX_REQUESTS))}`;

export interface ParsedRequests {
  /** platná čísla stránek (neoříznutá – ořez na MAX_REQUESTS dělá a hlásí simulace) */
  seq: number[];
  /** tokeny, které nejsou čísla zapsaná číslicemi (např. „a“, „x1“, „1e2“) */
  ignored: string[];
}

/** Posloupnost požadavků z textu: čísla oddělená mezerami, čárkami nebo středníky. */
export function parseRequests(text: string): ParsedRequests {
  const seq: number[] = [];
  const ignored: string[] = [];
  for (const t of String(text).split(/[\s,;]+/)) {
    if (!t) continue;
    if (/^[+-]?\d+(\.\d+)?$/.test(t) && Number.isFinite(Number(t)))
      seq.push(Number(t) + 0);
    else ignored.push(t);
  }
  return { seq, ignored };
}

/** Co se má pustit po kliknutí: normalizované P, platné požadavky a hlášky k tomu, co se upravilo. */
export function prepareRun(
  text: string,
  rawP: number,
): { P: number; seq: number[]; notes: string[] } {
  const P = normP(rawP);
  const { seq, ignored } = parseRequests(text);
  const notes: string[] = [];
  if (P !== rawP)
    notes.push(`P musí být celé číslo ${MIN_P}–${MAX_P} – použito P = ${P}.`);
  if (ignored.length) {
    const shown = ignored
      .slice(0, 5)
      .map((t) => (t.length > 12 ? t.slice(0, 12) + "…" : t));
    notes.push(
      `Ignorováno (nejsou to čísla stránek): ${shown.join(", ")}${ignored.length > 5 ? ` a ${ignored.length - 5} dalších` : ""}.`,
    );
  }
  if (seq.length > MAX_REQUESTS)
    notes.push(
      `Vstup má ${requests(seq.length)}, použito prvních ${MAX_REQUESTS}.`,
    );
  if (!seq.length)
    notes.push("Zadejte čísla stránek oddělená mezerami, např. 1 2 3 4 1 2 5.");
  return { P, seq, notes };
}

/** Zlá posloupnost pro LRU: cyklus P+1 stránek – po zaplnění cache je každý požadavek výpadek. */
export function badSequence(rawP: number): number[] {
  const P = normP(rawP);
  return Array.from(
    { length: Math.max(16, 3 * (P + 1)) },
    (_, i) => (i % (P + 1)) + 1,
  );
}

/** Náhodná posloupnost nad P+3 stránkami, aby docházelo k zásahům i k vyhazování. */
export function randomSequence(
  rawP: number,
  seed: number,
  length = 20,
): number[] {
  const P = normP(rawP);
  const r = rng(seed);
  return Array.from({ length }, () => 1 + Math.floor(r() * (P + 3)));
}

/* ---------- simulace ---------- */

export function* paging(input: number[], rawP: number): StepGen<PagingState> {
  // pojistky: P je vždy celé číslo 1–8, požadavky konečná čísla a nejvýše MAX_REQUESTS
  const P = normP(rawP);
  const valid = (Array.isArray(input) ? input : []).filter(
    (x) => typeof x === "number" && Number.isFinite(x),
  );
  const seq = valid.slice(0, MAX_REQUESTS);
  const mk = (): Cache => ({
    slots: Array(P).fill(null),
    stamp: Array(P).fill(0),
    misses: 0,
  });
  const st: PagingState = {
    seq,
    i: -1,
    P,
    caches: { OPT: mk(), LRU: mk(), FIFO: mk() },
    vars: {},
  };
  const vars = () => {
    st.vars = {
      "výpadky OPT": st.caches.OPT.misses,
      "výpadky LRU": st.caches.LRU.misses,
      "výpadky FIFO": st.caches.FIFO.misses,
    };
  };
  vars();
  const notes: string[] = [];
  if (P !== rawP)
    notes.push(
      `P = ${fmt(rawP)} není celé číslo ${MIN_P}–${MAX_P}, použito P = ${P}.`,
    );
  if (valid.length > MAX_REQUESTS)
    notes.push(
      `Vstup má ${requests(valid.length)}, použito prvních ${MAX_REQUESTS}.`,
    );
  if (!seq.length) {
    yield snap(
      st,
      0,
      [
        "Posloupnost požadavků je prázdná – zadejte čísla stránek oddělená mezerami.",
        ...notes,
      ].join(" "),
    );
    st.i = 0;
    yield snap(st, null, "Hotovo – žádné požadavky, žádné výpadky.");
    return;
  }
  yield snap(
    st,
    0,
    [
      `Cache má ${slots(P)} (P = ${P}), posloupnost má ${requests(seq.length)}.`,
      ...notes,
    ].join(" "),
  );
  for (let i = 0; i < seq.length; i++) {
    const x = seq[i];
    st.i = i;
    const what: string[] = [];
    for (const s of STRATS) {
      const c = st.caches[s];
      const idx = c.slots.indexOf(x);
      if (idx >= 0) {
        c.last = { hit: true, slot: idx, evicted: null };
        if (s === "LRU") c.stamp[idx] = i + 1;
        what.push(`${s}: zásah`);
        continue;
      }
      c.misses++;
      let victim = c.slots.indexOf(null);
      let evicted: number | null = null;
      if (victim < 0) {
        if (s === "OPT") {
          // nejvzdálenější příští použití (stránka, která už nepřijde, má přednost)
          let best = 0;
          let bestNext = -1;
          c.slots.forEach((pg, k) => {
            let next = seq.indexOf(pg!, i + 1);
            if (next < 0) next = Infinity;
            if (next > bestNext) {
              bestNext = next;
              best = k;
            }
          });
          victim = best;
        } else {
          // LRU: nejmenší stamp = nejdéle nepoužitá; FIFO: nejmenší stamp = nejdéle načtená
          let best = 0;
          for (let k = 1; k < P; k++) if (c.stamp[k] < c.stamp[best]) best = k;
          victim = best;
        }
        evicted = c.slots[victim];
      }
      c.slots[victim] = x;
      c.stamp[victim] = i + 1;
      c.last = { hit: false, slot: victim, evicted };
      what.push(
        `${s}: výpadek${evicted !== null ? `, vyhodí ${fmt(evicted)}` : " (volný slot)"}`,
      );
    }
    vars();
    // jeden krok obslouží všechny tři strategie – řádek podle „nejdražšího“ děje
    const lasts = STRATS.map((s) => st.caches[s].last!);
    const line = lasts.some((l) => l.evicted !== null)
      ? LINE_EVICT
      : lasts.some((l) => !l.hit)
        ? LINE_FREE_SLOT
        : LINE_HIT;
    yield snap(
      st,
      line,
      `Požadavek ${i + 1}: stránka ${fmt(x)}. ${what.join(" · ")}.`,
    );
  }
  st.i = seq.length;
  for (const s of STRATS) delete st.caches[s].last;
  const o = st.caches.OPT.misses;
  const l = st.caches.LRU.misses;
  const f = st.caches.FIFO.misses;
  const ratio = o ? formatNum(l / o, 2) : "–";
  // věta Sleatora a Tarjana předpokládá P_LRU > P_OPT – tady mají všechny strategie stejné P, proto bez zvýraznění řádku
  yield snap(
    st,
    null,
    `Simulace hotová (P = ${P}, ${requests(seq.length)}): výpadky OPT ${o}, LRU ${l}, FIFO ${f}; LRU/OPT = ${ratio}. ` +
      "Všechny strategie tu mají stejné P, takže věta Sleatora a Tarjana (předpoklad P_LRU > P_OPT) se na tento běh nevztahuje.",
  );
}
