/**
 * Předvolby textových algoritmů (Průvodce, kap. 13). KMP: příklady přímo z knihy (str. 319–324,
 * obr. 13.1); Rabin–Karp: kniha číselný příklad nemá, sena jsou z knihy a P, N volíme my.
 * Testy proti knize v bookStrings.test.ts (data v bookStrings.fixtures.ts).
 */

export interface KmpExample {
  id: string;
  /** jehla ι */
  needle: string;
  /** seno σ */
  text: string;
  /** popisek v nabídce */
  label: string;
  /** zdroj v knize („str. 320–321“, „Obr. 13.1 (str. 321)“) */
  source: string;
  /** co v příkladu sledovat */
  note: string;
}

export const KMP_EXAMPLES: readonly KmpExample[] = [
  {
    id: "kokos",
    needle: "kokos",
    text: "clanekokokosu",
    label: "kokos v clanekokokosu",
    source: "str. 320–321",
    note: "po clanekoko jsme ve stavu koko, pak kok, koko a kokos – zpětné hrany 4 → 2 a 5 → 0",
  },
  {
    id: "barbarossa",
    needle: "barbarossa",
    text: "barbarbarossa",
    label: "barbarossa (obr. 13.1)",
    source: "Obr. 13.1 (str. 321)",
    note: "automat z obrázku; seno barbarbarossa je naše – ukáže zpětnou hranu 6 → 3 při práci",
  },
  {
    id: "bananas",
    needle: "ana",
    text: "bananas",
    label: "ana v bananas",
    source: "str. 319",
    note: "dva překrývající se výskyty (1 a 3)",
  },
  {
    id: "anna",
    needle: "ana",
    text: "anna",
    label: "ana v anna",
    source: "str. 319",
    note: "žádný výskyt – hledáme souvislé podřetězce, ne podposloupnosti",
  },
  {
    id: "aaab",
    needle: "aaab",
    text: "aaaaaaaaaa",
    label: "aaab v aaaaaaaaaa",
    source: "cvičení 1, str. 324",
    note: "nejhorší vstup naivního algoritmu: naivně 28 porovnání, KMP 17",
  },
  {
    id: "aaaa",
    needle: "aaaa",
    text: "aaaaaaaa",
    label: "aaaa v aaaaaaaa",
    source: "zarážka ι[J], str. 322",
    note: "po každém výskytu hned zpětná hrana 4 → 3 přes fiktivní znak ⊥",
  },
];

export function kmpExample(id: string): KmpExample {
  const e = KMP_EXAMPLES.find((x) => x.id === id);
  if (!e) throw new Error(`neznámý příklad KMP ${id}`);
  return e;
}

/** Příklad z knihy podle jehly a sena (odkaz ?j=…&s=… ho pozná). */
export const kmpExampleFor = (needle: string, text: string) =>
  KMP_EXAMPLES.find((e) => e.needle === needle && e.text === text) ?? null;

export interface RkExample {
  id: string;
  needle: string;
  text: string;
  P: number;
  N: number;
  label: string;
  /** vysvětlivka v nabídce (zdroj sena, co sledovat) */
  title: string;
}

export const RK_EXAMPLES: readonly RkExample[] = [
  {
    id: "kokos101",
    needle: "kokos",
    text: "clanekokokosu",
    P: 31,
    N: 101,
    label: "kokos, N = 101 – bez kolize",
    title:
      "Seno ze str. 320; N = 101 > S·J = 65, jak kniha doporučuje – heš sedí jen u výskytu (i = 7)",
  },
  {
    id: "kokos17",
    needle: "kokos",
    text: "clanekokokosu",
    P: 31,
    N: 17,
    label: "kokos, N = 17 – falešná shoda",
    title:
      "Seno ze str. 320; malé N: okénko okoko (i = 6) má stejný heš 15 jako jehla, ale řetězce se liší",
  },
  {
    id: "bananas13",
    needle: "ana",
    text: "bananas",
    P: 31,
    N: 13,
    label: "ana v bananas, N = 13 – falešná shoda nan",
    title:
      "Seno ze str. 319; výskyty 1 a 3, okénko nan (i = 2) je falešná shoda",
  },
  {
    id: "worst",
    needle: "aaa",
    text: "aaaaaaaa",
    P: 31,
    N: 101,
    label: "aaa v aaaaaaaa – nejhorší případ",
    title:
      "Příklad náš: každé okénko je výskyt, porovnání znaků V·J = 18 (člen V·J z rozboru, str. 331)",
  },
  {
    id: "tiny",
    needle: "ana",
    text: "bananas",
    P: 31,
    N: 2,
    label: "N = 2 – skoro samé kolize",
    title:
      "Seno ze str. 319; při N = 2 je kandidátem skoro každé okénko (člen S/N·J z rozboru, str. 331)",
  },
];

export function rkExample(id: string): RkExample {
  const e = RK_EXAMPLES.find((x) => x.id === id);
  if (!e) throw new Error(`neznámý příklad Rabin–Karp ${id}`);
  return e;
}

export const rkExampleFor = (
  needle: string,
  text: string,
  P: number,
  N: number,
) =>
  RK_EXAMPLES.find(
    (e) => e.needle === needle && e.text === text && e.P === P && e.N === N,
  ) ?? null;

/* ------------------------------------------------------------------ Aho–Corasicková (13.3) */

export interface AcExample {
  id: string;
  /** jehly ι₁, …, ιₙ v pořadí z knihy (čísla stavů podle vzniku) */
  words: readonly string[];
  /** seno σ */
  text: string;
  label: string;
  /** zdroj v knize */
  source: string;
  note: string;
}

const FIG_13_2_WORDS = ["ara", "bar", "arab", "baraba", "barbara"] as const;

export const AC_EXAMPLES: readonly AcExample[] = [
  {
    id: "fig132",
    words: FIG_13_2_WORDS,
    text: "barbara",
    label: "obr. 13.2, seno barbara",
    source: "Obr. 13.2 (str. 326)",
    note: "výskyt ara na konci barbara pozná jen zkratka barbara → ara (seno ze str. 326)",
  },
  {
    id: "bara",
    words: FIG_13_2_WORDS,
    text: "bara",
    label: "obr. 13.2, seno bara",
    source: "Obr. 13.2, str. 325–326",
    note: "stav bara není koncový, přesto se ohlásí ara – po zkratce bara → ara",
  },
  {
    id: "all5",
    words: FIG_13_2_WORDS,
    text: "barbarabaraba",
    label: "obr. 13.2, všech 5 jehel",
    source: "Obr. 13.2 (str. 326)",
    note: "seno naše: najde všech pět jehel, dvakrát jde po zpětné hraně",
  },
  {
    id: "abrakadabra",
    words: ["abrakadabra"],
    text: "abrakadabrakadabra",
    label: "abrakadabra",
    source: "cvičení 1, str. 329",
    note: "1. část: jediné slovo – zpětné hrany jsou Z z KMP, zkratky žádné; seno naše",
  },
  {
    id: "kobra",
    words: ["abrakadabra", "brak", "kobra", "obr", "obrok"],
    text: "kobrabrakadabra",
    label: "+ brak, kobra, obr, obrok",
    source: "cvičení 1, str. 329",
    note: "2. část: zpětné hrany vedou křížem mezi větvemi, zkratky abrak → brak a kobr → obr; seno naše",
  },
  {
    id: "kandelabr",
    words: ["abrakadabra", "brak", "kobra", "obr", "obrok", "kandelabr"],
    text: "kandelabrakadabra",
    label: "+ kandelabr",
    source: "cvičení 1, str. 329",
    note: "3. část: zpětná hrana z abraka teď vede do ka (dřív do a); seno naše",
  },
  {
    id: "barbarossa",
    words: ["barbarossa"],
    text: "barbarbarossa",
    label: "barbarossa (obr. 13.1)",
    source: "Obr. 13.1 (str. 321)",
    note: "s jedinou jehlou je strom cesta a zpětné hrany jsou přesně automat KMP",
  },
  {
    id: "aaa",
    words: ["a", "aa", "aaa"],
    text: "aaaa",
    label: "a, aa, aaa v aaaa",
    source: "cvičení 2, str. 329",
    note: "výstup může být superlineární: 9 výskytů na 4 znaky, hlášení po zkratkách",
  },
];

export function acExample(id: string): AcExample {
  const e = AC_EXAMPLES.find((x) => x.id === id);
  if (!e) throw new Error(`neznámý příklad Aho–Corasickové ${id}`);
  return e;
}

const sameWords = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((w, i) => w === b[i]);

/** Příklad z knihy podle slov a sena (odkaz ?j=…&s=… ho pozná). */
export const acExampleFor = (words: readonly string[], text: string) =>
  AC_EXAMPLES.find((e) => sameWords(e.words, words) && e.text === text) ?? null;

/** Je slovník přesně ten z obr. 13.2 (pak se kreslí rozvržením z obrázku)? */
export const isFig132 = (words: readonly string[]) =>
  sameWords(words, FIG_13_2_WORDS);

/**
 * Polohy vrcholů obr. 13.2 odečtené z obrázku (250 dpi), normalizované do [0, 1] – podle jména
 * stavu. Test v bookStrings.test.ts je porovná s daty v bookStrings.fixtures.ts.
 */
export const FIG_13_2_COORDS: Readonly<
  Record<string, readonly [number, number]>
> = {
  ε: [0.36, 0],
  a: [0, 0.099],
  b: [0.718, 0.099],
  ar: [0, 0.258],
  ba: [0.718, 0.258],
  ara: [0, 0.414],
  bar: [0.718, 0.414],
  arab: [0, 0.572],
  bara: [0.438, 0.53],
  barb: [1, 0.53],
  barab: [0.438, 0.688],
  barba: [1, 0.688],
  baraba: [0.438, 0.844],
  barbar: [1, 0.844],
  barbara: [1, 1],
};

/**
 * Ohyby zpětných hran a zkratek obr. 13.2 podle obrázku („druh:stav“ → bend pro curveEdge; kladný
 * = doleva od směru hrany). Hrany, které tu nejsou, ohne automatika (trieBend).
 */
export const FIG_13_2_BENDS: Readonly<Record<string, number>> = {
  "back:a": 0.75,
  "back:b": -0.75,
  // tečkovaná zkratka barbara → ara velkým obloukem dole vlevo pod stromem
  "short:barbara": 0.6,
};
