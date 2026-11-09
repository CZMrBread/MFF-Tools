/**
 * Model stránky konvexního obalu – čisté funkce bez Reactu (testy v hullPageModel.test.ts): odkaz
 * (`pts` = body, `v=wrap` = provázkový algoritmus), body z textu, úpravy v rovině (klik do prázdna =
 * přidat, tah bodu = přesun, Delete / × = smazat), posun bodu klávesnicí (Shift+šipky) a legenda.
 *
 * Na rozdíl od k-d stromu smí body sdílet x i y (KonvexníObal třídí lexikograficky) – zakázané jsou jen
 * totožné body.
 */
import type { LegendItem } from "../../core/Visualizer";
import type { PlaneGesture } from "../../views/pointEdit";
import { MAX_N, PLANE, type HullAlg, type HullPt } from "./hull";
import { DEFAULT_EXAMPLE, HULL_EXAMPLES, type HullExample } from "./hullBook";

export interface HullConfig {
  points: HullPt[];
  alg: HullAlg;
}

export const DEFAULT_CONFIG: HullConfig = {
  points: DEFAULT_EXAMPLE.points,
  alg: DEFAULT_EXAMPLE.alg,
};

const fmtPt = (p: { x: number; y: number }) => `(${p.x}, ${p.y})`;
const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;

export const samePoints = (a: readonly HullPt[], b: readonly HullPt[]) =>
  a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
export const sameConfig = (a: HullConfig, b: HullConfig) =>
  a.alg === b.alg && samePoints(a.points, b.points);

/* ---------- adresa ---------- */

/** Body do adresy: „x1,y1,x2,y2,…“; prázdná rovina = „none“. */
export function ptsParam(points: readonly HullPt[]): string {
  return points.length ? points.flatMap((p) => [p.x, p.y]).join(",") : "none";
}

const intIn = (t: string, lo: number, hi: number): number | null => {
  if (!/^\s*-?\d+\s*$/.test(t)) return null;
  const v = Number(t);
  return v >= lo && v <= hi ? v : null;
};

/** Parametr `pts` → body (id 0, 1, …): celá čísla 0–100 po dvojicích, nejvýš MAX_N, žádné dva totožné. */
export function parsePtsParam(text: string | null): HullPt[] | null {
  if (text === null) return null;
  if (text.trim() === "none") return [];
  const parts = text.split(",");
  if (parts.length < 2 || parts.length % 2 || parts.length > 2 * MAX_N)
    return null;
  const v = parts.map((t) => intIn(t, PLANE[0], PLANE[2]));
  if (v.some((x) => x === null)) return null;
  const nums = v as number[];
  const points = Array.from({ length: nums.length / 2 }, (_, i) => ({
    id: i,
    x: nums[2 * i],
    y: nums[2 * i + 1],
  }));
  return new Set(points.map(key)).size === points.length ? points : null;
}

/** Konfigurace z adresy; vadný parametr = výchozí hodnota a hláška nad plátnem. */
export function configFromUrl(params: URLSearchParams): {
  config: HullConfig;
  notice: string | null;
} {
  const notes: string[] = [];
  const raw = params.get("pts");
  let points = parsePtsParam(raw);
  if (points === null) {
    points = DEFAULT_CONFIG.points;
    if (raw !== null)
      notes.push(
        "Body z odkazu nešly použít (čekám dvojice celých čísel 0–100, nejvýš 40 různých bodů) – zobrazen výchozí příklad.",
      );
  }
  const v = params.get("v");
  let alg: HullAlg = "sweep";
  if (v === "wrap") alg = "wrap";
  else if (v !== null && v !== "sweep")
    notes.push(
      `Neznámý algoritmus v=${v} – zobrazeno zametání (KonvexníObal).`,
    );
  return {
    config: { points, alg },
    notice: notes.length ? notes.join(" ") : null,
  };
}

/** Konfigurace → parametry adresy (výchozí body a zametání se nepíší). */
export function configToUrl(c: HullConfig): Record<string, string> {
  const out: Record<string, string> = {};
  if (!samePoints(c.points, DEFAULT_CONFIG.points))
    out.pts = ptsParam(c.points);
  if (c.alg === "wrap") out.v = "wrap";
  return out;
}

/** Knižní příklad se stejnými body (pro poznámku v nápovědě a zvýraznění v nabídce). */
export function exampleOf(points: readonly HullPt[]): HullExample | null {
  return HULL_EXAMPLES.find((e) => samePoints(e.points, points)) ?? null;
}

/* ---------- Vytvořit ▸ Vlastní ---------- */

/** Výchozí text pole „body =“: „(10, 20), (35, 70)“ */
export const pointsText = (points: readonly HullPt[]) =>
  points.map(fmtPt).join(", ");

/** Čísla po dvou → body; totožné body, lichý zbytek a body nad MAX_N se vynechají (s poznámkou). */
export function pointsFromNumbers(nums: readonly number[]): {
  points: HullPt[];
  note: string | null;
} {
  const notes: string[] = [];
  const points: HullPt[] = [];
  const seen = new Set<string>();
  let dupes = 0;
  const pairs = Math.floor(nums.length / 2);
  for (let i = 0; i < pairs; i++) {
    const p = { id: points.length, x: nums[2 * i], y: nums[2 * i + 1] };
    if (seen.has(key(p))) {
      dupes++;
      continue;
    }
    if (points.length >= MAX_N) {
      notes.push(`Použito jen prvních ${MAX_N} bodů.`);
      break;
    }
    seen.add(key(p));
    points.push(p);
  }
  if (nums.length % 2)
    notes.unshift(
      `Lichý počet čísel – poslední (${nums[nums.length - 1]}) se nepoužilo.`,
    );
  if (dupes)
    notes.push(
      dupes === 1
        ? "Vynechán 1 totožný bod."
        : dupes < 5
          ? `Vynechány ${dupes} totožné body.`
          : `Vynecháno ${dupes} totožných bodů.`,
    );
  return { points, note: notes.length ? notes.join(" ") : null };
}

/* ---------- úpravy v rovině ---------- */

export type HullEdit =
  /** body se změnily; `change` = věta o změně do historie a zprávy */
  | { kind: "points"; points: HullPt[]; change: string }
  | { kind: "error"; message: string }
  | { kind: "none" };

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));
const toPlane = (x: number, y: number) => ({
  x: clamp(x, PLANE[0], PLANE[2]),
  y: clamp(y, PLANE[1], PLANE[3]),
});
const taken = (points: readonly HullPt[], p: { x: number; y: number }) =>
  points.some((q) => q.x === p.x && q.y === p.y);
const TAKEN = (p: { x: number; y: number }) =>
  `Bod ${fmtPt(p)} už v rovině je.`;

/** Přidá bod (souřadnice se zaokrouhlí a oříznou do roviny). */
export function addAt(
  points: readonly HullPt[],
  x: number,
  y: number,
): HullEdit {
  if (points.length >= MAX_N)
    return { kind: "error", message: `Nejvýše ${MAX_N} bodů.` };
  const at = toPlane(x, y);
  if (taken(points, at)) return { kind: "error", message: TAKEN(at) };
  const added = {
    id: points.reduce((m, q) => Math.max(m, q.id), -1) + 1,
    ...at,
  };
  return {
    kind: "points",
    points: [...points, added],
    change: `Přidán bod ${fmtPt(added)}.`,
  };
}

function moveTo(
  points: readonly HullPt[],
  id: number,
  x: number,
  y: number,
  verb: string,
): HullEdit {
  const p = points.find((q) => q.id === id);
  if (!p) return { kind: "none" };
  const at = toPlane(x, y);
  if (at.x === p.x && at.y === p.y) return { kind: "none" };
  if (taken(points, at)) return { kind: "error", message: TAKEN(at) };
  return {
    kind: "points",
    points: points.map((q) => (q.id === id ? { id, ...at } : q)),
    change: `Bod ${fmtPt(p)} ${verb} na ${fmtPt(at)}.`,
  };
}

/** Tah bodu (planeDrag): přesun na zaokrouhlené souřadnice (x, y) v rovině. */
export const moveAt = (
  points: readonly HullPt[],
  id: number,
  x: number,
  y: number,
): HullEdit => moveTo(points, id, x, y, "přesunut");

/** Smazání bodu podle id (Delete na bodu, tlačítko × u vybraného bodu). */
export function removeId(points: readonly HullPt[], id: number): HullEdit {
  const p = points.find((q) => q.id === id);
  if (!p) return { kind: "none" };
  return {
    kind: "points",
    points: points.filter((q) => q.id !== id),
    change: `Odebrán bod ${fmtPt(p)}.`,
  };
}

/** Akce Odebrat bod(x, y): smaže bod se zadanými souřadnicemi. */
export function removeAt(
  points: readonly HullPt[],
  x: number,
  y: number,
): HullEdit {
  const p = points.find((q) => q.x === x && q.y === y);
  return p
    ? removeId(points, p.id)
    : { kind: "error", message: `Bod ${fmtPt({ x, y })} v rovině není.` };
}

/** Význam gesta v rovině: klik = přidat / smazat, tah bodu = přesun, tah z prázdna = nic. */
export function hullGesture(
  points: readonly HullPt[],
  g: PlaneGesture,
): HullEdit {
  switch (g.kind) {
    case "add":
      return addAt(points, g.at.x, g.at.y);
    case "remove":
      return removeId(points, g.id);
    case "move":
      return moveAt(points, g.id, g.to.x, g.to.y);
    case "query":
      return { kind: "none" };
  }
}

/** Shift+šipka: posun bodu o 1 jednotku (na okraji roviny nic, na obsazené místo chyba). */
export function nudge(
  points: readonly HullPt[],
  id: number,
  dx: number,
  dy: number,
): HullEdit {
  const p = points.find((q) => q.id === id);
  if (!p) return { kind: "none" };
  return moveTo(points, id, p.x + dx, p.y + dy, "posunut");
}

/* ---------- legenda ---------- */

export function hullLegend(alg: HullAlg): LegendItem[] {
  const final: LegendItem = {
    cls: "sw-green",
    label: "hotový konvexní obal",
  };
  if (alg === "wrap")
    return [
      { cls: "sw-blue", shape: "line", label: "nalezené úsečky obalu" },
      { cls: "sw-orange", label: "vrchol c, ze kterého otáčíme polopřímkou" },
      {
        cls: "sw-compare",
        shape: "line",
        label: "kandidát q – zatím nejdál otočená polopřímka cq",
      },
      {
        cls: "sw-purple",
        shape: "line-dashed",
        label: "zkoušený bod p (úsečka cp)",
      },
      final,
    ];
  return [
    { cls: "sw-blue", shape: "line", label: "horní obálka H" },
    { cls: "sw-purple", shape: "line", label: "dolní obálka D" },
    { cls: "sw-orange", label: "aktuální bod b" },
    {
      cls: "sw-compare",
      shape: "line-dashed",
      label: "testovaný úhel hₖ₋₁hₖb",
    },
    { cls: "sw-removed", label: "odebraný bod (při přidání b)", glyph: "×" },
    { cls: "sw-teal", shape: "line-dashed", label: "zametací přímka" },
    {
      cls: "sw-seen",
      shape: "ring",
      label: "bod vpravo od přímky – ještě nezpracovaný",
    },
    final,
  ];
}
