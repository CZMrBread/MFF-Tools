/**
 * Červeno-černý strom LLRB (left-leaning red-black tree) podle Průvodce 8.4 (str. 206–214) – čistá logika
 * bez UI (testy v llrb.test.ts). Barva hrany je uložená v jejím spodním vrcholu (`red`), vnější vrcholy
 * jsou ∅ (null) a počítají se jako černé; barva kořene nemá význam (virtuální hrana nad ním), takže ji
 * kresba nikdy neukazuje a po operaci se kořen vždy uloží jako černý.
 *
 * Operace jsou generátory kroků, které jdou řádek po řádku podle pseudokódu z knihy:
 * - varianta (2,3): LlrbInsert s krokem 3 přesunutým za krok 7 = vkládání + LlrbFixup (str. 210),
 *   mazání LlrbDeleteMin, LlrbDeleteMax, LlrbDelete s MoveRedLeft / MoveRedRight (str. 212–214);
 * - varianta (2,4): LlrbInsert se štěpením 4-vrcholů shora dolů (str. 210). Mazání kniha popisuje jen pro
 *   variantu (2,3) – stránka ho ve variantě (2,4) nenabízí.
 *
 * Podmínky „ℓ(v) i ℓ(ℓ(v)) existují a jsou černé“ (LlrbDelete, ř. 3 a 10) čteme jako u LlrbDeleteMin:
 * syn, kterým pokračujeme, existuje a oba vrcholy jsou černé, přičemž vnější vrchol ∅ je černý. Doslovné
 * čtení (i vnuk musí existovat) by v černém listu nesplnilo invariant D a smazání listu by porušilo axiom 4
 * (test „ℓ(ℓ(v)) = ∅ se počítá jako černý“).
 */
import { snap, type Step, type StepGen } from "../../core/steps";
import { fmtKey, plural } from "./bst";
import {
  blackHeight,
  emptyLlrb,
  isRed,
  llrbDepth,
  llrbKeys,
  llrbSize,
  llrbSpec,
  type LlrbState,
  type LlrbVariant,
} from "./llrbTree";

export * from "./llrbTree";

/* ================================================================== pseudokódy (Průvodce, str. 210–214) */

const FIXUP = [
  "Procedura LlrbFixup(v)",
  "  Vstup: Kořen podstromu v",
  "  Je-li ℓ(v) černý a r(v) červený: v ← Rotace(v, r(v)).",
  "  Jinak je-li ℓ(v) červený a ℓ(ℓ(v)) také červený: v ← Rotace(v, ℓ(v)).",
  "  Jsou-li ℓ(v) i r(v) červené, přebarvíme ℓ(v), r(v) i v.",
  "  Výstup: Nový kořen podstromu v",
];

const MOVE_RED_LEFT = [
  "Procedura MoveRedLeft(v)",
  "  Vstup: Kořen podstromu v",
  "  Přebarvíme v, ℓ(v) a r(v).",
  "  Pokud je ℓ(r(v)) červený:",
  "    Rotace(r(v), ℓ(r(v)))",
  "    x ← Rotace(v, r(v))",
  "    Přebarvíme x, ℓ(x) a r(x).",
  "    v ← x",
  "  Výstup: Nový kořen podstromu v",
];

const MOVE_RED_RIGHT = [
  "Procedura MoveRedRight(v)",
  "  Vstup: Kořen podstromu v",
  "  Přebarvíme v, ℓ(v) a r(v).",
  "  Pokud je ℓ(ℓ(v)) červený:",
  "    t ← Rotace(v, ℓ(v))",
  "    Přebarvíme t, ℓ(t) a r(t).",
  "    v ← t",
  "  Výstup: Nový kořen podstromu v",
];

const DELETE_MIN = [
  "Procedura LlrbDeleteMin(v)   // mazání minima z LLRB stromu",
  "  Vstup: Kořen stromu v",
  "  Pokud ℓ(v) = ∅, položíme v ← ∅ a skončíme.",
  "  Pokud ℓ(v) i ℓ(ℓ(v)) jsou černé:",
  "    v ← MoveRedLeft(v)",
  "  ℓ(v) ← LlrbDeleteMin(ℓ(v))",
  "  v ← LlrbFixup(v)",
  "  Výstup: Nový kořen v",
];

const DELETE_MAX = [
  "Procedura LlrbDeleteMax(v)   // mazání maxima z LLRB stromu",
  "  Vstup: Kořen stromu v",
  "  Pokud ℓ(v) je červený: v ← Rotace(v, ℓ(v)).",
  "  Pokud r(v) = ∅, položíme v ← ∅ a skončíme.",
  "  Pokud r(v) i ℓ(r(v)) jsou černé:",
  "    v ← MoveRedRight(v)",
  "  r(v) ← LlrbDeleteMax(r(v))",
  "  v ← LlrbFixup(v)",
  "  Výstup: Nový kořen v",
];

/** LlrbInsert, varianta (2,4) – štěpení 4-vrcholů shora dolů (str. 210, doslovně). */
export const PC_LLRB_INSERT_24 = [
  "Procedura LlrbInsert(v, x)   // vkládání do LLRB stromu",
  "  Vstup: Kořen stromu v, vkládaný klíč x",
  "  Pokud v = ∅, skončíme a vrátíme nově vytvořený červený vrchol v s klíčem x.",
  "  Pokud x = k(v), skončíme (klíč x se ve stromu již nachází).",
  "  Jsou-li ℓ(v) i r(v) červené, přebarvíme ℓ(v), r(v) i v.",
  "  Pokud x < k(v), položíme ℓ(v) ← LlrbInsert(ℓ(v), x).",
  "  Pokud x > k(v), položíme r(v) ← LlrbInsert(r(v), x).",
  "  Je-li ℓ(v) černý a r(v) červený: v ← Rotace(v, r(v)).",
  "  Jinak je-li ℓ(v) červený a ℓ(ℓ(v)) také červený: v ← Rotace(v, ℓ(v)).",
  "  Výstup: Nový kořen v",
];

/** LlrbInsert, varianta (2,3): krok 3 přesunutý za krok 7 = volání LlrbFixup před návratem (str. 210). */
export const PC_LLRB_INSERT_23 = [
  "Procedura LlrbInsert(v, x)   // varianta (2,3): krok 3 za krokem 7",
  "  Vstup: Kořen stromu v, vkládaný klíč x",
  "  Pokud v = ∅, skončíme a vrátíme nově vytvořený červený vrchol v s klíčem x.",
  "  Pokud x = k(v), skončíme (klíč x se ve stromu již nachází).",
  "  Pokud x < k(v), položíme ℓ(v) ← LlrbInsert(ℓ(v), x).",
  "  Pokud x > k(v), položíme r(v) ← LlrbInsert(r(v), x).",
  "  v ← LlrbFixup(v)",
  "  Výstup: Nový kořen v",
  ...FIXUP,
];

export const PC_LLRB_DELETE_MIN = [...DELETE_MIN, ...MOVE_RED_LEFT, ...FIXUP];

export const PC_LLRB_DELETE_MAX = [...DELETE_MAX, ...MOVE_RED_RIGHT, ...FIXUP];

/** LlrbDelete (str. 214) a procedury, které volá. */
export const PC_LLRB_DELETE = [
  "Procedura LlrbDelete(v, x)   // mazání z LLRB stromu",
  "  Vstup: Kořen stromu v, mazaný klíč x",
  "  Pokud v = ∅, vrátíme se.   // klíč x ve stromu nebyl",
  "  Pokud x < k(v):   // doleva jako při mazání minima",
  "    Pokud ℓ(v) i ℓ(ℓ(v)) existují a jsou černé:   // ∅ je černý",
  "      v ← MoveRedLeft(v)",
  "    ℓ(v) ← LlrbDelete(ℓ(v), x)",
  "  Jinak:   // buďto hotovo, nebo doprava jako při mazání maxima",
  "    Pokud ℓ(v) je červený: v ← Rotace(v, ℓ(v))",
  "    Pokud k(v) = x a r(v) = ∅:",
  "      v ← ∅ a skončíme.",
  "    Pokud r(v) i ℓ(r(v)) existují a jsou černé:   // ∅ je černý",
  "      v ← MoveRedRight(v)",
  "    Pokud k(v) = x:",
  "      Prohodíme k(v) s minimem pravého podstromu R(v).",
  "      r(v) ← LlrbDeleteMin(r(v))",
  "    Jinak:",
  "      r(v) ← LlrbDelete(r(v), x)",
  "  v ← LlrbFixup(v)",
  "  Výstup: Nový kořen v",
  ...DELETE_MIN,
  ...MOVE_RED_LEFT,
  ...MOVE_RED_RIGHT,
  ...FIXUP,
];

/* ------------------------------------------------------------------ řádky pseudokódu */

/** Index řádku, který začíná daným textem (za odsazením) – od `from`; chybějící řádek je chyba programu. */
function lineOf(pc: readonly string[], text: string, from = 0): number {
  for (let i = from; i < pc.length; i++)
    if (pc[i].trimStart().startsWith(text)) return i;
  throw new Error(`Pseudokód LLRB: chybí řádek „${text}“`);
}

interface FixupLines {
  /** řádek „v ← LlrbFixup(v)“ volajícího */
  call: number;
  rotL: number;
  rotR: number;
  flip: number;
}

const fixupLines = (pc: readonly string[], call: number): FixupLines => {
  const head = lineOf(pc, "Procedura LlrbFixup");
  return {
    call,
    rotL: lineOf(pc, "Je-li ℓ(v) černý", head),
    rotR: lineOf(pc, "Jinak je-li ℓ(v) červený", head),
    flip: lineOf(pc, "Jsou-li ℓ(v) i r(v) červené", head),
  };
};

interface MoveLines {
  flip: number;
  cond: number;
  rot1: number;
  rot2: number;
  flip2: number;
}

const moveLeftLines = (pc: readonly string[]): MoveLines => {
  const head = lineOf(pc, "Procedura MoveRedLeft");
  return {
    flip: lineOf(pc, "Přebarvíme v, ℓ(v) a r(v)", head),
    cond: lineOf(pc, "Pokud je ℓ(r(v)) červený", head),
    rot1: lineOf(pc, "Rotace(r(v), ℓ(r(v)))", head),
    rot2: lineOf(pc, "x ← Rotace(v, r(v))", head),
    flip2: lineOf(pc, "Přebarvíme x", head),
  };
};

const moveRightLines = (pc: readonly string[]): MoveLines => {
  const head = lineOf(pc, "Procedura MoveRedRight");
  const rot = lineOf(pc, "t ← Rotace(v, ℓ(v))", head);
  return {
    flip: lineOf(pc, "Přebarvíme v, ℓ(v) a r(v)", head),
    cond: lineOf(pc, "Pokud je ℓ(ℓ(v)) červený", head),
    rot1: rot,
    rot2: rot,
    flip2: lineOf(pc, "Přebarvíme t", head),
  };
};

interface MinLines {
  empty: number;
  cond: number;
  moveCall: number;
  recurse: number;
  fix: FixupLines;
  move: MoveLines;
}

const minLines = (pc: readonly string[]): MinLines => {
  const head = lineOf(pc, "Procedura LlrbDeleteMin");
  return {
    empty: lineOf(pc, "Pokud ℓ(v) = ∅", head),
    cond: lineOf(pc, "Pokud ℓ(v) i ℓ(ℓ(v)) jsou černé", head),
    moveCall: lineOf(pc, "v ← MoveRedLeft(v)", head),
    recurse: lineOf(pc, "ℓ(v) ← LlrbDeleteMin", head),
    fix: fixupLines(pc, lineOf(pc, "v ← LlrbFixup(v)", head)),
    move: moveLeftLines(pc),
  };
};

const INS23 = {
  empty: lineOf(PC_LLRB_INSERT_23, "Pokud v = ∅"),
  equal: lineOf(PC_LLRB_INSERT_23, "Pokud x = k(v)"),
  less: lineOf(PC_LLRB_INSERT_23, "Pokud x < k(v)"),
  more: lineOf(PC_LLRB_INSERT_23, "Pokud x > k(v)"),
  fix: fixupLines(
    PC_LLRB_INSERT_23,
    lineOf(PC_LLRB_INSERT_23, "v ← LlrbFixup(v)"),
  ),
};

const INS24 = {
  empty: lineOf(PC_LLRB_INSERT_24, "Pokud v = ∅"),
  equal: lineOf(PC_LLRB_INSERT_24, "Pokud x = k(v)"),
  flip: lineOf(PC_LLRB_INSERT_24, "Jsou-li ℓ(v) i r(v) červené"),
  less: lineOf(PC_LLRB_INSERT_24, "Pokud x < k(v)"),
  more: lineOf(PC_LLRB_INSERT_24, "Pokud x > k(v)"),
  rotL: lineOf(PC_LLRB_INSERT_24, "Je-li ℓ(v) černý"),
  rotR: lineOf(PC_LLRB_INSERT_24, "Jinak je-li ℓ(v) červený"),
};

const DEL = {
  empty: lineOf(PC_LLRB_DELETE, "Pokud v = ∅"),
  less: lineOf(PC_LLRB_DELETE, "Pokud x < k(v)"),
  condL: lineOf(PC_LLRB_DELETE, "Pokud ℓ(v) i ℓ(ℓ(v)) existují"),
  moveL: lineOf(PC_LLRB_DELETE, "v ← MoveRedLeft(v)"),
  recL: lineOf(PC_LLRB_DELETE, "ℓ(v) ← LlrbDelete"),
  other: lineOf(PC_LLRB_DELETE, "Jinak:"),
  rot: lineOf(PC_LLRB_DELETE, "Pokud ℓ(v) je červený"),
  leaf: lineOf(PC_LLRB_DELETE, "Pokud k(v) = x a r(v) = ∅"),
  remove: lineOf(PC_LLRB_DELETE, "v ← ∅ a skončíme"),
  condR: lineOf(PC_LLRB_DELETE, "Pokud r(v) i ℓ(r(v)) existují"),
  moveR: lineOf(PC_LLRB_DELETE, "v ← MoveRedRight(v)"),
  hit: lineOf(PC_LLRB_DELETE, "Pokud k(v) = x:"),
  swap: lineOf(PC_LLRB_DELETE, "Prohodíme"),
  delMin: lineOf(PC_LLRB_DELETE, "r(v) ← LlrbDeleteMin"),
  recR: lineOf(PC_LLRB_DELETE, "r(v) ← LlrbDelete(r(v), x)"),
  fix: fixupLines(PC_LLRB_DELETE, lineOf(PC_LLRB_DELETE, "v ← LlrbFixup(v)")),
  min: minLines(PC_LLRB_DELETE),
  moveRight: moveRightLines(PC_LLRB_DELETE),
};

const DMIN = minLines(PC_LLRB_DELETE_MIN);

const DMAX = {
  rot: lineOf(PC_LLRB_DELETE_MAX, "Pokud ℓ(v) je červený"),
  empty: lineOf(PC_LLRB_DELETE_MAX, "Pokud r(v) = ∅"),
  cond: lineOf(PC_LLRB_DELETE_MAX, "Pokud r(v) i ℓ(r(v)) jsou černé"),
  moveCall: lineOf(PC_LLRB_DELETE_MAX, "v ← MoveRedRight(v)"),
  recurse: lineOf(PC_LLRB_DELETE_MAX, "r(v) ← LlrbDeleteMax"),
  fix: fixupLines(
    PC_LLRB_DELETE_MAX,
    lineOf(PC_LLRB_DELETE_MAX, "v ← LlrbFixup(v)"),
  ),
  move: moveRightLines(PC_LLRB_DELETE_MAX),
};

/* ================================================================== základní úpravy */

const leftOf = (st: LlrbState, id: number | null) =>
  id === null ? null : st.nodes[id].left;
const rightOf = (st: LlrbState, id: number | null) =>
  id === null ? null : st.nodes[id].right;
const k = (st: LlrbState, id: number) => fmtKey(st.nodes[id].key);

/** Otec p ukazuje místo na `from` na `to` (p = null: kořen). */
function setChild(
  st: LlrbState,
  p: number | null,
  from: number | null,
  to: number | null,
  side?: "left" | "right",
) {
  if (p === null) {
    st.root = to;
    return;
  }
  const P = st.nodes[p];
  if (side === "left" || (side === undefined && P.left === from)) P.left = to;
  else P.right = to;
}

/** Rotace(v, t): t je syn v, po rotaci je t nahoře (str. 207, 208). Barvy: t převezme hranu nad v. */
function rotate(st: LlrbState, v: number, t: number, p: number | null) {
  const V = st.nodes[v];
  const T = st.nodes[t];
  if (V.left === t) {
    V.left = T.right;
    T.right = v;
  } else {
    V.right = T.left;
    T.left = v;
  }
  const c = T.red;
  T.red = V.red;
  V.red = c;
  setChild(st, p, v, t);
}

/** Přebarvení v, ℓ(v) a r(v) (str. 207): každá z barev se obrátí. */
function flipColors(st: LlrbState, v: number) {
  for (const id of [v, st.nodes[v].left, st.nodes[v].right])
    if (id !== null) st.nodes[id].red = !st.nodes[id].red;
}

/* ================================================================== kroky */

type G<R> = Generator<Step<LlrbState>, R, unknown>;

interface Ctx {
  st: LlrbState;
  /** vrcholy na zásobníku rekurze (cesta od kořene) – kreslí se jako prošlá cesta */
  stack: number[];
  rot: number;
  flips: number;
  x: number | null;
  /** stavba bez kroků (Vytvořit): kroky se neklonují */
  silent: boolean;
  /** Insert: klíč už ve stromu byl (id vrcholu) */
  found?: number;
  /** Insert: id nového vrcholu */
  inserted?: number;
  /** Delete: hledání skončilo v ∅ */
  missing?: boolean;
  /** Delete: vrchol se odstranil */
  removed?: boolean;
}

const newCtx = (st: LlrbState, x: number | null, silent = false): Ctx => ({
  st,
  stack: [],
  rot: 0,
  flips: 0,
  x,
  silent,
});

const DUMMY = { line: null, message: "" } as const;

/** Krok: prošlá cesta (zásobník rekurze), aktuální vrchol a zvláštní značky kroku. */
function shot(
  c: Ctx,
  line: number,
  message: string,
  extra: {
    nodes?: Record<number, string>;
    edges?: Record<string, string>;
  } = {},
): Step<LlrbState> {
  if (c.silent) return { state: c.st, ...DUMMY };
  const st = c.st;
  st.marks = {};
  st.edgeMarks = {};
  const path = c.stack.filter((id) => st.nodes[id] !== undefined);
  for (let i = 1; i < path.length; i++) {
    const a = st.nodes[path[i - 1]];
    if (a.left === path[i] || a.right === path[i])
      st.edgeMarks[path[i - 1] + "-" + path[i]] = "e-active";
  }
  const cur = path[path.length - 1];
  if (cur !== undefined) st.marks[cur] = "n-active";
  Object.assign(st.marks, extra.nodes ?? {});
  Object.assign(st.edgeMarks, extra.edges ?? {});
  st.vars = {
    ...(c.x !== null ? { x: c.x } : {}),
    rotace: c.rot,
    přebarvení: c.flips,
  };
  return snap(st, line, message);
}

/** Nahradí vrchol na zásobníku (po rotaci je na jeho místě jiný). */
function restack(c: Ctx, from: number, to: number) {
  const i = c.stack.lastIndexOf(from);
  if (i >= 0) c.stack[i] = to;
}

/** Rotace červené hrany v–t se dvěma kroky (před a po); vrací nový horní vrchol t. */
function* rotStep(
  c: Ctx,
  v: number,
  t: number,
  p: number | null,
  line: number,
  why: string,
): G<number> {
  const st = c.st;
  yield shot(
    c,
    line,
    `${why}: rotujeme červenou hranu ${k(st, v)}–${k(st, t)}.`,
    {
      nodes: { [v]: "n-compare", [t]: "n-compare" },
      edges: { [v + "-" + t]: "e-rotate" },
    },
  );
  rotate(st, v, t, p);
  c.rot++;
  restack(c, v, t);
  yield shot(
    c,
    line,
    `Po rotaci je nahoře ${k(st, t)}, ${k(st, v)} pod ním visí ${st.nodes[t].left === v ? "vlevo" : "vpravo"} na červené hraně.`,
    {
      nodes: { [v]: "n-compare", [t]: "n-compare" },
      edges: { [t + "-" + v]: "e-rotate" },
    },
  );
  return t;
}

/** Přebarvení v, ℓ(v), r(v) se dvěma kroky (před a po). */
function* flipStep(c: Ctx, v: number, line: number, why: string): G<void> {
  const st = c.st;
  const n = st.nodes[v];
  const ids = [n.left, n.right, v].filter((id): id is number => id !== null);
  const marks = Object.fromEntries(ids.map((id) => [id, "n-flip"]));
  const names = ids.map((id) => k(st, id));
  yield shot(
    c,
    line,
    `Přebarvíme ${names.slice(0, -1).join(", ")} i ${names[names.length - 1]}: ${why}`,
    { nodes: marks },
  );
  flipColors(st, v);
  c.flips++;
  const root = v === st.root ? " Barva hrany nad kořenem nemá význam." : "";
  yield shot(
    c,
    line,
    `Po přebarvení: ${ids
      .filter((id) => id !== v)
      .map(
        (id) =>
          `hrana do ${k(st, id)} je ${st.nodes[id].red ? "červená" : "černá"}`,
      )
      .join(", ")}.${root}`,
    { nodes: marks },
  );
}

/** LlrbFixup(v) (str. 210) – při návratu z rekurze; vrací nový kořen podstromu. */
function* fixup(c: Ctx, v: number, p: number | null, L: FixupLines): G<number> {
  const st = c.st;
  let acted = false;
  if (!isRed(st, leftOf(st, v)) && isRed(st, rightOf(st, v))) {
    v = yield* rotStep(
      c,
      v,
      rightOf(st, v)!,
      p,
      L.rotL,
      `LlrbFixup(${k(st, v)}): ℓ(v) je černý a r(v) červený`,
    );
    acted = true;
  } else if (isRed(st, leftOf(st, v)) && isRed(st, leftOf(st, leftOf(st, v)))) {
    v = yield* rotStep(
      c,
      v,
      leftOf(st, v)!,
      p,
      L.rotR,
      `LlrbFixup(${k(st, v)}): ℓ(v) i ℓ(ℓ(v)) jsou červené`,
    );
    acted = true;
  }
  if (isRed(st, leftOf(st, v)) && isRed(st, rightOf(st, v))) {
    yield* flipStep(
      c,
      v,
      L.flip,
      `ℓ(v) i r(v) jsou červené – 4-vrchol se rozštěpí a ${k(st, v)} přejde o patro výš.`,
    );
    acted = true;
  }
  if (!acted)
    yield shot(c, L.call, `Návrat do ${k(st, v)}: LlrbFixup nemá co opravit.`);
  return v;
}

/* ------------------------------------------------------------------ Insert */

function* insert23(
  c: Ctx,
  v: number | null,
  p: number | null,
  side: "left" | "right" | undefined,
  x: number,
): G<number> {
  const st = c.st;
  if (v === null) return yield* attach(c, p, side, x, INS23.empty);
  c.stack.push(v);
  const key = st.nodes[v].key;
  if (x === key) {
    c.found = v;
    yield shot(
      c,
      INS23.equal,
      `x = k(v) = ${fmtKey(x)}: klíč už ve stromu je, končíme.`,
      {
        nodes: { [v]: "n-found" },
      },
    );
    c.stack.pop();
    return v;
  }
  if (x < key) {
    yield shot(
      c,
      INS23.less,
      `${fmtKey(x)} < ${fmtKey(key)}: pokračujeme doleva.`,
    );
    yield* insert23(c, st.nodes[v].left, v, "left", x);
  } else {
    yield shot(
      c,
      INS23.more,
      `${fmtKey(x)} > ${fmtKey(key)}: pokračujeme doprava.`,
    );
    yield* insert23(c, st.nodes[v].right, v, "right", x);
  }
  const top = yield* fixup(c, v, p, INS23.fix);
  c.stack.pop();
  return top;
}

function* insert24(
  c: Ctx,
  v: number | null,
  p: number | null,
  side: "left" | "right" | undefined,
  x: number,
): G<number> {
  const st = c.st;
  if (v === null) return yield* attach(c, p, side, x, INS24.empty);
  c.stack.push(v);
  const key = st.nodes[v].key;
  if (x === key) {
    c.found = v;
    yield shot(
      c,
      INS24.equal,
      `x = k(v) = ${fmtKey(x)}: klíč už ve stromu je, končíme.`,
      {
        nodes: { [v]: "n-found" },
      },
    );
    c.stack.pop();
    return v;
  }
  if (isRed(st, leftOf(st, v)) && isRed(st, rightOf(st, v)))
    yield* flipStep(
      c,
      v,
      INS24.flip,
      `ℓ(v) i r(v) jsou červené – cestou dolů rozštěpíme 4-vrchol, ${fmtKey(key)} přejde o patro výš.`,
    );
  if (x < key) {
    yield shot(
      c,
      INS24.less,
      `${fmtKey(x)} < ${fmtKey(key)}: pokračujeme doleva.`,
    );
    yield* insert24(c, st.nodes[v].left, v, "left", x);
  } else {
    yield shot(
      c,
      INS24.more,
      `${fmtKey(x)} > ${fmtKey(key)}: pokračujeme doprava.`,
    );
    yield* insert24(c, st.nodes[v].right, v, "right", x);
  }
  let top = v;
  if (!isRed(st, leftOf(st, v)) && isRed(st, rightOf(st, v)))
    top = yield* rotStep(
      c,
      v,
      rightOf(st, v)!,
      p,
      INS24.rotL,
      `Návrat do ${fmtKey(key)}: ℓ(v) je černý a r(v) červený`,
    );
  else if (isRed(st, leftOf(st, v)) && isRed(st, leftOf(st, leftOf(st, v))))
    top = yield* rotStep(
      c,
      v,
      leftOf(st, v)!,
      p,
      INS24.rotR,
      `Návrat do ${fmtKey(key)}: ℓ(v) i ℓ(ℓ(v)) jsou červené`,
    );
  else
    yield shot(
      c,
      INS24.rotR,
      `Návrat do ${fmtKey(key)}: žádná rotace není potřeba.`,
    );
  c.stack.pop();
  return top;
}

/** v = ∅: nový červený vrchol s klíčem x na místě vnějšího vrcholu. */
function* attach(
  c: Ctx,
  p: number | null,
  side: "left" | "right" | undefined,
  x: number,
  line: number,
): G<number> {
  const st = c.st;
  const id = st.nextId++;
  st.nodes[id] = { id, key: x, left: null, right: null, red: true };
  setChild(st, p, null, id, side);
  c.inserted = id;
  yield shot(
    c,
    line,
    p === null
      ? `v = ∅: strom je prázdný, ${fmtKey(x)} bude kořen.`
      : `v = ∅: připojíme nový vrchol ${fmtKey(x)} červenou hranou – klíč se přidá k ostrůvku otce ${k(st, p)}.`,
    { nodes: { [id]: "n-new" } },
  );
  return id;
}

/* ------------------------------------------------------------------ Delete */

/** MoveRedLeft(v) / MoveRedRight(v) (str. 212, 213); vrací nový kořen podstromu. */
function* moveRed(
  c: Ctx,
  v: number,
  p: number | null,
  dir: "left" | "right",
  L: MoveLines,
): G<number> {
  const st = c.st;
  const name = dir === "left" ? "MoveRedLeft" : "MoveRedRight";
  yield* flipStep(
    c,
    v,
    L.flip,
    `${name}(${k(st, v)}) – ${dir === "left" ? "levý" : "pravý"} syn tím přestane být 2-vrcholem (sloučí se s otcem a bratrem).`,
  );
  if (dir === "left") {
    const r = rightOf(st, v)!;
    const lr = leftOf(st, r);
    if (!isRed(st, lr)) {
      yield shot(
        c,
        L.cond,
        `ℓ(r(v)) není červený – bratr ${k(st, r)} nemá klíč navíc, stačilo přebarvení.`,
      );
      return v;
    }
    yield shot(
      c,
      L.cond,
      `ℓ(r(v)) = ${k(st, lr!)} je červený – vznikl by nekorektní 5-vrchol, půjčíme si klíč od bratra.`,
      { nodes: { [lr!]: "n-compare" } },
    );
    yield* rotStep(c, r, lr!, v, L.rot1, `Rotace(r(v), ℓ(r(v)))`);
    const x = yield* rotStep(
      c,
      v,
      rightOf(st, v)!,
      p,
      L.rot2,
      `x ← Rotace(v, r(v))`,
    );
    yield* flipStep(
      c,
      x,
      L.flip2,
      `x = ${k(st, x)} – zbytek ostrůvku se rozdělí.`,
    );
    return x;
  }
  const l = leftOf(st, v)!;
  const ll = leftOf(st, l);
  if (!isRed(st, ll)) {
    yield shot(
      c,
      L.cond,
      `ℓ(ℓ(v)) není červený – nalevo nevznikl nekorektní 4-vrchol, stačilo přebarvení.`,
    );
    return v;
  }
  yield shot(
    c,
    L.cond,
    `ℓ(ℓ(v)) = ${k(st, ll!)} je červený – nalevo vznikl nekorektní 4-vrchol.`,
    { nodes: { [ll!]: "n-compare" } },
  );
  const t = yield* rotStep(c, v, l, p, L.rot1, `t ← Rotace(v, ℓ(v))`);
  yield* flipStep(c, t, L.flip2, `t = ${k(st, t)} – opravíme barvy kolem t.`);
  return t;
}

/** Odstranění vrcholu v bez synů (v ← ∅). */
function* removeLeaf(
  c: Ctx,
  v: number,
  p: number | null,
  line: number,
  message: string,
): G<null> {
  const st = c.st;
  yield shot(c, line, message, { nodes: { [v]: "n-removed" } });
  setChild(st, p, v, null);
  delete st.nodes[v];
  c.stack.pop();
  c.removed = true;
  return null;
}

function* deleteMin(
  c: Ctx,
  v: number,
  p: number | null,
  L: MinLines,
): G<number | null> {
  const st = c.st;
  c.stack.push(v);
  if (st.nodes[v].left === null)
    return yield* removeLeaf(
      c,
      v,
      p,
      L.empty,
      `ℓ(v) = ∅: ${k(st, v)} je minimum. Vede do něj červená hrana (invariant L), takže ho můžeme odstranit (v ← ∅).`,
    );
  const l = st.nodes[v].left!;
  if (!isRed(st, l) && !isRed(st, leftOf(st, l))) {
    yield shot(
      c,
      L.cond,
      `ℓ(v) = ${k(st, l)} i ℓ(ℓ(v)) jsou černé – sestoupili bychom do 2-vrcholu.`,
    );
    v = yield* moveRed(c, v, p, "left", L.move);
  } else
    yield shot(
      c,
      L.cond,
      `ℓ(v) = ${k(st, l)} nebo ℓ(ℓ(v)) je červený – invariant L platí i o patro níž.`,
    );
  yield shot(
    c,
    L.recurse,
    `Pokračujeme doleva do ${k(st, st.nodes[v].left!)}.`,
  );
  yield* deleteMin(c, st.nodes[v].left!, v, L);
  const top = yield* fixup(c, v, p, L.fix);
  c.stack.pop();
  return top;
}

function* deleteMax(c: Ctx, v: number, p: number | null): G<number | null> {
  const st = c.st;
  c.stack.push(v);
  if (isRed(st, leftOf(st, v)))
    v = yield* rotStep(
      c,
      v,
      leftOf(st, v)!,
      p,
      DMAX.rot,
      `ℓ(v) je červený – otočíme ho doprava`,
    );
  if (st.nodes[v].right === null)
    return yield* removeLeaf(
      c,
      v,
      p,
      DMAX.empty,
      `r(v) = ∅: ${k(st, v)} je maximum. Vede do něj červená hrana (invariant R), takže ho odstraníme (v ← ∅).`,
    );
  const r = st.nodes[v].right!;
  if (!isRed(st, r) && !isRed(st, leftOf(st, r))) {
    yield shot(
      c,
      DMAX.cond,
      `r(v) = ${k(st, r)} i ℓ(r(v)) jsou černé – sestoupili bychom do 2-vrcholu.`,
    );
    v = yield* moveRed(c, v, p, "right", DMAX.move);
  } else
    yield shot(
      c,
      DMAX.cond,
      `r(v) = ${k(st, r)} nebo ℓ(r(v)) je červený – invariant R platí i o patro níž.`,
    );
  yield shot(
    c,
    DMAX.recurse,
    `Pokračujeme doprava do ${k(st, st.nodes[v].right!)}.`,
  );
  yield* deleteMax(c, st.nodes[v].right!, v);
  const top = yield* fixup(c, v, p, DMAX.fix);
  c.stack.pop();
  return top;
}

function* del(
  c: Ctx,
  v: number | null,
  p: number | null,
  x: number,
): G<number | null> {
  const st = c.st;
  if (v === null) {
    c.missing = true;
    yield shot(
      c,
      DEL.empty,
      `v = ∅: klíč ${fmtKey(x)} ve stromu nebyl, vracíme se.`,
    );
    return null;
  }
  c.stack.push(v);
  if (x < st.nodes[v].key) {
    yield shot(c, DEL.less, `${fmtKey(x)} < ${k(st, v)}: půjdeme doleva.`);
    const l = st.nodes[v].left;
    if (l !== null && !isRed(st, l) && !isRed(st, leftOf(st, l))) {
      yield shot(
        c,
        DEL.condL,
        `ℓ(v) = ${k(st, l)} i ℓ(ℓ(v)) jsou černé – sestoupili bychom do 2-vrcholu (invariant D).`,
      );
      v = yield* moveRed(c, v, p, "left", DEL.min.move);
    }
    yield* del(c, st.nodes[v].left, v, x);
  } else {
    yield shot(
      c,
      DEL.other,
      x === st.nodes[v].key
        ? `x = k(v) = ${fmtKey(x)}: vrchol jsme našli.`
        : `${fmtKey(x)} > ${k(st, v)}: půjdeme doprava.`,
      x === st.nodes[v].key ? { nodes: { [v]: "n-found" } } : {},
    );
    if (isRed(st, leftOf(st, v)))
      v = yield* rotStep(
        c,
        v,
        leftOf(st, v)!,
        p,
        DEL.rot,
        `ℓ(v) je červený – otočíme ho doprava`,
      );
    if (st.nodes[v].key === x && st.nodes[v].right === null)
      return yield* removeLeaf(
        c,
        v,
        p,
        DEL.remove,
        `k(v) = ${fmtKey(x)} a r(v) = ∅: vrchol nemá syny a vede do něj červená hrana – odstraníme ho.`,
      );
    const r = st.nodes[v].right;
    if (r !== null && !isRed(st, r) && !isRed(st, leftOf(st, r))) {
      yield shot(
        c,
        DEL.condR,
        `r(v) = ${k(st, r)} i ℓ(r(v)) jsou černé – sestoupili bychom do 2-vrcholu (invariant D).`,
      );
      v = yield* moveRed(c, v, p, "right", DEL.moveRight);
    }
    if (st.nodes[v].key === x) {
      let m = st.nodes[v].right!;
      const way: Record<number, string> = {};
      while (st.nodes[m].left !== null) {
        way[m] = "n-compare";
        m = st.nodes[m].left!;
      }
      yield shot(
        c,
        DEL.swap,
        `Minimum pravého podstromu je ${k(st, m)} – prohodíme ho s ${fmtKey(x)}.`,
        { nodes: { ...way, [v]: "n-found", [m]: "n-removed" } },
      );
      const mk = st.nodes[m].key;
      st.nodes[m].key = x;
      st.nodes[v].key = mk;
      yield shot(
        c,
        DEL.swap,
        `Klíč ${k(st, v)} je teď ve vrcholu, kde bylo ${fmtKey(x)}; ${fmtKey(x)} smažeme z pravého podstromu jako minimum.`,
        { nodes: { [v]: "n-found", [m]: "n-removed" } },
      );
      yield shot(
        c,
        DEL.delMin,
        `r(v) ← LlrbDeleteMin(${k(st, st.nodes[v].right!)})`,
      );
      yield* deleteMin(c, st.nodes[v].right!, v, DEL.min);
    } else {
      yield* del(c, st.nodes[v].right, v, x);
    }
  }
  const top = yield* fixup(c, v, p, DEL.fix);
  c.stack.pop();
  return top;
}

/* ------------------------------------------------------------------ veřejné operace */

const sizeText = (st: LlrbState) => {
  const n = llrbSize(st);
  return n === 0
    ? "strom je prázdný"
    : `strom má ${plural(n, "vrchol", "vrcholy", "vrcholů")}, hloubka ${llrbDepth(st)}, černá hloubka ${blackHeight(st)}`;
};

const counts = (c: Ctx) =>
  `${plural(c.rot, "rotace", "rotace", "rotací")}, ${plural(c.flips, "přebarvení", "přebarvení", "přebarvení")}`;

/** Závěr operace: kořen černý, bez značek, v proměnných počty rotací a přebarvení. */
function finish(
  c: Ctx,
  title: string,
  result: string,
  outcome?: "neutral",
): Step<LlrbState> {
  const st = c.st;
  if (st.root !== null) st.nodes[st.root].red = false;
  st.marks = {};
  st.edgeMarks = {};
  st.vars = {
    ...(c.x !== null ? { x: c.x } : {}),
    rotace: c.rot,
    přebarvení: c.flips,
  };
  const step = snap(st, null, `${title}: ${result}`);
  return outcome ? { ...step, outcome } : step;
}

export function* llrbInsert(st: LlrbState, x: number): StepGen<LlrbState> {
  yield* insertCore(newCtx(st, x), x);
}

function* insertCore(c: Ctx, x: number): G<void> {
  const st = c.st;
  if (st.variant === "24") yield* insert24(c, st.root, null, undefined, x);
  else yield* insert23(c, st.root, null, undefined, x);
  const title = `Insert(${fmtKey(x)})`;
  if (c.found !== undefined)
    yield finish(
      c,
      title,
      `klíč už ve stromu je, nic se nezměnilo.`,
      "neutral",
    );
  else yield finish(c, title, `vloženo; ${sizeText(st)}; ${counts(c)}.`);
}

export function* llrbDelete(st: LlrbState, x: number): StepGen<LlrbState> {
  const before = llrbSpec(st);
  const c = newCtx(st, x);
  yield* del(c, st.root, null, x);
  const title = `Delete(${fmtKey(x)})`;
  if (c.missing && !c.removed) {
    if (llrbSpec(st) === before)
      yield finish(
        c,
        title,
        `klíč ${fmtKey(x)} ve stromu nebyl, strom se nezměnil.`,
        "neutral",
      );
    else
      yield finish(
        c,
        title,
        `klíč ${fmtKey(x)} ve stromu nebyl; MoveRedLeft/Right a LlrbFixup ale strom cestou přestavěly (pořád je to platný LLRB strom); ${counts(c)}.`,
      );
  } else yield finish(c, title, `smazáno; ${sizeText(st)}; ${counts(c)}.`);
}

export function* llrbDeleteMin(st: LlrbState): StepGen<LlrbState> {
  const c = newCtx(st, null);
  if (st.root === null) {
    yield finish(c, "DeleteMin", "strom je prázdný.", "neutral");
    return;
  }
  const min = llrbKeys(st)[0];
  yield* deleteMin(c, st.root, null, DMIN);
  yield finish(
    c,
    "DeleteMin",
    `smazáno minimum ${fmtKey(min)}; ${sizeText(st)}; ${counts(c)}.`,
  );
}

export function* llrbDeleteMax(st: LlrbState): StepGen<LlrbState> {
  const c = newCtx(st, null);
  if (st.root === null) {
    yield finish(c, "DeleteMax", "strom je prázdný.", "neutral");
    return;
  }
  const keys = llrbKeys(st);
  const max = keys[keys.length - 1];
  yield* deleteMax(c, st.root, null);
  yield finish(
    c,
    "DeleteMax",
    `smazáno maximum ${fmtKey(max)}; ${sizeText(st)}; ${counts(c)}.`,
  );
}

/** Find(x) jako v obyčejném BVS (str. 215: čas lineární s hloubkou). Řádky podle PC_FIND z bst.ts. */
export function* llrbFind(st: LlrbState, x: number): StepGen<LlrbState> {
  const c = newCtx(st, x);
  let v = st.root;
  yield shot(c, 1, "v ← kořen");
  while (v !== null) {
    c.stack.push(v);
    const key = st.nodes[v].key;
    if (key === x) {
      yield shot(c, 3, `x = klíč(v) = ${fmtKey(x)}: nalezeno.`, {
        nodes: { [v]: "n-found" },
      });
      yield finish(
        c,
        `Find(${fmtKey(x)})`,
        `nalezen v hloubce ${c.stack.length - 1}.`,
      );
      return;
    }
    yield shot(
      c,
      x < key ? 4 : 5,
      `${fmtKey(x)} ${x < key ? "<" : ">"} ${fmtKey(key)}: jdeme ${x < key ? "doleva" : "doprava"}.`,
    );
    v = x < key ? st.nodes[v].left : st.nodes[v].right;
  }
  yield shot(c, 6, `Došli jsme do ∅ – ${fmtKey(x)} ve stromu není.`);
  yield finish(c, `Find(${fmtKey(x)})`, "nenalezen.", "neutral");
}

/** Strom z klíčů vložených v daném pořadí (LlrbInsert zvolené varianty), bez kroků. */
export function buildLlrb(
  keys: readonly number[],
  variant: LlrbVariant,
): LlrbState {
  const st = emptyLlrb(variant);
  for (const x of keys) {
    const c = newCtx(st, x, true);
    const gen =
      variant === "24"
        ? insert24(c, st.root, null, undefined, x)
        : insert23(c, st.root, null, undefined, x);
    while (!gen.next().done);
    if (st.root !== null) st.nodes[st.root].red = false;
  }
  st.marks = {};
  st.edgeMarks = {};
  st.vars = {};
  return st;
}
