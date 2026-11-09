/**
 * Konstanty a texty grafu „skutečná cena a potenciál“ (AmortChart.tsx): výška pro canvasFit, legenda,
 * popis sloupce pro čtečku.
 */
import type { LegendItem } from "../../core/Visualizer";
import { fmt, type CostChart } from "./amortized";

/** výška grafu při 1 : 1 a meze pro canvasFit (na velkém plátně roste, na 1280 × 720 se zmenší) */
export const CHART_H = 150;
export const CHART_MIN_H = 90;
export const CHART_MAX_H = 760;
export const CHART_FIT = {
  shrink: CHART_H - CHART_MIN_H,
  grow: CHART_MAX_H - CHART_H,
};

export const CHART_LABEL =
  "Graf: skutečná cena operací (sloupce) a potenciál Φ (křivka)";

/** položky legendy grafu (přidávají se k legendě stránky) */
export const CHART_LEGEND: LegendItem[] = [
  { cls: "bar-plain", label: "skutečná cena operace (sloupec)" },
  { cls: "bar-bound", label: "poslední operace" },
  { cls: "sw-orange", label: "potenciál Φ (křivka)", shape: "line" },
];

/** Popis sloupce pro čtečku: „3. Insert(7): skutečná cena 1, Φ = 2“ (probíhající operace „zatím“). */
export function barText(chart: CostChart, i: number): string {
  const op = chart.ops[i];
  const live = chart.live && i === chart.ops.length - 1;
  return `${chart.first + i}. ${op.label}: skutečná cena ${live ? "zatím " : ""}${fmt(op.real)}, Φ = ${fmt(op.phi)}${live ? " (probíhá)" : ""}`;
}
