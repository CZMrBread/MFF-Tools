/**
 * Data náhledů toků na úvodní stránce – knižní obrázky přímo z flow.fixtures.ts, bez běhu algoritmu (logika
 * toků tak zůstane v líném chunku stránky). Že náhled vypadá přesně jako modul v daném kroku, hlídá
 * flowPreview.test.ts.
 */
import { fmtNum, type Graph, type GraphState } from "../graphs/graph";
import { FIG_14_5, NET_14_7 } from "./flow.fixtures";
import { flowPresetById, presetNet } from "./flowPresets";

const label = (g: Graph, v: number) => g.nodes[v].label;
const key = (g: Graph, e: { u: number; v: number }) =>
  `${label(g, e.u)}>${label(g, e.v)}`;

/** Obr. 14.5: síť z obr. 14.2 s maximálním tokem 18, minimální řez A = {z, a, b, c} (tok f/c). */
export function ffPreviewData(): { graph: Graph; state: GraphState } {
  const graph = presetNet(flowPresetById("obr-14-2")!).graph;
  const flow: Readonly<Record<string, number>> = FIG_14_5.flow;
  const cut = new Set<string>(FIG_14_5.cutEdges);
  const A = new Set<string>(FIG_14_5.cutA);
  const state: GraphState = {
    nodeMarks: {},
    edgeMarks: {},
    nodeSub: {},
    vars: {},
    edgeText: {},
  };
  for (const n of graph.nodes) {
    const marks = [
      n.label === "z" || n.label === "s" ? "n-term" : "",
      A.has(n.label) ? "n-cut-a" : "",
    ].filter(Boolean);
    if (marks.length) state.nodeMarks[n.id] = marks.join(" ");
  }
  for (const e of graph.edges) {
    const f = flow[key(graph, e)] ?? 0;
    state.edgeText![e.id] = `${fmtNum(f)}/${fmtNum(e.w)}`;
    const c = cut.has(key(graph, e))
      ? "e-cut"
      : f > 0 && f === e.w
        ? "e-sat"
        : f > 0
          ? "e-flow"
          : "";
    if (c) state.edgeMarks[e.id] = c;
  }
  return { graph, state };
}

/**
 * Obr. 14.7 po ČištěníSítě ve fázi 1: ponechané hrany výrazné, šedivé a tečkované, smazané slepé uličky.
 * V malém náhledu bez popisků kapacit a bez obrysů vrstev – kroužky by se s nimi tlačily (UX-15).
 */
export function dinicPreviewData(): { graph: Graph; state: GraphState } {
  const book = presetNet(flowPresetById("obr-14-7")!).graph;
  const graph: Graph = { ...book, weighted: false };
  const gray = new Set<string>(NET_14_7.gray);
  const dotted = new Set<string>(NET_14_7.dotted);
  const state: GraphState = {
    nodeMarks: {},
    edgeMarks: {},
    nodeSub: {},
    vars: {},
    edgeText: {},
  };
  const gone = new Set<number>();
  for (const e of graph.edges) {
    const k = key(graph, e);
    if (gray.has(k)) state.edgeMarks[e.id] = "e-r-gray";
    else if (dotted.has(k)) {
      state.edgeMarks[e.id] = "e-r-dead";
      gone.add(e.v);
    } else state.edgeMarks[e.id] = "e-r-live";
  }
  for (const n of graph.nodes)
    if (gone.has(n.id)) state.nodeMarks[n.id] = "n-gone";
    else if (n.label === "z" || n.label === "s")
      state.nodeMarks[n.id] = "n-term";
  return { graph, state };
}
