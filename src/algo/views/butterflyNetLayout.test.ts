/*
 * Geometrie motýlkové sítě (obr. 17.4): řádky drátů, sloupce teček a kroužků po vrstvách, rovné a šikmé
 * spoje motýlků, úseky drátů pro popisky a přizpůsobení výšce plátna.
 */
import { describe, expect, it } from "vitest";
import {
  BASE_ROW,
  MIN_ROW,
  netFit,
  netLayout,
  netLimits,
  showBits,
  valueWidth,
} from "./butterflyNetLayout";

const L8 = netLayout({ n: 8, rowH: 34, valueW: 56 });

describe("netLayout", () => {
  it("8 řádků po rowH, 3 vrstvy, 4 úseky drátů (vstup + po každé vrstvě)", () => {
    expect(L8.rowY.length).toBe(8);
    expect(L8.rowY[1] - L8.rowY[0]).toBe(34);
    expect(L8.dotX.length).toBe(3);
    expect(L8.circleX.length).toBe(3);
    expect(L8.seg.length).toBe(4);
    expect(L8.H).toBeGreaterThan(L8.rowY[7]);
  });

  it("sloupce jdou zleva doprava: úsek → tečka → kroužek → úsek …; úsek má šířku aspoň valueW", () => {
    let x = 0;
    for (let c = 0; c < 4; c++) {
      const s = L8.seg[c];
      expect(s.x1).toBeGreaterThanOrEqual(x);
      expect(s.x2 - s.x1).toBeGreaterThanOrEqual(56);
      x = s.x2;
      if (c < 3) {
        expect(L8.dotX[c]).toBeGreaterThanOrEqual(x);
        expect(L8.circleX[c]).toBeGreaterThan(L8.dotX[c]);
        x = L8.circleX[c];
      }
    }
    expect(L8.outX).toBeGreaterThan(L8.seg[3].x2 - 1);
    expect(L8.W).toBeGreaterThan(L8.outX);
  });

  it("každý kroužek má dva spoje: rovně ze svého řádku a šikmo z partnera motýlku", () => {
    expect(L8.links.length).toBe(3 * 8 * 2);
    for (let layer = 1; layer <= 3; layer++) {
      const b = 2 ** (layer - 1);
      for (let row = 0; row < 8; row++) {
        const into = L8.links.filter(
          (l) => l.layer === layer && l.gateRow === row,
        );
        expect(into.map((l) => l.kind).sort()).toEqual(["cross", "straight"]);
        const partner = (row & b) === 0 ? row + b : row - b;
        expect(into.find((l) => l.kind === "cross")!.fromRow).toBe(partner);
        expect(into.find((l) => l.kind === "straight")!.fromRow).toBe(row);
      }
    }
  });

  it("šikmý spoj začíná v tečce řádku partnera a končí na obvodu kroužku", () => {
    const l = L8.links.find(
      (x) => x.layer === 3 && x.gateRow === 0 && x.kind === "cross",
    )!;
    expect(l.x1).toBe(L8.dotX[2]);
    expect(l.y1).toBe(L8.rowY[4]);
    const d = Math.hypot(l.x2 - L8.circleX[2], l.y2 - L8.rowY[0]);
    expect(d).toBeCloseTo(L8.r, 5);
  });

  it("kroužek se vejde mezi řádky (i při nejmenší výšce řádku)", () => {
    const small = netLayout({ n: 16, rowH: MIN_ROW, valueW: 44 });
    expect(2 * small.r).toBeLessThan(MIN_ROW);
    expect(2 * L8.r).toBeLessThan(34);
  });
});

describe("popisky a přizpůsobení", () => {
  it("valueWidth roste s nejdelším textem, nejméně 44 px", () => {
    expect(valueWidth(["0", "4"])).toBe(44);
    expect(valueWidth(["−4−9.66i"])).toBeGreaterThan(valueWidth(["−4"]));
  });

  it("dvojkové popisky nad drátem jen při dost vysokém řádku", () => {
    expect(showBits(BASE_ROW[8])).toBe(true);
    expect(showBits(MIN_ROW)).toBe(false);
  });

  it("netFit: chybí-li výška, řádky se zúží (nejvýš na MIN_ROW); přebývá-li, kresba se zvětší (omezeno šířkou)", () => {
    const H0 = netLayout({ n: 16, rowH: BASE_ROW[16], valueW: 60 }).H;
    expect(netFit(0, 16, H0)).toEqual({ rowH: BASE_ROW[16], zoom: 1 });
    expect(netFit(-30, 16, H0).rowH).toBe(BASE_ROW[16] - 2);
    expect(netFit(-9999, 16, H0).rowH).toBe(MIN_ROW);
    const up = netFit(100, 8, 300);
    expect(up.rowH).toBe(BASE_ROW[8]);
    expect(up.zoom).toBeCloseTo(1 + 100 / 300, 5);
    expect(netFit(100, 8, 300, 1.1).zoom).toBeCloseTo(1.1, 5);
    expect(netFit(100, 8, 300, 0.9).zoom).toBe(1);
  });

  it("netLimits odpovídají mezím netFit", () => {
    const lim = netLimits(16, 400);
    expect(lim.shrink).toBe((BASE_ROW[16] - MIN_ROW) * 15);
    expect(lim.grow).toBeGreaterThan(0);
  });
});
