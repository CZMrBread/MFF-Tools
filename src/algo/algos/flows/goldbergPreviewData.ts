/**
 * Data náhledu Goldbergova algoritmu na úvodní stránce: krok výchozího příkladu (síť z obr. 14.2) –
 * převedení 4 jednotek po hraně a→c z výšky 3 do výšky 2. Zapsané ručně, ať úvodní stránka nemusí
 * načítat logiku algoritmu; že jde přesně o krok modulu, hlídá goldbergPreview.test.ts.
 */
import { lbl, residualArcs, type FlowNet } from "./flowNet";
import { flowPresetById, presetNet } from "./flowPresets";
import type { GoldbergState } from "./goldberg";

/** vlna po hranách „u>v“, výšky a přebytky podle popisků */
const FLOW: Readonly<Record<string, number>> = {
  "z>a": 10,
  "z>b": 10,
  "a>c": 5,
  "a>d": 5,
  "b>c": 9,
  "b>d": 1,
  "c>s": 10,
  "d>s": 4,
};
const H: Readonly<Record<string, number>> = {
  z: 6,
  a: 3,
  b: 1,
  c: 2,
  d: 1,
  s: 0,
};
const EX: Readonly<Record<string, number>> = {
  z: -20,
  a: 0,
  b: 0,
  c: 4,
  d: 2,
  s: 14,
};

export function goldbergPreviewData(): {
  net: FlowNet;
  state: GoldbergState;
  hMax: number;
} {
  const graph = presetNet(flowPresetById("obr-14-2")!).graph;
  const id = (l: string) => graph.nodes.find((n) => n.label === l)!.id;
  const net: FlowNet = { graph, z: id("z"), s: id("s") };
  const arc = residualArcs(graph).find(
    (a) => lbl(graph, a.u) === "a" && lbl(graph, a.v) === "c",
  )!;
  const state: GoldbergState = {
    variant: "zakladni",
    f: graph.edges.map(
      (e) => FLOW[`${lbl(graph, e.u)}>${lbl(graph, e.v)}`] ?? 0,
    ),
    h: graph.nodes.map((n) => H[n.label] ?? 0),
    ex: graph.nodes.map((n) => EX[n.label] ?? 0),
    P: [id("d"), id("c")],
    u: id("a"),
    push: { arc: arc.id, delta: 4, saturating: false },
    lift: null,
    H: null,
    pushes: 9,
    satPushes: 4,
    lifts: 7,
    value: 14,
    cut: null,
    matching: null,
    done: false,
  };
  // výška kresby jako v celém běhu výchozího příkladu (nejvyšší výška 8)
  return { net, state, hMax: 8 };
}
