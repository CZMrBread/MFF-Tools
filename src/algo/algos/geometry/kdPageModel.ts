/**
 * Model stránky k-d stromu – čisté funkce bez Reactu (testy v kdPageModel.test.ts):
 * body v adrese (parametr `pts`), body z čísel (Vytvořit ▸ Vlastní), význam gest na rovině
 * (klik = přidat / smazat bod, tah bodu = přesun, tah z prázdna = dotaz Q) a klidový krok po úpravě bodů.
 */
import { materialize, type Step } from "../../core/steps";
import {
  addPoint,
  dragRect,
  movePoint,
  removePoint,
  type PlaneGesture,
} from "../../views/pointEdit";
import {
  build,
  MAX_N,
  parseIntParam,
  PLANE,
  type Box,
  type KdState,
  type Pt,
} from "./kdtree";

const OPTS = { plane: PLANE, max: MAX_N };
const fmtPt = (p: { x: number; y: number }) => `(${p.x}, ${p.y})`;

/* ---------- adresa ---------- */

/** Body do adresy: „x1,y1,x2,y2,…“; prázdná rovina = „none“. */
export function pointsParam(points: readonly Pt[]): string {
  return points.length ? points.flatMap((p) => [p.x, p.y]).join(",") : "none";
}

/**
 * Parametr `pts` → body (id 0, 1, …). Platný jen přesně: celá čísla 0–100 po dvojicích, nejvýš MAX_N bodů,
 * různá x i různá y (předpoklad k-d stromu). Jinak null.
 */
export function parsePointsParam(text: string | null): Pt[] | null {
  if (text === null) return null;
  if (text.trim() === "none") return [];
  const parts = text.split(",");
  if (parts.length < 2 || parts.length % 2 || parts.length > 2 * MAX_N)
    return null;
  const v = parts.map((t) => parseIntParam(t, PLANE[0], PLANE[2]));
  if (v.some((x) => x === null)) return null;
  const nums = v as number[];
  const points = Array.from({ length: nums.length / 2 }, (_, i) => ({
    id: i,
    x: nums[2 * i],
    y: nums[2 * i + 1],
  }));
  const distinct = (k: "x" | "y") =>
    new Set(points.map((p) => p[k])).size === points.length;
  return distinct("x") && distinct("y") ? points : null;
}

/* ---------- Vytvořit ▸ Vlastní ---------- */

/**
 * Čísla po dvou (x, y) → body. Shodná souřadnice se posune na nejbližší volnou a hodnota mimo rovinu
 * se ořízne (stejně jako při klepnutí do roviny), lichý zbytek a body nad MAX_N se zahodí.
 * `note` říká, co se upravilo (null = nic).
 */
export function pointsFromNumbers(nums: readonly number[]): {
  points: Pt[];
  note: string | null;
} {
  const notes: string[] = [];
  let points: Pt[] = [];
  let moved = false;
  const pairs = Math.floor(nums.length / 2);
  for (let i = 0; i < pairs; i++) {
    const want = { x: nums[2 * i], y: nums[2 * i + 1] };
    const r = addPoint(points, want, OPTS);
    if (!r.added) {
      notes.push(`Použito jen prvních ${MAX_N} bodů.`);
      break;
    }
    if (r.added.x !== want.x || r.added.y !== want.y) moved = true;
    points = r.points;
  }
  if (nums.length % 2)
    notes.unshift(
      `Lichý počet čísel – poslední (${nums[nums.length - 1]}) se nepoužilo.`,
    );
  if (moved)
    notes.push(
      "Některé body jsou posunuté na nejbližší volnou souřadnici v rovině 0–100 (k-d strom předpokládá různá x i různá y).",
    );
  return { points, note: notes.length ? notes.join(" ") : null };
}

/** Výchozí text pole „body =“: „(64, 38), (95, 88), …“ */
export const pointsText = (points: readonly Pt[]) =>
  points.map((p) => `(${p.x}, ${p.y})`).join(", ");

/**
 * Text pole „body =“ → čísla po dvou. Oddělovače: mezery, čárky, středníky a závorky („(1,2), (3,4)“,
 * „1 2; 3 4“). Chyba: token, který není celé číslo 0–100, nebo lichý počet čísel (poslední bod nemá y).
 */
export function parsePointsText(text: string): {
  values: number[];
  error: string | null;
} {
  const values: number[] = [];
  const bad: string[] = [];
  for (const t of text.replace(/−/g, "-").split(/[\s,;()[\]]+/)) {
    if (!t) continue;
    const v = parseIntParam(t, PLANE[0], PLANE[2]);
    if (v === null) bad.push(t);
    else values.push(v);
  }
  if (bad.length)
    return {
      values,
      error: `souřadnice musí být celá čísla ${PLANE[0]}–${PLANE[2]} (${bad.join(", ")})`,
    };
  if (values.length % 2)
    return {
      values,
      error: `lichý počet čísel – poslední bod nemá y (${values[values.length - 1]})`,
    };
  return { values, error: null };
}

/* ---------- gesta ---------- */

export type KdGestureResult =
  /** body se změnily; `change` = věta o změně do zprávy */
  | { kind: "points"; points: Pt[]; change: string }
  /** tah z prázdna: dotaz Q */
  | { kind: "query"; q: Box }
  | { kind: "error"; message: string }
  | { kind: "none" };

export function kdGesture(
  points: readonly Pt[],
  g: PlaneGesture,
): KdGestureResult {
  switch (g.kind) {
    case "add": {
      const r = addPoint(points, g.at, OPTS);
      return r.added
        ? {
            kind: "points",
            points: r.points,
            change: `Přidán bod ${fmtPt(r.added)}.`,
          }
        : { kind: "error", message: r.error ?? "Bod nejde přidat." };
    }
    case "remove": {
      const p = points.find((q) => q.id === g.id);
      if (!p) return { kind: "none" };
      return {
        kind: "points",
        points: removePoint(points, g.id),
        change: `Odebrán bod ${fmtPt(p)}.`,
      };
    }
    case "move": {
      const p = points.find((q) => q.id === g.id);
      if (!p) return { kind: "none" };
      const r = movePoint(points, g.id, g.to, OPTS);
      if (!r.added)
        return r.error ? { kind: "error", message: r.error } : { kind: "none" };
      if (r.added.x === p.x && r.added.y === p.y) return { kind: "none" };
      return {
        kind: "points",
        points: r.points,
        change: `Bod ${fmtPt(p)} přesunut na ${fmtPt(r.added)}.`,
      };
    }
    case "query":
      return { kind: "query", q: dragRect(g.from, g.to, PLANE) };
  }
}

/* ---------- tah, klávesnice, mazání ---------- */

/** Smazání bodu podle id (Delete na bodu, tlačítko × u vybraného bodu). */
export function kdRemove(points: readonly Pt[], id: number): KdGestureResult {
  return kdGesture(points, { kind: "remove", id });
}

/**
 * Shift+šipka: posun bodu o 1 ve směru (dx, dy); obsazenou souřadnici (k-d strom chce různá x i y)
 * přeskočí na nejbližší volnou dál ve směru. Na okraji roviny nic.
 */
export function kdNudge(
  points: readonly Pt[],
  id: number,
  dx: number,
  dy: number,
): KdGestureResult {
  const p = points.find((q) => q.id === id);
  if (!p) return { kind: "none" };
  const axis = dx !== 0 ? "x" : "y";
  const step = dx !== 0 ? Math.sign(dx) : Math.sign(dy);
  if (step === 0) return { kind: "none" };
  const used = new Set(points.filter((q) => q.id !== id).map((q) => q[axis]));
  const lo = axis === "x" ? PLANE[0] : PLANE[1];
  const hi = axis === "x" ? PLANE[2] : PLANE[3];
  let v = p[axis] + step;
  while (v >= lo && v <= hi && used.has(v)) v += step;
  if (v < lo || v > hi) return { kind: "none" };
  const moved = { ...p, [axis]: v };
  return {
    kind: "points",
    points: points.map((q) => (q.id === id ? moved : q)),
    change: `Bod ${fmtPt(p)} posunut na ${fmtPt(moved)}.`,
  };
}

/**
 * Náhled během tahu bodu: hotový strom s bodem `id` na místě, kam by ho puštění dalo (zaokrouhlení
 * a volná souřadnice jako movePoint), bez oblasti a dotazu.
 */
export function movePreview(
  points: readonly Pt[],
  id: number,
  to: { x: number; y: number },
): KdState {
  const r = movePoint(points, id, to, OPTS);
  return editStep(r.points, "").state;
}

/* ---------- klidový krok po úpravě ---------- */

const overPoints = (n: number) => (n === 1 ? "1 bodem" : `${n} body`);

/**
 * Jediný krok po úpravě bodů: hotový strom (bez přehrávání stavby – po každém klepnutí by se jinak
 * spouštěla animace) a věta, co dál.
 */
export function editStep(points: readonly Pt[], change: string): Step<KdState> {
  const steps = materialize(build(points));
  const state = structuredClone(steps[steps.length - 1].state);
  state.region = null;
  state.query = null;
  const message = points.length
    ? `${change} Strom nad ${overPoints(points.length)} je hned postavený – Build(P) stavbu připraví (▶ ji přehraje), tah v rovině zadá dotaz Q.`
    : `${change} Klepnutím do roviny přidejte body (nebo Vytvořit ▸ Náhodně).`;
  return { state, line: null, message };
}
