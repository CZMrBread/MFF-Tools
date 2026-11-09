/**
 * (a,b)-strom podle Průvodce 8.3 (klíče ve vnitřních vrcholech, vnější vrcholy bez dat): AbInsert se
 * štěpením (m = ⌊(b+1)/2⌋), AbDelete s nahrazením následníkem, půjčkou od bratra a slučováním
 * (nejdřív levý bratr). Očekávané tvary jsou opsané z obrázků 8.7–8.10 (str. 199–203).
 * Zápis tvaru: [klíče](synové), vrchol na předposlední hladině jen [klíče] (vnější listy se nepíší).
 */
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step } from "../../core/steps";
import {
  PC_BOOK_DELETE,
  PC_BOOK_FIND,
  PC_BOOK_INSERT,
  abBookFromSpec,
  bookDelete,
  bookFind,
  bookInsert,
} from "./abBook";
import {
  abHeight,
  abKeys,
  abSummary,
  emptyAB,
  layoutAB,
  type ABState,
} from "./abtree";
import { AB_PARAMS } from "./abOps";

function shape(st: ABState): string {
  const rec = (id: number): string => {
    const n = st.nodes[id];
    const k = `[${n.keys.join(" ")}]`;
    return n.children.length ? `${k}(${n.children.map(rec).join(",")})` : k;
  };
  return st.root === null ? "" : rec(st.root);
}

function run(
  st: ABState,
  gen: (s: ABState) => Generator<Step<ABState>, void, unknown>,
) {
  const steps = materialize(gen(structuredClone(st)));
  return { steps, st: steps[steps.length - 1].state };
}

/** Invarianty (a,b)-stromu z definice v Průvodci 8.3. */
function checkInvariants(st: ABState, ctx: string) {
  if (st.root === null) return;
  let leafDepth = -1;
  const walk = (id: number, d: number, lo: number, hi: number) => {
    const n = st.nodes[id];
    expect(n, ctx).toBeDefined();
    const isRoot = id === st.root;
    // počet synů = počet klíčů + 1 (i vnější listy)
    expect(n.keys.length + 1, ctx).toBeLessThanOrEqual(st.b);
    expect(n.keys.length + 1, ctx).toBeGreaterThanOrEqual(isRoot ? 2 : st.a);
    for (let i = 1; i < n.keys.length; i++)
      expect(n.keys[i - 1], ctx).toBeLessThan(n.keys[i]);
    for (const k of n.keys) {
      expect(k, ctx).toBeGreaterThan(lo);
      expect(k, ctx).toBeLessThan(hi);
    }
    if (n.children.length === 0) {
      if (leafDepth < 0) leafDepth = d;
      expect(d, `${ctx}: vnější listy ve stejné hloubce`).toBe(leafDepth);
      return;
    }
    expect(n.children.length, ctx).toBe(n.keys.length + 1);
    n.children.forEach((c, i) =>
      walk(
        c,
        d + 1,
        i === 0 ? lo : n.keys[i - 1],
        i === n.keys.length ? hi : n.keys[i],
      ),
    );
  };
  walk(st.root, 0, -Infinity, Infinity);
  // žádné osiřelé vrcholy
  let count = 0;
  const cnt = (id: number) => {
    count++;
    st.nodes[id].children.forEach(cnt);
  };
  cnt(st.root);
  expect(count, ctx).toBe(Object.keys(st.nodes).length);
}

const inRange = (steps: Step<ABState>[], pc: string[]) =>
  steps
    .filter((s) => s.line !== null && (s.line < 0 || s.line >= pc.length))
    .map((s) => `${s.line}: ${s.message}`);

describe("abBookFromSpec a pohled na strom (varianta kniha)", () => {
  it("obr. 8.7 vlevo: [4 7]([1 3],[6],[9]) – klíče in-order, výška = hloubka vnějších listů", () => {
    const st = abBookFromSpec(2, 3, { k: [4, 7], c: [[1, 3], [6], [9]] });
    expect(st.variant).toBe("kniha");
    expect(shape(st)).toBe("[4 7]([1 3],[6],[9])");
    expect(abKeys(st)).toEqual([1, 3, 4, 6, 7, 9]);
    expect(abHeight(st)).toBe(2);
    expect(abSummary(st)).toBe("strom má 6 klíčů, výška 2");
    checkInvariants(st, "obr. 8.7");
  });

  it("rozložení: každý vnitřní vrchol jednou, hrany otec → syn, syn pod otcem", () => {
    const st = abBookFromSpec(2, 3, { k: [4, 7], c: [[1, 3], [6], [9]] });
    const lay = layoutAB(st);
    expect(lay.nodes).toHaveLength(4);
    expect(lay.edges).toHaveLength(3);
    const root = lay.nodes.find((n) => n.keys.join(" ") === "4 7")!;
    expect(root.y).toBe(0);
    const xs = lay.nodes.filter((n) => n.y === 1).map((n) => n.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(Math.min(...xs)).toBeLessThan(root.x);
    expect(Math.max(...xs)).toBeGreaterThan(root.x);
  });

  it("prázdný strom v knižní variantě", () => {
    const st = emptyAB(2, 3, "kniha");
    expect(st.variant).toBe("kniha");
    expect(abKeys(st)).toEqual([]);
    expect(abHeight(st)).toBe(0);
    expect(layoutAB(st).nodes).toEqual([]);
  });
});

describe("Find (Průvodce 8.3, Hledání klíče)", () => {
  const st = abBookFromSpec(2, 3, { k: [4, 7], c: [[1, 3], [6], [9]] });
  it("klíč ve vnitřním vrcholu se najde hned (bez sestupu do listu)", () => {
    const r = run(st, (s) => bookFind(s, 4));
    expect(r.steps.at(-1)!.message).toMatch(/^Find\(4\): nalezeno/);
    expect(r.steps.at(-1)!.outcome).toBeUndefined();
    expect(inRange(r.steps, PC_BOOK_FIND)).toEqual([]);
  });
  it("chybějící klíč skončí ve vnějším listu – ⓘ", () => {
    const r = run(st, (s) => bookFind(s, 5));
    expect(r.steps.some((s) => /list/.test(s.message))).toBe(true);
    expect(r.steps.at(-1)!.outcome).toBe("neutral");
    expect(shape(r.st)).toBe(shape(st));
  });
});

describe("Insert (AbInsert, obr. 8.8)", () => {
  it("obr. 8.8: Insert(6) do [2 8]([1],[4 5],[9]) – [4 5 6] se rozštěpí, 5 jde do otce; přeplněný kořen [2 5 8] se rozštěpí také", () => {
    const st = abBookFromSpec(2, 3, { k: [2, 8], c: [[1], [4, 5], [9]] });
    const r = run(st, (s) => bookInsert(s, 6));
    const shapes = r.steps.map((s) => shape(s.state));
    expect(shapes).toContain("[2 8]([1],[4 5 6],[9])");
    expect(shapes).toContain("[2 5 8]([1],[4],[6],[9])");
    expect(shape(r.st)).toBe("[5]([2]([1],[4]),[8]([6],[9]))");
    expect(inRange(r.steps, PC_BOOK_INSERT)).toEqual([]);
    expect(r.steps.at(-1)!.message).toMatch(/výška vzrostla o 1/);
  });

  it("štěpení podle kroku 11: m = ⌊(b+1)/2⌋ – v (2,4)-stromu [1 2 3 4] → [1] | 2 | [3 4]", () => {
    let st = emptyAB(2, 4, "kniha");
    for (const x of [1, 2, 3, 4]) st = run(st, (s) => bookInsert(s, x)).st;
    expect(shape(st)).toBe("[2]([1],[3 4])");
  });

  it("vložení do prázdného stromu a existující klíč (ⓘ)", () => {
    const one = run(emptyAB(2, 3, "kniha"), (s) => bookInsert(s, 7)).st;
    expect(shape(one)).toBe("[7]");
    const again = run(one, (s) => bookInsert(s, 7));
    expect(again.steps.at(-1)!.outcome).toBe("neutral");
    expect(shape(again.st)).toBe("[7]");
  });
});

describe("Delete (AbDelete, obr. 8.9 a 8.10)", () => {
  it("obr. 8.9: Delete(5) z [4 7]([2],[5],[9]) – levý bratr má jen a synů, sloučení s klíčem 4 z otce", () => {
    const st = abBookFromSpec(2, 3, { k: [4, 7], c: [[2], [5], [9]] });
    const r = run(st, (s) => bookDelete(s, 5));
    expect(shape(r.st)).toBe("[7]([2 4],[9])");
    expect(r.steps.some((s) => /sloučíme/i.test(s.message))).toBe(true);
    expect(inRange(r.steps, PC_BOOK_DELETE)).toEqual([]);
  });

  it("obr. 8.10: Delete(5) z [4 7]([2 3],[5],[9]) – půjčka: 3 jde do otce, 4 do podtečeného vrcholu", () => {
    const st = abBookFromSpec(2, 3, { k: [4, 7], c: [[2, 3], [5], [9]] });
    const r = run(st, (s) => bookDelete(s, 5));
    expect(shape(r.st)).toBe("[3 7]([2],[4],[9])");
    expect(r.steps.some((s) => /půjč/i.test(s.message))).toBe(true);
  });

  it("klíč na vyšší hladině nahradí následník (minimum pravého podstromu): obr. 8.7 vlevo, Delete(4)", () => {
    const st = abBookFromSpec(2, 3, { k: [4, 7], c: [[1, 3], [6], [9]] });
    const r = run(st, (s) => bookDelete(s, 4));
    expect(r.steps.some((s) => /následník/i.test(s.message))).toBe(true);
    // 6 nahradí 4, [ ] si půjčí od levého bratra [1 3]
    expect(shape(r.st)).toBe("[3 7]([1],[6],[9])");
  });

  it("bez levého bratra se použije pravý (zrcadlově); kořen bez klíčů zmizí a výška klesne", () => {
    const st = abBookFromSpec(2, 3, { k: [4], c: [[2], [6]] });
    const r = run(st, (s) => bookDelete(s, 2));
    expect(shape(r.st)).toBe("[4 6]");
    expect(r.steps.at(-1)!.message).toMatch(/výška klesla o 1/);
    const borrow = run(
      abBookFromSpec(2, 3, { k: [4], c: [[2], [6, 8]] }),
      (s) => bookDelete(s, 2),
    );
    expect(shape(borrow.st)).toBe("[6]([4],[8])");
  });

  it("chybějící klíč ⓘ, poslední klíč vyprázdní strom", () => {
    const st = abBookFromSpec(2, 3, { k: [4] });
    const miss = run(st, (s) => bookDelete(s, 5));
    expect(miss.steps.at(-1)!.outcome).toBe("neutral");
    const last = run(st, (s) => bookDelete(s, 4));
    expect(last.st.root).toBeNull();
    expect(last.steps.at(-1)!.message).toMatch(/prázdný/);
  });
});

describe("náhodné posloupnosti operací – invarianty pro všechny (a,b)", () => {
  for (const [a, b] of AB_PARAMS)
    it(`(${a},${b})`, () => {
      const r = rng(a * 31 + b);
      let st = emptyAB(a, b, "kniha");
      const ref = new Set<number>();
      for (let i = 0; i < 300; i++) {
        const x = Math.floor(r() * 60);
        const ctx = `(${a},${b}) op ${i} x=${x}`;
        const p = r();
        if (p < 0.55) {
          const res = run(st, (s) => bookInsert(s, x));
          expect(inRange(res.steps, PC_BOOK_INSERT), ctx).toEqual([]);
          st = res.st;
          ref.add(x);
        } else if (p < 0.9) {
          const res = run(st, (s) => bookDelete(s, x));
          expect(inRange(res.steps, PC_BOOK_DELETE), ctx).toEqual([]);
          st = res.st;
          ref.delete(x);
        } else {
          const res = run(st, (s) => bookFind(s, x));
          expect(res.steps.at(-1)!.outcome === undefined, ctx).toBe(ref.has(x));
        }
        expect(abKeys(st), ctx).toEqual([...ref].sort((p, q) => p - q));
        checkInvariants(st, ctx);
      }
    });
});
