/**
 * Komparátorové (třídicí) sítě z kap. 15.3 Průvodce labyrintem algoritmů (s. 392–398) – čisté funkce
 * bez Reactu (testy v sortNet.test.ts proti obrázkům 15.6–15.10 a cvičení 15.3.6–7).
 *
 * Komparátor (a, b) má vždy a < b: menší hodnota odejde na vodič a, větší na b („větší výstup leží ve
 * směru šipky“, šipky v knize míří doprava). Vrstva = komparátory, které počítají současně (nesdílejí
 * vodič); u bublinkové sítě se vrstvy počítají „jakmile zná oba vstupy“ (ASAP, obr. 15.7).
 */

export type NetKind = "bubble" | "sep" | "bitonic" | "t" | "batcher";

export const NET_KINDS: readonly NetKind[] = [
  "bubble",
  "sep",
  "bitonic",
  "t",
  "batcher",
];

export interface Comparator {
  a: number;
  b: number;
  /** průchod bublinkového třídění (1 = první, obr. 15.6) */
  pass?: number;
  /** blok, do kterého komparátor patří (obr. 15.8 / 15.9): popisek a vodiče */
  block?: { label: string; lo: number; hi: number };
  /** popis části bloku do zprávy („obrácení + S₈“, „S₄“) */
  part?: string;
  /** Batcher: triviální případ BMerge (n ≤ 1) – jinak min/max ve výstupu */
  base?: boolean;
}

/** Obdélník bloku přes vodiče lo…hi a vrstvy from…to (indexy od 0). */
export interface NetBlock {
  label: string;
  lo: number;
  hi: number;
  from: number;
  to: number;
}

export interface SortNet {
  kind: NetKind;
  n: number;
  /** komparátory v pořadí zápisu (konstrukce) */
  comps: Comparator[];
  /** vrstvy: indexy do `comps` */
  layers: number[][];
  blocks: NetBlock[];
  /** „jak je zapsaná“ (obr. 15.6): každý komparátor ve vlastní vrstvě */
  seq: boolean;
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
/** číslo dolním indexem: sub(16) = „₁₆“ */
export const sub = (k: number) =>
  String(k).replace(/\d/g, (d) => SUB[Number(d)]);

/** Pro jaká n jde síť sestrojit (kniha předpokládá n = 2ᵏ; bublinka libovolné n). */
export function validSizes(kind: NetKind): number[] {
  if (kind === "bubble") return Array.from({ length: 15 }, (_, i) => i + 2);
  return [2, 4, 8, 16];
}

/* ------------------------------------------------------------------ konstrukce */

/** Bublinkové třídění jako síť (obr. 15.6): průchody p = n − 1, …, 1, v každém (i, i + 1) pro i < p. */
export function bubbleComparators(n: number): Comparator[] {
  const out: Comparator[] = [];
  for (let p = n - 1, pass = 1; p >= 1; p--, pass++)
    for (let i = 0; i < p; i++) out.push({ a: i, b: i + 1, pass });
  return out;
}

/** Separátor řádu m na vodičích lo … lo + m − 1 (s. 395): komparátory (xᵢ, xᵢ₊ₘ/₂). */
function separator(lo: number, m: number, part?: string): Comparator[] {
  const block = { label: "S" + sub(m), lo, hi: lo + m - 1 };
  return Array.from({ length: m / 2 }, (_, i) => ({
    a: lo + i,
    b: lo + i + m / 2,
    block,
    part: part ?? block.label,
  }));
}

/** Bitonická třídička řádu m na vodičích lo…: Sₘ, pak 2 × Sₘ/₂, …, až S₂ (obr. 15.8). */
function bitonicSorter(lo: number, m: number): Comparator[] {
  const out: Comparator[] = [];
  for (let size = m; size >= 2; size /= 2)
    for (let s = lo; s < lo + m; s += size) out.push(...separator(s, size));
  return out;
}

/**
 * Slévačka Mₘ na vodičích lo … lo + 2m − 1 (s. 395): druhou posloupnost obrátit, přilepit a setřídit
 * bitonickou třídičkou B₂ₘ. Obrácení je permutace vodičů – kreslíme ji jako zrcadlové komparátory
 * (i, 2m − 1 − i) místo S₂ₘ; zbytek B₂ₘ (Sₘ, …, S₂) zůstává.
 */
export function mergerComparators(m: number, lo = 0): Comparator[] {
  const block = { label: "M" + sub(m), lo, hi: lo + 2 * m - 1 };
  const mirror: Comparator[] = Array.from({ length: m }, (_, i) => ({
    a: lo + i,
    b: lo + 2 * m - 1 - i,
    block,
    part: `obrácení + S${sub(2 * m)}`,
  }));
  const rest: Comparator[] = [];
  for (let size = m; size >= 2; size /= 2)
    for (let s = lo; s < lo + 2 * m; s += size)
      rest.push(...separator(s, size).map((c) => ({ ...c, block })));
  return [...mirror, ...rest];
}

/** Třídicí síť Tₙ (obr. 15.9): slévačky M₁, M₂, …, Mₙ/₂ sousedních dvojic posloupností. */
function mergeSortComparators(n: number): Comparator[] {
  const out: Comparator[] = [];
  for (let m = 1; m < n; m *= 2)
    for (let lo = 0; lo < n; lo += 2 * m) out.push(...mergerComparators(m, lo));
  return out;
}

/**
 * Batcherovo třídění (cv. 15.3.7) jako síť: sudo-lichá slévačka na místě. `merge(lo, len, r)` slévá
 * prvky lo, lo + r, lo + 2r, … (dvě setříděné poloviny): napřed zvlášť sudé a liché (řádky 2 a 3 BMerge),
 * pak komparátory (aᵢ, bᵢ₋₁) výstupu; pro dvě jednoprvkové posloupnosti je to jediný komparátor (řádek 1).
 */
/** popisek vrstvy Batchera podle slévaných bloků: „slévání dvojic do čtveřic s rozestupem 2“ */
const GROUPS: Record<number, string> = {
  1: "prvků",
  2: "dvojic",
  4: "čtveřic",
  8: "osmic",
  16: "šestnáctic",
};
const batcherPart = (len: number, r: number) =>
  `slévání ${GROUPS[len / 2] ?? `bloků ${len / 2}`} do ${GROUPS[len] ?? `bloků ${len}`} s rozestupem ${r}`;

function batcherComparators(n: number): Comparator[] {
  const out: Comparator[] = [];
  const merge = (lo: number, len: number, r: number) => {
    const step = r * 2;
    if (step < len) {
      merge(lo, len, step);
      merge(lo + r, len, step);
      for (let i = lo + r; i + r < lo + len; i += step)
        out.push({ a: i, b: i + r, part: batcherPart(len, r) });
    } else
      out.push({ a: lo, b: lo + r, base: true, part: batcherPart(len, r) });
  };
  const sort = (lo: number, len: number) => {
    if (len < 2) return;
    sort(lo, len / 2);
    sort(lo + len / 2, len / 2);
    merge(lo, len, 1);
  };
  sort(0, n);
  return out;
}

/** Vrstvy „skutečného průběhu“: komparátor počítá, jakmile zná oba vstupy (1 + max vrstev na jeho vodičích). */
export function asapLayers(
  comps: readonly Comparator[],
  n: number,
): number[][] {
  const ready = new Array<number>(n).fill(0);
  const layers: number[][] = [];
  comps.forEach((c, i) => {
    const l = Math.max(ready[c.a], ready[c.b]);
    ready[c.a] = ready[c.b] = l + 1;
    (layers[l] ??= []).push(i);
  });
  // uvnitř vrstvy zleva doprava (pořadí v kresbě i ve zprávě)
  for (const l of layers) l.sort((x, y) => comps[x].a - comps[y].a);
  return layers;
}

/** Bloky (obr. 15.8 / 15.9) z komparátorů: vodiče z bloku, vrstvy od první po poslední jeho komparátor. */
function blocksOf(
  comps: readonly Comparator[],
  layers: number[][],
): NetBlock[] {
  const layerOf = new Array<number>(comps.length);
  layers.forEach((l, li) => l.forEach((c) => (layerOf[c] = li)));
  const byKey = new Map<string, NetBlock>();
  comps.forEach((c, i) => {
    if (!c.block) return;
    const key = `${c.block.label}|${c.block.lo}|${c.block.hi}`;
    const b = byKey.get(key);
    if (b) {
      b.from = Math.min(b.from, layerOf[i]);
      b.to = Math.max(b.to, layerOf[i]);
    } else
      byKey.set(key, {
        label: c.block.label,
        lo: c.block.lo,
        hi: c.block.hi,
        from: layerOf[i],
        to: layerOf[i],
      });
  });
  return [...byKey.values()].sort((x, y) => x.from - y.from || x.lo - y.lo);
}

/** Síť daného druhu pro n vodičů; `seq` = bublinka „jak je zapsaná“ (každý komparátor zvlášť). */
export function buildNet(
  kind: NetKind,
  n: number,
  opts: { seq?: boolean } = {},
): SortNet {
  if (!validSizes(kind).includes(n))
    throw new Error(`síť ${kind} pro n = ${n} neexistuje`);
  const comps =
    kind === "bubble"
      ? bubbleComparators(n)
      : kind === "sep"
        ? separator(0, n)
        : kind === "bitonic"
          ? bitonicSorter(0, n)
          : kind === "t"
            ? mergeSortComparators(n)
            : batcherComparators(n);
  const seq = kind === "bubble" && !!opts.seq;
  const layers = seq ? comps.map((_, i) => [i]) : asapLayers(comps, n);
  return { kind, n, comps, layers, blocks: blocksOf(comps, layers), seq };
}

/** Hloubka (počet vrstev) a velikost (počet komparátorů). */
export function netSizes(net: SortNet): { depth: number; size: number } {
  return { depth: net.layers.length, size: net.comps.length };
}

/* ------------------------------------------------------------------ simulace */

export interface NetRun {
  /** hodnoty na vodičích v mezerách: gaps[0] = vstup, gaps[l + 1] = za vrstvou l */
  gaps: number[][];
  /** odkud hodnota pochází (index vstupu) – stejný tvar jako gaps */
  ids: number[][];
  /** prohodil komparátor (podle indexu v comps)? vynechaný = false */
  swapped: boolean[];
  swapsPerLayer: number[];
}

/** Simulace po vrstvách; `removed` = indexy vynechaných komparátorů (rozbitá síť). */
export function runNet(
  net: SortNet,
  input: readonly number[],
  removed: readonly number[] = [],
): NetRun {
  if (input.length !== net.n)
    throw new Error(`síť má ${net.n} vodičů, vstup ${input.length} čísel`);
  const skip = new Set(removed);
  let v = input.slice();
  let id = input.map((_, i) => i);
  const gaps = [v.slice()];
  const ids = [id.slice()];
  const swapped = new Array<boolean>(net.comps.length).fill(false);
  const swapsPerLayer: number[] = [];
  for (const layer of net.layers) {
    v = v.slice();
    id = id.slice();
    let s = 0;
    for (const c of layer) {
      if (skip.has(c)) continue;
      const { a, b } = net.comps[c];
      if (v[a] > v[b]) {
        [v[a], v[b]] = [v[b], v[a]];
        [id[a], id[b]] = [id[b], id[a]];
        swapped[c] = true;
        s++;
      }
    }
    gaps.push(v);
    ids.push(id);
    swapsPerLayer.push(s);
  }
  return { gaps, ids, swapped, swapsPerLayer };
}

/** Výstup sítě. */
export function applyNet(
  net: SortNet,
  input: readonly number[],
  removed: readonly number[] = [],
): number[] {
  const g = runNet(net, input, removed).gaps;
  return g[g.length - 1];
}

export function isSorted(xs: readonly number[]): boolean {
  for (let i = 1; i < xs.length; i++) if (xs[i - 1] > xs[i]) return false;
  return true;
}

/**
 * 0-1 princip (cv. 15.3.6): síť třídí všechny vstupy, právě když třídí všech 2ⁿ posloupností nul a jedniček.
 * Vrátí, kolik jich setřídila, a první protipříklad (nebo null).
 */
export function zeroOneCheck(
  net: SortNet,
  removed: readonly number[] = [],
): { total: number; sorted: number; counter: number[] | null } {
  const n = net.n;
  const skip = new Set(removed);
  const order = net.layers.flat().filter((c) => !skip.has(c));
  const total = 2 ** n;
  let sorted = 0;
  let counter: number[] | null = null;
  for (let mask = 0; mask < total; mask++) {
    let x = mask;
    for (const c of order) {
      const { a, b } = net.comps[c];
      // bit a = 1 a bit b = 0 → komparátor je prohodí
      if ((x >> a) & 1 && !((x >> b) & 1)) x ^= (1 << a) | (1 << b);
    }
    // setříděno = jedničky tvoří souvislý konec: x = 1…10…0 od nejvyššího bitu
    const ones = popcount(x);
    const want = ones === 0 ? 0 : ((1 << ones) - 1) << (n - ones);
    if (x === want) sorted++;
    else if (!counter)
      counter = Array.from({ length: n }, (_, i) => (mask >> i) & 1);
  }
  return { total, sorted, counter };
}

function popcount(x: number): number {
  let c = 0;
  for (let y = x; y; y &= y - 1) c++;
  return c;
}

/* ------------------------------------------------------------------ bitonické posloupnosti */

/** Čistě bitonická: nejdřív neklesá, pak neroste (s. 393). */
function isPurelyBitonic(xs: readonly number[]): boolean {
  let i = 1;
  while (i < xs.length && xs[i - 1] <= xs[i]) i++;
  while (i < xs.length && xs[i - 1] >= xs[i]) i++;
  return i >= xs.length;
}

/** Bitonická = rotace čistě bitonické posloupnosti (s. 393). */
export function isBitonic(xs: readonly number[]): boolean {
  for (let j = 0; j < Math.max(1, xs.length); j++)
    if (isPurelyBitonic([...xs.slice(j), ...xs.slice(0, j)])) return true;
  return false;
}

/**
 * Hora a údolí z důkazu konstrukce separátoru (s. 395–396): hora = n/2 největších prvků, souvislý
 * cyklický úsek x_k, …, x_{k+n/2−1}. Jen pro bitonický vstup s různými prvky (jinak null).
 */
export function separatorSplit(
  xs: readonly number[],
): { k: number; mountain: boolean[] } | null {
  const n = xs.length;
  if (n < 2 || n % 2 || new Set(xs).size !== n || !isBitonic(xs)) return null;
  const threshold = [...xs].sort((a, b) => a - b)[n / 2];
  const mountain = xs.map((v) => v >= threshold);
  // k = začátek hory: prvek hory, před nímž (cyklicky) leží údolí
  const k = mountain.findIndex((m, i) => m && !mountain[(i - 1 + n) % n]);
  return { k, mountain };
}

/* ------------------------------------------------------------------ kontrolní doslovné konstrukce */

/** Procedura BMerge z cvičení 15.3.7 doslova jako rekurzivní funkce (dvě setříděné posloupnosti délky n). */
export function bmergeBook(
  x: readonly number[],
  y: readonly number[],
): number[] {
  const n = x.length;
  if (n <= 1)
    return n === 0 ? [] : [Math.min(x[0], y[0]), Math.max(x[0], y[0])];
  const even = (s: readonly number[]) => s.filter((_, i) => i % 2 === 0);
  const odd = (s: readonly number[]) => s.filter((_, i) => i % 2 === 1);
  const a = bmergeBook(even(x), even(y));
  const b = bmergeBook(odd(x), odd(y));
  const out = [a[0]];
  for (let i = 1; i < n; i++)
    out.push(Math.min(a[i], b[i - 1]), Math.max(a[i], b[i - 1]));
  out.push(b[n - 1]);
  return out;
}

/** Batcherovo třídění: rekurzivně setřídit poloviny, pak BMerge (délka mocnina dvojky). */
export function batcherSortBook(xs: readonly number[]): number[] {
  if (xs.length <= 1) return xs.slice();
  const h = xs.length / 2;
  return bmergeBook(
    batcherSortBook(xs.slice(0, h)),
    batcherSortBook(xs.slice(h)),
  );
}

/** Slévačka doslova podle důkazu (s. 395): y obrátit, přilepit za x a setřídit bitonickou třídičkou B₂ₘ. */
export function literalMerge(
  x: readonly number[],
  y: readonly number[],
): number[] {
  const m = x.length;
  const comps = bitonicSorter(0, 2 * m);
  const net: SortNet = {
    kind: "bitonic",
    n: 2 * m,
    comps,
    layers: asapLayers(comps, 2 * m),
    blocks: [],
    seq: false,
  };
  return applyNet(net, [...x, ...[...y].reverse()]);
}
