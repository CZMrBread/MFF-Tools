/**
 * Geometrie hradlové sítě – čisté funkce (testy v circuitLayout.test.ts): velikosti vrcholů, porty,
 * pravoúhlé vodiče s rozvětvením (tečka jako v knize), automatické rozvržení po vrstvách (sloupec =
 * vrstva), pruhy vrstev S₀ … Sₖ a hledání portu / vrcholu pod ukazatelem.
 *
 * Kresba teče zleva doprava (obr. 15.1) nebo shora dolů (obr. 15.2 vpravo). Geometrie se počítá
 * v souřadnicích toku (u = po směru toku, v = napříč) a teprve nakonec převede na x, y.
 */
import {
  arityOf,
  circuitLayers,
  type CNode,
  type Circuit,
  type Flow,
} from "../algos/parallel/circuit";

export interface P2 {
  x: number;
  y: number;
}

/** mřížka editoru (přichytávání) */
export const GRID = 20;
/** hradlo: délka po směru toku a šířka napříč */
export const GATE_LEN = 44;
export const GATE_SPAN = 48;
/** poloměr kroužku vstupu / výstupu sítě */
export const PIN_R = 9;
/** krátký úsek vodiče u portu (vodič vedoucí „dozadu“) */
export const STUB = 10;
/** vzdálenost sloupců (vrstev) automatického rozvržení */
export const COL = 120;
export const COL_DOWN = 80;

const flowOf = (c: Pick<Circuit, "flow">): Flow => c.flow ?? "right";
const toXY = (flow: Flow, u: number, v: number): P2 =>
  flow === "down" ? { x: v, y: u } : { x: u, y: v };
const uv = (flow: Flow, p: P2) =>
  flow === "down" ? { u: p.y, v: p.x } : { u: p.x, v: p.y };

export const snapToGrid = (v: number) => Math.round(v / GRID) * GRID;

/** šířka popisku (odhad pro rozvržení a hranice kresby) */
export const labelWidth = (text: string) => 7.5 * text.length + 4;

/** rozměr vrcholu napříč tokem (pro rozestupy) */
const spanOf = (n: Pick<CNode, "kind">) =>
  n.kind === "gate" ? GATE_SPAN : 2 * PIN_R;
const lenOf = (n: Pick<CNode, "kind">) =>
  n.kind === "gate" ? GATE_LEN : 2 * PIN_R;

/** obdélník vrcholu (bez popisku) v x, y */
export function nodeBox(
  n: CNode,
  flow: Flow = "right",
): { x0: number; y0: number; x1: number; y1: number } {
  const hu = lenOf(n) / 2;
  const hv = spanOf(n) / 2;
  const a = toXY(flow, -hu, -hv);
  const b = toXY(flow, hu, hv);
  return { x0: n.x + a.x, y0: n.y + a.y, x1: n.x + b.x, y1: n.y + b.y };
}

/** výstupní port (vstup sítě, hradlo); výstup sítě žádný nemá */
export function outPort(n: CNode, flow: Flow = "right"): P2 | null {
  if (n.kind === "out") return null;
  const d = toXY(flow, lenOf(n) / 2, 0);
  return { x: n.x + d.x, y: n.y + d.y };
}

/** j-tý vstupní port (hradlo: v ¼ a ¾ šířky, jako v knize; výstup sítě: vlevo / nahoře) */
export function inPort(n: CNode, j: number, flow: Flow = "right"): P2 {
  const a = Math.max(1, arityOf(n));
  const off = n.kind === "gate" ? GATE_SPAN * ((2 * j + 1) / (2 * a) - 0.5) : 0;
  const d = toXY(flow, -lenOf(n) / 2, off);
  return { x: n.x + d.x, y: n.y + d.y };
}

export const wireKey = (to: string, port: number) => `${to}#${port}`;

export interface WireRoute {
  key: string;
  from: string;
  to: string;
  port: number;
  /** lomená čára ve směru toku */
  points: P2[];
}

export interface Routing {
  wires: WireRoute[];
  /** rozvětvení vodiče (tečka – „hrany jsou propojeny“, s. 383) a jeho zdroj */
  junctions: (P2 & { from: string })[];
}

/** Pravoúhlé vodiče: z portu po směru toku ke „sběrnici“ zdroje, napříč k portu cíle, k němu. */
export function routeWires(c: Circuit): Routing {
  const flow = flowOf(c);
  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  interface Pending {
    key: string;
    from: string;
    to: string;
    port: number;
    a: { u: number; v: number };
    b: { u: number; v: number };
  }
  const bySource = new Map<string, Pending[]>();
  for (const t of c.nodes)
    t.inputs.forEach((s, j) => {
      const src = s === null ? undefined : byId.get(s);
      const op = src && outPort(src, flow);
      if (!src || !op) return;
      const list = bySource.get(src.id) ?? [];
      list.push({
        key: wireKey(t.id, j),
        from: src.id,
        to: t.id,
        port: j,
        a: uv(flow, op),
        b: uv(flow, inPort(t, j, flow)),
      });
      bySource.set(src.id, list);
    });

  // sběrnice zdroje: zadaná (kniha) nebo uprostřed k nejbližšímu cíli; souběžné sběrnice se posunou
  const placed: { u: number; lo: number; hi: number }[] = [];
  const buses = new Map<string, number>();
  const sources = [...bySource.entries()]
    .map(([id, ws]) => {
      const a = ws[0].a;
      const fwd = ws.filter((w) => w.b.u - a.u >= 2 * STUB);
      const vs = [a.v, ...fwd.map((w) => w.b.v)];
      const given = byId.get(id)?.bus;
      const minU = Math.min(...fwd.map((w) => w.b.u));
      const auto = fwd.length ? Math.round((a.u + minU) / 2) : a.u + STUB;
      const ok =
        given !== undefined && fwd.length > 0 && given > a.u && given < minU;
      return {
        id,
        a,
        ws,
        fixed: ok,
        u: ok ? given! : auto,
        lo: Math.min(...vs),
        hi: Math.max(...vs),
      };
    })
    .sort(
      (p, q) => Number(q.fixed) - Number(p.fixed) || p.u - q.u || p.a.v - q.a.v,
    );
  for (const s of sources) {
    let u = s.u;
    if (!s.fixed && s.hi > s.lo)
      for (let k = 0; k < 6; k++) {
        const clash = placed.some(
          (p) => Math.abs(p.u - u) < 6 && p.lo <= s.hi && s.lo <= p.hi,
        );
        if (!clash) break;
        u += 8;
      }
    if (s.hi > s.lo) placed.push({ u, lo: s.lo, hi: s.hi });
    buses.set(s.id, u);
  }

  const wires: WireRoute[] = [];
  const junctions: (P2 & { from: string })[] = [];
  for (const s of sources) {
    const ub = buses.get(s.id)!;
    const { a } = s;
    const fwdV: number[] = [];
    for (const w of s.ws) {
      const { b } = w;
      let pts: { u: number; v: number }[];
      if (b.u - a.u >= 2 * STUB) {
        fwdV.push(b.v);
        pts =
          Math.abs(b.v - a.v) < 0.5
            ? [a, b]
            : [a, { u: ub, v: a.v }, { u: ub, v: b.v }, b];
      } else {
        // vodič „dozadu“ (řetěz obr. 15.2 vlevo): ven, napříč mezi vrcholy, zpět před cíl a do portu
        const ua = a.u + STUB;
        const uc = b.u - STUB;
        const vm =
          Math.abs(b.v - a.v) >= GATE_SPAN
            ? (a.v + b.v) / 2
            : Math.max(a.v, b.v) + GATE_SPAN / 2 + STUB;
        pts = [
          a,
          { u: ua, v: a.v },
          { u: ua, v: vm },
          { u: uc, v: vm },
          { u: uc, v: b.v },
          b,
        ];
      }
      wires.push({
        key: w.key,
        from: w.from,
        to: w.to,
        port: w.port,
        points: pts.map((p) => toXY(flow, p.u, p.v)),
      });
    }
    // tečky: bod sběrnice, ze kterého vedou aspoň tři úseky
    if (fwdV.length < 2) continue;
    const lo = Math.min(a.v, ...fwdV);
    const hi = Math.max(a.v, ...fwdV);
    const pts = [...new Set([a.v, ...fwdV])];
    for (const p of pts) {
      let deg = 0;
      if (Math.abs(p - a.v) < 0.5) deg++;
      if (fwdV.some((v) => Math.abs(v - p) < 0.5)) deg++;
      if (p > lo + 0.5) deg++;
      if (p < hi - 0.5) deg++;
      if (deg >= 3) junctions.push({ ...toXY(flow, ub, p), from: s.id });
    }
  }
  return { wires, junctions };
}

/* ------------------------------------------------------------------ automatické rozvržení */

/** rozestup vrcholů napříč tokem (násobek mřížky) */
function gap(a: CNode, b: CNode): number {
  return Math.ceil(((spanOf(a) + spanOf(b)) / 2 + 24) / GRID) * GRID;
}

/**
 * Rozvržení po vrstvách: sloupec = vrstva (takt), ve sloupci pořadí a poloha podle zdrojů (barycentrum),
 * vrcholy se nepřekrývají; vše na mřížce. Vstupy v pořadí sítě. Ruční „sběrnice“ se zahodí.
 */
export function autoLayout(c: Circuit, flow: Flow = flowOf(c)): Circuit {
  const L = circuitLayers(c);
  const maxL = Math.max(0, ...Object.values(L));
  const col = flow === "down" ? COL_DOWN : COL;
  const v = new Map<string, number>();
  for (let layer = 0; layer <= maxL + 1; layer++) {
    // vrcholy bez vrstvy (cyklus) dostanou poslední sloupec
    const nodes = c.nodes.filter((n) =>
      layer <= maxL ? L[n.id] === layer : L[n.id] === undefined,
    );
    if (!nodes.length) continue;
    const want = nodes.map((n, i) => {
      const src = n.inputs
        .map((s) => (s === null ? undefined : v.get(s)))
        .filter((x): x is number => x !== undefined);
      return {
        n,
        i,
        d: src.length
          ? src.reduce((p, q) => p + q, 0) / src.length
          : i * GRID * 3,
      };
    });
    if (layer === 0) want.forEach((w, i) => (w.d = i)); // vstupy v pořadí sítě
    want.sort((p, q) => p.d - q.d || p.i - q.i);
    const pos: number[] = [];
    want.forEach((w, k) => {
      const base = layer === 0 ? 0 : w.d;
      pos.push(
        k === 0 ? base : Math.max(base, pos[k - 1] + gap(want[k - 1].n, w.n)),
      );
    });
    if (layer > 0) {
      const shift =
        want.reduce((s, w) => s + w.d, 0) / want.length -
        pos.reduce((s, p) => s + p, 0) / pos.length;
      for (let k = 0; k < pos.length; k++) pos[k] += shift;
    }
    want.forEach((w, k) => v.set(w.n.id, pos[k]));
  }
  const vs = [...v.values()];
  const v0 = vs.length ? Math.min(...vs) : 0;
  const nodes = c.nodes.map((n) => {
    const layer = L[n.id] ?? maxL + 1;
    const p = toXY(
      flow,
      snapToGrid(layer * col),
      snapToGrid((v.get(n.id) ?? 0) - v0),
    );
    const out: CNode = { ...n, x: p.x, y: p.y };
    delete out.bus;
    return out;
  });
  // přichycení mohlo dva vrcholy sloupce spojit – rozestoupit
  for (let layer = 0; layer <= maxL + 1; layer++) {
    const col = nodes
      .filter((n) => (L[n.id] ?? maxL + 1) === layer)
      .sort((p, q) => uv(flow, p).v - uv(flow, q).v);
    for (let k = 1; k < col.length; k++) {
      const prev = uv(flow, col[k - 1]).v;
      const min = prev + gap(col[k - 1], col[k]);
      if (uv(flow, col[k]).v < min) {
        const p = toXY(flow, uv(flow, col[k]).u, min);
        col[k].x = p.x;
        col[k].y = p.y;
      }
    }
  }
  return { ...c, flow, nodes };
}

/* ------------------------------------------------------------------ vrstvy a hranice */

export interface LayerBands {
  /** dělicí čáry mezi vrstvami (souřadnice po směru toku) */
  separators: number[];
  /** střed vrstvy po směru toku pro popisek S_i */
  labels: { layer: number; at: number }[];
}

/**
 * Pruhy vrstev jako tečkované čáry v obr. 15.1 – jen když jdou vrstvy po směru toku od sebe oddělit
 * (každá vrstva celá před další); jinak null (vlastní kresba – vrstva se ukáže u vrcholu).
 */
export function layerBands(
  c: Circuit,
  layers: Readonly<Record<string, number>>,
): LayerBands | null {
  const flow = flowOf(c);
  const ext = new Map<number, { lo: number; hi: number }>();
  for (const n of c.nodes) {
    const L = layers[n.id];
    if (L === undefined) return null;
    const { u } = uv(flow, n);
    const h = lenOf(n) / 2;
    const e = ext.get(L) ?? { lo: Infinity, hi: -Infinity };
    ext.set(L, { lo: Math.min(e.lo, u - h), hi: Math.max(e.hi, u + h) });
  }
  const keys = [...ext.keys()].sort((a, b) => a - b);
  if (!keys.length) return null;
  const separators: number[] = [];
  for (let i = 1; i < keys.length; i++) {
    const a = ext.get(keys[i - 1])!;
    const b = ext.get(keys[i])!;
    if (a.hi >= b.lo) return null;
    separators.push((a.hi + b.lo) / 2);
  }
  return {
    separators,
    labels: keys.map((layer) => {
      const e = ext.get(layer)!;
      return { layer, at: (e.lo + e.hi) / 2 };
    }),
  };
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** prostor pro popisky vrstev (pod kresbou / vlevo od ní) */
export const BAND_LABEL = 26;
/** prostor nad hradlem pro jeho jméno */
export const NAME_SPACE = 14;

/** Obdélník kresby včetně popisků vrcholů (a pruhu popisků vrstev), s okrajem `pad`. */
export function circuitBounds(
  c: Circuit,
  opts: { pad?: number; bandLabels?: boolean } = {},
): Bounds {
  const flow = flowOf(c);
  const pad = opts.pad ?? 12;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const n of c.nodes) {
    const b = nodeBox(n, flow);
    add(b.x0, b.y0);
    add(b.x1, b.y1);
    if (n.kind === "gate")
      if (flow === "down") add(b.x0 - labelWidth(n.id) * 0.75 - 3, b.y0);
      else add(b.x0, b.y0 - NAME_SPACE);
    const lw = labelWidth(n.id);
    if (n.kind !== "gate") {
      const before = n.kind === "in";
      if (flow === "right") add(before ? b.x0 - lw - 4 : b.x1 + lw + 4, n.y);
      else {
        add(n.x - lw / 2, n.y);
        add(n.x + lw / 2, before ? b.y0 - 18 : b.y1 + 18);
      }
    }
  }
  for (const w of routeWires(c).wires) for (const p of w.points) add(p.x, p.y);
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  if (opts.bandLabels) {
    if (flow === "right") y1 += BAND_LABEL;
    else x0 -= BAND_LABEL + 6;
  }
  return {
    x: x0 - pad,
    y: y0 - pad,
    w: x1 - x0 + 2 * pad,
    h: y1 - y0 + 2 * pad,
  };
}

/* ------------------------------------------------------------------ zásah ukazatelem */

export interface PortHit {
  node: string;
  port: number;
}

/** Nejbližší vstupní port do vzdálenosti `slack` (cíl taženého vodiče). */
export function inPortAt(c: Circuit, p: P2, slack = 12): PortHit | null {
  const flow = flowOf(c);
  let best: PortHit | null = null;
  let bestD = slack;
  for (const n of c.nodes) {
    const a = arityOf(n);
    for (let j = 0; j < a; j++) {
      const q = inPort(n, j, flow);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= bestD) {
        bestD = d;
        best = { node: n.id, port: j };
      }
    }
  }
  return best;
}

/** Výstupní port pod ukazatelem (začátek vodiče). */
export function outPortAt(c: Circuit, p: P2, slack = 10): string | null {
  const flow = flowOf(c);
  let best: string | null = null;
  let bestD = slack;
  for (const n of c.nodes) {
    const q = outPort(n, flow);
    if (!q) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

/** Vrchol, jehož obdélník (+ `slack`) obsahuje bod; poslední nakreslený vyhrává. */
export function nodeAt(c: Circuit, p: P2, slack = 2): string | null {
  const flow = flowOf(c);
  for (let i = c.nodes.length - 1; i >= 0; i--) {
    const b = nodeBox(c.nodes[i], flow);
    if (
      p.x >= b.x0 - slack &&
      p.x <= b.x1 + slack &&
      p.y >= b.y0 - slack &&
      p.y <= b.y1 + slack
    )
      return c.nodes[i].id;
  }
  return null;
}

/** Překrývá obdélník vrcholu `n` (v poloze x, y) jiný vrchol? (volné místo pro nový vrchol) */
export function overlaps(c: Circuit, n: CNode, skip?: string): boolean {
  const flow = flowOf(c);
  const a = nodeBox(n, flow);
  return c.nodes.some((m) => {
    if (m.id === skip || m.id === n.id) return false;
    const b = nodeBox(m, flow);
    return (
      a.x0 < b.x1 + 8 && b.x0 < a.x1 + 8 && a.y0 < b.y1 + 8 && b.y0 < a.y1 + 8
    );
  });
}

/** Nejbližší volné místo na mřížce kolem bodu (spirála) – nový vrchol z klávesnice či importu. */
export function freeSpot(c: Circuit, n: CNode, near: P2): P2 {
  for (let r = 0; r < 30; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const p = {
          x: snapToGrid(near.x) + dx * GRID,
          y: snapToGrid(near.y) + dy * GRID,
        };
        if (!overlaps(c, { ...n, ...p })) return p;
      }
  return { x: snapToGrid(near.x), y: snapToGrid(near.y) };
}

/**
 * Výřez plátna: kresba sítě (s pruhem popisků vrstev, když jdou vrstvy oddělit); v režimu úprav navíc
 * aspoň `MIN_EDIT` a volné místo vpravo a dole, kam jde přidávat.
 */
export const MIN_EDIT: Bounds = { x: -40, y: -40, w: 480, h: 240 };
export function canvasBounds(
  c: Circuit,
  editing: boolean,
  showLayers: boolean,
): Bounds {
  const bands = showLayers && !editing ? layerBands(c, circuitLayers(c)) : null;
  const b = circuitBounds(c, { bandLabels: !!bands, pad: editing ? 20 : 12 });
  if (!editing) return b;
  if (!c.nodes.length) return MIN_EDIT;
  // rezerva vpravo a dole (kam přidávat); malá síť dostane aspoň MIN_EDIT kolem svého středu
  const x0 = b.x;
  const y0 = b.y;
  const x1 = b.x + Math.max(b.w + 3 * GRID, MIN_EDIT.w);
  const y1 = b.y + Math.max(b.h + 2 * GRID, MIN_EDIT.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Leží bod ve výřezu? (puštění tahu z palety mimo plátno nic nepřidá) */
export const insideBounds = (b: Bounds, p: P2) =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** okraj kolem kresby v režimu úprav (stejný jako v canvasBounds) */
const EDIT_PAD = 20;

const contains = (outer: Bounds, b: Bounds) =>
  b.x >= outer.x - 0.5 &&
  b.y >= outer.y - 0.5 &&
  b.x + b.w <= outer.x + outer.w + 0.5 &&
  b.y + b.h <= outer.y + outer.h + 0.5;

/**
 * Výřez režimu úprav po změně sítě: dokud se kresba vejde, zůstává stejný (klik = prvek pod kurzorem,
 * nic se neposune); když kresba vyjede ven (přesun šipkami, Zpět…), výřez se jen zvětší – nikdy se
 * nesmrští ani neposune to, co už je vidět.
 */
export function growBounds(
  prev: Bounds,
  c: Circuit,
  showLayers: boolean,
): Bounds {
  if (!c.nodes.length) return prev;
  const need = circuitBounds(c, { pad: EDIT_PAD });
  if (contains(prev, need)) return prev;
  const fresh = canvasBounds(c, true, showLayers);
  const x0 = Math.min(prev.x, fresh.x);
  const y0 = Math.min(prev.y, fresh.y);
  const x1 = Math.max(prev.x + prev.w, need.x + need.w);
  const y1 = Math.max(prev.y + prev.h, need.y + need.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Poloha vrcholu `n` (na mřížce) co nejblíž jeho poloze tak, aby se i s popiskem vešel do výřezu `vb`
 * – nový či tažený vrchol u okraje plátna se posune dovnitř, místo aby výřez přeskočil.
 */
export function clampInto(c: Circuit, n: CNode, vb: Bounds): P2 {
  const flow = flowOf(c);
  const at = (x: number, y: number) =>
    circuitBounds(
      { flow, nodes: [{ ...n, x, y, inputs: n.inputs.map(() => null) }] },
      { pad: EDIT_PAD },
    );
  let x = snapToGrid(n.x);
  let y = snapToGrid(n.y);
  const b = at(x, y);
  if (b.w > vb.w || b.h > vb.h) return { x, y };
  if (b.x < vb.x) x += Math.ceil((vb.x - b.x) / GRID) * GRID;
  else if (b.x + b.w > vb.x + vb.w)
    x -= Math.ceil((b.x + b.w - vb.x - vb.w) / GRID) * GRID;
  if (b.y < vb.y) y += Math.ceil((vb.y - b.y) / GRID) * GRID;
  else if (b.y + b.h > vb.y + vb.h)
    y -= Math.ceil((b.y + b.h - vb.y - vb.h) / GRID) * GRID;
  return { x, y };
}
