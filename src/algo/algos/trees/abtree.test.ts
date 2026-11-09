/**
 * (a,b)-strom (abtree.ts): invarianty (stupně, hloubka listů, oddělovače i v mezikrocích) a regrese
 * nálezů auditu (zastaralé zvýraznění oddělovače, ochrana proti neplatným parametrům a klíčům).
 */
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step, type StepGen } from "../../core/steps";
import {
  PC_AB_DELETE,
  PC_AB_FIND,
  PC_AB_INSERT,
  abDelete,
  abFind,
  abInsert,
  abInsertSilent,
  abKeys,
  emptyAB,
  layoutAB,
  type ABState,
} from "./abtree";

function apply<S>(
  state: S,
  op: (s: S) => StepGen<S>,
): { steps: Step<S>[]; state: S } {
  const steps = materialize(op(structuredClone(state)));
  return { steps, state: steps.length ? steps[steps.length - 1].state : state };
}

const fail = (msg: string): never => {
  throw new Error(msg);
};

/** Ověří invarianty (a,b)-stromu a vrátí klíče v listech zleva doprava. */
function assertAb(st: ABState, ctx: string): number[] {
  if (st.root === null) {
    if (Object.keys(st.nodes).length) fail(`${ctx}: prázdný strom se sirotky`);
    return [];
  }
  const leaves: number[] = [];
  const depths = new Set<number>();
  let reached = 0;
  const walk = (id: number, d: number): number => {
    const n =
      st.nodes[id] ?? fail(`${ctx}: ukazatel na neexistující vrchol ${id}`);
    reached++;
    if (n.children.length === 0) {
      if (n.keys.length !== 1) fail(`${ctx}: list s ${n.keys.length} klíči`);
      leaves.push(n.keys[0]);
      depths.add(d);
      return n.keys[0];
    }
    const min = id === st.root ? 2 : st.a;
    if (n.children.length < min || n.children.length > st.b)
      fail(`${ctx}: vrchol [${n.keys}] má ${n.children.length} synů`);
    const maxes = n.children.map((c) => walk(c, d + 1));
    if (n.keys.join(",") !== maxes.slice(0, -1).join(","))
      fail(`${ctx}: oddělovače [${n.keys}] ≠ maxima [${maxes.slice(0, -1)}]`);
    return maxes[maxes.length - 1];
  };
  walk(st.root, 0);
  if (reached !== Object.keys(st.nodes).length) fail(`${ctx}: sirotci`);
  if (depths.size !== 1) fail(`${ctx}: listy v různých hloubkách`);
  for (let i = 1; i < leaves.length; i++)
    if (!(leaves[i - 1] < leaves[i])) fail(`${ctx}: listy nejsou rostoucí`);
  return leaves;
}

const outOfRange = (steps: Step<unknown>[], pc: string[]) =>
  steps
    .filter((s) => s.line !== null && (s.line < 0 || s.line >= pc.length))
    .map((s) => `${s.line}: ${s.message}`);
const PAGE_DEFAULT = [5, 12, 20, 33, 41, 47, 58, 63, 71];

const PARAMS = [
  [2, 3],
  [2, 4],
  [3, 5],
  [3, 6],
  [4, 7],
] as const;

describe("(a,b)-strom – invarianty", () => {
  for (const [a, b] of PARAMS) {
    it(`(${a},${b}): náhodné posloupnosti drží invarianty a množinu klíčů`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const r = rng(seed * 65537 + a * 10 + b);
        let st = emptyAB(a, b);
        const ref = new Set<number>();
        for (let i = 0; i < 50; i++) {
          const x = Math.floor(r() * 40) - 4 + (r() < 0.05 ? 0.5 : 0);
          const p = r();
          const ctx = `(${a},${b}) seed ${seed} op ${i} x=${x}`;
          const pc =
            p < 0.5 ? PC_AB_INSERT : p < 0.85 ? PC_AB_DELETE : PC_AB_FIND;
          const res = apply(st, (s) =>
            p < 0.5 ? abInsert(s, x) : p < 0.85 ? abDelete(s, x) : abFind(s, x),
          );
          expect(res.steps.length, ctx).toBeGreaterThan(0);
          expect(outOfRange(res.steps, pc), ctx).toEqual([]);
          if (p < 0.5) ref.add(x);
          else if (p < 0.85) ref.delete(x);
          else
            expect(
              res.steps[res.steps.length - 1].message.includes("nalezeno"),
              ctx,
            ).toBe(ref.has(x));
          for (const s of res.steps) {
            const lay = layoutAB(s.state);
            const ids = new Set(lay.nodes.map((n) => n.id));
            for (const e of lay.edges)
              if (!ids.has(e.from) || !ids.has(e.to))
                fail(`${ctx}: hrana na nevykreslený vrchol`);
            // zvýrazněný oddělovač musí ve vrcholu existovat
            for (const [id, h] of Object.entries(s.state.hot))
              if (h < 0 || h >= (s.state.nodes[Number(id)]?.keys.length ?? 0))
                fail(`${ctx}: hot mimo vrchol`);
          }
          st = res.state;
          expect(assertAb(st, ctx), ctx).toEqual(
            [...ref].sort((x1, x2) => x1 - x2),
          );
        }
      }
    });
  }

  it("abInsertSilent staví stejný strom jako krokovaný Insert", () => {
    const vals = [5, 12, 20, 33, 41, 47, 58, 63, 71, 12, 1, 99];
    const silent = emptyAB(2, 3);
    let stepped = emptyAB(2, 3);
    for (const v of vals) {
      abInsertSilent(silent, v);
      stepped = apply(stepped, (s) => abInsert(s, v)).state;
    }
    expect(assertAb(silent, "silent")).toEqual(assertAb(stepped, "stepped"));
    expect(abKeys(silent)).toEqual([1, 5, 12, 20, 33, 41, 47, 58, 63, 71, 99]);
  });

  it("smazání všech klíčů vrátí prázdný strom", () => {
    let st = emptyAB(2, 3);
    for (const v of PAGE_DEFAULT) abInsertSilent(st, v);
    for (const v of PAGE_DEFAULT) st = apply(st, (s) => abDelete(s, v)).state;
    expect(st.root).toBeNull();
    expect(st.nodes).toEqual({});
  });
});

describe("regrese: ab-stale-hot-highlight", () => {
  it("Delete(5) ve výchozím (2,3)-stromu: sloučené vrcholy nemají zvýrazněný oddělovač ze sestupu", () => {
    const st = emptyAB(2, 3);
    for (const v of PAGE_DEFAULT) abInsertSilent(st, v);
    const steps = apply(st, (s) => abDelete(s, 5)).steps;
    const merges = steps.filter((s) => s.message.startsWith("Sloučíme"));
    expect(merges.length).toBe(2);
    for (const s of merges) expect(s.state.hot).toEqual({});
  });

  it("Insert s dělením: po přidání listu zůstává zvýrazněný jen nový oddělovač v otci", () => {
    const st = emptyAB(2, 3);
    for (const v of PAGE_DEFAULT) abInsertSilent(st, v);
    const steps = apply(st, (s) => abInsert(s, 25)).steps;
    const i = steps.findIndex((s) => s.message.startsWith("Přidáme list"));
    expect(i).toBeGreaterThan(0);
    expect(steps[i].state.hot).toEqual({});
    for (const s of steps.filter((s) =>
      s.message.includes("přesuneme do nového bratra"),
    ))
      expect(Object.keys(s.state.hot).length).toBe(1);
  });
});

describe("ochrana vstupu", () => {
  it("neplatné parametry (a,b) operaci odmítnou místo nekonečného dělení", () => {
    for (const [a, b] of [
      [1, 2],
      [2, 2],
      [3, 4],
      [2.5, 5],
      [NaN, 3],
    ]) {
      const st = emptyAB(a, b);
      for (const op of [abInsert, abDelete]) {
        const res = apply(st, (s) => op(s, 5));
        expect(res.steps.length).toBe(1);
        expect(res.steps[0].error).toBe(true);
        expect(res.steps[0].message).toMatch(/nejsou platné/);
      }
    }
  });

  it("NaN a nekonečno jako klíč operaci odmítnou", () => {
    const st = emptyAB(2, 3);
    for (const v of PAGE_DEFAULT) abInsertSilent(st, v);
    for (const x of [NaN, Infinity]) {
      for (const op of [abFind, abInsert, abDelete]) {
        const res = apply(st, (s) => op(s, x));
        expect(res.steps.length).toBe(1);
        expect(res.steps[0].error).toBe(true);
        expect(abKeys(res.state)).toEqual(PAGE_DEFAULT);
      }
    }
  });
});
