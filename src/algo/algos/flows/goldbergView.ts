/**
 * Kresba kroků Goldbergova algoritmu bez Reactu (testy v goldbergView.test.ts):
 * - síť „vlna / kapacita“ pro GraphEditor / GraphView – u vrcholu výška a přebytek („h 1 · +3“),
 * - kresba výšek (GoldbergHeightView): každý vrchol ve vlastním sloupci (pořadí podle kresby sítě), svisle
 *   jeho výška h. Rozsah hladin 0…H je pevný pro celý běh (heightMax), takže se kresba mezi kroky
 *   nepřeměřuje – vrchol při zvednutí jen poposkočí o hladinu výš.
 * - proměnné a legenda.
 * Třídy n-… / e-… sítě jsou z oddílu CSS „flows“ (+ n-excess z oddílu „goldberg“), gb-… z oddílu „goldberg“.
 */
import type { Step } from "../../core/steps";
import type { LegendItem } from "../../core/Visualizer";
import { cmpLabel, fmtNum, type GraphState } from "../graphs/graph";
import {
  lbl,
  matchingOf,
  residual,
  residualArcs,
  type FlowNet,
} from "./flowNet";
import type { GoldbergState } from "./goldberg";
import { flowStacked } from "./flowView";

/** Patří krok k této síti? (Počty hran a vrcholů – v průchodu renderu se síť může měnit dřív než běh.) */
export function goldbergStateFits(
  net: FlowNet,
  st: GoldbergState | undefined,
): st is GoldbergState {
  if (!st) return false;
  const n = net.graph.nodes.length;
  return (
    st.f.length === net.graph.edges.length &&
    st.h.length === n &&
    st.ex.length === n &&
    st.P.every((v) => v < n) &&
    (st.u === null || st.u < n)
  );
}

/** síť párování – hrany bez popisků (jako u FordFulkersona, UX-05) */
const isMatchingNet = (net: FlowNet) => matchingOf(net, []) !== null;

/** id hran sítě, jejichž tok převedení po oblouku změnilo (proti směru hrana vu, po směru uv) */
function pushedEdges(net: FlowNet, st: GoldbergState): number[] {
  if (!st.push) return [];
  const a = residualArcs(net.graph)[st.push.arc];
  if (!a) return [];
  return [a.fwd, a.back].filter((e): e is number => e !== null);
}

/**
 * Síť: „f/c“ u hran (e-cut / e-match na konci, e-changed při převedení, e-sat plná, e-flow s tokem),
 * vrcholy: zdroj a stok n-term, zpracovávaný u n-current, s přebytkem n-excess, na konci A řezu n-cut-a.
 */
export function goldbergNetState(
  net: FlowNet,
  step: GoldbergState | undefined,
): GraphState {
  const g = net.graph;
  const st = goldbergStateFits(net, step) ? step : undefined;
  const plain = isMatchingNet(net);
  const out: GraphState = {
    nodeMarks: {},
    edgeMarks: {},
    nodeSub: {},
    vars: {},
    edgeText: {},
  };
  const add = (v: number, c: string) => {
    out.nodeMarks[v] = out.nodeMarks[v] ? `${out.nodeMarks[v]} ${c}` : c;
  };
  add(net.z, "n-term");
  add(net.s, "n-term");
  if (!st) {
    for (const e of g.edges)
      out.edgeText![e.id] = plain ? "" : `0/${fmtNum(e.w)}`;
    return out;
  }
  for (const nd of g.nodes) {
    const v = nd.id;
    const x = st.ex[v];
    out.nodeSub[v] =
      v !== net.z && x > 0 ? `h ${st.h[v]} · +${fmtNum(x)}` : `h ${st.h[v]}`;
    if (v === net.z || v === net.s) continue;
    if (st.u === v) add(v, "n-current");
    else if (x > 0) add(v, "n-excess");
  }
  if (st.cut)
    for (const v of st.cut.A)
      if (!out.nodeMarks[v]?.includes("n-cut-a")) add(v, "n-cut-a");
  const changed = new Set(pushedEdges(net, st));
  const cut = new Set(st.cut?.edges ?? []);
  const match = new Set(st.matching ?? []);
  for (const e of g.edges) {
    const f = st.f[e.id] ?? 0;
    out.edgeText![e.id] = plain ? "" : `${fmtNum(f)}/${fmtNum(e.w)}`;
    let c = "";
    if (match.has(e.id)) c = "e-match";
    else if (cut.has(e.id)) c = "e-cut";
    else if (changed.has(e.id)) c = "e-changed";
    else if (f > 0 && f === e.w) c = "e-sat";
    else if (f > 0) c = "e-flow";
    if (c) out.edgeMarks[e.id] = c;
  }
  return out;
}

/* ------------------------------------------------------------------ kresba výšek */

/**
 * Kresby pod sebou (síť nad výškami) místo vedle sebe – podle poměru stran kresby sítě jako u FordFulkersona
 * a Dinica (flowView.flowStacked, F-04): široká obr. 14.7 pod sebou, síť párování nikdy. Počet vrcholů
 * nerozhoduje – široká kresba výšek se v panelu posouvá do strany.
 */
export function goldbergStacked(net: FlowNet): boolean {
  return flowStacked(net, "goldberg");
}

/** Kresba stránky: obě sítě, jen síť, nebo jen výšky. */
export type GoldbergViewMode = "obe" | "sit" | "vysky";

/**
 * Zobrazená kresba: volba uživatele (`chosen`), jinak automaticky. Široká síť (kresby pod sebou) v menším
 * okně na jednu obrazovku (1280 × 720, 1366 × 768) začíná jen výškami – dvě kresby pod sebou by byly
 * nečitelně malé (jako u Dinica); síť je o přepínač „Kresba“ vedle. Jinde obě.
 */
export function goldbergView(
  chosen: GoldbergViewMode | null,
  o: { stacked: boolean; cramped: boolean },
): GoldbergViewMode {
  if (chosen) return chosen;
  return o.stacked && o.cramped ? "vysky" : "obe";
}

/** Nejvyšší hladina kresby výšek pro celý běh: aspoň n (výška zdroje), jinak nejvyšší výška v krocích. */
export function heightMax(
  net: FlowNet,
  steps: readonly Step<GoldbergState>[],
): number {
  let m = net.graph.nodes.length;
  for (const s of steps)
    if (goldbergStateFits(net, s.state))
      for (const h of s.state.h) if (h > m) m = h;
  return m;
}

/** nejmenší vzdálenost sloupců v px (kroužky se nepřekrývají ani se sousedem o hladinu níž) */
export const HEIGHT_MIN_COL = 22;
/**
 * vzdálenost hladin v px, pod kterou se popisuje jen každá k-tá hladina (levelLabelEvery); kresba se do
 * nízkého panelu vejde i s menší (nikdy se neořezává, F-04)
 */
export const HEIGHT_MIN_LEVEL = 9;

/** Popisuje se každá k-tá hladina (1, 2, 5, 10, …), aby popisky (11 px) měly aspoň 12 px místa. */
export function levelLabelEvery(gap: number): number {
  for (const k of [1, 2, 5, 10, 20, 50]) if (k * gap >= 12) return k;
  return 100;
}
/** poloměr kroužku vrcholu v kresbě výšek (při husté kresbě menší) */
const R_MAX = 16;
const R_MIN = 10;
/** vpravo místo pro odznak přebytku posledního sloupce (s) – kresba párování se vejde do panelu (X-02) */
const MARGIN = { left: 44, right: 22, top: 30, bottom: 22 } as const;

export interface HeightLayout {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** poloměr kroužku */
  r: number;
  /** vrcholy v pořadí sloupců zleva */
  columns: number[];
  /** nejvyšší hladina */
  hMax: number;
  /** y hladiny k */
  levelY: (k: number) => number;
  /** x sloupce vrcholu v */
  colX: (v: number) => number;
  /** polohy vrcholů podle výšek kroku (bez kroku: z ve výšce n, ostatní 0) */
  at: (st: GoldbergState | undefined) => { x: number; y: number }[];
}

/**
 * Rozložení kresby výšek do w × h px. Sloupce v pořadí kresby sítě (x, pak y, pak název) – z vlevo, s vpravo
 * jako v knize. Při úzkém plátně se kresba nezúží pod HEIGHT_MIN_COL na sloupec (posouvá se do strany).
 * Na výšku se vejde vždy (F-04: dřív se pod HEIGHT_MIN_LEVEL na hladinu ořezávala) – hladiny se k sobě
 * přiblíží a popisuje se jen každá k-tá (levelLabelEvery).
 */
export function heightLayout(
  net: FlowNet,
  hMax: number,
  w: number,
  h: number,
): HeightLayout {
  const g = net.graph;
  const n = g.nodes.length;
  const columns = g.nodes
    .map((nd) => nd.id)
    .sort((a, b) => {
      const p = g.nodes[a];
      const q = g.nodes[b];
      return p.x - q.x || p.y - q.y || cmpLabel(p.label, q.label);
    });
  const { left, right, top, bottom } = MARGIN;
  const span = Math.max(1, n - 1);
  // poloměr podle sloupce: ~0,42 sloupce, v úzkém sloupci až (sloupec − 1,5) / 2 (do 11 px) – kroužky sousedů
  // ve stejné výšce se nedotknou; šířka sloupce se dopočítá s tímto poloměrem (krajní kroužky)
  const rFor = (c: number) =>
    Math.max(
      R_MIN,
      Math.min(R_MAX, Math.max(c * 0.42, Math.min((c - 1.5) / 2, 11))),
    );
  let col = Math.max(HEIGHT_MIN_COL, (w - left - right - 2 * R_MAX) / span);
  for (let i = 0; i < 12; i++)
    col = Math.max(HEIGHT_MIN_COL, (w - left - right - 2 * rFor(col)) / span);
  const r = rFor(col);
  // šířka sloupce přesně k poloměru – kresba nepřesáhne w
  col = Math.max(HEIGHT_MIN_COL, (w - left - right - 2 * r) / span);
  const width =
    n > 1
      ? left + right + 2 * r + col * span
      : Math.max(w, left + right + 2 * r);
  const levels = Math.max(1, hMax);
  const gap = Math.max(0, h - top - bottom) / levels;
  const height = top + bottom + gap * levels;
  const colOf = new Map(columns.map((v, i) => [v, i]));
  const colX = (v: number) =>
    n > 1 ? left + r + col * (colOf.get(v) ?? 0) : width / 2;
  const levelY = (k: number) => top + (levels - k) * gap;
  const at = (st: GoldbergState | undefined) =>
    g.nodes.map((nd) => ({
      x: colX(nd.id),
      y: levelY(
        goldbergStateFits(net, st) ? st.h[nd.id] : nd.id === net.z ? n : 0,
      ),
    }));
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    r,
    columns,
    hMax: levels,
    levelY,
    colX,
    at,
  };
}

export interface HeightArc {
  /** id oblouku sítě rezerv */
  arc: number;
  u: number;
  v: number;
  /** gb-down = rezerva dolů (seznam L(u)), gb-push = právě převedeno */
  cls: "gb-down" | "gb-push";
  /** „+δ“ u převedení */
  label: string | null;
}

/**
 * Oblouky kresby výšek: s kladnou rezervou z vyššího vrcholu do nižšího (podle invariantu S vždy o 1 –
 * seznamy L(u) z implementace, str. 373) a převedení tohoto kroku (i když rezervu právě vyčerpalo).
 */
export function heightArcs(
  net: FlowNet,
  step: GoldbergState | undefined,
): HeightArc[] {
  if (!goldbergStateFits(net, step)) return [];
  const st = step;
  const g = net.graph;
  const out: HeightArc[] = [];
  for (const a of residualArcs(g)) {
    if (st.push?.arc === a.id) {
      out.push({
        arc: a.id,
        u: a.u,
        v: a.v,
        cls: "gb-push",
        label: `+${fmtNum(st.push.delta)}`,
      });
      continue;
    }
    if (st.h[a.u] > st.h[a.v] && residual(g, st.f, a) > 0)
      out.push({ arc: a.id, u: a.u, v: a.v, cls: "gb-down", label: null });
  }
  return out;
}

/** Přístupný název vrcholu kresby výšek („a: výška 1, přebytek 3“). */
export function heightNodeName(
  net: FlowNet,
  step: GoldbergState | undefined,
  v: number,
): string {
  const L = lbl(net.graph, v);
  const role = v === net.z ? " (zdroj)" : v === net.s ? " (stok)" : "";
  if (!goldbergStateFits(net, step)) return `${L}${role}`;
  const h = `výška ${step.h[v]}`;
  if (v === net.z) return `${L}${role}: ${h}`;
  if (v === net.s) return `${L}${role}: ${h}, přitéká ${fmtNum(step.ex[v])}`;
  return `${L}${role}: ${h}, přebytek ${fmtNum(step.ex[v])}`;
}

/* ------------------------------------------------------------------ proměnné a legenda */

/** Proměnné kroku pro VarsView (čísla přes fmtNum – desetinná čárka). */
export function goldbergVars(
  net: FlowNet,
  step: GoldbergState | undefined,
): Record<string, string> {
  if (!goldbergStateFits(net, step)) return {};
  const st = step;
  const g = net.graph;
  const v: Record<string, string> = { "|f|": fmtNum(st.value) };
  if (st.u !== null) v["u"] = lbl(g, st.u);
  if (st.push) v["δ"] = fmtNum(st.push.delta);
  v["P"] = st.P.length ? `(${st.P.map((x) => lbl(g, x)).join(", ")})` : "∅";
  if (st.H !== null) v["H"] = String(st.H);
  v["převedení"] = String(st.pushes);
  v["zvednutí"] = String(st.lifts);
  return v;
}

const LEGEND: (LegendItem & { marks: string[] })[] = [
  {
    cls: "sw-gb-current",
    label: "zpracovávaný vrchol u",
    marks: ["n-current"],
  },
  {
    cls: "sw-gb-excess",
    label: "vrchol s přebytkem (v seznamu P), +x = přebytek",
    marks: ["n-excess"],
  },
  {
    cls: "sw-gb-down",
    label: "výšky: hrana s rezervou dolů (lze po ní převádět)",
    shape: "line",
    marks: ["gb-down"],
  },
  {
    cls: "sw-gb-push",
    label: "převedení přebytku po hraně (+δ)",
    shape: "line",
    marks: ["gb-push", "e-changed"],
  },
  {
    cls: "sw-gb-lift",
    label: "zvednutí vrcholu o 1 (čárkovaně původní výška)",
    shape: "dashed",
    marks: ["gb-lift"],
  },
  {
    cls: "sw-flow-flow",
    label: "hrana s vlnou 0 < f < c",
    shape: "line",
    marks: ["e-flow"],
  },
  {
    cls: "sw-flow-sat",
    label: "plná hrana f = c",
    shape: "line",
    marks: ["e-sat"],
  },
  {
    cls: "sw-flow-a",
    label: "A – vrcholy dosažitelné po nenasycených hranách",
    marks: ["n-cut-a"],
  },
  {
    cls: "sw-flow-cut",
    label: "minimální řez E(A, B)",
    shape: "line",
    marks: ["e-cut"],
  },
  {
    cls: "sw-flow-match",
    label: "párování (hrany L → R s tokem 1)",
    shape: "line",
    marks: ["e-match"],
  },
];

/** Legenda podle tříd, které se v krocích opravdu objeví (síť i kresba výšek). */
export function goldbergLegend(
  net: FlowNet,
  steps: readonly Step<GoldbergState>[],
): LegendItem[] {
  const used = new Set<string>();
  for (const step of steps) {
    const s = goldbergNetState(net, step.state);
    for (const m of [
      ...Object.values(s.nodeMarks),
      ...Object.values(s.edgeMarks),
    ])
      for (const c of m.split(" ")) used.add(c);
    for (const a of heightArcs(net, step.state)) used.add(a.cls);
    if (step.state.lift) used.add("gb-lift");
  }
  return LEGEND.filter((l) => l.marks.some((m) => used.has(m))).map(
    ({ cls, label, shape }) => (shape ? { cls, label, shape } : { cls, label }),
  );
}
