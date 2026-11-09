/*
 * Náhledy na úvodní stránce kreslí knižní obrázky z dat (bez běhu algoritmu – menší hlavní chunk); musí ale
 * vypadat přesně jako stránka modulu v daném kroku: obr. 14.5 = konec FordFulkersona s BFS na obr. 14.2,
 * obr. 14.7 = vrstevnatá síť po ČištěníSítě ve fázi 1 (v malém náhledu bez popisků kapacit a obrysů vrstev –
 * UX-15: jinak se kroužky a obrysy tlačí přes sebe).
 */
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import type { Graph, GraphState } from "../graphs/graph";
import { CLEAN_LINES, dinic } from "./dinic";
import { residualArcs } from "./flowNet";
import { defaultExample, exampleInput, netOf } from "./flowPageModel";
import { dinicPreviewData, ffPreviewData } from "./flowPreviewData";
import { layeredView, netState } from "./flowView";
import { fordFulkerson } from "./fordFulkerson";

/** třídy a popisky podle jmen vrcholů (id se mezi kresbami smí lišit) */
function byLabel(g: Graph, s: GraphState) {
  const l = (v: number) => g.nodes[v].label;
  return {
    nodes: Object.fromEntries(
      g.nodes.map((n) => [n.label, s.nodeMarks[n.id] ?? ""]),
    ),
    edges: Object.fromEntries(
      g.edges.map((e) => [
        `${l(e.u)}>${l(e.v)}`,
        `${s.edgeMarks[e.id] ?? ""}|${s.edgeText?.[e.id] ?? ""}`,
      ]),
    ),
  };
}

describe("náhledy toků = kresba modulu", () => {
  it("FordFulkerson: obr. 14.5 – maximální tok 18 a řez, jako konec běhu s BFS na obr. 14.2", () => {
    const net = netOf(exampleInput(defaultExample("ff")));
    const last = materialize(fordFulkerson(net, { search: "bfs" })).at(-1)!;
    const want = byLabel(net.graph, netState(net, last.state));
    const p = ffPreviewData();
    expect(byLabel(p.graph, p.state)).toEqual(want);
    expect(p.graph.aspect).toBe(net.graph.aspect);
  });

  it("Dinic: obr. 14.7 po vyčištění – stejné hrany, třídy a smazané vrcholy; bez popisků a obrysů vrstev", () => {
    const net = netOf(exampleInput(defaultExample("dinic")));
    const cleaned = materialize(dinic(net)).find(
      (s) => s.state.proc === "clean" && s.line === CLEAN_LINES.loop,
    )!;
    const v = layeredView(net, cleaned.state, residualArcs(net.graph));
    const p = dinicPreviewData();
    const marksOnly = (x: ReturnType<typeof byLabel>) => ({
      nodes: x.nodes,
      edges: Object.fromEntries(
        Object.entries(x.edges).map(([k, t]) => [k, t.split("|")[0]]),
      ),
    });
    expect(marksOnly(byLabel(p.graph, p.state))).toEqual(
      marksOnly(byLabel(v.graph, v.state)),
    );
    expect(Object.keys(p.state.edgeText ?? {})).toHaveLength(0);
    expect("groups" in p).toBe(false);
  });
});
