// ArrayView: škála se zápornými hodnotami, rozložení řádků, svorky úseků, přístupný název, druhý kanál (znaky).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseNumbers, rng } from "../core/steps";
import type { Mark } from "../algos/sorting/types";
import { ArrayView } from "./ArrayView";
import {
  arrayLayout,
  describeArray,
  MARK_GLYPH,
  MIN_SLOT,
} from "./arrayLayout";
import { fitWidth } from "./useWidth";

const items = (vals: number[]) => vals.map((v, id) => ({ id, v }));
const attrs = (html: string, tag: string, name: string) =>
  [
    ...html.matchAll(new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`, "g")),
  ].map((m) => m[1]);

/** Stejně jako SortingPage / HeapPage: max = Math.max(1, ...hodnoty). */
function render(values: number[], extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(ArrayView, {
      items: items(values),
      marks: {},
      max: Math.max(1, ...values),
      ...extra,
    }),
  );
}
function bars(html: string) {
  const [, , W, H] = attrs(html, "svg", "viewBox")[0].split(" ").map(Number);
  const ys = attrs(html, "rect", "y").map(Number);
  const hs = attrs(html, "rect", "height").map(Number);
  return { W, H, rects: ys.map((y, i) => ({ y, h: hs[i] })) };
}

describe("ArrayView – škála a záporné hodnoty", () => {
  it("kladná čísla a nuly: všechny sloupce leží uvnitř viewBoxu", () => {
    for (const values of [
      [38, 27, 43, 3, 9, 82],
      [0, 0, 0],
      [1],
      [1e9, 3, 1e12, 7],
      [2.5, 1.5],
    ]) {
      const { H, rects } = bars(render(values));
      expect(rects).toHaveLength(values.length);
      for (const b of rects) {
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.h).toBeLessThanOrEqual(H);
      }
    }
  });

  it("záporná čísla (vstup je přijme) se vykreslí uvnitř viewBoxu – „-5 3 -1 2“ (dříve sloupec mizel pod plátnem)", () => {
    const values = parseNumbers("-5 3 -1 2");
    expect(values).toEqual([-5, 3, -1, 2]);
    const { H, rects } = bars(render(values));
    expect(
      rects.filter((b) => b.y < 0 || b.y + b.h > H || !Number.isFinite(b.y)),
    ).toEqual([]);
  });

  it("samá záporná čísla – sloupce nezmizí z plátna a mají výšku úměrnou |v|", () => {
    const { H, rects } = bars(render([-50, -20, -30]));
    expect(rects.filter((b) => b.y < 0 || b.y + b.h > H)).toEqual([]);
    expect(rects[0].h).toBeGreaterThan(rects[2].h);
    expect(rects[2].h).toBeGreaterThan(rects[1].h);
  });

  it("kladné sloupce rostou nad osu, záporné pod ni, nula je čárka nad osou", () => {
    const L = arrayLayout([-4, 0, 6], 900, { max: 6 });
    expect(L.lo).toBe(-4);
    expect(L.hi).toBe(6);
    const pos = L.bar(6);
    const zero = L.bar(0);
    const neg = L.bar(-4);
    expect(pos.y + pos.h).toBeCloseTo(L.zeroY);
    expect(zero.y + zero.h).toBeCloseTo(L.zeroY);
    expect(zero.h).toBe(2);
    expect(neg.y).toBeCloseTo(L.zeroY);
    expect(neg.y + neg.h).toBeCloseTo(L.plotBottom);
    // popisek záporné hodnoty pod sloupcem, ale nad řádkem znaků a indexů
    expect(neg.labelY).toBeGreaterThan(neg.y + neg.h);
    expect(neg.labelY).toBeLessThan(L.glyphY!);
  });

  it("sdílené min / max mezi hlavním a pomocným polem dávají stejnou nulovou osu", () => {
    const main = arrayLayout([-5, 3, 8], 900, { max: 8, min: -5 });
    const aux = arrayLayout([3], 900, { max: 8, min: -5, slotCount: 3 });
    expect(aux.zeroY).toBeCloseTo(main.zeroY);
  });

  it("halda: malý záporný klíč (−1) – dolní okraj sloupce je aspoň 12 px nad indexy (height 90)", () => {
    const L = arrayLayout([-1, 4, 7], 900, { max: 7, height: 90 });
    for (const v of [-1, 4, 7]) {
      const b = L.bar(v);
      expect(b.y + b.h).toBeLessThanOrEqual(L.indexY! - 12);
    }
  });

  it("náhodné vstupy (seedované): každý sloupec i popisek hodnoty leží uvnitř plátna", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const n = 1 + Math.floor(r() * 45);
      const vals = Array.from({ length: n }, () =>
        Math.round((r() - 0.4) * 200),
      );
      const L = arrayLayout(vals, 300 + r() * 900, {
        max: Math.max(1, ...vals),
        height: 60 + r() * 200,
      });
      for (const v of vals) {
        const b = L.bar(v);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.h).toBeLessThanOrEqual(L.plotBottom + 0.001);
        if (L.showValues) {
          expect(b.labelY).toBeGreaterThan(10);
          expect(b.labelY).toBeLessThan(L.H);
        }
      }
    }
  });
});

describe("ArrayView – šířka a čitelnost", () => {
  it("kreslí se ve skutečných px: viewBox = šířka SVG, na úzkém obalu nejméně MIN_SLOT px na prvek", () => {
    const L = arrayLayout([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 200, {
      max: 12,
    });
    expect(L.W).toBe(12 * MIN_SLOT);
    expect(L.slot).toBeGreaterThanOrEqual(MIN_SLOT);
    const html = render([5, 3, 8]);
    const [, , W] = attrs(html, "svg", "viewBox")[0].split(" ").map(Number);
    expect(attrs(html, "svg", "width")[0]).toBe(String(W));
  });

  it("fitWidth: neznámá šířka (0, NaN) = minimum, jinak omezení na [min, max]", () => {
    expect(fitWidth(0, 300)).toBe(300);
    expect(fitWidth(Number.NaN, 300)).toBe(300);
    expect(fitWidth(200, 300)).toBe(300);
    expect(fitWidth(700, 300)).toBe(700);
    expect(fitWidth(5000, 300, 1200)).toBe(1200);
  });

  it("dlouhá čísla zmenší písmo, místo aby přetékala do sousedních sloupců", () => {
    const L = arrayLayout(
      Array.from({ length: 40 }, (_, i) => 100000 + i),
      960,
      { max: 100040 },
    );
    expect(L.valueFont).toBeLessThan(13);
    expect(L.valueFont * 0.62 * 6).toBeLessThanOrEqual(L.slot);
  });
});

describe("ArrayView – svorky úseků", () => {
  it("obrácený úsek (to < from) se nekreslí, popisek leží uvnitř plátna (Quicksort na vstupu „1 2“)", () => {
    const html = renderToStaticMarkup(
      createElement(ArrayView, {
        items: items([1, 2]),
        marks: {},
        max: 2,
        ranges: [
          { from: 1, to: 0, label: "prázdný" },
          { from: 0, to: 0, label: "úsek" },
        ],
      }),
    );
    const [, , W] = attrs(html, "svg", "viewBox")[0].split(" ").map(Number);
    const paths = [
      ...html.matchAll(/<path d="M(-?[\d.]+),[^ ]* V[^ ]* H(-?[\d.]+) /g),
    ];
    expect(paths).toHaveLength(1);
    expect(Number(paths[0][2])).toBeGreaterThan(Number(paths[0][1]));
    const tx = [
      ...html.matchAll(
        /<g class="range"><path[^>]*><\/path><text x="([\d.-]+)"/g,
      ),
    ].map((m) => Number(m[1]));
    for (const x of tx) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(W);
    }
  });

  it("dlouhý popisek svorky u kraje (Insertsort „setříděno“ pod 1. prvkem na telefonu) se vejde celý", () => {
    const label = "setříděno";
    const html = renderToStaticMarkup(
      createElement(ArrayView, {
        items: items([5, 3, 9, 1, 7, 2, 8, 4, 6, 10, 12, 11]),
        marks: {},
        max: 12,
        width: 332,
        ranges: [
          { from: 0, to: 0, label },
          { from: 11, to: 11, label },
        ],
      }),
    );
    const [, , W] = attrs(html, "svg", "viewBox")[0].split(" ").map(Number);
    const tx = [
      ...html.matchAll(
        /<g class="range"><path[^>]*><\/path><text x="([\d.-]+)"/g,
      ),
    ].map((m) => Number(m[1]));
    expect(tx).toHaveLength(2);
    // text-anchor middle, 11px písmo: polovina textu je nejméně ~3 px na znak
    const half = label.length * 3;
    expect(tx[0]).toBeGreaterThanOrEqual(half);
    expect(tx[1]).toBeLessThanOrEqual(W - half);
  });

  it("reserveRanges drží stejnou výšku plátna s úseky i bez nich (plátno mezi kroky neposkakuje)", () => {
    const withRanges = arrayLayout([3, 1, 2], 900, { max: 3, ranges: 1 });
    const reserved = arrayLayout([3, 1, 2], 900, {
      max: 3,
      ranges: 0,
      reserveRanges: true,
    });
    const none = arrayLayout([3, 1, 2], 900, { max: 3, ranges: 0 });
    expect(reserved.H).toBe(withRanges.H);
    expect(none.H).toBeLessThan(withRanges.H);
  });
});

describe("ArrayView – přístupnost a druhý kanál", () => {
  it("SVG má přístupný název s hodnotami a značkami", () => {
    const html = renderToStaticMarkup(
      createElement(ArrayView, {
        items: items([38, 27, 43]),
        marks: { 0: "compare", 1: "compare" },
        max: 43,
      }),
    );
    expect(attrs(html, "svg", "role")[0]).toBe("img");
    expect(attrs(html, "svg", "aria-label")[0]).toBe(
      "Pole: 38, 27, 43; porovnávané: 1, 2",
    );
  });

  it("popis velkého pole je zkrácený, pomocné pole má svůj popisek", () => {
    const big = items(Array.from({ length: 60 }, (_, i) => i));
    expect(describeArray(big, {})).toMatch(/…\s*\(celkem 60 prvků\)$/);
    expect(describeArray([], {}, "Pomocné pole")).toBe("Pomocné pole: prázdné");
  });

  it("pod označeným sloupcem je znak značky (stejný, jaký stránka dá do legendy)", () => {
    const marks: Record<number, Mark> = { 0: "compare", 1: "swap", 2: "pivot" };
    const html = renderToStaticMarkup(
      createElement(ArrayView, {
        items: items([5, 3, 8, 1]),
        marks,
        sorted: [3],
        max: 8,
      }),
    );
    const glyphs = [...html.matchAll(/class="bar-glyph"[^>]*>([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(glyphs).toEqual([
      MARK_GLYPH.compare,
      MARK_GLYPH.swap,
      MARK_GLYPH.pivot,
      MARK_GLYPH.sorted,
    ]);
    // každá značka má jiný znak
    expect(new Set(Object.values(MARK_GLYPH)).size).toBe(
      Object.keys(MARK_GLYPH).length,
    );
  });

  it("prázdné pole: hláška místo prázdného plátna, žádné sloupce", () => {
    const html = renderToStaticMarkup(
      createElement(ArrayView, { items: [], marks: {}, max: 1 }),
    );
    expect(html).toContain("prázdné pole");
    expect(attrs(html, "rect", "y")).toEqual([]);
  });
});
