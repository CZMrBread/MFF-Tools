/**
 * Kresba kroků toků bez Reactu (testy ve flowView.test.ts): stav sítě „tok / kapacita“ (obr. 14.4 vlevo),
 * síť rezerv s dvojicemi oblouků (obr. 14.4 vpravo), vrstevnatá síť Dinica (obr. 14.7), proměnné a legenda.
 * Výsledkem jsou Graph + GraphState pro GraphView / GraphEditor (třídy n-…, e-… v oddílu CSS „flows“).
 */
import type { Step } from "../../core/steps";
import type { LegendItem } from "../../core/Visualizer";
import { cmpLabel, fmtNum, type Graph, type GraphState } from "../graphs/graph";
import type { NodeGroup } from "../graphs/layers";
import {
  lbl,
  matchingOf,
  residual,
  residualArcs,
  type Arc,
  type FlowNet,
} from "./flowNet";
import { flowPresetById, presetView } from "./flowPresets";
import type { FlowState } from "./flowState";
import { setText } from "./fordFulkerson";

export { FLOW_MARKERS } from "./flowMarkers";

const empty = (): GraphState => ({
  nodeMarks: {},
  edgeMarks: {},
  nodeSub: {},
  vars: {},
  edgeText: {},
});

/**
 * Patří krok k této síti? (Počty hran, vrcholů a oblouků.) Stránka může jeden průchod renderu kreslit novou
 * síť ještě s krokem předchozího běhu – pohledy ho pak berou jako „bez kroku“.
 */
export function stateFits(
  net: FlowNet,
  st: FlowState | undefined,
  arcs: readonly Arc[] = residualArcs(net.graph),
): st is FlowState {
  if (!st) return false;
  const n = net.graph.nodes.length;
  return (
    st.f.length === net.graph.edges.length &&
    (st.dist === null || st.dist.length === n) &&
    (st.r === null || st.r.length === arcs.length) &&
    (st.g === null || st.g.length === arcs.length) &&
    [...st.path, ...st.bottleneck].every((a) => a < arcs.length) &&
    [...st.seen, ...st.gone, ...(st.queue ?? [])].every((v) => v < n)
  );
}

/** Třídy vrcholů společné všem pohledům: zdroj a stok, vrcholy A minimálního řezu, smazané. */
function nodeMarks(net: FlowNet, st: FlowState | undefined, gone = false) {
  const marks: Record<number, string> = {};
  const add = (v: number, c: string) => {
    marks[v] = marks[v] ? `${marks[v]} ${c}` : c;
  };
  add(net.z, "n-term");
  add(net.s, "n-term");
  if (gone && st) for (const v of st.gone) marks[v] = "n-gone";
  if (st?.cut) for (const v of st.cut.A) add(v, "n-cut-a");
  else if (st?.path.length && st.seen.length && !gone)
    for (const v of st.seen) if (v !== net.z && v !== net.s) add(v, "n-seen");
  return marks;
}

/**
 * Síť: popisek „f/c“ u každé hrany; třídy e-cut (řez) / e-match (párování) na konci, e-changed (tok se právě
 * změnil), e-path / e-path-back (hrana na nalezené cestě po směru / proti směru), e-sat (f = c > 0),
 * e-flow (f > 0).
 */
/**
 * Síť párování (14.3, všechny kapacity 1): kresby bez popisků – tok i rezervu ukáže styl čáry jako v obr.
 * 14.6; s popisky „1/1“ by se husté hrany L–R nedaly přečíst (UX-05).
 */
export const isMatchingNet = (net: FlowNet): boolean =>
  matchingOf(net, []) !== null;

export function netState(
  net: FlowNet,
  step: FlowState | undefined,
): GraphState {
  const g = net.graph;
  const st = stateFits(net, step) ? step : undefined;
  const out = empty();
  out.nodeMarks = nodeMarks(net, st);
  const plain = isMatchingNet(net);
  if (!st) {
    for (const e of g.edges)
      out.edgeText![e.id] = plain ? "" : `0/${fmtNum(e.w)}`;
    return out;
  }
  const arcs = residualArcs(g);
  const fwdOnPath = new Set<number>();
  const backOnPath = new Set<number>();
  for (const id of st.path) {
    const a = arcs[id];
    if (!a) continue;
    // FordFulkerson: oblouk uv zvýší f(uv) a/nebo sníží f(vu); na kresbě sítě je to hrana, kterou jde tok
    // (v protisměru jen tehdy, když po ní teče – δ > 0)
    if (st.proc !== "forward" && a.back !== null && (st.f[a.back] ?? 0) > 0)
      backOnPath.add(a.back);
    else if (a.fwd !== null) fwdOnPath.add(a.fwd);
  }
  const changed = new Set(st.changed);
  const cut = new Set(st.cut?.edges ?? []);
  const match = new Set(st.matching ?? []);
  for (const e of g.edges) {
    const f = st.f[e.id] ?? 0;
    out.edgeText![e.id] = plain ? "" : `${fmtNum(f)}/${fmtNum(e.w)}`;
    let c = "";
    if (match.has(e.id)) c = "e-match";
    else if (cut.has(e.id)) c = "e-cut";
    else if (changed.has(e.id)) c = "e-changed";
    else if (backOnPath.has(e.id)) c = "e-path-back";
    else if (fwdOnPath.has(e.id)) c = "e-path";
    else if (f > 0 && f === e.w) c = "e-sat";
    else if (f > 0) c = "e-flow";
    if (c) out.edgeMarks[e.id] = c;
  }
  return out;
}

/** Síť rezerv jako graf: vrcholy sítě, hrany = oblouky (id oblouku), protisměrné se rozprostřou do oblouků. */
export function residualGraph(g: Graph, arcs: readonly Arc[]): Graph {
  return {
    directed: true,
    weighted: false,
    nodes: g.nodes,
    edges: arcs.map((a) => ({ id: a.id, u: a.u, v: a.v, w: 0 })),
    ...(g.aspect !== undefined ? { aspect: g.aspect } : {}),
  };
}

/** Síť rezerv (FordFulkerson): popisek r u každého oblouku, e-zero (r = 0), cesta e-path, ε e-min. */
export function residualState(
  net: FlowNet,
  step: FlowState | undefined,
  arcs: readonly Arc[],
): GraphState {
  const st = stateFits(net, step, arcs) ? step : undefined;
  const out = empty();
  out.nodeMarks = nodeMarks(net, st);
  const f = st?.f ?? net.graph.edges.map(() => 0);
  const forward = st?.proc === "forward";
  const path = new Set(st?.path ?? []);
  const min = new Set(st?.bottleneck ?? []);
  const plain = isMatchingNet(net);
  for (const a of arcs) {
    const r = residual(net.graph, f, a);
    if (!plain) out.edgeText![a.id] = fmtNum(r);
    let c = "";
    if (st?.cur === a.id) c = "e-changed";
    else if (path.has(a.id)) c = min.has(a.id) ? "e-path e-min" : "e-path";
    else if (r === 0) c = "e-zero";
    // varianta jen po směru oblouky proti směru hran nepoužívá – na kresbě jsou, ale algoritmus je nevidí
    else if (forward && a.fwd === null) c = "e-r-gray";
    if (c) out.edgeMarks[a.id] = c;
  }
  return out;
}

/** rozestup sloupců / řádků vrstevnaté kresby (jako obr. 14.7) */
const COL = 2;
const ROW = 0.9;
/**
 * síť párování: řádky partity řidčeji (F-05) – vrstvy L a R mají po 5 i víc vrcholech a vedle sítě by se
 * kroužky ve sloupci překrývaly
 */
const ROW_MATCH = 1.6;

/**
 * Vrstevnatá síť rezerv (Dinic): vrcholy ve sloupcích podle vzdálenosti od z (ve sloupci podle polohy v síti),
 * nedosažitelné v posledním sloupci; hrany = oblouky sítě R (r > 0 na začátku fáze). Popisek r, během
 * blokujícího toku „g/r“; smazané hrany bez popisku (e-r-gray šedivé, e-r-dead tečkované, e-r-sat nasycené).
 */
export function layeredView(
  net: FlowNet,
  step: FlowState | undefined,
  arcs: readonly Arc[],
): { graph: Graph; state: GraphState; groups: NodeGroup[] } {
  const g = net.graph;
  const st = stateFits(net, step, arcs) ? step : undefined;
  const f = st?.f ?? g.edges.map(() => 0);
  const r = st?.r ?? arcs.map((a) => residual(g, f, a));
  const fate: Record<number, string> = st?.r
    ? st.fate
    : Object.fromEntries(
        arcs.filter((a) => r[a.id] > 0).map((a) => [a.id, "live"]),
      );
  const dist = st?.dist ?? bfsDist(g, arcs, r, net.z);
  // sloupce
  const maxD = Math.max(0, ...dist.map((d) => d ?? 0));
  const unreachable = g.nodes.some((n) => dist[n.id] === null);
  const cols: number[][] = [];
  for (const n of g.nodes) {
    const c = dist[n.id] ?? maxD + 1;
    (cols[c] ??= []).push(n.id);
  }
  const C = Math.max(2, maxD + 1 + (unreachable ? 1 : 0));
  for (let i = 0; i < C; i++) cols[i] ??= [];
  for (const col of cols)
    col.sort(
      (a, b) =>
        g.nodes[a].y - g.nodes[b].y ||
        cmpLabel(g.nodes[a].label, g.nodes[b].label),
    );
  const rows = Math.max(2, ...cols.map((c) => c.length));
  const nodes = g.nodes.map((n) => ({ ...n }));
  cols.forEach((col, ci) =>
    col.forEach((v, i) => {
      nodes[v].x = ci / (C - 1);
      nodes[v].y = ((rows - col.length) / 2 + i) / (rows - 1);
    }),
  );
  const colOf = (v: number) => dist[v] ?? maxD + 1;
  const inR = arcs.filter((a) => fate[a.id] !== undefined);
  const plain = isMatchingNet(net);
  const graph: Graph = {
    directed: true,
    weighted: false,
    nodes,
    edges: inR.map((a, i) => {
      const span = Math.abs(colOf(a.u) - colOf(a.v));
      const rowGap = Math.abs(nodes[a.u].y - nodes[a.v].y) * (rows - 1);
      // uvnitř sloupce přes jiný vrchol a přes víc sloupců: oblouk, ať hrana nevede přes vrcholy
      const bend =
        span === 0 && rowGap > 1.01 ? 0.3 : span > 1 ? 0.12 : undefined;
      return {
        id: i,
        u: a.u,
        v: a.v,
        w: 0,
        ...(bend !== undefined ? { bend } : {}),
      };
    }),
    aspect: ((C - 1) * COL) / ((rows - 1) * (plain ? ROW_MATCH : ROW)),
  };
  const state = empty();
  state.nodeMarks = nodeMarks(net, st, true);
  const path = new Set(st?.path ?? []);
  const min = new Set(st?.bottleneck ?? []);
  const gf = st?.g ?? null;
  inR.forEach((a, i) => {
    const fa = fate[a.id];
    if (!plain && (fa === "live" || fa === "sat"))
      state.edgeText![i] =
        gf && st?.proc === "block"
          ? `${fmtNum(gf[a.id] ?? 0)}/${fmtNum(r[a.id])}`
          : fmtNum(r[a.id]);
    let c = "";
    if (path.has(a.id)) c = min.has(a.id) ? "e-path e-min" : "e-path";
    else if (fa === "gray") c = "e-r-gray";
    else if (fa === "dead") c = "e-r-dead";
    else if (fa === "sat") c = "e-r-sat";
    // po rozdělení do vrstev: ponechaná hrana R je výrazná (v obr. 14.7 černá) – od šedivých smazaných
    // se liší barvou, ne jen tloušťkou (UX-03)
    else if (st?.layered && (fa === "live" || fa === undefined)) c = "e-r-live";
    if (c) state.edgeMarks[i] = c;
  });
  const groups: NodeGroup[] = [];
  if (st?.layered) {
    cols.forEach((col, ci) => {
      if (!col.length) return;
      groups.push({
        label: ci <= maxD ? String(ci) : "nedosažitelné",
        nodes: col,
      });
    });
  }
  return { graph, state, groups };
}

function bfsDist(
  g: Graph,
  arcs: readonly Arc[],
  r: readonly number[],
  z: number,
): (number | null)[] {
  const dist: (number | null)[] = g.nodes.map(() => null);
  if (!g.nodes[z]) return dist;
  dist[z] = 0;
  const q = [z];
  while (q.length) {
    const u = q.shift()!;
    for (const a of arcs)
      if (a.u === u && r[a.id] > 0 && dist[a.v] === null) {
        dist[a.v] = dist[u]! + 1;
        q.push(a.v);
      }
  }
  return dist;
}

/** Proměnné kroku pro VarsView (čísla s desetinnou čárkou přes fmtNum). */
export function flowVars(
  net: FlowNet,
  step: FlowState | undefined,
): Record<string, string> {
  const st = stateFits(net, step) ? step : undefined;
  if (!st) return {};
  const v: Record<string, string> = {};
  const isDinic =
    st.proc === "dinic" || st.proc === "clean" || st.proc === "block";
  if (isDinic && st.phase > 0) {
    v["fáze"] = String(st.phase);
    if (st.ell !== null) v["ℓ"] = String(st.ell);
  }
  v["|f|"] = fmtNum(st.value);
  if (isDinic && st.g && st.proc === "block") {
    const arcs = residualArcs(net.graph);
    v["|g|"] = fmtNum(
      arcs
        .filter((a) => a.u === net.z)
        .reduce((s, a) => s + (st.g![a.id] ?? 0), 0),
    );
  }
  if (st.queue) v["F"] = st.queue.length ? setText(net.graph, st.queue) : "∅";
  if (st.eps !== null) v["ε"] = fmtNum(st.eps);
  if (st.delta !== null && st.proc === "ff") v["δ"] = fmtNum(st.delta);
  return v;
}

/** Položky legendy a třídy, které vysvětlují (legenda ukáže jen to, co v běhu nastane). */
const LEGEND: (LegendItem & { marks: string[] })[] = [
  {
    cls: "sw-flow-path",
    label: "cesta P ze z do s (nenasycená / v síti R)",
    shape: "line",
    marks: ["e-path"],
  },
  {
    cls: "sw-flow-back",
    label: "hrana na cestě proti směru – tok po ní ubereme (δ)",
    shape: "line-dashed",
    marks: ["e-path-back"],
  },
  {
    cls: "sw-flow-min",
    label: "nejmenší rezerva na cestě = ε",
    shape: "line",
    marks: ["e-min"],
  },
  {
    cls: "sw-flow-changed",
    label: "právě měněný tok / zpracovávaný oblouk",
    shape: "line",
    marks: ["e-changed"],
  },
  {
    cls: "sw-flow-flow",
    label: "hrana s tokem 0 < f < c",
    shape: "line",
    marks: ["e-flow"],
  },
  {
    cls: "sw-flow-sat",
    label: "plná hrana f = c (rezerva po směru 0)",
    shape: "line",
    marks: ["e-sat"],
  },
  {
    cls: "sw-flow-zero",
    label: "nasycený oblouk sítě rezerv (r = 0)",
    shape: "line-dashed",
    marks: ["e-zero"],
  },
  {
    cls: "sw-flow-live",
    label: "R: hrana vrstevnaté sítě – zůstává (v obr. 14.7 černá)",
    shape: "line",
    marks: ["e-r-live"],
  },
  {
    cls: "sw-flow-gray",
    label:
      "R: hrana dozadu, uvnitř vrstvy nebo za s – smazána (šedivá, obr. 14.7)",
    shape: "line",
    marks: ["e-r-gray"],
  },
  {
    cls: "sw-flow-dead",
    label: "R: hrana do slepé uličky – smazána (tečkovaná, obr. 14.7)",
    shape: "line-dashed",
    marks: ["e-r-dead"],
  },
  {
    cls: "sw-flow-rsat",
    label: "R: nasycená blokujícím tokem (g = r) – smazána",
    shape: "line-dashed",
    marks: ["e-r-sat"],
  },
  {
    cls: "sw-flow-gone",
    label: "smazaný vrchol R (slepá ulička, za s)",
    shape: "dashed",
    marks: ["n-gone"],
  },
  {
    cls: "sw-flow-seen",
    label: "vrchol, kam došlo hledání cesty",
    marks: ["n-seen"],
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

/** Legenda modulu podle tříd, které se v krocích opravdu objeví (ve všech kreslených pohledech). */
export function flowLegend(
  net: FlowNet,
  steps: readonly Step<FlowState>[],
  kind: "ff" | "dinic",
): LegendItem[] {
  const used = new Set<string>();
  const arcs = residualArcs(net.graph);
  const collect = (s: GraphState) => {
    for (const m of [
      ...Object.values(s.nodeMarks),
      ...Object.values(s.edgeMarks),
    ])
      for (const c of m.split(" ")) used.add(c);
  };
  for (const step of steps) {
    collect(netState(net, step.state));
    collect(
      kind === "ff"
        ? residualState(net, step.state, arcs)
        : layeredView(net, step.state, arcs).state,
    );
  }
  return LEGEND.filter((l) => l.marks.some((m) => used.has(m))).map(
    ({ cls, label, shape }) => (shape ? { cls, label, shape } : { cls, label }),
  );
}

/** Krátký popis pro přístupný název kresby („Síť: 6 vrcholů, 8 hran, z → s“). */
export const netCaption = (net: FlowNet) =>
  `${net.graph.nodes.length} vrcholů, ${net.graph.edges.length} hran, zdroj ${lbl(net.graph, net.z)}, stok ${lbl(net.graph, net.s)}`;

/** nejmenší vzdálenost středů vrcholů v px, aby se kroužky (r = 18) i s okrajem nepřekrývaly */
const MIN_GAP_PX = 46;
/** okraj kresby kolem středů krajních vrcholů (kroužek, popisky) */
const SIDE_PX = 60;

/**
 * Šířka, pod kterou by se vrcholy kresby s pevným poměrem stran (knižní obrázek, vrstvy) překrývaly; null =
 * volná kresba (rozloží se do libovolné šířky). Na telefonu se širší kresba posouvá do strany.
 */
/**
 * Rozložení, ze kterého se počítá čitelná šířka (readableWidth): u příkladu z knihy jeho kresba – posunutý
 * vrchol ani odkaz s `xy=` šířku plátna nezmění (V-7); u vlastní sítě její kresba.
 */
export function readableBase(g: Graph, example: string | null): Graph {
  const p = flowPresetById(example);
  return p ? presetView(p) : g;
}

export function readableWidth(g: Graph): number | null {
  const a = g.aspect;
  if (a === undefined || g.nodes.length < 2) return null;
  let dmin = Infinity;
  for (let i = 0; i < g.nodes.length; i++)
    for (let j = i + 1; j < g.nodes.length; j++) {
      const p = g.nodes[i];
      const q = g.nodes[j];
      const d = Math.hypot((p.x - q.x) * a, p.y - q.y);
      if (d > 1e-9) dmin = Math.min(dmin, d);
    }
  if (!Number.isFinite(dmin)) return null;
  // výška obdélníku středů H (jednotka y) → šířka H · a; d jednotek = d · H px
  return Math.ceil((MIN_GAP_PX / dmin) * a + SIDE_PX);
}

/* ------------------------------------------------------------------ rozložení stránky */

/**
 * Meze poměru stran sítě párování na plátně (GraphView `fitAspect`, R2): kresba z | L | R | s vyplní panel –
 * vedle druhé kresby se řádky roztáhnou do výšky, v „jen síť“ sloupce do šířky.
 */
export const MATCH_FIT_ASPECT = [0.6, 3] as const;

/**
 * Telefon (stránka se posouvá): široká kresba (obr. 14.7), která by se do šířky panelu nevešla čitelně, se
 * místo vodorovného posunu smí na výšku roztáhnout až 1/0,55× (X-09) – v editoru se na ní kreslí bez
 * posouvání uvnitř panelu. Volná kresba (bez poměru stran) se nemění.
 */
export const phoneFitAspect = (
  a: number | undefined,
): readonly [number, number] | undefined =>
  a === undefined ? undefined : [Math.round(a * 0.55 * 1e4) / 1e4, a];

/**
 * Meze poměru stran vrstevnaté sítě R párování: dlouhý řetěz vrstev (konec běhu, 7–8 sloupců) se smí
 * na výšku roztáhnout až 2,5× – řádky mají místo, sloupce zůstanou přes celou šířku (X-04).
 */
export const layeredFitAspect = (a: number): readonly [number, number] => [
  Math.round((a / 2.5) * 1e4) / 1e4,
  a,
];

/**
 * Poměr stran kresby (šířka : výška), od kterého jdou kresby pod sebe (F-04): vedle sebe by měla každá jen
 * půl šířky plátna a široká kresba by byla nízká a nečitelná (obr. 14.7 má ~3,7).
 */
export const STACK_ASPECT = 2.6;

/** Modul toků (stránka): FordFulkerson, Dinic, Goldberg. */
export type FlowPageKind = "ff" | "dinic" | "goldberg";

/**
 * Kresby pod sebou místo vedle sebe – jednotně ve všech třech modulech podle poměru stran: síť s pevnou
 * kresbou s poměrem ≥ STACK_ASPECT (obr. 14.7), u Dinica i vrstevnatá síť R nulového toku (obr. 14.2 má
 * vrstvy z | a b | c d | s, poměr ~6,7). Síť párování nikdy – dva sloupce L a R se vejdou vedle druhé
 * kresby (matchingAspect), pod sebou by měly řádky polovic místa. Počet vrcholů nerozhoduje.
 */
export function flowStacked(net: FlowNet, kind: FlowPageKind): boolean {
  if (isMatchingNet(net)) return false;
  if ((net.graph.aspect ?? 0) >= STACK_ASPECT) return true;
  if (kind !== "dinic" || net.graph.nodes.length < 2) return false;
  const lay = layeredView(net, undefined, residualArcs(net.graph));
  return (lay.graph.aspect ?? 0) >= STACK_ASPECT;
}

/**
 * Výchozí kresba („Kresba“, dokud ji uživatel nezvolí): „druha“ = jen síť rezerv / vrstevnatá R / výšky.
 * - Síť párování: FordFulkerson jen síť (síť rezerv se 44 oblouky obr. 14.6 by byla změť, UX-05), Dinic
 *   a Goldberg obě vedle sebe – vrstevnatá síť i výšky párování jsou přehledné a párování je vidět v síti
 *   (F-06).
 * - Široká síť (kresby pod sebou) v menším okně na jednu obrazovku: Dinic a Goldberg jen druhou kresbu
 *   (dvě kresby obr. 14.7 pod sebou by byly nízké), síť je o přepínač vedle. FordFulkerson obě.
 * - Jinak obě.
 */
export function autoFlowView(o: {
  kind: FlowPageKind;
  matching: boolean;
  stacked: boolean;
  cramped: boolean;
}): "obe" | "sit" | "druha" {
  if (o.matching) return o.kind === "ff" ? "sit" : "obe";
  if (o.kind !== "ff" && o.stacked && o.cramped) return "druha";
  return "obe";
}
