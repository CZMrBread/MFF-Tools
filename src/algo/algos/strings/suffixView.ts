/**
 * Zvětšení tabulky sufixového pole na velkém plátně (CanvasFit): písmo tabulky roste s volnou výškou,
 * ale jen tak, aby se tabulka vešla do šířky plátna. Testy v suffixView.test.ts.
 */

/** výška tabulky při 1 : 1 (px), dokud ji stránka nezměří – převod delty CanvasFit na zvětšení písma */
export const SA_BASE_H = 220;
/** největší zvětšení (dřív 1,8× – tabulka „banana“ pak zabírala jen polovinu plátna 1920 × 1080) */
export const SA_ZOOM_MAX = 2.4;
/** nejmenší zvětšení – dlouhé α (mississippi) se při 1280 × 720 vejde bez vnitřního posuvníku plátna */
export const SA_ZOOM_MIN = 0.7;

const base = (baseH: number) => (baseH > 0 ? baseH : SA_BASE_H);

/**
 * Zvětšení z delty CanvasFit, nejvýš SA_ZOOM_MAX a nejvýš `widthCap` (šířka plátna, saWidthCap).
 * `baseH` = změřená výška tabulky při 1 : 1: delta v px pak odpovídá změně výšky tabulky, takže
 * usazování CanvasFit nekmitá ani u delší tabulky. Šířka nikdy nezmenšuje pod 1 : 1 – užší plátno
 * řeší posouvání tabulky.
 */
export function saZoom(
  delta: number,
  widthCap = Infinity,
  baseH = SA_BASE_H,
): number {
  const byHeight = Math.max(
    SA_ZOOM_MIN,
    Math.min(SA_ZOOM_MAX, 1 + delta / base(baseH)),
  );
  return Math.min(byHeight, Math.max(1, widthCap));
}

/** Meze delty odpovídající saZoom (pro tutéž výšku tabulky `baseH`). */
export function saZoomLimits(baseH = SA_BASE_H): {
  shrink: number;
  grow: number;
} {
  const h = base(baseH);
  return {
    shrink: Math.round(h * (1 - SA_ZOOM_MIN)),
    grow: Math.round(h * (SA_ZOOM_MAX - 1)),
  };
}

/**
 * Nejvyšší zvětšení, při kterém se tabulka vejde do šířky obalu: `avail` = šířka obalu, `tableW` =
 * změřená šířka tabulky při zvětšení `zoom`. Bez měření (jsdom, skrytý prvek) bez omezení.
 */
export function saWidthCap(
  avail: number,
  tableW: number,
  zoom: number,
): number {
  if (!(avail > 0) || !(tableW > 0) || !(zoom > 0)) return Infinity;
  return avail / (tableW / zoom);
}

/*
 * Dlouhé α (až MAX_ALPHA = 24 znaků → 25 řádků) se na malém plátně nevejde ani na nejmenším zvětšení
 * (1280 × 720 s rozbaleným popisem: „barokoarokoko“ o ~36 px, 24 znaků o ~260 px). Tabulka pak dostane
 * nejvyšší výšku podle volného místa a posouvá se uvnitř (lepící záhlaví); zvýrazněné řádky kroku se
 * drží v záběru. Plátno samo nepřeteče. Platí jen v režimu jedné obrazovky (CanvasFit).
 */

/** nejmenší výška omezené tabulky (px) – záhlaví a aspoň pár řádků */
export const SA_CLAMP_MIN = 96;

/**
 * Výška omezené tabulky, nebo null = bez omezení. `prev` = dosavadní omezení, `atMin` = zvětšení je
 * na SA_ZOOM_MIN (nejdřív se zmenšuje písmo), `natural` = výška tabulky bez omezení, `avail` = výška,
 * při které se obsah plátna právě vejde. Změny do 2 px se ignorují (žádné kmitání po zaokrouhlení).
 */
export function saClamp(
  prev: number | null,
  m: { atMin: boolean; natural: number; avail: number },
): number | null {
  if (m.natural <= m.avail + 1) return null;
  if (prev === null && !m.atMin) return null;
  const h = Math.max(SA_CLAMP_MIN, Math.floor(m.avail));
  return prev !== null && Math.abs(prev - h) <= 2 ? prev : h;
}

/**
 * Je zvětšení na nejmenší hodnotě, kam ho CanvasFit pustí? Rozhoduje delta proti zaokrouhlené mezi
 * saZoomLimits (zvětšení na mezi může vyjít o chlup nad SA_ZOOM_MIN, např. 0,701×).
 */
export function saAtMin(delta: number, baseH = SA_BASE_H): boolean {
  return (
    delta <= -saZoomLimits(baseH).shrink ||
    saZoom(delta, Infinity, baseH) <= SA_ZOOM_MIN + 1e-6
  );
}

/** Meze CanvasFit: u omezené tabulky přišpendlené na nejmenší zvětšení (delta = −shrink). */
export function saFitLimits(
  baseH: number,
  clamped: boolean,
): { shrink: number; grow: number } {
  const l = saZoomLimits(baseH);
  return clamped ? { shrink: l.shrink, grow: -l.shrink } : l;
}

/**
 * Nový scrollTop omezené tabulky, aby zvýrazněné řádky (`rows`, souřadnice v okně) byly v záběru
 * `view` pod lepícím záhlavím výšky `stickyTop`. Úsek vyšší než záběr se zarovná začátkem.
 */
export function saKeepRowsVisible(
  view: { top: number; bottom: number },
  rows: readonly { top: number; bottom: number }[],
  scrollTop: number,
  stickyTop = 0,
): number {
  if (!rows.length) return scrollTop;
  const first = Math.min(...rows.map((r) => r.top));
  const last = Math.max(...rows.map((r) => r.bottom));
  const top = view.top + stickyTop;
  if (first < top || last - first > view.bottom - top)
    return Math.max(0, scrollTop - (top - first));
  if (last > view.bottom) return scrollTop + (last - view.bottom);
  return scrollTop;
}
