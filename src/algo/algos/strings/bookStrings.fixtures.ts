/**
 * Data z Průvodce labyrintem algoritmů, kap. 13 (přepsaná ze stran 319–331 a obr. 13.1, ověřená
 * nezávislým výpočtem v rešerši 6. 11. 2026). Testy v bookStrings.test.ts proti nim pouští skutečné
 * algoritmy – předvolby stránek (bookStrings.ts) tak nemůžou tiše „ujet“ od knihy.
 */

/** Obr. 13.1 (str. 321): vyhledávací automat pro barbarossa */
export const FIG_13_1 = {
  needle: "barbarossa",
  /** Z[s] pro s = 0 … 10 (Z[0] nedefinováno) */
  Z: [null, 0, 0, 0, 1, 2, 3, 0, 0, 0, 0],
  /** jména stavů, která obrázek vypisuje (ostatní „…“) */
  names: ["ε", "b", "ba", "bar", "barb", "barba", "barbar"],
  /** písmena na dopředných hranách */
  letters: "barbarossa",
  /** zpětné hrany nad řadou (do stavu > 0, včetně 1 → 0 obloučkem) a „sběrnice“ do ε pod řadou */
  arcsAbove: [
    [1, 0],
    [4, 1],
    [5, 2],
    [6, 3],
  ],
  bus: [2, 3, 7, 8, 9, 10],
} as const;

/** str. 320–321: jehla kokos, seno clanekokokosu */
export const KOKOS = {
  needle: "kokos",
  text: "clanekokokosu",
  Z: [null, 0, 0, 1, 2, 0],
  /** stav po každém znaku sena („po přečtení clanekoko … stavy kok, koko a kokos“) */
  states: [0, 0, 0, 0, 0, 1, 2, 3, 4, 3, 4, 5, 0],
  found: [7],
} as const;

/** str. 319: jehla ana v seně bananas (dva překrývající se výskyty) a anna (žádný) */
export const ANA = {
  needle: "ana",
  Z: [null, 0, 0, 1],
  bananas: { text: "bananas", found: [1, 3] },
  anna: { text: "anna", found: [] as number[] },
} as const;

/** Cvičení 13.2.1 (str. 324): nejhorší vstup naivního algoritmu */
export const NAIVE_WORST = {
  needle: "aaab",
  text: "aaaaaaaaaa",
  Z: [null, 0, 1, 2, 0],
  naive: 28,
  kmp: 17,
} as const;

/**
 * Rabin–Karp (13.4): kniha číselný příklad nemá – sena jsou z knihy (str. 319, 320), P a N naše.
 * Heše okének přepočítané rešerší (calc/rk3.mjs) a nezávisle kritikem.
 */
export const RK = {
  kokos101: {
    hashes: [71, 8, 32, 100, 68, 28, 40, 36, 92],
    j: 36,
    PJ: 95,
    falseHits: [] as number[],
  },
  kokos17: {
    hashes: [10, 13, 2, 10, 4, 7, 15, 15, 14],
    j: 15,
    PJ: 12,
    falseHits: [6],
  },
  bananas13: { hashes: [4, 5, 5, 5, 10], j: 5, PJ: 8, falseHits: [2] },
  bananas101: {
    hashes: [48, 83, 66, 83, 71],
    j: 83,
    falseHits: [] as number[],
  },
} as const;

/* ------------------------------------------------------------------ Aho–Corasicková (13.3) */

/**
 * Obr. 13.2 (str. 326): vyhledávací automat pro slova ara, bar, arab, baraba, barbara. Stavy číslované
 * podle vzniku při vkládání slov v pořadí z knihy (str. 327: „třeba podle toho, jak vznikaly“);
 * `back` = Zpět, `short` = Zkratka, `word` = Slovo (koncový stav = plný kroužek), null = ∅.
 */
export const FIG_13_2 = {
  words: ["ara", "bar", "arab", "baraba", "barbara"],
  states: [
    { name: "ε", depth: 0, back: null, short: null, word: null },
    { name: "a", depth: 1, back: "ε", short: null, word: null },
    { name: "ar", depth: 2, back: "ε", short: null, word: null },
    { name: "ara", depth: 3, back: "a", short: null, word: "ara" },
    { name: "b", depth: 1, back: "ε", short: null, word: null },
    { name: "ba", depth: 2, back: "a", short: null, word: null },
    { name: "bar", depth: 3, back: "ar", short: null, word: "bar" },
    { name: "arab", depth: 4, back: "b", short: null, word: "arab" },
    { name: "bara", depth: 4, back: "ara", short: "ara", word: null },
    { name: "barab", depth: 5, back: "arab", short: "arab", word: null },
    { name: "baraba", depth: 6, back: "ba", short: null, word: "baraba" },
    { name: "barb", depth: 4, back: "b", short: null, word: null },
    { name: "barba", depth: 5, back: "ba", short: null, word: null },
    { name: "barbar", depth: 6, back: "bar", short: "bar", word: null },
    { name: "barbara", depth: 7, back: "bara", short: "ara", word: "barbara" },
  ],
  /** pořadí vrcholů ve frontě F (konstrukce po hladinách) */
  bfs: "a b ar ba ara bar arab bara barb barab barba baraba barbar barbara",
  /** tečkované zkratky na obrázku – právě čtyři */
  shortcuts: [
    ["bara", "ara"],
    ["barab", "arab"],
    ["barbar", "bar"],
    ["barbara", "ara"],
  ],
  /**
   * Polohy vrcholů odečtené z obrázku (250 dpi), normalizované: x podle rozpětí 649–1021 px,
   * y podle 404–1032 px; poměr stran kresby (šířka / výška) ≈ 0,592.
   */
  coords: {
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
  } as Record<string, readonly [number, number]>,
  aspect: 0.592,
} as const;

/** výskyt (k, ι): k = začátek výskytu v seně, ι = jehla */
export type AcHit = readonly [number, string];

/** Sena k obr. 13.2 (str. 325–326) a naše delší seno se všemi pěti jehlami. */
export const AC_SEARCHES = {
  /** „skončí ve stavu bara, který není koncový, a přitom by zde měl ohlásit výskyt jehly ara“ */
  bara: {
    text: "bara",
    states: "b ba bar bara",
    hits: [
      [0, "bar"],
      [1, "ara"],
    ] as AcHit[],
  },
  /** „přečteme-li barbara, nevšimneme si, že na témže místě končí i ara“ – pořadí hlášení */
  barbara: {
    text: "barbara",
    states: "b ba bar barb barba barbar barbara",
    hits: [
      [0, "bar"],
      [3, "bar"],
      [0, "barbara"],
      [4, "ara"],
    ] as AcHit[],
  },
  /** naše: všech 5 jehel, 2 zpětné kroky (b: barbara → bara, r: baraba → ba) a 10 hlášení */
  barbarabaraba: {
    text: "barbarabaraba",
    hits: [
      [0, "bar"],
      [3, "bar"],
      [0, "barbara"],
      [4, "ara"],
      [4, "arab"],
      [3, "baraba"],
      [7, "bar"],
      [8, "ara"],
      [8, "arab"],
      [7, "baraba"],
    ] as AcHit[],
    back: 2,
  },
} as const;

/**
 * Cvičení 13.3.1 (str. 329): „Zkonstruujte vyhledávací automat pro slovo abrakadabra. Co se stane,
 * když přidáme slova brak, kobra, obr a obrok? A když ještě kandelabr?“ Kniha řešení nemá – zpětné
 * hrany a zkratky spočítala rešerše (calc/ac2.mjs) a nezávisle kritik; sena jsou naše.
 */
export const AC_EX1 = {
  abrakadabra: {
    words: ["abrakadabra"],
    states: 12,
    /** Zpět pro stavy 1 … 11 (= Z z KMP), zkratky žádné */
    back: ["ε", "ε", "ε", "a", "ε", "a", "ε", "a", "ab", "abr", "abra"],
    text: "abrakadabrakadabra",
    hits: [
      [0, "abrakadabra"],
      [7, "abrakadabra"],
    ] as AcHit[],
  },
  more: {
    words: ["abrakadabra", "brak", "kobra", "obr", "obrok"],
    states: 26,
    back: {
      abrak: "brak",
      kobr: "obr",
      abra: "bra",
      abr: "br",
      ab: "b",
      kobra: "bra",
      ko: "o",
      kob: "ob",
      obro: "o",
      obrok: "k",
      brak: "k",
      bra: "a",
    } as Record<string, string>,
    shortcuts: { abrak: "brak", kobr: "obr" } as Record<string, string>,
    text: "kobrabrakadabra",
    hits: [
      [1, "obr"],
      [0, "kobra"],
      [5, "brak"],
      [4, "abrakadabra"],
    ] as AcHit[],
  },
  kandelabr: {
    words: ["abrakadabra", "brak", "kobra", "obr", "obrok", "kandelabr"],
    states: 34,
    back: { abraka: "ka", kandelab: "ab", kandelabr: "abr" } as Record<
      string,
      string
    >,
    text: "kandelabrakadabra",
    hits: [
      [0, "kandelabr"],
      [7, "brak"],
      [6, "abrakadabra"],
    ] as AcHit[],
    back1: 1,
  },
} as const;

/** Cvičení 13.3.2 (str. 329): výstup může být superlineární – slova a, aa, aaa v seně aaaa. */
export const AC_EX2 = {
  words: ["a", "aa", "aaa"],
  text: "aaaa",
  hits: [
    [0, "a"],
    [0, "aa"],
    [1, "a"],
    [0, "aaa"],
    [1, "aa"],
    [2, "a"],
    [1, "aaa"],
    [2, "aa"],
    [3, "a"],
  ] as AcHit[],
} as const;
