/**
 * Čistá geometrie pásu textu (TextStripView): seno, jehla s posunem, řádky čísel (kódy písmen, heše
 * okének), indexy a závorky výskytů. Testy v textStripLayout.test.ts.
 */

/** největší a nejmenší šířka buňky (px); pod nejmenší se pás posouvá vodorovně */
export const STRIP_MAX_CELL = 32;
export const STRIP_MIN_CELL = 20;
/** místo na popisek řádku vlevo („σ“, „ι“, „h“) */
export const STRIP_LABEL_W = 30;
const PAD = 6;
const NUM_H = 17;
const INDEX_H = 13;
const ROW_GAP = 6;
/** výška jednoho patra závorek výskytů */
export const BRACKET_H = 17;

export interface StripRowSpec {
  /** "cell" = znaky v rámečcích, "num" = menší čísla bez rámečku (kódy, heše) */
  kind: "cell" | "num";
  /** pod řádkem čísla pozic */
  indices?: boolean;
}

export interface StripRowGeom {
  /** horní okraj řádku */
  y: number;
  h: number;
  /** účaří indexů (jen s `indices`) */
  indexY: number | null;
}

export interface StripLayout {
  W: number;
  H: number;
  cell: number;
  /** levý okraj obsahu (popisek řádku) – obsah je v SVG uprostřed */
  left: number;
  /** levý okraj slotu i (i smí být mimo 0 … slots − 1 – posunutá jehla) */
  x: (i: number) => number;
  rows: StripRowGeom[];
  /** horní okraj prvního patra závorek */
  bracketY: number;
  /** pás je širší než obal (posouvá se) */
  scroll: boolean;
}

export function stripLayout(
  slots: number,
  width: number,
  rows: readonly StripRowSpec[],
  bracketRows = 0,
): StripLayout {
  const n = Math.max(1, slots);
  const avail =
    (Number.isFinite(width) && width > 0 ? width : 900) -
    STRIP_LABEL_W -
    2 * PAD;
  const cell = Math.max(
    STRIP_MIN_CELL,
    Math.min(STRIP_MAX_CELL, Math.floor(avail / n)),
  );
  const content = STRIP_LABEL_W + 2 * PAD + n * cell;
  // SVG vyplní obal (jinak by vedle kresby prosvítalo pozadí obalu se stíny posouvání), obsah uprostřed
  const W =
    Number.isFinite(width) && width > content ? Math.floor(width) : content;
  const left = Math.floor((W - content) / 2);
  let y = PAD;
  const geoms: StripRowGeom[] = rows.map((r) => {
    const h = r.kind === "cell" ? cell : NUM_H;
    const g: StripRowGeom = {
      y,
      h,
      indexY: r.indices ? y + h + INDEX_H - 2 : null,
    };
    y += h + (r.indices ? INDEX_H : 0) + ROW_GAP;
    return g;
  });
  const bracketY = y;
  const H =
    bracketY +
    Math.max(0, bracketRows) * BRACKET_H +
    (bracketRows ? 4 : 0) +
    PAD;
  return {
    W,
    H,
    cell,
    left,
    x: (i) => left + STRIP_LABEL_W + PAD + i * cell,
    rows: geoms,
    bracketY,
    scroll: content > width,
  };
}

export interface StripBracket {
  /** první pozice */
  from: number;
  /** za poslední pozicí (vyloučeno) */
  to: number;
  label: string;
  cls?: string;
}

/** Závorky do pater: každou do nejnižšího patra, kde se s žádnou jinou nepřekrývá. */
export function stackBrackets<B extends StripBracket>(
  list: readonly B[],
): (B & { row: number })[] {
  const ends: number[] = [];
  return list.map((b) => {
    let row = ends.findIndex((end) => end <= b.from);
    if (row < 0) row = ends.length;
    ends[row] = b.to;
    return { ...b, row };
  });
}

/** Šířka pásu s buňkami STRIP_MAX_CELL (bez roztažení do obalu) – mez zvětšení pásu. */
export function stripNaturalWidth(slots: number): number {
  return STRIP_LABEL_W + 2 * PAD + Math.max(1, slots) * STRIP_MAX_CELL;
}
