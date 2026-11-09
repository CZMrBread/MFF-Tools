/**
 * Příklady z knihy pro konvexní obal (Průvodce 16.1). Kniha souřadnice nedává – body jsou změřené
 * z vektorové kresby obrázků v PDF (body PDF, osa y dolů) a převedené do roviny 0–100 (osa y nahoru)
 * funkcí `fromPdf`. Testy (hullBook.test.ts) ověřují, že algoritmus dává totéž co obrázky a text.
 */
import type { HullAlg, HullPt } from "./hull";

export interface HullExample {
  id: string;
  /** krátký popisek tlačítka v „Příkladech z knihy“ */
  label: string;
  /** vysvětlivka (title) a poznámka v nápovědě */
  title: string;
  /** algoritmus, který příklad připraví */
  alg: HullAlg;
  points: HullPt[];
}

interface PdfMap {
  /** počátek v bodech PDF (x0 vlevo, y0 dole) */
  x0: number;
  y0: number;
  /** měřítko bod PDF → jednotka roviny */
  s: number;
  dx?: number;
  dy?: number;
}

/** Souřadnice z PDF (y dolů) → body roviny (y nahoru), id = pořadí. */
export function fromPdf(
  pdf: readonly (readonly [number, number])[],
  m: PdfMap,
): HullPt[] {
  return pdf.map(([x, y], id) => ({
    id,
    x: Math.round((x - m.x0) * m.s) + (m.dx ?? 0),
    y: Math.round((m.y0 - y) * m.s) + (m.dy ?? 0),
  }));
}

/**
 * Obr. 16.1 (str. 401): paty jabloní. Prvních 10 jsou vrcholy lomené čáry plotu v pořadí kresby
 * (od nejlevější jabloně horem po směru hodinových ručiček), zbytek stromy uvnitř.
 */
export const FIG_16_1_PDF: readonly (readonly [number, number])[] = [
  [142.0, 500.0],
  [167.0, 472.0],
  [216.9, 453.3],
  [285.5, 443.9],
  [335.3, 453.3],
  [372.8, 481.3],
  [385.2, 503.1],
  [310.4, 559.3],
  [235.6, 565.5],
  [173.2, 546.8],
  [291.7, 478.2],
  [322.9, 496.9],
  [279.2, 518.7],
  [248.0, 512.5],
  [266.7, 481.3],
  [279.2, 468.8],
  [329.1, 537.4],
  [157.6, 493.8],
  [204.4, 475.1],
  [173.2, 518.7],
  [204.4, 537.4],
];
/** plot z obr. 16.1 = id jabloní 0…9 v pořadí kresby */
export const FIG_16_1_FENCE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Obr. 16.2 (str. 402): L, tři další prázdná kolečka (úsečky obalu nalezené otáčením polopřímky)
 * a tři plné tečky.
 */
const FIG_16_2_PDF: readonly (readonly [number, number])[] = [
  [194.9, 542.7],
  [207.4, 509.9],
  [241.7, 482.9],
  [288.4, 477.2],
  [226.1, 527.1],
  [257.2, 495.9],
  [272.8, 536.4],
];
/** L → X → … : prázdná kolečka obr. 16.2 v pořadí nalezení */
export const FIG_16_2_OPEN = [0, 1, 2, 3];

/**
 * Obr. 16.3 (str. 403), levý díl: obal prvních bodů (prázdná kolečka; krajní body 0 a 6 jsou konce
 * lomené čáry, která v obrázku pokračuje doleva), tři plné tečky uvnitř a nový bod b (id 10) vpravo.
 */
const FIG_16_3_PDF: readonly (readonly [number, number])[] = [
  [96.9, 284.8],
  [114.0, 282.0],
  [136.6, 299.0],
  [150.8, 318.8],
  [156.5, 341.5],
  [122.5, 361.3],
  [105.5, 364.2],
  [114.0, 304.6],
  [128.1, 321.7],
  [108.3, 341.5],
  [173.5, 310.3],
];
export const FIG_16_3_NEW = 10;
/** body, které přidání b odebere z horní obálky (v pořadí odebírání) */
export const FIG_16_3_REMOVED = [4, 3, 2];

const xyPts = (xy: readonly (readonly [number, number])[]): HullPt[] =>
  xy.map(([x, y], id) => ({ id, x, y }));

export const HULL_EXAMPLES: readonly HullExample[] = [
  {
    id: "obr-16-1",
    label: "Obr. 16.1 – jabloňový sad",
    title:
      "Obr. 16.1 (str. 401): 21 jabloní, nejkratší plot vede přes 10 z nich – zametání (KonvexníObal)",
    alg: "sweep",
    points: fromPdf(FIG_16_1_PDF, { x0: 142, y0: 566, s: 0.38, dx: 4, dy: 28 }),
  },
  {
    id: "obr-16-2",
    label: "Obr. 16.2 – provázkový algoritmus",
    title:
      "Obr. 16.2 (str. 402): z nejlevějšího bodu L otáčíme polopřímkou po směru hodinových ručiček – provázkový algoritmus",
    alg: "wrap",
    points: fromPdf(FIG_16_2_PDF, { x0: 185, y0: 560, s: 0.9, dy: 10 }),
  },
  {
    id: "obr-16-3",
    label: "Obr. 16.3 – přidání bodu",
    title:
      "Obr. 16.3 (str. 403): přidání nejpravějšího bodu – z horní obálky odejdou tři body, z dolní žádný",
    alg: "sweep",
    points: fromPdf(FIG_16_3_PDF, { x0: 88, y0: 370, s: 1 }),
  },
  {
    id: "cv-16-1-1",
    label: "Cv. 16.1.1 – body na přímce",
    title:
      "Cvičení 16.1.1 (str. 405): tři body na společné přímce – dolní obálka si je nechá (úhel 180°), horní je odebere",
    alg: "sweep",
    points: xyPts([
      [10, 20],
      [30, 20],
      [50, 20],
      [70, 20],
      [90, 20],
      [10, 50],
      [10, 80],
      [50, 80],
      [90, 80],
      [40, 50],
      [60, 40],
    ]),
  },
];

export const DEFAULT_EXAMPLE = HULL_EXAMPLES[0];

export function exampleById(id: string): HullExample | null {
  return HULL_EXAMPLES.find((e) => e.id === id) ?? null;
}
