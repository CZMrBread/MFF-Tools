/**
 * Písmo pro klíč v úzké buňce tabulky (SVG <text>). Při m = 32 má buňka jen 24 px a pěticiferný klíč
 * by přetekl do sousedních buněk: písmo proto zmenšíme a zbytek dorovnáme zúžením znaků (textLength).
 */
export interface CellText {
  style: { fontSize: number };
  textLength?: number;
  lengthAdjust?: "spacingAndGlyphs";
}

/** Odhad šířky jedné tučné číslice v násobcích velikosti písma. */
const DIGIT_EM = 0.62;
/** Pod tuto velikost písmo nezmenšujeme. */
const MIN_FONT = 9;

/** Odhad šířky textu v px (jen číslice a znak †). */
export const textWidth = (text: string, fontSize: number) =>
  text.length * DIGIT_EM * fontSize;

/**
 * @param text       obsah buňky
 * @param rectWidth  šířka obdélníku buňky v px
 * @param base       výchozí velikost písma
 */
export function fitCellText(
  text: string,
  rectWidth: number,
  base: number,
): CellText {
  const avail = Math.max(1, rectWidth - 3);
  if (textWidth(text, base) <= avail) return { style: { fontSize: base } };
  const fontSize = Math.min(
    base,
    Math.max(MIN_FONT, Math.floor(avail / (text.length * DIGIT_EM))),
  );
  if (textWidth(text, fontSize) <= avail) return { style: { fontSize } };
  return {
    style: { fontSize },
    textLength: avail,
    lengthAdjust: "spacingAndGlyphs",
  };
}
