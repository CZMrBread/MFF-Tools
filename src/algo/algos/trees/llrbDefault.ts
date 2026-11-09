/**
 * Výchozí příklad stránky LLRB – ve vlastním souboru, aby ho náhled na úvodní stránce (llrb.preview.tsx)
 * nakreslil bez celé logiky stránky a operací (hlavní chunk). Shodu klíčů a zápisu hlídá
 * llrbPageModel.test.ts.
 */

/** (2,3)-strom, jehož spodní vrcholy jsou všechny 3-vrcholy (čtyři červené hrany). */
export const LLRB_DEFAULT_KEYS: readonly number[] = [
  40, 20, 70, 10, 30, 60, 90, 5, 25, 50, 80,
];
/** Týž strom zapsaný po hladinách (llrbSpec) – vznikne vložením LLRB_DEFAULT_KEYS ve variantě (2,3). */
export const LLRB_DEFAULT_SPEC = "40,20,70,10,30,60,90,5r,25r,50r,80r";
