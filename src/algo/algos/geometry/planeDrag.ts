/**
 * Tah v rovině s body (konvexní obal, k-d strom) – čisté funkce pro usePlaneDrag (testy v planeDrag.test.ts).
 *
 * - `pickPlaneTarget`: co je pod ukazatelem – bod (neviditelný úchop ≥ 22 px myš / 44 px prst, nejbližší
 *   vyhrává), tlačítko × vybraného bodu (úchop jen ≥ 16 px i pro prst – smazání chce mířit), roh či hrana obdélníku Q (úchopy se u malého Q zmenší, aby šel
 *   chytit i vnitřek), vnitřek Q, nebo prázdno. Vzdálenosti se měří v px obrazovky (`unit` = jednotek
 *   viewBoxu na 1 px), takže úchop je stejně velký v malé rovině (1280 × 720) i na velkém monitoru.
 * - `tapSelects`: ťuknutí blíž než TAP_SELECT_R px od středu bodu ho vybere; dál (jen v úchopu prstu)
 *   je to klepnutí do prázdna = nový bod.
 * - `resizeBox` / `moveBox`: obdélník Q (souřadnice roviny, osa y nahoru) po tahu rohu / hrany / vnitřku.
 *
 * Rovina má pevný viewBox – měřítko se během tahu nemění (stačí ho vzít při stisku: `screenUnit`).
 */
import {
  hitRadius,
  HIT_RADIUS_MOUSE,
  type DragBox,
  type Matrix2D,
  type P2,
} from "../../core/dragMath";
import { dragRect, type PlaneBox } from "../../views/pointEdit";

/** ťuknutí do této vzdálenosti (px obrazovky) od středu bodu bod vybere */
export const TAP_SELECT_R = HIT_RADIUS_MOUSE;
/** nejmenší poloměr úchopu tlačítka × (px obrazovky) – bez nafouknutí pro prst */
export const DEL_HIT_MIN = 16;
/** viditelná velikost úchopu rohu Q (px viewBoxu, poloviční strana čtverečku) */
export const HANDLE_R = 5;

/** Kolik jednotek viewBoxu připadá na 1 px obrazovky (z getScreenCTM); bez matice 1. */
export function screenUnit(m: Matrix2D | null | undefined): number {
  if (!m) return 1;
  const s = Math.hypot(m.a, m.b);
  return s > 1e-9 ? 1 / s : 1;
}

/** Úchop obdélníku: které strany Box [x1, y1, x2, y2] (rovina, y nahoru) se tahem mění. */
export interface RectHandle {
  xi: 0 | 2 | null;
  yi: 1 | 3 | null;
}

export type PlaneHit =
  /** bod; `d` = vzdálenost ukazatele od středu v px obrazovky */
  | { kind: "point"; id: number; d: number }
  | { kind: "remove"; id: number }
  | ({ kind: "handle" } & RectHandle)
  | { kind: "inside" }
  | { kind: "empty" };

export interface PickInput {
  /** ukazatel v px viewBoxu */
  p: P2;
  /** jednotek viewBoxu na 1 px obrazovky */
  unit: number;
  pointerType: string;
  /** středy bodů v px viewBoxu */
  points: readonly { id: number; at: P2 }[];
  /** viditelný poloměr bodu (px viewBoxu) */
  pointR: number;
  /** tlačítko × u vybraného bodu (střed a viditelný poloměr v px viewBoxu) */
  remove?: { id: number; at: P2; r: number } | null;
  /** obdélník Q v px viewBoxu (y1 = horní hrana na obrazovce = y2 roviny) */
  rect?: DragBox | null;
}

const dist = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.y - b.y);

export function pickPlaneTarget(inp: PickInput): PlaneHit {
  const { p, unit, pointerType } = inp;
  const scr = (v: number) => v / unit;
  let best: PlaneHit = { kind: "empty" };
  let bestD = Infinity;
  const offer = (hit: PlaneHit, d: number, r: number) => {
    if (d <= r && d < bestD) {
      best = hit;
      bestD = d;
    }
  };
  const pr = hitRadius(scr(inp.pointR), pointerType);
  for (const q of inp.points) {
    const d = scr(dist(q.at, p));
    offer({ kind: "point", id: q.id, d }, d, pr);
  }
  // × má úchop jen o kousek větší než kroužek, ani u prstu ne 44 px – smazání se nesmí trefit omylem
  if (inp.remove)
    offer(
      { kind: "remove", id: inp.remove.id },
      scr(dist(inp.remove.at, p)),
      Math.max(scr(inp.remove.r) + 6, DEL_HIT_MIN),
    );
  const rect = inp.rect;
  if (rect) {
    const side = Math.min(scr(rect.x2 - rect.x1), scr(rect.y2 - rect.y1));
    const full = hitRadius(scr(HANDLE_R), pointerType);
    // malé Q: úchopy rohů a hran se zmenší, aby zbyl vnitřek pro posun
    const cornerR = Math.min(full, Math.max(8, side / 3));
    const band = Math.min(full / 2, Math.max(6, side / 4));
    const corners: [P2, RectHandle][] = [
      [
        { x: rect.x1, y: rect.y1 },
        { xi: 0, yi: 3 },
      ],
      [
        { x: rect.x2, y: rect.y1 },
        { xi: 2, yi: 3 },
      ],
      [
        { x: rect.x1, y: rect.y2 },
        { xi: 0, yi: 1 },
      ],
      [
        { x: rect.x2, y: rect.y2 },
        { xi: 2, yi: 1 },
      ],
    ];
    for (const [c, h] of corners)
      offer({ kind: "handle", ...h }, scr(dist(c, p)), cornerR);
    if (best.kind !== "empty") return best;
    const inX = p.x >= rect.x1 && p.x <= rect.x2;
    const inY = p.y >= rect.y1 && p.y <= rect.y2;
    const edges: [number, boolean, RectHandle][] = [
      [Math.abs(p.y - rect.y1), inX, { xi: null, yi: 3 }],
      [Math.abs(p.y - rect.y2), inX, { xi: null, yi: 1 }],
      [Math.abs(p.x - rect.x1), inY, { xi: 0, yi: null }],
      [Math.abs(p.x - rect.x2), inY, { xi: 2, yi: null }],
    ];
    for (const [d, along, h] of edges)
      if (along) offer({ kind: "handle", ...h }, scr(d), band);
    if (best.kind !== "empty") return best;
    if (inX && inY) return { kind: "inside" };
  }
  return best;
}

/** Ťuknutí `d` px od středu bodu (bez tahu): vybrat ho (true), nebo přidat nový bod vedle (false). */
export const tapSelects = (d: number): boolean => d <= TAP_SELECT_R;

/**
 * Obdélník Q po tahu úchopu `h` o `d` (jednotky roviny): mění jen strany úchopu, výsledek je celočíselný,
 * srovnaný (tah přes protější stranu meze prohodí) a oříznutý do roviny.
 */
export function resizeBox(
  box: PlaneBox,
  h: RectHandle,
  d: P2,
  plane: PlaneBox,
): PlaneBox {
  const b: PlaneBox = [...box];
  if (h.xi !== null) b[h.xi] += d.x;
  if (h.yi !== null) b[h.yi] += d.y;
  return dragRect({ x: b[0], y: b[1] }, { x: b[2], y: b[3] }, plane);
}

/** Obdélník Q posunutý o `d` (jednotky roviny) se stejným rozměrem; o okraj roviny se zastaví. */
export function moveBox(box: PlaneBox, d: P2, plane: PlaneBox): PlaneBox {
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  const c = (v: number, lo: number, hi: number) =>
    Math.round(Math.max(lo, Math.min(hi, v)));
  const x1 = c(box[0] + d.x, plane[0], plane[2] - w);
  const y1 = c(box[1] + d.y, plane[1], plane[3] - h);
  return [x1, y1, x1 + w, y1 + h];
}

/** posun tlačítka × od středu vybraného bodu (px viewBoxu) a jeho viditelný poloměr */
export const DEL_OFF = 16;
export const DEL_R = 8;

/** Střed tlačítka × u bodu `c`: vpravo dole, u pravého / dolního okraje roviny překlopené dovnitř. */
export function removeButtonAt(c: P2, frame: DragBox, off = DEL_OFF): P2 {
  return {
    x: c.x + off + DEL_R > frame.x2 ? c.x - off : c.x + off,
    y: c.y + off + DEL_R > frame.y2 ? c.y - off : c.y + off,
  };
}

/** Rovina `plane` v px viewBoxu (meze taženého bodu, poloha tlačítka ×). */
export function planeFrame(
  map: { toPx: (x: number, y: number) => P2 },
  plane: PlaneBox,
): DragBox {
  const a = map.toPx(plane[0], plane[3]);
  const b = map.toPx(plane[2], plane[1]);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}
