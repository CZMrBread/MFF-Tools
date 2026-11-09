/**
 * Čisté pomocné funkce stránek hešování: výchozí příklady, rozložení buněk na plátně a zápis vstupu do odkazu.
 * Testy jsou v ui.test.ts.
 */
import { parseNumberList } from "../../core/input";
import { plural } from "../../views/text";
import { blBuild, bloomBits, type BloomState } from "./bloom";
import { ckBuild, fns, type CuckooState } from "./cuckoo";
import { czNum, HASH_FNS, isKey, isPow2, KEY_MAX } from "./hashfn";
import { buildTable, storedKeys, type HashState } from "./tables";

/* ================================================================== parametry a výchozí příklady */

/** velikosti tabulky; m = 10 je z obr. 11.2 (multiply-shift ho nebere – potřebuje mocninu 2) */
export const HASH_SIZES = [4, 8, 10, 16, 32];
export const CUCKOO_SIZES = [8, 16, 32];
export const BLOOM_SIZES = [16, 32, 64];
export const BLOOM_KS = [1, 2, 3, 4, 5];

export interface TableSpec {
  m: number;
  fnId: string;
  seed: number;
  keys: number[];
}

/** Řetězení, m = 8, x mod m: tři klíče v přihrádce 4 (12, 20, 28) a dva v přihrádce 7 (7, 15). */
export const CHAIN_DEFAULT: TableSpec = {
  m: 8,
  fnId: "mod",
  seed: 1,
  keys: [12, 20, 28, 7, 15, 33],
};
/** Otevřená adresace, m = 16, x mod m: 3, 19, 35 mají h = 3 a spolu s 20 a 7 tvoří shluk v buňkách 3–7. */
export const PROBE_DEFAULT: TableSpec = {
  m: 16,
  fnId: "mod",
  seed: 1,
  keys: [3, 19, 35, 20, 7, 41],
};
/** Příklady z knihy pro otevřenou adresaci: prázdná tabulka a operace Insert jedna po druhé. */
export interface HashBookExample {
  id: string;
  label: string;
  m: number;
  fnId: string;
  inserts: number[];
}
export const HASH_BOOK_EXAMPLES: readonly HashBookExample[] = [
  {
    // Průvodce 11.4, obr. 11.2: m = 10, h(x) = x mod 10 (poslední číslice), lineární přidávání
    id: "11.2",
    label: "Obr. 11.2",
    m: 10,
    fnId: "mod",
    inserts: [75, 36, 14, 42, 24, 95, 17],
  },
];

export const CUCKOO_DEFAULT = { m: 16, seed: 3, keys: [57, 12, 33, 90, 41] };
export const BLOOM_DEFAULT = { m: 32, k: 3, keys: [17, 42, 99] };

/** Největší počet klíčů v poli „Postavit“: otevřená adresace a kukaččí tabulka pojmou nejvýše m klíčů. */
export const maxKeys = (
  m: number,
  kind: "chain" | "probe" | "cuckoo" | "bloom",
): number => (kind === "chain" ? 2 * m : kind === "bloom" ? 32 : m);

/** „1 klíč“, „3 klíče“, „6 klíčů“ */
export const keysWord = (n: number): string =>
  `${n} ${plural(n, "klíč", "klíče", "klíčů")}`;

/* ================================================================== rozložení buněk (1 jednotka SVG = 1 px) */

/** Okraj kolem řady buněk v px (5 vlevo + 5 vpravo). */
export const CELL_PAD = 10;

/**
 * Šířka jedné buňky tabulky: co nejvíc vyplnit dostupnou šířku, ale ne pod `min` (pak se plátno vodorovně
 * posouvá) a ne nad `max`.
 */
export function cellWidth(
  m: number,
  avail: number,
  min: number,
  max: number,
): number {
  const fit = Math.floor((avail - CELL_PAD) / Math.max(1, m));
  return Math.max(min, Math.min(max, Number.isFinite(fit) ? fit : min));
}

/**
 * Buňka řady (otevřená adresace, kukačka) přes šířku plátna: šířka clamp(36, (W − okraje)/m, 72) px
 * (na úzkém plátně pod 600 px od 24 px – řada se pak posouvá), výška a písmo úměrně šířce.
 */
export function probeCell(
  m: number,
  avail: number,
): { w: number; h: number; font: number } {
  const w = cellWidth(m, avail, avail >= 600 ? 36 : 24, 72);
  return {
    w,
    h: Math.max(36, Math.round(w * 0.8)),
    font: w < 32 ? 12 : Math.min(22, Math.max(14, Math.round(w / 3))),
  };
}

/** nejvyšší řádek řetězení (px) – na vysokém plátně (1920 × 1080) vyplní m = 8 přihrádek výšku */
export const CHAIN_ROW_MAX = 56;

/** Písmo klíče (12–24 px, polovina řádku) a indexu přihrádky (13–20 px) podle výšky řádku řetězení. */
export function chainFonts(rowH: number): { key: number; idx: number } {
  return {
    key: Math.max(12, Math.min(24, Math.round(rowH * 0.5))),
    idx: Math.max(13, Math.min(20, Math.round(rowH * 0.36))),
  };
}

/**
 * Kolik px zabere m přihrádek po `rowH` px, když se dlouhé řetězce zalomí (`lens` = délky řetězců,
 * `width` = šířka plátna). Odhad podle šířky klíče (tři číslice) v písmu chainFonts; zalomený řádek má
 * mezeru 4 px.
 */
function chainHeight(
  rowH: number,
  fill: { lens: readonly number[]; width: number },
): number {
  const font = chainFonts(rowH).key;
  const keyW = Math.max(38.4, Math.round(font * 1.9) + 12) + 3;
  // index přihrádky (2rem + okraj) a odsazení řádku; každý další klíč má před sebou šipku (mezera 16 px)
  const perLine = Math.max(1, Math.floor((fill.width - 60 + 22) / (keyW + 22)));
  let h = 0;
  for (const len of fill.lens) {
    const lines = Math.max(1, Math.ceil(len / perLine));
    h += lines * rowH + (lines - 1) * 4;
  }
  return h;
}

/**
 * Přihrádky řetězení na výšku plátna: řádek clamp(18, H/m, 56) px; když se m řádků nevejde ani po 18 px,
 * přihrádky jdou do 2–4 sloupců. S `fill` (délky řetězců a šířka plátna) se řádek zmenší i tehdy, když by
 * se dlouhé řetězce zalomily a kresba nevešla. Bez známé výšky (telefon, běžný tok stránky) jeden sloupec
 * po 28 px.
 */
export function chainLayout(
  m: number,
  availH: number | null,
  fill?: { lens: readonly number[]; width: number },
): { cols: number; rowH: number } {
  if (availH === null || !Number.isFinite(availH) || availH <= 0)
    return { cols: 1, rowH: 28 };
  const rows1 = availH / Math.max(1, m);
  if (rows1 >= 18) {
    let rowH = Math.min(CHAIN_ROW_MAX, Math.floor(rows1));
    if (fill) while (rowH > 18 && chainHeight(rowH, fill) > availH) rowH--;
    return { cols: 1, rowH };
  }
  const cols = Math.min(4, Math.ceil((18 * m) / availH));
  const rows = Math.ceil(m / cols);
  return { cols, rowH: Math.max(18, Math.min(33, Math.floor(availH / rows))) };
}

/** nejvyšší řádek stopy sond / vyhazování a matice Bloomova filtru (px) */
export const TRAIL_ROW_MAX = 32;

/**
 * Řádky stopy sond / vyhazování pod řadou buněk (E6): výška řádku clamp(16, místo/kapacita, 32) px, kde
 * kapacita `cap` je nejdelší možná stopa (výchozí: její délka). Když se stopa nevejde ani po 16 px, ukáže
 * se jen její konec (`shown` posledních řádků). Bez známé výšky (telefon, běžný tok stránky) všechny
 * řádky po 24 px.
 */
export function trailRows(
  count: number,
  avail: number | null,
  cap = count,
): { rowH: number; shown: number } {
  if (avail === null || !Number.isFinite(avail))
    return { rowH: 24, shown: count };
  const rowH = Math.max(
    16,
    Math.min(TRAIL_ROW_MAX, Math.floor(avail / Math.max(1, cap))),
  );
  return {
    rowH,
    shown: Math.max(0, Math.min(count, Math.floor(avail / rowH))),
  };
}

/**
 * Bity Bloomova filtru v řadách: celý filtr v jedné řadě (nejvýš `maxPerRow` bitů), pokud se buňky vejdou
 * aspoň `min` px široké, jinak ho půlíme (64 → 2 × 32 → 4 × 16 …, nejméně 8 v řadě).
 */
export function bitRows(
  m: number,
  avail: number,
  min = 20,
  max = 30,
  maxPerRow = Infinity,
): { perRow: number; rows: number; w: number } {
  let perRow = Math.max(1, m);
  while (perRow > maxPerRow && perRow % 2 === 0) perRow /= 2;
  while (perRow > 8 && perRow % 2 === 0 && perRow * min + CELL_PAD > avail)
    perRow /= 2;
  return {
    perRow,
    rows: Math.ceil(m / perRow),
    w: cellWidth(perRow, avail, min, max),
  };
}

/** šířka sloupce s klíči vlevo od matice „klíč → bity“ pod Bloomovým filtrem (px) */
export const BLOOM_LABEL_W = 40;

/**
 * Rozložení Bloomova filtru: filtr do 32 bitů v jedné řadě (bity 17–72 px) se sloupcem klíčů vlevo – pod
 * ním matice „klíč → bity“ (`single`, bity začínají na x0). Jinak (m = 64, telefon) řady jako dřív
 * (bitRows) bez matice.
 */
export function bloomLayout(
  m: number,
  avail: number,
): { single: boolean; perRow: number; rows: number; w: number; x0: number } {
  if (m <= 32 && m * 17 + CELL_PAD + BLOOM_LABEL_W <= avail)
    return {
      single: true,
      perRow: m,
      rows: 1,
      w: cellWidth(m, avail - BLOOM_LABEL_W, 17, 72),
      x0: 5 + BLOOM_LABEL_W,
    };
  return { single: false, ...bitRows(m, avail, 20, 48, 32), x0: 5 };
}

/** řádek matice „klíč → bity“: klíč a jeho bity h₁(x), …, h_k(x) (bez opakování, v pořadí funkcí) */
export interface BloomRow {
  key: number;
  /** probíhající Insert / Lookup tohoto klíče */
  hot: boolean;
  cells: { bit: number; state: "" | "is-done" | "is-ok" | "is-fail" }[];
}

/** značka bitu v kroku operace → stav buňky matice (.viz-trail .tr-cell) */
const BLOOM_MARK: Record<string, BloomRow["cells"][number]["state"]> = {
  "cell-new": "is-ok",
  "cell-hit": "is-ok",
  "cell-compare": "is-done",
  "cell-removed": "is-fail",
};

/**
 * Matice „klíč → bity“: řádek pro každý vložený klíč. Během Insert / Lookup (ve stavu je `x` a značky
 * bitů) má klíč x řádek zvýrazněný a jen dosud prošlé bity se stavem podle značky; nevložený klíč
 * (Lookup) má řádek navíc na konci.
 */
export function bloomMatrix(st: BloomState): BloomRow[] {
  const x = st.vars.x;
  const hot =
    typeof x === "number" && Object.keys(st.marks).length > 0 ? x : null;
  const order = (key: number) => [...new Set(bloomBits(st, key))];
  const row = (key: number): BloomRow =>
    key === hot
      ? {
          key,
          hot: true,
          cells: order(key)
            .filter((b) => st.marks[b] !== undefined)
            .map((bit) => ({ bit, state: BLOOM_MARK[st.marks[bit]] ?? "" })),
        }
      : {
          key,
          hot: false,
          cells: order(key).map((bit) => ({ bit, state: "" })),
        };
  const rows = st.inserted.map(row);
  if (hot !== null && !st.inserted.includes(hot)) rows.push(row(hot));
  return rows;
}

/* ================================================================== vstup v odkazu (?t=…) */

/*
 * Jediný parametr `t` (useUrlParam zapíše v jednom renderu spolehlivě jen jeden parametr):
 *   řetězení / otevřená adresace:  m:funkce:seed:klíče    např. 8:mod:1:12,20,28
 *   kukaččí hešování:              m:seed:klíče           např. 16:3:57,12,33
 *   Bloomův filtr:                 m:k:klíče              např. 32:3:17,42,99
 * Seznam klíčů se při načtení vkládá postupně (jako Insert). Když tak skutečnou tabulku postavit nejde
 * (otevřená adresace s náhrobky nebo s klíči „přeskládanými“ mazáním, kukačka po Delete), píše se místo
 * klíčů seznam všech m buněk (rozhodnutí vlastníka E4, 7. 11. 2026):
 *   otevřená adresace:  16:mod:1:3,~,35,20,_,…   „~“ náhrobek, „_“ prázdná buňka
 *   kukaččí hešování:   16:3:_,_,58,_,…          „_“ prázdná buňka
 * Seznam buněk bez „_“ i „~“ (plná tabulka) má navíc značku „:b“, aby se nepletl se seznamem klíčů.
 * Staré odkazy (jen klíče) znamenají totéž co dřív.
 */

const keysText = (keys: number[]) => keys.join(",");

function parseKeys(
  text: string | undefined,
  maxCount: number,
): number[] | null {
  if (text === undefined) return null;
  const r = parseNumberList(text, { min: 0, max: KEY_MAX, maxCount });
  return r.ignored.length > 0 ? null : r.values;
}

const intIn = (text: string | undefined, allowed: number[]): number | null => {
  const v = Number(text);
  return text !== undefined && /^\d+$/.test(text) && allowed.includes(v)
    ? v
    : null;
};

const seedOf = (text: string | undefined): number | null =>
  text !== undefined && /^\d{1,9}$/.test(text) ? Number(text) : null;

export const formatHashShare = (st: HashState, keys: number[]): string =>
  `${st.m}:${st.fnId}:${st.seed}:${keysText(keys)}`;

/** značka seznamu buněk v odkazu, který neobsahuje „_“ ani „~“ (plná tabulka) */
const CELLS_MARK = "b";
const EMPTY = "_";
const TOMB = "~";

/** seznam buněk do odkazu; plná tabulka bez náhrobků dostane značku „:b“ */
function cellsText(cells: readonly (number | null | "tomb")[]): string {
  const text = cells
    .map((c) => (c === null ? EMPTY : c === "tomb" ? TOMB : String(c)))
    .join(",");
  return cells.some((c) => c === null || c === "tomb")
    ? text
    : `${text}:${CELLS_MARK}`;
}

/** Je díl odkazu s klíči seznamem buněk (obsahuje „_“ / „~“, nebo má značku „:b“)? */
const isCellList = (text: string | undefined, mark: string | undefined) =>
  mark === CELLS_MARK ||
  (text !== undefined &&
    text.split(",").some((t) => t === EMPTY || t === TOMB));

/**
 * Pořadí klíčů otevřené adresace, ve kterém je načtení odkazu (vkládání postupně) umístí do stejných buněk,
 * nebo null. Zkouší pořadí buněk od buňky za první prázdnou (to vyjde vždy, když tabulka vznikla jen
 * vkládáním), u plné tabulky od každé buňky; tabulku s náhrobky takto zapsat nejde.
 */
function probeKeyOrder(st: HashState): number[] | null {
  if (st.cells.some((c) => c === "tomb")) return null;
  const m = st.cells.length;
  const firstEmpty = st.cells.indexOf(null);
  const starts =
    firstEmpty >= 0
      ? [(firstEmpty + 1) % m]
      : Array.from({ length: m }, (_, i) => i);
  for (const s of starts) {
    const order: number[] = [];
    for (let k = 0; k < m; k++) {
      const c = st.cells[(s + k) % m];
      if (typeof c === "number") order.push(c);
    }
    const built = buildTable(st.m, st.fnId, st.seed, order, true).state;
    if (built.cells.every((c, i) => c === st.cells[i])) return order;
  }
  return null;
}

/**
 * Odkaz na tabulku řetězení / otevřené adresace: seznam klíčů, kde ho načtení postaví stejně, jinak seznam
 * buněk s náhrobky „~“ a prázdnými buňkami „_“ (E4).
 */
export function hashShare(st: HashState, probing: boolean): string {
  if (!probing) return formatHashShare(st, storedKeys(st, false));
  const order = probeKeyOrder(st);
  return order
    ? formatHashShare(st, order)
    : `${st.m}:${st.fnId}:${st.seed}:${cellsText(st.cells)}`;
}

/** Buňky z odkazu: přesně m položek, klíč / „_“ / (jen s `tomb`) „~“, bez opakování; jinak null. */
function parseCells(
  text: string,
  m: number,
  tomb: boolean,
): (number | null | "tomb")[] | null {
  const parts = text.split(",");
  if (parts.length !== m) return null;
  const seen = new Set<number>();
  const cells: (number | null | "tomb")[] = [];
  for (const p of parts) {
    const v = Number(p);
    if (p === EMPTY) cells.push(null);
    else if (p === TOMB && tomb) cells.push("tomb");
    else if (/^\d{1,5}$/.test(p) && isKey(v) && !seen.has(v)) {
      seen.add(v);
      cells.push(v);
    } else return null;
  }
  return cells;
}

/**
 * Otevřená adresace ze seznamu buněk. Každý klíč musí jít najít: buňky od h(x) po jeho buňku nesmí být
 * prázdné (jinak by ho Find nenašel) – jinak null.
 */
function probeFromCells(
  m: number,
  fnId: string,
  seed: number,
  text: string,
): HashState | null {
  const cells = parseCells(text, m, true);
  if (!cells) return null;
  const st = buildTable(m, fnId, seed, [], true).state;
  const h = HASH_FNS.find((f) => f.id === fnId)!.make(m, seed);
  for (let i = 0; i < m; i++) {
    const c = cells[i];
    if (typeof c !== "number") continue;
    for (let j = h(c); j !== i; j = (j + 1) % m)
      if (cells[j] === null) return null;
  }
  st.cells = cells;
  st.n = cells.filter((c) => typeof c === "number").length;
  st.vars = { "α = n/m": czNum(st.n / m) };
  return st;
}

/** Tabulka z parametru odkazu, nebo null, když parametr chybí nebo je neplatný (pak platí výchozí příklad). */
export function hashFromShare(
  text: string | null,
  probing: boolean,
): HashState | null {
  if (!text) return null;
  const [mt, fnId, st, kt, mark] = text.split(":");
  const m = intIn(mt, HASH_SIZES);
  const seed = seedOf(st);
  const fn = HASH_FNS.find((h) => h.id === fnId);
  if (
    m === null ||
    seed === null ||
    !fn ||
    (fn.id === "mulshift" && !isPow2(m))
  )
    return null;
  if (mark !== undefined && mark !== CELLS_MARK) return null;
  if (isCellList(kt, mark))
    return probing && kt !== undefined
      ? probeFromCells(m, fn.id, seed, kt)
      : null;
  const keys = parseKeys(kt, maxKeys(m, probing ? "probe" : "chain"));
  return keys ? buildTable(m, fn.id, seed, keys, probing).state : null;
}

/**
 * Pořadí klíčů pro odkaz, ve kterém je ckBuild (vkládání postupně, jako Insert) umístí do stejných buněk
 * jako teď: klíč v buňce f(x) jde rovnou, klíč v g(x) až za klíčem, který obsadil f(x) – vkládání pak
 * nikoho nevyhazuje. Nejde-li to (klíč v g(x) při volné buňce f(x) po Delete, cyklus závislostí), vrátí null.
 */
export function cuckooKeyOrder(st: CuckooState): number[] | null {
  const [f, g] = fns(st);
  const out: number[] = [];
  const state = new Map<number, "busy" | "done">();
  const visit = (i: number): boolean => {
    const x = st.cells[i];
    if (x === null || x === undefined) return false;
    if (state.get(i) === "done") return true;
    if (state.get(i) === "busy") return false; // cyklus
    state.set(i, "busy");
    if (f(x) !== i) {
      if (g(x) !== i || !visit(f(x))) return false;
    }
    state.set(i, "done");
    out.push(x);
    return true;
  };
  for (let i = 0; i < st.cells.length; i++)
    if (st.cells[i] !== null && !visit(i)) return null;
  return out;
}

const sameCells = (a: CuckooState, b: CuckooState) =>
  a.cells.length === b.cells.length &&
  a.cells.every((c, i) => c === b.cells[i]);

/**
 * m:seed:klíče. Klíče jsou v pořadí, ve kterém je načtení (ckBuild) vloží do stejných buněk (TREEHASH-02);
 * když takové pořadí není (klíč v g(x) při volné f(x) po Delete), seznam všech buněk s „_“ (E4).
 */
export function formatCuckooShare(st: CuckooState): string {
  const order = cuckooKeyOrder(st);
  return order && sameCells(ckBuild(st.m, st.seed, order).state, st)
    ? `${st.m}:${st.seed}:${keysText(order)}`
    : `${st.m}:${st.seed}:${cellsText(st.cells)}`;
}

export function cuckooFromShare(text: string | null): CuckooState | null {
  if (!text) return null;
  const [mt, st, kt, mark] = text.split(":");
  const m = intIn(mt, CUCKOO_SIZES);
  const seed = seedOf(st);
  if (m === null || seed === null) return null;
  if (mark !== undefined && mark !== CELLS_MARK) return null;
  if (isCellList(kt, mark))
    return kt === undefined ? null : cuckooFromCells(m, seed, kt);
  const keys = parseKeys(kt, maxKeys(m, "cuckoo"));
  return keys ? ckBuild(m, seed, keys).state : null;
}

/** Kukačka ze seznamu buněk: každý klíč leží v buňce f(x) nebo g(x), jinak null. */
function cuckooFromCells(
  m: number,
  seed: number,
  text: string,
): CuckooState | null {
  const cells = parseCells(text, m, false);
  if (!cells) return null;
  const st = ckBuild(m, seed, []).state;
  const [f, g] = fns(st);
  const keys: (number | null)[] = [];
  for (let i = 0; i < m; i++) {
    const c = cells[i];
    if (c === "tomb") return null;
    if (c !== null && f(c) !== i && g(c) !== i) return null;
    keys.push(c);
  }
  st.cells = keys;
  st.n = keys.filter((c) => c !== null).length;
  st.vars = { "α = n/m": czNum(st.n / m) };
  return st;
}

export const formatBloomShare = (st: BloomState): string =>
  `${st.m}:${st.k}:${keysText(st.inserted)}`;

export function bloomFromShare(text: string | null): BloomState | null {
  if (!text) return null;
  const [mt, kt, keysT] = text.split(":");
  const m = intIn(mt, BLOOM_SIZES);
  const k = intIn(kt, BLOOM_KS);
  if (m === null || k === null) return null;
  const keys = parseKeys(keysT, maxKeys(m, "bloom"));
  return keys ? blBuild(m, k, keys).state : null;
}
