/**
 * GRAPH-01: všechny popisky kresby grafu (vrcholy, popisky stavu D=…, „komp. X“, „12/21“, ceny hran)
 * leží uvnitř viewBoxu – u všech předvoleb a všech grafových algoritmů, v každém kroku běhu.
 * Rámeček textu se odhaduje z délky (≈ 0,62 · písmo na znak, tučné písmo) a účaří.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GRAPH_ALGOS } from "../algos/graphs/algorithms";
import {
  loadPresetGraph,
  pageStartLabel,
  startIndex,
} from "../algos/graphs/graphPageModel";
import { PRESETS } from "../algos/graphs/presets";
import { materialize } from "../core/steps";
import { subLabelReserve } from "./graphGeometry";
import { GraphView } from "./GraphView";

interface Box {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  text: string;
}

const num = (attrs: string, name: string) => {
  const m = new RegExp(`(?:^|\\s)${name}="([-\\d.]+)"`).exec(attrs);
  return m ? Number(m[1]) : 0;
};

/** odhad rámečku <text> podle atributů (x, y, text-anchor, velikost písma ze stylu nebo třídy) */
function textBox(attrs: string, text: string, dx: number, dy: number): Box {
  const fsStyle = /font-size:\s*([\d.]+)/.exec(attrs);
  const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? "";
  const fs = fsStyle
    ? Number(fsStyle[1])
    : /node-label/.test(cls) || /graph-group-label/.test(cls)
      ? 13
      : 11;
  const w = [...text].length * fs * 0.62;
  const x = num(attrs, "x") + dx;
  const y = num(attrs, "y") + dy;
  const anchor = /text-anchor="(\w+)"/.exec(attrs)?.[1] ?? "start";
  const x1 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return { x1, x2: x1 + w, y1: y - fs * 0.8, y2: y + fs * 0.25, text };
}

/** všechny texty SVG s absolutní polohou (texty vrcholů jsou v <g> s translate) */
function textBoxes(html: string): Box[] {
  const out: Box[] = [];
  const nodeRe =
    /<g class="graph-node[^"]*"[^>]*style="transform:translate\(([-\d.]+)px,\s*([-\d.]+)px\)"[^>]*>(.*?)<\/g>/g;
  let rest = html;
  for (const m of html.matchAll(nodeRe)) {
    const dx = Number(m[1]);
    const dy = Number(m[2]);
    for (const t of m[3].matchAll(/<text([^>]*)>([^<]*)<\/text>/g))
      out.push(textBox(t[1], t[2], dx, dy));
    rest = rest.replace(m[0], "");
  }
  for (const t of rest.matchAll(/<text([^>]*)>([^<]*)<\/text>/g))
    out.push(textBox(t[1], t[2], 0, 0));
  return out;
}

function viewBox(html: string) {
  const m = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(html)!;
  const [x, y, w, h] = m.slice(1).map(Number);
  return { x1: x, y1: y, x2: x + w, y2: y + h };
}

describe("popisky kresby grafu leží uvnitř viewBoxu (GRAPH-01)", () => {
  for (const width of [900, 360]) {
    it(`všechny předvolby × 6 algoritmů, každý krok (šířka ${width} px)`, () => {
      const bad: string[] = [];
      for (const algo of GRAPH_ALGOS) {
        for (const p of PRESETS) {
          const { graph, layout } = loadPresetGraph(algo, p.id);
          const start = startIndex(
            graph,
            pageStartLabel(algo, graph, layout, null),
          );
          const steps = materialize(algo.run(graph, start));
          const reserve = subLabelReserve(steps.map((s) => s.state));
          for (let i = 0; i < steps.length; i++) {
            const html = renderToStaticMarkup(
              createElement(GraphView, {
                graph,
                state: steps[i].state,
                width,
                height: 440,
                subReserve: reserve,
              }),
            );
            const vb = viewBox(html);
            for (const b of textBoxes(html)) {
              const tol = 0.5;
              if (
                b.x1 < vb.x1 - tol ||
                b.x2 > vb.x2 + tol ||
                b.y1 < vb.y1 - tol ||
                b.y2 > vb.y2 + tol
              )
                bad.push(
                  `${algo.id}/${p.id} krok ${i + 1}: „${b.text}“ [${b.x1.toFixed(0)}…${b.x2.toFixed(0)} × ${b.y1.toFixed(0)}…${b.y2.toFixed(0)}] mimo ${JSON.stringify(vb)}`,
                );
            }
          }
        }
      }
      expect(bad.slice(0, 10)).toEqual([]);
    }, 60_000);
  }

  it("rezerva popisků je stejná pro celý běh – viewBox se mezi kroky nemění", () => {
    for (const algo of GRAPH_ALGOS) {
      const { graph, layout } = loadPresetGraph(algo, PRESETS[0].id);
      const start = startIndex(
        graph,
        pageStartLabel(algo, graph, layout, null),
      );
      const steps = materialize(algo.run(graph, start));
      const reserve = subLabelReserve(steps.map((s) => s.state));
      const boxes = new Set(
        steps
          .map((s) =>
            viewBox(
              renderToStaticMarkup(
                createElement(GraphView, {
                  graph,
                  state: s.state,
                  width: 900,
                  height: 440,
                  subReserve: reserve,
                }),
              ),
            ),
          )
          .map((v) => JSON.stringify(v)),
      );
      expect(boxes.size, algo.id).toBe(1);
    }
  });
});
