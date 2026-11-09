// Geometrie jednotkové kružnice s mocninami ω (Průvodce obr. 17.1 a 17.2, str. 428–429).
import { describe, expect, it } from "vitest";
import { circleLayout } from "./unitCircleLayout";

describe("circleLayout", () => {
  const L = circleLayout(8, false, 200);

  it("ω⁰ leží vpravo na ose, mocniny obíhají proti směru hodinových ručiček (ω² = i nahoře)", () => {
    const [p0, , p2, , p4] = L.points;
    expect(p0.x).toBeCloseTo(L.cx + L.r, 6);
    expect(p0.y).toBeCloseTo(L.cy, 6);
    expect(p2.x).toBeCloseTo(L.cx, 6);
    expect(p2.y).toBeCloseTo(L.cy - L.r, 6); // SVG má osu y dolů
    expect(p4.x).toBeCloseTo(L.cx - L.r, 6);
  });

  it("inverzní FFT (ω̄ = ω⁻¹) obíhá opačně: ω̄² = −i dole", () => {
    const inv = circleLayout(8, true, 200);
    expect(inv.points[2].y).toBeCloseTo(inv.cy + inv.r, 6);
    expect(inv.points[1].y).toBeGreaterThan(inv.cy);
  });

  it("popisky leží vně kružnice a vejdou se do kresby", () => {
    for (const p of L.points) {
      const d = Math.hypot(p.lx - L.cx, p.ly - L.cy);
      expect(d).toBeGreaterThan(L.r);
      expect(p.lx).toBeGreaterThanOrEqual(0);
      expect(p.lx).toBeLessThanOrEqual(L.size);
      expect(p.ly).toBeGreaterThanOrEqual(0);
      expect(p.ly).toBeLessThanOrEqual(L.size);
    }
  });

  it("n = 16 i n = 1 mají správný počet bodů", () => {
    expect(circleLayout(16, false, 200).points.length).toBe(16);
    expect(circleLayout(1, false, 200).points.length).toBe(1);
  });
});
