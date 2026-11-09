import { describe, expect, it } from "vitest";
import {
  BAR_MAX_SLOT,
  BAR_MIN_SLOT,
  barChartLayout,
  niceStep,
} from "./barChartLayout";

const inside = (L: ReturnType<typeof barChartLayout>, x: number, y: number) =>
  x >= 0 && x <= L.W && y >= 0 && y <= L.H;

describe("barChartLayout – sloupce a křivka (graf ceny operací)", () => {
  it("niceStep: krok os 1, 2, 5 · 10^k, nejméně 1", () => {
    expect(niceStep(0.3)).toBe(1);
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.6)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(13)).toBe(20);
    expect(niceStep(240)).toBe(500);
  });

  it("64 sloupců (obr. 9.2) na desktopu: vejdou se do šířky, nepřekrývají se a leží v kresbě", () => {
    const bars = Array.from({ length: 64 }, (_, i) => 1 + (i % 7));
    const line = Array.from({ length: 65 }, (_, i) => i % 6);
    const L = barChartLayout({
      bars,
      line,
      first: 1,
      width: 1150,
      height: 300,
    });
    expect(L.W).toBeLessThanOrEqual(1150);
    expect(L.H).toBe(300);
    expect(L.bars).toHaveLength(64);
    for (let i = 0; i < L.bars.length; i++) {
      const b = L.bars[i];
      expect(b.w).toBeGreaterThan(1);
      expect(inside(L, b.x, b.y) && inside(L, b.x + b.w, b.y + b.h)).toBe(true);
      expect(b.y + b.h).toBe(L.plot.bottom); // společná základna
      if (i)
        expect(b.x).toBeGreaterThanOrEqual(L.bars[i - 1].x + L.bars[i - 1].w);
      expect(b.no).toBe(i + 1);
    }
  });

  it("výška sloupce je úměrná hodnotě; nejvyšší hodnota nepřesáhne horní značku osy", () => {
    const L = barChartLayout({
      bars: [5, 1, 1, 1, 9],
      line: [4, 2, 4, 6, 8, 2],
      first: 1,
      width: 600,
      height: 240,
    });
    const unit = L.bars[1].h;
    expect(L.bars[0].h).toBeCloseTo(5 * unit, 5);
    expect(L.bars[4].h).toBeCloseTo(9 * unit, 5);
    const top = L.yTicks[L.yTicks.length - 1];
    expect(top.value).toBeGreaterThanOrEqual(9);
    expect(L.bars[4].y).toBeGreaterThanOrEqual(top.y - 0.001);
    expect(L.yTicks[0]).toEqual({ value: 0, y: L.plot.bottom });
    // značky rovnoměrně po kroku 1, 2, 5 · 10^k
    const step = L.yTicks[1].value - L.yTicks[0].value;
    expect([1, 2, 5, 10]).toContain(step);
  });

  it("křivka potenciálu: bod před první operací a po každé z nich, na hranicích sloupců", () => {
    const L = barChartLayout({
      bars: [3, 1],
      line: [1, 0, 2],
      first: 5,
      width: 600,
      height: 200,
    });
    expect(L.line).toHaveLength(3);
    expect(L.line[0].x).toBe(L.plot.left);
    expect(L.line[0].x).toBeLessThan(L.bars[0].x);
    expect(L.line[1].x).toBeGreaterThan(L.bars[0].x + L.bars[0].w);
    expect(L.line[1].x).toBeLessThan(L.bars[1].x);
    expect(L.line[1].y).toBe(L.plot.bottom); // Φ = 0 na základně
    expect(L.line[2].value).toBe(2);
    expect(L.bars.map((b) => b.no)).toEqual([5, 6]);
  });

  it("bez operací: prázdná osa s bodem Φ₀, pár sloupců nezabere celou šířku (nejvýš BAR_MAX_SLOT na operaci)", () => {
    const empty = barChartLayout({
      bars: [],
      line: [0.5],
      first: 1,
      width: 900,
      height: 200,
    });
    expect(empty.bars).toEqual([]);
    expect(empty.line).toHaveLength(1);
    expect(empty.yTicks.map((t) => t.value)).toEqual([0, 1]);
    const few = barChartLayout({
      bars: [1, 2],
      line: [],
      first: 1,
      width: 1800,
      height: 200,
    });
    expect(few.slot).toBe(BAR_MAX_SLOT);
  });

  it("úzké plátno (telefon): sloupec aspoň BAR_MIN_SLOT px, širší kresba se posouvá; popisky osy x se nepřekrývají", () => {
    const bars = Array.from({ length: 64 }, () => 1);
    const L = barChartLayout({
      bars,
      line: [],
      first: 1,
      width: 340,
      height: 160,
    });
    expect(L.slot).toBe(BAR_MIN_SLOT);
    expect(L.W).toBeGreaterThan(340);
    for (let i = 1; i < L.xTicks.length; i++)
      expect(L.xTicks[i].x - L.xTicks[i - 1].x).toBeGreaterThanOrEqual(28);
    // hodnoty nad sloupci jen tam, kde je na ně místo
    expect(L.showValues).toBe(false);
    expect(
      barChartLayout({
        bars: [1, 2],
        line: [],
        first: 1,
        width: 900,
        height: 160,
      }).showValues,
    ).toBe(true);
  });

  it("nesmyslná výška či šířka nevyrobí záporné rozměry", () => {
    const L = barChartLayout({
      bars: [2],
      line: [0, 1],
      first: 1,
      width: NaN,
      height: -5,
    });
    expect(L.H).toBeGreaterThan(0);
    expect(L.W).toBeGreaterThan(0);
    expect(L.bars[0].h).toBeGreaterThan(0);
  });
});
