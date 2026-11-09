import { snap, type Step, type StepGen } from "../../core/steps";

/** Prvek pole s trvalou identitou (kvůli animaci přesunů). */
export interface Item {
  id: number;
  v: number;
}

/** Druh zvýraznění prvku. Mapuje se na CSS třídy `bar-<mark>`. */
export type Mark = "compare" | "swap" | "active" | "min" | "pivot" | "bound";

export interface AuxArray {
  label: string;
  /** posun pomocného pole vůči hlavnímu (ve slotech) */
  offset?: number;
  items: (Item | null)[];
  marks: Record<number, Mark>;
}

export interface SortState {
  items: Item[];
  marks: Record<number, Mark>;
  /** indexy, na kterých už leží konečná hodnota (prvek se odtud nepohne) */
  sorted: number[];
  /** zvýrazněné úseky (běhy u Mergesortu, tříděný úsek u Quicksortu, setříděný začátek u Insertsortu…) */
  ranges: { from: number; to: number; label?: string }[];
  /** pomocné pole (Mergesort, Counting sort…) */
  aux?: AuxArray;
  vars: Record<string, string | number>;
  /** počítadla operací od začátku třídění: porovnání prvků a přesuny (prohození, posuny, zápisy – viz SortAlgorithm.moves) */
  stats: Stats;
}

export interface Stats {
  /** porovnání dvou prvků vstupu (u Counting sortu vždy 0) */
  cmp: number;
  /** přesuny prvků: prohození, posunutí, přesun do Z nebo zápis do výstupu podle algoritmu */
  moves: number;
}

/** „prohození“ je po číslovce nesklonné (1 prohození, 5 prohození) */
export const SWAPS: MovesName = {
  label: "prohození",
  forms: ["prohození", "prohození", "prohození"],
};

/** Jak se u algoritmu jmenují přesuny prvků: nadpis počítadla a tvary po číslovce (1 / 2–4 / 5+). */
export interface MovesName {
  /** nadpis počítadla, např. „prohození“ nebo „posuny“ */
  label: string;
  forms: [one: string, few: string, many: string];
}

export interface SortAlgorithm {
  id: string;
  /** krátký název do titulku operace, např. „Quicksort“ */
  name: string;
  title: string;
  pseudocode: string[];
  /** React element nebo text s popisem */
  description: string;
  complexity: { time: string; space: string; stable: boolean };
  /** největší povolená hodnota vstupu (např. Counting sort); generátor větší hodnoty odmítne hláškou */
  inputMax?: number;
  /** jak se u algoritmu počítají přesuny (počítadlo pod plátnem a závěrečná hláška) */
  moves: MovesName;
  /** námět pro studenta („💡 Zkuste: …“) */
  tip: string;
  /** popisky značek v legendě, které se u algoritmu liší od obecných (např. „min“ = větší syn u Heapsortu) */
  legend?: Partial<Record<Mark | "sorted", string>>;
  run: (input: number[]) => StepGen<SortState>;
}

export function toItems(values: number[]): Item[] {
  return values.map((v, id) => ({ id, v }));
}

export function fresh(values: number[]): SortState {
  return {
    items: toItems(values),
    marks: {},
    sorted: [],
    ranges: [],
    vars: {},
    stats: { cmp: 0, moves: 0 },
  };
}

/** Krok, který jen hlásí odmítnutý vstup (Visualizer ho ukáže červeně). */
export function errorStep(st: SortState, message: string): Step<SortState> {
  return { ...snap(st, null, message), error: true };
}

/**
 * Závěrečná hláška se shrnutím počítadel, např.
 * „Hotovo – pole je setříděné. n = 12: 66 porovnání, 21 prohození.“
 */
export function finished(st: SortState, moves: MovesName): string {
  const n = st.items.length;
  const { cmp, moves: m } = st.stats;
  return `Hotovo – pole je setříděné. n = ${n}: ${cmp} porovnání, ${m} ${plural(m, ...moves.forms)}.`;
}

/**
 * Nejvíc prvků, které má smysl krokovat. UI pouští nejvýš MAX_INPUT_N (input.ts); i kvadratické algoritmy
 * se pro 100 prvků bezpečně vejdou do limitu kroků (MAX_STEPS).
 */
export const MAX_SORT_N = 100;

/**
 * Vstup, který nejde třídit nebo vykreslit (nic, NaN/±∞, příliš mnoho prvků), ukončíme jediným
 * krokem s hláškou. Vrací ten krok, nebo null, když je vstup v pořádku.
 * Použití v generátoru: `const bad = reject(input); if (bad) { yield bad; return }`
 */
export function reject(input: number[]): Step<SortState> | null {
  const finite = input.filter((v) => Number.isFinite(v));
  // do stavu dáme jen to, co jde nakreslit
  const shown = fresh(finite.slice(0, MAX_SORT_N));
  if (finite.length < input.length) {
    return errorStep(
      shown,
      "Vstup obsahuje hodnotu, která není konečné číslo. Třídit umíme jen čísla – opravte prosím vstup.",
    );
  }
  if (input.length > MAX_SORT_N) {
    return errorStep(
      shown,
      `Vstup má ${input.length} prvků, krokovat umíme nejvýše ${MAX_SORT_N}. Zadejte prosím kratší vstup.`,
    );
  }
  if (input.length === 0)
    return errorStep(
      shown,
      "Prázdný vstup – není co třídit. Zadejte alespoň jedno číslo.",
    );
  return null;
}

/** České skloňování po číslovce: plural(1, 'prvek', 'prvky', 'prvků'). */
export function plural(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

/** Všechny indexy 0 … n − 1 (pro závěrečné „vše je na místě“). */
export function allIndices(n: number): number[] {
  return Array.from({ length: n }, (_, k) => k);
}
