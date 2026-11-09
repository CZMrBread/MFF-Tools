/**
 * Příklady z knihy pro stránku LLRB (Průvodce 8.4) – čistá data bez UI (testy v llrbBook.test.ts).
 * Strom je přesně podle obrázku (zápis llrbSpec: klíče po hladinách, „r“ = červená hrana shora). Obrázky
 * na str. 209–213 kreslí obecné vrcholy x, y, z, … bez klíčů – klíče 1, 2, 3, … jsou doplněné v pořadí
 * zleva doprava (symetrické pořadí), jen obr. 8.11 má klíče v knize.
 */
import type { StepGen } from "../../core/steps";
import {
  llrbDelete,
  llrbDeleteMax,
  llrbDeleteMin,
  llrbFind,
  llrbFromSpec,
  llrbInsert,
  type LlrbState,
  type LlrbVariant,
} from "./llrb";

export type LlrbOp = "find" | "insert" | "delete" | "deleteMin" | "deleteMax";

export interface LlrbBookOp {
  op: LlrbOp;
  /** argument Find / Insert / Delete (DeleteMin a DeleteMax ho nemají) */
  x?: number;
}

export interface LlrbBookExample {
  id: string;
  /** text položky nabídky „Příklady z knihy“ */
  label: string;
  /** tištěná strana knihy */
  page: number;
  /** co bylo doplněno (null = přesně podle knihy) */
  note: string | null;
  variant: LlrbVariant;
  /** strom z obrázku (zápis llrbSpec) */
  spec: string;
  /** operace z obrázku (předvyplní se) */
  ops: readonly LlrbBookOp[];
  /** obrázek ukazuje i (a,b)-strom – stránka zapne „(a,b)-strom vedle“ (obr. 8.11, UX-16) */
  showAb?: boolean;
  build: () => LlrbState;
}

function example(
  id: string,
  label: string,
  page: number,
  variant: LlrbVariant,
  spec: string,
  ops: LlrbBookOp[],
  note: string | null,
  showAb = false,
): LlrbBookExample {
  return {
    id,
    label,
    page,
    note,
    variant,
    spec,
    ops,
    ...(showAb ? { showAb } : {}),
    build: () => {
      const st = llrbFromSpec(spec, variant);
      if (!st) throw new Error(`Příklad ${id}: neplatný zápis stromu`);
      return st;
    },
  };
}

const LETTERS = (map: string) =>
  `Kniha kreslí obecné vrcholy ${map.split(" → ")[0]} bez klíčů – klíče ${map.split(" → ")[1]} jsou doplněné zleva doprava.`;

export const LLRB_BOOK_EXAMPLES: readonly LlrbBookExample[] = [
  example(
    "obr-8-11",
    "Obr. 8.11 – překlad (2,4)-stromu na LLRB strom",
    207,
    "24",
    "4,1r,6r,0,3,5,8,2r,7r,9r",
    [{ op: "insert", x: 10 }],
    "Strom je přesně podle obrázku (varianta (2,4): ostrůvky {1 4 6} a {7 8 9} jsou 4-vrcholy). Insert(10) v knize není – ukazuje, jak LlrbInsert cestou dolů oba 4-vrcholy rozštěpí.",
    true,
  ),
  example(
    "str-209-rotace",
    "Str. 209 – nový list vpravo: rotace pravé červené hrany",
    209,
    "23",
    "1",
    [{ op: "insert", x: 2 }],
    LETTERS("x, y → 1, 2"),
  ),
  example(
    "str-209-odbocka",
    "Str. 209 – nekorektní 4-vrchol z pravé odbočky: dvě rotace, přebarvení",
    209,
    "23",
    "3,1r",
    [{ op: "insert", x: 2 }],
    LETTERS("x, y, z → 1, 2, 3"),
  ),
  example(
    "str-209-dve-leve",
    "Str. 209 – dvě levé červené hrany nad sebou: rotace, přebarvení",
    209,
    "23",
    "3,2r",
    [{ op: "insert", x: 1 }],
    LETTERS("x, y, z → 1, 2, 3"),
  ),
  example(
    "str-211-slouceni",
    "Str. 211 – MoveRedLeft přebarvením (DeleteMin)",
    211,
    "23",
    "2,1,3",
    [{ op: "deleteMin" }],
    LETTERS("t, v, y → 1, 2, 3"),
  ),
  example(
    "str-211-pujcka",
    "Str. 211 – MoveRedLeft s půjčkou od bratra (DeleteMin)",
    211,
    "23",
    "2,1,4,3r",
    [{ op: "deleteMin" }],
    LETTERS("t, v, x, y → 1, 2, 3, 4"),
  ),
  example(
    "str-213-slouceni",
    "Str. 213 – MoveRedRight přebarvením (DeleteMax)",
    213,
    "23",
    "2,1,3",
    [{ op: "deleteMax" }],
    LETTERS("t, v, y → 1, 2, 3"),
  ),
  example(
    "str-213-rotace",
    "Str. 213 – MoveRedRight s rotací hrany vt (DeleteMax)",
    213,
    "23",
    "3,2,4,1r",
    [{ op: "deleteMax" }],
    LETTERS("s, t, v, y → 1, 2, 3, 4"),
  ),
];

export const llrbBookById = (id: string | null) =>
  id === null ? undefined : LLRB_BOOK_EXAMPLES.find((e) => e.id === id);

/** Generátor kroků pro operaci (i z příkladu z knihy). */
export function runBookOp(
  o: LlrbBookOp,
): (st: LlrbState) => StepGen<LlrbState> {
  const x = o.x ?? 0;
  switch (o.op) {
    case "find":
      return (st) => llrbFind(st, x);
    case "insert":
      return (st) => llrbInsert(st, x);
    case "delete":
      return (st) => llrbDelete(st, x);
    case "deleteMin":
      return llrbDeleteMin;
    case "deleteMax":
      return llrbDeleteMax;
  }
}
