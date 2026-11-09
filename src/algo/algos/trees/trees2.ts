import { formatNum } from "../../core/format";
import { snap, type Step, type StepGen } from "../../core/steps";
import {
  finalStep,
  fmtKey,
  keyError,
  plural,
  rejectOp,
  treeSummary,
  type TreeState,
} from "./bst";

/* ================================================================== společné */

export function parentOf(st: TreeState, id: number): number | null {
  const x = st.nodes[id].key;
  let v = st.root;
  let p: number | null = null;
  while (v !== null && v !== id) {
    p = v;
    v = x < st.nodes[v].key ? st.nodes[v].left : st.nodes[v].right;
  }
  return v === id ? p : null;
}

export function sizes(st: TreeState): Map<number, number> {
  const m = new Map<number, number>();
  const walk = (id: number | null): number => {
    if (id === null) return 0;
    const s = 1 + walk(st.nodes[id].left) + walk(st.nodes[id].right);
    m.set(id, s);
    return s;
  };
  walk(st.root);
  return m;
}

/**
 * Popisky „s=…“ pod vrcholy (splay, BB[α]): velikost podstromu. Odebraný kořen při splay Delete
 * (značka „n-removed“ v kořeni) popisek nemá – pod ním visí dva samostatné podstromy.
 */
export function sizeLabels(st: TreeState): Map<number, string> {
  const out = new Map<number, string>();
  const ghost =
    st.root !== null && st.marks[st.root] === "n-removed" ? st.root : null;
  for (const [id, n] of sizes(st)) if (id !== ghost) out.set(id, `s=${n}`);
  return out;
}

/** Rotace vrcholu x nad jeho otce (jednoduchá rotace hrany otec–x). */
function rotateUp(st: TreeState, x: number) {
  const p = parentOf(st, x)!;
  const g = parentOf(st, p);
  const P = st.nodes[p];
  const X = st.nodes[x];
  if (P.left === x) {
    P.left = X.right;
    X.right = p;
  } else {
    P.right = X.left;
    X.left = p;
  }
  if (g === null) st.root = x;
  else if (st.nodes[g].left === p) st.nodes[g].left = x;
  else st.nodes[g].right = x;
}

const clear = (st: TreeState) => {
  st.marks = {};
  st.edgeMarks = {};
};

/** Sestup za klíčem x; vrátí nalezený vrchol nebo poslední navštívený. */
function* descend(
  st: TreeState,
  x: number,
  line: number,
): Generator<
  Step<TreeState>,
  { found: number | null; last: number | null },
  unknown
> {
  let v = st.root;
  let last: number | null = null;
  while (v !== null) {
    st.marks[v] = "n-active";
    if (last !== null) st.edgeMarks[last + "-" + v] = "e-active";
    last = v;
    const k = st.nodes[v].key;
    if (x === k) return { found: v, last };
    yield snap(
      st,
      line,
      `${x} ${x < k ? "<" : ">"} ${k}, jdeme ${x < k ? "doleva" : "doprava"}.`,
    );
    v = x < k ? st.nodes[v].left : st.nodes[v].right;
  }
  return { found: null, last };
}

/**
 * Odstraní vrchol v jako v obyčejném BST. Vrchol se dvěma syny dostane klíč následníka a fyzicky
 * se odstraní původní vrchol následníka. Vrací otce skutečně odstraněného vrcholu (nebo null).
 */
function unlink(st: TreeState, v: number): number | null {
  const node = st.nodes[v];
  if (node.left !== null && node.right !== null) {
    let sp = v;
    let s: number = node.right;
    while (st.nodes[s].left !== null) {
      sp = s;
      s = st.nodes[s].left!;
    }
    node.key = st.nodes[s].key;
    const child = st.nodes[s].right;
    if (sp === v) st.nodes[sp].right = child;
    else st.nodes[sp].left = child;
    delete st.nodes[s];
    return sp;
  }
  const child = node.left ?? node.right;
  const p = parentOf(st, v);
  if (p === null) st.root = child;
  else if (st.nodes[p].left === v) st.nodes[p].left = child;
  else st.nodes[p].right = child;
  delete st.nodes[v];
  return p;
}

/** Následník vrcholu se dvěma syny (minimum pravého podstromu). */
function successor(st: TreeState, v: number): number {
  let s: number = st.nodes[v].right!;
  while (st.nodes[s].left !== null) s = st.nodes[s].left!;
  return s;
}

/* ================================================================== Splay */

export const PC_SPLAY = [
  "Splay(x):   // vynese x do kořene",
  "  Dokud x není kořen:",
  "    p ← otec(x), g ← otec(p)",
  "    Je-li p kořen: zig – rotace x nad p",
  "    Jinak jsou-li x a p oba levými (nebo oba pravými) syny:",
  "      zig-zig – nejprve rotace p nad g, pak x nad p",
  "    Jinak: zig-zag – rotace x nad p, pak x nad g",
];
export const PC_SPLAY_FIND = [
  "Find(x):",
  "  Hledáme x jako v BST.",
  "  Splay naposledy navštíveného vrcholu",
  "  (nalezeného x, nebo vrcholu, kde hledání skončilo).",
  ...PC_SPLAY.map((l) => "  " + l),
];
export const PC_SPLAY_INSERT = [
  "Insert(x):",
  "  Vložíme x jako do obyčejného BST.",
  "  Splay nového vrcholu (nebo nalezeného x, pokud už ve stromu byl).",
  ...PC_SPLAY.map((l) => "  " + l),
];
export const PC_SPLAY_DELETE = [
  "Delete(x):   // Průvodce 9.5, obr. 9.7",
  "  Najdeme x jako v BST a vysplayujeme ho do kořene;",
  "  není-li x ve stromu, splay naposledy navštíveného vrcholu a konec.",
  "  Odebereme kořen x – zbude levý podstrom L a pravý podstrom R.",
  "  Je-li L prázdný, kořenem se stane R.",
  "  Jinak najdeme maximum m podstromu L (cestou doprava)",
  "  a vysplayujeme ho do kořene L – m pak nemá pravého syna.",
  "  Kořen R připojíme jako pravého syna m.",
  ...PC_SPLAY.map((l) => "  " + l),
];
/** Řádek „Splay(x):“ v PC_SPLAY_DELETE. */
const DELETE_SPLAY = 8;

/** Potenciál splay stromu: součet ranků r(v) = log₂ s(v), zaokrouhlený na 2 desetinná místa. */
export function potential(st: TreeState): number {
  let phi = 0;
  for (const s of sizes(st).values()) phi += Math.log2(s);
  return Math.round(phi * 100) / 100;
}

/** Potenciál lesa podstromů (Delete po odebrání kořene): součet potenciálů jednotlivých stromů. */
function forestPotential(st: TreeState, roots: (number | null)[]): number {
  let phi = 0;
  const walk = (id: number | null): number => {
    if (id === null) return 0;
    const s = 1 + walk(st.nodes[id].left) + walk(st.nodes[id].right);
    phi += Math.log2(s);
    return s;
  };
  for (const r of roots) walk(r);
  return Math.round(phi * 100) / 100;
}

const rotations = (n: number) => plural(n, "rotace", "rotace", "rotací");

/**
 * Splay uvnitř podstromu: `top` je odebraný kořen (Delete), pod nímž leží levý podstrom L – vrchol
 * se vynáší jen do kořene L. Odebraný vrchol zůstává na kresbě jako šedý („n-removed“) a Φ je
 * součtem potenciálů obou podstromů.
 */
interface SplayTop {
  top: number;
  phi: () => number;
}

/** Splay vrcholu x; `base` je index řádku „Splay(x):“ v pseudokódu volající operace. */
export function* splay(
  st: TreeState,
  x: number,
  base: number,
  within?: SplayTop,
): Generator<Step<TreeState>, number, unknown> {
  let done = 0;
  const top = within?.top ?? null;
  const phi = within?.phi ?? (() => potential(st));
  const where = within ? "kořen levého podstromu" : "kořen";
  /** po vymazání značek: odebraný kořen zůstane šedý */
  const keepTop = () => {
    if (top !== null) st.marks[top] = "n-removed";
  };
  // počet rotací a potenciál držíme v souladu s právě zobrazeným stromem (i uprostřed dvojité rotace)
  const sync = () => {
    st.vars = { ...st.vars, rotace: done, Φ: phi() };
  };
  st.vars = { ...st.vars, Φ: phi() };
  while (parentOf(st, x) !== top) {
    const p = parentOf(st, x)!;
    const gp = parentOf(st, p);
    const g = gp === top ? null : gp;
    const K = st.nodes[x].key;
    st.marks = { [x]: "n-active", [p]: "n-compare" };
    keepTop();
    st.edgeMarks = { [p + "-" + x]: "e-rotate" };
    if (g === null) {
      yield snap(st, base + 3, `Otec vrcholu ${K} je ${where} → zig.`);
      rotateUp(st, x);
      done++;
    } else {
      st.marks[g] = "n-compare";
      st.edgeMarks[g + "-" + p] = "e-rotate";
      const xLeft = st.nodes[p].left === x;
      const pLeft = st.nodes[g].left === p;
      if (xLeft === pLeft) {
        yield snap(
          st,
          base + 5,
          `${K} i jeho otec jsou oba ${xLeft ? "levými" : "pravými"} syny → zig-zig: nejdřív rotujeme otce nad dědem.`,
        );
        rotateUp(st, p);
        done++;
        sync();
        st.edgeMarks = { [p + "-" + x]: "e-rotate" };
        yield snap(st, base + 5, `Teď rotujeme ${K} nad otcem.`);
        rotateUp(st, x);
        done++;
      } else {
        yield snap(
          st,
          base + 6,
          `${K} a jeho otec jsou na opačných stranách → zig-zag: rotujeme ${K} nad otcem…`,
        );
        rotateUp(st, x);
        done++;
        sync();
        st.edgeMarks = { [g + "-" + x]: "e-rotate" };
        yield snap(st, base + 6, `…a pak ${K} nad dědem.`);
        rotateUp(st, x);
        done++;
      }
    }
    sync();
    clear(st);
    keepTop();
    st.marks[x] = "n-active";
    yield snap(
      st,
      base + 1,
      `Vrchol ${K} je o ${g === null ? "jednu úroveň" : "dvě úrovně"} výš.`,
    );
  }
  clear(st);
  keepTop();
  st.marks[x] = "n-found";
  yield snap(
    st,
    base + 1,
    `${st.nodes[x].key} je ${within ? "v kořeni levého podstromu" : "v kořeni"}. Celkem ${rotations(done)}, Φ = ${formatNum(phi())}.`,
  );
  return done;
}

/** „do kořene ho vynesl Splay (4 rotace), Φ = 9.17“ */
const splayed = (st: TreeState, n: number) =>
  `${n === 0 ? "už byl v kořeni" : `do kořene ho vynesl Splay (${rotations(n)})`}, Φ = ${formatNum(potential(st))}`;

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function* splayFind(st: TreeState, x: number): StepGen<TreeState> {
  const err = keyError(x);
  if (err) {
    yield* rejectOp(st, err);
    return;
  }
  clear(st);
  st.vars = { x, Φ: potential(st) };
  if (st.root === null) {
    yield snap(st, 1, "Strom je prázdný.");
    yield finalStep(
      st,
      "Find",
      x,
      "strom je prázdný, klíč v něm není.",
      "neutral",
    );
    return;
  }
  const r = yield* descend(st, x, 1);
  if (r.found !== null) {
    st.marks[r.found] = "n-found";
    yield snap(st, 2, `Klíč ${x} nalezen – provedeme Splay.`);
    const n = yield* splay(st, r.found, 4);
    yield finalStep(st, "Find", x, `klíč nalezen. ${cap(splayed(st, n))}.`);
  } else {
    const last = st.nodes[r.last!].key;
    yield snap(
      st,
      3,
      `Klíč ${x} ve stromu není; splayujeme poslední navštívený vrchol ${last}.`,
    );
    const n = yield* splay(st, r.last!, 4);
    yield finalStep(
      st,
      "Find",
      x,
      `klíč ve stromu není. Do kořene jsme vynesli poslední navštívený vrchol ${fmtKey(last)} (${rotations(n)}), Φ = ${formatNum(potential(st))}.`,
      "neutral",
    );
  }
}

export function* splayInsert(st: TreeState, x: number): StepGen<TreeState> {
  const err = keyError(x);
  if (err) {
    yield* rejectOp(st, err);
    return;
  }
  clear(st);
  st.vars = { x, Φ: potential(st) };
  const r = yield* descend(st, x, 1);
  if (r.found !== null) {
    st.marks[r.found] = "n-found";
    yield snap(st, 2, `Klíč ${x} už ve stromu je – jen ho splayujeme.`);
    const n = yield* splay(st, r.found, 3);
    yield finalStep(
      st,
      "Insert",
      x,
      `klíč už ve stromu byl, nic nového nepřibylo; ${splayed(st, n)}; ${treeSummary(st)}.`,
      "neutral",
    );
    return;
  }
  const id = st.nextId++;
  st.nodes[id] = { id, key: x, left: null, right: null, h: 1 };
  if (r.last === null) st.root = id;
  else if (x < st.nodes[r.last].key) st.nodes[r.last].left = id;
  else st.nodes[r.last].right = id;
  st.marks[id] = "n-new";
  st.vars["Φ"] = potential(st); // nový list už je ve stromu – potenciál vzrostl
  yield snap(
    st,
    1,
    `Připojíme nový list ${x}${r.last !== null ? ` pod vrchol ${st.nodes[r.last].key}` : " jako kořen"}.`,
  );
  const n = yield* splay(st, id, 3);
  yield finalStep(
    st,
    "Insert",
    x,
    `nový vrchol je v kořeni – ${splayed(st, n)}; ${treeSummary(st)}.`,
  );
}

/**
 * Delete podle Průvodce 9.5 (obr. 9.7): x vysplayujeme do kořene a odebereme; strom se rozpadne na
 * levý podstrom L a pravý R. Maximum L vysplayujeme do kořene L (nemá pak pravého syna) a připojíme
 * k němu R. Odebraný kořen zůstává na kresbě šedý, dokud se podstromy nespojí.
 */
export function* splayDelete(st: TreeState, x: number): StepGen<TreeState> {
  const err = keyError(x);
  if (err) {
    yield* rejectOp(st, err);
    return;
  }
  clear(st);
  st.vars = { x, Φ: potential(st) };
  if (st.root === null) {
    yield snap(st, 1, "Strom je prázdný – není co mazat.");
    yield finalStep(
      st,
      "Delete",
      x,
      "strom je prázdný, není co mazat.",
      "neutral",
    );
    return;
  }
  const r = yield* descend(st, x, 1);
  if (r.found === null) {
    const last = st.nodes[r.last!].key;
    yield snap(
      st,
      2,
      `Klíč ${x} ve stromu není; splayujeme poslední navštívený vrchol ${last}.`,
    );
    const n = yield* splay(st, r.last!, DELETE_SPLAY);
    yield finalStep(
      st,
      "Delete",
      x,
      `klíč ve stromu není, nic jsme nesmazali. Do kořene jsme vynesli vrchol ${fmtKey(last)} (${rotations(n)}); ${treeSummary(st)}.`,
      "neutral",
    );
    return;
  }
  const v = r.found;
  st.marks[v] = "n-found";
  yield snap(st, 1, `Klíč ${x} nalezen – vysplayujeme ho do kořene.`);
  const n1 = yield* splay(st, v, DELETE_SPLAY);
  const L = st.nodes[v].left;
  const R = st.nodes[v].right;
  const phi = () => forestPotential(st, [st.nodes[v].left, st.nodes[v].right]);
  clear(st);
  st.marks[v] = "n-removed";
  delete st.vars.rotace;
  st.vars["Φ"] = phi();
  yield snap(
    st,
    3,
    `Odebereme kořen ${x} – zbude ${L === null ? "prázdný" : "levý podstrom"} L a ${R === null ? "prázdný" : "pravý podstrom"} R. Φ je teď součet potenciálů obou podstromů.`,
  );
  if (L === null) {
    st.root = R;
    delete st.nodes[v];
    clear(st);
    st.vars["Φ"] = potential(st);
    if (R !== null) st.marks[R] = "n-new";
    yield snap(
      st,
      4,
      R === null
        ? "Levý podstrom je prázdný a pravý také – strom je teď prázdný."
        : `Levý podstrom je prázdný – kořenem se stane pravý podstrom (${st.nodes[R].key}).`,
    );
    clear(st);
    yield finalStep(
      st,
      "Delete",
      x,
      `klíč odstraněn: ${splayedText(x, n1)}, odebrali jsme ho a kořenem se stal pravý podstrom; ${treeSummary(st)}${st.root === null ? "" : `, Φ = ${formatNum(potential(st))}`}.`,
    );
    return;
  }
  // maximum L: cestou doprava
  let m = L;
  st.marks[m] = "n-active";
  while (st.nodes[m].right !== null) {
    const next = st.nodes[m].right!;
    st.edgeMarks[m + "-" + next] = "e-active";
    m = next;
    st.marks[m] = "n-active";
  }
  st.marks[m] = "n-found";
  const mk = st.nodes[m].key;
  yield snap(
    st,
    5,
    `Maximum levého podstromu najdeme cestou doprava: ${mk}. Vysplayujeme ho do kořene L.`,
  );
  const n2 = yield* splay(st, m, DELETE_SPLAY, { top: v, phi });
  // m je kořen L bez pravého syna – připojíme R a odebraný kořen zmizí
  st.nodes[m].right = R;
  st.root = m;
  delete st.nodes[v];
  clear(st);
  st.marks[m] = "n-new";
  if (R !== null) st.edgeMarks[m + "-" + R] = "e-active";
  delete st.vars.rotace;
  st.vars["Φ"] = potential(st);
  yield snap(
    st,
    7,
    R === null
      ? `Pravý podstrom je prázdný – ${mk} zůstává kořenem bez pravého syna.`
      : `Kořen pravého podstromu ${st.nodes[R].key} připojíme jako pravého syna ${mk}.`,
  );
  clear(st);
  st.marks[m] = "n-new";
  yield finalStep(
    st,
    "Delete",
    x,
    `klíč odstraněn: ${splayedText(x, n1)}, odebrali jsme ho a podstromy spojili přes maximum levého podstromu ${fmtKey(mk)} (${rotations(n2)}); ${treeSummary(st)}, Φ = ${formatNum(potential(st))}.`,
  );
}

/** „x jsme vysplayovali do kořene (3 rotace)“ / „x už byl v kořeni“ */
const splayedText = (x: number, n: number) =>
  n === 0
    ? `${fmtKey(x)} už byl v kořeni`
    : `${fmtKey(x)} jsme vysplayovali do kořene (${rotations(n)})`;

/* ================================================================== BB[α] */

export const PC_BB_INSERT = [
  "Insert(x):   // BB[α]-strom, 1/2 < α < 1",
  "  Vložíme x jako do obyčejného BST (nový list).",
  "  Na cestě od kořene k listu aktualizujeme velikosti s_u.",
  "  Najdeme nejvyšší vrchol u porušující podmínku",
  "    s_syn > α · s_u   (pro některého syna).",
  "  Pokud existuje: celý podstrom u přestavíme (Build)",
  "    na dokonale vyvážený – cena O(s_u).",
];
export const PC_BB_DELETE = [
  "Delete(x):",
  "  Smažeme x jako v obyčejném BST.",
  "  Aktualizujeme velikosti s_u na cestě.",
  "  Najdeme nejvyšší vrchol u porušující s_syn > α · s_u.",
  "  Pokud existuje: podstrom u přestavíme (Build).",
];

/** Řádky pseudokódu pro kontrolu vyvážení – Insert a Delete mají pseudokód různě dlouhý. */
interface BbLines {
  sizes: number;
  check: number;
  rebuild: number;
}
const BB_INSERT: BbLines = { sizes: 2, check: 3, rebuild: 5 };
const BB_DELETE: BbLines = { sizes: 2, check: 3, rebuild: 4 };

/** Tolerance pro porovnání s α·s_u: 0.7 · 90 vyjde v plovoucí čárce 62.99999999999999, ne 63. */
const EPS = 1e-9;

/** α musí ležet v otevřeném intervalu (1/2, 1), jinak podmínku nelze splnit, nebo nic nevynucuje. */
export function alphaError(alpha: number): string | null {
  if (typeof alpha === "number" && alpha > 0.5 && alpha < 1) return null;
  const given =
    typeof alpha === "number" && Number.isFinite(alpha)
      ? ` (zadáno ${formatNum(alpha)})`
      : "";
  return `Parametr α musí být číslo větší než 1/2 a menší než 1, například 0,7${given}. Pro α ≤ 1/2 nelze podmínku splnit, pro α ≥ 1 by strom mohl zdegenerovat na cestu. Operace se neprovedla.`;
}

export function bbPotential(st: TreeState): number {
  const sz = sizes(st);
  let phi = 0;
  for (const n of Object.values(st.nodes)) {
    const d = Math.abs(
      (n.left !== null ? sz.get(n.left)! : 0) -
        (n.right !== null ? sz.get(n.right)! : 0),
    );
    if (d >= 2) phi += d;
  }
  return phi;
}

/** Velikosti podstromu vrcholu u a jeho synů a to, zda u porušuje podmínku s_syn ≤ α · s_u. */
function balanceOf(
  st: TreeState,
  sz: Map<number, number>,
  u: number,
  alpha: number,
) {
  const n = st.nodes[u];
  const su = sz.get(u)!;
  const sl = n.left !== null ? sz.get(n.left)! : 0;
  const sr = n.right !== null ? sz.get(n.right)! : 0;
  const limit = alpha * su;
  return { su, sl, sr, limit, bad: Math.max(sl, sr) > limit + EPS };
}

/** Klíče všech vrcholů, které porušují podmínku BB[α] (v pořadí podle klíče). */
export function bbViolations(st: TreeState, alpha: number): number[] {
  const sz = sizes(st);
  return Object.values(st.nodes)
    .filter((n) => sz.has(n.id) && balanceOf(st, sz, n.id, alpha).bad)
    .map((n) => n.key)
    .sort((a, b) => a - b);
}

/** Vrcholy podstromu u v in-order pořadí. */
function subtreeIds(st: TreeState, u: number): number[] {
  const ids: number[] = [];
  const collect = (id: number | null) => {
    if (id === null) return;
    collect(st.nodes[id].left);
    ids.push(id);
    collect(st.nodes[id].right);
  };
  collect(u);
  return ids;
}

/**
 * Build: podstrom u přestaví na dokonale vyvážený (prostřední prvek do kořene, rekurzivně).
 * Vrcholy si nechávají svá id i klíče, mění se jen ukazatele – přesuny se proto animují.
 */
function rebuildSubtree(st: TreeState, u: number, ids: number[]) {
  const parent = parentOf(st, u);
  const build = (lo: number, hi: number): number | null => {
    if (lo > hi) return null;
    const mid = Math.floor((lo + hi) / 2);
    const id = ids[mid];
    st.nodes[id].left = build(lo, mid - 1);
    st.nodes[id].right = build(mid + 1, hi);
    return id;
  };
  const newRoot = build(0, ids.length - 1)!;
  if (parent === null) st.root = newRoot;
  else if (st.nodes[parent].left === u) st.nodes[parent].left = newRoot;
  else st.nodes[parent].right = newRoot;
}

const nodesCount = (n: number) => plural(n, "vrchol", "vrcholy", "vrcholů");

/** Po vložení/smazání zkontroluje podmínku na cestě od kořene a nejvyšší porušený podstrom přestaví. */
function* rebuildCheck(
  st: TreeState,
  path: number[],
  alpha: number,
  L: BbLines,
): Generator<Step<TreeState>, number, unknown> {
  const sz = sizes(st);
  st.vars["Φ"] = bbPotential(st);
  yield snap(
    st,
    L.sizes,
    "Velikosti podstromů se změnily jen na cestě od kořene – tam zkontrolujeme podmínku vyvážení.",
  );
  for (const u of path) {
    if (!st.nodes[u]) continue;
    const n = st.nodes[u];
    const { su, sl, sr, limit, bad } = balanceOf(st, sz, u, alpha);
    st.marks = { [u]: bad ? "n-bad" : "n-active" };
    st.vars.u = n.key;
    st.vars["s_u"] = su;
    st.vars["α·s_u"] = Math.round(limit * 100) / 100;
    yield snap(
      st,
      L.check,
      `Vrchol ${n.key}: s = ${su}, synové ${sl} a ${sr}, mez α·s = ${formatNum(limit, 2)}.${bad ? " Porušeno!" : ""}`,
    );
    if (bad) {
      const ids = subtreeIds(st, u);
      for (const id of ids) st.marks[id] = "n-swap";
      st.marks[u] = "n-bad";
      yield snap(
        st,
        L.rebuild,
        `Přestavíme podstrom vrcholu ${n.key} (${nodesCount(ids.length)}) na dokonale vyvážený.`,
      );
      rebuildSubtree(st, u, ids);
      st.marks = {};
      for (const id of ids) st.marks[id] = "n-new";
      delete st.vars.u;
      delete st.vars["s_u"];
      delete st.vars["α·s_u"];
      st.vars["Φ"] = bbPotential(st);
      yield snap(
        st,
        L.rebuild,
        `Podstrom přestavěn, potenciál klesl na Φ = ${formatNum(bbPotential(st))}. Níž už nic kontrolovat nemusíme – celý podstrom je dokonale vyvážený.`,
      );
      return ids.length;
    }
  }
  delete st.vars.u;
  delete st.vars["s_u"];
  delete st.vars["α·s_u"];
  st.marks = {};
  yield snap(st, L.check, "Na celé cestě podmínka platí, žádná přestavba.");
  return 0;
}

/** „bez přestavby“ / „přestavěli jsme podstrom s 5 vrcholy“ */
const rebuiltText = (n: number) =>
  n === 0
    ? "bez přestavby"
    : `přestavěli jsme podstrom s ${plural(n, "vrcholem", "vrcholy", "vrcholy")}`;

/**
 * Operace kontrolují jen cestu k vloženému/smazanému místu. To stačí, dokud strom podmínku pro totéž
 * (nebo menší) α splňoval. Když uživatel α mezi operacemi sníží, mohou ji porušovat i vrcholy mimo cestu –
 * proto před operací jednou projdeme celý strom a nejvyšší porušené podstromy přestavíme.
 */
function* adoptAlpha(
  st: TreeState,
  alpha: number,
): Generator<Step<TreeState>, number, unknown> {
  const old = st.alpha;
  st.alpha = alpha;
  // strom s neznámou historií (old === undefined) kontrolujeme jen tehdy, když podmínku opravdu porušuje
  if (old === undefined ? bbViolations(st, alpha).length === 0 : alpha >= old)
    return 0;
  st.vars = { α: alpha, Φ: bbPotential(st) };
  yield snap(
    st,
    null,
    old === undefined
      ? `Strom nesplňuje podmínku vyvážení pro α = ${formatNum(alpha)}. Než začneme, zkontrolujeme všechny vrcholy.`
      : `Parametr α se od minulé operace snížil z ${formatNum(old)} na ${formatNum(alpha)}; přísnější podmínku strom splňovat nemusí. Než začneme, zkontrolujeme všechny vrcholy.`,
  );
  const sz = sizes(st); // velikosti podstromů se přestavbou nemění
  let rebuilt = 0;
  const walk = function* (u: number | null): StepGen<TreeState> {
    if (u === null) return;
    const n = st.nodes[u];
    const { su, sl, sr, limit, bad } = balanceOf(st, sz, u, alpha);
    if (!bad) {
      // ukazatele čteme až těsně před sestupem – přestavba levého podstromu je mohla změnit
      yield* walk(st.nodes[u].left);
      yield* walk(st.nodes[u].right);
      return;
    }
    const ids = subtreeIds(st, u);
    st.marks = {};
    for (const id of ids) st.marks[id] = "n-swap";
    st.marks[u] = "n-bad";
    yield snap(
      st,
      null,
      `Vrchol ${n.key}: s = ${su}, synové ${sl} a ${sr}, mez α·s = ${formatNum(limit, 2)}. Porušeno – přestavíme jeho podstrom (${nodesCount(ids.length)}).`,
    );
    rebuildSubtree(st, u, ids);
    rebuilt++;
    st.marks = {};
    for (const id of ids) st.marks[id] = "n-new";
    st.vars["Φ"] = bbPotential(st);
    yield snap(
      st,
      null,
      "Podstrom je teď dokonale vyvážený, uvnitř už nic kontrolovat nemusíme.",
    );
  };
  yield* walk(st.root);
  clear(st);
  yield snap(
    st,
    null,
    `Celý strom teď splňuje podmínku pro α = ${formatNum(alpha)} (přestavěno podstromů: ${rebuilt}). Pokračujeme vlastní operací.`,
  );
  return rebuilt;
}

/** Poznámka do závěrečné zprávy o kontrole celého stromu po snížení α. */
const adoptedText = (n: number) =>
  n === 0
    ? ""
    : ` Před operací jsme kvůli novému α přestavěli ${plural(n, "podstrom", "podstromy", "podstromů")}.`;

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

export function* bbInsert(
  st: TreeState,
  x: number,
  alpha: number,
): StepGen<TreeState> {
  const err = keyError(x) ?? alphaError(alpha);
  if (err) {
    yield* rejectOp(st, err);
    return;
  }
  clear(st);
  const adopted = yield* adoptAlpha(st, alpha);
  st.vars = { x, α: alpha, Φ: bbPotential(st) };
  const r = yield* descend(st, x, 1);
  if (r.found !== null) {
    st.marks[r.found] = "n-found";
    yield snap(st, 1, `Klíč ${x} už ve stromu je – nic nevkládáme.`);
    yield finalStep(
      st,
      "Insert",
      x,
      `klíč už ve stromu byl, nic nevkládáme (${treeSummary(st)}).${adoptedText(adopted)}`,
      // přestavba po změně α strom změnila – pak to není operace bez účinku
      adopted > 0 ? undefined : "neutral",
    );
    return;
  }
  const id = st.nextId++;
  st.nodes[id] = { id, key: x, left: null, right: null, h: 1 };
  if (r.last === null) st.root = id;
  else if (x < st.nodes[r.last].key) st.nodes[r.last].left = id;
  else st.nodes[r.last].right = id;
  st.marks[id] = "n-new";
  st.vars["Φ"] = bbPotential(st); // nový list už je ve stromu
  yield snap(
    st,
    1,
    `Připojíme nový list ${x}${r.last !== null ? ` pod vrchol ${st.nodes[r.last].key}` : " jako kořen"}.`,
  );
  const rebuilt = yield* rebuildCheck(st, pathTo(st, id), alpha, BB_INSERT);
  clear(st);
  st.marks[id] = "n-new";
  yield finalStep(
    st,
    "Insert",
    x,
    `vložen nový list, ${rebuiltText(rebuilt)}; ${treeSummary(st)}, Φ = ${formatNum(bbPotential(st))}.${adoptedText(adopted)}`,
  );
}

export function* bbDelete(
  st: TreeState,
  x: number,
  alpha: number,
): StepGen<TreeState> {
  const err = keyError(x) ?? alphaError(alpha);
  if (err) {
    yield* rejectOp(st, err);
    return;
  }
  clear(st);
  const adopted = yield* adoptAlpha(st, alpha);
  st.vars = { x, α: alpha, Φ: bbPotential(st) };
  const r = yield* descend(st, x, 1);
  if (r.found === null) {
    yield snap(st, 1, `Klíč ${x} ve stromu není – není co mazat.`);
    yield finalStep(
      st,
      "Delete",
      x,
      `klíč ve stromu není, strom se nezměnil (${treeSummary(st)}).${adoptedText(adopted)}`,
      // přestavba po změně α strom změnila – pak to není operace bez účinku
      adopted > 0 ? undefined : "neutral",
    );
    return;
  }
  const v = r.found;
  const node = st.nodes[v];
  if (node.left !== null && node.right !== null) {
    const s = successor(st, v);
    st.marks[v] = "n-swap"; // tomuto vrcholu se jen přepíše klíč
    st.marks[s] = "n-removed"; // fyzicky zmizí vrchol následníka
    yield snap(
      st,
      1,
      `Vrchol ${x} má dva syny – přepíšeme jeho klíč následníkem ${st.nodes[s].key} a odstraníme původní vrchol následníka.`,
    );
  } else {
    st.marks[v] = "n-removed";
    yield snap(
      st,
      1,
      node.left === null && node.right === null
        ? `Vrchol ${x} je list – odpojíme ho.`
        : `Vrchol ${x} má jediného syna – nahradíme ho jím.`,
    );
  }
  const from = unlink(st, v);
  clear(st);
  st.vars["Φ"] = bbPotential(st); // vrchol je pryč – potenciál se mohl změnit i bez přestavby
  // byl-li odstraněn kořen s nejvýše jedním synem, žádný podstrom nad odstraněným místem není
  const rebuilt =
    from !== null
      ? yield* rebuildCheck(st, pathTo(st, from), alpha, BB_DELETE)
      : 0;
  clear(st);
  yield finalStep(
    st,
    "Delete",
    x,
    `klíč odstraněn, ${rebuiltText(rebuilt)}; ${treeSummary(st)}, Φ = ${formatNum(bbPotential(st))}.${adoptedText(adopted)}`,
  );
}

/** Dokonale vyvážený strom ze setříděných klíčů (operace Build); splňuje BB[α] pro každé α > 1/2. */
export function buildBalanced(st: TreeState, keys: number[]) {
  const sorted = [...new Set(keys.filter((k) => Number.isFinite(k)))].sort(
    (a, b) => a - b,
  );
  st.nodes = {};
  delete st.alpha;
  const build = (lo: number, hi: number): number | null => {
    if (lo > hi) return null;
    const mid = Math.floor((lo + hi) / 2);
    const id = st.nextId++;
    st.nodes[id] = { id, key: sorted[mid], left: null, right: null, h: 1 };
    st.nodes[id].left = build(lo, mid - 1);
    st.nodes[id].right = build(mid + 1, hi);
    return id;
  };
  st.root = build(0, sorted.length - 1);
}
