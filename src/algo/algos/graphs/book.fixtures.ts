/**
 * Data obrázků z Průvodce labyrintem algoritmů (docs/pruvodce.pdf) – očekávané hodnoty pro testy předvoleb
 * a algoritmů. Vytaženo z vektorových cest PDF a ověřeno proti vykresleným stránkám (6. 11. 2026).
 *
 * Souřadnice `xy` jsou normované na obdélník ohraničující středy vrcholů (0…1 v každé ose zvlášť, y dolů),
 * `aspect` = šířka / výška toho obdélníku. Obrázky, kde kniha vrcholy nečísluje (5.10, 5.13, 7.1, 7.2),
 * mají vlastní popisky (`labelsInvented`).
 *
 * Záměrně se NEsdílí s předvolbami (presets.ts): předvolby jsou implementace, tohle je zadání z knihy.
 */

type XY = Record<string, readonly [number, number]>;
type E = readonly [string, string];
type WE = readonly [string, string, number];

/** Obr. 5.5 „Prasátko“ (str. 113) a seznamy následníků z obr. 5.6. */
export const PIG_5_5 = {
  pdfPage: 113,
  figure: "5.5",
  directed: true,
  weighted: false,
  aspect: 11 / 7,
  /** kresba leží na mřížce 0,5 cm */
  gridHalfCm: {
    "0": [8, 1],
    "1": [2, 1],
    "2": [0, 0],
    "3": [2, 5],
    "4": [1, 7],
    "5": [3, 7],
    "6": [8, 5],
    "7": [7, 7],
    "8": [9, 7],
    "9": [11, 3],
  } as XY,
  xy: {
    "0": [0.727, 0.143],
    "1": [0.182, 0.143],
    "2": [0, 0],
    "3": [0.182, 0.714],
    "4": [0.091, 1],
    "5": [0.273, 1],
    "6": [0.727, 0.714],
    "7": [0.636, 1],
    "8": [0.818, 1],
    "9": [1, 0.428],
  } as XY,
  edges: [
    ["0", "1"],
    ["0", "3"],
    ["0", "9"],
    ["1", "2"],
    ["1", "3"],
    ["3", "4"],
    ["5", "3"],
    ["6", "0"],
    ["6", "3"],
    ["6", "7"],
    ["8", "6"],
    ["9", "6"],
  ] as readonly E[],
  successors: {
    "0": ["1", "3", "9"],
    "1": ["2", "3"],
    "2": [],
    "3": ["4"],
    "4": [],
    "5": ["3"],
    "6": ["0", "3", "7"],
    "7": [],
    "8": ["6"],
    "9": ["6"],
  } as Record<string, readonly string[]>,
} as const;

/** Obr. 5.8 vrstvy BFS z 0 na prasátku (str. 116); ve sloupci shora dolů v pořadí objevení. */
export const BFS_5_8 = {
  pdfPage: 116,
  figure: "5.8",
  start: "0",
  aspect: 3.005,
  xy: {
    "0": [0, 0.5],
    "1": [0.333, 0],
    "2": [0.667, 0],
    "3": [0.333, 0.5],
    "4": [0.667, 0.5],
    "9": [0.333, 1],
    "6": [0.667, 1],
    "7": [1, 1],
  } as XY,
  layers: [
    ["0"],
    ["1", "3", "9"],
    ["2", "4", "6"],
    ["7"],
  ] as readonly (readonly string[])[],
  unreachable: ["5", "8"],
  dist: {
    "0": 0,
    "1": 1,
    "3": 1,
    "9": 1,
    "2": 2,
    "4": 2,
    "6": 2,
    "7": 3,
  } as Record<string, number>,
  /** hrana 6→0 je v knize oblouk pod vrstvami */
  curved: [["6", "0"]] as readonly E[],
} as const;

/** Obr. 5.9 průběh DFS z 0 na prasátku (str. 121), následníci od nejmenšího, jeden čítač T. */
export const DFS_5_9 = {
  pdfPage: 121,
  figure: "5.9",
  start: "0",
  inOut: {
    "0": [1, 16],
    "1": [2, 9],
    "2": [3, 4],
    "3": [5, 8],
    "4": [6, 7],
    "5": null,
    "6": [11, 14],
    "7": [12, 13],
    "8": null,
    "9": [10, 15],
  } as Record<string, readonly [number, number] | null>,
  parens: "(0(1(2)2(3(4)4)3)1(9(6(7)7)6)9)0",
  edgeClass: {
    "0-1": "tree",
    "1-2": "tree",
    "1-3": "tree",
    "3-4": "tree",
    "0-9": "tree",
    "9-6": "tree",
    "6-7": "tree",
    "0-3": "forward",
    "6-0": "back",
    "6-3": "cross",
  } as Record<string, "tree" | "forward" | "back" | "cross">,
} as const;

/** Obr. 5.4 graf zbytků pro k = 7 (str. 109): x → (10x + b) mod 7, cena b (tenká 0, tučná 1). */
export const RESIDUES_5_4 = {
  pdfPage: 109,
  figure: "5.4",
  directed: true,
  weighted: true,
  aspect: 2.0,
  xy: {
    "0": [0, 0.5],
    "1": [0.25, 0],
    "2": [0.25, 1],
    "3": [0.325, 0.5],
    "4": [1, 0],
    "5": [0.876, 0.5],
    "6": [1, 1],
  } as XY,
  edges: [
    ["0", "0", 0],
    ["0", "1", 1],
    ["1", "3", 0],
    ["1", "4", 1],
    ["2", "6", 0],
    ["2", "0", 1],
    ["3", "2", 0],
    ["3", "3", 1],
    ["4", "5", 0],
    ["4", "6", 1],
    ["5", "1", 0],
    ["5", "2", 1],
    ["6", "4", 0],
    ["6", "5", 1],
  ] as readonly WE[],
  bfsFrom1: {
    layers: [
      ["1"],
      ["3", "4"],
      ["2", "5", "6"],
      ["0"],
    ] as readonly (readonly string[])[],
    pathTo0: ["1", "3", "2", "0"],
  },
} as const;

/** Obr. 5.10 mosty a artikulace (str. 123), neorientovaný, popisky a–k vlastní. */
export const BRIDGES_5_10 = {
  pdfPage: 123,
  figure: "5.10",
  directed: false,
  labelsInvented: true,
  aspect: 2.731,
  xy: {
    a: [0, 0.212],
    b: [0, 0.788],
    c: [0.183, 0.5],
    d: [0.394, 0.5],
    e: [0.5, 0],
    f: [0.711, 0],
    g: [0.817, 0.5],
    h: [0.711, 1],
    i: [0.5, 1],
    j: [1, 0.212],
    k: [1, 0.788],
  } as XY,
  edges: [
    ["a", "b"],
    ["a", "c"],
    ["b", "c"],
    ["c", "d"],
    ["d", "e"],
    ["e", "f"],
    ["f", "g"],
    ["g", "h"],
    ["h", "i"],
    ["i", "d"],
    ["g", "j"],
    ["g", "k"],
  ] as readonly E[],
  bridges: [
    ["c", "d"],
    ["g", "j"],
    ["g", "k"],
  ] as readonly E[],
  articulations: ["c", "d", "g"],
} as const;

/** Obr. 5.13 orientovaný graf a jeho graf komponent (str. 131), popisky a–f vlastní. */
export const SCC_5_13 = {
  pdfPage: 131,
  figure: "5.13",
  directed: true,
  labelsInvented: true,
  aspect: 0.867,
  xy: {
    a: [0, 0.25],
    b: [0, 0.75],
    c: [0.5, 1],
    d: [0.5, 0],
    e: [1, 0.25],
    f: [1, 0.75],
  } as XY,
  edges: [
    ["a", "b"],
    ["b", "a"],
    ["a", "c"],
    ["a", "d"],
    ["a", "f"],
    ["c", "f"],
    ["d", "f"],
    ["e", "d"],
    ["f", "e"],
  ] as readonly E[],
  components: { C1: ["a", "b"], C2: ["c"], C3: ["d", "e", "f"] } as Record<
    string,
    readonly string[]
  >,
  /** graf komponent (kondenzace) – jediný DAG nakreslený v kapitole 5 */
  condensation: {
    /** popisky C₁–C₃ jako v knize (dolní index) */
    edges: [
      ["C₁", "C₂"],
      ["C₁", "C₃"],
      ["C₂", "C₃"],
    ] as readonly E[],
    /** změřeno z vektorů PDF (středy kružnic 338,8/409,7 · 366,1/442,2 · 382,2/373,2 pt) */
    xy: { "C₁": [0, 0.528], "C₂": [0.629, 1], "C₃": [1, 0] } as XY,
    aspect: 0.629,
  },
} as const;

/** Obr. 7.2 / 7.5 / 7.6 mřížka 3 × 3 (str. 169, 173, 175), popisky A–I vlastní (po řádcích). */
export const MST3_7_2 = {
  pdfPages: [169, 173, 175],
  figures: ["7.2", "7.5", "7.6"],
  directed: false,
  weighted: true,
  labelsInvented: true,
  aspect: 1.0,
  xy: {
    A: [0, 0],
    B: [0.5, 0],
    C: [1, 0],
    D: [0, 0.5],
    E: [0.5, 0.5],
    F: [1, 0.5],
    G: [0, 1],
    H: [0.5, 1],
    I: [1, 1],
  } as XY,
  edges: [
    ["A", "B", 10],
    ["B", "C", 6],
    ["A", "D", 7],
    ["B", "E", 8],
    ["C", "F", 2],
    ["D", "E", 5],
    ["E", "F", 4],
    ["D", "G", 0],
    ["E", "H", 3],
    ["F", "I", 9],
    ["G", "H", 1],
    ["H", "I", 11],
  ] as readonly WE[],
  mstWeight: 32,
  /** Jarník z E (start odvozený z prvního dílčího obrázku 7.2): pořadí přidaných hran */
  jarnik: {
    start: "E",
    order: [
      ["E", "H"],
      ["H", "G"],
      ["G", "D"],
      ["E", "F"],
      ["F", "C"],
      ["C", "B"],
      ["D", "A"],
      ["F", "I"],
    ] as readonly E[],
  },
  /**
   * Kruskal (obr. 7.6): ceny přidaných hran v pořadí přidání; `rejected` = hrany, které by smyčka
   * „pro i = 1…m“ zahodila (obrázek ukazuje jen přidávání, 10 a 11 se po n − 1 hranách už nezkoumají)
   */
  kruskal: { accepted: [0, 1, 2, 3, 4, 6, 7, 9], rejected: [5, 8, 10, 11] },
  /** Borůvka (obr. 7.5): modul /graph/boruvka – boruvka.test.ts ověřuje obě iterace a váhu 32 */
  boruvka: {
    phase1: {
      A: "AD",
      B: "BC",
      C: "CF",
      D: "DG",
      E: "EH",
      F: "CF",
      G: "DG",
      H: "GH",
      I: "FI",
    },
    phase2: "EF",
  },
} as const;

/** Obr. 7.1 mřížka 4 × 4 s neunikátními vahami a dvě její minimální kostry (str. 168), popisky A–P po řádcích. */
export const MST4_7_1 = {
  pdfPage: 168,
  figure: "7.1",
  directed: false,
  weighted: true,
  labelsInvented: true,
  aspect: 1.0,
  /** A vlevo nahoře, po řádcích, krok 1/3 */
  rows: ["ABCD", "EFGH", "IJKL", "MNOP"],
  edges: [
    ["A", "B", 2],
    ["B", "C", 2],
    ["C", "D", 1],
    ["A", "E", 4],
    ["B", "F", 2],
    ["C", "G", 1],
    ["D", "H", 7],
    ["E", "F", 2],
    ["F", "G", 1],
    ["G", "H", 3],
    ["E", "I", 0],
    ["F", "J", 4],
    ["G", "K", 2],
    ["H", "L", 8],
    ["I", "J", 0],
    ["J", "K", 2],
    ["K", "L", 1],
    ["I", "M", 6],
    ["J", "N", 7],
    ["K", "O", 5],
    ["L", "P", 9],
    ["M", "N", 1],
    ["N", "O", 7],
    ["O", "P", 4],
  ] as readonly WE[],
  mst1: [
    ["I", "J"],
    ["E", "I"],
    ["E", "F"],
    ["F", "G"],
    ["C", "G"],
    ["C", "D"],
    ["B", "F"],
    ["G", "K"],
    ["K", "L"],
    ["A", "B"],
    ["G", "H"],
    ["K", "O"],
    ["O", "P"],
    ["I", "M"],
    ["M", "N"],
  ] as readonly E[],
  mst2: [
    ["I", "J"],
    ["E", "I"],
    ["E", "F"],
    ["F", "G"],
    ["C", "G"],
    ["C", "D"],
    ["B", "C"],
    ["A", "B"],
    ["J", "K"],
    ["K", "L"],
    ["G", "H"],
    ["K", "O"],
    ["O", "P"],
    ["I", "M"],
    ["M", "N"],
  ] as readonly E[],
  mstWeight: 31,
} as const;
