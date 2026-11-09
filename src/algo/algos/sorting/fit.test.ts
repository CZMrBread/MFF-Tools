// Výška sloupců podle výšky plátna (canvasFit): hlavní a pomocné pole (Z, počítadla) si deltu dělí.
import { describe, expect, it } from "vitest";
import { sortBarHeights, sortFitLimits } from "./fit";

describe("třídění – výška sloupců podle plátna", () => {
  it("bez delty výchozí výšky (220, Z 160, počítadla 120)", () => {
    expect(sortBarHeights(0, "none")).toEqual({ main: 220, aux: 0 });
    expect(sortBarHeights(0, "merge")).toEqual({ main: 220, aux: 160 });
    expect(sortBarHeights(0, "counting")).toEqual({ main: 220, aux: 120 });
  });

  it("dvě pole nad sebou: úbytek se rozdělí podle výšky, součet se změní o deltu", () => {
    const h = sortBarHeights(-190, "merge");
    expect(h.main + h.aux).toBe(380 - 190);
    expect(h.main).toBeGreaterThan(h.aux);
    expect(h.aux).toBeGreaterThanOrEqual(30);
  });

  it("meze: pole nespadne pod čitelnou výšku a na velkém monitoru naroste nejvýš o polovinu", () => {
    const small = sortBarHeights(-5000, "merge");
    expect(small.main).toBe(60);
    expect(small.aux).toBe(30);
    expect(sortBarHeights(5000, "none").main).toBe(330);
    const lim = sortFitLimits("merge");
    expect(lim.shrink).toBe(220 - 60 + (160 - 30));
    expect(lim.grow).toBe(330 - 220 + (240 - 160));
    expect(sortFitLimits("none")).toEqual({ shrink: 160, grow: 110 });
  });
});
