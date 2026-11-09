/**
 * Tah ukazatelem (myš, pero, prst) – čisté funkce pro usePointerDrag a kresby s přetahovanými prvky
 * (testy v dragMath.test.ts). Bez Reactu a DOM: matice obrazovky se vkládá zvenku (v prohlížeči
 * svg.getScreenCTM(), v testech pevná).
 */

export interface P2 {
  x: number;
  y: number;
}

/** obdélník v px (x1 ≤ x2, y1 ≤ y2) */
export interface DragBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 2D afinní matice jako DOMMatrix: x' = a·x + c·y + e, y' = b·x + d·y + f */
export interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** posun ukazatele (px), od kterého je stisk tah, ne klik / ťuknutí */
export const DRAG_THRESHOLD = 4;
/** nejmenší poloměr neviditelného úchopu (px) pro myš a pero */
export const HIT_RADIUS_MOUSE = 22;
/** nejmenší poloměr úchopu pro prst (doporučený dotykový cíl 44 px) */
export const HIT_RADIUS_TOUCH = 44;
/** o kolik px je úchop vždy větší než viditelný kruh */
const HIT_EXTRA = 12;

/** Poloměr úchopu prvku s viditelným poloměrem `visibleR` podle druhu ukazatele. */
export function hitRadius(visibleR: number, pointerType: string): number {
  const min = pointerType === "touch" ? HIT_RADIUS_TOUCH : HIT_RADIUS_MOUSE;
  return Math.max(min, visibleR + HIT_EXTRA);
}

/** Posunul se ukazatel z `start` do `p` aspoň o práh? */
export function pastThreshold(
  start: P2,
  p: P2,
  threshold = DRAG_THRESHOLD,
): boolean {
  return Math.hypot(p.x - start.x, p.y - start.y) >= threshold;
}

/** Posun středu prvku proti ukazateli v okamžiku uchopení (prvek pak nepřeskočí pod ukazatel). */
export function grabOffset(pointer: P2, center: P2): P2 {
  return { x: center.x - pointer.x, y: center.y - pointer.y };
}

/** Kde má být střed taženého prvku, když je ukazatel v `pointer`. */
export function followPointer(pointer: P2, offset: P2): P2 {
  return { x: pointer.x + offset.x, y: pointer.y + offset.y };
}

/** Bod v mezích obdélníku; obrácený rozměr (obdélník menší než nic) = jeho střed. */
export function clampPoint(p: P2, box: DragBox): P2 {
  const c = (v: number, lo: number, hi: number) =>
    lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v));
  return { x: c(p.x, box.x1, box.x2), y: c(p.y, box.y1, box.y2) };
}

export function invertMatrix(m: Matrix2D): Matrix2D | null {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/** Souřadnice okna (clientX/Y) → souřadnice uvnitř SVG podle jeho screen CTM; null = nejde převést. */
export function clientToLocal(
  clientX: number,
  clientY: number,
  screenCTM: Matrix2D | null | undefined,
): P2 | null {
  if (!screenCTM) return null;
  const inv = invertMatrix(screenCTM);
  if (!inv) return null;
  return {
    x: inv.a * clientX + inv.c * clientY + inv.e,
    y: inv.b * clientX + inv.d * clientY + inv.f,
  };
}

/**
 * Prvek pod bodem `p`: nejbližší, jehož úchop (poloměr `radius(i)`) bod obsahuje – sousední úchopy se
 * smí překrývat, rozhodne vzdálenost středů. `skip` = vynechat (právě tažený). null = nic.
 */
export function pickNearest(
  points: readonly P2[],
  radius: (i: number) => number,
  p: P2,
  skip: number | null = null,
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  points.forEach((q, i) => {
    if (i === skip) return;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= radius(i) && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/**
 * Pevné měřítko po puštění: ostatní body zabírají na ose `lo…hi`, kresba se při stejném měřítku vejde
 * do rozpětí `maxSpan`. Vrátí, kam smí tažený bod, aby nový rozsah (ostatní + on) `maxSpan` nepřekročil –
 * kresba se pak po přepočtu nezmenší. Když už ostatní rozpětí přesahují, smí jen mezi ně. Bez ostatních
 * bodů (lo > hi) bez omezení.
 */
export function spanKeepingScale(
  lo: number,
  hi: number,
  maxSpan: number,
): { lo: number; hi: number } {
  if (!(lo <= hi)) return { lo: -Infinity, hi: Infinity };
  if (hi - lo >= maxSpan) return { lo, hi };
  return { lo: hi - maxSpan, hi: lo + maxSpan };
}

/** Překážka pro separateFrom: střed jiného prvku a nejmenší vzdálenost středů od něj. */
export interface Keepout {
  p: P2;
  d: number;
}

/**
 * Kam položit puštěný prvek, aby nepřekryl jiný: `c`, když je od každé překážky aspoň `d` daleko; jinak
 * nejbližší takové místo v mezích `box` (kružnice kolem `c` po 2 px, 32 směrů, nejdřív směr od
 * nejbližší překážky). Když v mezích žádné není, vrátí `c` beze změny.
 */
export function separateFrom(
  c: P2,
  others: readonly Keepout[],
  box: DragBox,
): P2 {
  const free = (q: P2) =>
    others.every((o) => Math.hypot(q.x - o.p.x, q.y - o.p.y) >= o.d - 1e-9);
  if (free(c)) return c;
  const inside = (q: P2) =>
    q.x >= box.x1 - 1e-9 &&
    q.x <= box.x2 + 1e-9 &&
    q.y >= box.y1 - 1e-9 &&
    q.y <= box.y2 + 1e-9;
  let near = others[0];
  for (const o of others)
    if (
      near === undefined ||
      Math.hypot(c.x - o.p.x, c.y - o.p.y) <
        Math.hypot(c.x - near.p.x, c.y - near.p.y)
    )
      near = o;
  const away =
    near && Math.hypot(c.x - near.p.x, c.y - near.p.y) > 1e-9
      ? Math.atan2(c.y - near.p.y, c.x - near.p.x)
      : -Math.PI / 2;
  const maxR =
    Math.max(0, ...others.map((o) => o.d)) * 2 +
    Math.hypot(box.x2 - box.x1, box.y2 - box.y1);
  const DIRS = 32;
  for (let r = 2; r <= maxR; r += 2) {
    for (let k = 0; k < DIRS; k++) {
      // střídavě na obě strany od směru „pryč“: 0, +1, −1, +2, −2…
      const step = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
      const a = away + (step * 2 * Math.PI) / DIRS;
      const q = { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
      if (inside(q) && free(q)) return q;
    }
  }
  return c;
}
