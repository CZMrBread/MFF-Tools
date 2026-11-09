/**
 * Příklady z knihy pro haldu (Průvodce, obr. 4.1–4.3) a intervalový strom (obr. 4.6).
 * Hodnoty jsou opsané z obrázků (PDF str. 85–87 a 98); pořadí pole = číslování vrcholů po hladinách.
 */
import type { StepGen } from "../../core/steps";
import { PRUVODCE, bookLabel, type BookExample } from "./bookExample";
import {
  EXTRACT,
  INSERT,
  heapExtractMin,
  heapInsert,
  heapOf,
  type HeapState,
} from "./heap";
import { build as buildSeg, type SegState } from "./segtree";

export type HeapBookOp = { op: "insert"; x: number } | { op: "extractMin" };

export interface HeapBookExample extends BookExample<HeapState, HeapBookOp> {
  /** hodnoty v pořadí pole (už v haldovém pořadí) – pro textové pole stránky */
  values: readonly number[];
}

function heapExample(
  figure: string,
  caption: string,
  page: number,
  values: number[],
  ops: HeapBookOp[],
  note: string | null = null,
): HeapBookExample {
  return {
    id: `obr-${figure.replace(".", "-")}`,
    figure,
    label: bookLabel(figure, caption),
    source: PRUVODCE,
    page,
    note,
    values,
    build: () => heapOf(values),
    ops,
  };
}

export const HEAP_BOOK_EXAMPLES: readonly HeapBookExample[] = [
  heapExample(
    "4.1",
    "halda a její očíslování",
    85,
    [1, 2, 1, 3, 4, 3, 2, 9, 6, 7, 8, 4],
    [],
  ),
  heapExample(
    "4.2",
    "vkládání do haldy, Insert(1)",
    86,
    [0, 2, 2, 3, 4, 3, 5, 9, 6, 7, 8, 4],
    [{ op: "insert", x: 1 }],
  ),
  heapExample(
    "4.3",
    "mazání z haldy, ExtractMin",
    87,
    // kniha ukazuje až stav po přesunu posledního listu (6) do kořene; původní kořen 0 je doplněný
    [0, 1, 2, 4, 3, 3, 5, 9, 6, 7, 8, 4, 6],
    [{ op: "extractMin" }],
    "Kniha původní kořen neukazuje (obrázek začíná až po přesunu listu 6 do kořene) – kořen 0 je doplněný.",
  ),
];

/** Výchozí příklad stránky haldy. */
export const DEFAULT_HEAP_EXAMPLE = "obr-4-2";

/** Operace příkladu tak, jak ji spouští stránka (název, pseudokód, generátor). */
export function planHeapBookOp(op: HeapBookOp): {
  title: string;
  pseudocode: string[];
  run: (st: HeapState) => StepGen<HeapState>;
} {
  if (op.op === "insert")
    return {
      title: `Insert(${op.x})`,
      pseudocode: INSERT,
      run: (st) => heapInsert(st, op.x),
    };
  return { title: "ExtractMin", pseudocode: EXTRACT, run: heapExtractMin };
}

export interface SegBookExample extends BookExample<SegState, never> {
  /** posloupnost x_0 … x_{n−1} (listy zleva doprava) */
  values: readonly number[];
}

const SEG_4_6 = [3, 1, 4, 1, 5, 9, 2, 6];

export const SEGTREE_BOOK_EXAMPLES: readonly SegBookExample[] = [
  {
    id: "obr-4-6",
    figure: "4.6",
    label: bookLabel("4.6", "intervalový strom a jeho očíslování"),
    source: PRUVODCE,
    page: 98,
    note: null,
    values: SEG_4_6,
    build: () => buildSeg(SEG_4_6),
    ops: [],
  },
];

/** Výchozí příklad stránky intervalového stromu. */
export const DEFAULT_SEGTREE_EXAMPLE = "obr-4-6";
