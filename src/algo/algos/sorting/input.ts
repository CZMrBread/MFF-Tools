import { parseNumberList } from "../../core/input";
import type { Step } from "../../core/steps";
import type { AuxArray, SortAlgorithm, SortState } from "./types";

/* Čistá logika stránky třídění (vstupy, měřítka, rezervace místa) – bez Reactu, aby šla testovat. */

/** Výchozí vstup pro porovnávací algoritmy. */
export const DEFAULT_INPUT = [38, 27, 43, 3, 9, 82, 10, 55, 21, 67, 14, 73];

/** Výchozí vstup pro algoritmy s omezeným rozsahem hodnot (Counting sort): malá čísla s opakováním. */
export const DEFAULT_SMALL_INPUT = [3, 1, 4, 1, 5, 9, 2, 6, 5];

/** Nejvíc prvků, které stránka dovolí zadat (generátory zvládnou až MAX_SORT_N). */
export const MAX_INPUT_N = 60;

/** Nejmenší hodnota vstupu – sloupce mají kladnou výšku. */
export const MIN_VALUE = 1;

/** Největší hodnota vstupu pro daný algoritmus (Counting sort má vlastní, menší). */
export function maxValueOf(algo: SortAlgorithm): number {
  return algo.inputMax ?? 99;
}

/** Rozsah, ve kterém stránka přijímá vstup (pole i adresa). */
export function inputLimits(algo: SortAlgorithm) {
  return { min: MIN_VALUE, max: maxValueOf(algo), maxCount: MAX_INPUT_N };
}

/**
 * Vstup z adresy (`#/sort/quick?a=38,27,43`). Vrací použitelná čísla, nebo null, když v parametru žádné
 * platné není. Hodnoty mimo rozsah algoritmu a přebytečné prvky se zahodí stejně jako v textovém poli.
 */
export function inputFromUrl(
  param: string | null,
  algo: SortAlgorithm,
): number[] | null {
  if (param === null || param.trim() === "") return null;
  const { values } = parseNumberList(param, {
    ...inputLimits(algo),
    integerOnly: true,
  });
  return values.length > 0 ? values : null;
}

/**
 * Hláška k vstupu z adresy, který nešel použít celý (stejné pravidlo jako u pole: platná čísla se
 * použijí, zbytek se vypíše): `error` = nic platného, ukáže se výchozí příklad; `warn` = část
 * ignorována. Bez parametru nebo s platným vstupem null.
 */
export function urlInputNotice(
  param: string | null,
  algo: SortAlgorithm,
): { kind: "error" | "warn"; text: string } | null {
  if (param === null || param.trim() === "") return null;
  const r = parseNumberList(param, { ...inputLimits(algo), integerOnly: true });
  const shown =
    r.ignored.slice(0, 5).join(", ") + (r.ignored.length > 5 ? ", …" : "");
  if (r.values.length === 0)
    return {
      kind: "error",
      text: `Vstup z odkazu nešel použít (neplatné hodnoty: ${shown}; povolena celá čísla ${MIN_VALUE} až ${maxValueOf(algo)}) – zobrazen výchozí příklad.`,
    };
  const parts: string[] = [];
  if (r.ignored.length) parts.push(`ignorováno: ${shown}`);
  if (r.truncated) parts.push(`použito prvních ${r.values.length} čísel`);
  return parts.length
    ? { kind: "warn", text: `Vstup z odkazu – ${parts.join("; ")}.` }
    : null;
}

/** Hodnota parametru `a` pro daný vstup; výchozí příklad adresu nezatěžuje (null = parametr odstranit). */
export function inputToUrl(
  values: readonly number[],
  algo: SortAlgorithm,
): string | null {
  return sameNumbers(values, defaultInput(algo)) ? null : values.join(",");
}

/**
 * Titulek operace nad zprávou: „Quicksort(38, 27, 43)“; u dlouhého vstupu jen začátek a počet prvků:
 * „Bubblesort(38, 27, 43, 3, 9, 82, 10, 55, …) · n = 12“.
 */
export function opTitleFor(
  algo: SortAlgorithm,
  values: readonly number[],
  shown = 10,
): string {
  if (values.length <= shown) return `${algo.name}(${values.join(", ")})`;
  return `${algo.name}(${values.slice(0, shown - 2).join(", ")}, …) · n = ${values.length}`;
}

const SUB: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  i: "ᵢ",
  j: "ⱼ",
  r: "ᵣ",
};

/**
 * Popisek pomocného pole kreslí ArrayView jako prostý text (bez fmtMath) – jednoznakové dolní indexy
 * („p_1 … p_r“) proto převedeme na Unicode („p₁ … pᵣ“). Delší index nechá být.
 */
export function plainMath(label: string): string {
  return label.replace(
    /_([0-9ijr])(?![\p{L}\p{N}])/gu,
    (m, c: string) => SUB[c] ?? m,
  );
}

/** Nejmenší hodnota škály (nejvýš 0) – osa sloupců sdílená hlavním i pomocným polem. */
export function scaleMin(
  values: readonly (number | null | undefined)[],
): number {
  let min = 0;
  for (const v of values)
    if (typeof v === "number" && Number.isFinite(v) && v < min) min = v;
  return min;
}

/** Výchozí vstup pro daný algoritmus – vždy takový, který algoritmus přijme. */
export function defaultInput(algo: SortAlgorithm): number[] {
  if (algo.inputMax === undefined) return DEFAULT_INPUT;
  const max = algo.inputMax;
  return DEFAULT_SMALL_INPUT.map((v) => Math.min(v, max));
}

/**
 * Stejný obsah? Stránka podle toho pozná, že se vstup nezměnil (např. jen opuštění textového pole),
 * a nepřepočítává kroky – přehrávač by jinak skočil na začátek.
 */
export function sameNumbers(
  a: readonly number[],
  b: readonly number[],
): boolean {
  return a.length === b.length && a.every((v, k) => Object.is(v, b[k]));
}

/** Největší konečná hodnota (nejméně 1) – měřítko výšky sloupců. Bez rozbalování pole do argumentů. */
export function scaleMax(
  values: readonly (number | null | undefined)[],
): number {
  let max = 1;
  for (const v of values)
    if (typeof v === "number" && Number.isFinite(v) && v > max) max = v;
  return max;
}

/** Co si má stránka rezervovat, aby plátno mezi kroky neměnilo výšku. */
export interface Layout {
  /** vzor pomocného pole (popisek), pokud ho některý krok má; v krocích bez něj se kreslí prázdné */
  aux: AuxArray | null;
  /** největší hodnota v pomocném poli přes všechny kroky (stálé měřítko počítadel) */
  auxMax: number;
  /** některý krok kreslí svorky úseků → v krocích bez nich se jejich výška vynechá */
  ranges: boolean;
}

export function layoutOf(steps: readonly Step<SortState>[]): Layout {
  let aux: AuxArray | null = null;
  let auxMax = 1;
  let ranges = false;
  for (const s of steps) {
    if (s.state.aux) {
      aux ??= s.state.aux;
      auxMax = Math.max(auxMax, scaleMax(s.state.aux.items.map((it) => it?.v)));
    }
    if (s.state.ranges.length > 0) ranges = true;
  }
  return { aux, auxMax, ranges };
}
