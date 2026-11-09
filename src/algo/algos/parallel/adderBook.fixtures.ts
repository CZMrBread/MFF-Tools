/**
 * Data obrázků oddílu 15.2 Průvodce (s. 386–390), přepsaná z knihy – testy sčítačky je porovnávají
 * se skutečným výpočtem (adder.test.ts). Pozice se v knize kreslí od nejvyššího řádu vlevo.
 */

/** Jednobitové bloky (s. 388): horní číslice xᵢ, dolní yᵢ → chování (0 pohlcuje, 1 vytváří, < kopíruje). */
export const ONE_BIT_BLOCKS = [
  { x: 0, y: 0, b: "0" },
  { x: 0, y: 1, b: "<" },
  { x: 1, y: 0, b: "<" },
  { x: 1, y: 1, b: "1" },
] as const;

/** Tabulka skládání B = H ∘ D (s. 388): řádek = H (horní blok), sloupec = D (dolní) v pořadí 0, 1, <. */
export const COMPOSITION = {
  order: ["0", "1", "<"],
  rows: [
    ["0", "0", "0"],
    ["1", "1", "1"],
    ["0", "1", "<"],
  ],
} as const;

/** Obr. 15.4 Průběh paralelního sčítání pro n = 8 (s. 390). */
export const FIG_15_4 = {
  page: 390,
  /** vstupy zapsané od nejvyššího řádu (x₇ … x₀) */
  x: "01110100",
  y: "00111011",
  /** řádky „bloky“ zleva doprava: velikost 1, 2, 4, 8 */
  blocks: [
    ["0", "<", "1", "1", "<", "<", "<", "<"],
    ["0", "1", "<", "<"],
    ["0", "<"],
    ["0"],
  ],
  /** řádky „přenosy“: krok zahušťování → { i: cᵢ } (krok 0 = c₈ vlevo a c₀ vpravo mimo tabulku) */
  carryRounds: [
    { 8: 0, 0: 0 },
    { 4: 0 },
    { 6: 1, 2: 0 },
    { 7: 1, 5: 1, 3: 0, 1: 0 },
  ],
  /** řádek „výstup“ z₇ … z₀ */
  z: "10101111",
  /** x = 116, y = 59, z = 175 */
  sum: 175,
  /** přenosy školního algoritmu c₀ … c₈ (kontrola výpočtem z textu s. 386–387) */
  schoolCarries: [0, 0, 0, 0, 0, 1, 1, 1, 0],
} as const;
