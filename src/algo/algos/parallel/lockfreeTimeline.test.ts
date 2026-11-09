import { describe, expect, it } from "vitest";
import type { LFTraceItem } from "./lockfree";
import { lfTimeline, TL_CHIP_H } from "./lockfreeTimeline";

const item = (p: 0 | 1, text: string): LFTraceItem => ({
  p,
  text,
  kind: "read",
});

describe("lfTimeline – časová osa prokládání (dvě dráhy P1, P2)", () => {
  it("krok leží v dráze svého procesu, čas jde zleva doprava, kroky se nepřekrývají a jsou v kresbě", () => {
    const trace = [
      item(1, "Pop"),
      item(1, "h = A"),
      item(0, "Pop"),
      item(1, "CAS ✓ → A"),
    ];
    const L = lfTimeline(trace, 0, 900);
    expect(L.chips.map((c) => c.lane)).toEqual([1, 1, 0, 1]);
    expect(L.lanes).toHaveLength(2);
    for (const c of L.chips) {
      expect(c.y).toBe(L.lanes[c.lane].y);
      expect(c.h).toBe(TL_CHIP_H);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(L.W);
      expect(c.y + c.h).toBeLessThanOrEqual(L.H);
    }
    for (let i = 1; i < L.chips.length; i++)
      expect(L.chips[i].x).toBeGreaterThanOrEqual(
        L.chips[i - 1].x + L.chips[i - 1].w,
      );
    // delší text = širší krok
    expect(L.chips[3].w).toBeGreaterThan(L.chips[0].w);
    expect(L.chips[3].last).toBe(true);
    expect(L.chips.filter((c) => c.last)).toHaveLength(1);
    expect(L.hidden).toBe(0);
  });

  it("co se nevejde do šířky, odpadne zleva (poslední krok vždy vidět); spočítá i kroky vypadlé ze stavu", () => {
    const trace = Array.from({ length: 24 }, (_, i) =>
      item((i % 2) as 0 | 1, `h = ${i}`),
    );
    const L = lfTimeline(trace, 5, 400);
    expect(L.W).toBeLessThanOrEqual(400);
    expect(L.chips.length).toBeLessThan(24);
    expect(L.chips[L.chips.length - 1].text).toBe("h = 23");
    expect(L.hidden).toBe(5 + 24 - L.chips.length);
  });

  it("prázdný průběh: dráhy bez kroků", () => {
    const L = lfTimeline([], 0, 600);
    expect(L.chips).toEqual([]);
    expect(L.lanes.map((l) => l.label)).toEqual(["P1", "P2"]);
    expect(L.H).toBeGreaterThan(2 * TL_CHIP_H);
  });
});
