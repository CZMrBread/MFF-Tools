/**
 * Čtení čísel ze vstupních polí – čisté funkce bez Reactu (testy v input.test.ts).
 * Komponenty nad nimi jsou v Fields.tsx.
 */
import { formatNum } from "./format";

export interface NumberRange {
  /** nejmenší povolená hodnota (včetně) */
  min?: number;
  /** největší povolená hodnota (včetně) */
  max?: number;
  /** jen celá čísla; výchozí true */
  integerOnly?: boolean;
}

export interface NumberListOptions extends NumberRange {
  /** nejvýše tolik čísel se použije, zbytek se ohlásí jako oříznutý */
  maxCount?: number;
}

export interface NumberListResult {
  /** použitá čísla (nejvýše maxCount) */
  values: number[];
  /** tokeny, které nejsou platné číslo v povoleném rozsahu – tak, jak je uživatel napsal */
  ignored: string[];
  /** počet platných čísel před oříznutím na maxCount */
  valid: number;
  /** platných čísel bylo víc než maxCount */
  truncated: boolean;
}

const INT_RE = /^[+-]?\d+$/;
const DEC_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** jméno a rovnítko na začátku vstupu: „A = 5, 3“, „v=7“, „σ = 1 2“ */
const ASSIGN_RE = /^\s*\p{L}[\p{L}\p{N}_]*\s*=/u;

/**
 * Typografické minus (U+2212, vzniká při kopírování z PDF) → obyčejný spojovník; zápis s přiřazením
 * („A = 5, 3, 9“, jak ho ukazuje ActionMenu) se bere jako samotná čísla.
 */
function normalize(text: string): string {
  return text.replace(ASSIGN_RE, "").replaceAll("−", "-");
}

/** Jeden token → číslo, nebo null. Žádné 0x10, 1e9, 1_000; −0 se vrací jako 0. */
function toNumber(token: string, integerOnly: boolean): number | null {
  if (!(integerOnly ? INT_RE : DEC_RE).test(token)) return null;
  const v = Number(token);
  if (!Number.isFinite(v) || (integerOnly && !Number.isSafeInteger(v)))
    return null;
  return v === 0 ? 0 : v;
}

function inRange(v: number, { min, max }: NumberRange): boolean {
  return (min === undefined || v >= min) && (max === undefined || v <= max);
}

/**
 * Seznam čísel oddělených mezerami, čárkami nebo středníky. Neplatné tokeny a čísla mimo rozsah
 * se nezahazují potichu – vrací se v `ignored`, aby je UI mohlo vypsat.
 */
export function parseNumberList(
  text: string,
  opts: NumberListOptions = {},
): NumberListResult {
  const integerOnly = opts.integerOnly ?? true;
  const all: number[] = [];
  const ignored: string[] = [];
  for (const token of normalize(text).split(/[\s,;]+/)) {
    if (!token) continue;
    const v = toNumber(token, integerOnly);
    if (v === null || !inRange(v, opts)) ignored.push(token);
    else all.push(v);
  }
  const maxCount = opts.maxCount ?? Infinity;
  return {
    values: all.slice(0, maxCount),
    ignored,
    valid: all.length,
    truncated: all.length > maxCount,
  };
}

/** Seznam celých čísel: parseIntList('3 1 x 7.5', { min: 1, max: 9, maxCount: 2 }) → values [3, 1], ignored ['x', '7.5']. */
export function parseIntList(
  text: string,
  opts: Omit<NumberListOptions, "integerOnly"> = {},
): NumberListResult {
  return parseNumberList(text, { ...opts, integerOnly: true });
}

export interface IntParse {
  /** platné celé číslo v rozsahu, jinak null */
  value: number | null;
  /** pole je prázdné (jen mezery) */
  empty: boolean;
}

/** Jedno celé číslo z textového pole (IntField). Prázdný text, „-“, „1.5“, „0x10“ ani číslo mimo rozsah neprojdou. */
export function parseIntStrict(
  text: string,
  range: Omit<NumberRange, "integerOnly"> = {},
): IntParse {
  const t = normalize(text).trim();
  if (t === "") return { value: null, empty: true };
  const v = toNumber(t, true);
  return { value: v !== null && inRange(v, range) ? v : null, empty: false };
}

/** mez rozsahu: česká desetinná čárka (formatNum) a typografické minus */
const fmt = (n: number) => formatNum(n).replace("-", "−");

/** „celé číslo od 1 do 99“ / „celá čísla od 1 do 99“ – pro chybové hlášky a popisky. */
export function describeRange(
  { min, max, integerOnly = true }: NumberRange,
  plural = false,
): string {
  const noun = plural
    ? integerOnly
      ? "celá čísla"
      : "čísla"
    : integerOnly
      ? "celé číslo"
      : "číslo";
  if (min !== undefined && max !== undefined)
    return `${noun} od ${fmt(min)} do ${fmt(max)}`;
  if (min !== undefined) return `${noun} ≥ ${fmt(min)}`;
  if (max !== undefined) return `${noun} ≤ ${fmt(max)}`;
  return noun;
}

function shorten(token: string): string {
  return token.length > 12 ? token.slice(0, 11) + "…" : token;
}

/**
 * Věta o tom, co se ze vstupu použilo a co ne – např. „Použito prvních 31 z 40 čísel; ignorováno: a, 7.5
 * (povolena jsou celá čísla od 1 do 99).“ Když se použilo všechno, vrací null.
 */
export function listStatus(
  r: NumberListResult,
  opts: NumberListOptions = {},
): string | null {
  const shown =
    r.ignored.slice(0, 6).map(shorten).join(", ") +
    (r.ignored.length > 6 ? ` a ${r.ignored.length - 6} dalších` : "");
  const ignored = r.ignored.length
    ? `gnorováno: ${shown} (povolena jsou ${describeRange(opts, true)})`
    : "";
  if (r.values.length === 0) {
    return (
      `Zadejte aspoň jedno ${describeRange(opts)}; čísla oddělte mezerou nebo čárkou.` +
      (ignored ? ` I${ignored}.` : "")
    );
  }
  const parts: string[] = [];
  if (r.truncated)
    parts.push(`Použito prvních ${r.values.length} z ${r.valid} čísel`);
  if (ignored) parts.push((parts.length ? "i" : "I") + ignored);
  return parts.length ? parts.join("; ") + "." : null;
}

/** Shodují se dvě pole čísel prvek po prvku? */
export function sameNumbers(
  a: readonly number[],
  b: readonly number[],
): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
