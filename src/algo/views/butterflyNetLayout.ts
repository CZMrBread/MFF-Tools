/**
 * Geometrie motýlkové sítě FFT (Průvodce obr. 17.4, str. 438) – čistá funkce bez Reactu.
 *
 * Zleva: popisky vstupů, pak střídavě úsek drátu (na něm hodnota a dvojkový popisek), tečka rozbočení,
 * šikmé a rovné spoje do kroužků vrstvy, další úsek … a vpravo popisky výstupů. Vrstva l (b = 2^{l−1})
 * spojuje řádky, které se liší v bitu b: kroužek dostává rovně svůj řádek a šikmo řádek partnera.
 * Testy: butterflyNetLayout.test.ts.
 */
import type { FitLimits } from "../core/canvasFit";

export interface NetLayoutInput {
  n: number;
  /** vzdálenost řádků (px) */
  rowH: number;
  /** šířka úseku drátu pro hodnotu (px) */
  valueW: number;
  /** šířka oblasti šikmých spojů (px) */
  crossW?: number;
  /** šířka sloupce popisků vstupu i výstupu */
  labelW?: number;
}

export interface NetLink {
  /** vrstva 1 … log₂ n */
  layer: number;
  /** řádek kroužku, do kterého spoj vede */
  gateRow: number;
  /** řádek tečky, ze které vychází */
  fromRow: number;
  kind: "straight" | "cross";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface NetLayout {
  n: number;
  layers: number;
  W: number;
  H: number;
  /** poloměr kroužku */
  r: number;
  rowY: number[];
  /** pravý okraj popisků vstupu */
  inX: number;
  /** levý okraj popisků výstupu */
  outX: number;
  /** úsek drátu sloupce c (0 = po zrcadlení, c = po vrstvě c) */
  seg: { x1: number; x2: number }[];
  dotX: number[];
  circleX: number[];
  links: NetLink[];
}

/** výchozí vzdálenost řádků podle n */
export const BASE_ROW: Record<number, number> = { 2: 50, 4: 46, 8: 34, 16: 24 };
/** nejmenší vzdálenost řádků (n = 16 na nízkém plátně) */
export const MIN_ROW = 18;
const TOP = 16;
const BOTTOM = 16;

const baseRow = (n: number) => BASE_ROW[n] ?? 34;

export function netLayout({
  n,
  rowH,
  valueW,
  crossW = 38,
  labelW = 28,
}: NetLayoutInput): NetLayout {
  const layers = Math.round(Math.log2(n));
  const r = Math.max(6, Math.min(10, Math.floor(rowH / 2) - 2));
  const rowY = Array.from({ length: n }, (_, i) => TOP + i * rowH);
  const seg: NetLayout["seg"] = [];
  const dotX: number[] = [];
  const circleX: number[] = [];
  let x = labelW;
  for (let c = 0; c <= layers; c++) {
    seg.push({ x1: x, x2: x + valueW });
    x += valueW;
    if (c < layers) {
      dotX.push(x);
      circleX.push(x + crossW + r);
      x += crossW + 2 * r;
    }
  }
  const outX = x + 4;
  const links: NetLink[] = [];
  for (let l = 0; l < layers; l++) {
    const b = 2 ** l;
    for (let row = 0; row < n; row++) {
      const partner = (row & b) === 0 ? row + b : row - b;
      const cx = circleX[l];
      const cy = rowY[row];
      for (const [kind, from] of [
        ["straight", row],
        ["cross", partner],
      ] as const) {
        const x1 = dotX[l];
        const y1 = rowY[from];
        // konec na obvodu kroužku ve směru spoje
        const dx = cx - x1;
        const dy = cy - y1;
        const d = Math.hypot(dx, dy);
        links.push({
          layer: l + 1,
          gateRow: row,
          fromRow: from,
          kind,
          x1,
          y1,
          x2: cx - (dx / d) * r,
          y2: cy - (dy / d) * r,
        });
      }
    }
  }
  return {
    n,
    layers,
    W: outX + labelW,
    H: rowY[n - 1] + BOTTOM,
    r,
    rowY,
    inX: labelW - 4,
    outX,
    seg,
    dotX,
    circleX,
    links,
  };
}

/** Šířka úseku drátu pro nejdelší text hodnoty (písmo 10 px ≈ 6 px na znak). */
export function valueWidth(texts: readonly string[]): number {
  const len = texts.reduce((m, t) => Math.max(m, t.length), 0);
  return Math.max(44, Math.ceil(len * 6 + 10));
}

/** Dvojkové popisky nad drátem (obr. 17.4) se vejdou nad hodnotu jen při dost vysokém řádku. */
export const showBits = (rowH: number): boolean => rowH >= 26;

/** největší přiblížení na velkém monitoru */
const ZOOM_MAX = 2;

/**
 * Rozměry pro deltu z useCanvasFit: když výška chybí, zúží se řádky (písmo zůstane), když přebývá,
 * celá kresba se úměrně zvětší – nejvýš ZOOM_MAX a nejvýš `widthCap` (kolikrát se vejde do šířky).
 * `H0` = výška sítě při výchozí vzdálenosti řádků.
 */
export function netFit(
  delta: number,
  n: number,
  H0: number,
  widthCap = Infinity,
): { rowH: number; zoom: number } {
  const base = baseRow(n);
  if (delta <= 0)
    return {
      rowH: Math.max(MIN_ROW, Math.round(base + delta / Math.max(1, n - 1))),
      zoom: 1,
    };
  const z = Math.min(ZOOM_MAX, 1 + delta / Math.max(1, H0));
  return { rowH: base, zoom: Math.max(1, Math.min(z, widthCap)) };
}

/** Meze delty odpovídající netFit. */
export function netLimits(n: number, H0: number): FitLimits {
  return {
    shrink: (baseRow(n) - MIN_ROW) * (n - 1),
    grow: Math.round(H0 * (ZOOM_MAX - 1)),
  };
}
