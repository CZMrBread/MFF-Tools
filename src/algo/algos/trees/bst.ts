import { snap, type Step, type StepGen } from "../../core/steps";
import type { TEdge, TNode } from "../../views/TreeView";

export interface BNode {
  id: number;
  key: number;
  left: number | null;
  right: number | null;
  /** hloubka podstromu počítaná na vrcholy (list 1, prázdný podstrom 0); udržuje se u AVL */
  h: number;
}

export interface TreeState {
  nodes: Record<number, BNode>;
  root: number | null;
  marks: Record<number, string>;
  edgeMarks: Record<string, string>;
  vars: Record<string, string | number>;
  nextId: number;
  /** zobrazovat znaménka (AVL) */
  avl: boolean;
  /** BB[α]: parametr, pro který strom naposledy prokazatelně splňoval vyvažovací podmínku (viz trees2.ts) */
  alpha?: number;
}

export const emptyTree = (avl: boolean): TreeState => ({
  nodes: {},
  root: null,
  marks: {},
  edgeMarks: {},
  vars: {},
  nextId: 1,
  avl,
});

export const height = (st: TreeState, id: number | null) =>
  id === null ? 0 : st.nodes[id].h;
export const sign = (st: TreeState, id: number) =>
  height(st, st.nodes[id].right) - height(st, st.nodes[id].left);
export function updateH(st: TreeState, id: number) {
  const n = st.nodes[id];
  n.h = 1 + Math.max(height(st, n.left), height(st, n.right));
}

/** Rozložení: x podle in-order pořadí, y = hloubka. */
export function layout(st: TreeState): { nodes: TNode[]; edges: TEdge[] } {
  const order: number[] = [];
  const depth = new Map<number, number>();
  const walk = (id: number | null, d: number) => {
    if (id === null) return;
    const n = st.nodes[id];
    walk(n.left, d + 1);
    order.push(id);
    depth.set(id, d);
    walk(n.right, d + 1);
  };
  walk(st.root, 0);
  const total = Math.max(order.length, 1);
  const nodes: TNode[] = order.map((id, i) => ({
    id,
    label: String(st.nodes[id].key),
    x: total === 1 ? 0.5 : i / (total - 1),
    y: depth.get(id)!,
    cls: st.marks[id],
    sub: st.avl ? fmtSign(sign(st, id)) : undefined,
  }));
  const edges: TEdge[] = [];
  for (const id of order) {
    const n = st.nodes[id];
    for (const c of [n.left, n.right])
      if (c !== null)
        edges.push({ from: id, to: c, cls: st.edgeMarks[id + "-" + c] });
  }
  return { nodes, edges };
}

/** Znaménko s typografickým minusem: +1, 0, −1. */
export const fmtSign = (s: number) =>
  s > 0 ? "+" + s : s < 0 ? "−" + -s : "0";

/** Česká množná čísla: plural(3, 'rotace', 'rotace', 'rotací') → „3 rotace“. */
export const plural = (n: number, one: string, few: string, many: string) =>
  `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

/** Hloubka stromu = počet hran na nejdelší cestě z kořene (prázdný strom −1, samotný kořen 0). */
export function treeDepth(st: TreeState): number {
  const walk = (id: number | null): number =>
    id === null
      ? -1
      : 1 + Math.max(walk(st.nodes[id].left), walk(st.nodes[id].right));
  return walk(st.root);
}

/** Hloubka vrcholu id (kořen 0). */
export function depthOf(st: TreeState, id: number): number {
  let d = 0;
  let v = st.root;
  const x = st.nodes[id].key;
  while (v !== null && v !== id) {
    v = x < st.nodes[v].key ? st.nodes[v].left : st.nodes[v].right;
    d++;
  }
  return d;
}

/** Číslo s typografickým minusem (−5 místo -5). */
export const fmtKey = (x: number) => String(x).replace("-", "−");

/** „strom má 8 vrcholů, hloubka 3“ / „strom je prázdný“ – do závěrečné zprávy operace. */
export function treeSummary(st: TreeState): string {
  const n = Object.keys(st.nodes).length;
  return n === 0
    ? "strom je prázdný"
    : `strom má ${plural(n, "vrchol", "vrcholy", "vrcholů")}, hloubka ${treeDepth(st)}`;
}

/** Závěrečný krok operace: „Insert(35): …“ bez řádku pseudokódu (Visualizer k němu přidá ✓, u outcome „neutral“ ⓘ). */
export function finalStep<S>(
  st: S,
  op: string,
  x: number,
  result: string,
  /** „neutral“ = operace bez účinku (nenalezeno, už existuje, strom se nezměnil) – místo ✓ se ukáže ⓘ */
  outcome?: "neutral",
): Step<S> {
  const step = snap(st, null, `${op}(${fmtKey(x)}): ${result}`);
  return outcome ? { ...step, outcome } : step;
}

/* ------------------------------------------------------------------ ochrana vstupu */

/** Klíčem smí být jen konečné číslo – s NaN by porovnávání klíčů přestalo dávat smysl. */
export function keyError(x: number): string | null {
  return typeof x === "number" && Number.isFinite(x)
    ? null
    : "Klíč x musí být číslo – operace se neprovedla.";
}

/** Jediný krok s vysvětlením, proč se operace neprovedla; strom zůstává beze změny. */
export function* rejectOp(st: TreeState, message: string): StepGen<TreeState> {
  clearMarks(st);
  st.vars = {};
  yield { ...snap(st, null, message), error: true };
}

/* ------------------------------------------------------------------ pseudokódy */

export const PC_FIND = [
  "Find(x):",
  "  v ← kořen",
  "  Dokud v ≠ ∅:",
  "    Pokud x = klíč(v): vrátíme v.",
  "    Pokud x < klíč(v): v ← levý syn(v)",
  "    Jinak: v ← pravý syn(v)",
  "  Vrátíme ∅ (nenalezeno).",
];

export const PC_INSERT = [
  "Insert(x):",
  "  Hledáme x jako ve Find.",
  "  Pokud x už ve stromu je, nic neděláme.",
  "  Jinak na místo, kde hledání skončilo (∅),",
  "  připojíme nový list s klíčem x.",
];

export const PC_DELETE = [
  "Delete(x):",
  "  v ← Find(x); pokud v = ∅, končíme.",
  "  Pokud v je list: odpojíme ho.",
  "  Pokud v má jediného syna: nahradíme v tímto synem.",
  "  Jinak (dva synové):",
  "    s ← minimum pravého podstromu v (následník)",
  "    klíč(v) ← klíč(s)",
  "    Smažeme s (má nejvýše jednoho syna).",
];

/** Vyvažování při návratu ke kořeni – stejné pro AvlInsert i AvlDelete (řádky 2–11 obou pseudokódů). */
const PC_AVL_REBALANCE = [
  "  Vracíme se po cestě ke kořeni; v každém vrcholu v:",
  "    Přepočítáme hloubku podstromu a znaménko δ(v) = h(pravý) − h(levý).",
  "    Pokud δ(v) = +2 (pravý podstrom je o 2 hlubší), y ← pravý syn v:",
  "      δ(y) ≥ 0: jednoduchá rotace doleva (hrana v–y)",
  "      δ(y) = −1: dvojitá rotace (doprava u y, pak doleva u v)",
  "    Pokud δ(v) = −2 (levý podstrom je o 2 hlubší), y ← levý syn v:",
  "      δ(y) ≤ 0: jednoduchá rotace doprava (hrana y–v)",
  "      δ(y) = +1: dvojitá rotace (doleva u y, pak doprava u v)",
  "    Má-li podstrom stejnou hloubku jako před operací, končíme;",
  "    jinak pokračujeme k otci.",
];

export const PC_AVL_INSERT = [
  "AvlInsert(x):",
  "  Vložíme x jako do obyčejného BST (nový list má δ = 0).",
  ...PC_AVL_REBALANCE,
];

export const PC_AVL_DELETE = [
  "AvlDelete(x):",
  "  Smažeme x jako v obyčejném BST (vrchol se dvěma syny nahradí následník).",
  ...PC_AVL_REBALANCE,
];

/* ------------------------------------------------------------------ řádky pseudokódu */

// BST a AVL sdílejí kód operací, ale ne pseudokód – každý krok si proto řádek bere z mapy podle druhu stromu.

interface InsertLines {
  descend: number;
  exists: number;
  attach: number;
}
const BST_INSERT: InsertLines = { descend: 1, exists: 2, attach: 4 };
const AVL_INSERT: InsertLines = { descend: 1, exists: 1, attach: 1 };

interface DeleteLines {
  descend: number;
  missing: number;
  leaf: number;
  oneChild: number;
  twoChildren: number;
  succ: number;
  copy: number;
  removeSucc: number;
}
const BST_DELETE: DeleteLines = {
  descend: 1,
  missing: 1,
  leaf: 2,
  oneChild: 3,
  twoChildren: 4,
  succ: 5,
  copy: 6,
  removeSucc: 7,
};
// v AVL pseudokódu je celé „obyčejné“ mazání shrnuto na řádku 1
const AVL_DELETE: DeleteLines = {
  descend: 1,
  missing: 1,
  leaf: 1,
  oneChild: 1,
  twoChildren: 1,
  succ: 1,
  copy: 1,
  removeSucc: 1,
};

/** Indexy do PC_AVL_INSERT i PC_AVL_DELETE (vyvažovací část je společná). */
const AVL = {
  walk: 2,
  sign: 3,
  plus2: 4,
  rotL: 5,
  dblRL: 6,
  minus2: 7,
  rotR: 8,
  dblLR: 9,
  stop: 10,
  up: 11,
} as const;

/* ------------------------------------------------------------------ operace */

const clearMarks = (st: TreeState) => {
  st.marks = {};
  st.edgeMarks = {};
};

export function* find(st: TreeState, x: number): StepGen<TreeState> {
  const err = keyError(x);
  if (err) {
    yield* rejectOp(st, err);
    return;
  }
  clearMarks(st);
  st.vars = { x };
  let v = st.root;
  let parent: number | null = null;
  let compared = 0;
  yield snap(
    st,
    1,
    st.root === null ? "Strom je prázdný." : "Začínáme v kořeni.",
  );
  while (v !== null) {
    st.marks = { [v]: "n-active" };
    if (parent !== null) st.edgeMarks[parent + "-" + v] = "e-active";
    const k = st.nodes[v].key;
    compared++;
    if (x === k) {
      st.marks[v] = "n-found";
      yield snap(st, 3, `Klíč ${x} nalezen.`);
      yield finalStep(
        st,
        "Find",
        x,
        `klíč nalezen. Leží v hloubce ${depthOf(st, v)}, porovnali jsme ${plural(compared, "klíč", "klíče", "klíčů")}.`,
      );
      return;
    }
    yield snap(
      st,
      x < k ? 4 : 5,
      `${x} ${x < k ? "<" : ">"} ${k}, jdeme ${x < k ? "doleva" : "doprava"}.`,
    );
    parent = v;
    v = x < k ? st.nodes[v].left : st.nodes[v].right;
  }
  yield snap(st, 6, `Narazili jsme na ∅ – klíč ${x} ve stromu není.`);
  yield finalStep(
    st,
    "Find",
    x,
    st.root === null
      ? "strom je prázdný, klíč v něm není."
      : `klíč ve stromu není (porovnali jsme ${plural(compared, "klíč", "klíče", "klíčů")}).`,
    "neutral",
  );
}

/** Vrátí id vrcholu, kde hledání skončilo (nalezený), nebo rodiče, pod nějž patří nový list. */
function* descend(
  st: TreeState,
  x: number,
  line: number,
): Generator<
  Step<TreeState>,
  { found: number | null; parent: number | null },
  unknown
> {
  let v = st.root;
  let parent: number | null = null;
  while (v !== null) {
    st.marks[v] = "n-active";
    if (parent !== null) st.edgeMarks[parent + "-" + v] = "e-active";
    const k = st.nodes[v].key;
    if (x === k) return { found: v, parent };
    yield snap(
      st,
      line,
      `${x} ${x < k ? "<" : ">"} ${k}, jdeme ${x < k ? "doleva" : "doprava"}.`,
    );
    parent = v;
    v = x < k ? st.nodes[v].left : st.nodes[v].right;
  }
  return { found: null, parent };
}

export function* insert(st: TreeState, x: number): StepGen<TreeState> {
  const err = keyError(x);
  if (err) {
    yield* rejectOp(st, err);
    return;
  }
  const L = st.avl ? AVL_INSERT : BST_INSERT;
  clearMarks(st);
  st.vars = { x };
  const r = yield* descend(st, x, L.descend);
  if (r.found !== null) {
    st.marks[r.found] = "n-found";
    yield snap(st, L.exists, `Klíč ${x} už ve stromu je – nic nevkládáme.`);
    yield finalStep(
      st,
      "Insert",
      x,
      `klíč už ve stromu byl, strom se nezměnil (${treeSummary(st)}).`,
      "neutral",
    );
    return;
  }
  const id = st.nextId++;
  st.nodes[id] = { id, key: x, left: null, right: null, h: 1 };
  if (r.parent === null) st.root = id;
  else if (x < st.nodes[r.parent].key) st.nodes[r.parent].left = id;
  else st.nodes[r.parent].right = id;
  st.marks[id] = "n-new";
  yield snap(
    st,
    L.attach,
    `Připojíme nový list ${x}${r.parent !== null ? ` pod vrchol ${st.nodes[r.parent].key}` : " jako kořen"}.`,
  );
  // podstrom na místě nového listu se prohloubil – informaci propagujeme od otce listu nahoru
  const rot =
    st.avl && r.parent !== null
      ? yield* rebalancePath(st, pathTo(st, r.parent), true)
      : 0;
  clearMarks(st);
  st.marks[id] = "n-new";
  yield finalStep(
    st,
    "Insert",
    x,
    `vložen nový list${st.avl ? `, ${rotationsDone(rot)}` : ` v hloubce ${depthOf(st, id)}`}; ${treeSummary(st)}.`,
  );
}

/** „bez rotace“ / „1 rotace“ / „2 rotace“ (dvojitá rotace se počítá jako dvě) */
const rotationsDone = (n: number) =>
  n === 0 ? "bez rotace" : plural(n, "rotace", "rotace", "rotací");

/** Cesta z kořene do vrcholu id (včetně). */
function pathTo(st: TreeState, id: number): number[] {
  const path: number[] = [];
  let v = st.root;
  const x = st.nodes[id].key;
  while (v !== null) {
    path.push(v);
    if (v === id) break;
    v = x < st.nodes[v].key ? st.nodes[v].left : st.nodes[v].right;
  }
  return path;
}

export function* remove(st: TreeState, x: number): StepGen<TreeState> {
  const err = keyError(x);
  if (err) {
    yield* rejectOp(st, err);
    return;
  }
  const L = st.avl ? AVL_DELETE : BST_DELETE;
  clearMarks(st);
  st.vars = { x };
  const r = yield* descend(st, x, L.descend);
  if (r.found === null) {
    yield snap(st, L.missing, `Klíč ${x} ve stromu není – není co mazat.`);
    yield finalStep(
      st,
      "Delete",
      x,
      `klíč ve stromu není, strom se nezměnil (${treeSummary(st)}).`,
      "neutral",
    );
    return;
  }
  const v: number = r.found;
  st.marks = { [v]: "n-removed" };
  const node = st.nodes[v];
  let fixFrom: number | null = r.parent; // otec skutečně odstraněného vrcholu – odtud se vyvažuje (AVL)
  let how =
    node.left === null && node.right === null
      ? "odpojili jsme list"
      : "vrchol nahradil jeho jediný syn";

  if (node.left !== null && node.right !== null) {
    yield snap(
      st,
      L.twoChildren,
      `Vrchol ${x} má dva syny – najdeme následníka (minimum pravého podstromu).`,
    );
    let sp = v;
    let s: number = node.right;
    st.edgeMarks[v + "-" + s] = "e-active";
    while (st.nodes[s].left !== null) {
      st.marks[s] = "n-compare";
      sp = s;
      s = st.nodes[s].left!;
      st.edgeMarks[sp + "-" + s] = "e-active";
    }
    st.marks[s] = "n-found";
    const succKey = st.nodes[s].key;
    how = `klíč převzal následník ${fmtKey(succKey)}`;
    yield snap(st, L.succ, `Následník je ${succKey}.`);
    node.key = succKey;
    st.marks = { [v]: "n-swap", [s]: "n-removed" };
    yield snap(st, L.copy, `Zkopírujeme klíč ${succKey} do mazaného vrcholu.`);
    // odpojíme s (má nejvýše pravého syna)
    const child = st.nodes[s].right;
    if (sp === v) st.nodes[sp].right = child;
    else st.nodes[sp].left = child;
    delete st.nodes[s];
    fixFrom = sp;
    st.marks = { [v]: "n-swap" };
    yield snap(
      st,
      L.removeSucc,
      `Původní vrchol následníka ${succKey} v pravém podstromu odstraníme${child !== null ? " a nahradíme ho jeho pravým synem" : " (byl to list)"}.`,
    );
  } else {
    const child = node.left ?? node.right;
    yield snap(
      st,
      child === null ? L.leaf : L.oneChild,
      child === null
        ? `Vrchol ${x} je list – odpojíme ho.`
        : `Vrchol ${x} má jediného syna – nahradíme ho jím.`,
    );
    if (r.parent === null) st.root = child;
    else if (st.nodes[r.parent].left === v) st.nodes[r.parent].left = child;
    else st.nodes[r.parent].right = child;
    delete st.nodes[v];
  }
  clearMarks(st);
  // podstrom na místě odstraněného vrcholu se snížil – informaci propagujeme od jeho otce nahoru
  const rot =
    st.avl && fixFrom !== null
      ? yield* rebalancePath(st, pathTo(st, fixFrom), false)
      : 0;
  clearMarks(st);
  yield finalStep(
    st,
    "Delete",
    x,
    `klíč odstraněn (${how})${st.avl ? `, ${rotationsDone(rot)}` : ""}; ${treeSummary(st)}.`,
  );
}

/* ------------------------------------------------------------------ AVL vyvažování */

/**
 * Rotace hrany v – pravý syn doleva. `bad` je nevyvážený vrchol, kvůli kterému rotujeme
 * (u dvojité rotace se liší od v), `line` řádek pseudokódu volajícího. Vrací nový kořen podstromu.
 */
function* rotateLeft(
  st: TreeState,
  v: number,
  parent: number | null,
  bad: number,
  line: number,
): Generator<Step<TreeState>, number, unknown> {
  const n = st.nodes[v];
  const r = st.nodes[n.right!];
  st.marks = { [v]: "n-swap", [r.id]: "n-swap", [bad]: "n-bad" };
  st.edgeMarks = { [v + "-" + r.id]: "e-rotate" };
  yield snap(
    st,
    line,
    `Rotace doleva kolem hrany ${n.key} – ${r.key}: ${r.key} vystoupí nad ${n.key}.`,
  );
  const moved = r.left;
  n.right = moved;
  r.left = v;
  relink(st, parent, v, r.id);
  updateH(st, v);
  updateH(st, r.id);
  st.edgeMarks = { [r.id + "-" + v]: "e-rotate" };
  yield snap(
    st,
    line,
    `${r.key} je teď nad ${n.key}${moved !== null ? `; podstrom s kořenem ${st.nodes[moved].key} přešel pod ${n.key}` : ""}.`,
  );
  return r.id;
}

/** Zrcadlově: rotace hrany levý syn – v doprava. */
function* rotateRight(
  st: TreeState,
  v: number,
  parent: number | null,
  bad: number,
  line: number,
): Generator<Step<TreeState>, number, unknown> {
  const n = st.nodes[v];
  const l = st.nodes[n.left!];
  st.marks = { [v]: "n-swap", [l.id]: "n-swap", [bad]: "n-bad" };
  st.edgeMarks = { [v + "-" + l.id]: "e-rotate" };
  yield snap(
    st,
    line,
    `Rotace doprava kolem hrany ${l.key} – ${n.key}: ${l.key} vystoupí nad ${n.key}.`,
  );
  const moved = l.right;
  n.left = moved;
  l.right = v;
  relink(st, parent, v, l.id);
  updateH(st, v);
  updateH(st, l.id);
  st.edgeMarks = { [l.id + "-" + v]: "e-rotate" };
  yield snap(
    st,
    line,
    `${l.key} je teď nad ${n.key}${moved !== null ? `; podstrom s kořenem ${st.nodes[moved].key} přešel pod ${n.key}` : ""}.`,
  );
  return l.id;
}

function relink(
  st: TreeState,
  parent: number | null,
  oldChild: number,
  newChild: number,
) {
  if (parent === null) st.root = newChild;
  else if (st.nodes[parent].left === oldChild) st.nodes[parent].left = newChild;
  else st.nodes[parent].right = newChild;
}

/**
 * Po vložení/smazání jdeme po cestě zdola nahoru, přepočítáváme hloubky a opravujeme nevyvážené vrcholy.
 * Jakmile má podstrom (po případné rotaci) stejnou hloubku jako před operací, výš se už nic změnit
 * nemůže a propagování končí (Průvodce, oddíl 8.2). `path` vede z kořene do otce změněného místa.
 */
function* rebalancePath(
  st: TreeState,
  path: number[],
  grew: boolean,
): Generator<Step<TreeState>, number, unknown> {
  let rotations = 0;
  yield snap(
    st,
    AVL.walk,
    `Podstrom se ${grew ? "prohloubil" : "snížil"} – vracíme se po cestě ke kořeni a přepočítáváme znaménka.`,
  );
  for (let i = path.length - 1; i >= 0; i--) {
    const v = path[i];
    const parent = i > 0 ? path[i - 1] : null;
    const before = st.nodes[v].h; // hloubka podstromu před operací (uložená hodnota ještě není přepočítaná)
    updateH(st, v);
    const d = sign(st, v);
    const key = st.nodes[v].key;
    st.marks = { [v]: Math.abs(d) <= 1 ? "n-active" : "n-bad" };
    st.edgeMarks = {};
    st.vars = { ...st.vars, v: key, "δ(v)": fmtSign(d) };
    yield snap(
      st,
      AVL.sign,
      `Vrchol ${key}: δ = ${fmtSign(d)}${Math.abs(d) <= 1 ? " – je vyvážený" : " – porušuje vyvážení, musíme rotovat"}.`,
    );

    let top = v; // kořen podstromu po případné rotaci
    if (d === 2) {
      const y = st.nodes[v].right!;
      const dy = sign(st, y);
      st.marks[y] = "n-compare";
      yield snap(
        st,
        AVL.plus2,
        `δ(${key}) = +2, pravý syn ${st.nodes[y].key} má δ = ${fmtSign(dy)}.`,
      );
      if (dy >= 0) {
        top = yield* rotateLeft(st, v, parent, v, AVL.rotL);
        rotations++;
      } else {
        yield snap(
          st,
          AVL.dblRL,
          `Dvojitá rotace: nejdřív doprava u pravého syna ${st.nodes[y].key}, pak doleva u ${key}.`,
        );
        yield* rotateRight(st, y, v, v, AVL.dblRL);
        top = yield* rotateLeft(st, v, parent, v, AVL.dblRL);
        rotations += 2;
      }
    } else if (d === -2) {
      const y = st.nodes[v].left!;
      const dy = sign(st, y);
      st.marks[y] = "n-compare";
      yield snap(
        st,
        AVL.minus2,
        `δ(${key}) = −2, levý syn ${st.nodes[y].key} má δ = ${fmtSign(dy)}.`,
      );
      if (dy <= 0) {
        top = yield* rotateRight(st, v, parent, v, AVL.rotR);
        rotations++;
      } else {
        yield snap(
          st,
          AVL.dblLR,
          `Dvojitá rotace: nejdřív doleva u levého syna ${st.nodes[y].key}, pak doprava u ${key}.`,
        );
        yield* rotateLeft(st, y, v, v, AVL.dblLR);
        top = yield* rotateRight(st, v, parent, v, AVL.dblLR);
        rotations += 2;
      }
    }

    const topKey = st.nodes[top].key;
    st.marks = { [top]: "n-active" };
    st.edgeMarks = {};
    if (top !== v)
      st.vars = { ...st.vars, v: topKey, "δ(v)": fmtSign(sign(st, top)) };
    const rotated =
      top !== v ? `Po rotaci je kořenem podstromu ${topKey}. ` : "";
    if (st.nodes[top].h === before) {
      yield snap(
        st,
        AVL.stop,
        `${rotated}Podstrom vrcholu ${topKey} má stejnou hloubku jako před operací, výš se tedy nic změnit nemůže – končíme.`,
      );
      break;
    }
    const change = st.nodes[top].h > before ? "prohloubil" : "snížil";
    if (parent === null)
      yield snap(
        st,
        AVL.up,
        `${rotated}Podstrom vrcholu ${topKey} se ${change} a jsme v kořeni – hloubka celého stromu se změnila o 1.`,
      );
    else
      yield snap(
        st,
        AVL.up,
        `${rotated}Podstrom vrcholu ${topKey} se ${change} – pokračujeme k otci ${st.nodes[parent].key}.`,
      );
  }
  delete st.vars.v;
  delete st.vars["δ(v)"];
  return rotations;
}

/** Rychlé vložení bez kroků (pro stavbu z pole). */
export function insertSilent(st: TreeState, x: number) {
  const gen = insert(st, x);
  while (!gen.next().done) {
    /* kroky přeskočíme */
  }
}
