/**
 * Čistá geometrie sloupcového grafu s křivkou (BarChartView): sloupce = hodnota každé operace
 * (skutečná cena), křivka = průběžná veličina mezi operacemi (potenciál) – jako Průvodce obr. 9.2.
 * Testy v barChartLayout.test.ts.
 */

/** šířka místa na jednu operaci (px): víc ne (pár operací nezabere celé plátno), méně ne (posouvá se) */
export const BAR_MAX_SLOT = 48;
export const BAR_MIN_SLOT = 5;
/** aspoň tolik míst na ose x (první operace nejsou přes celou šířku) */
const MIN_SLOTS = 24;
/** levý okraj na popisky osy y, pravý okraj, místo nad sloupci (hodnota) a pod osou (čísla operací) */
const AXIS_W = 34;
const PAD_R = 10;
const PAD_TOP = 16;
const BOTTOM = 22;
/** nejmenší vzdálenost popisků osy x */
const X_LABEL_GAP = 28;
/** od jaké šířky místa se nad sloupce píše hodnota */
const VALUE_SLOT = 22;
const MIN_PLOT_H = 40;

export interface BarChartSpec {
  /** hodnota každé operace (≥ 0) */
  bars: readonly number[];
  /** průběžná veličina: před první operací a po každé z nich (délka bars + 1), nebo prázdné */
  line: readonly number[];
  /** pořadové číslo první operace (popisky osy x) */
  first: number;
  /** šířka obalu (px) */
  width: number;
  /** celková výška kresby (px) */
  height: number;
}

export interface BarGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  /** pořadové číslo operace */
  no: number;
}

export interface BarChartLayout {
  W: number;
  H: number;
  /** šířka místa jedné operace */
  slot: number;
  plot: { left: number; top: number; right: number; bottom: number };
  bars: BarGeom[];
  line: { x: number; y: number; value: number }[];
  yTicks: { y: number; value: number }[];
  xTicks: { x: number; no: number }[];
  /** nad sloupci je místo na hodnotu */
  showValues: boolean;
}

/** Krok os: nejmenší 1, 2, 5 · 10^k ≥ raw, aspoň 1 (ceny i potenciály jsou celá čísla nebo poloviny). */
export function niceStep(raw: number): number {
  if (!(raw > 1)) return 1;
  const exp = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * exp >= raw) return m * exp;
  return 10 * exp;
}

const finite = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);

export function barChartLayout(spec: BarChartSpec): BarChartLayout {
  const bars = spec.bars.map(finite);
  const line = spec.line.map(finite);
  const width =
    Number.isFinite(spec.width) && spec.width > 0 ? spec.width : 600;
  const H = Math.max(
    MIN_PLOT_H + PAD_TOP + BOTTOM,
    Number.isFinite(spec.height) ? Math.round(spec.height) : 0,
  );
  const slots = Math.max(bars.length, MIN_SLOTS);
  const slot = Math.max(
    BAR_MIN_SLOT,
    Math.min(BAR_MAX_SLOT, Math.floor((width - AXIS_W - PAD_R) / slots)),
  );
  const content = AXIS_W + PAD_R + slots * slot;
  const W = Math.max(content, Math.floor(width));
  const plot = {
    left: AXIS_W,
    top: PAD_TOP,
    right: AXIS_W + slots * slot,
    bottom: H - BOTTOM,
  };
  const maxV = Math.max(1, ...bars, ...line);
  const step = niceStep(maxV / 4);
  const top = Math.ceil(maxV / step) * step;
  const yOf = (v: number) => plot.bottom - (v / top) * (plot.bottom - plot.top);
  const yTicks = [];
  for (let v = 0; v <= top + 1e-9; v += step)
    yTicks.push({ value: v, y: yOf(v) });
  const bw = Math.max(2, Math.round(slot * 0.7));
  const first = Number.isFinite(spec.first) ? Math.floor(spec.first) : 1;
  const barGeoms = bars.map((value, i) => {
    const y = yOf(value);
    return {
      x: plot.left + i * slot + (slot - bw) / 2,
      y,
      w: bw,
      h: plot.bottom - y,
      value,
      no: first + i,
    };
  });
  const linePts = line.map((value, k) => ({
    x: plot.left + k * slot,
    y: yOf(value),
    value,
  }));
  // popisky osy x po „hezkém“ kroku, aby byly aspoň X_LABEL_GAP od sebe
  const every =
    [1, 2, 5, 10, 20, 50, 100].find((k) => k * slot >= X_LABEL_GAP) ?? 100;
  const xTicks = barGeoms
    .filter((b) => b.no % every === 0)
    .map((b) => ({ x: b.x + b.w / 2, no: b.no }));
  return {
    W,
    H,
    slot,
    plot,
    bars: barGeoms,
    line: linePts,
    yTicks,
    xTicks,
    showValues: slot >= VALUE_SLOT,
  };
}
