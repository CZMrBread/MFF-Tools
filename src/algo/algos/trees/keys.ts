/**
 * Čtení klíčů ze vstupních polí stromových stránek. Čisté funkce bez UI: stránka drží text pole
 * a na číslo ho převádí až při spuštění operace, takže prázdné nebo rozepsané pole („-“) se tiše
 * nezmění na 0 a o zahozených hodnotách se uživatel dozví.
 */
import type { NumberListResult } from "../../core/input";
import { formatNum } from "../../core/format";
import { rng } from "../../core/steps";

export interface KeyRange {
  min: number;
  max: number;
}

/** Panel proměnných: čísla s desetinnou čárkou (formatNum), texty beze změny. */
export const displayVars = (
  vars: Record<string, string | number>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [
      k,
      typeof v === "number" ? formatNum(v) : v,
    ]),
  );

/** Číslo s typografickým minusem (−5 místo -5). */
export const fmtNum = (x: number) => String(x).replace("-", "−");

const INT = /^[+-]?\d+$/;

/** Text jednoho pole → celé číslo, nebo null (prázdné pole, text, desetinné číslo, zápis 1e3 apod.). */
export function parseKey(text: string): number | null {
  const t = text.trim().replace("−", "-");
  if (!INT.test(t)) return null;
  const x = Number(t);
  return Number.isFinite(x) ? x + 0 : null; // + 0 převede −0 na 0
}

/** Chybová hláška pro klíč mimo povolený rozsah (null = klíč je v pořádku). */
export function keyInputError(
  x: number | null,
  range: KeyRange,
): string | null {
  if (x !== null && Number.isInteger(x) && x >= range.min && x <= range.max)
    return null;
  return `Zadejte klíč x: celé číslo od ${fmtNum(range.min)} do ${fmtNum(range.max)}. Operace se neprovedla.`;
}

export interface ParsedKeys {
  /** platné klíče bez opakování, v pořadí ze vstupu, nejvýše `limit` */
  keys: number[];
  /** texty, které nejsou celá čísla v povoleném rozsahu */
  invalid: string[];
  /** kolikrát se některý klíč opakoval */
  duplicates: number;
  /** kolik platných různých klíčů se už nevešlo do limitu */
  overLimit: number;
}

/** Seznam klíčů oddělených mezerami, čárkami nebo středníky. */
export function parseKeyList(
  text: string,
  range: KeyRange,
  limit: number,
): ParsedKeys {
  const out: ParsedKeys = {
    keys: [],
    invalid: [],
    duplicates: 0,
    overLimit: 0,
  };
  const seen = new Set<number>();
  for (const token of text.split(/[\s,;]+/)) {
    if (!token) continue;
    const x = parseKey(token);
    if (x === null || x < range.min || x > range.max) out.invalid.push(token);
    else if (seen.has(x)) out.duplicates++;
    else {
      seen.add(x);
      if (out.keys.length < limit) out.keys.push(x);
      else out.overLimit++;
    }
  }
  return out;
}

/** Věty o tom, co se ze vstupu nepoužilo; prázdný řetězec, když se použilo všechno. */
export function describeSkipped(
  p: ParsedKeys,
  range: KeyRange,
  limit: number,
): string {
  const parts: string[] = [];
  if (p.invalid.length) {
    const shown = p.invalid.slice(0, 5).map((t) => `„${t}“`);
    const more =
      p.invalid.length > 5 ? ` a další (celkem ${p.invalid.length})` : "";
    parts.push(
      `Ignorováno: ${shown.join(", ")}${more} – klíče musí být celá čísla od ${fmtNum(range.min)} do ${fmtNum(range.max)}.`,
    );
  }
  if (p.duplicates)
    parts.push(
      `Opakované klíče se vkládají jen jednou (vynecháno: ${p.duplicates}).`,
    );
  if (p.overLimit)
    parts.push(
      `Použito jen prvních ${limit} klíčů, víc se na plátno nevejde (vynecháno: ${p.overLimit}).`,
    );
  return parts.join(" ");
}

/** `n` různých náhodných celých klíčů z lo…hi v náhodném pořadí (deterministicky podle semínka). */
export function randomKeys(
  n: number,
  lo: number,
  hi: number,
  seed: number,
): number[] {
  const r = rng(seed);
  const count = Math.min(n, hi - lo + 1);
  const seen = new Set<number>();
  const out: number[] = [];
  while (out.length < count) {
    const x = lo + Math.floor(r() * (hi - lo + 1));
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

/**
 * Výsledek ListField (už ověřená čísla v rozsahu, nejvýše maxCount) → ParsedKeys: odstraní opakované klíče
 * a převezme, co pole ignorovalo nebo oříznulo, aby to šlo ohlásit ve zprávě.
 */
export function keysFromList(
  values: readonly number[],
  r: Pick<NumberListResult, "ignored" | "valid">,
): ParsedKeys {
  const keys = [...new Set(values)];
  return {
    keys,
    invalid: [...r.ignored],
    duplicates: values.length - keys.length,
    overLimit: Math.max(0, r.valid - values.length),
  };
}

/** Klíče z parametru adresy (`?k=40,20,60`); null, když v něm žádný platný klíč není. */
export function keysFromParam(
  param: string | null,
  range: KeyRange,
  limit: number,
): number[] | null {
  if (!param) return null;
  const keys = parseKeyList(param, range, limit).keys;
  return keys.length ? keys : null;
}
