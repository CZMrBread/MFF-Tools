/**
 * Příklady z knihy (Průvodce, kap. 4): každý příklad postaví přesně strukturu z obrázku
 * a operace z obrázku skončí ve výsledku z obrázku. Očekávané hodnoty jsou opsané z PDF
 * (str. 85–87 a 98), nezávisle na datech v bookExamples.ts.
 */
import { describe, expect, it } from "vitest";
import { bookExampleById } from "./bookExample";
import {
  HEAP_BOOK_EXAMPLES,
  SEGTREE_BOOK_EXAMPLES,
  planHeapBookOp,
  type HeapBookExample,
} from "./bookExamples";
import { heapKeys, type HeapState } from "./heap";
import { querySteps, updateSteps } from "./segtree";
import { runOp } from "./testutil";

function heapExample(id: string): HeapBookExample {
  const ex = bookExampleById(HEAP_BOOK_EXAMPLES, id);
  if (!ex) throw new Error(`příklad ${id} chybí`);
  return ex;
}

/** Spustí všechny operace příkladu za sebou; vrátí kroky poslední operace a konečný stav. */
function runAll(ex: HeapBookExample) {
  let st: HeapState = ex.build();
  let steps: { state: HeapState; message: string }[] = [];
  for (const op of ex.ops) {
    const r = runOp(st, planHeapBookOp(op).run);
    steps = r.steps;
    st = r.last;
  }
  return { st, steps };
}

describe("příklady z knihy – halda", () => {
  it("Obr. 4.1 (str. 85): halda po hladinách 1 | 2 1 | 3 4 3 2 | 9 6 7 8 4", () => {
    const ex = heapExample("obr-4-1");
    expect(ex.figure).toBe("4.1");
    expect(ex.page).toBe(85);
    expect(heapKeys(ex.build())).toEqual([1, 2, 1, 3, 4, 3, 2, 9, 6, 7, 8, 4]);
    expect(ex.ops).toEqual([]);
  });

  it("Obr. 4.2 (str. 86): Insert(1) do levé haldy skončí v pravé, 1 vybublá po cestě 13 → 6 → 3", () => {
    const ex = heapExample("obr-4-2");
    expect(ex.page).toBe(86);
    expect(heapKeys(ex.build())).toEqual([0, 2, 2, 3, 4, 3, 5, 9, 6, 7, 8, 4]);
    expect(ex.ops).toEqual([{ op: "insert", x: 1 }]);
    const { st, steps } = runAll(ex);
    expect(heapKeys(st)).toEqual([0, 2, 1, 3, 4, 2, 5, 9, 6, 7, 8, 4, 3]);
    // dvě prohození (s otcem 6 a s otcem 3), u kořene 0 se zastaví
    expect(
      steps.filter((s) => s.message.startsWith("Ne – prohodíme")),
    ).toHaveLength(2);
  });

  it("Obr. 4.3 (str. 87): ExtractMin – poslední list 6 v kořeni (levý obr.), pak zabublá do pravého obr.", () => {
    const ex = heapExample("obr-4-3");
    expect(ex.page).toBe(87);
    expect(ex.ops).toEqual([{ op: "extractMin" }]);
    // kniha původní kořen neukazuje – příklad to musí říct
    expect(ex.note).toMatch(/kořen/);
    const { st, steps } = runAll(ex);
    expect(
      steps.some(
        (s) =>
          JSON.stringify(heapKeys(s.state)) ===
          JSON.stringify([6, 1, 2, 4, 3, 3, 5, 9, 6, 7, 8, 4]),
      ),
    ).toBe(true);
    expect(heapKeys(st)).toEqual([1, 3, 2, 4, 6, 3, 5, 9, 6, 7, 8, 4]);
  });

  it("hodnoty pro textové pole odpovídají postavené haldě", () => {
    for (const ex of HEAP_BOOK_EXAMPLES)
      expect(heapKeys(ex.build()), ex.id).toEqual([...ex.values]);
  });
});

describe("příklady z knihy – intervalový strom", () => {
  it("Obr. 4.6 (str. 98): S[1 … 15] = minima 1 | 1 2 | 1 1 5 2 | listy 3 1 4 1 5 9 2 6", () => {
    const ex = bookExampleById(SEGTREE_BOOK_EXAMPLES, "obr-4-6");
    expect(ex?.page).toBe(98);
    const st = ex!.build();
    expect(st.n).toBe(8);
    expect(st.S.slice(1)).toEqual([
      1, 1, 2, 1, 1, 5, 2, 3, 1, 4, 1, 5, 9, 2, 6,
    ]);
  });

  it("tip stránky platí i na obr. 4.6: Min⟨1, 7⟩ = 4 kanonické intervaly, po IntUpdate(3, 0) jiné minimum", () => {
    const st = SEGTREE_BOOK_EXAMPLES[0].build();
    const q1 = runOp(st, (s) => querySteps(s, 1, 7));
    expect(q1.steps.at(-1)!.message).toMatch(
      /rozklad na 4 kanonické intervaly.*Minimum = 1\./,
    );
    const u = runOp(q1.last, (s) => updateSteps(s, 3, 0));
    const q2 = runOp(u.last, (s) => querySteps(s, 1, 7));
    expect(q2.steps.at(-1)!.message).toMatch(/Minimum = 0\./);
  });
});

describe("příklady z knihy – společné", () => {
  const all = [...HEAP_BOOK_EXAMPLES, ...SEGTREE_BOOK_EXAMPLES];
  it("id jsou jedinečná, popisek „Příklad z knihy: Obr. X.Y – …“ a zdroj Průvodce", () => {
    expect(all.length).toBe(4);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const ex of all) {
      expect(ex.label, ex.id).toBe(
        ex.label.startsWith(`Příklad z knihy: Obr. ${ex.figure} – `)
          ? ex.label
          : "(špatný popisek)",
      );
      expect(ex.source).toMatch(/Průvodce/);
    }
  });

  it("build() dává pokaždé novou kopii (operace stránky nepokazí předlohu)", () => {
    for (const ex of HEAP_BOOK_EXAMPLES) {
      const a = ex.build();
      a.a.pop();
      expect(ex.build().a.length, ex.id).toBe(ex.values.length);
    }
  });

  it("planHeapBookOp dává název s argumentem jako stránka", () => {
    expect(planHeapBookOp({ op: "insert", x: 1 }).title).toBe("Insert(1)");
    expect(planHeapBookOp({ op: "extractMin" }).title).toBe("ExtractMin");
  });
});
