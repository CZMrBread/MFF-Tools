import { rng, snap, type StepGen } from "../../core/steps";
import type { TEdge, TNode } from "../../views/TreeView";

/* 2-d strom (k-d strom pro k = 2) – čisté generátory kroků a pomocné funkce bez UI. */

/** obdélník [x1, y1, x2, y2] (uzavřený) */
export type Box = [number, number, number, number];

export interface Pt {
  id: number;
  x: number;
  y: number;
}
export interface KNode {
  id: number;
  pt: Pt;
  axis: 0 | 1;
  left: number | null;
  right: number | null;
  /** oblast (obdélník), kterou vrchol pokrývá */
  box: Box;
}
export interface KdState {
  points: Pt[];
  nodes: Record<number, KNode>;
  root: number | null;
  marks: Record<number, string>;
  ptMarks: Record<number, string>;
  query: Box | null;
  vars: Record<string, string | number>;
  /** zvýrazněná oblast (obdélník vrcholu) */
  region: Box | null;
}

/** celá rovina, ve které body leží */
export const PLANE: Box = [0, 0, 100, 100];
/** nejvyšší počet bodů (kvůli čitelnosti obrázku i počtu kroků) */
export const MAX_N = 30;

/* Výchozí ukázka: dotaz předvede ohlášení celého podstromu i odříznutí (hlídá to test). */
export const DEFAULT_N = 12;
export const DEFAULT_SEED = 11;
export const DEFAULT_QUERY: Box = [0, 0, 60, 60];

export const PC_BUILD = [
  "Build(P, hloubka d, oblast R):",
  "  Je-li P prázdná: vrátíme ∅.",
  "  osa ← d mod 2   // sudá hloubka: x, lichá: y",
  "  m ← medián P podle osy (lineárním výběrem)",
  "  Vrchol s bodem m dělí R přímkou osa = m.",
  "  Levý syn ← Build(body < m, d+1, levá/dolní část),",
  "  pravý syn ← Build(body > m, d+1, pravá/horní část).",
];
export const PC_QUERY = [
  "RangeQuery(v, Q):   // Q = dotazovaný obdélník",
  "  Je-li v = ∅: konec.",
  "  Je-li oblast(v) ⊆ Q: ohlásíme celý podstrom v.",
  "  Je-li bod(v) ∈ Q: ohlásíme bod(v).",
  "  Pro každého syna s, jehož oblast protíná Q:",
  "    RangeQuery(s, Q)",
  "  (synové, jejichž oblast Q neprotíná, se vůbec nenavštíví)",
];

/* ---------- vstupy ---------- */

/** Zaokrouhlí na celé číslo a ořízne do [lo, hi]; pro NaN/±∞ vrátí fallback. */
export function clampInt(
  x: number,
  lo: number,
  hi: number,
  fallback: number,
): number {
  return Number.isFinite(x)
    ? Math.min(hi, Math.max(lo, Math.round(x)))
    : fallback;
}

/** Text číselného pole → číslo; prázdný nebo nečíselný text → null (pole se právě přepisuje, hodnotu neměníme). */
export function parseNumberField(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Seřadí meze dotazu (x1 ≤ x2, y1 ≤ y2). Vrací null, pokud některá mez není konečné číslo. */
export function normalizeQuery(q: readonly number[]): Box | null {
  if (q.length < 4) return null;
  for (let i = 0; i < 4; i++) if (!Number.isFinite(q[i])) return null;
  return [
    Math.min(q[0], q[2]),
    Math.min(q[1], q[3]),
    Math.max(q[0], q[2]),
    Math.max(q[1], q[3]),
  ];
}

/** Průnik dvou obdélníků (pro kreslení Q uvnitř roviny); null, je-li prázdný. */
export function clipBox(b: Box, to: Box = PLANE): Box | null {
  const c: Box = [
    Math.max(b[0], to[0]),
    Math.max(b[1], to[1]),
    Math.min(b[2], to[2]),
    Math.min(b[3], to[3]),
  ];
  return c[0] <= c[2] && c[1] <= c[3] ? c : null;
}

/**
 * n náhodných bodů se souřadnicemi 5..95. Žádné dva body nesdílejí x ani y (předpoklad ze skript),
 * takže „body < m“ / „body > m“ v pseudokódu platí doslova. n se zaokrouhlí a ořízne do 0..MAX_N.
 */
export function randomPoints(n: number, seed: number): Pt[] {
  const count = clampInt(n, 0, MAX_N, 0);
  const r = rng(seed);
  const perm = () => {
    const a = Array.from({ length: 91 }, (_, i) => i + 5);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const xs = perm();
  const ys = perm();
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: xs[i],
    y: ys[i],
  }));
}

/** Ponechá jen body s konečnými souřadnicemi uvnitř roviny; id musí být různá (jinak se přečíslují). */
export function sanitizePoints(points: readonly Pt[]): Pt[] {
  const ok = points.filter(
    (p) =>
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      p.x >= PLANE[0] &&
      p.x <= PLANE[2] &&
      p.y >= PLANE[1] &&
      p.y <= PLANE[3],
  );
  const ids = new Set(ok.map((p) => p.id));
  return ids.size === ok.length
    ? ok.map((p) => ({ ...p }))
    : ok.map((p, i) => ({ ...p, id: i }));
}

/* ---------- adresa stránky (sdílení odkazem) ---------- */

/** Celé číslo z parametru adresy v rozsahu lo..hi, jinak null (parametr chybí nebo nedává smysl). */
export function parseIntParam(
  text: string | null,
  lo: number,
  hi: number,
): number | null {
  if (text === null || !/^\s*-?\d+\s*$/.test(text)) return null;
  const v = Number(text);
  return v >= lo && v <= hi ? v : null;
}

/** Dotaz v adrese jako „x1,x2,y1,y2“ (pořadí polí na stránce) → Box [x1, y1, x2, y2]; meze 0..100, jinak null. */
export function parseQueryParam(text: string | null): Box | null {
  if (text === null) return null;
  const parts = text.split(",");
  if (parts.length !== 4) return null;
  const v = parts.map((t) => parseIntParam(t, PLANE[0], PLANE[2]));
  if (v.some((x) => x === null)) return null;
  const [x1, x2, y1, y2] = v as number[];
  return [x1, y1, x2, y2];
}

/** Box → text parametru adresy „x1,x2,y1,y2“ (inverze parseQueryParam). */
export const queryParam = (q: Box) => [q[0], q[2], q[1], q[3]].join(",");

export const sameBox = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Obdélník Q pro titulky a zprávy: „[x1, x2] × [y1, y2]“. */
export const fmtBox = (b: Box) => `[${b[0]}, ${b[2]}] × [${b[1]}, ${b[3]}]`;

/* ---------- čeština ---------- */

const plural = (n: number, one: string, few: string, many: string) =>
  `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
const body = (n: number) => plural(n, "bod", "body", "bodů");
const fmtPt = (p: Pt) => `(${p.x}, ${p.y})`;

/* ---------- Build ---------- */

/** hloubka stromu (kořen = 0, prázdný strom = −1) */
export function kdDepth(st: KdState, id: number | null = st.root): number {
  if (id === null) return -1;
  return (
    1 +
    Math.max(kdDepth(st, st.nodes[id].left), kdDepth(st, st.nodes[id].right))
  );
}

export function* build(input: readonly Pt[]): StepGen<KdState> {
  const valid = sanitizePoints(input);
  const points = valid.slice(0, MAX_N);
  const st: KdState = {
    points,
    nodes: {},
    root: null,
    marks: {},
    ptMarks: {},
    query: null,
    vars: {},
    region: null,
  };
  const notes: string[] = [];
  if (valid.length < input.length)
    notes.push(
      ` Body mimo rovinu [0, 100] × [0, 100] jsme vynechali (${input.length - valid.length}).`,
    );
  if (points.length < valid.length)
    notes.push(` Bodů je víc než ${MAX_N}, použijeme prvních ${MAX_N}.`);
  if (!points.length) {
    yield snap(st, 1, `Žádné body – strom je prázdný.${notes.join("")}`);
    return;
  }
  let nextId = 1;
  yield snap(
    st,
    0,
    `${body(points.length)} v rovině. Stavíme 2-d strom.${notes.join("")}`,
  );
  function* rec(
    P: Pt[],
    d: number,
    box: Box,
    parent: number | null,
    side: "left" | "right" | null,
  ): StepGen<KdState> {
    if (!P.length) return;
    const axis = (d % 2) as 0 | 1;
    // V pseudokódu lineární výběr mediánu; tady pro jednoduchost třídíme (na výsledku to nic nemění).
    // Shodné souřadnice rozhoduje druhá souřadnice a id, aby byl výsledek jednoznačný.
    const sorted = [...P].sort(
      (a, b) =>
        (axis === 0 ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x) ||
        a.id - b.id,
    );
    const mi = Math.floor(sorted.length / 2);
    const m = sorted[mi];
    const id = nextId++;
    st.nodes[id] = { id, pt: m, axis, left: null, right: null, box };
    if (parent === null) st.root = id;
    else if (side === "left") st.nodes[parent].left = id;
    else st.nodes[parent].right = id;
    st.region = box;
    st.marks = { [id]: "n-active" };
    st.ptMarks = {};
    for (const p of P) st.ptMarks[p.id] = "pt-set";
    st.ptMarks[m.id] = "pt-active";
    const os = axis === 0 ? "x" : "y";
    st.vars = { hloubka: d, osa: os, bodů: P.length, medián: fmtPt(m) };
    const what =
      P.length === 1
        ? `zbývá jediný bod ${fmtPt(m)}, stane se listem`
        : `medián z ${P.length} bodů je ${fmtPt(m)}`;
    yield snap(
      st,
      4,
      `Hloubka ${d}, dělíme podle ${os}: ${what}. Přímka ${os} = ${axis === 0 ? m.x : m.y} dělí oblast ${fmtBox(box)}.`,
    );
    const leftBox: Box =
      axis === 0
        ? [box[0], box[1], m.x, box[3]]
        : [box[0], box[1], box[2], m.y];
    const rightBox: Box =
      axis === 0
        ? [m.x, box[1], box[2], box[3]]
        : [box[0], m.y, box[2], box[3]];
    yield* rec(sorted.slice(0, mi), d + 1, leftBox, id, "left");
    yield* rec(sorted.slice(mi + 1), d + 1, rightBox, id, "right");
  }
  yield* rec(points, 0, [...PLANE], null, null);
  st.marks = {};
  st.ptMarks = {};
  st.region = null;
  st.vars = {};
  const n = points.length;
  yield snap(
    st,
    null,
    `Build: strom postaven – ${plural(n, "vrchol", "vrcholy", "vrcholů")}, hloubka ${kdDepth(st)} = ⌊log₂ ${n}⌋ (kořen má hloubku 0). ` +
      "Čas O(n log n): mediány jedné hladiny najdeme dohromady v O(n), hladin je O(log n).",
  );
}

/* ---------- RangeQuery ---------- */

/** kolik nalezených bodů vypíše závěrečná zpráva dotazu */
const LIST_SHOWN = 8;

export const inside = (p: Pt, q: Box) =>
  p.x >= q[0] && p.x <= q[2] && p.y >= q[1] && p.y <= q[3];
export const intersects = (b: Box, q: Box) =>
  !(b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3]);
export const contained = (b: Box, q: Box) =>
  b[0] >= q[0] && b[2] <= q[2] && b[1] >= q[1] && b[3] <= q[3];

/**
 * Dotaz na obdélník. Meze se před výpočtem seřadí (x1 ≤ x2, y1 ≤ y2); nečíselné meze dotaz odmítnou.
 * Stav `st` je postavený strom (poslední krok Buildu) a generátor ho mění na místě.
 */
export function* query(st: KdState, qIn: readonly number[]): StepGen<KdState> {
  st.marks = {};
  st.ptMarks = {};
  st.region = null;
  st.vars = {};
  const norm = normalizeQuery(qIn);
  if (!norm) {
    st.query = null;
    yield snap(
      st,
      null,
      "Neplatný dotaz: všechny čtyři meze obdélníku Q musí být čísla.",
    );
    return;
  }
  const q: Box = norm;
  const swapped = qIn[0] > qIn[2] || qIn[1] > qIn[3];
  st.query = q;
  let visited = 0;
  let found = 0;
  st.vars = { "navštíveno vrcholů": 0, nalezeno: 0 };
  yield snap(
    st,
    0,
    `Dotaz: body v obdélníku Q = ${fmtBox(q)}.${swapped ? " (Meze byly zadané obráceně, prohodili jsme je.)" : ""}`,
  );
  // celý podstrom: ohlásit (cls = found) nebo označit jako odříznutý (cls = pruned)
  const markSubtree = (i: number | null, cls: "found" | "pruned") => {
    if (i === null) return;
    const v = st.nodes[i];
    if (cls === "found") found++;
    st.ptMarks[v.pt.id] = "pt-" + cls;
    st.marks[i] = "n-" + cls;
    markSubtree(v.left, cls);
    markSubtree(v.right, cls);
  };
  function* rec(id: number): StepGen<KdState> {
    const v = st.nodes[id];
    visited++;
    st.vars["navštíveno vrcholů"] = visited;
    st.marks[id] = "n-active";
    st.region = v.box;
    yield snap(st, 0, `Vrchol ${fmtPt(v.pt)}, oblast ${fmtBox(v.box)}.`);
    if (contained(v.box, q)) {
      const before = found;
      markSubtree(id, "found");
      st.vars["nalezeno"] = found;
      yield snap(
        st,
        2,
        `Celá oblast leží v Q – ohlásíme celý podstrom (${body(found - before)}) bez dalšího procházení.`,
      );
      return;
    }
    if (inside(v.pt, q)) {
      found++;
      st.ptMarks[v.pt.id] = "pt-found";
      st.marks[id] = "n-found";
      st.vars["nalezeno"] = found;
      yield snap(st, 3, `Bod ${fmtPt(v.pt)} leží v Q – ohlásíme ho.`);
    } else {
      st.ptMarks[v.pt.id] = "pt-visited";
      st.marks[id] = "n-visited";
      yield snap(st, 3, `Bod ${fmtPt(v.pt)} v Q neleží.`);
    }
    for (const c of [v.left, v.right]) {
      if (c === null) continue;
      const child = st.nodes[c];
      if (intersects(child.box, q)) {
        yield* rec(c);
      } else {
        markSubtree(c, "pruned");
        st.region = child.box;
        yield snap(
          st,
          6,
          `Oblast syna ${fmtPt(child.pt)}, tedy ${fmtBox(child.box)}, Q neprotíná – celý jeho podstrom přeskočíme.`,
        );
      }
      st.region = v.box;
    }
  }
  if (st.root !== null) yield* rec(st.root);
  st.region = null;
  const total = Object.keys(st.nodes).length;
  const hits = st.points
    .filter((p) => st.ptMarks[p.id] === "pt-found")
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const list = hits.length
    ? ` (${hits.slice(0, LIST_SHOWN).map(fmtPt).join(", ")}${hits.length > LIST_SHOWN ? ", …" : ""})`
    : "";
  yield snap(
    st,
    null,
    `RangeQuery: v Q leží ${body(found)}${list}, navštíveno ${visited} z ${total} ${total === 1 ? "vrcholu" : "vrcholů"}. ` +
      "Nejhorší případ je O(√n + k).",
  );
}

/* ---------- rozložení stromu ---------- */

/**
 * Vodorovné polohy vrcholů (0..1) podle in-order pořadí v HOTOVÉM stromu. Id se přidělují v preorderu
 * a jsou ve všech krocích stejná, takže vrchol stojí na svém konečném místě už během stavby.
 */
export function finalXs(st: KdState): Record<number, number> {
  const order: number[] = [];
  const walk = (id: number | null) => {
    if (id === null) return;
    walk(st.nodes[id].left);
    order.push(id);
    walk(st.nodes[id].right);
  };
  walk(st.root);
  const xs: Record<number, number> = {};
  order.forEach(
    (id, i) => (xs[id] = order.length === 1 ? 0.5 : i / (order.length - 1)),
  );
  return xs;
}

export function layoutKd(
  st: KdState,
  xs: Record<number, number> = finalXs(st),
): { nodes: TNode[]; edges: TEdge[] } {
  const nodes: TNode[] = [];
  const edges: TEdge[] = [];
  const walk = (id: number | null, d: number) => {
    if (id === null) return;
    const v = st.nodes[id];
    nodes.push({
      id,
      label: `${v.pt.x},${v.pt.y}`,
      x: xs[id] ?? 0.5,
      y: d,
      cls: st.marks[id],
      sub: v.axis === 0 ? "x" : "y",
    });
    for (const c of [v.left, v.right]) {
      if (c === null) continue;
      edges.push({ from: id, to: c });
      walk(c, d + 1);
    }
  };
  walk(st.root, 0);
  return { nodes, edges };
}
