/**
 * Data obrázků kap. 12 Průvodce přepsaná z PDF (8. 11. 2026) – testy modulů /dp/lis a /dp/edit
 * porovnávají výpočet s nimi. Indexy jako v knize (od 0, resp. od 1).
 */

/** Obr. 12.3 (str. 304): průběh Nrp2; x₁ … x₁₃ (x₀ = −∞ se doplní), T[0 … 13], P[0 … 13]. */
export const FIG_12_3 = {
  x: [3, 14, 15, 92, 65, 35, 89, 79, 32, 38, 46, 26, 43],
  T: [7, 6, 5, 4, 1, 2, 3, 1, 1, 3, 2, 1, 2, 1],
  P: [1, 2, 3, 6, 0, 7, 10, 0, 0, 10, 11, 0, 13, 0],
  /** řešení, které Nrp2 najde (text str. 303 – jiné než tučné na str. 302) */
  solution: [3, 14, 15, 35, 38, 46],
} as const;

/** Obr. 12.4 (str. 305): posloupnost −∞, 1, 13, 7, 15, 10, +∞; vyznačená cesta 0 → 1 → 3 → 4 → 6. */
export const FIG_12_4 = {
  x: [1, 13, 7, 15, 10],
  /** vnitřní vrcholy vyznačené cesty (bez −∞ = 0 a +∞ = 6) */
  figurePath: [1, 3, 4],
} as const;

/** Obr. 12.5 (str. 308): tabulka T pro x = poutník (řádky) a y = potemník (sloupce), včetně okrajů. */
export const FIG_12_5 = {
  x: "poutník",
  y: "potemník",
  T: [
    [3, 4, 4, 4, 4, 4, 5, 6, 7],
    [4, 3, 3, 3, 3, 3, 4, 5, 6],
    [4, 3, 3, 2, 2, 2, 3, 4, 5],
    [4, 3, 2, 2, 1, 1, 2, 3, 4],
    [5, 4, 3, 2, 1, 0, 1, 2, 3],
    [6, 5, 4, 3, 2, 1, 0, 1, 2],
    [7, 6, 5, 4, 3, 2, 1, 0, 1],
    [8, 7, 6, 5, 4, 3, 2, 1, 0],
  ],
} as const;

/**
 * Obr. 12.6 (str. 309): vyznačená nejkratší cesta grafu pro poutník → potemník (sloupce x, řádky y).
 * Tahy z (1, 1): p = p, o = o, u → t, vložení e (na obrázku svisle), t → m, n, í, k – délka 3. Zapsáno
 * v orientaci tabulky obr. 12.5 (řádky x, sloupce y): ↘ ponechání / změna, ↓ smazání, → vložení.
 */
export const FIG_12_6_PATH = ["↘", "↘", "↘", "→", "↘", "↘", "↘", "↘"] as const;
