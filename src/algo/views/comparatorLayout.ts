/**
 * Čistá geometrie komparátorové sítě pro ComparatorView (testy v comparatorLayout.test.ts).
 *
 * Dvě osy: osa vodičů (u) a osa času (t). Svisle (orient "v", jako obr. 15.6–15.10) jsou vodiče svislé
 * a čas teče dolů; vodorovně (orient "h") vodiče vedou zleva doprava. Podél osy času se střídají mezery
 * (žetony s hodnotami na vodičích) a vrstvy komparátorů: mezera 0 = vstup, pak vrstva 1, mezera 1, …
 * Komparátory jedné vrstvy, jejichž šipky by se překryly, jdou schodovitě do dalších řádků vrstvy
 * (jako separátor S₈ na obr. 15.10). Vrstva, kde začíná blok (Sₙ, Mₙ), má navíc proužek pro popisek.
 */
import type { FitLimits } from "../core/canvasFit";
import type { SortNet } from "../algos/parallel/sortNet";

export type Orient = "v" | "h";

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CompGeom {
  /** index komparátoru v net.comps */
  c: number;
  layer: number;
  /** řádek uvnitř vrstvy (schody překrývajících se šipek) */
  row: number;
  /** začátek šipky (vodič a – menší výstup) */
  x1: number;
  y1: number;
  /** hrot šipky (vodič b – větší výstup) */
  x2: number;
  y2: number;
}

export interface WireGeom {
  w: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  inLabel: Pt;
  outLabel: Pt;
}

export interface BlockGeom extends Rect {
  label: string;
  /** střed popisku */
  lx: number;
  ly: number;
}

export interface ComparatorLayout {
  orient: Orient;
  W: number;
  H: number;
  tokenR: number;
  wires: WireGeom[];
  comps: CompGeom[];
  blocks: BlockGeom[];
  /** tečkované čáry mezi průchody bublinky „jak je zapsaná“ (obr. 15.6) */
  separators: { x1: number; y1: number; x2: number; y2: number }[];
  /** střed žetonu na vodiči w v mezeře g */
  token: (w: number, g: number) => Pt;
  /** pás vrstvy přes celou šířku (zvýraznění právě počítané vrstvy) */
  layerBand: (l: number) => Rect;
}

export interface LayoutOpts {
  orient: Orient;
  /** dostupná šířka v px – užší rozestup vodičů (svisle), jinak výchozí */
  width?: number;
  /** o kolik px kresbu natáhnout (> 0) nebo zmáčknout (< 0) na výšku – canvasFit */
  delta?: number;
}

/* rozměry v px při 1 : 1 */
const V_COL = { small: 42, big: 36, min: 30 };
const H_ROW = { small: 30, big: 26, min: 20, max: 40 };
/** mezera se žetony a řádek komparátoru podél osy času */
const GAP = { v: 32, h: 38, min: 22 };
const ROW = { v: 17, h: 16, min: 10 };
const STRIP = { v: 15, h: 24 };
/** okraj podél osy času pro popisky x / y */
const END = { v: 18, h: 26 };
/** okraj podél osy vodičů */
const SIDE = { v: 6, h: 10 };
const MAX_GROW = 0.6;

/** Řádky uvnitř vrstvy: šipka jde do prvního řádku, kde předchozí šipka končí před jejím začátkem. */
function layerRows(net: SortNet): { rowOf: number[]; rows: number[] } {
  const rowOf = new Array<number>(net.comps.length).fill(0);
  const rows = net.layers.map((layer) => {
    const ends: number[] = [];
    for (const c of [...layer].sort(
      (x, y) => net.comps[x].a - net.comps[y].a,
    )) {
      const { a, b } = net.comps[c];
      let r = ends.findIndex((e) => e < a);
      if (r < 0) r = ends.push(b) - 1;
      else ends[r] = b;
      rowOf[c] = r;
    }
    return Math.max(1, ends.length);
  });
  return { rowOf, rows };
}

/** vrstvy, kde začíná nějaký blok (mají proužek pro popisek) */
const stripLayers = (net: SortNet) => new Set(net.blocks.map((b) => b.from));

/** Délka osy času bez okrajů při daném měřítku mezer a řádků. */
function timeLength(net: SortNet, orient: Orient, gap: number, row: number) {
  const { rows } = layerRows(net);
  const strips = stripLayers(net).size;
  return (
    (net.layers.length + 1) * gap +
    rows.reduce((s, r) => s + r, 0) * row +
    strips * STRIP[orient]
  );
}

const baseWireGap = (net: SortNet) => (net.n <= 8 ? H_ROW.small : H_ROW.big);

/** Meze přizpůsobení výšce plátna (canvasFit) pro danou síť a orientaci. */
export function comparatorFitLimits(net: SortNet, orient: Orient): FitLimits {
  if (orient === "h") {
    const base = baseWireGap(net);
    const k = Math.max(1, net.n - 1);
    return {
      shrink: k * (base - H_ROW.min),
      grow: k * (H_ROW.max - base),
    };
  }
  const base = timeLength(net, "v", GAP.v, ROW.v);
  const min = timeLength(net, "v", GAP.min, ROW.min);
  return {
    shrink: Math.max(0, base - min),
    grow: Math.round(base * MAX_GROW),
  };
}

export function comparatorLayout(
  net: SortNet,
  { orient, width, delta = 0 }: LayoutOpts,
): ComparatorLayout {
  const n = net.n;
  const v = orient === "v";
  const { rowOf, rows } = layerRows(net);
  const strips = stripLayers(net);

  // rozestup vodičů
  let wireGap: number;
  if (v) {
    const base = n <= 8 ? V_COL.small : V_COL.big;
    const fitW =
      width !== undefined && n > 1
        ? (width - 2 * (SIDE.v + base / 2)) / (n - 1)
        : base;
    wireGap = Math.max(V_COL.min, Math.min(base, Math.floor(fitW)));
  } else {
    const base = baseWireGap(net);
    // bez zaokrouhlení: výška roste s deltou přesně, canvasFit se usadí napoprvé (jinak by kmital
    // a každé přeskočení by zrušilo plynulý přesun žetonů)
    wireGap = Math.max(
      H_ROW.min,
      Math.min(H_ROW.max, base + delta / Math.max(1, n - 1)),
    );
  }

  // měřítko osy času (svisle ji natahuje canvasFit)
  let gap = v ? GAP.v : GAP.h;
  let row = v ? ROW.v : ROW.h;
  if (v && delta !== 0) {
    // mezery i řádky stejným měřítkem, proužky popisků bloků zůstávají – výška = základ + delta
    const fixed = strips.size * STRIP.v;
    const s = Math.max(0, 1 + delta / (timeLength(net, "v", gap, row) - fixed));
    gap = Math.max(GAP.min, GAP.v * s);
    row = Math.max(ROW.min, ROW.v * s);
  }
  if (!v && width !== undefined) {
    // vodorovně je osa času šířka: zúžit mezery a řádky do dostupné šířky (ne pod čitelné minimum)
    const fixed = 2 * END.h + strips.size * STRIP.h;
    const variable = timeLength(net, "h", gap, row) - strips.size * STRIP.h;
    const s = (width - fixed) / variable;
    if (s < 1) {
      gap = Math.max(GAP.min, Math.floor(GAP.h * s));
      row = Math.max(ROW.min, Math.floor(ROW.h * s));
    }
  }

  const tokenR = Math.max(
    7,
    Math.min(11, Math.floor(wireGap / 2) - 3, Math.floor(gap / 2) - 1),
  );
  // okraj nezávisí na velikosti žetonu (jinak by výška vodorovné kresby skákala s deltou)
  const side =
    SIDE[orient] + Math.max((v ? wireGap : baseWireGap(net)) / 2, 15);
  const end = END[orient];
  const U = 2 * side + (n - 1) * wireGap;
  const wireU = (w: number) => side + w * wireGap;

  // osa času: mezery a vrstvy za sebou
  const gapT: number[] = [];
  const bandFrom: number[] = [];
  const bandTo: number[] = [];
  const rowT: number[][] = [];
  let t = end;
  for (let l = 0; l <= net.layers.length; l++) {
    gapT.push(t + gap / 2);
    t += gap;
    if (l === net.layers.length) break;
    bandFrom.push(t);
    if (strips.has(l)) t += STRIP[orient];
    rowT.push(Array.from({ length: rows[l] }, (_, r) => t + (r + 0.5) * row));
    t += rows[l] * row;
    bandTo.push(t);
  }
  const T = t + end;

  const at = (u: number, tt: number): Pt =>
    v ? { x: u, y: tt } : { x: tt, y: u };
  const rect = (u0: number, u1: number, t0: number, t1: number): Rect =>
    v
      ? { x: u0, y: t0, w: u1 - u0, h: t1 - t0 }
      : { x: t0, y: u0, w: t1 - t0, h: u1 - u0 };

  const wires: WireGeom[] = Array.from({ length: n }, (_, w) => {
    const p1 = at(wireU(w), gapT[0] - tokenR - 2);
    const p2 = at(wireU(w), gapT[gapT.length - 1] + tokenR + 2);
    return {
      w,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      inLabel: at(wireU(w), end / 2 + (v ? 0 : 0)),
      outLabel: at(wireU(w), T - end / 2),
    };
  });

  const comps: CompGeom[] = [];
  net.layers.forEach((layer, l) => {
    for (const c of layer) {
      const { a, b } = net.comps[c];
      const tt = rowT[l][rowOf[c]];
      const p1 = at(wireU(a), tt);
      const p2 = at(wireU(b), tt);
      comps.push({
        c,
        layer: l,
        row: rowOf[c],
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
      });
    }
  });
  comps.sort((x, y) => x.c - y.c);

  const pad = wireGap * 0.42;
  const blocks: BlockGeom[] = net.blocks.map((b) => {
    const r = rect(
      wireU(b.lo) - pad,
      wireU(b.hi) + pad,
      bandFrom[b.from] - 1,
      bandTo[b.to] + 1,
    );
    const mid = (wireU(b.lo) + wireU(b.hi)) / 2;
    const lab = at(mid, bandFrom[b.from] + STRIP[orient] / 2);
    return { ...r, label: b.label, lx: lab.x, ly: lab.y };
  });

  const separators: ComparatorLayout["separators"] = [];
  if (net.seq)
    net.layers.forEach((layer, l) => {
      if (l === 0) return;
      const prev = net.comps[net.layers[l - 1][0]].pass;
      if (net.comps[layer[0]].pass === prev) return;
      const p1 = at(SIDE[orient], gapT[l]);
      const p2 = at(U - SIDE[orient], gapT[l]);
      separators.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    });

  const size = v ? { W: U, H: T } : { W: T, H: U };
  return {
    orient,
    ...size,
    tokenR,
    wires,
    comps,
    blocks,
    separators,
    token: (w, g) =>
      at(wireU(w), gapT[Math.max(0, Math.min(gapT.length - 1, g))]),
    layerBand: (l) => rect(0, U, bandFrom[l], bandTo[l]),
  };
}
