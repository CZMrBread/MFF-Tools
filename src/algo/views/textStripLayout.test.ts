// Geometrie pásu textu (TextStripView): šířka buněk, řádky, závorky výskytů v patrech.
import { describe, expect, it } from "vitest";
import {
  stripNaturalWidth,
  stackBrackets,
  stripLayout,
  STRIP_MAX_CELL,
  STRIP_MIN_CELL,
} from "./textStripLayout";

describe("stripLayout", () => {
  it("buňky se vejdou do šířky, nejvýš STRIP_MAX_CELL; slot i leží vpravo od slotu i − 1", () => {
    const L = stripLayout(13, 900, [{ kind: "cell", indices: true }]);
    expect(L.cell).toBe(STRIP_MAX_CELL);
    expect(L.W).toBeLessThanOrEqual(900);
    expect(L.x(1) - L.x(0)).toBe(L.cell);
    expect(L.scroll).toBe(false);
  });

  it("SVG vyplní šířku obalu (žádný prázdný pruh pozadí vedle kresby), obsah je uprostřed", () => {
    const L = stripLayout(5, 900, [{ kind: "cell" }]);
    expect(L.W).toBe(900);
    const left = L.x(0);
    const right = L.W - L.x(5);
    expect(Math.abs(left - right - 30)).toBeLessThanOrEqual(1); // vlevo navíc místo na popisek řádku
  });

  it("úzké plátno: buňka nejméně STRIP_MIN_CELL, pak se pás posouvá (scroll)", () => {
    const L = stripLayout(40, 390, [{ kind: "cell" }]);
    expect(L.cell).toBe(STRIP_MIN_CELL);
    expect(L.scroll).toBe(true);
    expect(L.W).toBeGreaterThan(390);
  });

  it("řádky pod sebou: buňkový řádek má výšku buňky, číselný menší, indexy pod řádkem; závorky dole", () => {
    const L = stripLayout(
      10,
      600,
      [{ kind: "cell", indices: true }, { kind: "num" }, { kind: "cell" }],
      2,
    );
    expect(L.rows).toHaveLength(3);
    expect(L.rows[0].h).toBe(L.cell);
    expect(L.rows[1].h).toBeLessThan(L.cell);
    expect(L.rows[1].y).toBeGreaterThan(L.rows[0].y + L.rows[0].h); // místo na indexy
    expect(L.rows[2].y).toBeGreaterThan(L.rows[1].y + L.rows[1].h - 1);
    expect(L.bracketY).toBeGreaterThan(L.rows[2].y + L.rows[2].h);
    expect(L.H).toBeGreaterThan(L.bracketY + 16);
  });
});

describe("stackBrackets – překrývající se výskyty do pater", () => {
  it("nepřekrývající se závorky v jednom patře, překrývající se v dalším", () => {
    const b = stackBrackets([
      { from: 1, to: 4, label: "1" },
      { from: 3, to: 6, label: "3" },
      { from: 7, to: 9, label: "7" },
    ]);
    expect(b.map((x) => x.row)).toEqual([0, 1, 0]);
  });

  it("aaaa v aaaaaaaa: 5 výskytů – patra se střídají tak, aby se závorky nedotýkaly", () => {
    const b = stackBrackets(
      [0, 1, 2, 3, 4].map((i) => ({ from: i, to: i + 4, label: String(i) })),
    );
    for (const x of b)
      for (const y of b)
        if (x !== y && x.row === y.row)
          expect(x.to <= y.from || y.to <= x.from).toBe(true);
    expect(Math.max(...b.map((x) => x.row))).toBe(3);
  });
});

describe("stripNaturalWidth", () => {
  it("popisek + okraje + n buněk po STRIP_MAX_CELL", () => {
    expect(stripNaturalWidth(30)).toBe(30 + 12 + 30 * 32);
  });
});
