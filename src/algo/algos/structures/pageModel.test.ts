// Čistý model stránek haldy a intervalového stromu: příklady z knihy v nabídce Vytvořit, co se po výběru
// příkladu předvyplní, a co vyplní klik na vrchol intervalového stromu.
import { describe, expect, it } from "vitest";
import {
  initialMenu,
  menuReducer,
  prepareGo,
  type ActionDef,
  type MenuState,
} from "../../core/actionModel";
import { bookExampleById } from "./bookExample";
import { HEAP_BOOK_EXAMPLES, SEGTREE_BOOK_EXAMPLES } from "./bookExamples";
import {
  bookOptions,
  heapBookPlan,
  insertAfterDef,
  segOpDefs,
  listText,
  segBookPlan,
  segPick,
  segPickTarget,
} from "./pageModel";

const heapEx = (id: string) => bookExampleById(HEAP_BOOK_EXAMPLES, id)!;

describe("bookOptions", () => {
  it("položky nabídky = číslo obrázku a popisek bez opakovaného „Příklad z knihy:“", () => {
    expect(bookOptions(HEAP_BOOK_EXAMPLES)).toEqual([
      { value: "obr-4-1", label: "Obr. 4.1 – halda a její očíslování" },
      {
        value: "obr-4-2",
        label: "Obr. 4.2 – vkládání do haldy, Insert(1)",
      },
      { value: "obr-4-3", label: "Obr. 4.3 – mazání z haldy, ExtractMin" },
    ]);
    expect(bookOptions(SEGTREE_BOOK_EXAMPLES)).toEqual([
      {
        value: "obr-4-6",
        label: "Obr. 4.6 – intervalový strom a jeho očíslování",
      },
    ]);
  });
});

describe("listText", () => {
  it("čísla do pole A = jako v nabídce (čárky, typografické minus)", () => {
    expect(listText([3, -1, 4])).toBe("3, −1, 4");
    expect(listText([])).toBe("");
  });
});

describe("heapBookPlan", () => {
  it("obr. 4.2: hodnoty do pole A, předvyplní Insert(1) a otevře ho – stačí Provést", () => {
    const p = heapBookPlan(heapEx("obr-4-2"));
    expect(p.values).toEqual([0, 2, 2, 3, 4, 3, 5, 9, 6, 7, 8, 4]);
    expect(p.title).toBe("Vytvořit(obr. 4.2)");
    expect(p.open).toBe("insert");
    expect(p.texts).toEqual({
      A: "0, 2, 2, 3, 4, 3, 5, 9, 6, 7, 8, 4",
      x: "1",
    });
    expect(p.message).toContain("obr. 4.2 Průvodce (s. 86)");
    expect(p.message).toContain("Insert(1)");
  });

  it("obr. 4.3: operace bez argumentu – nic se neotevírá, hláška řekne ExtractMin a doplněk z poznámky", () => {
    const p = heapBookPlan(heapEx("obr-4-3"));
    expect(p.open).toBeNull();
    expect(p.texts).toEqual({ A: listText(heapEx("obr-4-3").values) });
    expect(p.message).toContain("ExtractMin jako v knize");
    expect(p.message).toContain("kořen 0 je doplněný");
  });

  it("obr. 4.1: obrázek bez operace – obecná nápověda", () => {
    const p = heapBookPlan(heapEx("obr-4-1"));
    expect(p.open).toBeNull();
    expect(p.message).toContain("Insert(x) nebo ExtractMin");
  });
});

describe("segBookPlan", () => {
  it("obr. 4.6: posloupnost do pole A, název do historie", () => {
    const p = segBookPlan(SEGTREE_BOOK_EXAMPLES[0]);
    expect(p.values).toEqual([3, 1, 4, 1, 5, 9, 2, 6]);
    expect(p.title).toBe("Vytvořit(obr. 4.6)");
    expect(p.texts).toEqual({ A: "3, 1, 4, 1, 5, 9, 2, 6" });
    expect(p.open).toBeNull();
    expect(p.message).toContain("obr. 4.6 Průvodce (s. 98)");
  });
});

describe("segPickTarget", () => {
  it("otevřená změna prvku, jinak naposledy provedená, jinak dotaz", () => {
    expect(segPickTarget("update", null)).toBe("update");
    expect(segPickTarget("query", "update")).toBe("query");
    expect(segPickTarget(null, "update")).toBe("update");
    expect(segPickTarget("build", "update")).toBe("query");
    expect(segPickTarget(null, null)).toBe("query");
  });
});

describe("segPick (8 listů, vrcholy 1…15)", () => {
  it("vnitřní vrchol vyplní celý jeho kanonický interval do dotazu", () => {
    expect(segPick(1, 8, "query")).toEqual({
      open: "query",
      texts: { i: "0", j: "8" },
    });
    // vrchol 5 = ⟨2, 4⟩
    expect(segPick(5, 8, "query")).toEqual({
      open: "query",
      texts: { i: "2", j: "4" },
    });
    // u změny prvku se vnitřní vrchol bere jako dotaz (prvek je jen list)
    expect(segPick(3, 8, "update")).toEqual({
      open: "query",
      texts: { i: "4", j: "8" },
    });
  });

  it("list x_k: dotaz ⟨k, k+1⟩, u změny prvku index k", () => {
    expect(segPick(11, 8, "query")).toEqual({
      open: "query",
      texts: { i: "3", j: "4" },
    });
    expect(segPick(11, 8, "update")).toEqual({
      open: "update",
      texts: { u: "3" },
    });
  });
});

/* ------------------------------------------------------------------ meze argumentů podle aktuálního stavu (SORTDS-04) */

describe("meze argumentů z aktuální struktury (SORTDS-04)", () => {
  /** jako na stránce: vyplnit pole a stisknout Provést; vrací důvod zablokování nebo null (provedeno) */
  function go(def: ActionDef, texts: Record<string, string>): string | null {
    let st: MenuState = initialMenu([def]);
    for (const [name, text] of Object.entries(texts))
      st = menuReducer(st, { type: "text", name, text });
    const r = prepareGo(def, st);
    if (!r.ok) return r.reason;
    def.run(r.values, r.variant);
    return null;
  }

  it("seznam o 3 prvcích: InsertAfter(10, 5) zablokované (k od 1 do 3), InsertAfter(3, 5) projde", () => {
    const calls: number[][] = [];
    const X = {
      kind: "int",
      name: "x",
      label: "x =",
      min: -99,
      max: 999,
      default: 7,
    } as const;
    const def = insertAfterDef(3, X, null, (k, x) => calls.push([k, x]));
    expect(go(def, { k: "10", x: "5" })).toMatch(/k/);
    expect(go(def, { k: "0", x: "5" })).toMatch(/k/);
    expect(calls).toEqual([]);
    expect(go(def, { k: "3", x: "5" })).toBeNull();
    expect(calls).toEqual([[3, 5]]);
  });

  it("intervalový strom n = 8: Min⟨5,2⟩ (i < j), Min⟨0,9⟩ a IntUpdate(8,0) zablokované, nic se nespustí", () => {
    const calls: string[] = [];
    const [query, update] = segOpDefs(
      8,
      { min: -99, max: 999 },
      {
        query: (i, j) => calls.push(`Min⟨${i}, ${j}⟩`),
        update: (i, x) => calls.push(`IntUpdate(${i}, ${x})`),
      },
    );
    expect(go(query, { i: "5", j: "2" })).toBe("musí platit i < j");
    expect(go(query, { i: "0", j: "9" })).toMatch(/j/);
    expect(go(query, { i: "8", j: "8" })).toMatch(/i/);
    expect(go(update, { u: "8", x: "0" })).toMatch(/i/);
    expect(calls).toEqual([]);
    expect(go(query, { i: "0", j: "8" })).toBeNull();
    expect(go(update, { u: "7", x: "0" })).toBeNull();
    expect(calls).toEqual(["Min⟨0, 8⟩", "IntUpdate(7, 0)"]);
    // u menšího stromu se meze zúží
    const [q4] = segOpDefs(
      4,
      { min: -99, max: 999 },
      { query: () => {}, update: () => {} },
    );
    expect(go(q4, { i: "0", j: "5" })).toMatch(/j/);
  });
});
