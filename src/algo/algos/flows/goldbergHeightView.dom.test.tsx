// @vitest-environment jsdom
/*
 * Kresba výšek Goldbergova algoritmu (jsdom): vrchol ve svém sloupci a hladině, odznak přebytku, hrany
 * s rezervou dolů, převedení +δ, zvednutí s původní výškou čárkovaně; jedna zastávka Tabu (roving),
 * rozměr kresby se mezi kroky nemění.
 */
import { createElement as h } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { key, mount, type Mounted } from "../../core/domTest";
import { materialize } from "../../core/steps";
import type { FlowNet } from "./flowNet";
import { flowPresetById, presetNet } from "./flowPresets";
import { goldberg, GOLDBERG_LINES } from "./goldberg";
import { GoldbergHeightView } from "./goldbergHeightView";
import { heightMax } from "./goldbergView";

let page: Mounted | null = null;
afterEach(async () => {
  await page?.unmount();
  page = null;
});

const graph = presetNet(flowPresetById("obr-14-2")!).graph;
const net: FlowNet = {
  graph,
  z: graph.nodes.find((n) => n.label === "z")!.id,
  s: graph.nodes.find((n) => n.label === "s")!.id,
};
const steps = materialize(goldberg(net));
const hMax = heightMax(net, steps);
const at = (line: number) => steps.find((s) => s.line === line)!.state;
const view = (state = steps[0].state) =>
  h(GoldbergHeightView, { net, state, hMax, width: 560, height: 300 });

describe("GoldbergHeightView", () => {
  it("vrcholy jako prvky kresby s výškou a přebytkem; jedna zastávka Tabu, šipky po vrcholech", async () => {
    page = await mount(view(at(GOLDBERG_LINES.wave)));
    const svg = page.el.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-label")).toMatch(/^Výšky vrcholů/);
    const nodes = [...svg.querySelectorAll<SVGGElement>(".gb-node")];
    expect(nodes).toHaveLength(6);
    expect(nodes.map((n) => n.getAttribute("aria-label"))).toContain(
      "a: výška 0, přebytek 10",
    );
    expect(
      nodes.filter((n) => n.getAttribute("tabindex") === "0"),
    ).toHaveLength(1);
    nodes[0].focus();
    await key(nodes[0], { key: "ArrowRight" });
    expect(document.activeElement).not.toBe(nodes[0]);
    expect(nodes).toContain(document.activeElement);
    // odznaky přebytku u a i b
    const badges = [...svg.querySelectorAll(".gb-badge text")].map(
      (t) => t.textContent,
    );
    expect(badges).toEqual(["+10", "+10"]);
    // osa: hladina n popsaná
    expect(svg.textContent).toContain("n = 6");
  });

  it("převedení: hrana gb-push s +δ; zvednutí: původní výška čárkovaně (gb-ghost)", async () => {
    page = await mount(view(at(GOLDBERG_LINES.push)));
    const push = page.el.querySelector(".gb-arc.gb-push")!;
    expect(push).not.toBeNull();
    expect(push.textContent).toBe("+7");
    await page.render(view(at(GOLDBERG_LINES.lift)));
    expect(page.el.querySelectorAll(".gb-ghost")).toHaveLength(1);
    expect(page.el.querySelector(".gb-node.gb-lift")).not.toBeNull();
  });

  it("rozměr kresby je stejný ve všech krocích běhu (hladiny 0…H pevné)", async () => {
    page = await mount(view(steps[0].state));
    const size = () => {
      const svg = page!.el.querySelector("svg")!;
      return [
        svg.getAttribute("width"),
        svg.getAttribute("height"),
        svg.getAttribute("viewBox"),
      ];
    };
    const first = size();
    for (const s of [steps[5], steps[30], steps[steps.length - 1]]) {
      await page.render(view(s.state));
      expect(size()).toEqual(first);
    }
  });

  it("náhled (still): bez zastávek Tabu a bez role skupiny", async () => {
    page = await mount(
      h(GoldbergHeightView, {
        net,
        state: at(GOLDBERG_LINES.push),
        hMax,
        width: 360,
        height: 200,
        still: true,
      }),
    );
    expect(page.el.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(page.el.querySelector("svg")!.getAttribute("role")).toBe("img");
    expect(
      page.el.querySelectorAll(".gb-node [role], .gb-node[role]"),
    ).toHaveLength(0);
  });

  it("bez kroku (editor, jiná síť): vrcholy bez popisu výšky, nic nespadne", async () => {
    page = await mount(
      h(GoldbergHeightView, {
        net,
        state: undefined,
        hMax,
        width: 560,
        height: 300,
      }),
    );
    expect(page.el.querySelectorAll(".gb-node")).toHaveLength(6);
    expect(page.el.querySelectorAll(".gb-badge")).toHaveLength(0);
  });
});
