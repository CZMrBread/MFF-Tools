/**
 * Rovina konvexního obalu: velikost v px (viewBox), okraj a převod souřadnic 0–100 ↔ px (osa y nahoru).
 *
 * Rozsah roviny je tu jako literál, ne import PLANE z algos/geometry/hull: views/ jsou v buildu ve
 * vlastním chunku (algo-views) a hull.ts v chunku stránek – import vyhodnocený při načtení modulu by
 * v kruhu chunků dostal ještě neinicializovanou hodnotu (shodu hlídá hullView.test.ts).
 */
import type { HullPt } from "../algos/geometry/hull";
import { planeMapping, type PlaneBox } from "./pointEdit";

export const HULL_S = 400;
export const HULL_PAD = 22;
export const HULL_PLANE: PlaneBox = [0, 0, 100, 100];
export const HULL_MAP = planeMapping(HULL_S, HULL_PAD, HULL_PLANE);
/** viditelný poloměr bodu (px viewBoxu) – i úchop tahu (usePlaneDrag) se počítá od něj */
export const HULL_PT_R = 5.5;
/** rovina v px viewBoxu (meze tahu, poloha ×) – rámeček uvnitř okraje */
export const HULL_FRAME = {
  x1: HULL_PAD,
  y1: HULL_PAD,
  x2: HULL_S - HULL_PAD,
  y2: HULL_S - HULL_PAD,
};

/**
 * Kolik jednotek roviny (viewBox) připadá na 1 px vykreslené šířky – CSS z toho drží popisky bodů nejméně na
 * 11 px i v malé rovině (1280 × 720, měřítko 0,83 – UX-18). Bez měření (0) 1.
 */
export const hullLabelK = (renderedWidth: number): number =>
  renderedWidth > 0 ? HULL_S / renderedWidth : 1;

/** viewBox výřezu kolem bodů (okraj 26 px) roztažený na poměr `aspect` – pro náhled na úvodní stránce */
export function cropBox(points: readonly HullPt[], aspect: number): string {
  if (!points.length) return `0 0 ${HULL_S} ${HULL_S}`;
  const ps = points.map((p) => HULL_MAP.toPx(p.x, p.y));
  const m = 26;
  let x1 = Math.min(...ps.map((p) => p.x)) - m;
  let x2 = Math.max(...ps.map((p) => p.x)) + m;
  let y1 = Math.min(...ps.map((p) => p.y)) - m;
  let y2 = Math.max(...ps.map((p) => p.y)) + m;
  const w = x2 - x1;
  const h = y2 - y1;
  if (w / h < aspect) {
    const d = (h * aspect - w) / 2;
    x1 -= d;
    x2 += d;
  } else {
    const d = (w / aspect - h) / 2;
    y1 -= d;
    y2 += d;
  }
  const r = (v: number) => Math.round(v * 10) / 10;
  return `${r(x1)} ${r(y1)} ${r(x2 - x1)} ${r(y2 - y1)}`;
}
