/**
 * Editační vzdálenost – algoritmus Edit2 (Průvodce 12.3, str. 308) jako generátor kroků, rekurzivní Edit
 * (str. 307) pro kontrolu a rekonstrukce nejkratší posloupnosti úprav (cvičení 12.3.3: jdeme po
 * hranách grafu obr. 12.6, na kterých nastalo minimum). Čisté funkce bez Reactu (testy
 * v editDistance.test.ts).
 *
 * Indexy: v poli od 0 (řádek r = i − 1, sloupec c = j − 1), ve zprávách a pseudokódu jako v knize od 1.
 */
import { snap, type StepGen } from "../../core/steps";

/** pseudokód Edit2 (str. 308) + rekonstrukce úprav (cvičení 3 na str. 310) */
export const PC_EDIT2 = [
  "Pro i = 1, …, n + 1 položíme T[i, m + 1] ← n − i + 1.",
  "Pro j = 1, …, m + 1 položíme T[n + 1, j] ← m − j + 1.",
  "Pro i = n, …, 1:",
  "  Pro j = m, …, 1:",
  "    Je-li x_i = y_j: δ ← 0, jinak δ ← 1",
  "    T[i, j] ← min(δ + T[i + 1, j + 1], 1 + T[i + 1, j], 1 + T[i, j + 1])",
  "Výstup: editační vzdálenost L(x_1 … x_n, y_1 … y_m) = T[1, 1]",
  "Úpravy (cvičení 3): z (1, 1) do (n + 1, m + 1)",
  "  po hraně, kde nastalo minimum   // ↘ ponechat / změnit, ↓ smazat x_i, → vložit y_j",
];

export const EDIT_LINE = {
  col: 0,
  row: 1,
  delta: 4,
  min: 5,
  out: 6,
  walkStart: 7,
  walk: 8,
} as const;

/** tah grafu obr. 12.6 v tabulce (řádky x, sloupce y): ↘ ponechání / změna, ↓ smazání, → vložení */
export type EditDir = "↘" | "↓" | "→";
export type EditKind = "keep" | "change" | "delete" | "insert";

export interface EditMove {
  /** buňka, ze které tah vede (od 0) */
  r: number;
  c: number;
  dir: EditDir;
  kind: EditKind;
  cost: 0 | 1;
  /** znak x_i (keep, change, delete) */
  a?: string;
  /** znak y_j (keep, change, insert) */
  b?: string;
}

export interface EditCand {
  diag: number;
  down: number;
  right: number;
}

export interface EditState {
  x: string[];
  y: string[];
  /** (n + 1) × (m + 1); null = ještě nevyplněno */
  T: (number | null)[][];
  /** počítaná buňka [r, c] */
  cur: [number, number] | null;
  delta: 0 | 1 | null;
  /** tři kandidáti ř. 6 (jen v kroku min) */
  cand: EditCand | null;
  /** odkud vzešlo minimum (krok min) */
  pick: EditDir | null;
  /** rekonstruované tahy */
  path: EditMove[];
  /** kde rekonstrukce stojí */
  pos: [number, number] | null;
  done: boolean;
}

/** Znaky slova (kódové body po normalizaci NFC – „í“ je jeden znak, i když přišlo rozložené). */
export function splitChars(s: string): string[] {
  return [...s.normalize("NFC")];
}

/** Edit2 bez kroků: celá tabulka T (řádky x, sloupce y, poslední řádek a sloupec okraje). */
export function edit2(xs: string, ys: string): number[][] {
  const x = splitChars(xs);
  const y = splitChars(ys);
  const n = x.length;
  const m = y.length;
  const T = Array.from({ length: n + 1 }, (_, r) =>
    Array.from({ length: m + 1 }, (_, c) =>
      r === n ? m - c : c === m ? n - r : 0,
    ),
  );
  for (let r = n - 1; r >= 0; r--)
    for (let c = m - 1; c >= 0; c--) {
      const d = x[r] === y[c] ? 0 : 1;
      T[r][c] = Math.min(d + T[r + 1][c + 1], 1 + T[r + 1][c], 1 + T[r][c + 1]);
    }
  return T;
}

/** Rekurzivní Edit(i, j) se zapamatováním (str. 307–308) – kontrola Edit2. */
export function editRecursive(xs: string, ys: string): number {
  const x = splitChars(xs);
  const y = splitChars(ys);
  const n = x.length;
  const m = y.length;
  const memo = new Map<number, number>();
  const edit = (i: number, j: number): number => {
    if (i > n) return m - j + 1;
    if (j > m) return n - i + 1;
    const key = i * (m + 2) + j;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let lz = edit(i + 1, j + 1);
    if (x[i - 1] !== y[j - 1]) lz += 1;
    const ls = edit(i + 1, j) + 1;
    const lv = edit(i, j + 1) + 1;
    const v = Math.min(lz, ls, lv);
    memo.set(key, v);
    return v;
  };
  return edit(1, 1);
}

/** Tah z (r, c) daným směrem (bez kontroly optimality). */
function moveFrom(
  x: readonly string[],
  y: readonly string[],
  r: number,
  c: number,
  dir: EditDir,
): EditMove {
  if (dir === "↓") return { r, c, dir, kind: "delete", cost: 1, a: x[r] };
  if (dir === "→") return { r, c, dir, kind: "insert", cost: 1, b: y[c] };
  const same = x[r] === y[c];
  return {
    r,
    c,
    dir,
    kind: same ? "keep" : "change",
    cost: same ? 0 : 1,
    a: x[r],
    b: y[c],
  };
}

const step = (dir: EditDir): [number, number] =>
  dir === "↘" ? [1, 1] : dir === "↓" ? [1, 0] : [0, 1];

/**
 * Nejlepší tah z buňky (r, c) podle vyplněné tabulky: ze stejně dobrých ↘, pak ↓, pak →. Na okraji jen
 * ↓ (konec y) nebo → (konec x).
 */
export function bestDir(
  x: readonly string[],
  y: readonly string[],
  T: readonly (readonly (number | null)[])[],
  r: number,
  c: number,
): EditDir {
  const n = x.length;
  const m = y.length;
  if (r === n) return "→";
  if (c === m) return "↓";
  const here = T[r][c];
  for (const dir of ["↘", "↓", "→"] as const) {
    const [dr, dc] = step(dir);
    const mv = moveFrom(x, y, r, c, dir);
    if (here === mv.cost + (T[r + dr][c + dc] ?? NaN)) return dir;
  }
  return "↘";
}

/** Nejkratší posloupnost úprav z buňky `from` (výchozí (0, 0) = celá slova) do pravého dolního rohu. */
export function editMoves(
  xs: string,
  ys: string,
  T: readonly (readonly (number | null)[])[],
  from: [number, number] = [0, 0],
): EditMove[] {
  const x = splitChars(xs);
  const y = splitChars(ys);
  const out: EditMove[] = [];
  let [r, c] = from;
  while (r < x.length || c < y.length) {
    const dir = bestDir(x, y, T, r, c);
    out.push(moveFrom(x, y, r, c, dir));
    const [dr, dc] = step(dir);
    r += dr;
    c += dc;
  }
  return out;
}

/** Je posloupnost tahů z (1, 1) nejkratší cestou do (n + 1, m + 1)? (každý tah drží T[odkud] = cena + T[kam]) */
export function isOptimalPath(
  xs: string,
  ys: string,
  T: readonly (readonly number[])[],
  dirs: readonly EditDir[],
): boolean {
  const x = splitChars(xs);
  const y = splitChars(ys);
  let r = 0;
  let c = 0;
  for (const dir of dirs) {
    const [dr, dc] = step(dir);
    if (r + dr > x.length || c + dc > y.length) return false;
    const mv = moveFrom(x, y, r, c, dir);
    if (T[r][c] !== mv.cost + T[r + dr][c + dc]) return false;
    r += dr;
    c += dc;
  }
  return r === x.length && c === y.length;
}

/** Provede úpravy na x (pro kontrolu: výsledek má být y). */
export function applyMoves(moves: readonly EditMove[]): string {
  return moves.map((m) => (m.kind === "delete" ? "" : m.b)).join("");
}

/** Popis úpravy do zprávy a seznamu: „u → t“, „smazat u“, „vložit e“, „p ponecháme“ */
export function moveText(m: EditMove): string {
  if (m.kind === "keep") return `${m.a} ponecháme`;
  if (m.kind === "change") return `${m.a} → ${m.b}`;
  if (m.kind === "delete") return `smažeme ${m.a}`;
  return `vložíme ${m.b}`;
}

const cell = (r: number, c: number) => `T[${r + 1}, ${c + 1}]`;
const q = (s: string) => `„${s}“`;

export function* edit2Steps(xs: string, ys: string): StepGen<EditState> {
  const x = splitChars(xs);
  const y = splitChars(ys);
  const n = x.length;
  const m = y.length;
  const st: EditState = {
    x,
    y,
    T: Array.from({ length: n + 1 }, () => Array(m + 1).fill(null)),
    cur: null,
    delta: null,
    cand: null,
    pick: null,
    path: [],
    pos: null,
    done: false,
  };
  const T = st.T;
  for (let r = 0; r <= n; r++) T[r][m] = n - r;
  yield snap(
    st,
    EDIT_LINE.col,
    `Okraj vpravo: y už skončilo, zbytek x musíme smazat – T[i, ${m + 1}] = n − i + 1 (${n}, …, 0).`,
  );
  for (let c = 0; c <= m; c++) T[n][c] = m - c;
  yield snap(
    st,
    EDIT_LINE.row,
    `Okraj dole: x už skončilo, zbytek y musíme vložit – T[${n + 1}, j] = m − j + 1 (${m}, …, 0).`,
  );
  for (let r = n - 1; r >= 0; r--)
    for (let c = m - 1; c >= 0; c--) {
      st.cur = [r, c];
      st.cand = null;
      st.pick = null;
      const d: 0 | 1 = x[r] === y[c] ? 0 : 1;
      st.delta = d;
      yield snap(
        st,
        EDIT_LINE.delta,
        `i = ${r + 1}, j = ${c + 1}: x_${r + 1} = ${x[r]}, y_${c + 1} = ${y[c]} – ${d === 0 ? "stejné, δ ← 0" : "různé, δ ← 1"}.`,
      );
      const cand: EditCand = {
        diag: d + (T[r + 1][c + 1] as number),
        down: 1 + (T[r + 1][c] as number),
        right: 1 + (T[r][c + 1] as number),
      };
      const best = Math.min(cand.diag, cand.down, cand.right);
      T[r][c] = best;
      st.cand = cand;
      st.pick = bestDir(x, y, T, r, c);
      const what =
        st.pick === "↘"
          ? d === 0
            ? `ponecháme ${x[r]}`
            : `změníme ${x[r]} na ${y[c]}`
          : st.pick === "↓"
            ? `smažeme ${x[r]}`
            : `vložíme ${y[c]}`;
      yield snap(
        st,
        EDIT_LINE.min,
        `${cell(r, c)} ← min(${d} + ${cell(r + 1, c + 1)}, 1 + ${cell(r + 1, c)}, 1 + ${cell(r, c + 1)}) = min(${cand.diag}, ${cand.down}, ${cand.right}) = ${best} (${what}).`,
      );
    }
  st.cur = null;
  st.delta = null;
  st.cand = null;
  st.pick = null;
  const dist = T[0][0] as number;
  yield snap(
    st,
    EDIT_LINE.out,
    `Výstup: L(${q(xs)}, ${q(ys)}) = T[1, 1] = ${dist}.`,
  );
  st.pos = [0, 0];
  yield snap(
    st,
    EDIT_LINE.walkStart,
    `Úpravy najdeme zpětně: z buňky T[1, 1] jdeme vždy tam, odkud vzešlo minimum (ze stejně dobrých ↘, pak ↓, pak →).`,
  );
  let r = 0;
  let c = 0;
  while (r < n || c < m) {
    const dir = bestDir(x, y, T, r, c);
    const mv = moveFrom(x, y, r, c, dir);
    st.path.push(mv);
    const [dr, dc] = step(dir);
    r += dr;
    c += dc;
    st.pos = [r, c];
    yield snap(
      st,
      EDIT_LINE.walk,
      `${dir} ${moveText(mv)}${mv.cost ? " (+1)" : " (0)"}: ${cell(mv.r, mv.c)} = ${T[mv.r][mv.c]} = ${mv.cost} + ${cell(r, c)}.`,
    );
  }
  st.pos = null;
  st.done = true;
  const ops = st.path.filter((p) => p.cost === 1).map(moveText);
  yield snap(
    st,
    null,
    `Hotovo – L(${xs}, ${ys}) = ${dist}${ops.length ? `: ${ops.join(", ")}` : " (slova jsou stejná)"}.`,
  );
}
