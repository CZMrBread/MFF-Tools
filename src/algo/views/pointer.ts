/**
 * Ukazatel (myš, prst, pero) na plátně SVG – čisté funkce (testy v pointer.test.ts).
 * Matice se vkládá zvenku: v prohlížeči svg.getScreenCTM(), v testech pevná (jsdom getScreenCTM nemá).
 */
import type { P2 } from "./graphGeometry";

// převod souřadnic okna → SVG je sdílený s usePointerDrag (core/dragMath.ts)
export { clientToLocal, invertMatrix, type Matrix2D } from "../core/dragMath";

/** posun ukazatele (px), do kterého je stisk ještě ťuknutí, ne tah */
export const TAP_SLOP = 6;
/** dlouhý stisk (ms) bez pohybu = smazat – jen prst a pero (dotyk nemá klávesu Delete), myš ne */
export const LONG_PRESS_MS = 550;

/**
 * Vrchol pod bodem `p` (px): nejbližší, jehož kruh (poloměr + `slack`) bod obsahuje; `skip` = vynechat
 * (vrchol, který se právě táhne). null = nic.
 */
export function nodeAt(
  points: readonly P2[],
  radius: (id: number) => number,
  p: P2,
  slack = 0,
  skip: number | null = null,
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  points.forEach((q, id) => {
    if (id === skip) return;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= radius(id) + slack && d < bestD) {
      best = id;
      bestD = d;
    }
  });
  return best;
}

export type PressTarget =
  | { kind: "node"; id: number }
  | { kind: "edge"; id: number }
  | { kind: "empty" };

export type GestureOutcome =
  /** krátký stisk bez pohybu: vrchol = výběr / v₀, hrana = cena, prázdno = nový vrchol */
  | { kind: "tap" }
  /** dlouhý stisk bez pohybu na vrcholu či hraně = smazat */
  | { kind: "long-press" }
  /** tah vrcholu = přesun (souřadnice drží komponenta) */
  | { kind: "move" }
  /** úpravy: tah z vrcholu a puštění nad jiným vrcholem = nová hrana */
  | { kind: "connect"; to: number }
  | { kind: "none" };

/**
 * Co znamená puštění ukazatele. `over` = vrchol pod ukazatelem při puštění (bez taženého), `mode`:
 * „edit“ (Upravit graf) nebo „run“ (režim algoritmu – tah jen přesouvá).
 */
export function classifyRelease(g: {
  start: P2;
  end: P2;
  ms: number;
  target: PressTarget;
  over: number | null;
  mode: "edit" | "run";
  /** tah už překročil práh (usePointerDrag); bez něj rozhodne vzdálenost proti TAP_SLOP */
  moved?: boolean;
  /**
   * druh ukazatele: myš dlouhým stiskem nemaže (má pravé tlačítko a Delete; zaváhání nad vrcholem
   * nesmí vrchol smazat, V-3) – dlouhý stisk platí jen pro prst a pero (a bez údaje jako dřív)
   */
  pointerType?: string;
}): GestureOutcome {
  const moved =
    g.moved ?? Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) >= TAP_SLOP;
  if (!moved)
    return g.ms >= LONG_PRESS_MS &&
      g.target.kind !== "empty" &&
      g.pointerType !== "mouse"
      ? { kind: "long-press" }
      : { kind: "tap" };
  if (g.target.kind !== "node") return { kind: "none" };
  if (g.mode === "edit" && g.over !== null && g.over !== g.target.id)
    return { kind: "connect", to: g.over };
  return { kind: "move" };
}
