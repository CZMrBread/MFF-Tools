/**
 * BST a AVL strom (bst.ts): invarianty proti referenční množině a regrese nálezů auditu
 * (řádky pseudokódu u AVL, zpráva o odstranění následníka, ochrana proti neplatnému klíči).
 * Operace se spouštějí jako v core/useStructure: z hluboké kopie stavu, novým stavem je stav posledního kroku.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step, type StepGen } from "../../core/steps";
import {
  PC_AVL_DELETE,
  PC_AVL_INSERT,
  PC_DELETE,
  PC_FIND,
  PC_INSERT,
  emptyTree,
  find,
  insert,
  insertSilent,
  layout,
  remove,
  type TreeState,
} from "./bst";

function apply<S>(
  state: S,
  op: (s: S) => StepGen<S>,
): { steps: Step<S>[]; state: S } {
  const steps = materialize(op(structuredClone(state)));
  return { steps, state: steps.length ? steps[steps.length - 1].state : state };
}

function build(values: number[], avl: boolean): TreeState {
  const st = emptyTree(avl);
  for (const v of values) insertSilent(st, v);
  st.marks = {};
  st.edgeMarks = {};
  st.vars = {};
  return st;
}

/** In-order klíče; zároveň ověří, že ukazatele vedou na existující vrcholy a nejsou sirotci. */
function inorder(st: TreeState): number[] {
  const out: number[] = [];
  let reached = 0;
  const walk = (id: number | null) => {
    if (id === null) return;
    const n = st.nodes[id];
    expect(n, `ukazatel na neexistující vrchol ${id}`).toBeDefined();
    reached++;
    walk(n.left);
    out.push(n.key);
    walk(n.right);
  };
  walk(st.root);
  expect(reached).toBe(Object.keys(st.nodes).length);
  return out;
}

const realHeight = (st: TreeState, id: number | null): number =>
  id === null
    ? 0
    : 1 +
      Math.max(
        realHeight(st, st.nodes[id].left),
        realHeight(st, st.nodes[id].right),
      );

function assertAvl(st: TreeState, ctx: string) {
  for (const n of Object.values(st.nodes)) {
    const hl = realHeight(st, n.left);
    const hr = realHeight(st, n.right);
    expect(Math.abs(hr - hl), `${ctx}: δ(${n.key})`).toBeLessThanOrEqual(1);
    expect(n.h, `${ctx}: uložená hloubka ${n.key}`).toBe(1 + Math.max(hl, hr));
  }
}

const outOfRange = (steps: Step<unknown>[], pc: string[]) =>
  steps
    .filter((s) => s.line !== null && (s.line < 0 || s.line >= pc.length))
    .map((s) => `${s.line}: ${s.message}`);

const PAGE_DEFAULT = [40, 20, 60, 10, 30, 50, 70, 25];

describe("BST / AVL – invarianty", () => {
  for (const avl of [false, true]) {
    it(`${avl ? "AVL" : "BST"}: náhodné posloupnosti Insert/Delete/Find odpovídají množině klíčů`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        const r = rng(seed * 7919);
        let st = emptyTree(avl);
        const ref = new Set<number>();
        for (let i = 0; i < 40; i++) {
          // většinou malá celá čísla (kolize), občas záporná a neceločíselná
          const x =
            r() < 0.1
              ? -1 - Math.floor(r() * 20) + (r() < 0.5 ? 0.5 : 0)
              : Math.floor(r() * 30);
          const p = r();
          const ctx = `${avl ? "AVL" : "BST"} seed ${seed} op ${i} x=${x}`;
          const pc =
            p < 0.5
              ? avl
                ? PC_AVL_INSERT
                : PC_INSERT
              : p < 0.85
                ? avl
                  ? PC_AVL_DELETE
                  : PC_DELETE
                : PC_FIND;
          const res = apply(st, (s) =>
            p < 0.5 ? insert(s, x) : p < 0.85 ? remove(s, x) : find(s, x),
          );
          expect(outOfRange(res.steps, pc), ctx).toEqual([]);
          for (const s of res.steps) {
            const lay = layout(s.state);
            const ids = new Set(lay.nodes.map((n) => n.id));
            for (const e of lay.edges)
              expect(ids.has(e.from) && ids.has(e.to), ctx).toBe(true);
          }
          if (p < 0.5) ref.add(x);
          else if (p < 0.85) ref.delete(x);
          else
            expect(
              res.steps[res.steps.length - 1].message.includes("nalezen."),
              ctx,
            ).toBe(ref.has(x));
          st = res.state;
          expect(inorder(st), ctx).toEqual([...ref].sort((a, b) => a - b));
          if (avl) assertAvl(st, ctx);
        }
      }
    });
  }

  it("okrajové případy: prázdný strom, opakovaný Insert, Delete chybějícího klíče", () => {
    for (const avl of [false, true]) {
      let st = emptyTree(avl);
      for (const op of [find, remove]) {
        const res = apply(st, (s) => op(s, 5));
        expect(res.steps.length).toBeGreaterThan(0);
        expect(res.state.root).toBeNull();
      }
      st = apply(st, (s) => insert(s, 5)).state;
      st = apply(st, (s) => insert(s, 5)).state;
      st = apply(st, (s) => remove(s, 7)).state;
      expect(inorder(st)).toEqual([5]);
      st = apply(st, (s) => remove(s, 5)).state;
      expect(inorder(st)).toEqual([]);
    }
  });

  it("AVL Insert setříděné posloupnosti drží hloubku O(log n)", () => {
    const st = build(
      Array.from({ length: 31 }, (_, i) => i),
      true,
    );
    expect(realHeight(st, st.root)).toBe(5);
    assertAvl(st, "setříděný");
  });
});

describe("regrese: řádky pseudokódu (avl-insert/delete-pseudocode-lines)", () => {
  it("BST Insert a Delete svítí jen na řádcích PC_INSERT / PC_DELETE", () => {
    const st = build(PAGE_DEFAULT, false);
    for (const x of [35, 40, 99])
      expect(
        outOfRange(apply(st, (s) => insert(s, x)).steps, PC_INSERT),
      ).toEqual([]);
    for (const x of [40, 20, 30, 25, 99])
      expect(
        outOfRange(apply(st, (s) => remove(s, x)).steps, PC_DELETE),
      ).toEqual([]);
    // BST si ponechává podrobné řádky
    const del = apply(st, (s) => remove(s, 40)).steps;
    expect(del.find((s) => s.message.startsWith("Následník je"))!.line).toBe(5);
    expect(
      apply(st, (s) => insert(s, 35)).steps.find((s) =>
        s.message.startsWith("Připojíme"),
      )!.line,
    ).toBe(4);
  });

  it("AVL Delete: žádný krok neukazuje mimo PC_AVL_DELETE (i s jednoduchou a dvojitou rotací)", () => {
    const bad: string[] = [];
    for (const x of [40, 20, 10, 70, 60, 25])
      bad.push(
        ...outOfRange(
          apply(build(PAGE_DEFAULT, true), (s) => remove(s, x)).steps,
          PC_AVL_DELETE,
        ),
      );
    const single = apply(build([50, 30, 70, 20, 40, 80, 10], true), (s) =>
      remove(s, 80),
    ).steps;
    const double = apply(build([50, 30, 70, 20, 40, 80, 35], true), (s) =>
      remove(s, 80),
    ).steps;
    expect(single.some((s) => s.message.startsWith("Rotace doprava"))).toBe(
      true,
    );
    expect(double.some((s) => s.message.startsWith("Dvojitá rotace"))).toBe(
      true,
    );
    bad.push(
      ...outOfRange(single, PC_AVL_DELETE),
      ...outOfRange(double, PC_AVL_DELETE),
    );
    expect(bad).toEqual([]);
    // rotace doprava při δ = −2 svítí na řádku jednoduché rotace doprava
    for (const s of single.filter((s) =>
      s.message.startsWith("Rotace doprava"),
    ))
      expect(PC_AVL_DELETE[s.line!]).toMatch(/jednoduchá rotace doprava/);
    for (const s of double.filter((s) => /^Rotace|je teď nad/.test(s.message)))
      expect(PC_AVL_DELETE[s.line!]).toMatch(/dvojitá rotace/);
  });

  it("AVL Delete: kroky samotného mazání svítí na řádku „Smažeme x…“", () => {
    const wrong: string[] = [];
    for (const x of [40, 20, 10, 30]) {
      for (const s of apply(build(PAGE_DEFAULT, true), (st) => remove(st, x))
        .steps) {
        if (
          !/odpojíme ho|nahradíme ho jím|má dva syny|Následník je|Zkopírujeme klíč|vrchol následníka/.test(
            s.message,
          )
        )
          continue;
        const text = s.line === null ? "" : (PC_AVL_DELETE[s.line] ?? "<mimo>");
        if (!/Smažeme x/.test(text)) wrong.push(`„${s.message}“ → ${text}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("AVL Insert: připojení listu a duplicitní klíč svítí na řádku „Vložíme x…“", () => {
    const st = build(PAGE_DEFAULT, true);
    const attach = apply(st, (s) => insert(s, 35)).steps.find((s) =>
      s.message.startsWith("Připojíme nový list"),
    )!;
    expect(PC_AVL_INSERT[attach.line!]).toMatch(/Vložíme x/);
    const dup = apply(st, (s) => insert(s, 30)).steps.find((s) =>
      s.message.includes("už ve stromu je"),
    )!;
    expect(PC_AVL_INSERT[dup.line!]).toMatch(/Vložíme x/);
  });

  it("AVL Insert: dvojitá rotace pro δ = +2 nesvítí na větvi −2 a naopak", () => {
    const rl = apply(build([10, 30], true), (s) => insert(s, 20)).steps;
    expect(rl.some((s) => s.message.startsWith("Dvojitá rotace"))).toBe(true);
    expect(
      rl
        .filter((s) => s.line !== null && /−2/.test(PC_AVL_INSERT[s.line]))
        .map((s) => s.message),
    ).toEqual([]);
    const lr = apply(build([30, 10], true), (s) => insert(s, 20)).steps;
    expect(
      lr.some((s) =>
        s.message.startsWith("Dvojitá rotace: nejdřív doleva u levého syna"),
      ),
    ).toBe(true);
    expect(
      lr
        .filter(
          (s) =>
            s.line !== null && /\+2|δ\(y\) ≥ 0/.test(PC_AVL_INSERT[s.line]),
        )
        .map((s) => s.message),
    ).toEqual([]);
  });
});

describe("regrese: bst-delete-message-wrong-node", () => {
  it("Delete(40) se dvěma syny: poslední krok mluví o odstranění vrcholu následníka 50", () => {
    for (const avl of [false, true]) {
      const steps = apply(build(PAGE_DEFAULT, avl), (s) => remove(s, 40)).steps;
      const i = steps.findIndex((s) =>
        s.message.includes("v pravém podstromu odstraníme"),
      );
      expect(i).toBeGreaterThan(0);
      expect(
        Object.values(steps[i - 1].state.nodes).some((n) => n.key === 40),
      ).toBe(false);
      expect(steps[i].message).toContain("50");
      expect(steps[i].message).not.toContain("40");
    }
  });
});

describe("ochrana vstupu", () => {
  it("NaN a nekonečno operaci odmítnou jediným chybovým krokem, strom se nezmění", () => {
    const st = build(PAGE_DEFAULT, true);
    for (const x of [NaN, Infinity, -Infinity]) {
      for (const op of [find, insert, remove]) {
        const res = apply(st, (s) => op(s, x));
        expect(res.steps.length).toBe(1);
        expect(res.steps[0].error).toBe(true);
        expect(inorder(res.state)).toEqual(inorder(st));
      }
    }
  });

  it("velká, záporná a desetinná čísla fungují jako klíče", () => {
    let st = emptyTree(true);
    for (const x of [1e15, -7, 2.5, -0.25, 1e15])
      st = apply(st, (s) => insert(s, x)).state;
    expect(inorder(st)).toEqual([-7, -0.25, 2.5, 1e15]);
  });
});
