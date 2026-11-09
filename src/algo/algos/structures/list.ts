/**
 * Zásobník, fronta a jednosměrný spojový seznam – generátory kroků (bez UI).
 *
 * Kontrakt useStructure: novým trvalým stavem je POSLEDNÍ vydaný krok. Cokoli se změní až za posledním
 * yield, se zahodí – proto každá operace začíná úklidem přechodného stavu (begin) a nic za posledním
 * yield nedělá. Poslední krok vždy začíná názvem operace s argumentem („Push(7): …“) a říká výsledek.
 */
import { snap, type StepGen } from "../../core/steps";
import type { Box, Pointer } from "../../views/BoxListView";
import { count, failStep } from "./input";

export interface ListState {
  boxes: Box[];
  pointers: Pointer[];
  vars: Record<string, string | number>;
}

export type ListKind = "stack" | "queue" | "list";

/** nejvýše tolik prvků – víc se do řady krabiček (u zásobníku do sloupce) čitelně nevejde */
export const LIST_MAX = 12;

/** Výchozí příklad zásobníku, fronty a seznamu (stránka i náhled na úvodní stránce). */
export const LIST_INITIAL = [5, 12, 8];

let nextId = 100;
const mk = (v: number, cls?: string): Box => ({
  id: nextId++,
  label: String(v),
  cls,
});
const clean = (st: ListState) => {
  st.boxes.forEach((b) => delete b.cls);
};
const isNum = (x: number) => typeof x === "number" && Number.isFinite(x);
/** 7. pád: „s jediným prvkem“, „se všemi 3 prvky“ */
const withAll = (n: number) =>
  n === 1 ? "s jediným prvkem" : `se všemi ${n} prvky`;

const topPtr = (st: ListState): Pointer[] =>
  st.boxes.length ? [{ at: st.boxes.length - 1, label: "vrchol" }] : [];
const qPointers = (st: ListState): Pointer[] =>
  st.boxes.length
    ? [
        { at: 0, label: "začátek" },
        { at: st.boxes.length - 1, label: "konec" },
      ]
    : [];
const headPtr = (st: ListState): Pointer[] => [
  { at: st.boxes.length ? 0 : -1, label: "hlava" },
];
const restPtr = { stack: topPtr, queue: qPointers, list: headPtr };

/** Struktura daného druhu s danými prvky (zásobník: poslední = vrchol; fronta a seznam: první = začátek / hlava). */
export function makeList(kind: ListKind, values: number[]): ListState {
  const st: ListState = {
    boxes: values.slice(0, LIST_MAX).map((v) => mk(v)),
    pointers: [],
    vars: {},
  };
  st.pointers = restPtr[kind](st);
  return st;
}

/** Hodnoty prvků v pořadí krabiček (zásobník odspodu, fronta a seznam od začátku). */
export const listValues = (st: ListState) =>
  st.boxes.map((b) => Number(b.label));

/** Úklid na začátku operace: žádné zvýraznění, žádné pomocné ukazatele ani proměnné z minulé operace. */
function begin(st: ListState, kind: ListKind) {
  clean(st);
  st.pointers = restPtr[kind](st);
  st.vars = {};
}

/** Společné kontroly vkládání: x musí být číslo a struktura nesmí být plná. Vrací chybovou hlášku, nebo null. */
function insertError(
  st: ListState,
  op: string,
  x: number,
  full: string,
): string | null {
  if (!isNum(x)) return `Hodnota x není číslo – ${op} nelze provést.`;
  if (st.boxes.length >= LIST_MAX)
    return `${full} – vizualizace ukazuje nejvýše ${LIST_MAX} prvků. Nejdřív nějaký odeberte.`;
  return null;
}

/* ------------------------------------------------------------------ zásobník */

export const PUSH = [
  "Push(x):",
  "  Vytvoříme nový prvek s hodnotou x.",
  "  Jeho následník ← vrchol zásobníku.",
  "  vrchol ← nový prvek",
];
export const POP = [
  "Pop:",
  "  Pokud je zásobník prázdný, ohlásíme chybu.",
  "  p ← vrchol",
  "  vrchol ← následník vrcholu",
  "  Vrátíme hodnotu z p.",
];

export function* stackPush(st: ListState, x: number): StepGen<ListState> {
  begin(st, "stack");
  const err = insertError(st, "Push", x, "Zásobník je plný");
  if (err) {
    yield failStep(st, err);
    return;
  }
  yield snap(st, 1, `Vytvoříme prvek ${x}.`);
  st.boxes.push(mk(x, "box-new"));
  st.pointers = topPtr(st);
  yield snap(st, 3, `Prvek ${x} je nový vrchol zásobníku.`);
  clean(st);
  yield snap(
    st,
    null,
    `Push(${x}): hotovo – ${x} je na vrcholu, zásobník má ${count(st.boxes.length)}. Cena O(1).`,
  );
}

export function* stackPop(st: ListState): StepGen<ListState> {
  begin(st, "stack");
  if (!st.boxes.length) {
    yield failStep(
      st,
      "Pop: zásobník je prázdný – není co odebrat, ohlásíme chybu.",
      1,
    );
    return;
  }
  const top = st.boxes[st.boxes.length - 1];
  top.cls = "box-removed";
  yield snap(st, 2, `Vrchol je ${top.label}.`);
  st.boxes.pop();
  st.pointers = topPtr(st);
  yield snap(
    st,
    3,
    st.boxes.length
      ? "Vrchol posuneme na následníka."
      : "Vrchol neměl následníka – zásobník je teď prázdný.",
  );
  const rest = st.boxes.length
    ? `nový vrchol je ${st.boxes[st.boxes.length - 1].label}, zásobník má ${count(st.boxes.length)}`
    : "zásobník je teď prázdný";
  yield snap(st, 4, `Pop: vrací ${top.label} – ${rest}.`);
}

/* ------------------------------------------------------------------ fronta */

export const ENQ = [
  "Enqueue(x):",
  "  Vytvoříme nový prvek s hodnotou x.",
  "  Pokud je fronta prázdná: začátek ← nový prvek",
  "  Jinak: následník konce ← nový prvek",
  "  konec ← nový prvek",
];
export const DEQ = [
  "Dequeue:",
  "  Pokud je fronta prázdná, ohlásíme chybu.",
  "  p ← začátek",
  "  začátek ← následník začátku",
  "  Vrátíme hodnotu z p.",
];

export function* enqueue(st: ListState, x: number): StepGen<ListState> {
  begin(st, "queue");
  const err = insertError(st, "Enqueue", x, "Fronta je plná");
  if (err) {
    yield failStep(st, err);
    return;
  }
  yield snap(st, 1, `Vytvoříme prvek ${x}.`);
  const wasEmpty = st.boxes.length === 0;
  st.boxes.push(mk(x, "box-new"));
  st.pointers = qPointers(st);
  yield snap(
    st,
    wasEmpty ? 2 : 3,
    wasEmpty
      ? "Fronta byla prázdná, prvek je zároveň začátkem."
      : "Připojíme ho za dosavadní konec.",
  );
  yield snap(st, 4, `Konec fronty je teď ${x}.`);
  clean(st);
  yield snap(
    st,
    null,
    `Enqueue(${x}): hotovo – ${x} je na konci, fronta má ${count(st.boxes.length)}. Cena O(1).`,
  );
}

export function* dequeue(st: ListState): StepGen<ListState> {
  begin(st, "queue");
  if (!st.boxes.length) {
    yield failStep(
      st,
      "Dequeue: fronta je prázdná – není co odebrat, ohlásíme chybu.",
      1,
    );
    return;
  }
  const first = st.boxes[0];
  first.cls = "box-removed";
  yield snap(st, 2, `Na začátku fronty je ${first.label}.`);
  st.boxes.shift();
  st.pointers = qPointers(st);
  yield snap(
    st,
    3,
    st.boxes.length
      ? "Začátek posuneme na následníka."
      : "Začátek neměl následníka – fronta je teď prázdná.",
  );
  const rest = st.boxes.length
    ? `na začátku je teď ${st.boxes[0].label}, fronta má ${count(st.boxes.length)}`
    : "fronta je teď prázdná";
  yield snap(st, 4, `Dequeue: vrací ${first.label} – ${rest}.`);
}

/* ------------------------------------------------------------------ spojový seznam */

export const L_INSERT_HEAD = [
  "InsertFirst(x):",
  "  nový ← prvek s hodnotou x",
  "  následník(nový) ← hlava",
  "  hlava ← nový",
];
export const L_INSERT_AFTER = [
  "InsertAfter(k, x):   // za k-tý prvek",
  "  p ← hlava; (k−1)-krát: p ← následník(p)",
  "  nový ← prvek s hodnotou x",
  "  následník(nový) ← následník(p)",
  "  následník(p) ← nový",
];
export const L_FIND = [
  "Find(x):",
  "  p ← hlava",
  "  Dokud p ≠ ∅:",
  "    Pokud hodnota(p) = x, vrátíme p.",
  "    p ← následník(p)",
  "  Vrátíme ∅ (nenalezeno).",
];
export const L_DELETE = [
  "Delete(x):",
  "  Pokud hlava = ∅, skončíme.   // prázdný seznam",
  "  Pokud hodnota(hlava) = x: hlava ← následník(hlava); konec.",
  "  p ← hlava",
  "  Dokud následník(p) ≠ ∅ a hodnota(následník(p)) ≠ x:",
  "    p ← následník(p)",
  "  Pokud následník(p) ≠ ∅: následník(p) ← následník(následník(p))",
];

const withP = (st: ListState, at: number): Pointer[] => [
  ...headPtr(st),
  { at, label: "p", cls: "ptr-p" },
];

export function* listInsertFirst(st: ListState, x: number): StepGen<ListState> {
  begin(st, "list");
  const err = insertError(st, "InsertFirst", x, "Seznam je plný");
  if (err) {
    yield failStep(st, err);
    return;
  }
  st.vars = { x };
  yield snap(st, 1, `Vytvoříme prvek ${x}.`);
  st.boxes.unshift(mk(x, "box-new"));
  st.pointers = headPtr(st);
  yield snap(st, 3, "Nový prvek ukazuje na starou hlavu a stává se hlavou.");
  clean(st);
  st.vars = {};
  yield snap(
    st,
    null,
    `InsertFirst(${x}): hotovo – ${x} je nová hlava, seznam má ${count(st.boxes.length)}. Cena O(1).`,
  );
}

export function* listInsertAfter(
  st: ListState,
  k: number,
  x: number,
): StepGen<ListState> {
  begin(st, "list");
  const err = insertError(st, "InsertAfter", x, "Seznam je plný");
  if (err) {
    yield failStep(st, err);
    return;
  }
  const n = st.boxes.length;
  // k musí být celé číslo 1 … n; jinak by p došel jinam, než kam se vkládá
  if (!Number.isInteger(k) || k < 1 || k > n) {
    const why =
      n === 0
        ? "Seznam je prázdný, není za co vkládat – použijte InsertFirst(x)."
        : !Number.isInteger(k)
          ? `Pozice k musí být celé číslo od 1 do ${n}.`
          : `Pozice ${k} neexistuje – seznam má ${count(n)}, k musí být od 1 do ${n}.`;
    yield failStep(st, why);
    return;
  }
  st.vars = { k, x };
  for (let i = 0; i < k; i++) {
    clean(st);
    st.boxes[i].cls = "box-active";
    st.pointers = withP(st, i);
    yield snap(
      st,
      1,
      i === 0 ? "p ← hlava" : `p ← následník(p) (${i + 1}. prvek)`,
    );
  }
  yield snap(st, 2, `Vytvoříme prvek ${x}.`);
  st.boxes.splice(k, 0, mk(x, "box-new"));
  yield snap(
    st,
    4,
    "Zapojíme ho za p: následník(nový) ← následník(p), následník(p) ← nový.",
  );
  clean(st);
  st.pointers = headPtr(st);
  st.vars = {};
  yield snap(
    st,
    null,
    `InsertAfter(${k}, ${x}): hotovo – ${x} je na pozici ${k + 1}. Nalezení p stálo O(k), samotné zapojení O(1).`,
  );
}

/** Poslední krok nechává výsledek viditelný (p na nalezeném prvku, nebo p = ∅); uklidí ho začátek další operace. */
export function* listFind(st: ListState, x: number): StepGen<ListState> {
  begin(st, "list");
  if (!isNum(x)) {
    yield failStep(st, "Hodnota x není číslo – Find nelze provést.");
    return;
  }
  st.vars = { x };
  for (let i = 0; i < st.boxes.length; i++) {
    clean(st);
    st.boxes[i].cls = "box-compare";
    st.pointers = withP(st, i);
    yield snap(st, 3, `Je hodnota(p) = ${st.boxes[i].label} rovna ${x}?`);
    if (st.boxes[i].label === String(x)) {
      st.boxes[i].cls = "box-found";
      yield snap(
        st,
        3,
        `Find(${x}): nalezeno na pozici ${i + 1} po ${comparisons(i + 1)} – vracíme p.`,
      );
      return;
    }
  }
  clean(st);
  st.pointers = withP(st, -1);
  const n = st.boxes.length;
  yield snap(
    st,
    5,
    n
      ? `Find(${x}): ${x} v seznamu není – porovnali jsme ho ${withAll(n)} a p došel na ∅.`
      : `Find(${x}): seznam je prázdný, vracíme ∅.`,
  );
}

/** „po 1 porovnání“, „po 3 porovnáních“ */
function comparisons(n: number): string {
  return `${n} ${n === 1 ? "porovnání" : "porovnáních"}`;
}

export function* listDelete(st: ListState, x: number): StepGen<ListState> {
  begin(st, "list");
  if (!isNum(x)) {
    yield failStep(st, "Hodnota x není číslo – Delete nelze provést.");
    return;
  }
  if (!st.boxes.length) {
    yield snap(st, 1, `Delete(${x}): seznam je prázdný – není co mazat.`);
    return;
  }
  st.vars = { x };
  if (st.boxes[0].label === String(x)) {
    st.boxes[0].cls = "box-removed";
    yield snap(
      st,
      2,
      `Hlava má hodnotu ${x} – stačí hlavu posunout na následníka.`,
    );
    st.boxes.shift();
    st.pointers = headPtr(st);
    st.vars = {};
    yield snap(
      st,
      null,
      `Delete(${x}): hotovo – smazali jsme hlavu, seznam má ${count(st.boxes.length)}. Cena O(1).`,
    );
    return;
  }
  let p = 0;
  st.boxes[0].cls = "box-active";
  st.pointers = withP(st, 0);
  yield snap(st, 3, `Hlava má jinou hodnotu než ${x}. p ← hlava`);
  while (p + 1 < st.boxes.length && st.boxes[p + 1].label !== String(x)) {
    st.boxes[p + 1].cls = "box-compare";
    yield snap(
      st,
      4,
      `následník(p) = ${st.boxes[p + 1].label} ≠ ${x}, jdeme dál.`,
    );
    clean(st);
    p++;
    st.boxes[p].cls = "box-active";
    st.pointers = withP(st, p);
    yield snap(st, 5, "p ← následník(p)");
  }
  if (p + 1 < st.boxes.length) {
    st.boxes[p + 1].cls = "box-removed";
    yield snap(
      st,
      6,
      `Následník p má hodnotu ${x} – přepojíme p na prvek za ním.`,
    );
    st.boxes.splice(p + 1, 1);
    clean(st);
    st.pointers = headPtr(st);
    st.vars = {};
    yield snap(
      st,
      null,
      `Delete(${x}): hotovo – seznam má ${count(st.boxes.length)}. Nalezení prvku stálo O(n), samotné přepojení O(1).`,
    );
  } else {
    yield snap(
      st,
      4,
      `Delete(${x}): ${x} v seznamu není (následník(p) = ∅) – seznam se nezměnil.`,
    );
  }
}
