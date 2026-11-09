/* Čistá geometrie pro BoxListView (testy v BoxListView.test.ts). */

export interface Box {
  id: number;
  label: string;
  /** třída zvýraznění: box-active, box-new, box-removed, box-compare, box-found */
  cls?: string;
}

export interface Pointer {
  /** index krabičky; -1 = ukazuje na „null“ za koncem */
  at: number;
  label: string;
  cls?: string;
}

/** výška krabičky (px) */
export const BOX_H = 56;
/** výška jednoho řádku popisků ukazatelů */
export const PTR_ROW = 14;

/** Šířka krabičky podle nejdelšího popisku (šestimístné číslo se do 56 px nevejde). */
export function boxWidth(boxes: Box[]): number {
  const len = boxes.reduce((m, b) => Math.max(m, b.label.length), 1);
  return Math.max(BOX_H, Math.ceil(len * 10 + 16));
}

/**
 * Řádek popisku ukazatele: 0 = nad krabičkou, 1 = pod ní, 2, 3… = výš nad ní.
 * Druhý ukazatel stránky (p u seznamu, konec u fronty) jde přednostně pod krabičky, takže při pohybu po seznamu
 * neskáče mezi řádky; teprve když je jeho místo na té krabičce obsazené, vezme první volný řádek.
 * at < 0 i at ≥ počtu krabiček míří na ∅ za koncem – patří do téže skupiny.
 */
export function pointerRanks(
  pointers: Pointer[],
  boxCount: number,
): { slot: number; row: number }[] {
  const used = new Map<number, Set<number>>();
  return pointers.map((p, k) => {
    const slot = p.at < 0 || p.at >= boxCount ? boxCount : p.at;
    const taken = used.get(slot) ?? new Set<number>();
    let row = k === 1 ? 1 : 0;
    if (taken.has(row)) {
      row = 0;
      while (taken.has(row)) row++;
    }
    taken.add(row);
    used.set(slot, taken);
    return { slot, row };
  });
}

/** mezera mezi krabičkami se šipkou (spojový seznam) */
export const ARROW_GAP = 28;
/** výška popisku ukazatele nad krabičkou */
export const PTR_BASE = 26;

/** Svislé rozměry jednoho řádku krabiček (vodorovný režim) podle počtu řádků popisků ukazatelů. */
export function lineMetrics(rows: number) {
  const below = rows >= 2;
  const aboveRows = rows - (below ? 1 : 0);
  const top = 20 + (aboveRows - 1) * PTR_ROW + PTR_BASE;
  const bottom = below ? PTR_BASE + 6 : 10;
  return { below, top, bottom, lineH: top + BOX_H + bottom };
}

export interface BoxGridInput {
  /** počet krabiček */
  count: number;
  boxW: number;
  vertical: boolean;
  arrows: boolean;
  /** „∅“ za koncem zabere jedno místo */
  nullEnd: boolean;
  /** místo vpravo od sloupce zásobníku pro popisky ukazatelů (px) */
  ptrRoom: number;
  /** řádky popisků ukazatelů (vodorovně), výchozí 2 */
  rows?: number;
  /** volné místo v px (Infinity = výška neomezená – běžný tok stránky, telefon) */
  availW: number;
  availH: number;
  /** nejvýš takové zvětšení (výchozí 1,6) */
  maxScale?: number;
}

export interface BoxGrid {
  /** krabiček v řádku (u zásobníku ve sloupci) */
  perLine: number;
  /** počet řádků (sloupců) */
  lines: number;
  /** měřítko kresby (viewBox → px) */
  scale: number;
  /** přirozená šířka a výška kresby (viewBox) */
  W: number;
  H: number;
}

/** Přirozené rozměry kresby s `perLine` krabičkami v řádku (sloupci) a `lines` řádky (sloupci). */
export function boxGridSize(
  g: Omit<BoxGridInput, "availW" | "availH" | "maxScale" | "count">,
  perLine: number,
  lines: number,
): { W: number; H: number } {
  if (g.vertical) {
    const col = g.boxW + 24 + g.ptrRoom;
    return {
      W: Math.max(220, 80 + (lines - 1) * (col + 16) + col),
      H: Math.max(120, perLine * (BOX_H + 8) + 40),
    };
  }
  const stride = g.boxW + (g.arrows ? ARROW_GAP : 8);
  return {
    W: Math.max(300, perLine * stride + 40),
    H: lines * lineMetrics(g.rows ?? 2).lineH,
  };
}

/**
 * Rozložení krabiček do řádků (zásobník do sloupců) a měřítko tak, aby se kresba vešla do volného
 * místa a písmo bylo co největší: zkusí každý počet řádků a vezme ten s největším měřítkem (při
 * shodě méně řádků). Měřítko je nejvýš `maxScale` – malá struktura na velkém plátně se zvětší.
 */
export function boxGrid(g: BoxGridInput): BoxGrid {
  const slots = Math.max(1, g.count + (g.nullEnd ? 1 : 0));
  const maxScale = g.maxScale ?? 1.6;
  let best: BoxGrid | null = null;
  let prevPer = -1;
  for (let lines = 1; lines <= slots; lines++) {
    const perLine = Math.ceil(slots / lines);
    if (perLine === prevPer) continue;
    prevPer = perLine;
    const used = Math.ceil(slots / perLine);
    const { W, H } = boxGridSize(g, perLine, used);
    const scale = Math.min(
      maxScale,
      g.availW > 0 ? g.availW / W : 1,
      g.availH > 0 ? g.availH / H : 1,
    );
    if (!best || scale > best.scale + 1e-6)
      best = { perLine, lines: used, scale, W, H };
  }
  return best!;
}
