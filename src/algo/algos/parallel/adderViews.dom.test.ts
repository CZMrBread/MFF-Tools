// @vitest-environment jsdom
// Řetěz krabiček Σ (obr. 15.3): šipky mají pevnou velikost (nerostou se silným vodičem přenosu 1)
// a barvu vodiče, popisek cᵢ leží nad vodičem mimo hrot šipky.
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { mount } from "../../core/domTest";
import type { Bit } from "./circuit";
import { SchoolChain, WrittenSum } from "./adderViews";

const bits = (s: string) => [...s].map((c) => Number(c) as Bit);

describe("SchoolChain – šipky", () => {
  it("markery v pevných jednotkách; vodič s 1 má vlastní (modrou) šipku, ostatní šedou", async () => {
    const c: (Bit | null)[] = [0, 0, 1, 1, null];
    const m = await mount(
      h(SchoolChain, {
        x: bits("0110"),
        y: bits("0110"),
        school: { c, z: [0, 0, 1, null, null], hot: 3, level: 3, done: false },
      }),
    );
    const markers = [...m.el.querySelectorAll("marker")];
    expect(markers.length).toBeGreaterThanOrEqual(2);
    for (const mk of markers)
      expect(mk.getAttribute("markerUnits")).toBe("userSpaceOnUse");
    const ids = new Map(markers.map((mk) => [mk.id, mk]));
    const lines = [...m.el.querySelectorAll("line.ad-carry-line[marker-end]")];
    const one = lines.filter((l) => l.classList.contains("ad-one"));
    const other = lines.filter((l) => !l.classList.contains("ad-one"));
    expect(one.length).toBeGreaterThan(0);
    const markerOf = (l: Element) =>
      ids.get(/url\(#(.+)\)/.exec(l.getAttribute("marker-end")!)![1])!;
    for (const l of one)
      expect(
        markerOf(l).querySelector("path")!.getAttribute("class"),
      ).toContain("ad-one");
    for (const l of other)
      expect(
        markerOf(l).querySelector("path")!.getAttribute("class"),
      ).not.toContain("ad-one");
    // popisek cᵢ nad vodičem: aspoň 4 jednotky nad osou (hrot šipky má výšku do ±4)
    const cy = Number(lines[0].getAttribute("y1"));
    for (const t of m.el.querySelectorAll("text.ad-clabel"))
      expect(Number(t.getAttribute("y"))).toBeLessThanOrEqual(cy - 7);
    await m.unmount();
  });
});

describe("školní režim – měřítko a písemné sčítání (NEWMODS-03, NEWMODS-10)", () => {
  const school = {
    c: [0, 0, 1, null, null] as (Bit | null)[],
    z: [0, 0, null, null, null] as (Bit | null)[],
    hot: 2,
    level: 2,
    done: false,
  };
  it("SchoolChain se zvětší atributy width/height (viewBox stejný) – písmo 11 px × měřítko", async () => {
    const one = await mount(
      h(SchoolChain, { x: bits("0110"), y: bits("0110"), school }),
    );
    const svg1 = one.el.querySelector("svg")!;
    const w1 = Number(svg1.getAttribute("width"));
    const vb = svg1.getAttribute("viewBox");
    await one.unmount();
    const big = await mount(
      h(SchoolChain, { x: bits("0110"), y: bits("0110"), school, scale: 1.5 }),
    );
    const svg = big.el.querySelector("svg")!;
    expect(
      Math.abs(Number(svg.getAttribute("width")) - w1 * 1.5),
    ).toBeLessThanOrEqual(1);
    expect(svg.getAttribute("viewBox")).toBe(vb);
    await big.unmount();
  });

  it("WrittenSum: řádky pozice, přenosy c, x, y, z; aktuální cᵢ zvýrazněný", async () => {
    const m = await mount(
      h(WrittenSum, { x: bits("0110"), y: bits("0110"), school }),
    );
    const rows = [...m.el.querySelectorAll("tr")].map(
      (tr) => tr.querySelector("th")?.textContent,
    );
    expect(rows).toEqual(["pozice", "přenosy c", "x", "y", "z"]);
    const hot = m.el.querySelectorAll("td.cell-hot");
    expect(hot).toHaveLength(1);
    expect(hot[0].getAttribute("data-c")).toBe("2");
    await m.unmount();
  });
});
