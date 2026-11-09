/**
 * Společné pomůcky stránek datových struktur (čisté funkce bez UI): hlášky, chybové kroky, vstup z adresy.
 * Čtení polí obstarávají sdílené IntField / ListField (core/Fields) nad core/input.
 */
import { parseIntList } from "../../core/input";
import { snap, type Step } from "../../core/steps";

/** rozsah hodnot prvků na všech stránkách skupiny (krabičky i uzly stromu je pak ještě čitelně pojmou) */
export const VALUE_MIN = -999;
export const VALUE_MAX = 999;

/** České skloňování po číslovce: plural(1, 'prvek', 'prvky', 'prvků') = „1 prvek“. */
export function plural(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  return `${n} ${n === 1 ? one : n === 2 || n === 3 || n === 4 ? few : many}`;
}

/** „3 prvky“ apod. */
export const count = (n: number) => plural(n, "prvek", "prvky", "prvků");

/** Krok, který jen ohlásí neprovedenou operaci (Visualizer ho ukáže červeně). Struktura se nemění. */
export function failStep<S>(
  st: S,
  message: string,
  line: number | null = null,
): Step<S> {
  return { ...snap(st, line, message), error: true };
}

/** Argumenty do názvu operace: argList([15, 3, 9, 1, 12, 7, 4, 10]) = „15, 3, 9, 1, 12, 7, …“. */
export function argList(values: readonly number[], shown = 6): string {
  const head = values.slice(0, shown).join(", ");
  return values.length > shown ? `${head}, …` : head;
}

const short = (tok: string) => (tok.length > 12 ? tok.slice(0, 12) + "…" : tok);

/** Výčet přeskočených tokenů do hlášky (nejvýše 5), např. „abc, 1e999“. */
export function ignoredList(ignored: string[]): string {
  const shown = ignored.slice(0, 5).map(short).join(", ");
  return ignored.length > 5 ? `${shown} a další` : shown;
}

/** Poznámka k prvnímu kroku stavby: co se ze vstupu nepoužilo. Prázdný řetězec = použito vše. */
export function inputNote(
  used: number,
  total: number,
  ignored: string[] = [],
): string {
  const parts: string[] = [];
  if (total > used)
    parts.push(
      `vstup má ${plural(total, "číslo", "čísla", "čísel")}, vizualizace bere jen prvních ${used}`,
    );
  if (ignored.length)
    parts.push(`přeskočeno, není číslo: ${ignoredList(ignored)}`);
  return parts.length ? ` (${parts.join("; ")})` : "";
}

/**
 * Vstup z adresy (`?a=15,3,9`) pro sdílený odkaz. Vrací použitelná čísla, nebo null, když parametr chybí
 * nebo v něm není jediné platné číslo – stránka pak ukáže výchozí příklad.
 */
export function listFromUrl(
  param: string | null,
  maxCount: number,
  min = VALUE_MIN,
  max = VALUE_MAX,
): number[] | null {
  if (!param) return null;
  const r = parseIntList(param, { min, max, maxCount });
  return r.values.length ? r.values : null;
}

/** Čísla do parametru adresy. */
export const toUrl = (values: readonly number[]) => values.join(",");
