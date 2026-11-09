// Přizpůsobení kresby výšce plátna (canvasFit.ts): rezerva výšky, další delta, pružné rozměry.
import { describe, expect, it } from "vitest";
import { fitSlack, nextDelta, settleStep, stretch } from "./canvasFit";

describe("canvasFit – rezerva výšky plátna", () => {
  it("bez SVG je rezerva výška plátna minus výška obsahu", () => {
    expect(fitSlack(400, 300, [])).toBe(100);
    expect(fitSlack(400, 450, [])).toBe(-50);
  });

  it("SVG zmenšené CSS se počítá v přirozené výšce (zmenšení není „vejde se“)", () => {
    // obsah 400 px vyplnil plátno jen díky zmenšení SVG z 300 na 200 px → chybí 100 px
    expect(
      fitSlack(400, 400, [{ w: 600, h: 300, renderedH: 200, availW: 600 }]),
    ).toBe(-100);
  });

  it("SVG užší kvůli šířce obalu se na výšku nepočítá jako nedostatek místa", () => {
    // 1200 px široké v 600 px obalu → poloviční i na výšku, to je v pořádku
    expect(
      fitSlack(400, 300, [{ w: 1200, h: 300, renderedH: 150, availW: 600 }]),
    ).toBe(100);
  });
});

describe("canvasFit – další delta", () => {
  const limits = { shrink: 200, grow: 100 };
  it("posune deltu o rezervu v mezích", () => {
    expect(nextDelta(0, -120, limits)).toBe(-120);
    expect(nextDelta(-120, 0, limits)).toBe(-120);
    expect(nextDelta(0, -500, limits)).toBe(-200);
    expect(nextDelta(0, 500, limits)).toBe(100);
    expect(nextDelta(-200, 50, limits)).toBe(-150);
  });

  it("drobná volná rezerva (pod 2 px) ani šum měření deltu nemění – žádné kmitání po zaokrouhlení", () => {
    expect(nextDelta(-40, 1.4, limits)).toBe(-40);
    expect(nextDelta(-40, -0.05, limits)).toBe(-40);
  });

  it("každý přesah kresbu zmenší (sufixové pole 1920 × 1080: −1,89 px → posuvník +2, −0,72 px → +1)", () => {
    expect(nextDelta(-40, -0.72, limits)).toBe(-41);
    expect(nextDelta(-40, -1.6, limits)).toBe(-42);
    expect(nextDelta(10, -1.89, limits)).toBe(8);
    expect(nextDelta(-40, -1, limits)).toBe(-41);
    expect(nextDelta(-199, -1.5, limits)).toBe(-200);
  });

  it("pružný rozměr drží meze", () => {
    expect(stretch(220, -100, 70, 360)).toBe(120);
    expect(stretch(220, -300, 70, 360)).toBe(70);
    expect(stretch(220, 300, 70, 360)).toBe(360);
  });
});

describe("canvasFit – usazování bez kmitání", () => {
  it("rozměr po krocích (zaokrouhlené hladiny stromu) nekmitá: skončí, a to u kresby, která se vejde", () => {
    // výška obsahu se mění jen po 7 px (7 hladin × zaokrouhlená vzdálenost) – rezerva nikdy není přesně 0
    const content = (d: number) => 600 + 7 * Math.round(d / 7 + 0.4);
    const inner = 482;
    const limits = { shrink: 140, grow: 119 };
    let delta = 0;
    const visited: number[] = [];
    let steps = 0;
    for (;;) {
      visited.push(delta);
      const next = settleStep(delta, inner - content(delta), limits, visited);
      if (next === null) break;
      delta = next;
      expect(++steps).toBeLessThan(10);
    }
    expect(inner - content(delta)).toBeGreaterThanOrEqual(0);
  });

  it("bez rezervy nic nemění", () => {
    expect(settleStep(-40, 1, { shrink: 100, grow: 100 }, [-40])).toBeNull();
    expect(settleStep(0, -30, { shrink: 100, grow: 100 }, [0])).toBe(-30);
  });
});
