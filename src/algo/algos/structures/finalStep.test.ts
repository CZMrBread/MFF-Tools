/**
 * Společné konvence operací všech tří stránek:
 * - úspěšná operace má víc kroků a poslední krok začíná názvem operace s argumentem („Push(7): …“) –
 *   student tak vidí, že operace skončila a s jakým výsledkem;
 * - neprovedená operace je jediný chybový krok (error: true) a strukturu nemění;
 * - limity vizualizace hlídají generátory (tlačítko může být neaktivní, ale rychlé klikání je obejde).
 */
import { describe, expect, it } from "vitest";
import type { StepGen } from "../../core/steps";
import {
  HEAP_MAX,
  heapExtractMin,
  heapFrom,
  heapInsert,
  heapKeys,
  heapOf,
  makeHeap,
} from "./heap";
import {
  LIST_MAX,
  dequeue,
  enqueue,
  listDelete,
  listFind,
  listInsertAfter,
  listInsertFirst,
  listValues,
  makeList,
  stackPop,
  stackPush,
  type ListState,
} from "./list";
import { build, buildSteps, querySteps, updateSteps, xs } from "./segtree";
import { runOp } from "./testutil";

const isMinHeap = (a: number[]) =>
  a.every((v, i) => i === 0 || a[Math.floor((i - 1) / 2)] <= v);

function expectFinal<S>(state: S, op: (st: S) => StepGen<S>, prefix: string) {
  const { steps } = runOp(state, op);
  expect(steps.length, prefix).toBeGreaterThan(1);
  expect(
    steps.at(-1)!.message.startsWith(prefix + ":"),
    steps.at(-1)!.message,
  ).toBe(true);
  expect(steps.some((s) => s.error)).toBe(false);
}

function expectFailed<S extends object>(
  state: S,
  op: (st: S) => StepGen<S>,
  text: string,
) {
  const { steps, last } = runOp(state, op);
  expect(steps).toHaveLength(1);
  expect(steps[0].error).toBe(true);
  expect(steps[0].message).toContain(text);
  return last;
}

describe("poslední krok nese název operace a výsledek", () => {
  it("zásobník, fronta, seznam", () => {
    expectFinal(
      makeList("stack", [5, 12, 8]),
      (st) => stackPush(st, 7),
      "Push(7)",
    );
    expectFinal(makeList("stack", [5, 12, 8]), (st) => stackPop(st), "Pop");
    expectFinal(
      makeList("queue", [5, 12, 8]),
      (st) => enqueue(st, 7),
      "Enqueue(7)",
    );
    expectFinal(makeList("queue", [5, 12, 8]), (st) => dequeue(st), "Dequeue");
    const l = makeList("list", [5, 12, 8]);
    expectFinal(l, (st) => listInsertFirst(st, 7), "InsertFirst(7)");
    expectFinal(l, (st) => listInsertAfter(st, 2, 7), "InsertAfter(2, 7)");
    expectFinal(l, (st) => listFind(st, 12), "Find(12)");
    expectFinal(l, (st) => listFind(st, 99), "Find(99)");
    expectFinal(l, (st) => listDelete(st, 12), "Delete(12)");
    expectFinal(l, (st) => listDelete(st, 5), "Delete(5)");
    expectFinal(l, (st) => listDelete(st, 99), "Delete(99)");
  });

  it("halda", () => {
    const h = heapOf([3, 7, 5, 12, 9, 8, 6]);
    expectFinal(h, (st) => heapInsert(st, 1), "Insert(1)");
    expectFinal(h, (st) => heapExtractMin(st), "ExtractMin");
    expectFinal(h, (st) => makeHeap(st, [9, 4, 7, 1]), "MakeHeap");
  });

  it("intervalový strom", () => {
    const t = build([5, 2, 8, 1, 9, 3, 7, 4]);
    expectFinal(t, (st) => buildSteps(st, [4, 1, 3]), "Build");
    expectFinal(t, (st) => querySteps(st, 2, 6), "Min⟨2, 6⟩");
    expectFinal(t, (st) => updateSteps(st, 3, 0), "IntUpdate(3, 0)");
    expect(runOp(t, (st) => updateSteps(st, 3, 0)).steps.at(-1)!.message).toBe(
      "IntUpdate(3, 0): hotovo – přepočítali jsme 3 vrcholy na cestě do kořene, O(log n). Minimum celé posloupnosti je 0.",
    );
  });

  it("závěrečné hlášky skloňují a říkají výsledek", () => {
    expect(
      runOp(makeList("stack", [5]), (st) => stackPop(st)).steps.at(-1)!.message,
    ).toBe("Pop: vrací 5 – zásobník je teď prázdný.");
    expect(
      runOp(makeList("queue", [5, 12]), (st) => dequeue(st)).steps.at(-1)!
        .message,
    ).toBe("Dequeue: vrací 5 – na začátku je teď 12, fronta má 1 prvek.");
    expect(
      runOp(makeList("list", [5]), (st) => listFind(st, 9)).steps.at(-1)!
        .message,
    ).toBe(
      "Find(9): 9 v seznamu není – porovnali jsme ho s jediným prvkem a p došel na ∅.",
    );
    expect(
      runOp(makeList("list", []), (st) => listFind(st, 9)).steps.at(-1)!
        .message,
    ).toBe("Find(9): seznam je prázdný, vracíme ∅.");
    expect(
      runOp(makeList("list", [5, 12, 8]), (st) =>
        listInsertAfter(st, 3, 1),
      ).steps.at(-1)!.message,
    ).toContain("1 je na pozici 4");
    expect(
      runOp(heapOf([3, 7, 5]), (st) => heapInsert(st, 1)).steps.at(-1)!.message,
    ).toBe(
      "Insert(1): hotovo – halda má 4 prvky, minimum je 1. Cena O(log n).",
    );
    expect(
      runOp(build([5]), (st) => buildSteps(st, [4])).steps.at(-1)!.message,
    ).toContain("strom nad jediným listem");
    expect(
      runOp(build([5]), (st) => updateSteps(st, 0, 2)).steps.at(-1)!.message,
    ).toContain("list je zároveň kořenem");
  });
});

describe("neprovedená operace = jediný chybový krok, struktura beze změny", () => {
  it("prázdná struktura a neplatný argument", () => {
    expectFailed(
      makeList("stack", []),
      (st) => stackPop(st),
      "zásobník je prázdný",
    );
    expectFailed(
      makeList("queue", []),
      (st) => dequeue(st),
      "fronta je prázdná",
    );
    expectFailed(
      makeList("list", [5]),
      (st) => listInsertAfter(st, 1.5, 1),
      "celé číslo",
    );
    expectFailed(
      makeList("list", [5]),
      (st) => listFind(st, NaN),
      "není číslo",
    );
    expectFailed(heapOf([]), (st) => heapExtractMin(st), "halda je prázdná");
    expectFailed(
      heapOf([1]),
      (st) => makeHeap(st, []),
      "Ve vstupu není žádné číslo",
    );
    expectFailed(build([1, 2]), (st) => querySteps(st, 1, 1), "je prázdný");
    expectFailed(build([1, 2]), (st) => updateSteps(st, 5, 1), "neexistuje");
  });

  it(`zásobník, fronta i seznam berou nejvýše ${LIST_MAX} prvků (generátor hlídá limit)`, () => {
    const many = Array.from({ length: 20 }, (_, i) => i);
    expect(listValues(makeList("stack", many))).toHaveLength(LIST_MAX);
    const fullOps: [
      ListState,
      (st: ListState) => StepGen<ListState>,
      string,
    ][] = [
      [makeList("stack", many), (st) => stackPush(st, 1), "Zásobník je plný"],
      [makeList("queue", many), (st) => enqueue(st, 1), "Fronta je plná"],
      [
        makeList("list", many),
        (st) => listInsertFirst(st, 1),
        "Seznam je plný",
      ],
      [
        makeList("list", many),
        (st) => listInsertAfter(st, 1, 1),
        "Seznam je plný",
      ],
    ];
    for (const [st, op, text] of fullOps) {
      const last = expectFailed(st, op, text);
      expect(listValues(last)).toEqual(listValues(st));
    }
    // o prvek méně se ještě vejde
    const almost = makeList("stack", many.slice(0, LIST_MAX - 1));
    expect(
      listValues(runOp(almost, (st) => stackPush(st, 99)).last),
    ).toHaveLength(LIST_MAX);
  });
});

describe("pomůcky stránek", () => {
  it("heapFrom postaví haldu jako MakeHeap (pro sdílený odkaz), bez zvýraznění", () => {
    const h = heapFrom([15, 3, 9, 1, 12, 7, 4, 10]);
    expect(isMinHeap(heapKeys(h))).toBe(true);
    expect(heapKeys(h).sort((a, b) => a - b)).toEqual([
      1, 3, 4, 7, 9, 10, 12, 15,
    ]);
    expect(h.marks).toEqual({});
    expect(h.vars).toEqual({});
    expect(
      heapKeys(heapFrom(Array.from({ length: 40 }, (_, i) => 40 - i))),
    ).toHaveLength(HEAP_MAX);
  });

  it("xs píše dolní index Unicode číslicemi", () => {
    expect(xs(0)).toBe("x₀");
    expect(xs(15)).toBe("x₁₅");
  });
});
