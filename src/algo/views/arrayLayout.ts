import type { Item, Mark } from "../algos/sorting/types";
import { fitWidth } from "./useWidth";

/* Čistá geometrie a popisy pro ArrayView (testy v ArrayView.test.ts). */

/** Značky sloupců včetně „už na místě“ (pole `sorted`). */
export type BarMark = Mark | "sorted";

/**
 * Druhý kanál vedle barvy: znak pod sloupcem. Stránky dají stejný znak do legendy
 * (`{ cls: 'bar-compare', label: 'porovnávané', glyph: MARK_GLYPH.compare }`).
 */
export const MARK_GLYPH: Record<BarMark, string> = {
  compare: "?",
  swap: "⇄",
  active: "▲",
  min: "m",
  pivot: "p",
  bound: "|",
  sorted: "✓",
};

/** Slovní název značky (přístupný popis pole). */
export const MARK_LABEL: Record<BarMark, string> = {
  compare: "porovnávané",
  swap: "prohazované",
  active: "aktivní",
  min: "minimum",
  pivot: "pivot",
  bound: "hranice",
  sorted: "na místě",
};

export interface Range {
  from: number;
  to: number;
  label?: string;
}

/** Nejmenší šířka jednoho slotu v px (pod ní se plátno posouvá vodorovně). */
export const MIN_SLOT = 24;
/** U velkých polí (> 40 prvků) stačí užší sloupce bez popisků. */
export const MIN_SLOT_DENSE = 8;

/** místo na hodnotu nad sloupcem (px) */
export const TOP = 22;
const NEG_LABEL = 16; // místo na hodnotu pod záporným sloupcem
const GLYPH_ROW = 14;
const RANGE_H = 22;

const finite = (v: number) => Number.isFinite(v);

export interface BarGeom {
  y: number;
  h: number;
  /** y účaří popisku hodnoty */
  labelY: number;
}

export interface ArrayLayout {
  W: number;
  H: number;
  n: number;
  slot: number;
  gap: number;
  barW: number;
  lo: number;
  hi: number;
  /** y nulové osy */
  zeroY: number;
  /** spodní okraj oblasti sloupců */
  plotBottom: number;
  showValues: boolean;
  valueFont: number;
  glyphY: number | null;
  indexY: number | null;
  rangeY: number;
  /** svislá geometrie sloupce s hodnotou v */
  bar: (v: number) => BarGeom;
  /** x levého okraje slotu idx */
  sx: (idx: number) => number;
}

export interface LayoutOpts {
  max: number;
  min?: number;
  height?: number;
  showIndex?: boolean;
  slotCount?: number;
  offset?: number;
  ranges?: number;
  reserveRanges?: boolean;
  glyphs?: boolean;
}

/** Rozměry a škála pole – čistá funkce (testy v ArrayView.test.ts). */
export function arrayLayout(
  values: number[],
  measured: number,
  o: LayoutOpts,
): ArrayLayout {
  const n = Math.max(o.slotCount ?? values.length, 1);
  const height = Math.max(20, o.height ?? 220);
  const vals = values.filter(finite);
  const minW = n * (n <= 40 ? MIN_SLOT : MIN_SLOT_DENSE);
  const W = fitWidth(measured, minW);
  const slot = W / n;
  const gap = slot > 14 ? 3 : 1;
  const barW = Math.max(1, slot - gap);

  // škála [lo, hi] vždy obsahuje nulu: kladné sloupce rostou nahoru, záporné dolů od osy
  let lo = Math.min(0, finite(o.min ?? 0) ? (o.min ?? 0) : 0, ...vals);
  let hi = Math.max(0, finite(o.max) ? o.max : 0, ...vals);
  if (!(hi > lo)) hi = lo + 1;
  if (!finite(lo) || !finite(hi)) {
    lo = 0;
    hi = 1;
  }
  const zeroY = TOP + (height * hi) / (hi - lo);
  const plotBottom = TOP + height;

  // popisky hodnot: písmo podle nejdelšího čísla, pod 8 px je nekreslíme
  const maxLen = vals.reduce((m, v) => Math.max(m, String(v).length), 1);
  const valueFont = Math.min(13, (slot - 1) / (maxLen * 0.62));
  const showValues = valueFont >= 8;
  const negArea = showValues && lo < 0 ? NEG_LABEL : 0;
  const glyphRow = o.glyphs !== false && slot >= 10 ? GLYPH_ROW : 0;
  const showIndex = o.showIndex ?? true;
  const indexRow = showIndex ? 20 : 4;
  const rangeH = (o.ranges ?? 0) > 0 || o.reserveRanges ? RANGE_H : 0;
  const base = plotBottom + negArea;
  const H = base + glyphRow + indexRow + rangeH;

  const bar = (v: number): BarGeom => {
    if (!finite(v)) return { y: plotBottom - 2, h: 2, labelY: plotBottom - 7 };
    const len = (Math.abs(v) / (hi - lo)) * height;
    if (v >= 0) {
      let h = Math.max(2, len);
      let y = zeroY - h;
      if (y < TOP) {
        y = TOP;
        h = Math.max(0, zeroY - TOP);
      }
      // nula na horním okraji (samé záporné hodnoty a max ≤ 0): čárka pod osou
      if (h < 2) {
        y = zeroY;
        h = 2;
      }
      return { y, h, labelY: y - 5 };
    }
    const y = zeroY;
    const h = Math.max(0, Math.min(Math.max(2, len), plotBottom - y));
    return { y, h, labelY: y + h + 13 };
  };

  return {
    W,
    H,
    n,
    slot,
    gap,
    barW,
    lo,
    hi,
    zeroY,
    plotBottom,
    showValues,
    valueFont,
    glyphY: glyphRow ? base + 11 : null,
    indexY: showIndex && showValues ? base + glyphRow + 14 : null,
    rangeY: base + glyphRow + indexRow + 6,
    bar,
    sx: (idx: number) => (idx + (o.offset ?? 0)) * slot,
  };
}

/** Přístupný popis pole: „Pole: 38, 27, 43; porovnávané: 1, 2“ (nejvýš 20 hodnot, indexy 1-based). */
export function describeArray(
  items: (Item | null)[],
  marks: Record<number, Mark>,
  label = "Pole",
  limit = 20,
): string {
  if (items.length === 0) return `${label}: prázdné`;
  const vals = items
    .slice(0, limit)
    .map((it) => (it === null ? "–" : String(it.v)));
  let s = `${label}: ${vals.join(", ")}${items.length > limit ? `, … (celkem ${items.length} prvků)` : ""}`;
  const byMark = new Map<Mark, number[]>();
  for (const [k, m] of Object.entries(marks))
    byMark.set(m, [...(byMark.get(m) ?? []), Number(k) + 1]);
  for (const [m, idx] of byMark)
    s += `; ${MARK_LABEL[m] ?? m}: ${idx.sort((a, b) => a - b).join(", ")}`;
  return s;
}
