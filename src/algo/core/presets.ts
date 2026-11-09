/** Předvolené vstupy pro třídění (tlačítka pod NumberInput) – čisté funkce, hodnoty vždy v rozsahu ⟨lo, hi⟩. */
import { rng } from "./steps";

export type PresetKind = "random" | "sorted" | "reversed" | "nearly" | "dupes";

/** Neklesající posloupnost n hodnot z ⟨lo, hi⟩; když je rozsah menší než n, hodnoty se opakují. */
function ascending(n: number, lo: number, hi: number): number[] {
  const span = hi - lo + 1;
  return Array.from({ length: n }, (_, i) =>
    span >= n ? lo + i : lo + Math.floor((i * span) / n),
  );
}

/**
 * @param n počet prvků (zaokrouhlí se, nejméně 1)
 * @param lo nejmenší a @param hi největší povolená hodnota
 * @param seed semínko pro náhodné předvolby (UI předává Date.now(), testy pevné číslo)
 */
export function presetArray(
  kind: PresetKind,
  n: number,
  lo: number,
  hi: number,
  seed: number,
): number[] {
  const len = Math.max(1, Math.trunc(Number.isFinite(n) ? n : 1));
  const top = Math.max(lo, hi);
  const r = rng(seed);
  const pick = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  switch (kind) {
    case "random":
      return Array.from({ length: len }, () => pick(lo, top));
    case "sorted":
      return ascending(len, lo, top);
    case "reversed":
      return ascending(len, lo, top).reverse();
    case "nearly": {
      // pár prohození blízkých prvků → „téměř setříděné“
      const a = ascending(len, lo, top);
      for (let k = 0; k < Math.max(1, Math.floor(len / 6)); k++) {
        const i = pick(0, len - 1);
        const j = Math.min(len - 1, i + pick(1, 2));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    case "dupes":
      return Array.from({ length: len }, () => pick(lo, Math.min(top, lo + 4)));
  }
}
