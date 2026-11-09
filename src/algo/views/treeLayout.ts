import { stretch, type FitLimits } from "../core/canvasFit";
import { fitWidth } from "./useWidth";

/* Čistá geometrie stromů pro TreeView a MultiTreeView (testy v TreeView.test.ts). */

/**
 * Vrchol binárního stromu. Souřadnice x ∈ [0,1] a y = hloubka; uzly jsou klíčované id → přesuny se animují.
 */
export interface TNode {
  id: number;
  label: string;
  x: number;
  y: number;
  cls?: string;
  /** drobný text u uzlu (např. výška, ∆, index) */
  sub?: string;
  /** přístupný název vrcholu (bez „ – vybrat“); výchozí „Vrchol <label>“ */
  aria?: string;
}
export interface TEdge {
  from: number;
  to: number;
  cls?: string;
  label?: string;
}

/** Strom s více klíči ve vrcholu ((a,b)-stromy). */
export interface MNode {
  id: number;
  keys: string[];
  x: number; // 0..1 (střed)
  y: number; // hloubka
  cls?: string;
  /** index zvýrazněného klíče */
  hot?: number;
  /**
   * třída jednotlivých klíčů (podle indexu; undefined = bez třídy) – barvení klíčů uvnitř vrcholu
   * (FFT strom volání: sudé / liché koeficienty, AC: stav automatu). S `hot` se třídy spojí.
   */
  keyCls?: readonly (string | undefined)[];
  sub?: string;
}
export interface MEdge {
  from: number;
  to: number;
  cls?: string;
}

/** Nejmenší mezera mezi okraji sousedních vrcholů téže hladiny (px). */
const NODE_GAP = 8;
/** Strop šířky plátna (px) – kvůli degenerovaným vstupům. */
const MAX_TREE_W = 6000;

/**
 * Nejmenší vzdálenost x (v normalizovaných souřadnicích 0..1) mezi sousedními vrcholy téže hladiny;
 * Infinity, když žádná hladina nemá dva vrcholy.
 */
export function minLevelGap<T extends { x: number; y: number }>(
  nodes: T[],
): number {
  const levels = new Map<number, number[]>();
  for (const n of nodes) levels.set(n.y, [...(levels.get(n.y) ?? []), n.x]);
  let gap = Infinity;
  for (const xs of levels.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++)
      if (xs[i] - xs[i - 1] > 1e-9) gap = Math.min(gap, xs[i] - xs[i - 1]);
  }
  return gap;
}

export interface TreeLayout {
  W: number;
  H: number;
  r: number;
  /** písmo popisku vrcholu (px) */
  font: number;
  px: (n: TNode) => number;
  py: (n: TNode) => number;
}

/** Nejmenší vzdálenost hladin při přizpůsobení výšce plátna (vrchol r = 20 a kousek hrany). */
export const MIN_LEVEL = 48;

const maxLevel = (base: number) => Math.round(base * 1.25);

/**
 * Vzdálenost hladin pro deltu z useCanvasFit (core/canvasFit.ts): výška stromu roste s (hloubka + 1)
 * hladinami, takže delta se mezi ně rozdělí. Vrcholy a písmo zůstanou 1 : 1.
 */
export function fitLevelHeight(
  base: number,
  delta: number,
  depth: number,
  /** nejmenší vzdálenost hladin (hluboký strom: minLevelHeight), výchozí MIN_LEVEL */
  minLevel = MIN_LEVEL,
): number {
  if (delta === 0 || depth === 0) return base;
  return stretch(
    base,
    delta / (depth + 1),
    Math.min(base, minLevel),
    maxLevel(base),
  );
}

/** Meze delty pro strom dané hloubky (bez hloubky se výška nemění). */
export function levelFitLimits(
  base: number,
  depth: number,
  minLevel = MIN_LEVEL,
): FitLimits {
  if (depth === 0) return { shrink: 0, grow: 0 };
  return {
    shrink: (depth + 1) * Math.max(0, base - minLevel),
    grow: (depth + 1) * (maxLevel(base) - base),
  };
}

/**
 * Nejmenší vzdálenost hladin, při které se vrcholy s poloměrem r na sousedních (i ob jednu) hladinách
 * nepřekrývají – v šířce W. Hluboká cesta (BST ze setříděného vstupu) má vrcholy vodorovně od sebe,
 * takže hladiny jdou stáhnout hluboko pod MIN_LEVEL; vždy aspoň r + 6 (hrana zůstane vidět).
 */
export function minLevelHeight(
  nodes: readonly { x: number; y: number }[],
  W: number,
  r: number,
): number {
  const pad = r + 10;
  const span = Math.max(1, W - 2 * pad);
  const clear = 2 * r + 4;
  const byLevel = new Map<number, number[]>();
  for (const n of nodes)
    byLevel.set(n.y, [...(byLevel.get(n.y) ?? []), n.x * span]);
  let need = r + 6;
  for (const [d, xs] of byLevel)
    for (const k of [1, 2]) {
      const next = byLevel.get(d + k);
      if (!next) continue;
      for (const a of xs)
        for (const b of next) {
          const dx = Math.abs(a - b);
          if (dx < clear)
            need = Math.max(need, Math.sqrt(clear ** 2 - dx ** 2) / k);
        }
    }
  return Math.ceil(need);
}

/** Skutečná velikost písma vrcholu (px), když se kresba musí zmenšit do volného místa. */
export function effectiveFont(
  L: Pick<TreeLayout, "W" | "H" | "font">,
  availW: number,
  availH: number,
): number {
  return L.font * Math.min(1, availW / L.W, availH / L.H);
}

/** Hloubka stromu (nejvyšší y). */
export function treeDepth(nodes: readonly TNode[]): number {
  return nodes.reduce((m, n) => Math.max(m, n.y), 0);
}

/** Rozměry stromu – čistá funkce (testy v TreeView.test.ts). */
export function treeLayout(
  nodes: TNode[],
  measured: number,
  o: {
    levelHeight?: number;
    radius?: number;
    minHeight?: number;
    /**
     * když se strom nevejde do změřené šířky, zúžit vrcholy (až na tento poloměr) a mezery mezi nimi,
     * místo aby CSS zmenšilo celou kresbu i s písmem (halda, intervalový strom, hluboké stromy)
     */
    minRadius?: number;
  } = {},
): TreeLayout {
  const levelHeight = o.levelHeight ?? 72;
  const maxLen = nodes.reduce((m, n) => Math.max(m, [...n.label].length), 1);
  // poloměr podle nejdelšího popisku (tučná 14px číslice ≈ 8,7 px), nejvýš 30; ještě delší popisek zmenší písmo
  let r = Math.max(o.radius ?? 20, Math.min(30, Math.round(maxLen * 4.3 + 5)));
  const font = maxLen <= 5 ? 14 : Math.max(9, Math.floor((14 * 5.5) / maxLen));
  const gap = minLevelGap(nodes);
  let nodeGap = NODE_GAP;
  const needFor = (rr: number, g: number) =>
    Number.isFinite(gap)
      ? (2 * rr + g) / gap + 2 * (rr + 10)
      : 2 * (rr + 10) + 2 * rr;
  if (
    o.minRadius !== undefined &&
    Number.isFinite(measured) &&
    measured > 0 &&
    needFor(r, NODE_GAP) > measured
  ) {
    // menší mezera (2 px) a poloměr, který se do šířky vejde – ne však pod popisek ani pod minRadius
    nodeGap = 2;
    const label = Math.ceil(maxLen * 4.3 + 3);
    const fit = Number.isFinite(gap)
      ? Math.floor((measured - 20 - nodeGap / gap) / (2 / gap + 2))
      : r;
    r = Math.max(o.minRadius, label, Math.min(r, fit));
  }
  const pad = r + 10;
  const need = needFor(r, nodeGap);
  const W = fitWidth(measured, Math.min(MAX_TREE_W, Math.ceil(need)));
  const depth = nodes.reduce((m, n) => Math.max(m, n.y), 0);
  const H = Math.max(
    o.minHeight ?? 120,
    (depth + 1) * levelHeight + 20,
    30 + depth * levelHeight + r + 22,
  );
  return {
    W,
    H,
    r,
    font,
    px: (n) => pad + n.x * (W - 2 * pad),
    py: (n) => 30 + n.y * levelHeight,
  };
}

/** výška vrcholu (a,b)-stromu (px) */
export const MNODE_H = 28;
/** nejmenší mezera mezi sousedními vrcholy téže hladiny (px) */
const MNODE_GAP = 10;

export interface MultiTreeLayout {
  W: number;
  height: number;
  cell: number;
  /** šířka vrcholu v px */
  nodeW: (n: MNode) => number;
  px: (n: MNode) => number;
  py: (n: MNode) => number;
}

export interface MultiTreeOptions {
  /**
   * Režim pro plátno na jednu obrazovku ((a,b)-strom): když se strom nevejde do změřené šířky, zúží se
   * buňky klíčů (až na šířku klíče) a mezery mezi vrcholy, místo aby CSS zmenšilo kresbu i s písmem;
   * okraje podle krajních vrcholů (ne podle nejširšího – kořene); výška bez prázdné hladiny pod listy,
   * takže se vzdálenost hladin dá roztáhnout (multiFitLevelHeight) až k výšce plátna.
   */
  fit?: boolean;
}

/** Rozměry (a,b)-stromu – čistá funkce: buňka podle nejdelšího klíče, šířka tak, aby se sousedé nepřekrývali. */
export function multiTreeLayout(
  nodes: MNode[],
  measured: number,
  levelHeight = 80,
  o: MultiTreeOptions = {},
): MultiTreeLayout {
  const maxLen = nodes.reduce(
    (m, n) => n.keys.reduce((k, s) => Math.max(k, [...s].length), m),
    1,
  );
  // tučné 13px číslice ≈ 8 px
  const cell = Math.max(30, Math.ceil(maxLen * 8 + 12));
  if (o.fit)
    return fitMultiTreeLayout(nodes, measured, levelHeight, maxLen, cell);
  const nodeW = (n: MNode) => Math.max(1, n.keys.length) * cell;
  const widest = nodes.reduce((m, n) => Math.max(m, nodeW(n)), cell);
  const pad = Math.max(20, widest / 2 + 6);
  // sousedé na hladině: (x_j − x_i) · (W − 2·pad) ≥ (w_i + w_j) / 2 + NODE_GAP
  let need = 2 * pad + widest;
  const levels = new Map<number, MNode[]>();
  for (const n of nodes) levels.set(n.y, [...(levels.get(n.y) ?? []), n]);
  for (const lv of levels.values()) {
    lv.sort((a, b) => a.x - b.x);
    for (let i = 1; i < lv.length; i++) {
      const dx = lv[i].x - lv[i - 1].x;
      if (dx > 1e-9)
        need = Math.max(
          need,
          ((nodeW(lv[i]) + nodeW(lv[i - 1])) / 2 + MNODE_GAP) / dx + 2 * pad,
        );
    }
  }
  const W = fitWidth(measured, Math.min(MAX_TREE_W, Math.ceil(need)));
  const depth = nodes.reduce((m, n) => Math.max(m, n.y), 0);
  return {
    W,
    height: Math.max(100, (depth + 1) * levelHeight + 20),
    cell,
    nodeW,
    px: (n) => pad + n.x * (W - 2 * pad),
    py: (n) => 20 + n.y * levelHeight,
  };
}

/** okraj kolem krajních vrcholů v režimu fit (px) */
const FIT_MARGIN = 4;
/** nejužší mezera mezi vrcholy téže hladiny v režimu fit (px) */
const FIT_MIN_GAP = 2;
/** šířka tučné 13px číslice v prohlížeči (Inter / Segoe UI: „88“ = 14,4 px) */
const FIT_CHAR_W = 7.2;
/** horní okraj nad kořenem a dolní pod listy (px) */
const FIT_TOP = 20;
const FIT_BOTTOM = 20;
/** místo pro drobný text pod vrcholem (sub, y = H + 13) */
const FIT_SUB = 14;

/**
 * Vodorovné rozložení pro buňku `cell` a mezeru `gap`: nejmenší rozpětí S (vzdálenost x = 0 a x = 1 v px),
 * při kterém se sousedé na hladině nepřekrývají, a potřebná šířka W(S) = okraj vlevo + S + okraj vpravo,
 * kde okraje dávají krajní vrcholy (px = left + x · S, každý vrchol aspoň FIT_MARGIN od kraje).
 */
function spanFor(nodes: readonly MNode[], cell: number, gap: number) {
  const nodeW = (n: MNode) => Math.max(1, n.keys.length) * cell;
  let minSpan = 0;
  const levels = new Map<number, MNode[]>();
  for (const n of nodes) levels.set(n.y, [...(levels.get(n.y) ?? []), n]);
  for (const lv of levels.values()) {
    lv.sort((a, b) => a.x - b.x);
    for (let i = 1; i < lv.length; i++) {
      const dx = lv[i].x - lv[i - 1].x;
      if (dx > 1e-9)
        minSpan = Math.max(
          minSpan,
          ((nodeW(lv[i]) + nodeW(lv[i - 1])) / 2 + gap) / dx,
        );
    }
  }
  /** okraj vlevo (left) a potřebná šířka pro rozpětí S; W(S) je neklesající v S */
  const extent = (S: number) => {
    let left = -Infinity;
    let right = -Infinity;
    for (const n of nodes) {
      const half = nodeW(n) / 2 + FIT_MARGIN;
      left = Math.max(left, half - n.x * S);
      right = Math.max(right, half + n.x * S);
    }
    return { left, width: left + right };
  };
  return { nodeW, minSpan, extent };
}

function fitMultiTreeLayout(
  nodes: MNode[],
  measured: number,
  levelHeight: number,
  maxLen: number,
  cell: number,
): MultiTreeLayout {
  const known = Number.isFinite(measured) && measured > 0;
  // nejužší buňka: klíč s okrajem ~2,5 px na každé straně (dvoumístný 20 px, trojmístný 27 px)
  const minCell = Math.min(cell, Math.ceil(maxLen * FIT_CHAR_W + 5));
  // buňka i mezera se zužují zároveň, dokud se strom nevejde (jinak nejužší a zbytek dorovná CSS)
  const STEPS = 20;
  let pick = spanFor(nodes, minCell, FIT_MIN_GAP);
  let pickCell = minCell;
  for (let s = 0; s <= STEPS; s++) {
    const t = s / STEPS;
    const c = Math.round(cell - t * (cell - minCell));
    const g = Math.round(MNODE_GAP - t * (MNODE_GAP - FIT_MIN_GAP));
    const cand = spanFor(nodes, c, g);
    if (!known || cand.extent(cand.minSpan).width <= measured) {
      pick = cand;
      pickCell = c;
      break;
    }
  }
  const need = Math.ceil(pick.extent(pick.minSpan).width);
  const W = fitWidth(measured, Math.min(MAX_TREE_W, need));
  // největší rozpětí, které se do W vejde (W(S) neklesá → půlení intervalu)
  let lo = pick.minSpan;
  let hi = Math.max(lo, W);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pick.extent(mid).width <= W) lo = mid;
    else hi = mid;
  }
  const S = lo;
  const e = nodes.length ? pick.extent(S) : { left: W / 2, width: W };
  // zbytek šířky (jediný vrchol, zaokrouhlení) rozdělit na obě strany
  const left = e.left + Math.max(0, W - e.width) / 2;
  const depth = nodes.reduce((m, n) => Math.max(m, n.y), 0);
  const sub = nodes.some((n) => n.sub) ? FIT_SUB : 0;
  return {
    W,
    height: nodes.length
      ? Math.max(
          100,
          Math.ceil(FIT_TOP + depth * levelHeight + MNODE_H + sub + FIT_BOTTOM),
        )
      : 100,
    cell: pickCell,
    nodeW: pick.nodeW,
    px: (n) => left + n.x * S,
    py: (n) => FIT_TOP + n.y * levelHeight,
  };
}

/** Nejmenší a největší vzdálenost hladin (a,b)-stromu při přizpůsobení výšce plátna (px). */
const MULTI_MIN_LEVEL = MIN_LEVEL;
/** malý (a,b)-strom (obr. 8.7–8.10: dvě až tři hladiny) se smí roztáhnout víc než binární strom */
const multiMaxLevel = (base: number) => Math.round(base * 2.5);

/**
 * Vzdálenost hladin (a,b)-stromu pro deltu z useCanvasFit: výška v režimu fit roste s `depth` mezerami
 * mezi hladinami (pod listy prázdná hladina není), takže se delta rozdělí mezi ně.
 */
export function multiFitLevelHeight(
  base: number,
  delta: number,
  depth: number,
): number {
  if (delta === 0 || depth === 0) return base;
  return stretch(
    base,
    delta / depth,
    Math.min(base, MULTI_MIN_LEVEL),
    multiMaxLevel(base),
  );
}

/** Meze delty pro (a,b)-strom dané hloubky (bez hloubky se výška nemění). */
export function multiLevelFitLimits(base: number, depth: number): FitLimits {
  if (depth === 0) return { shrink: 0, grow: 0 };
  return {
    shrink: depth * Math.max(0, base - MULTI_MIN_LEVEL),
    grow: depth * (multiMaxLevel(base) - base),
  };
}

/** Souřadnice pro strom uložený v poli po hladinách (halda, intervalový strom), index 0-based. */
export function completeLayout(i: number): { x: number; y: number } {
  const d = Math.floor(Math.log2(i + 1));
  const pos = i - (2 ** d - 1);
  return { x: (pos + 0.5) / 2 ** d, y: d };
}
