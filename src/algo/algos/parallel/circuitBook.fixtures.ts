/**
 * Data z kapitoly 15.1 Průvodce (Mareš, Valla) pro testy hradlových sítí – přepsaná z obrázků
 * a textu knihy (research2/circuits.md, ověřeno výřezem obr. 15.1). Testy porovnávají předvolby
 * a výsledky výpočtu PROTI těmto hodnotám, ne proti kódu.
 */

/** Obr. 15.1 Hradlová síť pro majoritu ze tří vstupů (s. 382): zapojení (vstup 1 = horní, 2 = dolní). */
export const FIG_15_1 = {
  page: 382,
  inputs: ["x", "y", "z"],
  outputs: ["q"],
  gates: {
    A1: { fn: "and", inputs: ["y", "x"] },
    A2: { fn: "and", inputs: ["x", "z"] },
    A3: { fn: "and", inputs: ["z", "y"] },
    O1: { fn: "or", inputs: ["A1", "A2"] },
    O2: { fn: "or", inputs: ["O1", "A3"] },
  },
  out: { q: "O2" },
  /** vrstvy S₀ … S₄ (definice ze s. 383; tečkovaně v obrázku) */
  layers: { x: 0, y: 0, z: 0, A1: 1, A2: 1, A3: 1, O1: 2, O2: 3, q: 4 },
  /** 5 hradel (3 × ∧, 2 × ∨), hloubka = 5 neprázdných vrstev (s. 384: „počet vrstev obsahujících aspoň jeden vrchol“) */
  gateCount: 5,
  depth: 5,
  /**
   * středy vrcholů normalizované: x podle rozpětí vstup → q, y podle rozpětí středů A1 → A3
   * (doplněk kritika 10.2, tolerance ±0,01); poměr stran kresby ≈ 2,40
   */
  coords: {
    x: [0, 0.079],
    y: [0, 0.5],
    z: [0, 0.921],
    A1: [0.275, 0],
    A2: [0.275, 0.5],
    A3: [0.275, 1],
    O1: [0.553, 0.253],
    O2: [0.828, 0.75],
    q: [1, 0.75],
  } as Record<string, [number, number]>,
  aspect: 2.4,
} as const;

/** Obr. 15.2 Dvě hradlové sítě pro n-bitový or (s. 385). */
export const FIG_15_2 = {
  page: 385,
  /** vlevo řetězcem: ∨(x₁, x₂) → ∨(·, x₃) → … ; n − 1 hradel, hradlo i ve vrstvě i */
  chain: { gates: (n: number) => n - 1, outLayer: (n: number) => n },
  /** vpravo stromem (n = 8): 4 + 2 + 1 = 7 hradel, 3 vrstvy hradel (log₂ 8), výstup ve vrstvě 4 */
  tree8: { gates: 7, gateLayers: 3, perLayer: [4, 2, 1] },
};

/** Cvičení 15.1.4 (s. 385): xor dvou bitů ze čtyř hradel nand. */
export const EX_15_1_4 = { page: 385, gates: 4, fn: "nand" } as const;
