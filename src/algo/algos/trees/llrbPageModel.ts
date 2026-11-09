/**
 * Logika stránky LLRB (#/tree/llrb) bez Reactu (testy v llrbPageModel.test.ts): otevření z odkazu, zápis
 * stavu do odkazu, přepnutí varianty, nabídka akcí (ActionMenu), legenda, tip a pseudokód podle operace.
 *
 * Odkaz: `t=` přesný strom (klíče po hladinách, „r“ = červená hrana shora; `t=-` prázdný strom), `k=` klíče
 * vložené postupně (ručně psaný odkaz), `v=24` varianta (2,4) – výchozí (2,3) parametr nemá, `ab=1`
 * kresba (a,b)-stromu vedle (zapisuje stránka). Výchozí stav se do odkazu nepíše.
 */
import type {
  ActionDef,
  ChoiceArgDef,
  IntArgDef,
} from "../../core/actionModel";
import { listArg, numArg, strArg } from "../../core/actionModel";
import type { StepGen } from "../../core/steps";
import { PC_FIND, plural } from "./bst";
import {
  describeSkipped,
  fmtNum,
  keysFromList,
  keysFromParam,
  randomKeys,
  type ParsedKeys,
} from "./keys";
import type { TreeLegendItem } from "./legend";
import {
  PC_LLRB_DELETE,
  PC_LLRB_DELETE_MAX,
  PC_LLRB_DELETE_MIN,
  PC_LLRB_INSERT_23,
  PC_LLRB_INSERT_24,
  buildLlrb,
  emptyLlrb,
  llrbDepth,
  llrbFromSpec,
  llrbLevelKeys,
  llrbProblems,
  llrbSize,
  llrbSpec,
  type LlrbState,
  type LlrbVariant,
} from "./llrb";
import {
  LLRB_BOOK_EXAMPLES,
  llrbBookById,
  runBookOp,
  type LlrbBookExample,
  type LlrbOp,
} from "./llrbBook";
import { LLRB_DEFAULT_KEYS, LLRB_DEFAULT_SPEC } from "./llrbDefault";
import { TREE_KEYS } from "./treeOps";

export type { LlrbOp } from "./llrbBook";

/** Rozsah klíčů (vejdou se do kroužku vrcholu) – jako u ostatních stromů. */
export const LLRB_KEYS = TREE_KEYS;
/** Víc vrcholů se na plátno nevejde (hloubka LLRB až 2·log n). */
export const LLRB_MAX = 31;

export { LLRB_DEFAULT_KEYS, LLRB_DEFAULT_SPEC };
/** Find a Delete: klíč ve stromu; Insert: nový klíč do 3-vrcholu {25 30} – 3 rotace a přebarvení. */
export const LLRB_DEFAULT_X = 20;
export const LLRB_INSERT_X = 27;
export const LLRB_DEFAULT_VARIANT: LlrbVariant = "23";

export const defaultLlrb = () =>
  buildLlrb(LLRB_DEFAULT_KEYS, LLRB_DEFAULT_VARIANT);

export const variantFromParam = (p: string | null): LlrbVariant =>
  p === "24" ? "24" : "23";

export const variantLabel = (v: LlrbVariant) =>
  v === "24" ? "(2,4)" : "(2,3)";

/* ------------------------------------------------------------------ otevření a odkaz */

export interface OpenedLlrb {
  state: LlrbState;
  message: string;
  /** klíče pro pole „klíče =“ (Vytvořit ▸ Vlastní) */
  keys: number[];
  /** strom přišel z odkazu */
  fromUrl: boolean;
}

export const INITIAL_MESSAGE =
  "Výchozí příklad: (2,3)-strom, jehož spodní vrcholy jsou 3-vrcholy (červená hrana vede vždy doleva). Insert(27) je předvyplněný – stačí Provést nebo Enter, pak krokujte.";

/**
 * Stav z parametrů odkazu: t= (přesný strom) má přednost před k= (klíče vložené postupně). Co z odkazu
 * nešlo použít (nečitelný t= či k=, neznámá varianta v=), řekne zpráva na začátku (UX-09).
 */
export function openLlrb(p: {
  t: string | null;
  k: string | null;
  v: string | null;
}): OpenedLlrb {
  const o = openTree(p);
  const variant = variantFromParam(p.v);
  if (p.v === null || p.v === "" || p.v === variant) return o;
  return {
    ...o,
    message: `Varianta „${p.v}“ neexistuje – použita ${variantLabel(variant)} (v=24 je (2,4)). ${o.message}`,
  };
}

function openTree(p: {
  t: string | null;
  k: string | null;
  v: string | null;
}): OpenedLlrb {
  const variant = variantFromParam(p.v);
  if (p.t === "-")
    return {
      state: emptyLlrb(variant),
      message:
        "Strom z odkazu je prázdný. Vložte klíč (Insert) nebo ho vytvořte (Vytvořit).",
      keys: [],
      fromUrl: true,
    };
  if (p.t) {
    const st = llrbFromSpec(p.t, variant, LLRB_MAX);
    if (st) {
      const problems = llrbProblems(st);
      if (!problems.length)
        return {
          state: st,
          message: `Strom z odkazu (varianta ${variantLabel(variant)}).`,
          keys: llrbLevelKeys(st),
          fromUrl: true,
        };
      const keys = llrbLevelKeys(st);
      return {
        state: buildLlrb(keys, variant),
        message: `Strom z odkazu není platný LLRB strom (${problems[0]}) – postavili jsme ho znovu vložením týchž klíčů.`,
        keys,
        fromUrl: true,
      };
    }
  }
  const keys = p.t ? null : keysFromParam(p.k, LLRB_KEYS, LLRB_MAX);
  if (keys)
    return {
      state: buildLlrb(keys, variant),
      message: `Strom z odkazu: klíče ${keys.map(fmtNum).join(", ")} vložené postupně (LlrbInsert, varianta ${variantLabel(variant)}).`,
      keys,
      fromUrl: true,
    };
  const def = defaultLlrb();
  if (variant === "24") def.variant = "24";
  const problem = p.t
    ? "Strom z odkazu (t=) nešel přečíst – zobrazen výchozí příklad. "
    : p.k
      ? "Klíče z odkazu (k=) nešly přečíst (celá čísla oddělená čárkou) – zobrazen výchozí příklad. "
      : "";
  return {
    state: def,
    message: problem + INITIAL_MESSAGE,
    keys: [...LLRB_DEFAULT_KEYS],
    fromUrl: false,
  };
}

/** Parametry odkazu pro aktuální stav (null = parametr vynechat). */
export function linkState(st: LlrbState): {
  t: string | null;
  v: string | null;
} {
  const spec = st.root === null ? "-" : llrbSpec(st);
  return {
    t: spec === LLRB_DEFAULT_SPEC ? null : spec,
    v: st.variant === LLRB_DEFAULT_VARIANT ? null : st.variant,
  };
}

/* ------------------------------------------------------------------ varianta */

/**
 * Přepnutí varianty: (2,3)-strom je i (2,4)-stromem, takže zůstane; (2,4)-strom se 4-vrcholy se postaví
 * znovu vložením stejných klíčů (po hladinách) procedurou LlrbInsert varianty (2,3).
 */
export function switchVariant(
  st: LlrbState,
  to: LlrbVariant,
): { state: LlrbState; message: string } {
  const same = structuredClone(st);
  same.variant = to;
  same.marks = {};
  same.edgeMarks = {};
  same.vars = {};
  if (to === "24")
    return {
      state: same,
      message:
        "Varianta (2,4): strom zůstal (každý (2,3)-strom je i (2,4)-strom). Insert teď štěpí 4-vrcholy cestou dolů (LlrbInsert, str. 210). Mazání kniha popisuje jen pro variantu (2,3).",
    };
  if (!llrbProblems(same).length)
    return {
      state: same,
      message:
        "Varianta (2,3): strom zůstal – nemá žádný 4-vrchol. Insert volá před návratem LlrbFixup; jde i mazat.",
    };
  const keys = llrbLevelKeys(st);
  return {
    state: buildLlrb(keys, "23"),
    message:
      "Varianta (2,3) nepřipouští 4-vrcholy (dvě červené hrany z jednoho vrcholu) – strom jsme postavili znovu vložením týchž klíčů po hladinách. Jde vrátit (↶ Vrátit operaci).",
  };
}

/* ------------------------------------------------------------------ operace */

const DELETE_OPS: readonly LlrbOp[] = ["delete", "deleteMin", "deleteMax"];

/** Proč operace teď nejde (null = jde). */
export function opDisabledReason(st: LlrbState, op: LlrbOp): string | null {
  if (op === "insert")
    return llrbSize(st) >= LLRB_MAX
      ? `Strom má ${LLRB_MAX} vrcholů – víc se na plátno nevejde. Smažte klíč nebo vytvořte menší strom.`
      : null;
  if (op === "find") return null;
  if (st.variant === "24")
    return "Mazání (LlrbDelete, MoveRedLeft/Right) kniha popisuje jen pro variantu (2,3) – přepněte Varianta na (2,3).";
  if (st.root === null) return "Strom je prázdný – není co mazat.";
  return null;
}

const OP_NAME: Record<LlrbOp, string> = {
  find: "Find",
  insert: "Insert",
  delete: "Delete",
  deleteMin: "DeleteMin",
  deleteMax: "DeleteMax",
};

export function pseudocodeFor(op: LlrbOp, variant: LlrbVariant): string[] {
  switch (op) {
    case "find":
      return PC_FIND;
    case "insert":
      return variant === "24" ? PC_LLRB_INSERT_24 : PC_LLRB_INSERT_23;
    case "delete":
      return PC_LLRB_DELETE;
    case "deleteMin":
      return PC_LLRB_DELETE_MIN;
    case "deleteMax":
      return PC_LLRB_DELETE_MAX;
  }
}

/** Pseudokód před první operací: otevřené akce, jinak Insert. */
export function idlePseudocode(
  open: string | null,
  variant: LlrbVariant,
): string[] {
  const op = (Object.keys(OP_NAME) as LlrbOp[]).find((o) => o === open);
  return pseudocodeFor(
    op && !(variant === "24" && DELETE_OPS.includes(op)) ? op : "insert",
    variant,
  );
}

export interface PlannedLlrbOp {
  title: string;
  pseudocode: string[];
  run: (st: LlrbState) => StepGen<LlrbState>;
}

export function planOp(
  op: LlrbOp,
  x: number | null,
  variant: LlrbVariant,
): PlannedLlrbOp {
  const hasX = op === "find" || op === "insert" || op === "delete";
  return {
    title: hasX ? `${OP_NAME[op]}(${fmtNum(x ?? 0)})` : OP_NAME[op],
    pseudocode: pseudocodeFor(op, variant),
    run: runBookOp({ op, x: x ?? 0 }),
  };
}

/** Výchozí x pro Insert: LLRB_INSERT_X, je-li volný, jinak nejbližší volný klíč nad ním (pod ním). */
export function insertDefault(keys: readonly number[]): number {
  const used = new Set(keys);
  for (let x = LLRB_INSERT_X; x <= LLRB_KEYS.max; x++)
    if (!used.has(x)) return x;
  for (let x = LLRB_INSERT_X - 1; x >= LLRB_KEYS.min; x--)
    if (!used.has(x)) return x;
  return LLRB_INSERT_X;
}

/* ------------------------------------------------------------------ příklady z knihy */

export const llrbExampleTitle = (e: LlrbBookExample) =>
  `Příklad: ${e.label.split(" – ")[0]}`;

const opText = (o: { op: LlrbOp; x?: number }) =>
  o.x === undefined || o.op === "deleteMin" || o.op === "deleteMax"
    ? OP_NAME[o.op]
    : `${OP_NAME[o.op]}(${fmtNum(o.x)})`;

export function llrbExampleMessage(e: LlrbBookExample): string {
  const parts = [
    `Příklad z knihy: ${e.label} (s. ${e.page}, varianta ${variantLabel(e.variant)}).`,
  ];
  if (e.note) parts.push(e.note);
  const first = e.ops[0];
  if (first)
    parts.push(`Předvyplněno ${opText(first)} – stačí Provést nebo Enter.`);
  return parts.join(" ");
}

/* ------------------------------------------------------------------ Vytvořit */

const keyCount = (n: number) => plural(n, "klíč", "klíče", "klíčů");

export const buildTitle = (n: number) => `Postavit (${keyCount(n)})`;

export function buildMessage(p: ParsedKeys, variant: LlrbVariant): string {
  const skipped = describeSkipped(p, LLRB_KEYS, LLRB_MAX);
  const base = p.keys.length
    ? `Klíče ${p.keys.map(fmtNum).join(", ")} vložené postupně procedurou LlrbInsert (varianta ${variantLabel(variant)}).`
    : "Žádný platný klíč – strom je prázdný.";
  return skipped ? `${base} ${skipped}` : base;
}

export const SORTED_KEYS: readonly number[] = Array.from(
  { length: 15 },
  (_, i) => 10 * (i + 1),
);

export const EMPTY_MESSAGE =
  "Strom je prázdný. Vložte klíč (Insert) nebo ho vytvořte (Vytvořit).";

export interface LlrbMenuInput {
  state: LlrbState;
  /** výchozí text pole klíčů */
  keys: readonly number[];
  /** výchozí x pro Find / Delete */
  x: number;
  /** výchozí x pro Insert */
  insertX: number;
  seed: () => number;
}

export interface LlrbMenuHandlers {
  op: (op: LlrbOp, x: number | null) => void;
  rebuild: (keys: number[], message: string, title: string) => void;
  example: (e: LlrbBookExample) => void;
  variant: (v: LlrbVariant) => void;
}

function xArg(x: number): IntArgDef {
  return {
    kind: "int",
    name: "x",
    label: "x =",
    min: LLRB_KEYS.min,
    max: LLRB_KEYS.max,
    default: x,
  };
}

export function llrbActions(
  input: LlrbMenuInput,
  h: LlrbMenuHandlers,
): ActionDef[] {
  const { state } = input;
  const variant = state.variant;
  const fig: ChoiceArgDef = {
    kind: "choice",
    name: "fig",
    label: "Obrázek",
    options: LLRB_BOOK_EXAMPLES.map((e) => ({ value: e.id, label: e.label })),
    width: "min(100%, 24rem)",
  };
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
        title: `Vlastní klíče (nejvýše ${LLRB_MAX}) – postupně je vloží procedurou LlrbInsert`,
        args: [
          {
            kind: "list",
            name: "A",
            label: "klíče =",
            min: LLRB_KEYS.min,
            max: LLRB_KEYS.max,
            maxCount: LLRB_MAX,
            default: input.keys,
            placeholder: "např. 40, 20, 70, 10, 30",
          },
        ],
      },
      {
        id: "random",
        label: "Náhodně",
        title: "12 různých náhodných klíčů od 1 do 99",
      },
      {
        id: "sorted",
        label: "Seřazeně",
        title:
          "Klíče 10, 20, …, 150 vložené vzestupně – na rozdíl od BVS strom zůstane vyvážený",
      },
      {
        id: "empty",
        label: "Prázdný",
        title: "Odstraní všechny vrcholy (jde vrátit)",
      },
      {
        id: "book",
        label: "Příklady z knihy",
        title:
          "Strom přesně podle obrázku v Průvodci 8.4; operace z obrázku se předvyplní",
        args: [fig],
      },
    ],
    run: (v, which) => {
      if (which === "random") {
        const keys = randomKeys(12, 1, 99, input.seed());
        h.rebuild(
          keys,
          `Náhodné klíče ${keys.map(fmtNum).join(", ")} vložené postupně (varianta ${variantLabel(variant)}).`,
          "Náhodný vstup",
        );
      } else if (which === "sorted")
        h.rebuild(
          [...SORTED_KEYS],
          `Klíče 10, 20, …, 150 vložené vzestupně. Obyčejný BVS by z nich udělal cestu hloubky 14, LLRB strom má hloubku ${llrbDepth(buildLlrb(SORTED_KEYS, variant))} – rotace a přebarvení ho drží vyvážený.`,
          "Setříděný vstup",
        );
      else if (which === "empty") h.rebuild([], EMPTY_MESSAGE, "Vyprázdnit");
      else if (which === "book") {
        const e = llrbBookById(strArg(v, "fig"));
        if (e) h.example(e);
      } else {
        const values = listArg(v, "A");
        const p = keysFromList(values, { ignored: [], valid: values.length });
        h.rebuild(p.keys, buildMessage(p, variant), buildTitle(p.keys.length));
      }
    },
  };
  const withX = (
    op: LlrbOp,
    label: string,
    title: string,
    x: number,
  ): ActionDef => ({
    id: op,
    label,
    args: [xArg(x)],
    disabledReason: opDisabledReason(state, op),
    title: `${title} (x vyplní i klik na vrchol)`,
    run: (v) => h.op(op, numArg(v, "x")),
  });
  return [
    create,
    withX("find", "Find(x)", "Najde klíč x jako v obyčejném BVS", input.x),
    withX(
      "insert",
      "Insert(x)",
      `Vloží klíč x procedurou LlrbInsert (varianta ${variantLabel(variant)})`,
      input.insertX,
    ),
    withX("delete", "Delete(x)", "Smaže klíč x procedurou LlrbDelete", input.x),
    {
      id: "deleteMin",
      label: "DeleteMin",
      disabledReason: opDisabledReason(state, "deleteMin"),
      title: "Smaže minimum procedurou LlrbDeleteMin (MoveRedLeft)",
      run: () => h.op("deleteMin", null),
    },
    {
      id: "deleteMax",
      label: "DeleteMax",
      disabledReason: opDisabledReason(state, "deleteMax"),
      title: "Smaže maximum procedurou LlrbDeleteMax (MoveRedRight)",
      run: () => h.op("deleteMax", null),
    },
    {
      id: "variant",
      label: `Varianta: ${variantLabel(variant)}`,
      title:
        "(2,3): LlrbInsert s LlrbFixup a mazání (kniha dál pracuje s ní). (2,4): LlrbInsert štěpí 4-vrcholy cestou dolů; mazání kniha nepopisuje.",
      variants: [
        { id: "23", label: "(2,3) – LlrbFixup, mazání" },
        { id: "24", label: "(2,4) – štěpení shora dolů" },
      ],
      run: (_v, which) => h.variant(which === "24" ? "24" : "23"),
    },
  ];
}

/* ------------------------------------------------------------------ legenda a texty */

export const LLRB_LEGEND: TreeLegendItem[] = [
  {
    cls: "sw-red",
    shape: "line",
    label:
      "červená hrana – klíče jednoho vrcholu (2,4)-stromu; barvu nese vrchol pod ní (červený obrys)",
    marks: ["e-red", "n-red"],
  },
  { cls: "sw-active", label: "aktuální vrchol v", marks: ["n-active"] },
  {
    cls: "sw-active",
    shape: "line",
    label: "cesta rekurze (černé hrany modře, červené silněji)",
    marks: ["e-active"],
  },
  {
    cls: "sw-new",
    label: "nový / nalezený vrchol",
    marks: ["n-new", "n-found"],
  },
  {
    cls: "sw-compare",
    label: "vrcholy rotace / cesta k minimu pravého podstromu",
    marks: ["n-compare"],
  },
  {
    cls: "sw-red",
    shape: "line-dashed",
    label: "rotovaná (červená) hrana",
    marks: ["e-rotate"],
  },
  {
    cls: "sw-purple",
    label: "přebarvované vrcholy v, ℓ(v), r(v)",
    marks: ["n-flip"],
  },
  {
    cls: "sw-removed-dashed",
    label: "odstraňovaný vrchol",
    marks: ["n-removed"],
  },
  {
    cls: "sw-bad",
    label: "(2,4)-strom: dočasně přeplněný vrchol (víc než 3 klíče)",
    marks: ["n-bad"],
  },
];

export const LLRB_TIP =
  "Insert(27) padne do 3-vrcholu {25 30}: vznikne 4-vrchol a LlrbFixup ho rotacemi a přebarvením rozštěpí – 27 přejde k 20. Zapněte „(2,4)-strom vedle“ a sledujte ostrůvky. Delete(10) ukáže MoveRedLeft, DeleteMax MoveRedRight; Varianta (2,4) štěpí 4-vrcholy už cestou dolů.";

/** Klíče stromu (pro pole „klíče =“ po operaci). */
export const llrbFieldKeys = (st: LlrbState) =>
  st.root === null ? [] : llrbLevelKeys(st);
