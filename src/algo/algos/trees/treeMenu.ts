/**
 * Nabídka operací stránek stromů (ActionMenu) – čisté definice akcí bez Reactu (testy v treeMenu.test.ts).
 * Stránka dodá stav stromu a obsluhy; akce se jmenují jako operace v pseudokódu a nesou vložené
 * argumenty (x, klíče A, obrázek z knihy). Validaci polí dělá actionModel.ts.
 */
import type {
  ActionDef,
  ActionVariant,
  ChoiceArgDef,
  IntArgDef,
  ListArgDef,
} from "../../core/actionModel";
import { listArg, numArg, strArg } from "../../core/actionModel";
import { formatNum } from "../../core/format";
import { bookExampleById } from "../structures/bookExample";
import {
  AB_MAX_KEYS,
  AB_KEYS,
  AB_PARAMS,
  abBuildMessage,
  abDisabledReason,
  abIndexOf,
  abLabel,
  abVariantLabel,
  abVariantOf,
  randomAbKeys,
  type AbOpName,
} from "./abOps";
import type { ABState, AbVariant } from "./abtree";
import { plural, type TreeState } from "./bst";
import {
  AB_BOOK_EXAMPLES,
  AB_PRUVODCE_EXAMPLES,
  TREE_BOOK_EXAMPLES,
  type AbBookExample,
  type TreeBookExample,
} from "./bookExamples";
import { fmtNum, keysFromList, type KeyRange } from "./keys";
import {
  ALPHA_OPTIONS,
  MAX_NODES,
  TREE_KEYS,
  buildMessage,
  opDisabledReason,
  randomMessage,
  randomTreeKeys,
  sortedPreset,
  type Kind,
  type OpName,
} from "./treeOps";

/** Zpráva po „Vytvořit ▸ Prázdný“. */
export const EMPTY_MESSAGE =
  "Strom je prázdný. Vložte klíč (Insert) nebo ho vytvořte (Vytvořit).";

const OP_LABEL: Record<OpName, string> = {
  find: "Find",
  insert: "Insert",
  delete: "Delete",
};
const OP_TITLE: Record<OpName, string> = {
  find: "Najde klíč x",
  insert: "Vloží klíč x",
  delete: "Smaže klíč x",
};
const OPS: readonly OpName[] = ["find", "insert", "delete"];

const keyCount = (n: number) => plural(n, "klíč", "klíče", "klíčů");

/** „Postavit (3 klíče)“ – název stavby do historie */
export const buildTitle = (n: number) => `Postavit (${keyCount(n)})`;

/* ------------------------------------------------------------------ příklady z knihy */

interface ExampleLike {
  id: string;
  figure: string;
  label: string;
  page: number;
  note: string | null;
  ops: readonly { op: OpName; x: number }[];
}

const isLecture = (ex: { figure: string }) => ex.figure.startsWith("L");

/** Položka nabídky: popisek bez předpony „Příklad z knihy: “ */
const optionLabel = (ex: { label: string }) =>
  ex.label.replace(/^Příklad z (knihy|přednášky): /, "");

/** Název do historie: „Příklad: Obr. 8.2“, „Příklad: L02/3“. */
export const exampleTitle = (ex: { figure: string }) =>
  `Příklad: ${isLecture(ex) ? ex.figure : `Obr. ${ex.figure}`}`;

/** Zpráva po načtení příkladu: popisek, zdroj, co bylo doplněno a jaká operace je předvyplněná. */
export function exampleMessage(ex: ExampleLike): string {
  const where = isLecture(ex) ? `snímek ${ex.page}` : `s. ${ex.page}`;
  const parts = [`${ex.label} (${where}).`];
  if (ex.note) parts.push(ex.note);
  const first = ex.ops[0];
  if (first)
    parts.push(
      `Předvyplněno ${OP_LABEL[first.op]}(${fmtNum(first.x)}) – stačí Provést nebo Enter${ex.ops.length > 1 ? `, další operace z obrázku se předvyplní po ní` : ""}.`,
    );
  return parts.join(" ");
}

/**
 * Průvodce operacemi obrázku: po provedení `op(x)` zbývající operace. Když uživatel provede něco jiného
 * než další operaci z obrázku, průvodce skončí (prázdný seznam).
 */
export function nextBookOp<O extends { op: string; x: number }>(
  queue: readonly O[],
  op: string,
  x: number,
): O[] {
  const head = queue[0];
  return head && head.op === op && head.x === x ? queue.slice(1) : [];
}

function bookVariant(
  list: readonly { id: string; label: string; figure: string }[],
  /** id varianty Vytvořit (víc seznamů příkladů na jedné stránce) */
  variantId = "book",
): ActionVariant {
  const lecture = list.every(isLecture);
  const arg: ChoiceArgDef = {
    kind: "choice",
    name: "fig",
    label: lecture ? "Snímek" : "Obrázek",
    options: list.map((e) => ({ value: e.id, label: optionLabel(e) })),
    width: "min(100%, 22rem)",
  };
  return {
    id: variantId,
    label: lecture ? "Příklady z přednášky" : "Příklady z knihy",
    title: lecture
      ? "Strom ze snímku přednášky; operace ze snímku se předvyplní"
      : "Strom přesně podle obrázku v Průvodci; operace z obrázku se předvyplní",
    args: [arg],
  };
}

/* ------------------------------------------------------------------ společné části */

function xArg(range: KeyRange, x: number): IntArgDef {
  return {
    kind: "int",
    name: "x",
    label: "x =",
    min: range.min,
    max: range.max,
    default: x,
  };
}

function keysArg(
  range: KeyRange,
  max: number,
  keys: readonly number[],
): ListArgDef {
  return {
    kind: "list",
    name: "A",
    label: "klíče =",
    min: range.min,
    max: range.max,
    maxCount: max,
    default: keys,
    placeholder: "např. 40, 20, 60, 10, 30",
  };
}

function opDefs<O extends string>(
  range: KeyRange,
  x: number,
  reason: (op: O) => string | null,
  run: (op: O, x: number) => void,
  /** výchozí x pro Insert (nový klíč); jinak stejné x jako Find/Delete */
  insertX: number = x,
): ActionDef[] {
  return (OPS as readonly string[]).map((name) => {
    const op = name as O & OpName;
    return {
      id: op,
      label: `${OP_LABEL[op]}(x)`,
      args: [xArg(range, op === "insert" ? insertX : x)],
      disabledReason: reason(op),
      title: `${OP_TITLE[op]} (x vyplní i klik na vrchol)`,
      run: (v) => run(op, numArg(v, "x")),
    };
  });
}

/* ------------------------------------------------------------------ BST, AVL, splay, BB[α] */

export interface TreeMenuInput {
  kind: Kind;
  /** strom, se kterým se pracuje (s.last) */
  state: TreeState;
  /** výchozí text pole A (klíče, ze kterých je strom postavený) */
  keys: readonly number[];
  /** výchozí x (Find, Delete: klíč ve stromu) */
  x: number;
  /** výchozí x pro Insert (klíč, který ve stromu ještě není); bez něj stejné jako x */
  insertX?: number;
  alpha: number;
  /** semínko náhodného vstupu */
  seed: () => number;
}

export interface TreeMenuHandlers {
  op: (op: OpName, x: number) => void;
  /** nový strom z klíčů; `x` = klíč, který stojí za vyzkoušení (Seřazeně) */
  rebuild: (
    keys: number[],
    message: string,
    title: string,
    x?: number | null,
  ) => void;
  example: (ex: TreeBookExample) => void;
  alpha: (a: number) => void;
}

const BUILD_HINT: Record<Kind, string> = {
  bst: "postupně vloží klíče do prázdného stromu",
  avl: "postupně vloží klíče do prázdného stromu operací AvlInsert",
  splay: "vloží klíče jako do obyčejného BST, bez splayování",
  bb: "Build: z klíčů postaví dokonale vyvážený strom",
};

export function treeActions(
  input: TreeMenuInput,
  h: TreeMenuHandlers,
): ActionDef[] {
  const { kind, state } = input;
  const examples = TREE_BOOK_EXAMPLES[kind];
  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    goLabel: "Postavit",
    title:
      "Nový strom: vlastní klíče, náhodně, seřazeně, prázdný nebo příklad z knihy",
    variants: [
      {
        id: "custom",
        label: "Vlastní",
        title: `Vlastní klíče (nejvýše ${MAX_NODES}) – ${BUILD_HINT[kind]}`,
        args: [keysArg(TREE_KEYS, MAX_NODES, input.keys)],
      },
      {
        id: "random",
        label: "Náhodně",
        title: "12 různých náhodných klíčů od 1 do 99",
      },
      {
        id: "sorted",
        label: "Seřazeně",
        title: "Klíče 10, 20, …, 100 vložené vzestupně",
      },
      {
        id: "empty",
        label: "Prázdný",
        title: "Odstraní všechny vrcholy (jde vrátit)",
      },
      bookVariant(examples),
    ],
    run: (v, variant) => {
      if (variant === "random")
        h.rebuild(
          randomTreeKeys(input.seed()),
          randomMessage(kind),
          "Náhodný vstup",
        );
      else if (variant === "sorted") {
        const p = sortedPreset(kind);
        h.rebuild(p.keys, p.message, "Setříděný vstup", p.x);
      } else if (variant === "empty")
        h.rebuild([], EMPTY_MESSAGE, "Vyprázdnit");
      else if (variant === "book") {
        const ex = bookExampleById(examples, strArg(v, "fig"));
        if (ex) h.example(ex);
      } else {
        const values = listArg(v, "A");
        const p = keysFromList(values, { ignored: [], valid: values.length });
        h.rebuild(p.keys, buildMessage(kind, p), buildTitle(p.keys.length));
      }
    },
  };
  const defs = [
    create,
    ...opDefs<OpName>(
      TREE_KEYS,
      input.x,
      // x = NaN: plný strom zakáže Insert bez ohledu na pole (existující klíč by stejně nic nepřidal)
      (op) => opDisabledReason(state, op, NaN),
      h.op,
      input.insertX,
    ),
  ];
  if (kind === "bb")
    defs.push({
      id: "alpha",
      label: `α = ${formatNum(input.alpha)}`,
      title:
        "Parametr vyvážení, 1/2 < α < 1. Platí od další operace Insert nebo Delete.",
      variants: ALPHA_OPTIONS.map((a) => ({
        id: String(a),
        label: formatNum(a),
      })),
      run: (_v, variant) => h.alpha(Number(variant)),
    });
  return defs;
}

/* ------------------------------------------------------------------ (a,b)-strom */

export interface AbMenuInput {
  state: ABState;
  keys: readonly number[];
  x: number;
  /** výchozí x pro Insert (klíč, který ve stromu není); bez něj nejbližší volný klíč od 35 */
  insertX?: number;
  seed: () => number;
}

export interface AbMenuHandlers {
  op: (op: AbOpName, x: number) => void;
  rebuild: (keys: number[], message: string, title: string) => void;
  example: (ex: AbBookExample) => void;
  /** přepnutí na dvojici AB_PARAMS[i] */
  params: (i: number) => void;
  /** přepnutí varianty (přednáška / Průvodce 8.3) */
  variant: (v: AbVariant) => void;
}

/** Varianty (a,b)-stromu v pořadí nabídky. */
const AB_VARIANTS: readonly AbVariant[] = ["prednaska", "kniha"];

export function abActions(input: AbMenuInput, h: AbMenuHandlers): ActionDef[] {
  const { state } = input;
  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    goLabel: "Postavit",
    title:
      "Nový strom: vlastní klíče, náhodně, prázdný nebo příklad z přednášky či z knihy",
    variants: [
      {
        id: "custom",
        label: "Vlastní",
        title: `Vlastní klíče (nejvýše ${AB_MAX_KEYS}) – postupně je vloží do prázdného stromu`,
        args: [keysArg(AB_KEYS, AB_MAX_KEYS, input.keys)],
      },
      {
        id: "random",
        label: "Náhodně",
        title: "14 různých náhodných klíčů od 1 do 99",
      },
      {
        id: "empty",
        label: "Prázdný",
        title: "Odstraní všechny klíče (jde vrátit)",
      },
      bookVariant(AB_BOOK_EXAMPLES),
      bookVariant(AB_PRUVODCE_EXAMPLES, "kniha"),
    ],
    run: (v, variant) => {
      if (variant === "random")
        h.rebuild(
          randomAbKeys(input.seed()),
          "Strom z náhodných klíčů vložených v uvedeném pořadí.",
          "Náhodný vstup",
        );
      else if (variant === "empty") h.rebuild([], EMPTY_MESSAGE, "Vyprázdnit");
      else if (variant === "book" || variant === "kniha") {
        const ex = bookExampleById(
          variant === "kniha" ? AB_PRUVODCE_EXAMPLES : AB_BOOK_EXAMPLES,
          strArg(v, "fig"),
        );
        if (ex) h.example(ex);
      } else {
        const values = listArg(v, "A");
        const p = keysFromList(values, { ignored: [], valid: values.length });
        h.rebuild(p.keys, abBuildMessage(p), buildTitle(p.keys.length));
      }
    },
  };
  const i = abIndexOf(state);
  return [
    create,
    ...opDefs<AbOpName>(
      AB_KEYS,
      input.x,
      (op) => abDisabledReason(state, op, NaN),
      h.op,
      input.insertX ?? abInsertDefault(input.keys),
    ),
    {
      id: "params",
      label: `(a,b) = ${abLabel(i)}`,
      title:
        "Po změně se strom znovu postaví ze stejných klíčů (jde vrátit tlačítkem ↶ Vrátit operaci)",
      variants: AB_PARAMS.map((_, j) => ({ id: String(j), label: abLabel(j) })),
      run: (_v, variant) => h.params(Number(variant)),
    },
    {
      id: "variant",
      label: `Varianta: ${abVariantOf(state) === "kniha" ? "Průvodce" : "přednáška"}`,
      title:
        "Přednáška: klíče v listech, vnitřní vrcholy nesou oddělovače. Průvodce 8.3: klíče ve vnitřních vrcholech. Strom se znovu postaví ze stejných klíčů (jde vrátit).",
      variants: AB_VARIANTS.map((id) => ({ id, label: abVariantLabel(id) })),
      run: (_v, variant) =>
        h.variant(variant === "kniha" ? "kniha" : "prednaska"),
    },
  ];
}

/** Výchozí x pro Insert do (a,b)-stromu s klíči `keys`: 35, je-li volný, jinak nejbližší volný nad ním (pod ním). */
export function abInsertDefault(keys: readonly number[], from = 35): number {
  const used = new Set(keys);
  for (let x = from; x <= AB_KEYS.max; x++) if (!used.has(x)) return x;
  for (let x = from - 1; x >= AB_KEYS.min; x--) if (!used.has(x)) return x;
  return from;
}

/** Příklad z přednášky nebo z Průvodce podle parametru adresy `?ex=` (undefined = žádný / neznámý). */
export const abExampleFromParam = (param: string | null) =>
  bookExampleById(AB_BOOK_EXAMPLES, param) ??
  bookExampleById(AB_PRUVODCE_EXAMPLES, param);
