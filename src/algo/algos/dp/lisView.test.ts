/*
 * Pohled NRP bez Reactu: třídy buněk tabulky (obr. 12.3) a geometrie grafu posloupnosti (obr. 12.4).
 */
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { FIG_12_3, FIG_12_4 } from "./dpBook.fixtures";
import { LIS_LINE, nrp2Steps } from "./lis";
import { lisSelection } from "./lisPageModel";
import { lisCellMarks, lisChart, lisColumns, lisEdgesAll } from "./lisView";

const steps = materialize(nrp2Steps(FIG_12_3.x));

describe("třídy buněk tabulky", () => {
  it("porovnání (ř. 6): i aktuální, j čtený; nespočítané T prázdné", () => {
    const s = steps.find((st) => st.line === LIS_LINE.test)!.state;
    const m = lisCellMarks(s, null);
    expect(m.x[12]).toContain("dp-cur");
    expect(m.x[13]).toContain("dp-read");
    expect(m.T[0]).toContain("dp-empty");
  });

  it("T[i] ← 1 + T[j] podbarví T[i] jako nové, P[i] ← j podbarví P[i]", () => {
    const k = steps.findIndex((st) => st.line === LIS_LINE.setT);
    const t = lisCellMarks(steps[k].state, null);
    const i = steps[k].state.i!;
    expect(t.T[i]).toContain("dp-new");
    expect(lisCellMarks(steps[k + 1].state, null).P[i]).toContain("dp-new");
  });

  it("na konci řešení zeleně (x₀ i vypsané prvky), výběr sloupce fialově", () => {
    const end = steps[steps.length - 1].state;
    const m = lisCellMarks(end, lisSelection(end, 5));
    for (const i of [0, 1, 2, 3, 6, 10, 11])
      expect(m.x[i]).toContain("dp-path");
    expect(m.x[4]).not.toContain("dp-path");
    expect(m.x[5]).toContain("dp-sel");
    expect(m.x[7]).toContain("dp-sel");
  });
});

describe("graf posloupnosti (obr. 12.4)", () => {
  it("vrcholy zleva doprava podle i, výš podle hodnoty; −∞ nejníž", () => {
    const s = materialize(nrp2Steps(FIG_12_4.x));
    const g = lisChart(s[0].state, 400, 200);
    expect(g.points).toHaveLength(6);
    const ys = g.points.map((p) => p.y);
    // −∞ nejníž, 15 nejvýš, 7 pod 10
    expect(Math.max(...ys)).toBe(ys[0]);
    expect(Math.min(...ys)).toBe(ys[4]);
    expect(ys[3]).toBeGreaterThan(ys[5]);
    for (let i = 1; i < 6; i++)
      expect(g.points[i].x).toBeGreaterThan(g.points[i - 1].x);
    for (const p of g.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(400);
      expect(p.y).toBeLessThanOrEqual(200);
    }
  });

  it("hrany grafu vedou „doprava nahoru“ (i < j, xᵢ < xⱼ): pro −∞, 1, 13, 7, 15, 10 jich je 12", () => {
    expect(lisEdgesAll([-Infinity, ...FIG_12_4.x])).toHaveLength(12);
  });

  it("hrany: odkazy P spočítaných vrcholů, porovnávaná hrana, na konci cesta řešení", () => {
    const s = materialize(nrp2Steps(FIG_12_4.x));
    const cmp = s.find((st) => st.line === LIS_LINE.test)!.state;
    const g = lisChart(cmp, 400, 200);
    expect(g.edges.some((e) => e.cls.includes("dp-e-cmp"))).toBe(true);
    const end = lisChart(s[s.length - 1].state, 400, 200);
    const path = end.edges.filter((e) => e.cls.includes("dp-e-path"));
    expect(path.map((e) => [e.from, e.to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 4],
    ]);
    // malý vstup: i všechny hrany grafu slabě
    expect(end.edges.filter((e) => e.cls.includes("dp-e-all"))).toHaveLength(
      12,
    );
  });

  it("dlouhá posloupnost: bez slabých hran (graf by byl nečitelný)", () => {
    const end = steps[steps.length - 1].state;
    const g = lisChart(end, 600, 200);
    expect(g.edges.some((e) => e.cls.includes("dp-e-all"))).toBe(false);
  });
});

describe("šířka sloupců tabulky a grafu", () => {
  it("sloupce se roztáhnou do šířky plátna (30 až 60 px), záhlaví 44 px", () => {
    expect(lisColumns(800, 13)).toEqual({ head: 44, col: 54 });
    expect(lisColumns(360, 13).col).toBe(30);
    expect(lisColumns(2000, 4).col).toBe(60);
  });
});
