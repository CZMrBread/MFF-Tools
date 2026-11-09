import { snap, type Step, type StepGen } from "../../core/steps";
import type { MEdge, MNode } from "../../views/MultiTreeView";

/**
 * (a,b)-strom ve dvou variantách:
 * - „prednaska“ (výchozí, Fink DS I): klíče jsou jen v listech, vnitřní vrcholy obsahují oddělovače
 *   (i-tý klíč = maximum i-tého podstromu); operace v tomto souboru;
 * - „kniha“ (Průvodce 8.3): klíče jsou ve vnitřních vrcholech, vnější vrcholy (listy) jsou prázdné a
 *   nekreslí se – vrchol na předposlední hladině má `children: []`; operace v abBook.ts.
 */
export type AbVariant = "prednaska" | "kniha";

export interface ABNode {
  id: number;
  keys: number[];
  children: number[];
}
export interface ABState {
  a: number;
  b: number;
  nodes: Record<number, ABNode>;
  root: number | null;
  marks: Record<number, string>;
  /** index zvýrazněného oddělovače ve vrcholu */
  hot: Record<number, number>;
  vars: Record<string, string | number>;
  nextId: number;
  /** varianta stromu; chybí = „prednaska“ (klíče v listech) */
  variant?: AbVariant;
}

export const emptyAB = (
  a: number,
  b: number,
  variant: AbVariant = "prednaska",
): ABState => ({
  ...(variant === "kniha" ? { variant } : {}),
  a,
  b,
  nodes: {},
  root: null,
  marks: {},
  hot: {},
  vars: {},
  nextId: 1,
});

const isLeaf = (st: ABState, id: number) => st.nodes[id].children.length === 0;

function maxKey(st: ABState, id: number): number {
  const n = st.nodes[id];
  return n.children.length
    ? maxKey(st, n.children[n.children.length - 1])
    : n.keys[0];
}
/** Přepočítá oddělovače ve všech vnitřních vrcholech. */
function fixKeys(st: ABState) {
  const walk = (id: number) => {
    const n = st.nodes[id];
    if (!n.children.length) return;
    n.children.forEach(walk);
    n.keys = n.children.slice(0, -1).map((c) => maxKey(st, c));
  };
  if (st.root !== null) walk(st.root);
}
function parentOf(st: ABState, id: number): number | null {
  for (const n of Object.values(st.nodes))
    if (n.children.includes(id)) return n.id;
  return null;
}
export const clear = (st: ABState) => {
  st.marks = {};
  st.hot = {};
};

/** Knižní varianta (Průvodce 8.3)? */
export const isBookAB = (st: ABState) => st.variant === "kniha";

/** Klíče knižní varianty in-order: s_0, x_1, s_1, …, x_k, s_k. */
function bookKeys(st: ABState): number[] {
  const out: number[] = [];
  const walk = (id: number) => {
    const n = st.nodes[id];
    n.keys.forEach((k, i) => {
      if (n.children[i] !== undefined) walk(n.children[i]);
      out.push(k);
    });
    const last = n.children[n.keys.length];
    if (last !== undefined) walk(last);
  };
  if (st.root !== null) walk(st.root);
  return out;
}

/** Klíče stromu vzestupně (přednáška: v listech zleva doprava; kniha: in-order). */
export function abKeys(st: ABState): number[] {
  if (isBookAB(st)) return bookKeys(st);
  const out: number[] = [];
  const walk = (id: number) => {
    const n = st.nodes[id];
    if (!n.children.length) out.push(n.keys[0]);
    else n.children.forEach(walk);
  };
  if (st.root !== null) walk(st.root);
  return out;
}

/**
 * Rozložení knižní varianty: vrcholy na předposlední hladině vedle sebe podle počtu klíčů (široký
 * vrchol zabere víc místa), vnitřní vrchol uprostřed nad svými syny.
 */
function layoutBook(st: ABState): { nodes: MNode[]; edges: MEdge[] } {
  const nodes: MNode[] = [];
  const edges: MEdge[] = [];
  if (st.root === null) return { nodes, edges };
  const raw: { id: number; x: number; y: number }[] = [];
  let cursor = 0;
  const place = (id: number, depth: number): number => {
    const n = st.nodes[id];
    let x: number;
    if (!n.children.length) {
      const w = Math.max(1, n.keys.length);
      x = cursor + w / 2;
      cursor += w + 1;
    } else {
      const xs = n.children.map((c) => place(c, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
      for (const c of n.children) edges.push({ from: id, to: c });
    }
    raw.push({ id, x, y: depth });
    return x;
  };
  place(st.root, 0);
  const xs = raw.map((r) => r.x);
  const lo = Math.min(...xs);
  const span = Math.max(...xs) - lo;
  for (const r of raw) {
    const n = st.nodes[r.id];
    nodes.push({
      id: r.id,
      keys: n.keys.map(String),
      x: span === 0 ? 0.5 : (r.x - lo) / span,
      y: r.y,
      cls: st.marks[r.id],
      hot: st.hot[r.id],
    });
  }
  return { nodes, edges };
}

export function layoutAB(st: ABState): { nodes: MNode[]; edges: MEdge[] } {
  if (isBookAB(st)) return layoutBook(st);
  const nodes: MNode[] = [];
  const edges: MEdge[] = [];
  if (st.root === null) return { nodes, edges };
  // listy zleva doprava
  let leafIdx = 0;
  const total = Math.max(abKeys(st).length, 1);
  const place = (id: number, depth: number): number => {
    const n = st.nodes[id];
    let x: number;
    if (!n.children.length) {
      x = total === 1 ? 0.5 : leafIdx / (total - 1);
      leafIdx++;
    } else {
      const xs = n.children.map((c) => place(c, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
      for (const c of n.children) edges.push({ from: id, to: c });
    }
    nodes.push({
      id,
      keys: n.keys.map(String),
      x,
      y: depth,
      cls: st.marks[id],
      hot: st.hot[id],
    });
    return x;
  };
  place(st.root, 0);
  return { nodes, edges };
}

/**
 * Výška = hloubka listů (všechny jsou ve stejné hloubce). Přednáška: prázdný strom −1, samotný list 0.
 * Kniha: hloubka vnějších listů – prázdný strom 0, jediný vnitřní vrchol 1.
 */
export function abHeight(st: ABState): number {
  if (st.root === null) return isBookAB(st) ? 0 : -1;
  if (isBookAB(st)) {
    let h = 1;
    for (
      let v = st.root;
      st.nodes[v].children.length;
      v = st.nodes[v].children[0]
    )
      h++;
    return h;
  }
  let h = 0;
  for (
    let v = st.root;
    st.nodes[v].children.length;
    v = st.nodes[v].children[0]
  )
    h++;
  return h;
}

const fmtKey = (x: number) => String(x).replace("-", "−");

/** „9 klíčů, výška 2“ / „strom je prázdný“ */
export function abSummary(st: ABState): string {
  const n = abKeys(st).length;
  return n === 0
    ? "strom je prázdný"
    : `strom má ${n} ${n === 1 ? "klíč" : n <= 4 ? "klíče" : "klíčů"}, výška ${abHeight(st)}`;
}

/** Závěrečný krok operace: „Insert(35): …“ bez řádku pseudokódu (Visualizer k němu přidá ✓, u outcome „neutral“ ⓘ). */
export function finalStep(
  st: ABState,
  op: string,
  x: number,
  result: string,
  /** „neutral“ = operace bez účinku (nenalezeno, už existuje, strom se nezměnil) – místo ✓ se ukáže ⓘ */
  outcome?: "neutral",
): Step<ABState> {
  const step = snap(st, null, `${op}(${fmtKey(x)}): ${result}`);
  return outcome ? { ...step, outcome } : step;
}

/* ------------------------------------------------------------------ ochrana vstupu */

/** Klíčem smí být jen konečné číslo – s NaN by porovnávání klíčů přestalo dávat smysl. */
export function abKeyError(x: number): string | null {
  return typeof x === "number" && Number.isFinite(x)
    ? null
    : "Klíč x musí být číslo – operace se neprovedla.";
}

/** Definice vyžaduje celá a ≥ 2 a b ≥ 2a − 1; s jinými hodnotami by dělení vrcholů nemuselo nikdy skončit. */
export function abParamError(a: number, b: number): string | null {
  return Number.isInteger(a) && Number.isInteger(b) && a >= 2 && b >= 2 * a - 1
    ? null
    : `Parametry (a,b) = (${a},${b}) nejsou platné: musí být celá čísla, a ≥ 2 a b ≥ 2a − 1. Operace se neprovedla.`;
}

/** Jediný krok s vysvětlením, proč se operace neprovedla; strom zůstává beze změny. */
export function* abReject(st: ABState, message: string): StepGen<ABState> {
  clear(st);
  st.vars = {};
  yield { ...snap(st, null, message), error: true };
}

/** „má 1 syna / 3 syny / 5 synů“ */
export const sons = (n: number) =>
  `${n} ${n === 1 ? "syna" : n >= 2 && n <= 4 ? "syny" : "synů"}`;

/* ------------------------------------------------------------------ pseudokódy */

export const PC_AB_FIND = [
  "Find(x):",
  "  v ← kořen",
  "  Dokud v není list:",
  "    i ← nejmenší index s x ≤ klíč_i(v) (jinak poslední syn)",
  "    v ← i-tý syn",
  "  Vrátíme, zda list v obsahuje x.",
];
export const PC_AB_INSERT = [
  "Insert(x):",
  "  Najdeme otce v, pod nějž x patří, a přidáme mu nový list s x.",
  "  Dokud má v více než b synů:",
  "    Je-li v kořen: vytvoříme nový kořen u s jediným synem v (výška +1);",
  "    jinak u ← otec v.",
  "    Rozdělíme v: pravých ⌊(b+1)/2⌋ synů přesuneme do nového bratra v′",
  "    vpravo od v; oddělovač mezi v a v′ přibude v u.",
  "    v ← u",
];
export const PC_AB_DELETE = [
  "Delete(x):",
  "  Najdeme list s x a odebereme ho; v ← jeho otec.",
  "  Dokud má v méně než a synů a není kořen:",
  "    u ← sousední bratr v",
  "    Má-li u více než a synů: přesuneme krajního syna u pod v a končíme.",
  "    Jinak sloučíme v a u do jednoho vrcholu; v ← otec.",
  "  Má-li kořen jediného syna: tento syn se stává kořenem (výška −1).",
];

/* ------------------------------------------------------------------ operace */

/** Sestup z kořene do listu, kam x patří; vrací id listu (null pro prázdný strom). */
function* descend(
  st: ABState,
  x: number,
  line: number,
): Generator<Step<ABState>, number | null, unknown> {
  if (st.root === null) return null;
  let v: number = st.root;
  while (!isLeaf(st, v)) {
    const n = st.nodes[v];
    st.marks[v] = "n-active";
    const found = n.keys.findIndex((k) => x <= k);
    const i = found < 0 ? n.children.length - 1 : found;
    st.hot[v] = Math.min(i, n.keys.length - 1);
    const why =
      found < 0
        ? `${x} > ${n.keys[n.keys.length - 1]} (větší než všechny oddělovače)`
        : `${x} ≤ ${n.keys[found]}`;
    yield snap(
      st,
      line,
      `Ve vrcholu [${n.keys.join(" ")}]: ${why}, pokračujeme do ${i + 1}. syna.`,
    );
    v = n.children[i];
  }
  st.marks[v] = "n-active";
  return v;
}

export function* abFind(st: ABState, x: number): StepGen<ABState> {
  const err = abKeyError(x);
  if (err) {
    yield* abReject(st, err);
    return;
  }
  clear(st);
  st.vars = { x };
  const leaf = yield* descend(st, x, 3);
  if (leaf === null) {
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
  const ok = st.nodes[leaf].keys[0] === x;
  st.marks[leaf] = ok ? "n-found" : "n-bad";
  yield snap(
    st,
    5,
    ok
      ? `List obsahuje ${x} – nalezeno.`
      : `Došli jsme do listu ${st.nodes[leaf].keys[0]} ≠ ${x} – klíč ve stromu není.`,
  );
  const visited = abHeight(st) + 1;
  yield finalStep(
    st,
    "Find",
    x,
    `${ok ? "nalezeno" : "klíč ve stromu není"} – prošli jsme ${visited} ${visited === 1 ? "vrchol" : visited <= 4 ? "vrcholy" : "vrcholů"} od kořene k listu.`,
    ok ? undefined : "neutral",
  );
}

export function* abInsert(st: ABState, x: number): StepGen<ABState> {
  const err = abKeyError(x) ?? abParamError(st.a, st.b);
  if (err) {
    yield* abReject(st, err);
    return;
  }
  clear(st);
  st.vars = { x };
  const { b } = st;
  if (st.root === null) {
    const id = st.nextId++;
    st.nodes[id] = { id, keys: [x], children: [] };
    st.root = id;
    st.marks[id] = "n-new";
    yield snap(st, 1, `Strom byl prázdný – list ${x} je zároveň kořenem.`);
    yield finalStep(st, "Insert", x, `vložen první klíč; ${abSummary(st)}.`);
    return;
  }
  const leaf = (yield* descend(st, x, 1))!;
  if (st.nodes[leaf].keys[0] === x) {
    st.marks[leaf] = "n-found";
    yield snap(st, 1, `Klíč ${x} už ve stromu je – nic nevkládáme.`);
    yield finalStep(
      st,
      "Insert",
      x,
      `klíč už ve stromu byl, strom se nezměnil (${abSummary(st)}).`,
      "neutral",
    );
    return;
  }
  const id = st.nextId++;
  st.nodes[id] = { id, keys: [x], children: [] };
  st.hot = {}; // zvýraznění oddělovačů ze sestupu po změně struktury neplatí
  let v = parentOf(st, leaf);
  if (v === null) {
    // kořen byl list → nový kořen se dvěma listy
    const r = st.nextId++;
    const kids = x < st.nodes[leaf].keys[0] ? [id, leaf] : [leaf, id];
    st.nodes[r] = { id: r, keys: [], children: kids };
    st.root = r;
    fixKeys(st);
    st.marks = { [id]: "n-new", [r]: "n-new" };
    yield snap(
      st,
      1,
      `Jediný list ${st.nodes[leaf].keys[0]} nemá otce – vytvoříme nový kořen a oba listy pod něj zavěsíme.`,
    );
    st.marks = { [id]: "n-new" };
    yield finalStep(
      st,
      "Insert",
      x,
      `vložen nový list pod nový kořen; ${abSummary(st)}.`,
    );
    return;
  }
  const P = st.nodes[v];
  const pos = P.children.findIndex((c) => maxKey(st, c) > x);
  P.children.splice(pos < 0 ? P.children.length : pos, 0, id);
  fixKeys(st);
  st.marks = { [id]: "n-new", [v]: "n-active" };
  yield snap(
    st,
    1,
    `Přidáme list ${x} pod vrchol [${P.keys.join(" ")}] – ten má teď ${sons(P.children.length)}${P.children.length > b ? "" : `, což je nejvýše b = ${b}`}.`,
  );

  const heightBefore = abHeight(st);
  let splits = 0;
  while (st.nodes[v].children.length > b) {
    splits++;
    const V = st.nodes[v];
    st.marks = { [v]: "n-bad" };
    yield snap(
      st,
      2,
      `Vrchol [${V.keys.join(" ")}] má ${sons(V.children.length)}, tedy víc než b = ${b} – rozdělíme ho.`,
    );
    let u = parentOf(st, v);
    if (u === null) {
      u = st.nextId++;
      st.nodes[u] = { id: u, keys: [], children: [v] };
      st.root = u;
      st.marks = { [v]: "n-bad", [u]: "n-new" };
      yield snap(
        st,
        3,
        "Přeplněný vrchol je kořen – vytvoříme nad ním nový kořen (výška stromu vzroste o 1).",
      );
    }
    const take = Math.floor((b + 1) / 2);
    const nid = st.nextId++;
    const moved = V.children.splice(V.children.length - take, take);
    st.nodes[nid] = { id: nid, keys: [], children: moved };
    const U = st.nodes[u];
    const at = U.children.indexOf(v);
    U.children.splice(at + 1, 0, nid);
    fixKeys(st);
    st.marks = { [v]: "n-swap", [nid]: "n-new", [u]: "n-active" };
    st.hot = { [u]: at };
    // platné parametry dávají take ≥ 2 (b ≥ 3)
    yield snap(
      st,
      5,
      `${take <= 4 ? `Pravé ${take} syny` : `Pravých ${take} synů`} přesuneme do nového bratra; v otci přibude oddělovač ${U.keys[at]}.`,
    );
    st.hot = {};
    v = u;
  }
  clear(st);
  st.marks[id] = "n-new";
  const grown = abHeight(st) > heightBefore ? ", výška vzrostla o 1" : "";
  yield finalStep(
    st,
    "Insert",
    x,
    `vložen nový list, ${splits === 0 ? "bez dělení" : `${splits === 1 ? "jedno dělení" : `dělení: ${splits}`}`}${grown}; ${abSummary(st)}.`,
  );
}

export function* abDelete(st: ABState, x: number): StepGen<ABState> {
  const err = abKeyError(x) ?? abParamError(st.a, st.b);
  if (err) {
    yield* abReject(st, err);
    return;
  }
  clear(st);
  st.vars = { x };
  const { a } = st;
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
  const leaf = (yield* descend(st, x, 1))!;
  if (st.nodes[leaf].keys[0] !== x) {
    st.marks[leaf] = "n-bad";
    yield snap(
      st,
      1,
      `Došli jsme do listu ${st.nodes[leaf].keys[0]} ≠ ${x} – klíč ve stromu není, není co mazat.`,
    );
    yield finalStep(
      st,
      "Delete",
      x,
      `klíč ve stromu není, strom se nezměnil (${abSummary(st)}).`,
      "neutral",
    );
    return;
  }
  const heightBefore = abHeight(st);
  let merges = 0;
  let borrowed = false;
  st.marks[leaf] = "n-removed";
  yield snap(st, 1, `Odebereme list ${x}.`);
  st.hot = {}; // zvýraznění oddělovačů ze sestupu po změně struktury neplatí
  let v: number | null = parentOf(st, leaf);
  delete st.nodes[leaf];
  if (v === null) {
    st.root = null;
    st.marks = {};
    yield finalStep(
      st,
      "Delete",
      x,
      "byl to jediný klíč, strom je teď prázdný.",
    );
    return;
  }
  st.nodes[v].children = st.nodes[v].children.filter((c) => c !== leaf);
  fixKeys(st);
  st.marks = { [v]: "n-active" };
  const left = st.nodes[v].children.length;
  const note =
    v === st.root
      ? " Je to kořen, pro ten dolní mez a neplatí."
      : left >= a
        ? ` To je aspoň a = ${a}, vrchol zůstává v pořádku.`
        : "";
  yield snap(st, 2, `Otec má teď ${sons(left)}.${note}`);

  while (v !== null && v !== st.root && st.nodes[v].children.length < a) {
    const V = st.nodes[v];
    const p: number = parentOf(st, v)!;
    const P = st.nodes[p];
    const idx = P.children.indexOf(v);
    const uIdx = idx > 0 ? idx - 1 : idx + 1;
    const u = P.children[uIdx];
    const U = st.nodes[u];
    st.marks = { [v]: "n-bad", [u]: "n-compare", [p]: "n-active" };
    yield snap(
      st,
      3,
      `Vrchol má ${sons(V.children.length)}, tedy méně než a = ${a}. Jeho ${uIdx < idx ? "levý" : "pravý"} bratr má ${sons(U.children.length)}.`,
    );
    if (U.children.length > a) {
      // půjčka: krajní syn bratra přejde pod v
      if (uIdx < idx) V.children.unshift(U.children.pop()!);
      else V.children.push(U.children.shift()!);
      fixKeys(st);
      st.marks = { [v]: "n-new", [u]: "n-swap", [p]: "n-active" };
      yield snap(
        st,
        4,
        "Bratr má syna nazbyt – přesuneme jeho krajního syna a opravíme oddělovače v otci.",
      );
      borrowed = true;
      break;
    }
    // sloučení
    const [keep, gone] = uIdx < idx ? [u, v] : [v, u];
    st.nodes[keep].children.push(...st.nodes[gone].children);
    P.children.splice(P.children.indexOf(gone), 1);
    delete st.nodes[gone];
    fixKeys(st);
    st.marks = { [keep]: "n-new", [p]: "n-active" };
    yield snap(
      st,
      5,
      `Sloučíme oba vrcholy do jednoho (${sons(st.nodes[keep].children.length)}, nejvýše b = ${st.b}) a z otce zmizí jeden oddělovač.`,
    );
    merges++;
    v = p;
  }
  if (st.root !== null && st.nodes[st.root].children.length === 1) {
    const old = st.root;
    st.root = st.nodes[old].children[0];
    delete st.nodes[old];
    st.marks = { [st.root]: "n-new" };
    yield snap(
      st,
      6,
      "Kořen má jediného syna – ten se stává novým kořenem, výška klesla o 1.",
    );
  }
  clear(st);
  const repairs = [
    merges === 1 ? "jedno sloučení" : merges > 1 ? `sloučení: ${merges}` : "",
    borrowed ? "přesun syna od bratra" : "",
  ]
    .filter(Boolean)
    .join(" a ");
  const shrunk = abHeight(st) < heightBefore ? ", výška klesla o 1" : "";
  yield finalStep(
    st,
    "Delete",
    x,
    `list odebrán, ${repairs || "bez opravy vrcholů"}${shrunk}; ${abSummary(st)}.`,
  );
}

export function abInsertSilent(st: ABState, x: number) {
  const g = abInsert(st, x);
  while (!g.next().done) {
    /* přeskočíme kroky */
  }
  clear(st);
  st.vars = {};
}
