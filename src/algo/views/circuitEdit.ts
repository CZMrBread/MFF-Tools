/**
 * Editor hradlové sítě na plátně (režim „Upravit síť“) – čistý reducer nad neměnnou sítí (testy
 * v circuitEdit.test.ts) a hook useCircuitEdit. CircuitEditor.tsx je jen tenká vrstva nad tím.
 *
 * Každá úprava vrací novou síť (původní zůstane – spočítané kroky přehrávače platí dál). Vodič vede
 * z výstupního portu (vstup sítě, hradlo) do vstupního portu (hradlo, výstup sítě); vodič, který by
 * uzavřel cyklus, editor odmítne s hláškou. Polohy se přichytávají k mřížce GRID.
 */
import { useReducer } from "react";
import {
  arityOf,
  GATE_INFO,
  MAX_INPUTS,
  TABLE_MAX_INPUTS,
  MAX_NODES,
  wouldCycle,
  type CNode,
  type Circuit,
  type GateFn,
  type NodeKind,
} from "../algos/parallel/circuit";
import {
  parseCircuitText,
  type CircuitTextIssue,
} from "../algos/parallel/circuitText";
import {
  autoLayout,
  clampInto,
  freeSpot,
  GRID,
  snapToGrid,
  type Bounds,
} from "./circuitLayout";

export type CircuitSelection =
  { kind: "node"; id: string } | { kind: "wire"; to: string; port: number };

export interface CircuitEditState {
  circuit: Circuit;
  /** předchozí sítě, nejnovější poslední (Zpět) */
  undo: Circuit[];
  selected: CircuitSelection | null;
  /** zdroj vodiče zadávaného ťuknutím / klávesnicí */
  source: string | null;
  /** poslední hláška (odmítnutý vodič, přepojení…) */
  message: string | null;
  /** id posledního tahu – celý tah je v historii jednou */
  gesture: number | null;
  /** roste při nové síti / Uspořádat (load, reset, arrange) – editor pak výřez plátna spočítá znovu */
  layoutEpoch: number;
}

export type CircuitEditAction =
  /** `within` = výřez plátna – vrchol u okraje se posune dovnitř (klik = prvek pod kurzorem) */
  | {
      type: "add";
      kind: NodeKind;
      fn?: GateFn;
      x: number;
      y: number;
      within?: Bounds;
    }
  /** přidat na volné místo (klávesnice, paleta bez tahu) */
  | { type: "addFree"; kind: NodeKind; fn?: GateFn }
  | {
      type: "move";
      id: string;
      x: number;
      y: number;
      gesture?: number;
      within?: Bounds;
    }
  /** posun o celé kroky mřížky (šipky) */
  | { type: "nudge"; id: string; dx: number; dy: number }
  /** vodič from → to; bez `port` do prvního volného portu */
  | { type: "connect"; from: string; to: string; port?: number }
  | { type: "tapNode"; id: string }
  | { type: "select"; target: CircuitSelection | null }
  /** bez `target` smaže vybraný prvek */
  | { type: "remove"; target?: CircuitSelection }
  | { type: "setFn"; id: string; fn: GateFn }
  /** rozvržení po vrstvách */
  | { type: "arrange" }
  /** nová síť (import, předvolba) – jde vrátit */
  | { type: "load"; circuit: Circuit }
  /** nová síť bez historie */
  | { type: "reset"; circuit: Circuit }
  | { type: "undo" }
  | { type: "dismiss" };

export const UNDO_LIMIT = 50;

export function initCircuitEdit(circuit: Circuit): CircuitEditState {
  return {
    circuit,
    undo: [],
    selected: null,
    source: null,
    message: null,
    gesture: null,
    layoutEpoch: 0,
  };
}

/* ------------------------------------------------------------------ jména */

const INPUT_NAMES = ["x", "y", "z", "w", "u", "v"];

/** Další volné jméno: vstupy x, y, z, w, u, v, pak x1…; výstupy q, q1…; hradla předpona funkce + číslo. */
export function nextName(
  c: Circuit,
  kind: NodeKind,
  fn: GateFn = "and",
): string {
  const used = new Set(c.nodes.map((n) => n.id));
  if (kind === "in") {
    const free = INPUT_NAMES.find((s) => !used.has(s));
    if (free) return free;
    for (let i = 1; ; i++) if (!used.has(`x${i}`)) return `x${i}`;
  }
  if (kind === "out") {
    if (!used.has("q")) return "q";
    for (let i = 1; ; i++) if (!used.has(`q${i}`)) return `q${i}`;
  }
  const p = GATE_INFO[fn].prefix;
  for (let i = 1; ; i++) if (!used.has(`${p}${i}`)) return `${p}${i}`;
}

/* ------------------------------------------------------------------ pomocné */

const RANK: Record<NodeKind, number> = { in: 0, gate: 1, out: 2 };

/** vloží vrchol na konec jeho skupiny (vstupy, hradla, výstupy) */
function insertNode(nodes: readonly CNode[], n: CNode): CNode[] {
  let at = nodes.length;
  for (let i = 0; i < nodes.length; i++)
    if (RANK[nodes[i].kind] > RANK[n.kind]) {
      at = i;
      break;
    }
  return [...nodes.slice(0, at), n, ...nodes.slice(at)];
}

function withCircuit(
  st: CircuitEditState,
  circuit: Circuit,
  extra: Partial<CircuitEditState> = {},
): CircuitEditState {
  return {
    ...st,
    circuit,
    undo: [...st.undo, st.circuit].slice(-UNDO_LIMIT),
    message: null,
    gesture: null,
    ...extra,
  };
}

const reject = (st: CircuitEditState, message: string): CircuitEditState => ({
  ...st,
  message,
  source: null,
});

const mapNodes = (c: Circuit, f: (n: CNode) => CNode): Circuit => ({
  ...c,
  nodes: c.nodes.map(f),
});

function newNode(
  c: Circuit,
  kind: NodeKind,
  fn: GateFn | undefined,
  x: number,
  y: number,
): CNode {
  const f = kind === "gate" ? (fn ?? "and") : undefined;
  return {
    id: nextName(c, kind, f),
    kind,
    ...(f ? { fn: f } : {}),
    inputs: Array.from({ length: arityOf({ kind, fn: f }) }, () => null),
    x,
    y,
  };
}

function canAdd(st: CircuitEditState, kind: NodeKind): string | null {
  const c = st.circuit;
  if (c.nodes.length >= MAX_NODES)
    return `Síť má nejvýše ${MAX_NODES} vrcholů.`;
  if (
    kind === "in" &&
    c.nodes.filter((n) => n.kind === "in").length >= MAX_INPUTS
  )
    return `Síť má nejvýše ${MAX_INPUTS} vstupů (pravdivostní tabulka se ukazuje do ${TABLE_MAX_INPUTS} vstupů – má 2ⁿ řádků).`;
  return null;
}

/** kam dát nový vrchol bez souřadnic: vstup pod ostatní vstupy, výstup vpravo, hradlo doprostřed */
function nearSpot(c: Circuit, kind: NodeKind): { x: number; y: number } {
  if (!c.nodes.length)
    return { x: kind === "in" ? 0 : kind === "out" ? 240 : 120, y: 0 };
  const xs = c.nodes.map((n) => n.x);
  const ys = c.nodes.map((n) => n.y);
  const same = c.nodes.filter((n) => n.kind === kind);
  if (kind === "in")
    return {
      x: Math.min(...xs),
      y: same.length
        ? Math.max(...same.map((n) => n.y)) + 2 * GRID
        : Math.min(...ys),
    };
  if (kind === "out")
    return {
      x: Math.max(...xs) + (same.length ? 0 : 3 * GRID),
      y: same.length
        ? Math.max(...same.map((n) => n.y)) + 3 * GRID
        : (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function connect(
  st: CircuitEditState,
  from: string,
  to: string,
  port?: number,
): CircuitEditState {
  const c = st.circuit;
  const src = c.nodes.find((n) => n.id === from);
  const dst = c.nodes.find((n) => n.id === to);
  if (!src || !dst) return st;
  if (src.kind === "out")
    return reject(
      st,
      `Z výstupu sítě ${from} nevede žádný vodič (výstup jen převezme hodnotu).`,
    );
  if (dst.kind === "in")
    return reject(st, `Do vstupu sítě ${to} nevede žádný vodič.`);
  const cyc = wouldCycle(c, from, to);
  if (cyc)
    return reject(
      st,
      `Vodič ${from} → ${to} by vytvořil cyklus ${cyc.join(" → ")} – hradlová síť musí být acyklická.`,
    );
  const a = dst.inputs.length;
  let j = port;
  if (j === undefined) {
    j = dst.inputs.findIndex((s) => s === null);
    if (j < 0) {
      if (a !== 1)
        return reject(
          st,
          `Všechny vstupy hradla ${to} jsou obsazené – táhněte vodič přímo na port, který chcete přepojit.`,
        );
      j = 0;
    }
  }
  if (j < 0 || j >= a) return st;
  const old = dst.inputs[j];
  if (old === from)
    return {
      ...st,
      selected: { kind: "wire", to, port: j },
      source: null,
      message: null,
    };
  const next = mapNodes(c, (n) =>
    n.id === to
      ? { ...n, inputs: n.inputs.map((s, k) => (k === j ? from : s)) }
      : n,
  );
  const what =
    dst.kind === "out" ? `Výstup ${to}` : `Vstup ${j + 1} hradla ${to}`;
  return withCircuit(st, next, {
    selected: { kind: "wire", to, port: j },
    source: null,
    message: old !== null ? `${what} přepojen z ${old} na ${from}.` : null,
  });
}

function removeNode(c: Circuit, id: string): Circuit {
  return {
    ...c,
    nodes: c.nodes
      .filter((n) => n.id !== id)
      .map((n) =>
        n.inputs.includes(id)
          ? { ...n, inputs: n.inputs.map((s) => (s === id ? null : s)) }
          : n,
      ),
  };
}

function moveTo(c: Circuit, id: string, x: number, y: number): Circuit {
  return mapNodes(c, (n) => {
    if (n.id !== id) return n;
    const m: CNode = { ...n, x, y };
    delete m.bus;
    return m;
  });
}

/* ------------------------------------------------------------------ reducer */

export function circuitEditReducer(
  st: CircuitEditState,
  a: CircuitEditAction,
): CircuitEditState {
  const c = st.circuit;
  switch (a.type) {
    case "add":
    case "addFree": {
      const why = canAdd(st, a.kind);
      if (why) return reject(st, why);
      const n0 = newNode(c, a.kind, a.fn, 0, 0);
      const p =
        a.type === "add"
          ? a.within
            ? clampInto(c, { ...n0, x: a.x, y: a.y }, a.within)
            : { x: snapToGrid(a.x), y: snapToGrid(a.y) }
          : freeSpot(c, n0, nearSpot(c, a.kind));
      const n = { ...n0, ...p };
      return withCircuit(
        st,
        { ...c, nodes: insertNode(c.nodes, n) },
        {
          selected: { kind: "node", id: n.id },
          source: null,
        },
      );
    }
    case "move": {
      const n = c.nodes.find((m) => m.id === a.id);
      if (!n) return st;
      const { x, y } = a.within
        ? clampInto(c, { ...n, x: a.x, y: a.y }, a.within)
        : { x: snapToGrid(a.x), y: snapToGrid(a.y) };
      if (x === n.x && y === n.y && n.bus === undefined) return st;
      const next = moveTo(c, a.id, x, y);
      if (a.gesture !== undefined && a.gesture === st.gesture)
        return { ...st, circuit: next };
      return withCircuit(st, next, { gesture: a.gesture ?? null });
    }
    case "nudge": {
      const n = c.nodes.find((m) => m.id === a.id);
      if (!n) return st;
      return withCircuit(
        st,
        moveTo(
          c,
          a.id,
          snapToGrid(n.x) + a.dx * GRID,
          snapToGrid(n.y) + a.dy * GRID,
        ),
      );
    }
    case "connect":
      return connect(st, a.from, a.to, a.port);
    case "tapNode": {
      const n = c.nodes.find((m) => m.id === a.id);
      if (!n) return st;
      if (st.source === null) {
        if (n.kind === "out")
          return {
            ...st,
            selected: { kind: "node", id: n.id },
            message: `Výstup sítě ${n.id} nemá výstupní port – vodič začněte u vstupu nebo hradla.`,
          };
        return {
          ...st,
          source: n.id,
          selected: { kind: "node", id: n.id },
          message: null,
        };
      }
      if (st.source === a.id) return { ...st, source: null, selected: null };
      return connect(st, st.source, a.id);
    }
    case "select":
      return { ...st, selected: a.target, source: null };
    case "remove": {
      const t = a.target ?? st.selected;
      if (!t) return st;
      if (t.kind === "node") {
        if (!c.nodes.some((n) => n.id === t.id)) return st;
        return withCircuit(st, removeNode(c, t.id), {
          selected: null,
          source: null,
        });
      }
      const n = c.nodes.find((m) => m.id === t.to);
      if (!n || n.inputs[t.port] == null) return st;
      return withCircuit(
        st,
        mapNodes(c, (m) =>
          m.id === t.to
            ? {
                ...m,
                inputs: m.inputs.map((s, k) => (k === t.port ? null : s)),
              }
            : m,
        ),
        { selected: null, source: null },
      );
    }
    case "setFn": {
      const n = c.nodes.find((m) => m.id === a.id);
      if (!n || n.kind !== "gate" || n.fn === a.fn) return st;
      const ar = GATE_INFO[a.fn].arity;
      const inputs = Array.from({ length: ar }, (_, k) => n.inputs[k] ?? null);
      return withCircuit(
        st,
        mapNodes(c, (m) => (m.id === a.id ? { ...m, fn: a.fn, inputs } : m)),
        {
          selected: st.selected,
        },
      );
    }
    case "arrange":
      return {
        ...withCircuit(st, autoLayout(c), { selected: st.selected }),
        layoutEpoch: st.layoutEpoch + 1,
      };
    case "load":
      return {
        ...withCircuit(st, a.circuit, { selected: null, source: null }),
        layoutEpoch: st.layoutEpoch + 1,
      };
    case "reset":
      return {
        ...initCircuitEdit(a.circuit),
        layoutEpoch: st.layoutEpoch + 1,
      };
    case "undo": {
      const prev = st.undo[st.undo.length - 1];
      if (!prev) return st;
      return {
        ...st,
        circuit: prev,
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

/* ------------------------------------------------------------------ import textem */

export interface CircuitImport {
  /** nová síť; při chybě beze změny `current` */
  circuit: Circuit;
  errors: CircuitTextIssue[];
}

/**
 * Síť z textu (circuitText.ts). Vrcholy se stejným jménem jako v `current` zůstanou na místě (i knižní
 * sběrnice), nové se umístí poblíž místa podle rozvržení po vrstvách, bez překryvu; bez jediného
 * známého vrcholu se síť rozvrhne celá. Tok kresby (zleva doprava / shora dolů) se zachová.
 */
export function importCircuitText(
  current: Circuit,
  text: string,
): CircuitImport {
  const r = parseCircuitText(text);
  if (r.errors.length) return { circuit: current, errors: r.errors };
  const flow = current.flow ?? "right";
  const auto = autoLayout({ ...r.circuit, flow }, flow);
  const old = new Map(current.nodes.map((n) => [n.id, n]));
  const known = auto.nodes.filter((n) => old.has(n.id));
  if (!known.length) return { circuit: auto, errors: [] };
  // posun automatického rozvržení vůči dnešní kresbě (průměr přes známé vrcholy)
  const dx =
    known.reduce((s, n) => s + old.get(n.id)!.x - n.x, 0) / known.length;
  const dy =
    known.reduce((s, n) => s + old.get(n.id)!.y - n.y, 0) / known.length;
  const placed: CNode[] = [];
  const out: Circuit = { flow, nodes: placed };
  for (const n of auto.nodes) {
    const o = old.get(n.id);
    if (o)
      placed.push({
        ...n,
        x: o.x,
        y: o.y,
        ...(o.bus !== undefined ? { bus: o.bus } : {}),
      });
  }
  for (const n of auto.nodes) {
    if (old.has(n.id)) continue;
    const p = freeSpot(out, n, { x: n.x + dx, y: n.y + dy });
    placed.push({ ...n, ...p });
  }
  const order = new Map(auto.nodes.map((n, i) => [n.id, i]));
  placed.sort((p, q) => order.get(p.id)! - order.get(q.id)!);
  return { circuit: out, errors: [] };
}

/* ------------------------------------------------------------------ hook */

export interface CircuitEditControl {
  state: CircuitEditState;
  circuit: Circuit;
  dispatch: (a: CircuitEditAction) => void;
}

/** Stav editoru; `initial` jen při prvním renderu (nová síť zvenku: dispatch load / reset). */
export function useCircuitEdit(
  initial: Circuit | (() => Circuit),
): CircuitEditControl {
  const [state, dispatch] = useReducer(circuitEditReducer, null, () =>
    initCircuitEdit(typeof initial === "function" ? initial() : initial),
  );
  return { state, circuit: state.circuit, dispatch };
}
