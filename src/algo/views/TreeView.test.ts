// TreeView / MultiTreeView: šířka podle obsahu (vrcholy se nepřekrývají), poloměr a buňky podle klíčů, animace hran.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { rng } from "../core/steps";
import { MultiTreeView } from "./MultiTreeView";
import { TreeView } from "./TreeView";
import {
  completeLayout,
  fitLevelHeight,
  levelFitLimits,
  MIN_LEVEL,
  minLevelGap,
  multiTreeLayout,
  treeLayout,
  type MNode,
  type TNode,
  effectiveFont,
  minLevelHeight,
} from "./treeLayout";
import { interpolate, posKey, type Positions } from "./useTween";

/** BST z klíčů v pořadí vkládání; x = in-order pořadí / (n − 1) jako v algos/trees/bst.ts. */
function bst(keys: number[]): TNode[] {
  type N = { k: number; l?: N; r?: N; d: number };
  let root: N | undefined;
  for (const k of keys) {
    if (!root) {
      root = { k, d: 0 };
      continue;
    }
    let v = root;
    for (;;) {
      const side = k < v.k ? "l" : "r";
      const next = v[side];
      if (!next) {
        v[side] = { k, d: v.d + 1 };
        break;
      }
      v = next;
    }
  }
  const order: N[] = [];
  const walk = (v?: N) => {
    if (!v) return;
    walk(v.l);
    order.push(v);
    walk(v.r);
  };
  walk(root);
  return order.map((v, i) => ({
    id: v.k,
    label: String(v.k),
    x: order.length === 1 ? 0.5 : i / (order.length - 1),
    y: v.d,
  }));
}

/** Vrcholy téže hladiny se nepřekrývají (střed–střed ≥ součet poloměrů). */
function overlaps(nodes: TNode[], measured: number): number {
  const L = treeLayout(nodes, measured);
  let bad = 0;
  for (const a of nodes)
    for (const b of nodes)
      if (a.id < b.id && a.y === b.y && Math.abs(L.px(a) - L.px(b)) < 2 * L.r)
        bad++;
  return bad;
}

describe("treeLayout", () => {
  it("45 a více vrcholů (BST z náhodných klíčů) se nepřekrývá ani na úzkém plátně – plátno se rozšíří", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = rng(seed);
      const keys = [
        ...new Set(
          Array.from({ length: 45 + Math.floor(r() * 20) }, () =>
            Math.floor(r() * 999),
          ),
        ),
      ];
      const nodes = bst(keys);
      expect(overlaps(nodes, 320)).toBe(0);
      expect(overlaps(nodes, 1200)).toBe(0);
    }
  });

  it("úplný strom (halda, intervalový strom) s 31 vrcholy: šířka ≥ 16 listů vedle sebe", () => {
    const nodes = Array.from({ length: 31 }, (_, i) => ({
      id: i,
      label: String(i),
      ...completeLayout(i),
    }));
    const L = treeLayout(nodes, 300);
    expect(L.W).toBeGreaterThanOrEqual(16 * 2 * L.r);
    expect(overlaps(nodes, 300)).toBe(0);
  });

  it("dlouhý klíč zvětší kruh, šestimístný i zmenší písmo; krátké klíče nechají výchozí poloměr", () => {
    const one = (label: string) =>
      treeLayout([{ id: 1, label, x: 0.5, y: 0 }], 900);
    expect(one("42").r).toBe(20);
    expect(one("1000").r).toBeGreaterThan(20);
    expect(one("123456").font).toBeLessThan(14);
    expect(one("123456").r).toBeLessThanOrEqual(30);
  });

  it("výška plátna v px podle hloubky (ne podle šířky okna) a místo na popisek pod nejhlubším vrcholem", () => {
    const path = bst([1, 2, 3, 4, 5]);
    const narrow = treeLayout(path, 400);
    const wide = treeLayout(path, 2400);
    expect(narrow.H).toBe(wide.H);
    expect(narrow.H).toBeGreaterThanOrEqual(30 + 4 * 72 + narrow.r + 14);
  });

  it("minLevelGap: nejmenší rozestup na hladině, Infinity bez sousedů", () => {
    expect(minLevelGap([{ x: 0.5, y: 0 }])).toBe(Infinity);
    expect(
      minLevelGap([
        { x: 0.1, y: 1 },
        { x: 0.4, y: 1 },
        { x: 0.3, y: 1 },
        { x: 0.9, y: 2 },
      ]),
    ).toBeCloseTo(0.1);
  });

  it("SSR: SVG ve skutečných px s přístupným názvem, hrana vede ze středu do středu vrcholů", () => {
    const nodes = bst([5, 3, 8]);
    const h = renderToStaticMarkup(
      createElement(TreeView, {
        nodes,
        edges: [
          { from: 5, to: 3 },
          { from: 5, to: 8 },
        ],
      }),
    );
    expect(h).toContain('aria-label="Strom s 3 vrcholy"');
    const L = treeLayout(nodes, 900);
    const root = nodes.find((n) => n.id === 5)!;
    expect(h).toContain(`x1="${L.px(root)}" y1="${L.py(root)}"`);
    expect(h).toMatch(/class="tree-wrap view-wrap"/);
  });
});

describe("multiTreeLayout ((a,b)-strom)", () => {
  const leaves = (n: number, keys = 2, keyLen = 2): MNode[] =>
    Array.from({ length: n }, (_, i) => ({
      id: i,
      keys: Array.from({ length: keys }, () => "9".repeat(keyLen)),
      x: n === 1 ? 0.5 : i / (n - 1),
      y: 2,
    }));

  it("60 listů se nepřekrývá (dříve od 30 listů) a krajní listy nejsou oříznuté", () => {
    for (const [n, k, len] of [
      [60, 2, 2],
      [30, 3, 4],
      [8, 5, 6],
    ]) {
      const nodes = leaves(n, k, len);
      const L = multiTreeLayout(nodes, 320);
      for (let i = 1; i < nodes.length; i++) {
        const gap =
          L.px(nodes[i]) -
          L.px(nodes[i - 1]) -
          (L.nodeW(nodes[i]) + L.nodeW(nodes[i - 1])) / 2;
        expect(gap).toBeGreaterThanOrEqual(0);
      }
      expect(L.px(nodes[0]) - L.nodeW(nodes[0]) / 2).toBeGreaterThanOrEqual(0);
      expect(
        L.px(nodes[n - 1]) + L.nodeW(nodes[n - 1]) / 2,
      ).toBeLessThanOrEqual(L.W);
    }
  });

  it("buňka se rozšíří podle nejdelšího klíče (1000, −12.5 nepřetečou)", () => {
    expect(multiTreeLayout(leaves(3, 2, 2), 900).cell).toBe(30);
    expect(multiTreeLayout(leaves(3, 2, 5), 900).cell).toBeGreaterThanOrEqual(
      5 * 8 + 10,
    );
  });

  it("SSR: zvýrazněný klíč má třídu hot (styl tučně + podtržení)", () => {
    const h = renderToStaticMarkup(
      createElement(MultiTreeView, {
        nodes: [{ id: 1, keys: ["3", "7"], x: 0.5, y: 0, hot: 1 }],
        edges: [],
      }),
    );
    expect(h).toMatch(/<g class="hot">/);
  });

  it("SSR: keyCls obarví jednotlivé klíče (s hot se třídy spojí); bez keyCls beze změny", () => {
    const base = { id: 1, keys: ["a0", "a1", "a2"], x: 0.5, y: 0 };
    const draw = (n: MNode) =>
      renderToStaticMarkup(
        createElement(MultiTreeView, { nodes: [n], edges: [], width: 300 }),
      );
    const h = draw({
      ...base,
      hot: 2,
      keyCls: ["key-even", undefined, "key-odd"],
    });
    expect(h).toMatch(/<g class="key-even">/);
    expect(h).toMatch(/<g class="hot key-odd">/);
    // klíč bez třídy nemá ani prázdný atribut class
    expect(h).not.toMatch(/<g class="">/);
    expect(h.match(/<g>/g)).toHaveLength(1);
    // snímek (a,b)-stromu: bez keyCls (i s prázdným polem) přesně dosavadní markup
    expect(draw({ ...base, hot: 1, keyCls: [] })).toBe(
      draw({ ...base, hot: 1 }),
    );
    expect(draw({ ...base, hot: 1 })).toMatch(
      /<g><text[^>]*>a0<\/text><\/g><g class="hot">/,
    );
  });
});

describe("useTween – čisté části", () => {
  const P = (entries: [number, number, number][]): Positions =>
    new Map(entries.map(([id, x, y]) => [id, { x, y }]));

  it("interpolate: konce přesně, nový prvek rovnou v cíli, smazaný se nekreslí", () => {
    const from = P([
      [1, 0, 0],
      [2, 100, 0],
    ]);
    const to = P([
      [1, 100, 50],
      [3, 7, 7],
    ]);
    expect(interpolate(from, to, 0).get(1)).toEqual({ x: 0, y: 0 });
    expect(interpolate(from, to, 1).get(1)).toEqual({ x: 100, y: 50 });
    expect(interpolate(from, to, 0.5).get(3)).toEqual({ x: 7, y: 7 });
    expect(interpolate(from, to, 0.5).has(2)).toBe(false);
    const mid = interpolate(from, to, 0.5).get(1)!;
    expect(mid.x).toBeCloseTo(50);
  });

  it("hrana kreslená z mezipoloh vrcholů leží v každém okamžiku na jejich středech (nenavazovala, když jen vrcholy měly CSS přechod)", () => {
    const from = P([
      [1, 0, 0],
      [2, 200, 80],
    ]);
    const to = P([
      [1, 200, 0],
      [2, 0, 80],
    ]);
    for (const t of [0.1, 0.3, 0.7]) {
      const cur = interpolate(from, to, t);
      // TreeView kreslí <line> z cur.get(from) do cur.get(to) a vrcholy translatuje na tytéž body
      expect(cur.get(1)!.x + cur.get(2)!.x).toBeCloseTo(200);
    }
  });

  it("posKey se mění jen při změně polohy (délku přesunu dává stepTransitionMs, viz motion.test.ts)", () => {
    expect(posKey(P([[1, 10, 20]]))).toBe(posKey(P([[1, 10.01, 20]])));
    expect(posKey(P([[1, 10, 20]]))).not.toBe(posKey(P([[1, 12, 20]])));
  });
});

describe("TreeView – vzdálenost hladin podle výšky plátna (canvasFit)", () => {
  it("delta se rozdělí na hladiny: výška stromu se změní zhruba o deltu, vrcholy zůstanou 1 : 1", () => {
    const nodes = [0, 1, 2, 3, 4].map((y, i) => ({
      id: i,
      x: 0.5,
      y,
      label: String(i),
    }));
    const base = treeLayout(nodes, 600, { levelHeight: 68 });
    const level = fitLevelHeight(68, -80, 4);
    const fitted = treeLayout(nodes, 600, { levelHeight: level });
    expect(level).toBeLessThan(68);
    expect(Math.abs(base.H - 80 - fitted.H)).toBeLessThanOrEqual(5);
  });

  it("hladiny se nezmenší pod MIN_LEVEL ani nezvětší nad čtvrtinu navíc; bez hloubky nic", () => {
    expect(fitLevelHeight(68, -5000, 6)).toBe(MIN_LEVEL);
    expect(fitLevelHeight(68, 5000, 6)).toBe(85);
    expect(fitLevelHeight(68, -100, 0)).toBe(68);
    expect(levelFitLimits(68, 0)).toEqual({ shrink: 0, grow: 0 });
    expect(levelFitLimits(68, 3)).toEqual({
      shrink: 4 * (68 - MIN_LEVEL),
      grow: 4 * 17,
    });
  });
});

describe("velké a hluboké stromy (SORTDS-07, TREEHASH-10)", () => {
  /** úplný strom o n vrcholech jako halda */
  const complete = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: i,
      label: String(i + 1),
      ...completeLayout(i),
    }));
  /** cesta 1 … n doprava (BST ze setříděného vstupu) */
  const path = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: i,
      label: String(i + 1),
      x: n === 1 ? 0.5 : i / (n - 1),
      y: i,
    }));

  it("halda 31 vrcholů v šířce 600 px: s minRadius se vrcholy zúží a vejdou bez zmenšení písma", () => {
    const L = treeLayout(complete(31), 600, { minRadius: 12 });
    expect(L.W).toBeLessThanOrEqual(600);
    expect(L.r).toBeGreaterThanOrEqual(12);
    expect(L.font).toBe(14);
    // bez minRadius zůstává chování beze změny (náhledy na úvodní stránce)
    expect(treeLayout(complete(31), 600).r).toBe(20);
  });

  it("cesta 20 vrcholů v plátně 687 × 400: písmo ≥ 10 px (menší vrcholy, nižší hladiny)", () => {
    const nodes = path(20);
    const r = 14;
    const min = minLevelHeight(nodes, 687, r);
    expect(min).toBeLessThan(MIN_LEVEL);
    const depth = 19;
    const level = Math.max(min, (400 - 30 - r - 22) / depth);
    const L = treeLayout(nodes, 687, {
      levelHeight: level,
      radius: r,
      minRadius: 10,
    });
    expect(effectiveFont(L, 687, 400)).toBeGreaterThanOrEqual(10);
    // sousední vrcholy se nepřekrývají
    for (let i = 1; i < nodes.length; i++) {
      const dx = L.px(nodes[i]) - L.px(nodes[i - 1]);
      const dy = L.py(nodes[i]) - L.py(nodes[i - 1]);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(2 * L.r);
    }
  });

  it("levelFitLimits / fitLevelHeight berou nepovinné minimum hladiny (beze změny bez něj)", () => {
    expect(levelFitLimits(68, 3)).toEqual(levelFitLimits(68, 3, MIN_LEVEL));
    expect(levelFitLimits(68, 3, 20).shrink).toBe(4 * (68 - 20));
    expect(fitLevelHeight(68, -400, 3, 20)).toBe(20);
    expect(fitLevelHeight(68, -400, 3)).toBe(MIN_LEVEL);
  });
});
