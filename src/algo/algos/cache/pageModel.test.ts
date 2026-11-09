/*
 * Model stránky stránkování (bez Reactu): příklady z přednášky L04 a nabídka operací (ActionMenu).
 */
import { describe, expect, it, vi } from "vitest";
import { initialMenu, prepareGo } from "../../core/actionModel";
import { materialize } from "../../core/steps";
import {
  columnReadRequests,
  matrixBlock,
  PAGING_EXAMPLES,
  pagingActions,
  runCaption,
  transposeRequests,
  type PagingCtx,
} from "./pageModel";
import {
  badSequence,
  DEFAULT_P,
  DEFAULT_SEQ,
  paging,
  type PagingState,
} from "./paging";

const run = (seq: number[], P: number) => materialize(paging(seq, P));
const last = (seq: number[], P: number): PagingState => {
  const s = run(seq, P);
  return s[s.length - 1].state;
};

describe("příklady z přednášky L04 (matice 5 × 5, blok B = 4)", () => {
  it("prvek A_ij leží v bloku podle uložení po řádcích jako na slidu 10 (11 12 13 14 | 15 21 22 23 | …)", () => {
    expect(matrixBlock(1, 1, 5, 4)).toBe(1);
    expect(matrixBlock(1, 4, 5, 4)).toBe(1);
    expect(matrixBlock(1, 5, 5, 4)).toBe(2);
    expect(matrixBlock(2, 3, 5, 4)).toBe(2);
    expect(matrixBlock(2, 4, 5, 4)).toBe(3);
    expect(matrixBlock(4, 1, 5, 4)).toBe(4);
    expect(matrixBlock(5, 4, 5, 4)).toBe(6);
    expect(matrixBlock(5, 5, 5, 4)).toBe(7);
  });

  it("čtení po sloupcích: posloupnost bloků A11, A21, …, A51, A12, …", () => {
    expect(columnReadRequests(5, 4)).toEqual([
      1, 2, 3, 4, 6, 1, 2, 3, 5, 6, 1, 2, 4, 5, 6, 1, 3, 4, 5, 6, 2, 3, 4, 5, 7,
    ]);
  });

  it("triviální transpozice (slide 9): Swap(A_ij, A_ji) pro i < j čte blok A_ij a pak A_ji", () => {
    expect(transposeRequests(5, 4)).toEqual([
      1, 2, 1, 3, 1, 4, 2, 6, 2, 3, 3, 5, 3, 6, 4, 5, 4, 6, 5, 6,
    ]);
  });

  it("slide 10: při čtení A₃,₂ už A₃,₁ v cache LRU ani FIFO není (P = 3)", () => {
    const ex = PAGING_EXAMPLES.find((e) => e.id === "l04-columns")!;
    expect(ex.P).toBe(3);
    expect(ex.seq).toEqual(columnReadRequests(5, 4));
    // A₃,₂ je 8. požadavek (index 7) a leží ve stejném bloku jako A₃,₁ (index 2)
    expect(ex.seq[7]).toBe(ex.seq[2]);
    const at7 = run(ex.seq, ex.P).find(
      (s) => s.state.i === 7 && s.state.caches.LRU.last,
    )!;
    expect(at7.state.caches.LRU.last!.hit).toBe(false);
    expect(at7.state.caches.FIFO.last!.hit).toBe(false);
    // LRU i FIFO mají výpadek u každého požadavku, OPT výrazně méně
    const end = last(ex.seq, ex.P);
    expect(end.caches.LRU.misses).toBe(25);
    expect(end.caches.FIFO.misses).toBe(25);
    expect(end.caches.OPT.misses).toBeLessThan(20);
  });

  it("každý příklad má zdroj, popisek a platnou posloupnost; výchozí je Béládyho posloupnost", () => {
    expect(PAGING_EXAMPLES.map((e) => e.id)).toEqual([
      "belady",
      "l04-columns",
      "l04-transpose",
    ]);
    const def = PAGING_EXAMPLES[0];
    expect(def.seq).toEqual(DEFAULT_SEQ);
    expect(def.P).toBe(DEFAULT_P);
    for (const e of PAGING_EXAMPLES.slice(1)) {
      expect(e.source).toMatch(/^Přednáška L04, slide \d+/);
      expect(e.label).not.toBe("");
    }
    const tr = PAGING_EXAMPLES[2];
    expect(tr.seq).toEqual(transposeRequests(5, 4));
    const end = last(tr.seq, tr.P);
    expect(end.caches.OPT.misses).toBeLessThanOrEqual(end.caches.LRU.misses);
  });
});

/* ---------------------------------------------------------------- nabídka */

function ctx(over: Partial<PagingCtx> = {}): PagingCtx {
  return {
    P: 3,
    seq: DEFAULT_SEQ,
    start: vi.fn(),
    now: () => 42,
    ...over,
  };
}

describe("nabídka operací stránkování", () => {
  it("akce: Vytvořit (Vlastní σ, Náhodně, Zlá posloupnost pro LRU) s potvrzením Simulovat, pak Příklady; Výchozí příklad v nabídce není (CROSS-04/05)", () => {
    const defs = pagingActions(ctx());
    expect(defs.map((d) => d.label)).toEqual(["Vytvořit", "Příklady"]);
    const create = defs[0];
    expect(create.goLabel).toBe("Simulovat");
    expect(create.variants!.map((v) => [v.id, v.label])).toEqual([
      ["custom", "Vlastní"],
      ["random", "Náhodně"],
      ["bad", "Zlá posloupnost pro LRU"],
    ]);
    const q = create.variants![0].args![0];
    expect(q).toMatchObject({
      kind: "list",
      name: "q",
      label: "Požadavky σ =",
    });
    expect(create.variants![0].title).toContain(
      "nejvýše 60 požadavků, stránky 0–99",
    );
    // Příklady nejsou z knihy – název beze změny; žádné Výchozí příklad
    const all = defs.flatMap((d) => [
      d.label,
      ...(d.variants ?? []).map((v) => v.label),
    ]);
    expect(all).not.toContain("Výchozí příklad");
    expect(all).not.toContain("Příklady z knihy");
  });

  it("Vytvořit ▸ Vlastní spustí zadanou posloupnost s aktuálním P (název do historie); pole je předvyplněné použitou posloupností", () => {
    const c = ctx({ seq: [4, 5, 6] });
    const defs = pagingActions(c);
    const st = initialMenu(defs);
    const go = prepareGo(defs[0], {
      ...st,
      texts: { q: "1 2 x 3 1" },
    });
    expect(go.ok).toBe(true);
    if (!go.ok) return;
    expect(go.values.q).toEqual([1, 2, 3, 1]);
    defs[0].run(go.values, go.variant);
    expect(c.start).toHaveBeenCalledWith(
      [1, 2, 3, 1],
      undefined,
      undefined,
      "σ = 1, 2, 3, 1",
    );
    // výchozí text pole = právě simulovaná posloupnost
    expect(prepareGo(defs[0], st)).toMatchObject({
      ok: true,
      values: { q: [4, 5, 6] },
    });
  });

  it("Příklady: varianta bez argumentů na klik spustí posloupnost i s P z přednášky", () => {
    const c = ctx({ P: 5 });
    const ex = pagingActions(c)[1];
    expect(ex.variants!.map((v) => v.id)).toEqual(
      PAGING_EXAMPLES.map((e) => e.id),
    );
    expect(ex.variants!.every((v) => !v.args?.length)).toBe(true);
    expect(ex.variants![1].title).toContain("Přednáška L04, slide 10");
    ex.run({}, "l04-transpose");
    expect(c.start).toHaveBeenCalledWith(
      transposeRequests(5, 4),
      3,
      "l04-transpose",
      "Příklad: Triviální transpozice",
    );
  });

  it("Vytvořit ▸ Náhodně a Zlá posloupnost", () => {
    const c = ctx({ P: 4 });
    const create = pagingActions(c)[0];
    create.run({}, "random");
    expect((c.start as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(
      20,
    );
    create.run({}, "bad");
    expect(c.start).toHaveBeenLastCalledWith(
      badSequence(4),
      undefined,
      undefined,
      "Zlá posloupnost pro LRU",
    );
    expect(create.variants![2].title).toContain("Cyklus 5 stránek");
  });
});

describe("název běhu", () => {
  it("u příkladu z přednášky uvede zdroj, jinak jen P a počet požadavků", () => {
    expect(runCaption(3, 12, null)).toBe("Simulace: P = 3, 12 požadavků");
    expect(runCaption(3, 12, "belady")).toBe(
      "Simulace: P = 3, 12 požadavků – Béládyho anomálie",
    );
    expect(runCaption(3, 25, "l04-columns")).toBe(
      "Simulace: P = 3, 25 požadavků – Matice po sloupcích (Přednáška L04, slide 10)",
    );
    expect(runCaption(4, 2, "neznámý")).toBe("Simulace: P = 4, 2 požadavky");
  });
});
