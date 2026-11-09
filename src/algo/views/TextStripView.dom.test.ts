// @vitest-environment jsdom
// Pás textu se zvětšením (NEWMODS-09): na velkém plátně se celá kresba zvětší (buňky i písmo) –
// viewBox zůstane, atributy width/height se vynásobí; šířka obalu se dodrží.
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { mount } from "../core/domTest";
import { TextStripView } from "./TextStripView";

const rows = [
  { key: "t", label: "σ", cells: [..."kokos"].map((ch) => ({ ch })) },
];

describe("TextStripView – zoom", () => {
  it("zoom 1.5: viewBox v jednotkách 1/1.5 šířky, atributy podle obalu, výška × 1.5", async () => {
    const one = await mount(
      h(TextStripView, { slots: 5, rows, ariaLabel: "pás", width: 600 }),
    );
    const s1 = one.el.querySelector("svg")!;
    const h1 = Number(s1.getAttribute("height"));
    await one.unmount();
    const m = await mount(
      h(TextStripView, {
        slots: 5,
        rows,
        ariaLabel: "pás",
        width: 600,
        zoom: 1.5,
      }),
    );
    const svg = m.el.querySelector("svg")!;
    expect(Number(svg.getAttribute("width"))).toBe(600);
    expect(svg.getAttribute("viewBox")!.split(" ").map(Number)[2]).toBe(400);
    expect(Number(svg.getAttribute("height"))).toBeCloseTo(h1 * 1.5, 0);
    await m.unmount();
  });
});

describe("TextStripView – zoom u dlouhého pásu", () => {
  it("pás, který se do šířky nevejde ani 1 : 1, se nezvětšuje (žádné vodorovné posouvání navíc)", async () => {
    const long = [
      {
        key: "t",
        label: "σ",
        cells: [..."z".repeat(40)].map((ch) => ({ ch })),
      },
    ];
    const m = await mount(
      h(TextStripView, {
        slots: 40,
        rows: long,
        ariaLabel: "pás",
        width: 700,
        zoom: 1.6,
      }),
    );
    const svg = m.el.querySelector("svg")!;
    const vbW = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    expect(Number(svg.getAttribute("width"))).toBe(Math.round(vbW));
    await m.unmount();
  });
});
