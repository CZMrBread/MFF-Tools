/**
 * Body a dotazový obdélník v rovině zadávané myší či prstem (k-d strom) – čisté funkce
 * (testy v pointEdit.test.ts). Tah ukazatelem nad nimi řeší algos/geometry/usePlaneDrag.ts.
 *
 * Gesta: klik do prázdna = nový bod, klik na bod = výběr (maže Delete nebo ×), tah bodu = přesun, tah z prázdna = obdélník Q.
 * k-d strom předpokládá různé x i různé y všech bodů – shodná souřadnice se posune na nejbližší volnou.
 */
import type { P2 } from "./graphGeometry";
import { TAP_SLOP } from "./pointer";

/** obdélník [x1, y1, x2, y2] (uzavřený), stejně jako Box v algos/geometry/kdtree */
export type PlaneBox = [number, number, number, number];

export interface PlanePoint {
  id: number;
  x: number;
  y: number;
}

export interface PlaneMapping {
  toPx: (x: number, y: number) => P2;
  fromPx: (px: number, py: number) => P2;
}

/** Čtvercové plátno `size` px s okrajem `pad`; osa y míří nahoru (jako v matematice i v Průvodci). */
export function planeMapping(
  size: number,
  pad: number,
  plane: PlaneBox,
): PlaneMapping {
  const [x1, y1, x2, y2] = plane;
  const inner = size - 2 * pad;
  const sx = inner / (x2 - x1 || 1);
  const sy = inner / (y2 - y1 || 1);
  return {
    toPx: (x, y) => ({ x: pad + (x - x1) * sx, y: size - pad - (y - y1) * sy }),
    fromPx: (px, py) => ({
      x: x1 + (px - pad) / sx,
      y: y1 + (size - pad - py) / sy,
    }),
  };
}

export interface PointEditOptions {
  plane: PlaneBox;
  /** nejvyšší počet bodů */
  max: number;
}

export interface PointEditResult {
  points: PlanePoint[];
  /** přidaný / přesunutý bod (po zaokrouhlení a posunu), null = nic */
  added: PlanePoint | null;
  error: string | null;
}

const clampInt = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));

/** Nejbližší volná celá hodnota k `v` v ⟨lo, hi⟩ (nejdřív +1, pak −1, +2…); null = žádná. */
function freeValue(
  v: number,
  used: Set<number>,
  lo: number,
  hi: number,
): number | null {
  if (!used.has(v)) return v;
  for (let d = 1; d <= hi - lo; d++) {
    for (const c of [v + d, v - d])
      if (c >= lo && c <= hi && !used.has(c)) return c;
  }
  return null;
}

function place(
  others: readonly PlanePoint[],
  p: P2,
  { plane }: PointEditOptions,
): { x: number; y: number } | null {
  const x0 = clampInt(p.x, plane[0], plane[2]);
  const y0 = clampInt(p.y, plane[1], plane[3]);
  const x = freeValue(x0, new Set(others.map((q) => q.x)), plane[0], plane[2]);
  const y = freeValue(y0, new Set(others.map((q) => q.y)), plane[1], plane[3]);
  return x === null || y === null ? null : { x, y };
}

const plural = (n: number) =>
  n === 1 ? "bod" : n >= 2 && n <= 4 ? "body" : "bodů";

export function addPoint(
  points: readonly PlanePoint[],
  p: P2,
  opts: PointEditOptions,
): PointEditResult {
  const same = points as PlanePoint[];
  if (points.length >= opts.max)
    return {
      points: same,
      added: null,
      error: `Nejvýše ${opts.max} ${plural(opts.max)}.`,
    };
  const at = place(points, p, opts);
  if (!at)
    return {
      points: same,
      added: null,
      error: "V rovině už není volná souřadnice.",
    };
  const added = {
    id: points.reduce((m, q) => Math.max(m, q.id), -1) + 1,
    ...at,
  };
  return { points: [...points, added], added, error: null };
}

export function movePoint(
  points: readonly PlanePoint[],
  id: number,
  p: P2,
  opts: PointEditOptions,
): PointEditResult {
  const same = points as PlanePoint[];
  const at = place(
    points.filter((q) => q.id !== id),
    p,
    opts,
  );
  if (!at || !points.some((q) => q.id === id))
    return {
      points: same,
      added: null,
      error: at ? null : "V rovině už není volná souřadnice.",
    };
  const moved = { id, ...at };
  return {
    points: points.map((q) => (q.id === id ? moved : q)),
    added: moved,
    error: null,
  };
}

export function removePoint(
  points: readonly PlanePoint[],
  id: number,
): PlanePoint[] {
  return points.filter((q) => q.id !== id);
}

/** Bod pod kurzorem (px), do `radius` px; nejbližší vyhrává. */
export function pointAt(
  points: readonly PlanePoint[],
  toPx: (x: number, y: number) => P2,
  p: P2,
  radius = 10,
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const q of points) {
    const c = toPx(q.x, q.y);
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d <= radius && d < bestD) {
      best = q.id;
      bestD = d;
    }
  }
  return best;
}

/** Obdélník z tahu (libovolným směrem): normalizovaný, celočíselný, oříznutý do roviny. */
export function dragRect(a: P2, b: P2, plane: PlaneBox): PlaneBox {
  const cx = (v: number) => clampInt(v, plane[0], plane[2]);
  const cy = (v: number) => clampInt(v, plane[1], plane[3]);
  const xs = [cx(a.x), cx(b.x)].sort((p, q) => p - q);
  const ys = [cy(a.y), cy(b.y)].sort((p, q) => p - q);
  return [xs[0], ys[0], xs[1], ys[1]];
}

export type PlaneGesture =
  | { kind: "add"; at: P2 }
  | { kind: "remove"; id: number }
  | { kind: "move"; id: number; to: P2 }
  | { kind: "query"; from: P2; to: P2 };

/**
 * Význam gesta: `startPx`/`endPx` v px (posun proti TAP_SLOP), `start`/`end` v souřadnicích roviny,
 * `hit` = bod pod kurzorem při stisku.
 */
export function planeGesture(g: {
  startPx: P2;
  endPx: P2;
  start: P2;
  end: P2;
  hit: number | null;
}): PlaneGesture {
  const moved =
    Math.hypot(g.endPx.x - g.startPx.x, g.endPx.y - g.startPx.y) >= TAP_SLOP;
  if (!moved)
    return g.hit === null
      ? { kind: "add", at: g.start }
      : { kind: "remove", id: g.hit };
  return g.hit === null
    ? { kind: "query", from: g.start, to: g.end }
    : { kind: "move", id: g.hit, to: g.end };
}
