import { describe, expect, it } from "vitest";
import { readingOrder, rovingTarget, type RovePoint } from "./rovingFocus";

/*
 * Roving tabindex na kresbě (rozhodnutí vlastníka D3, 7. 11. 2026): šipky přesouvají fokus mezi prvky
 * kresby prostorově, Home / End na první / poslední prvek v pořadí čtení (shora dolů, zleva doprava).
 */

/** strom: kořen nahoře, dvě děti, pod levým dítětem dvě vnoučata */
const tree: RovePoint[] = [
  { x: 200, y: 20 }, // 0 kořen
  { x: 100, y: 100 }, // 1 levé dítě
  { x: 300, y: 100 }, // 2 pravé dítě
  { x: 60, y: 180 }, // 3
  { x: 140, y: 180 }, // 4
];

/** pole: sloupce v jedné řadě (zarovnané podle středu – různě vysoké sloupce mají stejné y) */
const row: RovePoint[] = [0, 1, 2, 3].map((i) => ({ x: 20 + i * 40, y: 50 }));

describe("readingOrder", () => {
  it("shora dolů, v řadě zleva doprava (malé rozdíly výšky = stejná řada)", () => {
    expect(readingOrder(tree)).toEqual([0, 1, 2, 3, 4]);
    const jitter: RovePoint[] = [
      { x: 90, y: 52 },
      { x: 10, y: 50 },
      { x: 50, y: 47 },
    ];
    expect(readingOrder(jitter)).toEqual([1, 2, 0]);
  });
});

describe("rovingTarget", () => {
  it("šipka vpravo / vlevo v poli = sousední prvek, na kraji zůstane", () => {
    expect(rovingTarget(row, 0, "ArrowRight")).toBe(1);
    expect(rovingTarget(row, 2, "ArrowLeft")).toBe(1);
    expect(rovingTarget(row, 3, "ArrowRight")).toBeNull();
    expect(rovingTarget(row, 0, "ArrowLeft")).toBeNull();
  });

  it("ve stromu dolů = nejbližší dítě pod, nahoru = rodič, do stran = soused na hladině", () => {
    expect(rovingTarget(tree, 0, "ArrowDown")).toBe(1);
    expect(rovingTarget(tree, 1, "ArrowUp")).toBe(0);
    expect(rovingTarget(tree, 1, "ArrowRight")).toBe(2);
    expect(rovingTarget(tree, 2, "ArrowLeft")).toBe(1);
    expect(rovingTarget(tree, 3, "ArrowRight")).toBe(4);
    expect(rovingTarget(tree, 2, "ArrowDown")).toBe(4);
  });

  it("šipka nahoru / dolů, když ve směru nic není, nikam nejde", () => {
    expect(rovingTarget(row, 1, "ArrowUp")).toBeNull();
    expect(rovingTarget(tree, 0, "ArrowUp")).toBeNull();
    expect(rovingTarget(tree, 4, "ArrowDown")).toBeNull();
  });

  it("vpravo na konci řady pokračuje dalším prvkem v pořadí čtení (zalomená řada), vlevo předchozím", () => {
    // dvě řady po dvou: konec první řady → začátek druhé
    const wrapped: RovePoint[] = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 10, y: 60 },
      { x: 50, y: 60 },
    ];
    expect(rovingTarget(wrapped, 1, "ArrowRight")).toBe(2);
    expect(rovingTarget(wrapped, 2, "ArrowLeft")).toBe(1);
  });

  it("graf: šipka vede k nejbližšímu prvku ve směru, ne k vzdálenému přímo v ose", () => {
    const g: RovePoint[] = [
      { x: 100, y: 100 }, // 0 výchozí
      { x: 400, y: 100 }, // 1 daleko vpravo v ose
      { x: 160, y: 130 }, // 2 blízko vpravo, mírně níž
      { x: 110, y: 300 }, // 3 dole
      { x: 170, y: 118 }, // 4 skoro vodorovně vpravo – pro šipku dolů je „vpravo“, ne „dole“
    ];
    expect(rovingTarget(g.slice(0, 4), 0, "ArrowRight")).toBe(2);
    expect(rovingTarget([g[0]!, g[3]!, g[4]!], 0, "ArrowDown")).toBe(1);
  });

  it("Home / End = první / poslední v pořadí čtení", () => {
    expect(rovingTarget(tree, 3, "Home")).toBe(0);
    expect(rovingTarget(tree, 0, "End")).toBe(4);
    expect(rovingTarget(tree, 0, "Home")).toBeNull(); // už je tam
  });

  it("stejné polohy (bez rozvržení, jsdom): vpravo / vlevo podle pořadí v kresbě", () => {
    const zero: RovePoint[] = [0, 1, 2].map(() => ({ x: 0, y: 0 }));
    expect(rovingTarget(zero, 0, "ArrowRight")).toBe(1);
    expect(rovingTarget(zero, 2, "ArrowLeft")).toBe(1);
    expect(rovingTarget(zero, 0, "End")).toBe(2);
    expect(rovingTarget(zero, 1, "ArrowDown")).toBeNull();
  });

  it("sloupce různé výšky zarovnané dole (sloupcový graf, změřené obdélníky) = jedna řada", () => {
    // středy sloupců se liší o desítky px, svislé rozsahy se ale překrývají (společná základna y = 200)
    const heights = [120, 90, 150, 20, 40, 190, 50, 140];
    const bars: RovePoint[] = heights.map((h, i) => ({
      x: 20 + i * 40,
      y: 200 - h / 2,
      w: 30,
      h,
    }));
    expect(readingOrder(bars)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(rovingTarget(bars, 0, "Home")).toBeNull();
    expect(rovingTarget(bars, 3, "Home")).toBe(0);
    expect(rovingTarget(bars, 0, "End")).toBe(7);
    for (let i = 0; i < 7; i++) {
      expect(rovingTarget(bars, i, "ArrowRight")).toBe(i + 1);
      expect(rovingTarget(bars, i + 1, "ArrowLeft")).toBe(i);
    }
    // nahoru / dolů v jedné řadě nikam
    expect(rovingTarget(bars, 0, "ArrowUp")).toBeNull();
    expect(rovingTarget(bars, 2, "ArrowDown")).toBeNull();
  });

  it("svislý zásobník (krabičky těsně nad sebou, okraje se dotýkají) = sloupec, ne řada", () => {
    // krabičky 40 px vysoké s krokem 39 px (obrys 1 px se překrývá) – index 0 dole
    const stack: RovePoint[] = [0, 1, 2, 3].map((i) => ({
      x: 100,
      y: 200 - i * 39,
      w: 60,
      h: 40,
    }));
    expect(readingOrder(stack)).toEqual([3, 2, 1, 0]);
    expect(rovingTarget(stack, 0, "ArrowUp")).toBe(1);
    expect(rovingTarget(stack, 2, "ArrowDown")).toBe(1);
    expect(rovingTarget(stack, 0, "Home")).toBe(3);
    expect(rovingTarget(stack, 3, "End")).toBe(0);
  });

  it("list stromu: šipka dolů neskočí na vzdálený vrchol daleko stranou (AVL po Insert(25))", () => {
    // změřeno v Edge: 40 kořen; 20, 60; 10, 30, 50, 70; 25 pod 30
    const avl: RovePoint[] = [
      [328, 352],
      [411, 277],
      [493, 427],
      [576, 352],
      [659, 202],
      [742, 352],
      [824, 277],
      [907, 352],
    ].map(([x, y]) => ({ x: x!, y: y!, w: 39, h: 57 }));
    expect(rovingTarget(avl, 7, "ArrowDown")).toBeNull(); // 70 je list
    expect(rovingTarget(avl, 3, "ArrowDown")).toBe(2); // 30 → 25
    expect(rovingTarget(avl, 4, "ArrowDown")).toBe(6); // kořen → 60 (méně stranou než 20)
  });

  it("se změřenými obdélníky strom pořád chodí po hladinách", () => {
    const sized = tree.map((p) => ({ ...p, w: 40, h: 30 }));
    expect(readingOrder(sized)).toEqual([0, 1, 2, 3, 4]);
    expect(rovingTarget(sized, 0, "ArrowDown")).toBe(1);
    expect(rovingTarget(sized, 1, "ArrowUp")).toBe(0);
    expect(rovingTarget(sized, 1, "ArrowRight")).toBe(2);
    expect(rovingTarget(sized, 2, "ArrowDown")).toBe(4);
  });

  it("jiné klávesy a prázdná kresba = nic", () => {
    expect(rovingTarget(row, 0, "Enter")).toBeNull();
    expect(rovingTarget([], 0, "ArrowRight")).toBeNull();
  });
});
