/**
 * Legendy musí odpovídat třídám, které generátory skutečně kreslí (nález structures-legend-mismatch):
 * každá vykreslená třída má položku a každá položka se v nějaké operaci opravdu objeví.
 */
import { describe, expect, it } from "vitest";
import type { Step, StepGen } from "../../core/steps";
import {
  heapExtractMin,
  heapInsert,
  heapOf,
  makeHeap,
  type HeapState,
} from "./heap";
import {
  HEAP_LEGEND,
  heapClasses,
  LIST_LEGEND,
  listClasses,
  pickLegend,
  SEG_LEGEND,
  segClasses,
} from "./legend";
import {
  dequeue,
  enqueue,
  listDelete,
  listFind,
  listInsertAfter,
  listInsertFirst,
  makeList,
  stackPop,
  stackPush,
  type ListKind,
  type ListState,
} from "./list";
import {
  build,
  buildSteps,
  querySteps,
  updateSteps,
  type SegState,
} from "./segtree";
import { runOp } from "./testutil";

/** spustí operace za sebou (jako stránka) a vrátí kroky každé z nich */
function chain<S>(init: S, ops: ((st: S) => StepGen<S>)[]): Step<S>[][] {
  let st = init;
  return ops.map((op) => {
    const r = runOp(st, op);
    st = r.last;
    return r.steps;
  });
}

const keys = (entries: { key: string }[]) => entries.map((e) => e.key).sort();

describe("legenda zásobníku, fronty a seznamu", () => {
  const runs: Record<ListKind, Step<ListState>[][]> = {
    stack: chain(makeList("stack", [5, 12, 8]), [
      (st) => stackPush(st, 7),
      (st) => stackPop(st),
    ]),
    queue: chain(makeList("queue", [5, 12, 8]), [
      (st) => enqueue(st, 7),
      (st) => dequeue(st),
    ]),
    list: chain(makeList("list", [5, 12, 8]), [
      (st) => listFind(st, 12),
      (st) => listFind(st, 99),
      (st) => listInsertFirst(st, 1),
      (st) => listInsertAfter(st, 2, 7),
      (st) => listDelete(st, 8),
      (st) => listDelete(st, 1),
    ]),
  };

  for (const kind of ["stack", "queue", "list"] as ListKind[]) {
    it(`${kind}: legenda obsahuje přesně třídy, které se kreslí`, () => {
      const used = new Set<string>();
      for (const steps of runs[kind])
        for (const c of listClasses(steps)) used.add(c);
      expect(keys(LIST_LEGEND[kind])).toEqual([...used].sort());
    });
  }

  it("během operace ukazuje jen značky, které se v ní vyskytnou", () => {
    const [push] = runs.stack;
    expect(
      pickLegend(LIST_LEGEND.stack, listClasses(push)).map((i) => i.label),
    ).toEqual(["nový prvek"]);
    const [find] = runs.list;
    expect(
      pickLegend(LIST_LEGEND.list, listClasses(find)).map((i) => i.cls),
    ).toEqual(["sw-compare", "sw-found", "sw-removed"]);
  });

  it("v klidu (žádné zvýraznění) ukáže celou legendu stránky", () => {
    const idle = [{ state: makeList("list", [1]), line: null, message: "" }];
    expect(pickLegend(LIST_LEGEND.list, listClasses(idle))).toHaveLength(
      LIST_LEGEND.list.length,
    );
  });

  it("odebíraný prvek má čárkovaný vzorek jako čárkovaná krabička na plátně", () => {
    for (const kind of ["stack", "queue", "list"] as ListKind[]) {
      expect(
        LIST_LEGEND[kind].find((e) => e.key === "box-removed")!.item.cls,
      ).toBe("sw-removed-dashed");
    }
  });
});

describe("legenda haldy", () => {
  it("obsahuje přesně značky z Insert, ExtractMin a MakeHeap a každá má znak jako v poli", () => {
    const used = new Set<string>();
    const runs = chain<HeapState>(heapOf([3, 7, 5, 12, 9, 8, 6]), [
      (st) => heapInsert(st, 1),
      (st) => heapExtractMin(st),
      (st) => makeHeap(st, [9, 4, 7, 1, 8]),
    ]);
    for (const steps of runs) for (const c of heapClasses(steps)) used.add(c);
    expect(keys(HEAP_LEGEND)).toEqual([...used].sort());
    for (const e of HEAP_LEGEND) expect(e.item.glyph, e.key).toBeTruthy();
  });
});

describe("legenda intervalového stromu", () => {
  it("obsahuje přesně třídy z Build, dotazu a změny prvku (včetně už prošlého vrcholu a dotazovaných listů)", () => {
    const used = new Set<string>();
    const runs = chain<SegState>(build([5, 2, 8, 1, 9, 3, 7, 4]), [
      (st) => buildSteps(st, [5, 2, 8, 1, 9, 3, 7, 4]),
      (st) => querySteps(st, 1, 7),
      (st) => updateSteps(st, 3, 0),
    ]);
    for (const steps of runs) for (const c of segClasses(steps)) used.add(c);
    expect(keys(SEG_LEGEND)).toEqual([...used].sort());
    expect(SEG_LEGEND.find((e) => e.key === "n-visited")!.item.cls).toBe(
      "sw-visited",
    );
  });

  it("dotaz ukáže jen svoje značky, ne zápis hodnot z Build", () => {
    const [q] = chain<SegState>(build([5, 2, 8, 1]), [
      (st) => querySteps(st, 1, 3),
    ]);
    const shown = pickLegend(SEG_LEGEND, segClasses(q)).map((i) => i.label);
    expect(shown).not.toContain("zapsaná / přepočítaná hodnota");
    expect(shown).toContain("kanonický interval (nahlášený vrchol)");
  });
});
