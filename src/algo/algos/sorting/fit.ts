/**
 * Výška sloupců podle výšky plátna (core/canvasFit.ts): na desktopu na jednu obrazovku stránka
 * třídění změní výšku oblasti sloupců o deltu místo zmenšení celého SVG (i s písmem). U dvou polí nad
 * sebou (Mergesort + Z, Counting sort + počítadla) si deltu dělí podle výchozí výšky.
 */
import { stretch, type FitLimits } from "../../core/canvasFit";

/** pomocné pole pod hlavním: žádné, Z (Mergesort), počítadla (Counting sort) */
export type AuxKind = "none" | "merge" | "counting";

const MAIN = { base: 220, min: 60, max: 330 };
const AUX: Record<Exclude<AuxKind, "none">, typeof MAIN> = {
  merge: { base: 160, min: 30, max: 240 },
  counting: { base: 120, min: 30, max: 180 },
};

/** Výška oblasti sloupců hlavního a pomocného pole (0 = není) pro deltu z useCanvasFit. */
export function sortBarHeights(
  delta: number,
  kind: AuxKind,
): { main: number; aux: number } {
  if (kind === "none")
    return { main: stretch(MAIN.base, delta, MAIN.min, MAIN.max), aux: 0 };
  const a = AUX[kind];
  const share = MAIN.base / (MAIN.base + a.base);
  const main = stretch(MAIN.base, delta * share, MAIN.min, MAIN.max);
  // zbytek delty dostane pomocné pole (i to, co hlavní pole kvůli mezím nevzalo)
  const aux = stretch(a.base, delta - (main - MAIN.base), a.min, a.max);
  return { main, aux };
}

/** Meze delty: o kolik jde sloupce celkem zmenšit a zvětšit. */
export function sortFitLimits(kind: AuxKind): FitLimits {
  const parts = kind === "none" ? [MAIN] : [MAIN, AUX[kind]];
  return {
    shrink: parts.reduce((s, p) => s + p.base - p.min, 0),
    grow: parts.reduce((s, p) => s + p.max - p.base, 0),
  };
}
