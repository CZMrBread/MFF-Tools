/**
 * Logika stránky binárních stromů (BST, AVL, splay, BB[α]) bez UI: stavba stromu ze vstupu,
 * výběr generátoru a pseudokódu pro operaci a kontrola vstupu (rozsah klíče, počet vrcholů).
 * Samotné algoritmy jsou v bst.ts a trees2.ts a žádná omezení rozsahu nemají.
 */
import { formatNum } from "../../core/format";
import type { StepGen } from "../../core/steps";
import {
  PC_AVL_DELETE,
  PC_AVL_INSERT,
  PC_DELETE,
  PC_FIND,
  PC_INSERT,
  emptyTree,
  find,
  insert,
  insertSilent,
  rejectOp,
  remove,
  type TreeState,
} from "./bst";
import {
  describeSkipped,
  fmtNum,
  keyInputError,
  randomKeys,
  type KeyRange,
  type ParsedKeys,
} from "./keys";
import {
  PC_BB_DELETE,
  PC_BB_INSERT,
  PC_SPLAY_DELETE,
  PC_SPLAY_FIND,
  PC_SPLAY_INSERT,
  bbDelete,
  bbInsert,
  bbViolations,
  buildBalanced,
  splayDelete,
  splayFind,
  splayInsert,
} from "./trees2";

export type Kind = "bst" | "avl" | "splay" | "bb";
export type OpName = "find" | "insert" | "delete";

/** Klíče, které se vejdou do kroužku vrcholu. */
export const TREE_KEYS: KeyRange = { min: -999, max: 9999 };
/** Víc vrcholů se na plátno nevejde bez překrývání. */
export const MAX_NODES = 40;
export const DEFAULT_ALPHA = 0.7;

/** Výchozí příklad stránky; u splay stromu schválně cesta, aby bylo co narovnávat. */
export const DEFAULT_KEYS: Record<Kind, number[]> = {
  bst: [40, 20, 60, 10, 30, 50, 70, 25],
  avl: [40, 20, 60, 10, 30, 50, 70, 25],
  bb: [40, 20, 60, 10, 30, 50, 70, 25],
  splay: [10, 20, 30, 40, 50, 60, 70],
};

/**
 * Strom z klíčů: BB[α] operací Build (dokonale vyvážený), AVL postupným AvlInsert, BST a splay
 * obyčejným vkládáním do BST v zadaném pořadí (splay tedy bez splayování – setříděný vstup dá cestu).
 */
export function buildTree(values: number[], kind: Kind): TreeState {
  const st = emptyTree(kind === "avl");
  if (kind === "bb") buildBalanced(st, values);
  else for (const v of values) insertSilent(st, v);
  st.marks = {};
  st.edgeMarks = {};
  st.vars = {};
  return st;
}

/**
 * Klíče stromu po hladinách (kořen, pak zleva doprava) – do odkazu ?k=. Postupné vkládání v tomto pořadí
 * dá u BST, splay i AVL stejný tvar (žádná rotace se nespustí), u BB[α] stejnou množinu klíčů.
 */
export function levelOrderKeys(st: TreeState): number[] {
  const out: number[] = [];
  const queue: number[] = st.root === null ? [] : [st.root];
  for (let i = 0; i < queue.length; i++) {
    const n = st.nodes[queue[i]];
    out.push(n.key);
    if (n.left !== null) queue.push(n.left);
    if (n.right !== null) queue.push(n.right);
  }
  return out;
}

export const nodeCount = (st: TreeState) => Object.keys(st.nodes).length;

export function hasKey(st: TreeState, x: number): boolean {
  let v = st.root;
  while (v !== null) {
    const k = st.nodes[v].key;
    if (x === k) return true;
    v = x < k ? st.nodes[v].left : st.nodes[v].right;
  }
  return false;
}

/** Text pole α → číslo (desetinná čárka i tečka); neplatný text dá NaN a operace ho odmítne. */
export function parseAlpha(text: string): number {
  const t = text.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

export interface PlannedOp {
  title: string;
  pseudocode: string[];
  run: (st: TreeState) => StepGen<TreeState>;
}

const TITLES: Record<OpName, string> = {
  find: "Find",
  insert: "Insert",
  delete: "Delete",
};

function pseudocodeFor(kind: Kind, op: OpName): string[] {
  if (op === "find") return kind === "splay" ? PC_SPLAY_FIND : PC_FIND;
  if (kind === "splay")
    return op === "insert" ? PC_SPLAY_INSERT : PC_SPLAY_DELETE;
  if (kind === "bb") return op === "insert" ? PC_BB_INSERT : PC_BB_DELETE;
  if (kind === "avl") return op === "insert" ? PC_AVL_INSERT : PC_AVL_DELETE;
  return op === "insert" ? PC_INSERT : PC_DELETE;
}

function generatorFor(
  kind: Kind,
  op: OpName,
  st: TreeState,
  x: number,
  alpha: number,
): StepGen<TreeState> {
  if (kind === "splay")
    return op === "find"
      ? splayFind(st, x)
      : op === "insert"
        ? splayInsert(st, x)
        : splayDelete(st, x);
  if (op === "find") return find(st, x);
  if (kind === "bb")
    return op === "insert" ? bbInsert(st, x, alpha) : bbDelete(st, x, alpha);
  return op === "insert" ? insert(st, x) : remove(st, x);
}

/**
 * Operace nad stromem tak, jak ji spouští stránka: `x` je klíč přečtený z pole (null = prázdné nebo
 * neplatné pole), `alpha` se použije jen u BB[α]. Neplatný vstup operaci nespustí – místo ní vznikne
 * jediný krok s vysvětlením a strom zůstane beze změny.
 */
export function planOp(
  kind: Kind,
  op: OpName,
  x: number | null,
  alpha: number = DEFAULT_ALPHA,
): PlannedOp {
  return {
    // název i s argumentem („Insert(35)“) – zobrazuje se nad zprávou a v historii
    title: x === null ? TITLES[op] : `${TITLES[op]}(${fmtNum(x)})`,
    pseudocode: pseudocodeFor(kind, op),
    run: function* (st) {
      const err = keyInputError(x, TREE_KEYS);
      if (err !== null || x === null) {
        yield* rejectOp(st, err ?? "");
        return;
      }
      if (op === "insert" && nodeCount(st) >= MAX_NODES && !hasKey(st, x)) {
        yield* rejectOp(
          st,
          `Strom už má ${MAX_NODES} vrcholů a víc se jich na plátno nevejde. Nejdřív nějaký klíč smažte (Delete) nebo strom vyprázdněte.`,
        );
        return;
      }
      yield* generatorFor(kind, op, st, x, alpha);
    },
  };
}

/* ------------------------------------------------------------------ stavba ze vstupu a předvolby */

const BUILT: Record<Kind, string> = {
  bst: "Strom postaven postupným vkládáním klíčů v zadaném pořadí.",
  avl: "Strom postaven postupným vkládáním klíčů (AvlInsert) v zadaném pořadí.",
  splay:
    "Strom postaven jako obyčejný BST – vkládáním v zadaném pořadí bez splayování, aby bylo co narovnávat.",
  bb: "Dokonale vyvážený strom postavený operací Build.",
};

/** Zpráva po stavbě stromu ze vstupního pole včetně toho, co se ze vstupu nepoužilo. */
export function buildMessage(kind: Kind, p: ParsedKeys): string {
  const skipped = describeSkipped(p, TREE_KEYS, MAX_NODES);
  return skipped ? `${BUILT[kind]} ${skipped}` : BUILT[kind];
}

export function randomMessage(kind: Kind): string {
  return kind === "bb"
    ? "Dokonale vyvážený strom z náhodných klíčů (Build)."
    : kind === "splay"
      ? "Náhodné klíče vložené jako do obyčejného BST (bez splayování)."
      : "Strom z náhodných klíčů vložených v uvedeném pořadí.";
}

/** Předvolba „Vytvořit ▸ Seřazeně“ (v historii „Setříděný vstup“): klíče, zpráva a případně klíč, který stojí za to vyzkoušet. */
export function sortedPreset(kind: Kind): {
  keys: number[];
  message: string;
  x: number | null;
} {
  const keys = Array.from({ length: 10 }, (_, i) => (i + 1) * 10);
  const deepest = keys[keys.length - 1];
  if (kind === "bst")
    return {
      keys,
      x: deepest,
      message: `Setříděný vstup – BST zdegeneroval na cestu. Zkuste Find(${deepest}): projde všech ${keys.length} vrcholů.`,
    };
  // u splay stromu je kořenem nejmenší klíč a nejhlouběji leží největší – právě jeho splay cestu narovná
  if (kind === "splay")
    return {
      keys,
      x: deepest,
      message: `Cesta (vloženo bez splayování) – zkuste Find(${deepest}) a sledujte, jak se strom narovná a potenciál Φ klesne.`,
    };
  if (kind === "avl")
    return {
      keys,
      x: null,
      message: "Setříděný vstup – AVL strom díky rotacím zůstal vyvážený.",
    };
  return {
    keys,
    x: null,
    message: "Setříděný vstup – Build z něj postaví dokonale vyvážený strom.",
  };
}

/* ------------------------------------------------------------------ stránka: výchozí stav, tipy, neaktivní tlačítka */

/** Výchozí x: klíč, který ve výchozím příkladu je a na kterém je vidět něco zajímavého (viz TIPS). */
export const DEFAULT_X: Record<Kind, number> = {
  bst: 20,
  avl: 10,
  splay: 70,
  bb: 70,
};

/**
 * Výchozí x pro Insert: klíč, který ve výchozím příkladu ještě není (s existujícím by Insert nic
 * nepřidal). AVL 27 = dvojitá rotace (viz TIPS), BB[α] 71 = začátek pravé větve z TIPS.
 */
export const DEFAULT_INSERT_X: Record<Kind, number> = {
  bst: 35,
  avl: 27,
  splay: 35,
  bb: 71,
};

/** Výchozí x pro Insert do stromu s klíči `keys`: DEFAULT_INSERT_X, je-li volný, jinak nejbližší volný nad ním. */
export function insertDefault(kind: Kind, keys: readonly number[]): number {
  const used = new Set(keys);
  for (let x = DEFAULT_INSERT_X[kind]; x <= TREE_KEYS.max; x++)
    if (!used.has(x)) return x;
  for (let x = DEFAULT_INSERT_X[kind] - 1; x >= TREE_KEYS.min; x--)
    if (!used.has(x)) return x;
  return DEFAULT_INSERT_X[kind];
}

/** Krátký námět „💡 Zkuste: …“ – vždy k výchozímu příkladu stránky. */
export const TIPS: Record<Kind, string> = {
  bst: "Delete(20) – vrchol se dvěma syny převezme klíč následníka 25. Pak Vytvořit ▸ Seřazeně a Find(100): strom zdegeneroval na cestu a hledání projde všech 10 vrcholů.",
  avl: "Delete(10) – vrchol 20 ztratí rovnováhu (δ = +2) a pomůže dvojitá rotace. Insert(22) vyvolá jednoduchou rotaci, Insert(27) dvojitou.",
  splay:
    "Find(70) na výchozí cestě – rotace zig-zig ji zhruba napůl zkrátí a potenciál Φ klesne. Pak zkuste Find(10) a Find(40).",
  bb: "Insert(71), Insert(72), Insert(73)… – pravá větev roste, až poruší podmínku a podstrom se celý přestaví. Nebo snižte α na 0,55: další operace nejdřív přestaví porušené podstromy.",
};

/** Co znamená popisek pod vrcholem (null = žádný). */
export const SUB_HINT: Record<Kind, string | null> = {
  bst: null,
  avl: "Pod vrcholem je znaménko δ = h(pravý) − h(levý); vyvážený vrchol má δ ∈ {−1, 0, +1}.",
  splay: "Pod vrcholem je velikost podstromu s(v); potenciál Φ = Σ log₂ s(v).",
  bb: "Pod vrcholem je velikost podstromu s(v); podmínka: každý syn má nejvýše α · s(v) vrcholů.",
};

/**
 * Proč tlačítko operace nejde použít (null = jde). Stránka tlačítko zakáže a důvod ukáže v title,
 * takže se neplatná operace vůbec nespustí (a nezapíše do historie).
 */
export function opDisabledReason(
  st: TreeState,
  op: OpName,
  x: number,
): string | null {
  if (op !== "insert" && st.root === null)
    return "Strom je prázdný – nejdřív vložte klíč (Insert) nebo ho vytvořte (Vytvořit).";
  if (op === "insert" && nodeCount(st) >= MAX_NODES && !hasKey(st, x)) {
    return `Strom už má ${MAX_NODES} vrcholů a víc se jich na plátno nevejde – nejdřív nějaký klíč smažte (Delete).`;
  }
  return null;
}

/** Nabízené hodnoty α (výběr místo volného pole – nic mimo (1/2, 1) nejde zadat). */
export const ALPHA_OPTIONS = [
  0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95,
] as const;

/** α z parametru adresy; neznámou hodnotu nahradí výchozí. */
export function alphaFromParam(param: string | null): number {
  const a = parseAlpha(param ?? "");
  return (ALPHA_OPTIONS as readonly number[]).includes(a) ? a : DEFAULT_ALPHA;
}

/** Upozornění, když strom pro právě zvolené α nesplňuje podmínku (null = splňuje). */
export function alphaNotice(st: TreeState, alpha: number): string | null {
  const bad = bbViolations(st, alpha);
  if (bad.length === 0) return null;
  const list =
    bad.slice(0, 6).map(fmtNum).join(", ") + (bad.length > 6 ? " …" : "");
  return `Pro α = ${formatNum(alpha)} strom nesplňuje podmínku ve ${bad.length === 1 ? "vrcholu" : "vrcholech"} ${list}. Další Insert nebo Delete nejdřív projde celý strom a nejvyšší porušené podstromy přestaví.`;
}

/** Náhodný vstup: 12 různých klíčů 1…99. */
export const randomTreeKeys = (seed: number) => randomKeys(12, 1, 99, seed);

/** Zpráva při otevření stránky. */
export function initialMessage(kind: Kind, fromUrl: boolean): string {
  const what = fromUrl ? "Strom ze vstupu v odkazu" : "Výchozí příklad";
  const how =
    kind === "bb"
      ? "postavený operací Build"
      : kind === "splay"
        ? "vložený jako do obyčejného BST"
        : "postavený vkládáním klíčů";
  return `${what} (${how}). Vyberte operaci v nabídce pod obrázkem (x vyplní i klik na vrchol) – kroky se připraví a ▶ (mezerník) je přehraje.`;
}

/** Text pole klíčů v jednotném tvaru (pro porovnání „změněno, ale nepostaveno“). */
export const normalizeKeysText = (text: string) =>
  text
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .join(" ");
