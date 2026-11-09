import type { Step } from "../../core/steps";
import type { LegendItem } from "../../core/Visualizer";
import { MARK_GLYPH, MARK_LABEL, type BarMark } from "../../views/arrayLayout";
import { plainMath } from "./input";
import type { SortAlgorithm, SortState } from "./types";

/* Legenda stránky třídění: jen značky, které se v krocích opravdu vyskytnou, s popisky podle algoritmu. */

/** pořadí položek v legendě */
const ORDER: BarMark[] = [
  "compare",
  "swap",
  "active",
  "min",
  "pivot",
  "bound",
  "sorted",
];

/** Které značky (včetně „na správném místě“) se v krocích vyskytnou – v hlavním i v pomocném poli. */
export function usedMarks(steps: readonly Step<SortState>[]): Set<BarMark> {
  const used = new Set<BarMark>();
  for (const { state } of steps) {
    for (const m of Object.values(state.marks)) used.add(m);
    if (state.aux) for (const m of Object.values(state.aux.marks)) used.add(m);
    if (state.sorted.length > 0) used.add("sorted");
  }
  return used;
}

/**
 * Položky legendy: třída `bar-<značka>` (stejná jako na plátně), popisek podle algoritmu a znak, kterým
 * ArrayView značku kreslí pod sloupcem (význam tak nenese jen barva).
 */
export function legendFor(
  algo: SortAlgorithm,
  steps: readonly Step<SortState>[],
): LegendItem[] {
  const used = usedMarks(steps);
  return ORDER.filter((m) => used.has(m)).map((m) => ({
    cls: "bar-" + m,
    // legenda je prostý text → indexy jako x_i převedeme na Unicode
    label: plainMath(algo.legend?.[m] ?? MARK_LABEL[m]),
    glyph: MARK_GLYPH[m],
  }));
}

/** Popisek hlavní řady v kresbě podle značení knihy (jen kde ho kniha zavádí). */
const MAIN_ROW: Record<string, string> = {
  counting: "vstup x₁ … xₙ → výstup v₁ … vₙ",
  merge: "a₁ … aₙ",
  heap: "x₁ … xₙ",
};
export const mainRowLabel = (id: string): string | undefined =>
  Object.hasOwn(MAIN_ROW, id) ? MAIN_ROW[id] : undefined;

/** Položka legendy: akce Vytvořit a P[i] ← x pracují se vstupem P. */
export const P_LEGEND: LegendItem = {
  cls: "bar-plain",
  label: "P = x₁ … xₙ – vstup (Vytvořit, P[i] ← x)",
};
