/**
 * Příklady z knihy (Průvodce, kap. 8: BST obr. 8.1–8.3, AVL obr. 8.4–8.6, kap. 9.5: splay obr. 9.4–9.5) a z přednášky
 * DS I (Fink: L02 splay stromy, L03 (a,b)-stromy) pro stránky stromů – čistá data bez UI.
 *
 * Binární stromy se staví stejně jako na stránce (buildTree: vkládání v daném pořadí, u BB[α] Build),
 * pořadí `keys` je zvolené tak, aby vznikl právě strom z obrázku. Obrázky 8.4–8.6 a snímky L02
 * klíče nemají (jen tvary a písmena) – klíče 1, 2, … jsou doplněné v pořadí in-order.
 */
import {
  PRUVODCE,
  bookLabel,
  type BookExample,
} from "../structures/bookExample";
import { abBookFromSpec, type AbBookSpec } from "./abBook";
import type { ABNode, ABState, AbVariant } from "./abtree";
import { emptyAB } from "./abtree";
import type { AbOpName } from "./abOps";
import type { TreeState } from "./bst";
import { buildTree, type Kind, type OpName } from "./treeOps";

export interface TreeBookOp {
  op: OpName;
  x: number;
}

export interface TreeBookExample extends BookExample<TreeState, TreeBookOp> {
  /** klíče v pořadí vkládání – pro textové pole „Klíče“ (buildTree z nich dá právě tento strom) */
  keys: readonly number[];
}

const FINK_L02 = "Fink: Datové struktury I, 2. přednáška – Splay stromy";
const FINK_L03 = "Fink: Datové struktury I, 3. přednáška – (a,b)-stromy";
const INVENTED_KEYS =
  "Obrázek v knize klíče nemá (jen tvar) – klíče 1, 2, … jsou doplněné zleva doprava (in-order).";
const INVENTED_KEYS_L02 =
  "Snímek ukazuje vrcholy x, p, g a podstromy A–D bez klíčů – klíče 1, 2, … jsou doplněné zleva doprava (in-order), podstromy jsou jednotlivé vrcholy.";

const id = (figure: string) => `obr-${figure.replace(".", "-")}`;

function bookTree(
  kind: Kind,
  figure: string,
  caption: string,
  page: number,
  keys: number[],
  ops: TreeBookOp[] = [],
  note: string | null = null,
  suffix = "",
): TreeBookExample {
  return {
    id: id(figure) + suffix,
    figure,
    label: bookLabel(figure, caption),
    source: PRUVODCE,
    page,
    note,
    keys,
    build: () => buildTree(keys, kind),
    ops,
  };
}

function lectureSplay(
  rotation: "zig" | "zig-zig" | "zig-zag",
  keys: number[],
  x: number,
): TreeBookExample {
  return {
    id: `l02-${rotation}`,
    figure: "L02/3",
    label: `Příklad z přednášky: Splay – rotace ${rotation}, Find(${x})`,
    source: FINK_L02,
    page: 3,
    note: INVENTED_KEYS_L02,
    keys,
    build: () => buildTree(keys, "splay"),
    ops: [{ op: "find", x }],
  };
}

/** Obr. 8.3: dokonale vyvážený BVS s klíči 1 … 15 (pořadí po hladinách). */
const PERFECT_15 = [8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15];

export const TREE_BOOK_EXAMPLES: Record<Kind, readonly TreeBookExample[]> = {
  bst: [
    bookTree(
      "bst",
      "8.1",
      "binární vyhledávací strom",
      185,
      [7, 4, 9, 2, 5, 8],
      [],
      null,
      "a",
    ),
    bookTree(
      "bst",
      "8.1",
      "tytéž klíče jako „liána“",
      185,
      [4, 2, 5, 7, 8, 9],
      [],
      null,
      "b",
    ),
    bookTree(
      "bst",
      "8.2",
      "mazání: Delete(2), Delete(4), Delete(3)",
      188,
      [3, 2, 7, 0, 5, 8, 1, 4, 6, 9],
      [
        { op: "delete", x: 2 },
        { op: "delete", x: 4 },
        { op: "delete", x: 3 },
      ],
    ),
    bookTree("bst", "8.3", "dokonale vyvážený BVS", 189, PERFECT_15),
  ],
  avl: [
    bookTree("avl", "8.3", "dokonale vyvážený BVS", 189, PERFECT_15),
    bookTree(
      "avl",
      "8.4",
      "minimální AVL strom hloubky 3",
      192,
      [5, 3, 7, 2, 4, 6, 1],
      [],
      INVENTED_KEYS,
    ),
    bookTree(
      "avl",
      "8.5",
      "jednoduchá rotace, Insert(0)",
      193,
      [4, 2, 5, 1, 3],
      [{ op: "insert", x: 0 }],
      INVENTED_KEYS,
    ),
    bookTree(
      "avl",
      "8.6",
      "dvojitá rotace, Delete(8)",
      193,
      [6, 2, 7, 1, 4, 8, 3, 5],
      [{ op: "delete", x: 8 }],
      INVENTED_KEYS,
    ),
  ],
  splay: [
    // obr. 9.4 a 9.5: cesta vzniklá vkládáním vzestupně (vkládání do splay stromu na stránce nesplayuje)
    bookTree(
      "splay",
      "9.4",
      "postup splayování vrcholu 5 (kroky PP, PP, P)",
      232,
      [0, 1, 2, 3, 4, 5, 6],
      [{ op: "find", x: 5 }],
    ),
    bookTree(
      "splay",
      "9.5",
      "vývoj potenciálu během splayování hodnot 9, 0, 7, 3",
      233,
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [
        { op: "find", x: 9 },
        { op: "find", x: 0 },
        { op: "find", x: 7 },
        { op: "find", x: 3 },
      ],
      "Potenciál podle knihy: 21,791 → 15,077 → 15,077 → 12,299 → 12,077 (stránka ukazuje Φ na setiny).",
    ),
    // obr. 9.7: výsledek obr. 9.4 (5 v kořeni), z něj mažeme 2
    bookTree(
      "splay",
      "9.7",
      "postup mazání ze splay stromu, Delete(2)",
      238,
      [5, 0, 6, 2, 1, 4, 3],
      [{ op: "delete", x: 2 }],
      "Vrchol 2 se vysplayuje do kořene a odebere; maximum 1 levého podstromu se vysplayuje do jeho kořene a pravý podstrom se k němu připojí.",
    ),
    lectureSplay("zig", [4, 2, 5, 1, 3], 2),
    lectureSplay("zig-zig", [6, 4, 7, 2, 5, 1, 3], 2),
    lectureSplay("zig-zag", [6, 2, 7, 1, 4, 3, 5], 4),
  ],
  bb: [bookTree("bb", "8.3", "dokonale vyvážený BVS", 189, PERFECT_15)],
};

/** Navržený výchozí příklad každé stránky (stránky ho zatím nepoužívají – viz předání). */
export const DEFAULT_TREE_EXAMPLE: Record<Kind, string> = {
  bst: "obr-8-2",
  avl: "obr-8-6",
  splay: "l02-zig-zig",
  bb: "obr-8-3",
};

/* ------------------------------------------------------------------ (a,b)-stromy */

/** Tvar (a,b)-stromu: číslo = list s klíčem, pole = vnitřní vrchol se syny zleva doprava. */
export type AbSpec = number | readonly AbSpec[];

export interface AbBookOp {
  op: AbOpName;
  x: number;
}

export interface AbBookExample extends BookExample<ABState, AbBookOp> {
  a: number;
  b: number;
  /** přesný tvar stromu (postupným vkládáním `keys` by vznikl jiný strom); u knižní varianty AbBookSpec */
  spec: AbSpec | AbBookSpec;
  /** klíče vzestupně – pro textové pole „Klíče“ */
  keys: readonly number[];
  /** varianta stromu; chybí = přednáška (klíče v listech) */
  variant?: AbVariant;
}

/**
 * (a,b)-strom přesně podle tvaru (bez kontroly a, b – předloha je platná). Oddělovače se dopočítají
 * jako v abtree.ts: i-tý klíč vnitřního vrcholu = maximum i-tého podstromu.
 */
export function abFromSpec(a: number, b: number, spec: AbSpec): ABState {
  const st = emptyAB(a, b);
  const make = (s: AbSpec): { id: number; max: number } => {
    const nid = st.nextId++;
    if (typeof s === "number") {
      st.nodes[nid] = { id: nid, keys: [s], children: [] };
      return { id: nid, max: s };
    }
    const kids = s.map(make);
    const node: ABNode = {
      id: nid,
      keys: kids.slice(0, -1).map((k) => k.max),
      children: kids.map((k) => k.id),
    };
    st.nodes[nid] = node;
    return { id: nid, max: kids[kids.length - 1].max };
  };
  st.root = make(spec).id;
  return st;
}

const leavesOf = (s: AbSpec): number[] =>
  typeof s === "number" ? [s] : s.flatMap(leavesOf);

function lectureAb(
  slide: number,
  what: string,
  spec: AbSpec,
  op: AbBookOp,
  note: string | null,
): AbBookExample {
  return {
    id: `l03-${op.op}`,
    figure: `L03/${slide}`,
    label: `Příklad z přednášky: (2,4)-strom – ${what}`,
    source: FINK_L03,
    page: slide,
    note,
    a: 2,
    b: 4,
    spec,
    keys: leavesOf(spec),
    build: () => abFromSpec(2, 4, spec),
    ops: [op],
  };
}

export const AB_BOOK_EXAMPLES: readonly AbBookExample[] = [
  lectureAb(
    4,
    "Insert(4)",
    [
      [1, 3],
      [5, 6, 7, 8],
    ],
    { op: "insert", x: 4 },
    "Dělení přeplněného vrcholu probíhá podle pseudokódu na snímku 5 (do nového bratra jdou ⌊(b+1)/2⌋ = 2 pravé syny). Obrázek na snímku 4 dělí jinak – nový bratr tam dostane 3 syny.",
  ),
  lectureAb(
    6,
    "Delete(4)",
    [
      [1, 3],
      [4, 5],
      [6, 7, 8],
    ],
    { op: "delete", x: 4 },
    "Snímek ukazuje obě možnosti opravy; stránka bere levého bratra, ten má jen a = 2 syny, takže vrcholy sloučí (pravá varianta snímku).",
  ),
];

/* ------------------------------------------------------------------ (a,b)-stromy podle Průvodce 8.3 */

const bookSpecKeys = (s: AbBookSpec): number[] => {
  if (Array.isArray(s)) return [...(s as readonly number[])];
  const n = s as { k: readonly number[]; c?: readonly AbBookSpec[] };
  return [...n.k, ...(n.c ?? []).flatMap(bookSpecKeys)].sort((a, b) => a - b);
};

const SCHEMATIC =
  "Obrázek ukazuje jen výřez stromu (písmena a, b, … jsou podstromy) – tady je doplněný na nejmenší (2,3)-strom, podstromy jsou jednotlivé vrcholy s klíči.";

function pruvodceAb(
  figure: string,
  suffix: string,
  caption: string,
  page: number,
  spec: AbBookSpec,
  ops: AbBookOp[],
  note: string | null,
): AbBookExample {
  return {
    id: id(figure) + suffix,
    figure,
    label: bookLabel(figure, caption),
    source: PRUVODCE,
    page,
    note,
    a: 2,
    b: 3,
    spec,
    keys: bookSpecKeys(spec),
    variant: "kniha",
    build: () => abBookFromSpec(2, 3, spec),
    ops,
  };
}

/**
 * Obrázky 8.7–8.10 Průvodce (str. 199–203): (2,3)-stromy s klíči ve vnitřních vrcholech. Obr. 8.8–8.10
 * jsou výřezy s podstromy a … f – doplněné na nejmenší platný (2,3)-strom se stejnými klíči.
 */
export const AB_PRUVODCE_EXAMPLES: readonly AbBookExample[] = [
  pruvodceAb(
    "8.7",
    "a",
    "(2,3)-strom pro klíče 1, 3, 4, 6, 7, 9",
    199,
    { k: [4, 7], c: [[1, 3], [6], [9]] },
    [{ op: "delete", x: 4 }],
    "Delete(4) ukáže nahrazení následníkem: 4 není na předposlední hladině, nahradí ho 6 a podtečený vrchol si půjčí od bratra.",
  ),
  pruvodceAb(
    "8.7",
    "b",
    "tytéž klíče, jiný tvar",
    199,
    { k: [3, 6], c: [[1], [4], [7, 9]] },
    [],
    null,
  ),
  pruvodceAb(
    "8.8",
    "",
    "štěpení přeplněného vrcholu, Insert(6)",
    200,
    { k: [2, 8], c: [[1], [4, 5], [9]] },
    [{ op: "insert", x: 6 }],
    `${SCHEMATIC} Na obrázku je vrchol [2 8] uvnitř stromu; tady je to kořen, takže se po něm rozštěpí i kořen a strom se prohloubí.`,
  ),
  pruvodceAb(
    "8.9",
    "",
    "sloučení vrcholů při mazání, Delete(5)",
    202,
    { k: [4, 7], c: [[2], [5], [9]] },
    [{ op: "delete", x: 5 }],
    SCHEMATIC,
  ),
  pruvodceAb(
    "8.10",
    "",
    "doplnění vrcholu půjčkou od souseda, Delete(5)",
    203,
    { k: [4, 7], c: [[2, 3], [5], [9]] },
    [{ op: "delete", x: 5 }],
    SCHEMATIC,
  ),
];
