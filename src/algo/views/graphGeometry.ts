import type { Graph, GraphState } from "../algos/graphs/graph";
import { clampPoint, separateFrom, spanKeepingScale } from "../core/dragMath";

/* Čistá geometrie pro GraphView (testy v GraphView.test.ts). */

export interface P2 {
  x: number;
  y: number;
}

/** základní poloměr vrcholu (px) */
export const R = 18;
/** nejmenší šířka plátna grafu (px) – užší obal se posouvá vodorovně */
export const GRAPH_MIN_W = 520;
/** nejširší plátno – na širokém monitoru by se graf zbytečně roztáhl do nízkého pruhu */
export const GRAPH_MAX_W = 1200;
/** rozestup řídicích bodů sousedních násobných hran (px) */
const MULTI_SPACING = 44;
/** nejvýš tolik znaků popisku vrcholu se kreslí celých; delší se zkrátí na začátek…konec */
const LABEL_MAX = 8;

/** nejmenší šířka plátna kresby s pevnými souřadnicemi (knižní předvolby jsou malé – vejdou se na mobil) */
export const GRAPH_MIN_W_FIXED = 300;

/** Nejmenší šířka podle počtu vrcholů (60 vrcholů potřebuje víc místa než 8). */
export function graphMinWidth(nodeCount: number): number {
  return Math.max(
    GRAPH_MIN_W,
    Math.round(Math.sqrt(Math.max(1, nodeCount)) * 110),
  );
}

/**
 * Nejmenší šířka plátna grafu bez pevných souřadnic při změřené šířce obalu `measured` (0 = nezměřeno).
 * Malý graf (nejvýš tolik vrcholů, kolik se vejde do GRAPH_MIN_W) a graf při kreslení se vejdou do obalu
 * až po GRAPH_MIN_W_FIXED – na telefonu tak není pravá třetina mimo plátno a kreslit jde na celé ploše.
 * Velký graf (graphMinWidth > GRAPH_MIN_W) se mimo úpravy dál posouvá vodorovně.
 */
export function graphCanvasMinWidth(
  nodeCount: number,
  measured: number,
  opts: { editing?: boolean } = {},
): number {
  const base = graphMinWidth(nodeCount);
  if (!(Number.isFinite(measured) && measured > 0)) return base;
  if (!opts.editing && base > GRAPH_MIN_W) return base;
  return Math.round(Math.min(base, Math.max(GRAPH_MIN_W_FIXED, measured)));
}

/**
 * Zobrazený popisek vrcholu: do 8 znaků celý, delší jako začátek…konec („vrchol12“ → „vrch…l12“), aby
 * se vrcholy lišící se jen koncem (vrchol1, vrchol2) nesloučily. Poloměr a písmo rostou s délkou.
 */
export function nodeLabel(label: string): {
  text: string;
  r: number;
  font: number;
} {
  const chars = [...label];
  const text =
    chars.length > LABEL_MAX
      ? chars.slice(0, 4).join("") + "…" + chars.slice(-3).join("")
      : label;
  const len = [...text].length;
  const font = len <= 3 ? 13 : len <= 5 ? 12 : 11;
  // šířka tučného textu ≈ 0,62 · písmo na znak
  const r = Math.max(R, Math.min(32, Math.ceil((len * font * 0.62) / 2 + 5)));
  return { text, r, font };
}

/** Šířka štítku ceny hrany podle délky textu (2.75, 1000…). */
export function weightLabelWidth(text: string): number {
  return Math.max(22, text.length * 7 + 8);
}

/* ------------------------------------------------------------------ mapování souřadnic */

/** okraj kresby se zachovaným poměrem stran: kruh vrcholu, popisek pod ním a obtažení skupin s popiskem */
const PAD_X = R + 26;
const PAD_TOP = R + 26;
const PAD_BOTTOM = R + 30;

/** okraje kresby se zachovaným poměrem stran (px) */
export interface ViewportPads {
  x: number;
  top: number;
  bottom: number;
}
const BASE_PADS: ViewportPads = { x: PAD_X, top: PAD_TOP, bottom: PAD_BOTTOM };

/* ------------------------------------------------------------------ hustá kresba (toky) */

/** nejmenší zmenšení kroužků husté kresby: poloměr 18 · 0,62 ≈ 11 px (průměr 22 px, písmo ≥ 10 px) */
export const DENSE_K_MIN = 0.62;
/**
 * mezera mezi kroužky husté kresby (px): rozestup středů ≥ 2r + 10 (R2) – při menší se kroužky zmenší.
 * Puštěný vrchol smí blíž (separated, +6); zmenšení se drží ze stisku a kotvy, kresba se po puštění nemění.
 */
const DENSE_GAP = 10;
/** nejmenší šířka husté kresby s pevným poměrem stran (užší panel sítě párování vedle výšek, X-02) */
export const DENSE_MIN_W = 160;

/** nejmenší výška husté kresby v režimu jedné obrazovky (běžná 150 px) – nízký panel se nepřetéká */
export const DENSE_MIN_H = 96;

/** Popisek vrcholu zmenšené husté kresby: poloměr k · r, písmo úměrně, nejméně 10 px. */
export function scaledLabel(
  l: { text: string; r: number; font: number },
  k: number,
): { text: string; r: number; font: number } {
  if (k >= 1) return l;
  return {
    text: l.text,
    r: Math.round(l.r * k * 10) / 10,
    font: Math.max(10, Math.round(l.font * k + 1)),
  };
}

/**
 * Okraje husté kresby (GraphView `dense`, toky): kroužek zmenšený na k · R a kousek místa – popisky, které
 * přečnívají, zahrne viewBox (boxOverflow). Běžná kresba má okraje 44/44/48 px i pro popisky skupin.
 */
export const densePads = (k: number, sub = false): ViewportPads =>
  // popisky stavu u vrcholů (Goldberg: „h 6 · +3“) vedle či pod kroužkem: boční a spodní okraj jako běžná
  // kresba – jinak by popisek u kraje s každým krokem či přesunem měnil viewBox
  sub
    ? { x: PAD_X, top: Math.ceil(R * k) + 8, bottom: PAD_BOTTOM }
    : {
        x: Math.ceil(R * k) + 8,
        top: Math.ceil(R * k) + 8,
        bottom: Math.ceil(R * k) + 10,
      };

/**
 * Poměr stran kresby, který vyplní plátno W × Hmax (GraphView `fitAspect`, síť párování): poměr vnitřního
 * obdélníku (bez okrajů) v mezích [min, max]. Rozsah kresby `extent` (oblouky) se započítá.
 */
export function fitAspectFor(
  W: number,
  Hmax: number,
  range: readonly [number, number],
  pads: ViewportPads,
  extent?: DrawingExtent,
): number {
  const innerW = Math.max(1, W - 2 * pads.x);
  const innerH = Math.max(1, Hmax - pads.top - pads.bottom);
  const spanX = extent ? Math.max(1e-6, extent.maxX - extent.minX) : 1;
  const spanY = extent ? Math.max(1e-6, extent.maxY - extent.minY) : 1;
  const a = (innerW / innerH) * (spanY / spanX);
  return Math.round(Math.max(range[0], Math.min(range[1], a)) * 1e4) / 1e4;
}

/**
 * Zmenšení kroužků husté kresby k ∈ [DENSE_K_MIN, 1]: největší k, při kterém mají všechny dvojice vrcholů
 * (poloměry r · k) mezi sebou aspoň DENSE_GAP px. `posAt(k)` = středy vrcholů v px při okrajích pro k
 * (menší kroužky = menší okraje = kresba víc roztažená). Řídká kresba k = 1 (beze změny).
 */
export function denseNodeScale(
  radii: readonly number[],
  posAt: (k: number) => readonly P2[],
): number {
  const fits = (k: number) => {
    const pos = posAt(k);
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++) {
        const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
        if (d < 1e-6) continue;
        if (d < (radii[i] + radii[j]) * k + DENSE_GAP) return false;
      }
    return true;
  };
  if (radii.length < 2 || fits(1)) return 1;
  if (!fits(DENSE_K_MIN)) return DENSE_K_MIN;
  let lo = DENSE_K_MIN;
  let hi = 1;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 100) / 100;
}

export interface Viewport {
  /** výška plátna (px) */
  H: number;
  /** souřadnice grafu (0…1) → px */
  toPx: (x: number, y: number) => P2;
  /** px → souřadnice grafu (tah myší) */
  fromPx: (px: number, py: number) => P2;
  /**
   * Jen s `aspect`: největší rozpětí kresby (v souřadnicích grafu), které se při tomto měřítku ještě vejde
   * do plátna – meze tahu, po kterém se kresba nezmenší (keepScaleBox).
   */
  fit?: { maxSpanX: number; maxSpanY: number };
}

/** Rozsah kresby: obdélník v souřadnicích grafu (může přesahovat 0…1) a px navíc pro smyčky na každé straně. */
export interface DrawingExtent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  pad: { left: number; right: number; top: number; bottom: number };
}

/** kolik px smyčka přesahuje okraj běžného okraje kresby (kapka ≈ 70 px od středu vrcholu) */
const LOOP_PAD = 30;

/**
 * Rozsah kresby s pevnými souřadnicemi: vrcholy, vrcholy oblouků ohnutých hran (bend) a směry smyček –
 * aby se graphViewport vešla celá kresba, ne jen středy vrcholů.
 */
export function drawingExtent(graph: Graph): DrawingExtent {
  const aspect = graph.aspect && graph.aspect > 0 ? graph.aspect : 1;
  const ext: DrawingExtent = {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1,
    pad: { left: 0, right: 0, top: 0, bottom: 0 },
  };
  for (const n of graph.nodes) {
    ext.minX = Math.min(ext.minX, n.x);
    ext.maxX = Math.max(ext.maxX, n.x);
    ext.minY = Math.min(ext.minY, n.y);
    ext.maxY = Math.max(ext.maxY, n.y);
  }
  for (const e of graph.edges) {
    const a = graph.nodes[e.u];
    const b = graph.nodes[e.v];
    if (!a || !b) continue;
    if (e.u === e.v) {
      const deg = ((e.bend ?? -90) * Math.PI) / 180;
      const cx = Math.cos(deg);
      const cy = Math.sin(deg);
      if (cx < -0.3) ext.pad.left = LOOP_PAD;
      if (cx > 0.3) ext.pad.right = LOOP_PAD;
      if (cy < -0.3) ext.pad.top = LOOP_PAD;
      if (cy > 0.3) ext.pad.bottom = LOOP_PAD;
      continue;
    }
    if (e.bend === undefined) continue;
    // vrchol kvadratického oblouku = střed + normála × bend / 2 × délka (ve skutečném poměru stran)
    const dx = (b.x - a.x) * aspect;
    const dy = b.y - a.y;
    const off = e.bend / 2;
    const ax = (a.x + b.x) / 2 + (-dy * off) / aspect;
    const ay = (a.y + b.y) / 2 + dx * off;
    ext.minX = Math.min(ext.minX, ax);
    ext.maxX = Math.max(ext.maxX, ax);
    ext.minY = Math.min(ext.minY, ay);
    ext.maxY = Math.max(ext.maxY, ay);
  }
  return ext;
}

/**
 * Převod souřadnic grafu na plátno W × Hmax – čistá funkce.
 * - Bez `aspect` (silové rozložení) se osy natáhnou zvlášť: x·W, y·Hmax (jako dřív).
 * - S `aspect` (pevné souřadnice z knihy) se kresba zachová bez deformace: obdélník 0…1 × 0…1 s poměrem
 *   stran `aspect` se vepíše do plátna bez okrajů (letterbox), vodorovně na střed; výška plátna se zmenší
 *   na výšku kresby, ať pod širokou kresbou na úzkém displeji nezůstane prázdný pruh. `extent` (drawingExtent)
 *   rozšíří vepisovaný obdélník o oblouky a smyčky, které by jinak vybočily z plátna.
 */
export function graphViewport(
  W: number,
  Hmax: number,
  aspect?: number,
  extent?: DrawingExtent,
  pads: ViewportPads = BASE_PADS,
): Viewport {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) {
    return {
      H: Hmax,
      toPx: (x, y) => ({ x: x * W, y: y * Hmax }),
      fromPx: (px, py) => ({ x: px / W, y: py / Hmax }),
    };
  }
  const ex = extent ?? {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1,
    pad: { left: 0, right: 0, top: 0, bottom: 0 },
  };
  const padL = pads.x + ex.pad.left;
  const padR = pads.x + ex.pad.right;
  const padT = pads.top + ex.pad.top;
  const padB = pads.bottom + ex.pad.bottom;
  const spanX = Math.max(1e-6, (ex.maxX - ex.minX) * aspect);
  const spanY = Math.max(1e-6, ex.maxY - ex.minY);
  const innerW = Math.max(1, W - padL - padR);
  const innerHmax = Math.max(1, Hmax - padT - padB);
  // s = px na jednotku výšky kresby (osa x má v těchto jednotkách délku aspect)
  const s = Math.max(
    1,
    Math.floor(Math.min(innerW / spanX, innerHmax / spanY)),
  );
  const left = padL + (innerW - spanX * s) / 2 - ex.minX * aspect * s;
  const top = padT - ex.minY * s;
  return {
    H: Math.ceil(spanY * s + padT + padB),
    fit: { maxSpanX: innerW / (aspect * s), maxSpanY: innerHmax / s },
    toPx: (x, y) => ({ x: left + x * aspect * s, y: top + y * s }),
    fromPx: (px, py) => ({
      x: (px - left) / (aspect * s),
      y: (py - top) / s,
    }),
  };
}

/**
 * Meze tahu vrcholu `id` v px plátna `vp` (kresba s pevným poměrem stran): obdélník, kam smí střed
 * vrcholu, aby nový rozsah kresby (ostatní vrcholy a oblouky + on) nepřekročil to, co se při dnešním
 * měřítku vejde do plátna – po puštění se tak kresba nezmenší („miniaturní graf“). Okraj 1 px pohltí
 * zaokrouhlení souřadnic. Bez `aspect` (vp.fit chybí) null – měřítko na poloze nezávisí.
 */
export function keepScaleBox(
  graph: Graph,
  id: number,
  vp: Viewport,
): Box2 | null {
  if (!vp.fit) return null;
  // ostatní: tažený vrchol doprostřed čtverce 0…1 (ten rozsah zahrnuje vždy), bez jeho oblouků
  const others: Graph = {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, x: 0.5, y: 0.5 } : n)),
    edges: graph.edges.filter((e) => e.u !== id && e.v !== id),
  };
  const ex = drawingExtent(others);
  const xs = spanKeepingScale(ex.minX, ex.maxX, vp.fit.maxSpanX);
  const ys = spanKeepingScale(ex.minY, ex.maxY, vp.fit.maxSpanY);
  const a = vp.toPx(xs.lo, ys.lo);
  const b = vp.toPx(xs.hi, ys.hi);
  return { x1: a.x + 1, y1: a.y + 1, x2: b.x - 1, y2: b.y - 1 };
}

/**
 * Meze středu vrcholu `id` v px (tah i nový vrchol): viditelná kresba DW × vp.H s okrajem r + 6 a u kresby
 * s pevným poměrem stran ještě keepScaleBox – po puštění / přidání se kresba nezmenší. `id` nemusí v grafu
 * být (nový vrchol).
 */
export function vertexBox(
  graph: Graph,
  id: number,
  vp: Viewport,
  DW: number,
  r: number,
): Box2 {
  const m = r + 6;
  const visible = { x1: m, y1: m, x2: DW - m, y2: vp.H - m };
  const keep = keepScaleBox(graph, id, vp);
  if (!keep) return visible;
  return {
    x1: Math.max(visible.x1, keep.x1),
    y1: Math.max(visible.y1, keep.y1),
    x2: Math.min(visible.x2, keep.x2),
    y2: Math.min(visible.y2, keep.y2),
  };
}

/** o kolik px smí nový vrchol ležet od kliknutí, aby to ještě bylo „pod kurzorem“ */
const NEW_VERTEX_SLACK = 4;

/**
 * Kam položit nový vrchol po kliknutí do prázdna (G-05), v px plátna: bod kliknutí v mezích vertexBox
 * (i v okraji letterboxu – souřadnice grafu pak leží mimo 0…1) a od ostatních vrcholů aspoň součet
 * poloměrů + 6 px (separateFrom). `moved` = vrchol leží dál než pár px od kliknutí (editor to ohlásí).
 */
export function newVertexSpot(
  graph: Graph,
  vp: Viewport,
  DW: number,
  click: P2,
  radius: (id: number) => number,
  pos: readonly (P2 | undefined)[],
): { p: P2; moved: boolean } {
  const id = graph.nodes.length;
  const r = radius(id);
  const box = vertexBox(graph, id, vp, DW, r);
  const c = clampPoint(click, box);
  const p = separateFrom(
    c,
    pos.flatMap((q, j) => (q ? [{ p: q, d: r + radius(j) + 6 }] : [])),
    box,
  );
  return {
    p,
    moved: Math.hypot(p.x - click.x, p.y - click.y) > NEW_VERTEX_SLACK,
  };
}

export interface EdgeGeom {
  d: string;
  /** střed štítku ceny */
  lx: number;
  ly: number;
}

const unit = (from: P2, to: P2): P2 => {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return d < 1e-9
    ? { x: 0, y: -1 }
    : { x: (to.x - from.x) / d, y: (to.y - from.y) / d };
};
const f = (v: number) => Math.round(v * 10) / 10;

/**
 * Geometrie všech hran v px – čistá funkce.
 * - Násobné hrany mezi stejnou dvojicí (v neorientovaném grafu bez ohledu na pořadí u, v; v orientovaném i
 *   protisměrné) se rozprostřou do oblouků. Normála se počítá v kanonickém směru (menší id → větší id), jinak
 *   by se „a b“ a „b a“ s opačnými normálami zase sešly.
 * - Smyčka u–u je kapka nad vrcholem (pod ním, když je vrchol u horního okraje); další smyčky jsou větší.
 * - Hrana s `bend` (knižní předvolby) má tvar daný přesně jím: oblouk s řídicím bodem posunutým o bend × délka
 *   doprava ve směru u → v; smyčka s `bend` míří kapkou do směru bend° (0 = doprava, 180 = doleva).
 * - `toPx` mapuje souřadnice grafu na plátno (graphViewport); výchozí natáhne osy na W × H.
 */
/**
 * Dva popisky hran blíž než LABEL_GAP_X vodorovně a zároveň LABEL_GAP_Y svisle by se překrývaly (štítek
 * „10/10“ je ~36 × 16 px).
 */
export const LABEL_GAP_X = 38;
export const LABEL_GAP_Y = 18;
/** kam po rovné hraně posunout popisek, který by překryl jiný (podíl délky od u) */
const LABEL_T = [0.5, 0.34, 0.66, 0.26, 0.74] as const;

export function edgeGeometry(
  graph: Graph,
  W: number,
  H: number,
  radius: (id: number) => number = () => R,
  toPx: (x: number, y: number) => P2 = (x, y) => ({ x: x * W, y: y * H }),
): EdgeGeom[] {
  const geo = edgeShapes(graph, radius, toPx);
  spreadStraightLabels(graph, geo, toPx);
  return geo;
}

/**
 * Popisky rovných hran, které by ležely na jiném popisku (křížící se hrany v obr. 14.2 mají střed ve
 * stejném bodě), se posunou po své hraně na 1/3 či 2/3 – jako v knize (UX-04). Popisky oblouků a smyček
 * zůstávají; hrana bez kolize má popisek dál uprostřed.
 */
function spreadStraightLabels(
  graph: Graph,
  geo: EdgeGeom[],
  toPx: (x: number, y: number) => P2,
) {
  const clash = (x: number, y: number, other: EdgeGeom) =>
    Math.abs(x - other.lx) < LABEL_GAP_X &&
    Math.abs(y - other.ly) < LABEL_GAP_Y;
  const placed: EdgeGeom[] = [];
  graph.edges.forEach((e, i) => {
    const g = geo[i];
    if (!g) return;
    const straight = e.u !== e.v && g.d.includes(" L");
    if (straight && placed.some((o) => clash(g.lx, g.ly, o))) {
      const a = toPx(graph.nodes[e.u].x, graph.nodes[e.u].y);
      const b = toPx(graph.nodes[e.v].x, graph.nodes[e.v].y);
      const at = (t: number) => ({
        x: f(a.x + (b.x - a.x) * t),
        y: f(a.y + (b.y - a.y) * t),
      });
      const free = LABEL_T.map(at).find(
        (p) => !placed.some((o) => clash(p.x, p.y, o)),
      );
      if (free) {
        g.lx = free.x;
        g.ly = free.y;
      }
    }
    placed.push(g);
  });
}

function edgeShapes(
  graph: Graph,
  radius: (id: number) => number,
  toPx: (x: number, y: number) => P2,
): EdgeGeom[] {
  const pt = (id: number): P2 => toPx(graph.nodes[id].x, graph.nodes[id].y);
  const groupKey = (u: number, v: number) =>
    u < v ? `${u}:${v}` : `${v}:${u}`;
  const groups = new Map<string, number[]>();
  for (const e of graph.edges) {
    const k = groupKey(e.u, e.v);
    groups.set(k, [...(groups.get(k) ?? []), e.id]);
  }
  const arrowGap = graph.directed ? 2 : 0;

  return graph.edges.map((e) => {
    const group = groups.get(groupKey(e.u, e.v)) ?? [e.id];
    const k = group.indexOf(e.id);
    const a = pt(e.u);
    const ra = radius(e.u);

    if (e.u === e.v) {
      // smyčka: kapka z úhlu −90° ± 35° (nahoru) nebo ze zadaného směru, s každou další smyčkou větší
      const up = a.y > ra + 60 ? -1 : 1;
      const size = ra + 34 + k * 16;
      const base = e.bend ?? (up < 0 ? -90 : 90);
      const ang = (deg: number) => (base + deg) * (Math.PI / 180);
      const at = (deg: number, dist: number): P2 => ({
        x: a.x + Math.cos(ang(deg)) * dist,
        y: a.y + Math.sin(ang(deg)) * dist,
      });
      const s = at(-35, ra);
      const end = at(35, ra + arrowGap);
      const c1 = at(-40, size + 14);
      const c2 = at(40, size + 14);
      const lx = (s.x + 3 * c1.x + 3 * c2.x + end.x) / 8;
      const ly = (s.y + 3 * c1.y + 3 * c2.y + end.y) / 8;
      // štítek ceny ještě kousek dál od vrcholu, ve směru kapky
      const out = at(0, 4);
      return {
        d: `M${f(s.x)},${f(s.y)} C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(end.x)},${f(end.y)}`,
        lx: f(lx + out.x - a.x),
        ly: f(ly + out.y - a.y),
      };
    }

    const b = pt(e.v);
    const rb = radius(e.v);
    let c: P2;
    let offset: number;
    if (e.bend !== undefined) {
      // pevné ohnutí: normála doprava ve směru u → v, posun úměrný délce hrany
      const dir = unit(a, b);
      offset = e.bend * Math.hypot(b.x - a.x, b.y - a.y);
      c = {
        x: (a.x + b.x) / 2 - dir.y * offset,
        y: (a.y + b.y) / 2 + dir.x * offset,
      };
    } else {
      // kanonická normála (menší id → větší id); hrany s pevným ohnutím se do rozprostření nepočítají
      const [p, q] = e.u < e.v ? [a, b] : [b, a];
      const dir = unit(p, q);
      const free = group.filter((id) => graph.edges[id]?.bend === undefined);
      const kk = free.indexOf(e.id);
      offset = (kk - (free.length - 1) / 2) * MULTI_SPACING;
      c = {
        x: (a.x + b.x) / 2 - dir.y * offset,
        y: (a.y + b.y) / 2 + dir.x * offset,
      };
    }
    const curved = offset !== 0;
    // konce na okraji kružnic, ve směru k řídicímu bodu (u přímky k druhému vrcholu)
    const us = unit(a, curved ? c : b);
    const ue = unit(b, curved ? c : a);
    const s = { x: a.x + us.x * ra, y: a.y + us.y * ra };
    const end = {
      x: b.x + ue.x * (rb + arrowGap),
      y: b.y + ue.y * (rb + arrowGap),
    };
    if (!curved) {
      return {
        d: `M${f(s.x)},${f(s.y)} L${f(end.x)},${f(end.y)}`,
        lx: f((a.x + b.x) / 2),
        ly: f((a.y + b.y) / 2),
      };
    }
    return {
      d: `M${f(s.x)},${f(s.y)} Q${f(c.x)},${f(c.y)} ${f(end.x)},${f(end.y)}`,
      lx: f((s.x + 2 * c.x + end.x) / 4),
      ly: f((s.y + 2 * c.y + end.y) / 4),
    };
  });
}

/** cos 35° – hrana, která z vrcholu míří dolů do ±35°, by přeškrtla popisek pod ním */
const DOWN_COS = Math.cos((35 * Math.PI) / 180);
/**
 * Popisek vpravo (vlevo) leží o kus níž než střed vrcholu – přeškrtne ho hrana, která z vrcholu míří šikmo
 * dolů doprava (doleva) v úhlu 8° až 52° pod vodorovnou.
 */
const SIDE_MIN_SIN = Math.sin((8 * Math.PI) / 180);
const SIDE_MAX_SIN = Math.sin((52 * Math.PI) / 180);

export type SubSide = "below" | "right" | "left";
const SIDES: readonly SubSide[] = ["below", "right", "left"];

const blocks = (side: SubSide, d: P2) =>
  side === "below"
    ? d.y > DOWN_COS
    : d.y > SIDE_MIN_SIN &&
      d.y < SIDE_MAX_SIN &&
      (side === "right" ? d.x > 0 : d.x < 0);

/**
 * Kam ke každému vrcholu kreslit popisek stavu (D=1, 3/8, in/low…): pod vrchol; když by ho přeškrtla
 * hrana skoro svisle dolů (vrstvy BFS: 1→3), vpravo; když i tam vede hrana (šikmo dolů doprava – most g–k
 * na obr. 5.10), vlevo (UX-08). Když vadí hrana všude, strana s nejméně hranami (v tomto pořadí). Směr
 * ohnuté hrany se bere k jejímu řídicímu bodu (stejný jako v edgeGeometry). `pos` = středy vrcholů v px.
 */
export function subLabelSides(graph: Graph, pos: readonly P2[]): SubSide[] {
  const dirs: P2[][] = graph.nodes.map(() => []);
  for (const e of graph.edges) {
    if (e.u === e.v) continue;
    const a = pos[e.u];
    const b = pos[e.v];
    if (!a || !b) continue;
    let ca = b;
    let cb = a;
    if (e.bend !== undefined) {
      const dir = unit(a, b);
      const offset = e.bend * Math.hypot(b.x - a.x, b.y - a.y);
      const c = {
        x: (a.x + b.x) / 2 - dir.y * offset,
        y: (a.y + b.y) / 2 + dir.x * offset,
      };
      ca = c;
      cb = c;
    }
    dirs[e.u]?.push(unit(a, ca));
    dirs[e.v]?.push(unit(b, cb));
  }
  return dirs.map((ds) => {
    let best: SubSide = "below";
    let bestN = Infinity;
    for (const side of SIDES) {
      const n = ds.filter((d) => blocks(side, d)).length;
      if (n < bestN) {
        best = side;
        bestN = n;
      }
      if (n === 0) break;
    }
    return best;
  });
}

/** Posun vrcholu klávesnicí (šipky; se Shiftem větší krok), v mezích plátna. */
export function keyMove(
  key: string,
  shift: boolean,
  x: number,
  y: number,
  marginX = 0.03,
  marginY = 0.05,
): { x: number; y: number } | null {
  const step = shift ? 0.08 : 0.02;
  const d: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const m = d[key];
  if (!m) return null;
  const clamp = (v: number, lo: number) => Math.max(lo, Math.min(1 - lo, v));
  return { x: clamp(x + m[0], marginX), y: clamp(y + m[1], marginY) };
}

/* ------------------------------------------------------------------ popisky a viewBox */

/** Obdélník v px plátna. */
export interface Box2 {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** písmo popisku stavu pod vrcholem (.node-sub v index.css) */
export const SUB_FONT = 11;

/** Odhad šířky textu: tučné písmo ≈ 0,62 · písmo na znak. */
export function textWidth(text: string, font: number): number {
  return [...text].length * font * 0.62;
}

/**
 * Rámeček popisku stavu (D=1, 3/8, komp. X) u vrcholu se středem `p` a poloměrem `r` – stejné umístění
 * jako v GraphView: pod vrcholem na střed (účaří r + 14), nebo vpravo (od r + 4, účaří font/2 + 8).
 */
export function subLabelBox(
  p: P2,
  r: number,
  nodeFont: number,
  text: string,
  side: SubSide,
): Box2 {
  const w = textWidth(text, SUB_FONT) + 3;
  const base = side === "below" ? p.y + r + 14 : p.y + nodeFont / 2 + 8;
  const x1 =
    side === "right"
      ? p.x + r + 4
      : side === "left"
        ? p.x - r - 4 - w
        : p.x - w / 2;
  return {
    x1,
    x2: x1 + w,
    y1: base - SUB_FONT * 0.8 - 1.5,
    y2: base + SUB_FONT * 0.25 + 1.5,
  };
}

/** O kolik px přesahují rámečky plátno 0…W × 0…H na každé straně (0 = nepřesahují). */
export function boxOverflow(
  boxes: readonly Box2[],
  W: number,
  H: number,
): { left: number; right: number; top: number; bottom: number } {
  const o = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const b of boxes) {
    o.left = Math.max(o.left, -b.x1);
    o.top = Math.max(o.top, -b.y1);
    o.right = Math.max(o.right, b.x2 - W);
    o.bottom = Math.max(o.bottom, b.y2 - H);
  }
  return {
    left: Math.ceil(o.left),
    right: Math.ceil(o.right),
    top: Math.ceil(o.top),
    bottom: Math.ceil(o.bottom),
  };
}

/**
 * Nejdelší popisek stavu každého vrcholu za celý běh – GraphView podle něj rezervuje místo, takže se
 * viewBox (a s ním kresba) mezi kroky nemění.
 */
export function subLabelReserve(
  states: readonly GraphState[],
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const s of states)
    for (const [id, t] of Object.entries(s.nodeSub)) {
      const k = Number(id);
      if (t && [...t].length > [...(out[k] ?? "")].length) out[k] = t;
    }
  return out;
}
