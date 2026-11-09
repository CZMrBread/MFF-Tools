// BoxListView: ukazatele na téže krabičce se nepřekrývají, prázdný seznam, šířka krabiček.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoxListView } from "./BoxListView";
import { boxGrid, boxWidth, pointerRanks, type Pointer } from "./boxLayout";

const transforms = (html: string) =>
  [...html.matchAll(/class="pointer [^"]*" style="transform:([^"]*)"/g)].map(
    (m) => m[1],
  );
const H = (html: string) =>
  Number(html.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)![1]);

describe("BoxListView – ukazatele", () => {
  it("fronta s jedním prvkem: „začátek“ a „konec“ se nekreslí přes sebe", () => {
    const html = renderToStaticMarkup(
      createElement(BoxListView, {
        boxes: [{ id: 1, label: "5" }],
        pointers: [
          { at: 0, label: "začátek" },
          { at: 0, label: "konec" },
        ],
      }),
    );
    const t = transforms(html);
    expect(t).toHaveLength(2);
    expect(t[0]).not.toBe(t[1]);
  });

  it("spojový seznam: „hlava“ a „p“ nad prvním prvkem se nepřekrývají, ani na ∅ za koncem", () => {
    for (const at of [0, -1]) {
      const html = renderToStaticMarkup(
        createElement(BoxListView, {
          boxes:
            at === 0
              ? [
                  { id: 1, label: "5" },
                  { id: 2, label: "12" },
                ]
              : [],
          pointers: [
            { at, label: "hlava" },
            { at, label: "p", cls: "ptr-p" },
          ],
          arrows: true,
          nullEnd: true,
        }),
      );
      const t = transforms(html);
      expect(t).toHaveLength(2);
      expect(t[0]).not.toBe(t[1]);
    }
  });

  it("pointerRanks: druhý ukazatel stránky jde pod krabičky, jen při obsazení bere další volný řádek", () => {
    const ptr = (at: number, label: string): Pointer => ({ at, label });
    expect(pointerRanks([ptr(0, "hlava"), ptr(2, "p")], 3)).toEqual([
      { slot: 0, row: 0 },
      { slot: 2, row: 1 },
    ]);
    expect(
      pointerRanks([ptr(0, "a"), ptr(0, "b"), ptr(0, "c")], 1).map(
        (r) => r.row,
      ),
    ).toEqual([0, 1, 2]);
    // at = −1 i at ≥ počtu krabiček míří na ∅ – stejná skupina
    expect(pointerRanks([ptr(-1, "a"), ptr(5, "b")], 2)).toEqual([
      { slot: 2, row: 0 },
      { slot: 2, row: 1 },
    ]);
  });

  it("výška plátna se mezi kroky nemění, ať jsou ukazatele na jedné krabičce, nebo na různých", () => {
    const boxes = [
      { id: 1, label: "5" },
      { id: 2, label: "12" },
    ];
    const same = renderToStaticMarkup(
      createElement(BoxListView, {
        boxes,
        pointers: [
          { at: 0, label: "hlava" },
          { at: 0, label: "p" },
        ],
        arrows: true,
      }),
    );
    const apart = renderToStaticMarkup(
      createElement(BoxListView, {
        boxes,
        pointers: [
          { at: 0, label: "hlava" },
          { at: 1, label: "p" },
        ],
        arrows: true,
      }),
    );
    const one = renderToStaticMarkup(
      createElement(BoxListView, {
        boxes,
        pointers: [{ at: 0, label: "hlava" }],
        arrows: true,
      }),
    );
    expect(H(same)).toBe(H(apart));
    expect(H(one)).toBe(H(apart));
  });
});

describe("BoxListView – prázdný seznam a velikost", () => {
  it("prázdný spojový seznam: text „prázdné“ leží za symbolem ∅, ne přes něj", () => {
    const html = renderToStaticMarkup(
      createElement(BoxListView, {
        boxes: [],
        pointers: [{ at: -1, label: "hlava" }],
        arrows: true,
        nullEnd: true,
      }),
    );
    const nullX = Number(
      html.match(/<text x="([\d.]+)"[^>]*class="box-null"/)![1],
    );
    const emptyX = Number(
      html.match(/<text x="([\d.]+)"[^>]*class="box-empty-text"/)![1],
    );
    // ∅ (20 px) je vycentrovaný na nullX, popisek začíná vlevo zarovnaný na emptyX
    expect(emptyX).toBeGreaterThan(nullX + 14);
  });

  it("dlouhý popisek rozšíří krabičku (šestimístné číslo se vejde), krátké nechají 56 px", () => {
    expect(boxWidth([{ id: 1, label: "7" }])).toBe(56);
    expect(boxWidth([{ id: 1, label: "123456" }])).toBeGreaterThanOrEqual(
      6 * 9.5 + 10,
    );
  });

  it("SVG má přístupný název a pevnou velikost v px (širší řada se posouvá v obalu)", () => {
    const html = renderToStaticMarkup(
      createElement(BoxListView, {
        boxes: [
          { id: 1, label: "5" },
          { id: 2, label: "8" },
        ],
      }),
    );
    expect(html).toContain('aria-label="Prvky: 5, 8"');
    expect(html).toMatch(/class="boxlist-wrap view-wrap"/);
    const [w] = html.match(/<svg[^>]* width="(\d+)"/)!.slice(1);
    expect(html).toContain(`viewBox="0 0 ${w} `);
  });
});

describe("BoxListView – svislá varianta (zásobník)", () => {
  it('ukazatel „◀ vrchol“ leží v <g class="pointer"> – styl .pointer text (barva akcentu, i v tmavém tématu)', () => {
    const html = renderToStaticMarkup(
      createElement(BoxListView, {
        vertical: true,
        boxes: [
          { id: 1, label: "5" },
          { id: 2, label: "7" },
        ],
        pointers: [{ at: 1, label: "vrchol" }],
      }),
    );
    expect(html).not.toMatch(/<text[^>]*class="pointer/);
    expect(html).toMatch(
      /<g[^>]*class="pointer [^"]*"[^>]*><text[^>]*>◀ vrchol<\/text><\/g>/,
    );
  });
});

describe("boxGrid – měřítko a zalomení podle volného místa (SORTDS-03)", () => {
  const base = { boxW: 56, ptrRoom: 64, nullEnd: false };
  it("zásobník 12 prvků v plátně 687 × 330: do sloupců, písmo ≥ 12 px (měřítko ≥ 0,75)", () => {
    const g = boxGrid({
      ...base,
      count: 12,
      vertical: true,
      arrows: false,
      availW: 687,
      availH: 330,
    });
    expect(g.lines).toBeGreaterThanOrEqual(2);
    expect(g.scale).toBeGreaterThanOrEqual(0.75);
    expect(g.W * g.scale).toBeLessThanOrEqual(687 + 0.5);
    expect(g.H * g.scale).toBeLessThanOrEqual(330 + 0.5);
  });
  it("seznam 12 prvků se šipkami v plátně 687 × 330: zalomí se do řádků, písmo ≥ 12 px", () => {
    const g = boxGrid({
      ...base,
      nullEnd: true,
      count: 12,
      vertical: false,
      arrows: true,
      availW: 687,
      availH: 330,
    });
    expect(g.lines).toBeGreaterThanOrEqual(2);
    expect(g.scale).toBeGreaterThanOrEqual(0.75);
  });
  it("malý zásobník na velkém plátně se zvětší (nejvýš 1,6×) a zabere ≥ 40 % výšky", () => {
    const g = boxGrid({
      ...base,
      count: 3,
      vertical: true,
      arrows: false,
      availW: 1100,
      availH: 560,
    });
    expect(g.lines).toBe(1);
    expect(g.scale).toBeGreaterThan(1);
    expect(g.scale).toBeLessThanOrEqual(1.6);
    expect(g.H * g.scale).toBeGreaterThanOrEqual(0.4 * 560);
  });
  it("telefon (bez výšky, nezvětšovat): 16 buněk ve více řádcích s písmem ≥ 11 px; krátká řada v jednom", () => {
    const g = boxGrid({
      ...base,
      count: 16,
      vertical: false,
      arrows: false,
      availW: 358,
      availH: Infinity,
      maxScale: 1,
    });
    expect(g.lines).toBeGreaterThanOrEqual(2);
    expect(g.scale * 16).toBeGreaterThanOrEqual(11);
    const s = boxGrid({
      ...base,
      count: 3,
      vertical: false,
      arrows: false,
      availW: 358,
      availH: Infinity,
      maxScale: 1,
    });
    expect([s.lines, s.scale]).toEqual([1, 1]);
  });
});
