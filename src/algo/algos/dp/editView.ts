/**
 * Pohled editační vzdálenosti bez Reactu: třídy a šipky buněk tabulky T jako obr. 12.5 (řádky x,
 * sloupce y, poslední řádek a sloupec okraje), záhlaví s písmeny a zarovnání slov podle úprav.
 * Kreslí editCanvas.tsx. Testy v editView.test.ts.
 */
import type { EditDir, EditKind, EditMove, EditState } from "./editDistance";
import type { EditSelection } from "./editPageModel";

export interface EditCellMark {
  cls: string;
  /** šipka tahu v buňce (vybraný směr minima / tah rekonstrukce), jinak null */
  glyph: EditDir | null;
}

const join = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const key = (r: number, c: number) => `${r},${c}`;

/** Třídy buněk: dp-cur, dp-read (tři sousedé ř. 6), dp-min (vybraný), dp-path, dp-sel, dp-eq, dp-empty. */
export function editCellMarks(
  st: EditState,
  sel: EditSelection | null,
): EditCellMark[][] {
  const n = st.x.length;
  const m = st.y.length;
  const read = new Map<string, boolean>();
  if (st.cur && st.cand) {
    const [r, c] = st.cur;
    read.set(key(r + 1, c + 1), st.pick === "↘");
    read.set(key(r + 1, c), st.pick === "↓");
    read.set(key(r, c + 1), st.pick === "→");
  }
  const path = new Map<string, EditDir | null>();
  for (const mv of st.path) path.set(key(mv.r, mv.c), mv.dir);
  if (st.path.length && st.pos) path.set(key(st.pos[0], st.pos[1]), null);
  if (st.done) path.set(key(n, m), null);
  const selCells = new Set((sel?.cells ?? []).map(([r, c]) => key(r, c)));
  return st.T.map((row, r) =>
    row.map((v, c) => {
      const k = key(r, c);
      const cur =
        (st.cur?.[0] === r && st.cur?.[1] === c) ||
        (st.pos?.[0] === r && st.pos?.[1] === c && !st.done);
      const isRead = read.has(k);
      const onPath = path.has(k);
      const glyph: EditDir | null =
        st.cur?.[0] === r && st.cur?.[1] === c && st.cand
          ? st.pick
          : (path.get(k) ?? null);
      return {
        cls: join(
          v === null && "dp-empty",
          r < n && c < m && st.x[r] === st.y[c] && "dp-eq",
          cur && "dp-cur",
          isRead && "dp-read",
          read.get(k) && "dp-min",
          onPath && "dp-path",
          selCells.has(k) && "dp-sel",
        ),
        glyph,
      };
    }),
  );
}

/** Záhlaví: písmena xᵢ a yⱼ počítané buňky (dp-cur; stejná písmena navíc dp-match). */
export function editHeadMarks(st: EditState): { x: string[]; y: string[] } {
  const r = st.cur?.[0];
  const c = st.cur?.[1];
  const match =
    r !== undefined && c !== undefined && st.x[r] === st.y[c] && st.delta === 0;
  return {
    x: st.x.map((_, i) =>
      join(i === r && "dp-cur", i === r && match && "dp-match"),
    ),
    y: st.y.map((_, j) =>
      join(j === c && "dp-cur", j === c && match && "dp-match"),
    ),
  };
}

export interface EditAlignCol {
  top: string;
  bottom: string;
  kind: EditKind;
}

/** Zarovnání slov po tazích: nahoře x, dole y, „–“ tam, kde se znak maže / vkládá. */
export function editAlignment(path: readonly EditMove[]): EditAlignCol[] {
  return path.map((m) => ({
    top: m.kind === "insert" ? "–" : (m.a ?? ""),
    bottom: m.kind === "delete" ? "–" : (m.b ?? ""),
    kind: m.kind,
  }));
}

/** značka úpravy pod sloupcem zarovnání */
export const KIND_GLYPH: Record<EditKind, string> = {
  keep: "=",
  change: "≠",
  delete: "−",
  insert: "+",
};

/** Popisek buňky pro čtečku: „T[3, 4] = 2“ / „T[3, 4] nevyplněno“ */
export function editCellLabel(st: EditState, r: number, c: number): string {
  const v = st.T[r][c];
  return v === null
    ? `T[${r + 1}, ${c + 1}] nevyplněno`
    : `T[${r + 1}, ${c + 1}] = ${v}`;
}

/* ------------------------------------------------------------------ velikost buněk */

const CELL = 30;
const CELL_MIN = 18;
const CELL_MAX = 64;

/**
 * Strana buňky tabulky: 30 px + delta CanvasFit rozdělená mezi n + 2 řádků (záhlaví, x, okraj), v mezích
 * 18 až 64 px (písmo nejméně 11 px) a nejvýš šířka plátna / (m + 2) sloupců (užší tabulka se pod 18 px
 * posouvá do strany).
 */
export function editCellSize(
  delta: number,
  n: number,
  m: number,
  width: number,
): number {
  const byHeight = CELL + delta / (n + 2);
  const byWidth = Math.floor(width / (m + 2));
  return Math.round(Math.max(CELL_MIN, Math.min(CELL_MAX, byHeight, byWidth)));
}

/** Meze delty CanvasFit odpovídající editCellSize. */
export function editFitLimits(n: number) {
  return {
    shrink: (CELL - CELL_MIN) * (n + 2),
    grow: (CELL_MAX - CELL) * (n + 2),
  };
}
