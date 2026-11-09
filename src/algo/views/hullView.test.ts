// Rovina konvexního obalu: rozsah v views/hullPlaneMap.ts (literál kvůli chunkům buildu) = PLANE modelu.
import { describe, expect, it } from "vitest";
import { PLANE } from "../algos/geometry/hull";
import { readFileSync } from "node:fs";
import { HULL_MAP, HULL_PLANE, HULL_S, hullLabelK } from "./hullPlaneMap";

describe("hullPlaneMap", () => {
  it("rozsah roviny je stejný jako PLANE v hull.ts", () => {
    expect(HULL_PLANE).toEqual(PLANE);
  });
  it("osa y míří nahoru: (0, 0) vlevo dole, (100, 100) vpravo nahoře", () => {
    const a = HULL_MAP.toPx(0, 0);
    const b = HULL_MAP.toPx(100, 100);
    expect(a.x).toBeLessThan(b.x);
    expect(a.y).toBeGreaterThan(b.y);
    expect(b.x).toBeLessThanOrEqual(HULL_S);
  });
});

describe("cropBox (náhled)", () => {
  it("výřez kolem bodů má požadovaný poměr stran a obsahuje všechny body", async () => {
    const { cropBox } = await import("./hullPlaneMap");
    const pts = [
      { id: 0, x: 10, y: 40 },
      { id: 1, x: 90, y: 60 },
    ];
    const [x, y, w, h] = cropBox(pts, 1.8).split(" ").map(Number);
    expect(w / h).toBeCloseTo(1.8, 1);
    for (const p of pts) {
      const q = HULL_MAP.toPx(p.x, p.y);
      expect(q.x).toBeGreaterThan(x);
      expect(q.x).toBeLessThan(x + w);
      expect(q.y).toBeGreaterThan(y);
      expect(q.y).toBeLessThan(y + h);
    }
    expect(cropBox([], 1.8)).toBe(`0 0 ${HULL_S} ${HULL_S}`);
  });
});

describe("popisky bodů roviny ≥ 11 px při každém měřítku (UX-18)", () => {
  it("hullLabelK = jednotky roviny na px vykreslené šířky; bez měření 1", () => {
    expect(hullLabelK(HULL_S)).toBe(1);
    expect(hullLabelK(HULL_S * 0.83)).toBeCloseTo(1 / 0.83, 5);
    expect(hullLabelK(0)).toBe(1);
  });
  it("CSS: písmo popisku = max(12,5 jednotky, 11 px · k)", () => {
    const css = readFileSync(
      new URL("../index.css", import.meta.url),
      "utf8",
    ).replaceAll("\r\n", "\n");
    const rule = /\.algo-root \.hull-label \{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(
      /font-size:\s*max\(12\.5px,\s*calc\(11px \* var\(--algo-hull-k, 1\)\)\)/,
    );
  });
});
