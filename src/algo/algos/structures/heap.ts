/**
 * Binární minimová halda (Průvodce 4.2) – generátory kroků (bez UI).
 * Halda je v poli st.a (0-based), hlášky a pseudokód číslují vrcholy od 1 jako v Průvodci.
 */
import { snap, type StepGen } from "../../core/steps";
import type { Item, Mark } from "../sorting/types";
import { count, failStep, ignoredList, inputNote } from "./input";

export interface HeapState {
  a: Item[];
  marks: Record<number, Mark>;
  vars: Record<string, string | number>;
}

/** 5 plných hladin – víc se do stromu čitelně nevejde. Platí pro MakeHeap i Insert. */
export const HEAP_MAX = 31;

let nextId = 1;
const mk = (v: number): Item => ({ id: nextId++, v });

/** Stav haldy z hodnot, které UŽ jsou v haldovém pořadí (výchozí příklad, testy). */
export const heapOf = (values: number[]): HeapState => ({
  a: values.map(mk),
  marks: {},
  vars: {},
});

/** Halda postavená z libovolných hodnot bez animace (sdílený odkaz): stejný MakeHeap, jen se kroky nezobrazí. */
export function heapFrom(values: number[]): HeapState {
  const st = heapOf([]);
  for (const step of makeHeap(st, values)) void step;
  return st;
}

/** Klíče v pořadí pole (pro adresu a porovnání se vstupem). */
export const heapKeys = (st: HeapState) => st.a.map((it) => it.v);

const BUBBLE_UP = [
  "BubbleUp(i):",
  "  Dokud i > 1:",
  "    o ← ⌊i/2⌋   // otec",
  "    Je-li k(o) ≤ k(i), skončíme.",
  "    Prohodíme p(i) a p(o).",
  "    i ← o",
];
const BUBBLE_DOWN = [
  "BubbleDown(i):",
  "  Dokud 2i ≤ n:",
  "    s ← 2i; pokud s+1 ≤ n a k(s+1) < k(s): s ← s+1",
  "    Pokud k(i) < k(s), skončíme.",
  "    Prohodíme p(i) a p(s).",
  "    i ← s",
];

export const INSERT = [
  "HeapInsert(x):",
  "  n ← n + 1",
  "  p(n) ← x",
  "  BubbleUp(n)",
  "",
  ...BUBBLE_UP,
];
export const EXTRACT = [
  "HeapExtractMin:",
  "  r ← p(1)   // minimum",
  "  p(1) ← p(n); n ← n − 1",
  "  BubbleDown(1)",
  "  Vrátíme r.",
  "",
  ...BUBBLE_DOWN,
];
// MakeHeap má vlastní kopii těla BubbleDown – kroky bublání musí mít co zvýraznit
export const MAKE = [
  "MakeHeap(x_1 … x_n):",
  "  Prvky uložíme do pole v libovolném pořadí.",
  "  Pro i = ⌊n/2⌋, …, 1:",
  "    BubbleDown(i)",
  "",
  ...BUBBLE_DOWN,
];

/** index hlavičky pomocné procedury v daném pseudokódu (aby se čísla řádků nerozjela při úpravě textu) */
const lineOf = (code: string[], head: string) => code.indexOf(head);

/** base = řádek „BubbleUp(i):“ v zobrazeném pseudokódu */
function* bubbleUp(st: HeapState, i: number, base: number): StepGen<HeapState> {
  const a = st.a;
  const n = a.length;
  if (i === 0) {
    st.marks = { 0: "active" };
    yield snap(st, base + 1, "Nový prvek je kořen – není s čím ho porovnávat.");
    return;
  }
  while (i > 0) {
    const o = Math.floor((i - 1) / 2);
    st.marks = { [i]: "active", [o]: "compare" };
    st.vars = { n, i: i + 1, o: o + 1 };
    yield snap(
      st,
      base + 3,
      `Otec vrcholu ${i + 1} je ${o + 1}. Je k(o) = ${a[o].v} ≤ k(i) = ${a[i].v}?`,
    );
    if (a[o].v <= a[i].v) {
      yield snap(st, base + 3, "Ano – haldové uspořádání platí, končíme.");
      return;
    }
    [a[i], a[o]] = [a[o], a[i]];
    st.marks = { [i]: "swap", [o]: "swap" };
    yield snap(st, base + 4, `Ne – prohodíme ${a[o].v} a ${a[i].v}.`);
    i = o;
  }
  st.marks = { 0: "active" };
  st.vars = { n, i: 1 };
  yield snap(st, base + 1, "Prvek vybublal až do kořene.");
}

/** base = řádek „BubbleDown(i):“ v zobrazeném pseudokódu */
function* bubbleDown(
  st: HeapState,
  i: number,
  base: number,
): StepGen<HeapState> {
  const a = st.a;
  const n = a.length;
  while (2 * i + 1 < n) {
    const l = 2 * i + 1;
    const two = l + 1 < n;
    const s = two && a[l + 1].v < a[l].v ? l + 1 : l;
    st.marks = { [i]: "active", [l]: "compare" };
    if (two) st.marks[l + 1] = "compare";
    st.marks[s] = "min";
    st.vars = { n, i: i + 1, s: s + 1 };
    let sons = `Vrchol ${i + 1} má jediného syna ${l + 1} (klíč ${a[l].v}).`;
    if (two) {
      const which =
        a[l + 1].v === a[l].v
          ? `klíče jsou stejné, zůstaneme u levého syna ${s + 1}`
          : `menší klíč má ${s === l ? "levý" : "pravý"} syn ${s + 1}`;
      sons = `Synové vrcholu ${i + 1} jsou ${l + 1} a ${l + 2} (klíče ${a[l].v} a ${a[l + 1].v}) – ${which}.`;
    }
    yield snap(st, base + 2, sons);
    st.marks = { [i]: "active", [s]: "min" };
    yield snap(st, base + 3, `Je k(i) = ${a[i].v} < k(s) = ${a[s].v}?`);
    if (a[i].v < a[s].v) {
      yield snap(st, base + 3, "Ano – haldové uspořádání platí, končíme.");
      return;
    }
    [a[i], a[s]] = [a[s], a[i]];
    st.marks = { [i]: "swap", [s]: "swap" };
    yield snap(st, base + 4, `Ne – prohodíme ${a[s].v} a ${a[i].v}.`);
    i = s;
  }
  st.marks = { [i]: "active" };
  st.vars = { n, i: i + 1 };
  yield snap(st, base + 1, `Vrchol ${i + 1} nemá syny, končíme.`);
}

export function* heapInsert(st: HeapState, x: number): StepGen<HeapState> {
  st.marks = {};
  st.vars = {};
  if (typeof x !== "number" || !Number.isFinite(x)) {
    yield failStep(st, "Hodnota x není číslo – Insert nelze provést.");
    return;
  }
  // limit hlídá sám generátor (nad skutečným stavem), ne tlačítko
  if (st.a.length >= HEAP_MAX) {
    yield failStep(
      st,
      `Halda je plná – vizualizace ukazuje nejvýše ${HEAP_MAX} prvků (5 hladin). Nejdřív nějaký odeberte (ExtractMin).`,
    );
    return;
  }
  st.a.push(mk(x));
  st.marks = { [st.a.length - 1]: "active" };
  st.vars = { n: st.a.length };
  yield snap(
    st,
    2,
    `Přidáme ${x} jako nový list na konec pole (index ${st.a.length}).`,
  );
  yield* bubbleUp(st, st.a.length - 1, lineOf(INSERT, BUBBLE_UP[0]));
  st.marks = {};
  st.vars = {};
  yield snap(
    st,
    null,
    `Insert(${x}): hotovo – halda má ${count(st.a.length)}, minimum je ${st.a[0].v}. Cena O(log n).`,
  );
}

export function* heapExtractMin(st: HeapState): StepGen<HeapState> {
  st.marks = {};
  st.vars = {};
  if (!st.a.length) {
    yield failStep(st, "ExtractMin: halda je prázdná – není co odebrat.");
    return;
  }
  const min = st.a[0];
  st.marks = { 0: "min" };
  st.vars = { n: st.a.length };
  yield snap(st, 1, `Minimum je v kořeni: ${min.v}.`);
  const last = st.a.pop()!;
  st.vars = { n: st.a.length };
  if (st.a.length) {
    st.a[0] = last;
    st.marks = { 0: "active" };
    yield snap(
      st,
      2,
      `Poslední list (${last.v}) přesuneme do kořene, n = ${st.a.length}.`,
    );
    yield* bubbleDown(st, 0, lineOf(EXTRACT, BUBBLE_DOWN[0]));
  } else {
    st.marks = {};
    yield snap(
      st,
      2,
      "Kořen byl jediným prvkem – po jeho odebrání je halda prázdná, n = 0.",
    );
  }
  st.marks = {};
  st.vars = {};
  const rest = st.a.length
    ? `halda má ${count(st.a.length)}, nové minimum je ${st.a[0].v}`
    : "halda je teď prázdná";
  yield snap(st, 4, `ExtractMin: vrací ${min.v} – ${rest}. Cena O(log n).`);
}

/**
 * values: čísla ze vstupu (nekonečna a NaN se přeskočí, nad HEAP_MAX se ořízne – obojí se ohlásí),
 * ignored: tokeny vstupu, které nebyly číslo (jen pro hlášku).
 * Bez jediného čísla se halda nemění.
 */
export function* makeHeap(
  st: HeapState,
  values: number[],
  ignored: string[] = [],
): StepGen<HeapState> {
  st.marks = {};
  st.vars = {};
  const nums = values.filter(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
  if (!nums.length) {
    const why = ignored.length
      ? ` (přeskočeno, není číslo: ${ignoredList(ignored)})`
      : "";
    yield failStep(
      st,
      `Ve vstupu není žádné číslo${why} – zadejte čísla oddělená mezerou nebo čárkou. Halda se nezměnila.`,
    );
    return;
  }
  const used = nums.slice(0, HEAP_MAX);
  const n = used.length;
  st.a = used.map(mk);
  st.vars = { n };
  yield snap(
    st,
    1,
    `Pole bereme rovnou jako strom – uspořádání zatím neplatí${inputNote(n, nums.length, ignored)}.`,
  );
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    st.marks = { [i]: "active" };
    st.vars = { n, i: i + 1 };
    yield snap(
      st,
      3,
      `BubbleDown z vrcholu ${i + 1} (podstromy pod ním už jsou haldy).`,
    );
    yield* bubbleDown(st, i, lineOf(MAKE, BUBBLE_DOWN[0]));
  }
  st.marks = {};
  st.vars = {};
  yield snap(
    st,
    null,
    `MakeHeap: hotovo – halda z ${count(n)} postavena v čase O(n), minimum je ${st.a[0].v}. Většina vrcholů je nízko a bublá krátce.`,
  );
}
