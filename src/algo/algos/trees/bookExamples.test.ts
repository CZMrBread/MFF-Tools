/**
 * Příklady z knihy (Průvodce, kap. 8) a z přednášky DS I (L02 splay, L03 (a,b)-stromy):
 * každý příklad postaví přesně strom z obrázku a operace z obrázku skončí ve výsledku z obrázku.
 * Očekávané tvary jsou opsané z PDF (str. 185, 188, 189, 192, 193; snímky L02/3, L03/4 a L03/6),
 * nezávisle na datech v bookExamples.ts. Zápis tvaru: klíč(levý,pravý), u (a,b)-stromu [oddělovače](synové).
 */
import { describe, expect, it } from "vitest";
import { materialize, type Step } from "../../core/steps";
import { bookExampleById } from "../structures/bookExample";
import type { ABState } from "./abtree";
import { abKeys } from "./abtree";
import { planAbOp } from "./abOps";
import {
  AB_BOOK_EXAMPLES,
  TREE_BOOK_EXAMPLES,
  abFromSpec,
  type AbBookExample,
  type TreeBookExample,
} from "./bookExamples";
import type { TreeState } from "./bst";
import { planOp, type Kind } from "./treeOps";

const KINDS: Kind[] = ["bst", "avl", "splay", "bb"];

function shape(st: TreeState): string {
  const rec = (id: number | null): string => {
    if (id === null) return "";
    const n = st.nodes[id];
    if (n.left === null && n.right === null) return String(n.key);
    return `${n.key}(${rec(n.left)},${rec(n.right)})`;
  };
  return rec(st.root);
}

function abShape(st: ABState): string {
  const rec = (id: number): string => {
    const n = st.nodes[id];
    if (!n.children.length) return String(n.keys[0]);
    return `[${n.keys.join(" ")}](${n.children.map(rec).join(",")})`;
  };
  return st.root === null ? "" : rec(st.root);
}

function treeExample(kind: Kind, id: string): TreeBookExample {
  const ex = bookExampleById(TREE_BOOK_EXAMPLES[kind], id);
  if (!ex) throw new Error(`příklad ${kind}/${id} chybí`);
  return ex;
}

/** Operace příkladu jedna po druhé jako na stránce; vrátí stavy po každé a kroky všech. */
function runTree(kind: Kind, ex: TreeBookExample) {
  let st = ex.build();
  const after: string[] = [];
  const steps: Step<TreeState>[] = [];
  for (const { op, x } of ex.ops) {
    const s = materialize(planOp(kind, op, x).run(structuredClone(st)));
    steps.push(...s);
    st = s[s.length - 1].state;
    after.push(shape(st));
  }
  return { after, steps, messages: steps.map((s) => s.message) };
}

describe("BST – Průvodce, kap. 8.1", () => {
  it("Obr. 8.1 (str. 185): levý strom 7 | 4 9 | 2 5 8", () => {
    const ex = treeExample("bst", "obr-8-1a");
    expect(ex.page).toBe(185);
    expect(shape(ex.build())).toBe("7(4(2,5),9(8,))");
  });

  it("Obr. 8.1 (str. 185): pravý strom – tytéž klíče jako „liána“ 4 → 5 → 7 → 8 → 9", () => {
    expect(shape(treeExample("bst", "obr-8-1b").build())).toBe(
      "4(2,5(,7(,8(,9))))",
    );
  });

  it("Obr. 8.2 (str. 188): smažeme 2 a 4 (prostřední obr.), pak 3 – nahradí ho následník 5", () => {
    const ex = treeExample("bst", "obr-8-2");
    expect(ex.page).toBe(188);
    expect(shape(ex.build())).toBe("3(2(0(,1),),7(5(4,6),8(,9)))");
    expect(ex.ops).toEqual([
      { op: "delete", x: 2 },
      { op: "delete", x: 4 },
      { op: "delete", x: 3 },
    ]);
    const r = runTree("bst", ex);
    expect(r.after[1]).toBe("3(0(,1),7(5(,6),8(,9)))");
    expect(r.after[2]).toBe("5(0(,1),7(6,8(,9)))");
    expect(r.messages).toContain("Následník je 5.");
  });

  it("Obr. 8.3 (str. 189): dokonale vyvážený BVS 1 … 15 – stejný v BST, AVL i BB[α]", () => {
    const want = "8(4(2(1,3),6(5,7)),12(10(9,11),14(13,15)))";
    for (const kind of ["bst", "avl", "bb"] as const) {
      const ex = treeExample(kind, "obr-8-3");
      expect(ex.page, kind).toBe(189);
      expect(shape(ex.build()), kind).toBe(want);
    }
  });
});

describe("AVL – Průvodce, kap. 8.2", () => {
  it("Obr. 8.4 (str. 192): minimální AVL strom hloubky 3 (A₃ = 7 vrcholů)", () => {
    const ex = treeExample("avl", "obr-8-4");
    expect(ex.page).toBe(192);
    expect(shape(ex.build())).toBe("5(3(2(1,),4),7(6,))");
    expect(ex.note).toMatch(/klíče/i);
  });

  it("Obr. 8.5 (str. 193): Insert(0) vyvolá jednoduchou rotaci y(x(A,B),C) → x(A,y(B,C))", () => {
    const ex = treeExample("avl", "obr-8-5");
    expect(ex.page).toBe(193);
    expect(shape(ex.build())).toBe("4(2(1,3),5)");
    expect(ex.ops).toEqual([{ op: "insert", x: 0 }]);
    const r = runTree("avl", ex);
    expect(r.after[0]).toBe("2(1(0,),4(3,5))");
    expect(r.messages.at(-1)).toContain("1 rotace");
    expect(r.messages.some((m) => m.startsWith("Dvojitá rotace"))).toBe(false);
  });

  it("Obr. 8.6 (str. 193): Delete(8) vyvolá dvojitou rotaci z(x(A,y(B,C)),D) → y(x(A,B),z(C,D))", () => {
    const ex = treeExample("avl", "obr-8-6");
    expect(shape(ex.build())).toBe("6(2(1,4(3,5)),7(,8))");
    expect(ex.ops).toEqual([{ op: "delete", x: 8 }]);
    const r = runTree("avl", ex);
    expect(r.after[0]).toBe("4(2(1,3),6(5,7))");
    expect(r.messages.some((m) => m.startsWith("Dvojitá rotace"))).toBe(true);
  });
});

describe("splay – přednáška L02, snímek 3", () => {
  const cases = [
    ["l02-zig", "4(2(1,3),5)", 2, "2(1,4(3,5))", /→ zig\.$/],
    ["l02-zig-zig", "6(4(2(1,3),5),7)", 2, "2(1,4(3,6(5,7)))", /zig-zig/],
    ["l02-zig-zag", "6(2(1,4(3,5)),7)", 4, "4(2(1,3),6(5,7))", /zig-zag/],
  ] as const;
  for (const [id, start, x, end, rot] of cases)
    it(`${id}: Find(${x}) na ${start} dá ${end}`, () => {
      const ex = treeExample("splay", id);
      expect(ex.page).toBe(3);
      expect(shape(ex.build())).toBe(start);
      expect(ex.ops).toEqual([{ op: "find", x }]);
      const r = runTree("splay", ex);
      expect(r.after[0]).toBe(end);
      expect(r.messages.some((m) => rot.test(m))).toBe(true);
    });
});

describe("splay – Průvodce, kap. 9.5 (TREEHASH-08)", () => {
  it("Obr. 9.4 (str. 232): cesta 0 … 6, Find(5) splayuje kroky PP, PP, P", () => {
    const ex = treeExample("splay", "obr-9-4");
    expect(ex.page).toBe(232);
    expect(shape(ex.build())).toBe("0(,1(,2(,3(,4(,5(,6))))))");
    expect(ex.ops).toEqual([{ op: "find", x: 5 }]);
    const r = runTree("splay", ex);
    // PP = zig-zig s oběma pravými syny, P = zig
    const rot = r.messages.filter((m) => /→ zig(-zig|-zag)?[.:]/.test(m));
    expect(rot).toHaveLength(3);
    expect(rot[0]).toMatch(/pravými syny → zig-zig/);
    expect(rot[1]).toMatch(/pravými syny → zig-zig/);
    expect(rot[2]).toMatch(/→ zig\.$/);
    expect(r.after[0]).toBe("5(0(,2(1,4(3,))),6)");
  });

  it("Obr. 9.5 (str. 233): cesta 0 … 9, Find(9), Find(0), Find(7), Find(3) – potenciál 21,791 → 15,077 → 15,077 → 12,299 → 12,077", () => {
    const ex = treeExample("splay", "obr-9-5");
    expect(shape(ex.build())).toBe("0(,1(,2(,3(,4(,5(,6(,7(,8(,9)))))))))");
    expect(ex.ops.map((o) => o.x)).toEqual([9, 0, 7, 3]);
    expect(ex.ops.every((o) => o.op === "find")).toBe(true);
    const phi = (st: TreeState) => {
      let sum = 0;
      const rec = (id: number | null): number => {
        if (id === null) return 0;
        const m = 1 + rec(st.nodes[id].left) + rec(st.nodes[id].right);
        sum += Math.log2(m);
        return m;
      };
      rec(st.root);
      return sum;
    };
    let st = ex.build();
    const got = [phi(st)];
    const shown: number[] = [];
    for (const { op, x } of ex.ops) {
      const s = materialize(planOp("splay", op, x).run(structuredClone(st)));
      st = s[s.length - 1].state;
      got.push(phi(st));
      shown.push(Number(st.vars["Φ"]));
    }
    const want = [21.791, 15.077, 15.077, 12.299, 12.077];
    got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 2));
    // stránka ukazuje Φ zaokrouhlené na setiny (formát beze změny)
    shown.forEach((v, i) =>
      expect(Math.abs(v - want[i + 1])).toBeLessThan(0.006),
    );
    expect(shape(st)).toBe("3(0(,2(1,)),7(4(,6(5,)),9(8,)))");
  });

  it("Obr. 9.7 (str. 238): Delete(2) – vysplayovat 2, odebrat, vysplayovat maximum levého podstromu 1 a připojit pravý", () => {
    const ex = treeExample("splay", "obr-9-7");
    expect(ex.page).toBe(238);
    // výchozí strom = výsledek obr. 9.4
    expect(shape(ex.build())).toBe("5(0(,2(1,4(3,))),6)");
    expect(ex.ops).toEqual([{ op: "delete", x: 2 }]);
    const r = runTree("splay", ex);
    // 2. obrázek: 2 v kořeni (krok LP = zig-zag)
    expect(r.steps.map((s) => shape(s.state))).toContain("2(0(,1),5(4(3,),6))");
    expect(r.messages.some((m) => /zig-zag/.test(m))).toBe(true);
    // 4. obrázek: maximum 1 levého podstromu v kořeni, pravý podstrom připojený
    expect(r.after[0]).toBe("1(0,5(4(3,),6))");
  });
});

describe("(a,b)-strom – přednáška L03", () => {
  function abExample(id: string): AbBookExample {
    const ex = bookExampleById(AB_BOOK_EXAMPLES, id);
    if (!ex) throw new Error(`příklad ${id} chybí`);
    return ex;
  }
  function runAb(ex: AbBookExample) {
    let st = ex.build();
    const steps: Step<ABState>[] = [];
    for (const { op, x } of ex.ops) {
      const s = materialize(planAbOp(op, x).run(structuredClone(st)));
      steps.push(...s);
      st = s[s.length - 1].state;
    }
    return { st, steps };
  }

  it("abFromSpec: oddělovač = maximum podstromu, listy zleva doprava", () => {
    const st = abFromSpec(2, 3, [
      [1, 3],
      [5, 6, 7],
    ]);
    expect(abShape(st)).toBe("[3]([1](1,3),[5 6](5,6,7))");
    expect(abKeys(st)).toEqual([1, 3, 5, 6, 7]);
    expect([st.a, st.b]).toEqual([2, 3]);
  });

  it("snímek 4: Insert(4) do (2,4)-stromu – list 4 přibude k [5 6 7], přeplněný vrchol se rozdělí", () => {
    const ex = abExample("l03-insert");
    expect(ex.page).toBe(4);
    expect([ex.a, ex.b]).toEqual([2, 4]);
    expect(abShape(ex.build())).toBe("[3]([1](1,3),[5 6 7](5,6,7,8))");
    expect(ex.ops).toEqual([{ op: "insert", x: 4 }]);
    const { st, steps } = runAb(ex);
    // prostřední obrázek snímku: vrchol [4 5 6 7] s pěti syny
    expect(steps.map((s) => abShape(s.state))).toContain(
      "[3]([1](1,3),[4 5 6 7](4,5,6,7,8))",
    );
    // dělení podle pseudokódu snímku 5 (⌊(b+1)/2⌋ = 2 pravé syny do nového bratra);
    // obrázek na snímku 4 dělí jinak ([4] a [6 7]) – viz poznámka příkladu
    expect(abShape(st)).toBe("[3 6]([1](1,3),[4 5](4,5,6),[7](7,8))");
    expect(ex.note).toMatch(/pseudokód/);
  });

  it("snímek 6: Delete(4) z (2,4)-stromu – vrchol se sloučí s levým bratrem (pravá varianta snímku)", () => {
    const ex = abExample("l03-delete");
    expect(ex.page).toBe(6);
    expect(abShape(ex.build())).toBe("[3 5]([1](1,3),[4](4,5),[6 7](6,7,8))");
    expect(ex.ops).toEqual([{ op: "delete", x: 4 }]);
    expect(abShape(runAb(ex).st)).toBe("[5]([1 3](1,3,5),[6 7](6,7,8))");
  });
});

describe("společné", () => {
  const all = [
    ...KINDS.flatMap((k) => TREE_BOOK_EXAMPLES[k]),
    ...AB_BOOK_EXAMPLES,
  ];

  it("popisek „Příklad z knihy: Obr. X.Y – …“ nebo „Příklad z přednášky: …“, id jedinečná v rámci stránky", () => {
    for (const ex of all)
      expect(
        ex.label.startsWith(`Příklad z knihy: Obr. ${ex.figure} – `) ||
          ex.label.startsWith("Příklad z přednášky: "),
        ex.label,
      ).toBe(true);
    for (const list of [
      ...KINDS.map((k) => TREE_BOOK_EXAMPLES[k]),
      AB_BOOK_EXAMPLES,
    ])
      expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
  });

  it("strom má příznak AVL právě na stránce AVL a klíče pro textové pole sedí se stromem", () => {
    for (const kind of KINDS)
      for (const ex of TREE_BOOK_EXAMPLES[kind]) {
        const st = ex.build();
        expect(st.avl, `${kind}/${ex.id}`).toBe(kind === "avl");
        const inorder = Object.values(st.nodes)
          .map((n) => n.key)
          .sort((a, b) => a - b);
        expect(
          [...ex.keys].sort((a, b) => a - b),
          ex.id,
        ).toEqual(inorder);
      }
  });

  it("build() dává pokaždé nový strom", () => {
    for (const ex of all) {
      const a = ex.build();
      a.root = null;
      expect(ex.build().root, ex.id).not.toBeNull();
    }
  });

  it("každá stránka stromů má aspoň jeden příklad", () => {
    for (const kind of KINDS)
      expect(TREE_BOOK_EXAMPLES[kind].length, kind).toBeGreaterThan(0);
    expect(AB_BOOK_EXAMPLES.length).toBeGreaterThan(0);
  });
});
