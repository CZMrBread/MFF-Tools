/**
 * Kompaktní rozvržení stromu volání FFT (čistá geometrie, testy fftTreeLayout.test.ts). Strom je úplný
 * binární, takže šířku určují listy: W = n · (buňka + mezera) + 2 · okraj. Obecné rozvržení (a,b)-stromu
 * (multiTreeLayout) dává okraj podle nejširšího vrcholu (kořene) – pro n = 16 by strom zmenšilo na ~0,4.
 */
import type { FitLimits } from "../../core/canvasFit";
import type { CallSpec } from "./fft";

export interface CallBox {
  id: number;
  depth: number;
  /** střed vrcholu (px) */
  x: number;
  /** horní okraj (px) */
  y: number;
  w: number;
}

export interface CallEdge {
  from: number;
  to: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CallTreeLayout {
  W: number;
  H: number;
  /** šířka buňky jednoho indexu */
  cell: number;
  nodeH: number;
  boxes: CallBox[];
  edges: CallEdge[];
}

const NODE_H = 22;
const GAP = 6;
const TOP = 8;

export function callTreeLayout(
  calls: readonly CallSpec[],
  levelHeight: number,
): CallTreeLayout {
  const n = calls[0]?.idx.length ?? 1;
  // dvojciferné indexy (n = 16) potřebují užší buňky, jinak by strom nevešel
  const cell = n > 8 ? 18 : 26;
  const margin = cell / 2 + 4;
  const W = n * (cell + GAP) + 2 * margin;
  const depth = calls.reduce((m, c) => Math.max(m, c.depth), 0);
  const H = TOP + depth * levelHeight + NODE_H + 6;
  const boxes: CallBox[] = calls.map((c) => ({
    id: c.id,
    depth: c.depth,
    x: margin + c.x * (W - 2 * margin),
    y: TOP + c.depth * levelHeight,
    w: c.idx.length * cell,
  }));
  const edges: CallEdge[] = calls.flatMap((c) =>
    c.parent === null
      ? []
      : [
          {
            from: c.parent,
            to: c.id,
            x1: boxes[c.parent].x,
            y1: boxes[c.parent].y + NODE_H,
            x2: boxes[c.id].x,
            y2: boxes[c.id].y,
          },
        ],
  );
  return { W, H, cell, nodeH: NODE_H, boxes, edges };
}

/* ------------------------------------------------------------------ přiblížení podle plátna */

/** nejmenší a největší přiblížení stromu a kružnice */
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;

/**
 * Přiblížení horní řady (strom + kružnice) pro deltu z useCanvasFit: `topH` = její výška při 1 : 1. Na
 * velkém monitoru kresba úměrně naroste (i písmo), na malém se nejvýš trochu zmenší. `widthCap` = kolikrát
 * se řada vejde do šířky plátna – omezuje jen zvětšení (užší plátno zmenší SVG samo CSS).
 */
export function fftZoom(
  delta: number,
  topH: number,
  widthCap = Infinity,
): number {
  const z = Math.max(
    ZOOM_MIN,
    Math.min(ZOOM_MAX, 1 + delta / Math.max(1, topH)),
  );
  return z > 1 ? Math.min(z, Math.max(1, widthCap)) : z;
}

/** Meze delty odpovídající fftZoom. */
export function zoomLimits(topH: number): FitLimits {
  return {
    shrink: Math.round(topH * (1 - ZOOM_MIN)),
    grow: Math.round(topH * (ZOOM_MAX - 1)),
  };
}
