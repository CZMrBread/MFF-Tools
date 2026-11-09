/**
 * E2 (rozhodnutí vlastníka 7. 11. 2026): stránka (a,b)-stromu nabízí vedle přednáškové varianty
 * (klíče v listech, výchozí) i variantu z Průvodce 8.3 (klíče ve vnitřních vrcholech). Přepínač je
 * akce nabídky, varianta jde do adresy jako nový volitelný parametr `var=kniha` (bez něj přednáška –
 * staré odkazy beze změny), příklady z knihy (obr. 8.7–8.10) přepnou na knižní variantu.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import { PC_BOOK_DELETE, PC_BOOK_FIND, PC_BOOK_INSERT } from "./abBook";
import {
  AB_DEFAULT_KEYS,
  AB_PARAMS,
  abVariantFromParam,
  abVariantLabel,
  buildAB,
  planAbOp,
  switchAB,
  switchAbVariant,
  type AbOpName,
} from "./abOps";
import { PC_AB_INSERT, abKeys, type ABState } from "./abtree";
import { AB_PRUVODCE_EXAMPLES } from "./bookExamples";
import { abLegend } from "./legend";
import { abActions, abExampleFromParam, type AbMenuHandlers } from "./treeMenu";

type Call = [string, ...unknown[]];
const handlers = (calls: Call[]): AbMenuHandlers => ({
  op: (op, x) => calls.push(["op", op, x]),
  rebuild: (keys, message, title) =>
    calls.push(["rebuild", keys, message, title]),
  example: (ex) => calls.push(["example", ex.id]),
  params: (i) => calls.push(["params", i]),
  variant: (v) => calls.push(["variant", v]),
});

function shape(st: ABState): string {
  const rec = (id: number): string => {
    const n = st.nodes[id];
    const k = `[${n.keys.join(" ")}]`;
    return n.children.length ? `${k}(${n.children.map(rec).join(",")})` : k;
  };
  return st.root === null ? "" : rec(st.root);
}

describe("varianta v logice stránky (abOps)", () => {
  it("parametr adresy: „kniha“ → kniha, cokoli jiného (i chybějící) → přednáška", () => {
    expect(abVariantFromParam("kniha")).toBe("kniha");
    expect(abVariantFromParam(null)).toBe("prednaska");
    expect(abVariantFromParam("prednaska")).toBe("prednaska");
    expect(abVariantFromParam("foo")).toBe("prednaska");
  });

  it("buildAB bez varianty postaví přednáškový strom (beze změny), s „kniha“ knižní", () => {
    const lecture = buildAB(AB_DEFAULT_KEYS, 2, 3);
    expect(lecture.variant).toBeUndefined();
    const book = buildAB(AB_DEFAULT_KEYS, 2, 3, "kniha");
    expect(book.variant).toBe("kniha");
    expect(abKeys(book)).toEqual([...AB_DEFAULT_KEYS].sort((a, b) => a - b));
    // klíče jsou ve vnitřních vrcholech – žádný vrchol není „list s jedním klíčem“ navíc
    const count = Object.values(book.nodes).reduce(
      (s, n) => s + n.keys.length,
      0,
    );
    expect(count).toBe(AB_DEFAULT_KEYS.length);
  });

  it("planAbOp: pseudokód a algoritmus podle varianty", () => {
    expect(planAbOp("insert", 5).pseudocode).toBe(PC_AB_INSERT);
    expect(planAbOp("insert", 5, "kniha").pseudocode).toBe(PC_BOOK_INSERT);
    expect(planAbOp("find", 5, "kniha").pseudocode).toBe(PC_BOOK_FIND);
    expect(planAbOp("delete", 5, "kniha").pseudocode).toBe(PC_BOOK_DELETE);
    const st = buildAB([10, 20, 30], 2, 3, "kniha");
    const steps = materialize(
      planAbOp("insert", 25, "kniha").run(structuredClone(st)),
    );
    expect(abKeys(steps.at(-1)!.state)).toEqual([10, 20, 25, 30]);
    expect(steps.at(-1)!.state.variant).toBe("kniha");
  });

  it("přepnutí (a,b) variantu zachová, přepnutí varianty zachová (a,b) i klíče", () => {
    const book = buildAB(AB_DEFAULT_KEYS, 2, 3, "kniha");
    const sw = switchAB(book, 2);
    expect(sw.state.variant).toBe("kniha");
    expect([sw.state.a, sw.state.b]).toEqual([...AB_PARAMS[2]]);
    const back = switchAbVariant(sw.state, "prednaska");
    expect(back.state.variant).toBeUndefined();
    expect([back.state.a, back.state.b]).toEqual([...AB_PARAMS[2]]);
    expect(abKeys(back.state)).toEqual(abKeys(book));
    expect(back.message).toMatch(/přednáš/);
    expect(switchAbVariant(book, "kniha").message).toMatch(/Průvodce/);
    expect(abVariantLabel("kniha")).toMatch(/Průvodce/);
  });
});

describe("nabídka: přepínač varianty a příklady z knihy", () => {
  const defs = (calls: Call[] = [], state = buildAB(AB_DEFAULT_KEYS, 2, 3)) =>
    abActions(
      { state, keys: AB_DEFAULT_KEYS, x: 41, seed: () => 1 },
      handlers(calls),
    );

  it("akce „Varianta“ za (a,b) s popiskem podle stromu; spuštění zavolá obsluhu", () => {
    const d = defs();
    const v = d.find((a) => a.id === "variant")!;
    expect(v).toBeDefined();
    expect(v.label).toBe("Varianta: přednáška");
    expect(v.variants!.map((x) => x.id)).toEqual(["prednaska", "kniha"]);
    const calls: Call[] = [];
    defs(calls)
      .find((a) => a.id === "variant")!
      .run({}, "kniha");
    expect(calls).toEqual([["variant", "kniha"]]);
    const kb = defs([], buildAB([1, 2], 2, 3, "kniha")).find(
      (a) => a.id === "variant",
    )!;
    expect(kb.label).toBe("Varianta: Průvodce");
  });

  it("Vytvořit nabízí „Příklady z přednášky“ i „Příklady z knihy“ (obr. 8.7–8.10)", () => {
    const create = defs().find((a) => a.id === "create")!;
    const labels = create.variants!.map((v) => v.label);
    expect(labels).toContain("Příklady z přednášky");
    expect(labels).toContain("Příklady z knihy");
    const book = create.variants!.find((v) => v.label === "Příklady z knihy")!;
    const arg = book.args![0];
    expect(arg.kind === "choice" && arg.options.map((o) => o.value)).toEqual(
      AB_PRUVODCE_EXAMPLES.map((e) => e.id),
    );
    const calls: Call[] = [];
    defs(calls)
      .find((a) => a.id === "create")!
      .run({ fig: "obr-8-9" }, book.id);
    expect(calls).toEqual([["example", "obr-8-9"]]);
  });

  it("?ex= najde příklad z přednášky i z knihy", () => {
    expect(abExampleFromParam("l03-insert")?.id).toBe("l03-insert");
    expect(abExampleFromParam("obr-8-10")?.id).toBe("obr-8-10");
  });
});

describe("příklady z Průvodce 8.3 (obr. 8.7–8.10, str. 199–203)", () => {
  const ex = (id: string) => {
    const e = AB_PRUVODCE_EXAMPLES.find((x) => x.id === id);
    if (!e) throw new Error(id);
    return e;
  };
  const runAll = (id: string) => {
    let st = ex(id).build();
    for (const { op, x } of ex(id).ops) {
      const steps = materialize(
        planAbOp(op, x, "kniha").run(structuredClone(st)),
      );
      st = steps.at(-1)!.state;
    }
    return st;
  };

  it("všechny jsou (2,3)-stromy v knižní variantě, s popiskem „Obr. 8.x“ a stranou", () => {
    for (const e of AB_PRUVODCE_EXAMPLES) {
      const st = e.build();
      expect(st.variant, e.id).toBe("kniha");
      expect([e.a, e.b], e.id).toEqual([2, 3]);
      expect(e.label.startsWith(`Příklad z knihy: Obr. ${e.figure} – `)).toBe(
        true,
      );
      expect(abKeys(st)).toEqual([...e.keys].sort((p, q) => p - q));
    }
  });

  it("obr. 8.7 (str. 199): dva (2,3)-stromy pro tytéž klíče 1, 3, 4, 6, 7, 9", () => {
    expect(ex("obr-8-7a").page).toBe(199);
    expect(shape(ex("obr-8-7a").build())).toBe("[4 7]([1 3],[6],[9])");
    expect(shape(ex("obr-8-7b").build())).toBe("[3 6]([1],[4],[7 9])");
  });

  it("obr. 8.8 (str. 200): Insert(6) – [4 5 6] se rozštěpí, 5 jde do otce", () => {
    expect(shape(ex("obr-8-8").build())).toBe("[2 8]([1],[4 5],[9])");
    expect(ex("obr-8-8").ops).toEqual([{ op: "insert", x: 6 }]);
    expect(shape(runAll("obr-8-8"))).toBe("[5]([2]([1],[4]),[8]([6],[9]))");
  });

  it("obr. 8.9 (str. 202): Delete(5) – sloučení s levým bratrem", () => {
    expect(shape(ex("obr-8-9").build())).toBe("[4 7]([2],[5],[9])");
    expect(shape(runAll("obr-8-9"))).toBe("[7]([2 4],[9])");
  });

  it("obr. 8.10 (str. 203): Delete(5) – půjčka od levého bratra", () => {
    expect(ex("obr-8-10").page).toBe(203);
    expect(shape(ex("obr-8-10").build())).toBe("[4 7]([2 3],[5],[9])");
    expect(shape(runAll("obr-8-10"))).toBe("[3 7]([2],[4],[9])");
  });
});

describe("legenda knižní varianty odpovídá tomu, co se kreslí", () => {
  it("každá kreslená značka má položku a každá položka se objeví", () => {
    const seen = new Set<string>();
    for (const [a, b] of AB_PARAMS) {
      let st = buildAB(AB_DEFAULT_KEYS, a, b, "kniha");
      const r = rng(a * b + 7);
      for (let i = 0; i < 80; i++) {
        const op = (["find", "insert", "delete"] as AbOpName[])[
          Math.floor(r() * 3)
        ];
        const steps = materialize(
          planAbOp(op, Math.floor(r() * 80), "kniha").run(structuredClone(st)),
        );
        for (const s of steps) {
          for (const m of Object.values(s.state.marks)) seen.add(m);
          if (Object.keys(s.state.hot).length) seen.add("hot");
        }
        st = steps.at(-1)!.state;
      }
    }
    const legend = new Set(abLegend("kniha").flatMap((l) => l.marks));
    expect([...seen].filter((m) => !legend.has(m))).toEqual([]);
    expect([...legend].filter((m) => !seen.has(m))).toEqual([]);
    expect(abLegend("prednaska").length).toBeGreaterThan(0);
  });
});
