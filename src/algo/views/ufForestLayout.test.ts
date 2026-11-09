// Rozvržení lesa keříků Union-Find (Kruskal, E5): kořen nahoře, synové pod otcem, keříky vedle sebe
// a po `maxCols` sloupcích na další řádek.
import { describe, expect, it } from "vitest";
import {
  UF_LEVEL,
  UF_PAD,
  UF_R,
  UF_MAX_COLS,
  UF_SLOT,
  ufForestLayout,
  ufForestLabel,
} from "./ufForestLayout";

const byId = (L: ReturnType<typeof ufForestLayout>, id: number) =>
  L.nodes.find((n) => n.id === id)!;

describe("ufForestLayout", () => {
  it("samé kořeny: jedna řada po maxCols sloupcích, další keříky na nový řádek", () => {
    const L = ufForestLayout(Array(10).fill(null), 7);
    expect(L.nodes).toHaveLength(10);
    expect(L.edges).toEqual([]);
    expect(L.nodes.every((n) => n.root)).toBe(true);
    const ys = [...new Set(L.nodes.map((n) => n.y))].sort((a, b) => a - b);
    expect(ys).toHaveLength(2);
    expect(L.nodes.filter((n) => n.y === ys[0])).toHaveLength(7);
    expect(L.w).toBe(2 * UF_PAD + 7 * UF_SLOT);
    // vše uvnitř kresby
    for (const n of L.nodes) {
      expect(n.x - UF_R).toBeGreaterThanOrEqual(0);
      expect(n.x + UF_R).toBeLessThanOrEqual(L.w);
      expect(n.y + UF_R).toBeLessThanOrEqual(L.h);
      expect(n.y - UF_R).toBeGreaterThan(0); // nad kořenem je místo na „H = …“
    }
  });

  it("syn leží o hladinu pod otcem, otec nad svými syny (mezi krajními), hrany vedou syn → otec", () => {
    // 0 ← 1, 0 ← 2, 2 ← 3, 4 samostatně
    const parent = [null, 0, 0, 2, null];
    const L = ufForestLayout(parent, 7);
    expect(L.edges).toEqual(
      expect.arrayContaining([
        { child: 1, parent: 0 },
        { child: 2, parent: 0 },
        { child: 3, parent: 2 },
      ]),
    );
    expect(L.edges).toHaveLength(3);
    for (const e of L.edges)
      expect(byId(L, e.child).y - byId(L, e.parent).y).toBe(UF_LEVEL);
    const xs = [byId(L, 1).x, byId(L, 2).x];
    expect(byId(L, 0).x).toBeGreaterThanOrEqual(Math.min(...xs));
    expect(byId(L, 0).x).toBeLessThanOrEqual(Math.max(...xs));
    expect(byId(L, 0).level).toBe(0);
    expect(byId(L, 3).level).toBe(2);
    expect(byId(L, 4).root).toBe(true);
  });

  it("vrcholy se nepřekrývají (ani mezi keříky v řadě, ani mezi řadami)", () => {
    const parent = [null, 0, 0, 1, 1, 2, null, 6, null, 8, 8, null, null];
    for (const cols of [3, 5, 7, 20]) {
      const L = ufForestLayout(parent, cols);
      for (const a of L.nodes)
        for (const b of L.nodes)
          if (a.id < b.id)
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
              2 * UF_R,
            );
    }
  });

  it("výchozí počet sloupců: 9 samostatných vrcholů (obr. 7.2) v jedné řadě a kresba se vejde do panelu výsledku (≤ 260 px)", () => {
    const L = ufForestLayout(Array(9).fill(null), UF_MAX_COLS);
    expect(new Set(L.nodes.map((n) => n.y)).size).toBe(1);
    expect(L.w).toBeLessThanOrEqual(260);
    // a výchozí hodnota parametru je právě UF_MAX_COLS
    expect(ufForestLayout(Array(9).fill(null))).toEqual(L);
  });

  it("prázdný les i poškozený vstup (cyklus otců) nespadne ani nezamrzne", () => {
    expect(ufForestLayout([], 7).nodes).toEqual([]);
    const L = ufForestLayout([1, 0, null], 7);
    expect(L.nodes.map((n) => n.id).sort()).toEqual([0, 1, 2]);
  });

  it("textový popis lesu pro čtečku: každý keřík s H a otci P jako v knize", () => {
    const labels = ["a", "b", "c", "d", "e"];
    expect(ufForestLabel([null, 0, 0, 2, null], [2, 0, 1, 0, 0], labels)).toBe(
      "Union-Find, 2 keříky: keřík a, H = 2: P(b) = a, P(c) = a, P(d) = c; keřík e, H = 0.",
    );
    expect(ufForestLabel([null], [0], ["x"])).toBe(
      "Union-Find, 1 keřík: keřík x, H = 0.",
    );
  });
});
