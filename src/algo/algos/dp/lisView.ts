/**
 * Pohled NRP bez Reactu: třídy buněk tabulky jako obr. 12.3 (řádky i, xᵢ, T[i], P[i]) a geometrie
 * grafu posloupnosti jako obr. 12.4 (vrchol i vpravo podle indexu, výš podle hodnoty, hrany „doprava
 * nahoru“). Kreslí lisCanvas.tsx. Testy v lisView.test.ts.
 */
import { formatMinus } from "../../core/format";
import type { LisState } from "./lis";
import type { LisSelection } from "./lisPageModel";

export interface LisCellMarks {
  x: string[];
  T: string[];
  P: string[];
}

const join = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

/** Třídy buněk po sloupcích: dp-cur (i / k), dp-read (j), dp-new (právě změněné), dp-path, dp-sel, dp-empty. */
export function lisCellMarks(
  st: LisState,
  sel: LisSelection | null,
): LisCellMarks {
  const n = st.x.length;
  const path = new Set(st.chain.length || st.done ? [0, ...st.chain] : []);
  const selCols = new Set(sel?.cols ?? []);
  const x: string[] = [];
  const T: string[] = [];
  const P: string[] = [];
  for (let i = 0; i < n; i++) {
    const cur = i === st.i || i === st.k;
    const read = i === st.j;
    const base = join(
      cur && "dp-cur",
      read && "dp-read",
      read && st.verdict === "better" && "dp-better",
      path.has(i) && "dp-path",
      selCols.has(i) && "dp-sel",
    );
    x.push(base);
    T.push(
      join(
        base,
        st.T[i] === null && "dp-empty",
        i === st.i && st.fresh === "T" && "dp-new",
      ),
    );
    P.push(
      join(
        cur && "dp-cur",
        st.P[i] === null && "dp-empty",
        i === st.i && st.fresh === "P" && "dp-new",
        path.has(i) && "dp-path",
      ),
    );
  }
  return { x, T, P };
}

/** Popisek buňky pro čtečku: „sloupec 5: x₅ = 65, T[5] = 2, P[5] = 7“ */
export function lisColumnLabel(st: LisState, i: number): string {
  const v = (a: number | null) => (a === null ? "?" : String(a));
  return `x${i} = ${formatMinus(st.x[i])}, T[${i}] = ${v(st.T[i])}, P[${i}] = ${v(st.P[i])}`;
}

/* ------------------------------------------------------------------ graf obr. 12.4 */

export interface LisPoint {
  i: number;
  x: number;
  y: number;
}
export interface LisEdge {
  from: number;
  to: number;
  cls: string;
}
export interface LisLevel {
  y: number;
  label: string;
}
export interface LisChart {
  points: LisPoint[];
  edges: LisEdge[];
  /** popisky hodnot na svislé ose (jen když jsou hladiny dost daleko od sebe) */
  levels: LisLevel[];
}

/** do kolika prvků kreslit slabě všechny hrany grafu (víc by byl nečitelný „chumel“) */
export const ALL_EDGES_MAX_N = 8;
const PAD_L = 34;
const PAD_R = 14;
const PAD_Y = 14;
/** nejmenší rozestup hladin, při kterém se píšou popisky hodnot */
const LABEL_GAP = 13;

/** Všechny hrany grafu posloupnosti: i < j a xᵢ < xⱼ. */
export function lisEdgesAll(x: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < x.length; i++)
    for (let j = i + 1; j < x.length; j++) if (x[i] < x[j]) out.push([i, j]);
  return out;
}

const pairs = (cols: readonly number[]): [number, number][] =>
  cols.slice(1).map((c, k) => [cols[k], c]);

/**
 * Geometrie grafu v ploše w × h. `pad` = vodorovné okraje (výchozí místo na popisky hodnot vlevo); stránka
 * je volí tak, aby vrchol i ležel přesně nad sloupcem i tabulky.
 */
export function lisChart(
  st: LisState,
  w: number,
  h: number,
  sel: LisSelection | null = null,
  pad: { l: number; r: number } = { l: PAD_L, r: PAD_R },
): LisChart {
  const n = st.x.length - 1;
  const values = [...new Set(st.x.filter(Number.isFinite))].sort(
    (a, b) => a - b,
  );
  // hladina 0 = −∞, pak hodnoty vzestupně
  const levelOf = (v: number) =>
    Number.isFinite(v) ? values.indexOf(v) + 1 : 0;
  const L = values.length + 1;
  const dy = (h - 2 * PAD_Y) / Math.max(1, L - 1);
  const dx = (w - pad.l - pad.r) / Math.max(1, n);
  const yOf = (lv: number) => h - PAD_Y - lv * dy;
  const points = st.x.map((v, i) => ({
    i,
    x: pad.l + i * dx,
    y: yOf(levelOf(v)),
  }));
  const edges: LisEdge[] = [];
  if (n <= ALL_EDGES_MAX_N)
    for (const [a, b] of lisEdgesAll(st.x))
      edges.push({ from: a, to: b, cls: "dp-e-all" });
  for (let i = 0; i <= n; i++) {
    const p = st.P[i];
    if (p !== null && p !== 0) edges.push({ from: i, to: p, cls: "dp-e-p" });
  }
  if (sel && sel.cols.length > 1)
    for (const [a, b] of pairs(sel.cols))
      edges.push({ from: a, to: b, cls: "dp-e-sel" });
  if (st.chain.length)
    for (const [a, b] of pairs([0, ...st.chain]))
      edges.push({ from: a, to: b, cls: "dp-e-path" });
  if (st.i !== null && st.j !== null)
    edges.push({
      from: st.i,
      to: st.j,
      cls:
        "dp-e-cmp" +
        (st.verdict === "notAbove" ? " dp-e-no" : "") +
        (st.verdict === "better" ? " dp-e-better" : ""),
    });
  const levels: LisLevel[] =
    dy >= LABEL_GAP
      ? [
          { y: yOf(0), label: "−∞" },
          ...values.map((v, k) => ({ y: yOf(k + 1), label: formatMinus(v) })),
        ]
      : [];
  return { points, edges, levels };
}

/** šířka záhlaví řádků tabulky (i, xᵢ, T[i], P[i]) */
export const LIS_HEAD_W = 44;

/** Šířka sloupců tabulky (a rozestup vrcholů grafu nad nimi): do šířky plátna, 30 až 60 px. */
export function lisColumns(
  width: number,
  n: number,
): { head: number; col: number } {
  const col = Math.floor((width - LIS_HEAD_W) / Math.max(1, n + 1));
  return { head: LIS_HEAD_W, col: Math.max(30, Math.min(60, col)) };
}
