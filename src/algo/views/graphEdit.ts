/**
 * Editor grafu na plátně (režim „Upravit graf“) – čistý reducer nad neměnným grafem (testy v graphEdit.test.ts).
 * Každá úprava vrací nový Graph s id podle pozic (algoritmy i edgeMarks na to spoléhají); původní graf se
 * nemění, takže už spočítané kroky přehrávače zůstanou platné. GraphEditor.tsx je jen tenká vrstva nad tím.
 */
import {
  layoutGraph,
  MAX_EDGES,
  MAX_NODES,
  parseGraphInput,
  type GEdge,
  type GNode,
  type Graph,
  type GraphIssue,
} from "../algos/graphs/graph";

export type GraphSelection =
  { kind: "node"; id: number } | { kind: "edge"; id: number };

export interface GraphEditOptions {
  /** povolit smyčky u–u (výchozí ne) */
  allowLoops?: boolean;
  /** povolit násobné hrany (výchozí ne) */
  allowMulti?: boolean;
}

export interface GraphEditState {
  graph: Graph;
  /** předchozí grafy, nejnovější poslední (Zpět) */
  undo: Graph[];
  selected: GraphSelection | null;
  /** první vrchol hrany zadávané ťuknutím (dotyk, klávesnice) */
  source: number | null;
  /** poslední hláška editoru (odmítnutá úprava, sloučené hrany…) */
  message: string | null;
  /** id posledního gesta přesunu – celý tah je v historii jednou */
  gesture: number | null;
  options: GraphEditOptions;
}

export type GraphEditAction =
  | {
      type: "addVertex";
      x: number;
      y: number;
      /** vrchol nemohl ležet pod kliknutím (jiný vrchol, okraj kresby) – editor to ohlásí (G-05) */
      moved?: boolean;
    }
  | { type: "move"; id: number; x: number; y: number; gesture?: number }
  | { type: "connect"; from: number; to: number; w?: number }
  | { type: "tapVertex"; id: number }
  | { type: "select"; target: GraphSelection | null }
  | { type: "setWeight"; edge: number; text: string }
  /** bez `target` smaže vybraný prvek */
  | { type: "remove"; target?: GraphSelection }
  | { type: "setDirected"; value: boolean }
  | { type: "setWeighted"; value: boolean }
  /** nový graf (import textem, předvolba) – jde vrátit */
  | { type: "load"; graph: Graph }
  /** nový graf zvenku bez historie (změna stránky, výchozí příklad) */
  | { type: "reset"; graph: Graph }
  | { type: "undo" }
  | { type: "dismiss" };

/** kolik úprav jde vrátit */
export const UNDO_LIMIT = 50;

export function initGraphEdit(
  graph: Graph,
  options: GraphEditOptions = {},
): GraphEditState {
  return {
    graph,
    undo: [],
    selected: null,
    source: null,
    message: null,
    gesture: null,
    options,
  };
}

/* ------------------------------------------------------------------ popisky */

const UPPER = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const LOWER = UPPER.map((c) => c.toLowerCase());
const INT = /^\d+$/;

/**
 * Další volný popisek vrcholu: graf s písmeny dostane další písmeno (A, B, … / a, b, …), jinak nejmenší
 * volné celé číslo – od 0, nebo od 1, když graf čísluje od 1 (všechny popisky jsou čísla ≥ 1).
 */
export function nextLabel(labels: readonly string[]): string {
  const used = new Set(labels);
  for (const abc of [UPPER, LOWER]) {
    if (labels.length && labels.every((l) => abc.includes(l))) {
      const free = abc.find((c) => !used.has(c));
      if (free) return free;
    }
  }
  const fromOne =
    labels.length > 0 && labels.every((l) => INT.test(l) && Number(l) >= 1);
  const start = fromOne ? 1 : 0;
  for (let i = start; ; i++) if (!used.has(String(i))) return String(i);
}

/** „1–2“ (neorientovaný) / „1→2“ (orientovaný) – pro hlášky */
export function edgeLabel(g: Graph, u: number, v: number): string {
  return `${g.nodes[u]?.label ?? "?"}${g.directed ? "→" : "–"}${g.nodes[v]?.label ?? "?"}`;
}

/* ------------------------------------------------------------------ pomocné */

const clamp01 = (v: number) =>
  Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

function withGraph(
  st: GraphEditState,
  graph: Graph,
  extra: Partial<GraphEditState> = {},
): GraphEditState {
  return {
    ...st,
    graph,
    undo: [...st.undo, st.graph].slice(-UNDO_LIMIT),
    message: null,
    gesture: null,
    ...extra,
  };
}

const reject = (st: GraphEditState, message: string): GraphEditState => ({
  ...st,
  message,
  source: null,
});

function hasEdge(g: Graph, u: number, v: number): boolean {
  return g.edges.some(
    (e) => (e.u === u && e.v === v) || (!g.directed && e.u === v && e.v === u),
  );
}

/** Graf bez vrcholu `id` (i s jeho hranami), id přečíslovaná podle pozic. */
function withoutNode(g: Graph, id: number): Graph {
  const map = (i: number) => (i > id ? i - 1 : i);
  const nodes = g.nodes
    .filter((n) => n.id !== id)
    .map((n, i) => ({ ...n, id: i }));
  const edges = g.edges
    .filter((e) => e.u !== id && e.v !== id)
    .map((e, i) => ({ ...e, id: i, u: map(e.u), v: map(e.v) }));
  return { ...g, nodes, edges };
}

function withoutEdge(g: Graph, id: number): Graph {
  return {
    ...g,
    edges: g.edges.filter((e) => e.id !== id).map((e, i) => ({ ...e, id: i })),
  };
}

/** Cena z textu: desetinná tečka i čárka, typografické minus; null = není konečné číslo. */
export function parseEdgeWeight(text: string): number | null {
  const t = text.trim().replace(/^−/, "-").replace(",", ".");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const w = Number(t);
  return Number.isFinite(w) ? w : null;
}

function connect(
  st: GraphEditState,
  from: number,
  to: number,
  w = 1,
): GraphEditState {
  const g = st.graph;
  if (!g.nodes[from] || !g.nodes[to]) return st;
  if (from === to && !st.options.allowLoops)
    return reject(st, "Smyčku (hranu z vrcholu do něj samého) editor nepřidá.");
  if (!st.options.allowMulti && hasEdge(g, from, to))
    return reject(st, `Hrana ${edgeLabel(g, from, to)} už v grafu je.`);
  if (g.edges.length >= MAX_EDGES)
    return reject(st, `Graf má nejvýše ${MAX_EDGES} hran.`);
  const e: GEdge = { id: g.edges.length, u: from, v: to, w };
  return withGraph(
    st,
    { ...g, edges: [...g.edges, e] },
    { selected: { kind: "edge", id: e.id }, source: null },
  );
}

/* ------------------------------------------------------------------ reducer */

export function graphEditReducer(
  st: GraphEditState,
  a: GraphEditAction,
): GraphEditState {
  const g = st.graph;
  switch (a.type) {
    case "addVertex": {
      if (g.nodes.length >= MAX_NODES)
        return reject(st, `Graf má nejvýše ${MAX_NODES} vrcholů.`);
      // kresba s pevným poměrem stran: vrchol smí do okraje letterboxu (mimo 0…1), aby ležel pod
      // kliknutím (meze hlídá GraphView – kresba se nezmenší); jinak osy 0…1 = celé plátno
      const keep = (v: number) => (g.aspect ? v : clamp01(v));
      const n: GNode = {
        id: g.nodes.length,
        label: nextLabel(g.nodes.map((m) => m.label)),
        x: keep(a.x),
        y: keep(a.y),
      };
      return withGraph(
        st,
        { ...g, nodes: [...g.nodes, n] },
        {
          selected: null,
          source: null,
          message: a.moved
            ? `Vrchol ${n.label} je posunutý vedle kliknutí – nepřekryje jiný vrchol a kresba se nezmenší.`
            : null,
        },
      );
    }
    case "move": {
      const n = g.nodes[a.id];
      if (!n) return st;
      const nodes = g.nodes.map((m) =>
        m.id === a.id ? { ...m, x: a.x, y: a.y } : m,
      );
      const next = { ...g, nodes };
      // pokračování téhož tahu se do historie nepřidává
      if (a.gesture !== undefined && a.gesture === st.gesture)
        return { ...st, graph: next };
      return withGraph(st, next, { gesture: a.gesture ?? null });
    }
    case "connect":
      return connect(st, a.from, a.to, a.w);
    case "tapVertex": {
      if (!g.nodes[a.id]) return st;
      if (st.source === null)
        return {
          ...st,
          source: a.id,
          selected: { kind: "node", id: a.id },
          message: null,
        };
      if (st.source === a.id) return { ...st, source: null, selected: null };
      return connect(st, st.source, a.id);
    }
    case "select":
      return { ...st, selected: a.target, source: null };
    case "setWeight": {
      const e = g.edges[a.edge];
      if (!e) return st;
      const w = parseEdgeWeight(a.text);
      if (w === null)
        return { ...st, message: `Cena „${a.text.trim()}“ není číslo.` };
      if (w === e.w) return st;
      return withGraph(
        st,
        {
          ...g,
          edges: g.edges.map((x) => (x.id === a.edge ? { ...x, w } : x)),
        },
        {
          selected: st.selected,
        },
      );
    }
    case "remove": {
      const t = a.target ?? st.selected;
      if (!t) return st;
      if (t.kind === "node" && g.nodes[t.id])
        return withGraph(st, withoutNode(g, t.id), {
          selected: null,
          source: null,
        });
      if (t.kind === "edge" && g.edges[t.id])
        return withGraph(st, withoutEdge(g, t.id), {
          selected: null,
          source: null,
        });
      return st;
    }
    case "setDirected": {
      if (g.directed === a.value) return st;
      if (a.value) return withGraph(st, { ...g, directed: true });
      // neorientovaný: u→v a v→u je táž hrana – nechá se první
      const seen = new Set<string>();
      const kept: GEdge[] = [];
      let merged = 0;
      for (const e of g.edges) {
        const k = e.u < e.v ? `${e.u}:${e.v}` : `${e.v}:${e.u}`;
        const reverse = e.u !== e.v && seen.has(k) && !st.options.allowMulti;
        if (reverse) {
          merged++;
          continue;
        }
        seen.add(k);
        kept.push({ ...e, id: kept.length });
      }
      return withGraph(
        st,
        { ...g, directed: false, edges: kept },
        {
          selected: null,
          message: merged
            ? `Sloučeny ${merged} dvojice protisměrných hran.`
            : null,
        },
      );
    }
    case "setWeighted":
      return g.weighted === a.value
        ? st
        : withGraph(st, { ...g, weighted: a.value });
    case "load":
      return withGraph(st, a.graph, { selected: null, source: null });
    case "reset":
      return initGraphEdit(a.graph, st.options);
    case "undo": {
      const prev = st.undo[st.undo.length - 1];
      if (!prev) return st;
      return {
        ...st,
        graph: prev,
        undo: st.undo.slice(0, -1),
        selected: null,
        source: null,
        message: null,
        gesture: null,
      };
    }
    case "dismiss":
      return st.message === null ? st : { ...st, message: null };
  }
}

/* ------------------------------------------------------------------ text */

/** Text grafu pro panel Import / export: hrany v pořadí („u v“ / „u v cena“), izolované vrcholy na konci. */
export function graphEditText(g: Graph): string {
  const lines = g.edges.map(
    (e) =>
      `${g.nodes[e.u].label} ${g.nodes[e.v].label}${g.weighted ? " " + e.w : ""}`,
  );
  const used = new Set(g.edges.flatMap((e) => [e.u, e.v]));
  for (const n of g.nodes) if (!used.has(n.id)) lines.push(n.label);
  return lines.join("\n");
}

/** Volné místo pro nový vrchol: bod mřížky nejdál od už umístěných (v poměru stran kresby). */
function freeSpot(
  placed: readonly { x: number; y: number }[],
  aspect: number,
): { x: number; y: number } {
  let best = { x: 0.5, y: 0.5 };
  let bestD = -1;
  const steps = 9;
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < steps; j++) {
      const p = {
        x: 0.08 + (0.84 * i) / (steps - 1),
        y: 0.08 + (0.84 * j) / (steps - 1),
      };
      const d = placed.reduce(
        (m, q) => Math.min(m, Math.hypot((p.x - q.x) * aspect, p.y - q.y)),
        Infinity,
      );
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  return best;
}

export interface ImportResult {
  graph: Graph;
  errors: GraphIssue[];
  warnings: GraphIssue[];
}

/**
 * Graf z textu (formát parseGraphInput, orientace a ceny podle `current`). Vrcholy se stejným jménem jako
 * v `current` zůstanou na svém místě (i u knižní předvolby – poměr stran a ohnutí hran mezi nimi se zachovají),
 * nové se umístí do volného místa; bez jediného známého vrcholu se graf rozloží automaticky.
 */
export function importGraphText(current: Graph, text: string): ImportResult {
  const parsed = parseGraphInput(text, current.directed, current.weighted, {
    layout: false,
  });
  const g = parsed.graph;
  const byLabel = new Map(current.nodes.map((n) => [n.label, n]));
  const known = g.nodes.filter((n) => byLabel.has(n.label));
  if (known.length === 0) {
    layoutGraph(g);
    return { graph: g, errors: parsed.errors, warnings: parsed.warnings };
  }
  const placed: { x: number; y: number }[] = [];
  for (const n of known) {
    const q = byLabel.get(n.label)!;
    n.x = q.x;
    n.y = q.y;
    placed.push(q);
  }
  for (const n of g.nodes) {
    if (byLabel.has(n.label)) continue;
    const p = freeSpot(placed, current.aspect ?? 1);
    n.x = p.x;
    n.y = p.y;
    placed.push(p);
  }
  if (current.aspect !== undefined) g.aspect = current.aspect;
  // ohnutí hran mezi stejnými vrcholy (k-tá hrana u→v ↔ k-tá hrana u→v)
  const key = (gr: Graph, e: GEdge) =>
    `${gr.nodes[e.u].label}\u0000${gr.nodes[e.v].label}`;
  const bends = new Map<string, (number | undefined)[]>();
  for (const e of current.edges)
    bends.set(key(current, e), [...(bends.get(key(current, e)) ?? []), e.bend]);
  const seen = new Map<string, number>();
  for (const e of g.edges) {
    const k = key(g, e);
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    const b = bends.get(k)?.[i];
    if (b !== undefined) e.bend = b;
  }
  return { graph: g, errors: parsed.errors, warnings: parsed.warnings };
}

/**
 * Klíč struktury grafu bez souřadnic: popisky, hrany, ceny, orientace. Stránka podle něj přepočítá kroky
 * algoritmu – přesun vrcholu (tah myší) běh nerestartuje, nová hrana ano.
 */
export function topologyKey(g: Graph): string {
  return [
    g.directed ? "d" : "u",
    g.weighted ? "w" : "-",
    g.nodes.map((n) => n.label).join("\u0001"),
    g.edges.map((e) => `${e.u},${e.v},${e.w}`).join(";"),
  ].join("\u0000");
}
