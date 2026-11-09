// (a,b)-strom na desktopu na jednu obrazovku: multiTreeLayout s `fit` (užší buňky místo zmenšení písma,
// okraje podle krajních vrcholů, výška bez prázdné hladiny dole) a vzdálenost hladin podle výšky plátna.
import { describe, expect, it } from "vitest";
import {
  MNODE_H,
  multiFitLevelHeight,
  multiLevelFitLimits,
  multiTreeLayout,
  type MNode,
} from "./treeLayout";

/** listy s jedním klíčem (délka keyLen), po čtyřech pod vrcholy hladiny 1, nad nimi kořen – tvar (4,7)-stromu po 28 klíčích */
function ab47(leaves = 28, keyLen = 2): MNode[] {
  const key = (i: number) => String(10 ** (keyLen - 1) + i);
  const nodes: MNode[] = Array.from({ length: leaves }, (_, i) => ({
    id: 100 + i,
    keys: [key(i)],
    x: i / (leaves - 1),
    y: 2,
  }));
  const groups = leaves / 4;
  const per = leaves / groups;
  for (let g = 0; g < groups; g++) {
    const first = nodes[g * per].x;
    const last = nodes[g * per + per - 1].x;
    nodes.push({
      id: 10 + g,
      keys: Array.from({ length: per - 1 }, (_, j) => key(g * per + j)),
      x: (first + last) / 2,
      y: 1,
    });
  }
  nodes.push({
    id: 1,
    keys: Array.from({ length: groups - 1 }, (_, j) => key(j * per)),
    x: 0.5,
    y: 0,
  });
  return nodes;
}

function noOverlap(nodes: MNode[], L: ReturnType<typeof multiTreeLayout>) {
  const levels = new Map<number, MNode[]>();
  for (const n of nodes) levels.set(n.y, [...(levels.get(n.y) ?? []), n]);
  for (const lv of levels.values()) {
    lv.sort((a, b) => a.x - b.x);
    for (let i = 1; i < lv.length; i++)
      expect(
        L.px(lv[i]) -
          L.px(lv[i - 1]) -
          (L.nodeW(lv[i]) + L.nodeW(lv[i - 1])) / 2,
      ).toBeGreaterThanOrEqual(2);
  }
  for (const n of nodes) {
    expect(L.px(n) - L.nodeW(n) / 2).toBeGreaterThanOrEqual(0);
    expect(L.px(n) + L.nodeW(n) / 2).toBeLessThanOrEqual(L.W);
  }
}

describe("multiTreeLayout s fit – šířka", () => {
  it("28 dvoumístných klíčů v (4,7) se při 1280 × 720 (plátno ~598 px) vejde bez zmenšení písma", () => {
    const nodes = ab47();
    const L = multiTreeLayout(nodes, 598, 80, { fit: true });
    // bez fit by to bylo ~1270 px → CSS zmenší kresbu i s písmem na ~0,47
    expect(multiTreeLayout(nodes, 598).W).toBeGreaterThan(1000);
    // písmo 13 px zůstane aspoň 12 px (CSS zmenšení nejvýš ~0,92)
    expect(598 / L.W).toBeGreaterThanOrEqual(0.92);
    noOverlap(nodes, L);
    // buňka nese dvoumístný klíč (14,4 px tučně) s okrajem
    expect(L.cell).toBeGreaterThanOrEqual(20);
  });

  it("když se strom vejde, buňky zůstávají jako bez fit (30 px) a vrcholy se nepřekrývají", () => {
    const nodes = ab47(8);
    const L = multiTreeLayout(nodes, 900, 80, { fit: true });
    expect(L.cell).toBe(30);
    expect(L.W).toBe(900);
    noOverlap(nodes, L);
  });

  it("okraj podle krajních vrcholů, ne podle nejširšího (kořen uprostřed neodsune listy)", () => {
    const nodes = ab47(8);
    const L = multiTreeLayout(nodes, 900, 80, { fit: true });
    const left = nodes.find((n) => n.id === 100)!;
    // bez fit je okraj ½ šířky kořene + 6 = 111 px
    expect(L.px(left) - L.nodeW(left) / 2).toBeLessThanOrEqual(12);
  });

  it("jediný vrchol stojí uprostřed", () => {
    const n: MNode = { id: 1, keys: ["5", "7"], x: 0.5, y: 0 };
    const L = multiTreeLayout([n], 600, 80, { fit: true });
    expect(L.px(n)).toBeCloseTo(300, 0);
  });

  it("trojmístné klíče: užší buňka, ale klíč se do ní vejde", () => {
    const nodes = ab47(28, 3);
    const L = multiTreeLayout(nodes, 598, 80, { fit: true });
    expect(L.cell).toBeGreaterThanOrEqual(27);
    noOverlap(nodes, L);
  });
});

describe("multiTreeLayout s fit – výška", () => {
  it("výška = vrcholy a okraje bez prázdné hladiny pod listy", () => {
    const nodes = ab47(8);
    const L = multiTreeLayout(nodes, 900, 120, { fit: true });
    const bottom = Math.max(...nodes.map((n) => L.py(n) + MNODE_H));
    expect(L.height - bottom).toBeLessThanOrEqual(24);
    expect(L.py(nodes.find((n) => n.y === 0)!)).toBe(20);
  });

  it("prázdný strom má pořád místo na text „prázdný strom“", () => {
    expect(multiTreeLayout([], 600, 80, { fit: true }).height).toBe(100);
  });
});

describe("multiFitLevelHeight / multiLevelFitLimits", () => {
  it("delta se rozdělí mezi hladiny pod kořenem (výška roste s hloubkou, ne s hloubkou + 1)", () => {
    expect(multiFitLevelHeight(80, 60, 2)).toBe(110);
    expect(multiFitLevelHeight(80, -40, 2)).toBe(60);
    expect(multiFitLevelHeight(80, 0, 2)).toBe(80);
  });

  it("malý strom se smí roztáhnout víc než BST (obr. 8.7 má jen dvě hladiny)", () => {
    expect(multiFitLevelHeight(80, 500, 1)).toBe(200);
    expect(multiLevelFitLimits(80, 1)).toEqual({ shrink: 32, grow: 120 });
  });

  it("hladiny se nestáhnou pod 48 px; strom bez hloubky se nemění", () => {
    expect(multiFitLevelHeight(80, -500, 3)).toBe(48);
    expect(multiLevelFitLimits(80, 0)).toEqual({ shrink: 0, grow: 0 });
    expect(multiFitLevelHeight(80, 100, 0)).toBe(80);
  });
});
