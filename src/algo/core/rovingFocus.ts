/**
 * Roving tabindex na kresbě – čistá logika bez DOM (testy v rovingFocus.test.ts, hook v useRovingFocus.ts).
 *
 * Kresba je jedna zastávka tabulátoru; šipky přesouvají fokus mezi jejími prvky prostorově (k nejbližšímu
 * prvku ve směru šipky), Home / End na první / poslední prvek v pořadí čtení (shora dolů, v řadě zleva
 * doprava). Polohy jsou středy prvků v libovolných společných souřadnicích (v prohlížeči obdélníky
 * z getBoundingClientRect), volitelně s rozměry `w` × `h`: prvky, jejichž svislé rozsahy se překrývají,
 * leží v jedné řadě (sloupce různé výšky na společné základně), a odchylka od osy šipky je mezera mezi
 * rozsahy, ne vzdálenost středů.
 */

export interface RovePoint {
  /** střed */
  x: number;
  y: number;
  /** šířka a výška prvku (bez nich bod) */
  w?: number;
  h?: number;
}

/** mezera mezi svislými (osa y) / vodorovnými (osa x) rozsahy dvou prvků; překryv = 0 */
function gap(a: RovePoint, b: RovePoint, axis: "x" | "y"): number {
  const half = (p: RovePoint) => (axis === "x" ? (p.w ?? 0) : (p.h ?? 0)) / 2;
  return Math.max(0, Math.abs(a[axis] - b[axis]) - half(a) - half(b));
}

/**
 * Leží dva změřené prvky v jedné řadě? Ano, když se jejich svislé rozsahy překrývají aspoň z poloviny
 * menšího z nich (sloupec na společné základně ano, krabička zásobníku těsně nad sousední ne).
 */
function overlapRow(a: RovePoint, b: RovePoint): boolean {
  if (!a.h || !b.h) return false;
  const overlap =
    Math.min(a.y + a.h / 2, b.y + b.h / 2) -
    Math.max(a.y - a.h / 2, b.y - b.h / 2);
  return overlap >= Math.min(a.h, b.h) / 2;
}

/** prvky, jejichž středy se svisle liší nejvýš o tolik, leží v jedné řadě (sloupce různé výšky…) */
export const ROW_TOLERANCE = 8;
/** menší posun než tolik ve směru šipky se nepočítá („ve stejné ose“) */
const EPS = 1;
/** váha odchylky od osy šipky – blízký prvek mírně stranou má přednost před vzdáleným přímo v ose */
const SIDE_WEIGHT = 3;
/** šipka nahoru / dolů bere prvky, které jsou stranou nejvýš 3× víc než ve směru šipky */
const VERTICAL_CONE = 3;

/** Indexy prvků v pořadí čtení: řady shora dolů, v řadě zleva doprava; shodné polohy podle pořadí v kresbě. */
export function readingOrder(
  points: readonly RovePoint[],
  tolerance = ROW_TOLERANCE,
): number[] {
  const byY = points
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.y - b.p.y || a.i - b.i);
  const out: number[] = [];
  let row: typeof byY = [];
  const flush = () => {
    row.sort((a, b) => a.p.x - b.p.x || a.i - b.i);
    for (const r of row) out.push(r.i);
    row = [];
  };
  for (const item of byY) {
    const first = row[0]?.p;
    // do řady patří prvek blízko jejího prvního středu, nebo prvek, který se svisle překrývá s prvním
    // prvkem řady (bez řetězení – jinak by se graf slil do jedné řady)
    if (first && item.p.y - first.y > tolerance && !overlapRow(first, item.p))
      flush();
    row.push(item);
  }
  flush();
  return out;
}

const DIRS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

/** Klávesy, které roving tabindex obsluhuje (bez modifikátorů). */
export const ROVING_KEYS: readonly string[] = [
  ...Object.keys(DIRS),
  "Home",
  "End",
];

/**
 * Kam přejde fokus z prvku `from` po stisku `key` – index prvku, nebo null (zůstat; klávesa jiná nebo
 * ve směru nic není).
 *
 * - Vlevo / vpravo: nejbližší prvek ve směru, nejdřív ve výseči ±45° kolem osy šipky, jinak v celé
 *   polorovině; skóre = vzdálenost ve směru + 3 × odchylka od osy (blízký prvek mírně stranou má
 *   přednost před vzdáleným přímo v ose). Bez prvku ve směru (konec zalomené řady, kresba bez
 *   rozvržení) pokračuje předchozím / dalším prvkem v pořadí čtení.
 * - Nahoru / dolů: nejbližší řada ve směru (široká výseč – děti ve stromu bývají hodně stranou) a v ní
 *   prvek s nejmenší odchylkou; bez prvku ve směru nikam.
 */
export function rovingTarget(
  points: readonly RovePoint[],
  from: number,
  key: string,
): number | null {
  const n = points.length;
  if (!n || from < 0 || from >= n) return null;
  const moveTo = (i: number | undefined) =>
    i === undefined || i === from ? null : i;
  if (key === "Home" || key === "End") {
    const order = readingOrder(points);
    return moveTo(key === "Home" ? order[0] : order[n - 1]);
  }
  const dir = DIRS[key];
  if (!dir) return null;
  const o = points[from]!;
  const cands = points.flatMap((p, i) => {
    if (i === from) return [];
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const along = dx * dir[0] + dy * dir[1];
    const horizontal = dir[1] === 0;
    // vlevo / vpravo: odchylka od osy = svislá mezera mezi prvky (sloupce různé výšky jsou „v ose“);
    // nahoru / dolů: vodorovná vzdálenost středů
    const side = horizontal ? gap(o, p, "y") : Math.abs(dx);
    // nahoru / dolů jen k prvku z jiné řady
    const apart = horizontal || !overlapRow(o, p);
    return along > EPS && apart ? [{ i, along, side }] : [];
  });
  type C = (typeof cands)[number];
  const min = (cs: C[], f: (c: C) => number) =>
    cs.reduce<C | null>((b, c) => (!b || f(c) < f(b) ? c : b), null);

  if (dir[1] === 0) {
    const cone = cands.filter((c) => c.side <= c.along);
    const best = min(
      cone.length ? cone : cands,
      (c) => c.along + SIDE_WEIGHT * c.side,
    );
    if (best) return best.i;
    const order = readingOrder(points);
    return moveTo(order[order.indexOf(from) + dir[0]]);
  }
  // jen ve výseči – mimo ni by šipka z listu stromu skočila na vzdálený vrchol daleko stranou
  const pool = cands.filter((c) => c.side <= VERTICAL_CONE * c.along);
  const nearest = min(pool, (c) => c.along);
  if (!nearest) return null;
  const row = pool.filter((c) => c.along <= nearest.along + ROW_TOLERANCE);
  return min(row, (c) => c.side)!.i;
}
