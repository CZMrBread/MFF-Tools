// @vitest-environment jsdom
// Motýlková síť obr. 17.4 nad hotovou geometrií: kroužky „±k“, popisky vstupů x_{r(k)} a výstupů y_k,
// dvojkové popisky, hodnoty na drátech, aktivní vrstva / blok / motýlek a klik na kroužek.
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { click, key, mount } from "../core/domTest";
import { gateLabels, wireLabels } from "../algos/fourier/fft2";
import { netLayout } from "./butterflyNetLayout";
import { ButterflyNetView, type ButterflyNetProps } from "./ButterflyNetView";

const N = 8;
const layout = netLayout({ n: N, rowH: 34, valueW: 50 });
const empty = () =>
  Array.from({ length: 4 }, () => new Array<string | null>(N).fill(null));

function props(extra: Partial<ButterflyNetProps> = {}): ButterflyNetProps {
  return {
    layout,
    inLabels: [0, 4, 2, 6, 1, 5, 3, 7].map((k) => "x" + k),
    outLabels: Array.from({ length: N }, (_, k) => "y" + k),
    gateLabels: gateLabels(N),
    bits: wireLabels(N),
    values: empty(),
    activeLayer: null,
    block: null,
    hot: [],
    fresh: [],
    ariaLabel: "síť",
    ...extra,
  };
}

const texts = (el: Element, sel: string) =>
  [...el.querySelectorAll(sel)].map((t) => t.textContent);

describe("ButterflyNetView", () => {
  it("24 kroužků s popisky obr. 17.4, 8 + 8 popisků vstupů a výstupů, 48 spojů", async () => {
    const p = await mount(h(ButterflyNetView, props()));
    expect(p.el.querySelectorAll(".bn-gate").length).toBe(24);
    expect(texts(p.el, '.bn-gate[data-layer="3"] text')).toEqual([
      "+0",
      "+1",
      "+2",
      "+3",
      "−0",
      "−1",
      "−2",
      "−3",
    ]);
    expect(texts(p.el, ".bn-in")).toEqual(props().inLabels);
    expect(texts(p.el, ".bn-out")).toEqual(props().outLabels);
    expect(p.el.querySelectorAll(".bn-link").length).toBe(48);
    expect(texts(p.el, '.bn-bits[data-col="2"]')).toEqual(wireLabels(N)[2]);
    expect(p.el.querySelectorAll(".bn-val").length).toBe(0);
    await p.unmount();
  });

  it("hodnoty na drátech; nové hodnoty, aktivní vrstva, blok a motýlek mají vlastní třídu", async () => {
    const values = empty();
    values[0] = ["0", "4", "2", "6", "1", "5", "3", "7"];
    values[1][0] = "4";
    values[1][1] = "−4";
    const p = await mount(
      h(
        ButterflyNetView,
        props({
          values,
          activeLayer: 1,
          block: { start: 0, size: 2 },
          hot: [0, 1],
          fresh: [0, 1],
        }),
      ),
    );
    expect(texts(p.el, '.bn-val[data-col="1"]')).toEqual(["4", "−4"]);
    expect(p.el.querySelectorAll(".bn-val.is-new").length).toBe(2);
    expect(p.el.querySelector(".bn-band")).not.toBeNull();
    expect(p.el.querySelector(".bn-block")).not.toBeNull();
    expect(p.el.querySelectorAll(".bn-gate.is-hot").length).toBe(2);
    // do dvou aktivních kroužků vedou 4 zvýrazněné spoje (2 rovné, 2 šikmé)
    expect(p.el.querySelectorAll(".bn-link.is-hot").length).toBe(4);
    // nespočítané úseky drátu jsou čárkované
    expect(
      p.el.querySelectorAll('.bn-wire.is-pending[data-col="1"]').length,
    ).toBe(6);
    await p.unmount();
  });

  it("bez dvojkových popisků (nízký řádek) se nekreslí", async () => {
    const p = await mount(h(ButterflyNetView, props({ bits: null })));
    expect(p.el.querySelectorAll(".bn-bits").length).toBe(0);
    await p.unmount();
  });

  it("klik nebo Enter na kroužek zavolá onGate(vrstva, řádek)", async () => {
    const onGate = vi.fn();
    const p = await mount(h(ButterflyNetView, props({ onGate })));
    const g = p.el.querySelector<SVGGElement>(
      '.bn-gate[data-layer="2"][data-row="3"]',
    )!;
    expect(g.classList.contains("pickable")).toBe(true);
    expect(g.getAttribute("role")).toBe("button");
    await click(g as unknown as HTMLElement);
    expect(onGate).toHaveBeenCalledWith(2, 3);
    await key(g as unknown as HTMLElement, { key: "Enter" });
    expect(onGate).toHaveBeenCalledTimes(2);
    await p.unmount();
  });

  it("klávesnice (D3): síť je jedna zastávka Tabu, šipky chodí po kroužcích, mezerník nevybírá", async () => {
    const onGate = vi.fn();
    const p = await mount(h(ButterflyNetView, props({ onGate })));
    const svg = p.el.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("group");
    const stops = [...p.el.querySelectorAll(".bn-gate")].filter(
      (g) => g.getAttribute("tabindex") === "0",
    );
    expect(stops.length).toBe(1);
    const first = stops[0] as unknown as HTMLElement;
    first.focus();
    await key(first, { key: "ArrowRight" });
    expect(document.activeElement).not.toBe(first);
    expect(
      (document.activeElement as Element).classList.contains("bn-gate"),
    ).toBe(true);
    await key(document.activeElement as HTMLElement, { key: " " });
    expect(onGate).not.toHaveBeenCalled();
    await p.unmount();
  });

  it("zvětšení mění jen width/height, viewBox zůstává", async () => {
    const p = await mount(h(ButterflyNetView, props({ zoom: 1.5 })));
    const svg = p.el.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${layout.W} ${layout.H}`);
    expect(Number(svg.getAttribute("width"))).toBe(Math.round(layout.W * 1.5));
    await p.unmount();
  });
});
