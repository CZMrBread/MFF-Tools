/**
 * Data obrázků z kap. 14 Průvodce (str. 352–364) a výsledky z knihy – očekávání testů flowBook.test.ts.
 * Souřadnice odečtené z vektorů PDF (docs/pruvodce.pdf); hodnoty toků přepsané z obrázků. Co kniha
 * neuvádí a spočítali jsme sami, je u položky výslovně označené („výpočet, ne kniha“).
 */

/** obr. 14.2 vlevo (str. 352): síť – kapacity hran v pořadí, jak je čte text předvolby */
export const NET_14_2 = {
  page: 352,
  /** středy vrcholů v bodech PDF: z vlevo uprostřed, a a c nahoře, b a d dole, s vpravo (a→d a b→c se kříží) */
  grid: {
    z: [107.9, 390.2],
    a: [136.3, 361.9],
    c: [193.0, 361.9],
    b: [136.3, 418.5],
    d: [193.0, 418.5],
    s: [221.3, 390.2],
  },
  capacities: {
    "z>a": 10,
    "z>b": 10,
    "a>c": 7,
    "a>d": 5,
    "b>c": 9,
    "b>d": 3,
    "c>s": 10,
    "d>s": 10,
  },
  /** obr. 14.2 vpravo = obr. 14.4 vlevo: tok velikosti 16 */
  flow16: {
    "z>a": 10,
    "z>b": 6,
    "a>c": 6,
    "a>d": 4,
    "b>c": 3,
    "b>d": 3,
    "c>s": 9,
    "d>s": 7,
  },
} as const;

/** str. 354: „v toku na obrázku 14.2 můžeme využít cestu zbcs a poslat po ní 1 jednotku“ (BFS z toku 16) */
export const TEXT_354 = { path: "zbcs", eps: 1 } as const;

/** obr. 14.4 vpravo (str. 355): nenasycená cesta v síti rezerv k toku 16 a rezervy na ní (DFS z toku 16) */
export const FIG_14_4 = {
  path: "zbcads",
  residuals: [4, 6, 6, 1, 3],
  eps: 1,
  /** rezervy všech dvojic oblouků z obrázku: „u>v“ = r(uv) */
  residualPairs: {
    "z>a": 0,
    "a>z": 10,
    "z>b": 4,
    "b>z": 6,
    "a>c": 1,
    "c>a": 6,
    "a>d": 1,
    "d>a": 4,
    "b>c": 6,
    "c>b": 3,
    "b>d": 0,
    "d>b": 3,
    "c>s": 1,
    "s>c": 9,
    "d>s": 3,
    "s>d": 7,
  },
} as const;

/**
 * obr. 14.5 (str. 358): situace po zastavení F.-F. algoritmu – maximální tok 18 a minimální řez
 * A = {z, a, b, c}, B = {d, s}. Přesně tento tok najde FordFulkerson s BFS z nulového toku.
 */
export const FIG_14_5 = {
  page: 358,
  value: 18,
  flow: {
    "z>a": 10,
    "z>b": 8,
    "a>c": 5,
    "a>d": 5,
    "b>c": 5,
    "b>d": 3,
    "c>s": 10,
    "d>s": 8,
  },
  cutA: ["z", "a", "b", "c"],
  cutEdges: ["a>d", "b>d", "c>s"],
} as const;

/** obr. 14.3 (str. 354): „Algoritmus v úzkých“, všude c = 1; cesta zabs bez protisměru uvízne na 1 */
export const NET_14_3 = {
  page: 354,
  /** středy vrcholů v bodech PDF */
  grid: {
    z: [161.1, 461.5],
    a: [189.4, 444.5],
    b: [189.4, 478.5],
    s: [217.8, 461.5],
  },
  edges: ["z>a", "z>b", "a>b", "a>s", "b>s"],
  stuckPath: "zabs",
  stuckValue: 1,
  max: 2,
  /** „…zlepšili po cestě zbas“ (str. 354) – druhá cesta FordFulkersona s DFS */
  secondPath: "zbas",
} as const;

/** obr. 14.6 (str. 360): síť pro největší párování, L1…L5 a R1…R5 shora dolů, vše c = 1 */
export const NET_14_6 = {
  page: 360,
  /** středy vrcholů v bodech PDF (z, L1…L5, R1…R5 shora dolů, s) */
  grid: {
    z: [141.9, 302.6],
    L1: [204.3, 240.2],
    L2: [204.3, 271.4],
    L3: [204.3, 302.6],
    L4: [204.3, 333.7],
    L5: [204.3, 364.9],
    R1: [266.7, 240.2],
    R2: [266.7, 271.4],
    R3: [266.7, 302.6],
    R4: [266.7, 333.7],
    R5: [266.7, 364.9],
    s: [329.0, 302.6],
  },
  edges: [
    ["L1", "R2"],
    ["L1", "R3"],
    ["L2", "R1"],
    ["L2", "R2"],
    ["L2", "R3"],
    ["L2", "R4"],
    ["L3", "R2"],
    ["L3", "R3"],
    ["L4", "R3"],
    ["L4", "R4"],
    ["L4", "R5"],
    ["L5", "R3"],
  ],
  /** tučně na obrázku – jedno z největších párování */
  bold: ["L1>R2", "L2>R1", "L4>R5", "L5>R3"],
  size: 4,
} as const;

/**
 * obr. 14.7 (str. 364): síť rozdělená na vrstvy, vrcholy v PDF bez popisků (doplněné a…n po vrstvách
 * shora dolů, z a s jako v knize). Šedé hrany (dozadu a uvnitř vrstvy) a tečkované (do slepých uliček) během čištění zmizí,
 * plné zůstanou. Souřadnice středů vrcholů v bodech PDF.
 */
export const NET_14_7 = {
  page: 364,
  grid: {
    z: [97.1, 318.6],
    a: [152.4, 285.4],
    b: [152.4, 318.6],
    c: [152.4, 351.7],
    d: [207.6, 281.7],
    e: [207.6, 318.6],
    f: [207.6, 355.4],
    g: [262.9, 281.7],
    h: [262.9, 306.3],
    i: [262.9, 330.9],
    j: [262.9, 355.4],
    k: [318.2, 294.0],
    l: [318.2, 343.1],
    m: [373.5, 289.1],
    s: [373.5, 318.6],
    n: [373.5, 348.1],
  },
  solid: [
    "z>a",
    "z>b",
    "z>c",
    "a>e",
    "b>f",
    "c>e",
    "c>f",
    "e>h",
    "f>j",
    "h>k",
    "j>l",
    "k>s",
    "l>s",
  ],
  dotted: ["a>d", "b>d", "d>g", "e>i", "k>m", "l>n"],
  gray: ["e>b", "k>g", "k>l", "i>c", "j>i"],
  /** vrstvy (vzdálenost od z) */
  layers: [
    ["z"],
    ["a", "b", "c"],
    ["d", "e", "f"],
    ["g", "h", "i", "j"],
    ["k", "l"],
    ["m", "s", "n"],
  ],
} as const;
