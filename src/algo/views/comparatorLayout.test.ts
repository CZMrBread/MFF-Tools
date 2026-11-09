/**
 * Geometrie komparátorové sítě (ComparatorView): vodiče svisle jako v knize (obr. 15.6–15.10, čas teče
 * dolů) nebo vodorovně; komparátory jako šipky k většímu výstupu, překrývající se komparátory jedné
 * vrstvy schodovitě pod sebou (obr. 15.10), bloky Sₙ / Mₙ (obr. 15.8 / 15.9), žetony hodnot v mezerách.
 */
import { describe, expect, it } from "vitest";
import { buildNet } from "../algos/parallel/sortNet";
import { comparatorFitLimits, comparatorLayout } from "./comparatorLayout";

const t8 = buildNet("t", 8);

describe("comparatorLayout – vodiče svisle (jako v knize)", () => {
  const L = comparatorLayout(t8, { orient: "v" });

  it("n svislých vodičů zleva doprava, popisky vstupů nahoře a výstupů dole", () => {
    expect(L.wires.length).toBe(8);
    for (const w of L.wires) {
      expect(w.x1).toBe(w.x2);
      expect(w.y1).toBeLessThan(w.y2);
      expect(w.inLabel.y).toBeLessThan(w.y1 + 1);
      expect(w.outLabel.y).toBeGreaterThan(w.y2 - 1);
    }
    const xs = L.wires.map((w) => w.x1);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("komparátor = vodorovná šipka od vodiče a k vodiči b (větší výstup ve směru šipky)", () => {
    expect(L.comps.length).toBe(24);
    for (const g of L.comps) {
      const c = t8.comps[g.c];
      expect(g.y1).toBe(g.y2);
      expect(g.x1).toBe(L.wires[c.a].x1);
      expect(g.x2).toBe(L.wires[c.b].x1);
    }
  });

  it("vrstva leží mezi mezerami: žetony mezery l nad ní, mezery l + 1 pod ní", () => {
    for (const g of L.comps) {
      expect(g.y1).toBeGreaterThan(L.token(0, g.layer).y + L.tokenR);
      expect(g.y1).toBeLessThan(L.token(0, g.layer + 1).y - L.tokenR);
    }
  });

  it("překrývající se komparátory vrstvy jdou schodovitě pod sebe, nepřekrývající sdílejí řádek", () => {
    const rows = (l: number) =>
      new Set(L.comps.filter((g) => g.layer === l).map((g) => g.row)).size;
    expect([0, 1, 2, 3, 4, 5].map(rows)).toEqual([1, 2, 1, 4, 2, 1]);
    // v jednom řádku se šipky nepřekrývají
    for (const a of L.comps)
      for (const b of L.comps)
        if (a !== b && a.layer === b.layer && a.row === b.row)
          expect(a.x2 < b.x1 || b.x2 < a.x1).toBe(true);
    const s8 = comparatorLayout(buildNet("sep", 8), { orient: "v" });
    expect(s8.comps.map((g) => g.row)).toEqual([0, 1, 2, 3]);
  });

  it("bloky M₁ × 4, M₂ × 2, M₄ obepínají své komparátory a navzájem se v jedné vrstvě nepřekrývají", () => {
    expect(L.blocks.map((b) => b.label)).toEqual([
      "M₁",
      "M₁",
      "M₁",
      "M₁",
      "M₂",
      "M₂",
      "M₄",
    ]);
    t8.blocks.forEach((blk, i) => {
      const r = L.blocks[i];
      for (const g of L.comps.filter(
        (g) => g.layer >= blk.from && g.layer <= blk.to,
      )) {
        const c = t8.comps[g.c];
        if (c.a < blk.lo || c.b > blk.hi) continue;
        expect(g.x1).toBeGreaterThan(r.x);
        expect(g.x2).toBeLessThan(r.x + r.w);
        expect(g.y1).toBeGreaterThan(r.y);
        expect(g.y1).toBeLessThan(r.y + r.h);
      }
    });
    const m1 = L.blocks.slice(0, 4);
    for (let i = 1; i < 4; i++)
      expect(m1[i].x).toBeGreaterThanOrEqual(m1[i - 1].x + m1[i - 1].w);
  });

  it("n = 8 se vejde do šířky telefonu (358 px = 390 px bez okrajů)", () => {
    const narrow = comparatorLayout(t8, { orient: "v", width: 358 });
    expect(narrow.W).toBeLessThanOrEqual(358);
    expect(narrow.tokenR).toBeGreaterThanOrEqual(9);
  });

  it("bublinka jak je zapsaná (obr. 15.6): tečkované čáry mezi průchody", () => {
    expect(
      comparatorLayout(buildNet("bubble", 5, { seq: true }), { orient: "v" })
        .separators.length,
    ).toBe(3);
    expect(
      comparatorLayout(buildNet("bubble", 5), { orient: "v" }).separators
        .length,
    ).toBe(0);
  });

  it("pás vrstvy obepíná všechny její komparátory", () => {
    for (const g of L.comps) {
      const b = L.layerBand(g.layer);
      expect(g.y1).toBeGreaterThan(b.y);
      expect(g.y1).toBeLessThan(b.y + b.h);
    }
  });
});

describe("comparatorLayout – vodorovně a přizpůsobení výšce", () => {
  it("vodiče vodorovně: komparátory svislé šipky shora dolů, čas zleva doprava", () => {
    const L = comparatorLayout(t8, { orient: "h" });
    for (const w of L.wires) expect(w.y1).toBe(w.y2);
    for (const g of L.comps) {
      expect(g.x1).toBe(g.x2);
      expect(g.y1).toBeLessThan(g.y2);
    }
    expect(L.token(0, 1).x).toBeGreaterThan(L.token(0, 0).x);
  });

  it("delta mění výšku kresby v mezích (svisle čas, vodorovně rozestup vodičů)", () => {
    for (const orient of ["v", "h"] as const) {
      const base = comparatorLayout(t8, { orient });
      const lim = comparatorFitLimits(t8, orient);
      expect(lim.shrink).toBeGreaterThan(0);
      expect(lim.grow).toBeGreaterThan(0);
      const less = comparatorLayout(t8, { orient, delta: -lim.shrink });
      const more = comparatorLayout(t8, { orient, delta: lim.grow });
      expect(less.H, orient).toBeLessThan(base.H);
      expect(more.H, orient).toBeGreaterThan(base.H);
      // zhruba o deltu (zaokrouhlení po celých px)
      expect(Math.abs(base.H - lim.shrink - less.H), orient).toBeLessThan(
        0.15 * lim.shrink + 12,
      );
      // šířka se nemění u svislých vodičů
      if (orient === "v") expect(less.W).toBe(base.W);
    }
  });

  it("výška roste s deltou přesně (bez zaokrouhlení) – canvasFit se usadí napoprvé a nekmitá", () => {
    for (const orient of ["v", "h"] as const) {
      const base = comparatorLayout(t8, { orient }).H;
      for (const d of [-40, -17, -3, 5, 23])
        expect(
          comparatorLayout(t8, { orient, delta: d }).H - base,
          `${orient} ${d}`,
        ).toBeCloseTo(d, 5);
    }
  });

  it("vodorovně se osa času zúží do dostupné šířky (T₁₆ do 680 px), žetony zůstanou čitelné", () => {
    const t16 = buildNet("t", 16);
    const wide = comparatorLayout(t16, { orient: "h" });
    const fit = comparatorLayout(t16, { orient: "h", width: 680 });
    expect(wide.W).toBeGreaterThan(680);
    expect(fit.W).toBeLessThanOrEqual(680);
    expect(fit.tokenR).toBeGreaterThanOrEqual(10);
    expect(fit.H).toBe(wide.H);
    // užší než nejmenší rozumná kresba se už nezužuje (posouvá se)
    expect(
      comparatorLayout(t16, { orient: "h", width: 200 }).W,
    ).toBeGreaterThan(500);
  });

  it("T₁₆ vodorovně se vejde do výšky desktopového plátna (≤ 460 px)", () => {
    const L = comparatorLayout(buildNet("t", 16), { orient: "h" });
    expect(L.H).toBeLessThanOrEqual(460);
  });
});
