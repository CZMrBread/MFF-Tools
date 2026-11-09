// Kompaktní rozvržení stromu volání FFT: listy v pořadí bitového zrcadlení, žádné překryvy, vše uvnitř kresby.
import { describe, expect, it } from "vitest";
import { callTree } from "./fft";
import { callTreeLayout, fftZoom, zoomLimits } from "./fftTreeLayout";

describe("callTreeLayout", () => {
  for (const n of [4, 8, 16])
    it(`n = ${n}: vrcholy se na hladině nepřekrývají a leží uvnitř šířky`, () => {
      const L = callTreeLayout(callTree(n), 44);
      for (const b of L.boxes) {
        expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w / 2).toBeLessThanOrEqual(L.W);
        expect(b.y + L.nodeH).toBeLessThanOrEqual(L.H);
      }
      const depth = Math.log2(n);
      for (let d = 0; d <= depth; d++) {
        const lv = L.boxes
          .filter((b) => b.depth === d)
          .sort((a, b) => a.x - b.x);
        for (let i = 1; i < lv.length; i++)
          expect(lv[i].x - lv[i].w / 2).toBeGreaterThan(
            lv[i - 1].x + lv[i - 1].w / 2,
          );
      }
    });

  it("n = 16 se vejde do ~420 px (dvojciferné indexy), n = 8 do ~300 px", () => {
    expect(callTreeLayout(callTree(16), 44).W).toBeLessThanOrEqual(420);
    expect(callTreeLayout(callTree(8), 44).W).toBeLessThanOrEqual(300);
  });

  it("výška roste s hloubkou a vzdáleností hladin; hrany vedou od rodiče k synovi", () => {
    const a = callTreeLayout(callTree(8), 44);
    const b = callTreeLayout(callTree(8), 60);
    expect(b.H - a.H).toBe(3 * 16);
    expect(a.edges.length).toBe(14);
    for (const e of a.edges) expect(e.y2).toBeGreaterThan(e.y1);
  });
});

describe("přiblížení kresby podle výšky plátna (useCanvasFit)", () => {
  it("delta 0 = 1 : 1; přebytek výšky kresbu zvětší nejvýš 2×, nedostatek zmenší nejvýš na 0,6 (1280 × 720 bez vnitřního posuvníku)", () => {
    expect(fftZoom(0, 200)).toBe(1);
    expect(fftZoom(100, 200)).toBeCloseTo(1.5, 9);
    expect(fftZoom(10_000, 200)).toBe(2);
    expect(fftZoom(-10_000, 200)).toBe(0.6);
    // šířka plátna omezí jen zvětšení (zmenšení do šířky udělá CSS)
    expect(fftZoom(100, 200, 1.2)).toBeCloseTo(1.2, 9);
    expect(fftZoom(100, 200, 0.7)).toBe(1);
    expect(fftZoom(-100, 200, 3)).toBe(0.6);
    const lim = zoomLimits(200);
    expect(lim).toEqual({ shrink: 80, grow: 200 });
  });
});
