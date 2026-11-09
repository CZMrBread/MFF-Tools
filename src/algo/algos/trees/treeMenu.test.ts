/*
 * Nabídka operací stránek stromů (ActionMenu) jako čistý model: které akce stránka nabízí, s jakými
 * argumenty, kdy jsou zakázané a co se při provedení zavolá. Validace polí jde přes skutečný
 * prepareGo z actionModel.ts – stejně jako po stisku „Provést“ / Enter na stránce.
 */
import { describe, expect, it } from "vitest";
import {
  initialMenu,
  menuReducer,
  prepareGo,
  type ActionDef,
  type IntArgDef,
  type MenuState,
} from "../../core/actionModel";
import { AB_DEFAULT_KEYS, AB_MAX_KEYS, buildAB } from "./abOps";
import { emptyAB } from "./abtree";
import { emptyTree } from "./bst";
import { AB_BOOK_EXAMPLES, TREE_BOOK_EXAMPLES } from "./bookExamples";
import {
  DEFAULT_KEYS,
  MAX_NODES,
  TREE_KEYS,
  buildTree,
  type Kind,
  type OpName,
} from "./treeOps";
import {
  abActions,
  abExampleFromParam,
  exampleMessage,
  exampleTitle,
  nextBookOp,
  treeActions,
  type AbMenuHandlers,
  type TreeMenuHandlers,
} from "./treeMenu";

type Call = [string, ...unknown[]];

function treeHandlers(calls: Call[]): TreeMenuHandlers {
  return {
    op: (op, x) => calls.push(["op", op, x]),
    rebuild: (keys, message, title, x) =>
      calls.push(["rebuild", keys, message, title, x]),
    example: (ex) => calls.push(["example", ex.id]),
    alpha: (a) => calls.push(["alpha", a]),
  };
}

function abHandlers(calls: Call[]): AbMenuHandlers {
  return {
    op: (op, x) => calls.push(["op", op, x]),
    rebuild: (keys, message, title) =>
      calls.push(["rebuild", keys, message, title]),
    example: (ex) => calls.push(["example", ex.id]),
    params: (i) => calls.push(["params", i]),
    variant: (v) => calls.push(["variant", v]),
  };
}

const defsFor = (
  kind: Kind,
  calls: Call[] = [],
  state = buildTree(DEFAULT_KEYS[kind], kind),
) =>
  treeActions(
    { kind, state, keys: DEFAULT_KEYS[kind], x: 20, alpha: 0.7, seed: () => 1 },
    treeHandlers(calls),
  );

const byId = (defs: readonly ActionDef[], id: string) => {
  const d = defs.find((x) => x.id === id);
  if (!d) throw new Error(`akce ${id} chybí`);
  return d;
};

/** Jako na stránce: zvolit variantu, vyplnit pole, stisknout Provést. */
function go(
  defs: readonly ActionDef[],
  id: string,
  opts: { variant?: string; texts?: Record<string, string> } = {},
) {
  let st: MenuState = initialMenu(defs);
  if (opts.variant)
    st = menuReducer(st, { type: "variant", id, variant: opts.variant });
  for (const [name, text] of Object.entries(opts.texts ?? {}))
    st = menuReducer(st, { type: "text", name, text });
  const def = byId(defs, id);
  const r = prepareGo(def, st);
  if (!r.ok) throw new Error(r.reason);
  def.run(r.values, r.variant);
}

describe("treeActions – binární stromy", () => {
  it("akce v pořadí Vytvořit, Find(x), Insert(x), Delete(x); u BB[α] navíc α s aktuální hodnotou", () => {
    for (const kind of ["bst", "avl", "splay"] as Kind[])
      expect(defsFor(kind).map((d) => d.label)).toEqual([
        "Vytvořit",
        "Find(x)",
        "Insert(x)",
        "Delete(x)",
      ]);
    expect(defsFor("bb").map((d) => d.label)).toEqual([
      "Vytvořit",
      "Find(x)",
      "Insert(x)",
      "Delete(x)",
      "α = 0,7",
    ]);
  });

  it("Find/Insert/Delete sdílí argument x s rozsahem klíčů a výchozí hodnotou stránky", () => {
    const defs = defsFor("bst");
    for (const id of ["find", "insert", "delete"]) {
      const args = byId(defs, id).args as IntArgDef[];
      expect(args).toHaveLength(1);
      expect(args[0]).toMatchObject({
        kind: "int",
        name: "x",
        label: "x =",
        min: TREE_KEYS.min,
        max: TREE_KEYS.max,
        default: 20,
      });
    }
  });

  it("Insert má vlastní výchozí x (insertX) – nový klíč, ne ten, který už ve stromu je", () => {
    const defs = treeActions(
      {
        kind: "avl",
        state: buildTree(DEFAULT_KEYS.avl, "avl"),
        keys: DEFAULT_KEYS.avl,
        x: 10,
        insertX: 27,
        alpha: 0.7,
        seed: () => 1,
      },
      treeHandlers([]),
    );
    const dflt = (id: string) =>
      (byId(defs, id).args as IntArgDef[])[0].default;
    expect(dflt("insert")).toBe(27);
    expect(dflt("find")).toBe(10);
    expect(dflt("delete")).toBe(10);
  });

  it("provedení operace zavolá op(op, x) s hodnotou z pole (i záporné, typografický minus)", () => {
    const calls: Call[] = [];
    const defs = defsFor("avl", calls);
    go(defs, "insert", { texts: { x: "−5" } });
    go(defs, "find", { texts: { x: "30" } });
    go(defs, "delete");
    expect(calls).toEqual([
      ["op", "insert", -5],
      ["op", "find", 30],
      ["op", "delete", 20],
    ]);
  });

  it("klíč mimo rozsah Provést nepustí", () => {
    expect(() =>
      go(defsFor("bst"), "insert", { texts: { x: "10000" } }),
    ).toThrow(/x =/);
  });

  it("prázdný strom: Find a Delete zakázané s vysvětlením, Insert jde; plný strom: Insert zakázaný", () => {
    const empty = defsFor("bst", [], emptyTree(false));
    expect(byId(empty, "find").disabledReason).toMatch(/prázdný/);
    expect(byId(empty, "delete").disabledReason).toMatch(/prázdný/);
    expect(byId(empty, "insert").disabledReason ?? null).toBeNull();
    const full = buildTree(
      Array.from({ length: MAX_NODES }, (_, i) => i + 1),
      "bst",
    );
    const defs = defsFor("bst", [], full);
    expect(byId(defs, "insert").disabledReason).toContain(
      `${MAX_NODES} vrcholů`,
    );
    expect(byId(defs, "find").disabledReason ?? null).toBeNull();
  });

  it("Vytvořit: varianty Vlastní (A =), Náhodně, Seřazeně, Prázdný, Příklady z knihy; tlačítko Postavit", () => {
    const create = byId(defsFor("bst"), "create");
    expect(create.goLabel).toBe("Postavit");
    expect(create.variants!.map((v) => [v.id, v.label])).toEqual([
      ["custom", "Vlastní"],
      ["random", "Náhodně"],
      ["sorted", "Seřazeně"],
      ["empty", "Prázdný"],
      ["book", "Příklady z knihy"],
    ]);
    const custom = create.variants![0].args![0];
    expect(custom).toMatchObject({ kind: "list", name: "A", label: "klíče =" });
    expect(custom.kind === "list" && custom.default).toEqual(DEFAULT_KEYS.bst);
    // splay má obrázky 9.4 a 9.5 z knihy i snímky z přednášky
    expect(
      byId(defsFor("splay"), "create").variants!.find((v) => v.id === "book")!
        .label,
    ).toBe("Příklady z knihy");
  });

  it("Příklady z knihy: volba obrázku ze všech příkladů stránky, popisek bez předpony", () => {
    for (const kind of ["bst", "avl", "splay", "bb"] as Kind[]) {
      const book = byId(defsFor(kind), "create").variants!.find(
        (v) => v.id === "book",
      )!;
      const arg = book.args![0];
      expect(arg.kind).toBe("choice");
      if (arg.kind !== "choice") return;
      expect(arg.options.map((o) => o.value)).toEqual(
        TREE_BOOK_EXAMPLES[kind].map((e) => e.id),
      );
      for (const o of arg.options)
        expect(o.label).not.toMatch(/^Příklad z (knihy|přednášky)/);
    }
    const avl = byId(defsFor("avl"), "create").variants!.find(
      (v) => v.id === "book",
    )!.args![0];
    expect(avl.kind === "choice" && avl.options[3].label).toBe(
      "Obr. 8.6 – dvojitá rotace, Delete(8)",
    );
  });

  it("Vytvořit ▸ Vlastní postaví strom z klíčů bez opakování a ohlásí vynechané", () => {
    const calls: Call[] = [];
    go(defsFor("bst", calls), "create", {
      variant: "custom",
      texts: { A: "A = 9, 4, 7, 4" },
    });
    expect(calls).toHaveLength(1);
    const [name, keys, message, title] = calls[0];
    expect(name).toBe("rebuild");
    expect(keys).toEqual([9, 4, 7]);
    expect(message).toMatch(/Opakované klíče.*vynecháno: 1/);
    expect(title).toBe("Postavit (3 klíče)");
  });

  it("Náhodně, Seřazeně, Prázdný a Příklady z knihy zavolají správnou obsluhu", () => {
    const calls: Call[] = [];
    const defs = defsFor("bst", calls);
    go(defs, "create", { variant: "random" });
    go(defs, "create", { variant: "sorted" });
    go(defs, "create", { variant: "empty" });
    go(defs, "create", { variant: "book", texts: { fig: "obr-8-2" } });
    expect(calls[0][0]).toBe("rebuild");
    expect((calls[0][1] as number[]).length).toBe(12);
    expect(calls[0][3]).toBe("Náhodný vstup");
    expect(calls[1]).toEqual([
      "rebuild",
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      expect.stringContaining("Find(100)"),
      "Setříděný vstup",
      100,
    ]);
    expect(calls[2]).toEqual([
      "rebuild",
      [],
      expect.stringContaining("prázdný"),
      "Vyprázdnit",
      undefined,
    ]);
    expect(calls[3]).toEqual(["example", "obr-8-2"]);
  });

  it("výchozí obrázek v nabídce příkladů je první příklad stránky", () => {
    const calls: Call[] = [];
    go(defsFor("splay", calls), "create", { variant: "book" });
    expect(calls).toEqual([["example", "obr-9-4"]]);
  });

  it("BB[α]: varianty α jen z nabízených hodnot, zvolená se hned použije", () => {
    const calls: Call[] = [];
    const alpha = byId(defsFor("bb", calls), "alpha");
    expect(alpha.variants!.map((v) => v.id)).toEqual([
      "0.55",
      "0.6",
      "0.65",
      "0.7",
      "0.75",
      "0.8",
      "0.85",
      "0.9",
      "0.95",
    ]);
    expect(alpha.variants!.every((v) => !v.args?.length)).toBe(true);
    expect(alpha.title).toMatch(/1\/2 < α < 1/);
    alpha.run({}, "0.6");
    expect(calls).toEqual([["alpha", 0.6]]);
  });
});

describe("příklady z knihy na stránce", () => {
  const ex82 = TREE_BOOK_EXAMPLES.bst[2];
  const ex86 = TREE_BOOK_EXAMPLES.avl[3];

  it("zpráva: popisek, zdroj se stranou, poznámka a předvyplněná operace", () => {
    const m = exampleMessage(ex86);
    expect(m).toContain("Obr. 8.6 – dvojitá rotace, Delete(8)");
    expect(m).toContain("s. 193");
    expect(m).toContain(ex86.note!);
    expect(m).toContain("Předvyplněno Delete(8)");
    // přednáška: snímek místo strany
    expect(
      exampleMessage(TREE_BOOK_EXAMPLES.splay.find((e) => e.id === "l02-zig")!),
    ).toContain("snímek 3");
    // obrázek bez operace nic nepředvyplní
    expect(exampleMessage(TREE_BOOK_EXAMPLES.bst[0])).not.toContain(
      "Předvyplněno",
    );
  });

  it("název do historie: „Příklad: Obr. 8.2“ / „Příklad: L02/3“", () => {
    expect(exampleTitle(ex82)).toBe("Příklad: Obr. 8.2");
    expect(exampleTitle(TREE_BOOK_EXAMPLES.splay[3])).toBe("Příklad: L02/3");
  });

  it("nextBookOp: obr. 8.2 vede třemi Delete za sebou, odbočka průvodce ukončí", () => {
    const q = ex82.ops;
    const after1 = nextBookOp(q, "delete" as OpName, 2);
    expect(after1).toEqual([
      { op: "delete", x: 4 },
      { op: "delete", x: 3 },
    ]);
    expect(nextBookOp(after1, "delete", 4)).toEqual([{ op: "delete", x: 3 }]);
    expect(nextBookOp(after1, "insert", 4)).toEqual([]);
    expect(nextBookOp([], "find", 1)).toEqual([]);
  });
});

describe("abActions – (a,b)-strom", () => {
  const defs = (calls: Call[] = [], state = buildAB(AB_DEFAULT_KEYS, 2, 3)) =>
    abActions(
      { state, keys: AB_DEFAULT_KEYS, x: 41, seed: () => 1 },
      abHandlers(calls),
    );

  it("Vytvořit ▸ Vlastní má popisek „klíče =“; Insert(x) předvyplní klíč, který ve stromu není, Find/Delete existující (TREEHASH-14/19)", () => {
    const d = defs();
    const custom = byId(d, "create").variants![0].args![0];
    expect(custom).toMatchObject({ kind: "list", name: "A", label: "klíče =" });
    const dflt = (id: string) => (byId(d, id).args as IntArgDef[])[0].default;
    expect(AB_DEFAULT_KEYS).not.toContain(dflt("insert"));
    expect(AB_DEFAULT_KEYS).toContain(dflt("find"));
    expect(AB_DEFAULT_KEYS).toContain(dflt("delete"));
    // ani u stromu z jiných klíčů nevloží existující klíč
    const keys = [33, 34, 35, 36, 37];
    const other = abActions(
      { state: buildAB(keys, 2, 3), keys, x: 33, seed: () => 1 },
      abHandlers([]),
    );
    expect(keys).not.toContain(
      (byId(other, "insert").args as IntArgDef[])[0].default,
    );
  });

  it("akce Vytvořit, Find(x), Insert(x), Delete(x), (a,b) = (2,3), Varianta", () => {
    expect(defs().map((d) => d.label)).toEqual([
      "Vytvořit",
      "Find(x)",
      "Insert(x)",
      "Delete(x)",
      "(a,b) = (2,3)",
      "Varianta: přednáška",
    ]);
    expect(
      abActions(
        { state: buildAB([1, 2], 3, 5), keys: [1, 2], x: 1, seed: () => 1 },
        abHandlers([]),
      ).find((d) => d.id === "params")!.label,
    ).toBe("(a,b) = (3,5)");
  });

  it("Vytvořit: Vlastní, Náhodně, Prázdný, Příklady z přednášky (L03), Příklady z knihy (Průvodce 8.3)", () => {
    const create = byId(defs(), "create");
    expect(create.variants!.map((v) => v.label)).toEqual([
      "Vlastní",
      "Náhodně",
      "Prázdný",
      "Příklady z přednášky",
      "Příklady z knihy",
    ]);
    const book = create.variants![3].args![0];
    expect(book.kind === "choice" && book.options.map((o) => o.value)).toEqual(
      AB_BOOK_EXAMPLES.map((e) => e.id),
    );
  });

  it("operace, stavba a přepnutí parametrů zavolají obsluhu", () => {
    const calls: Call[] = [];
    const d = defs(calls);
    go(d, "delete");
    go(d, "insert", { texts: { x: "50" } });
    go(d, "create", { variant: "custom", texts: { A: "3 1 2" } });
    go(d, "create", { variant: "book", texts: { fig: "l03-delete" } });
    byId(d, "params").run({}, "2");
    expect(calls).toEqual([
      ["op", "delete", 41],
      ["op", "insert", 50],
      [
        "rebuild",
        [3, 1, 2],
        "Strom postaven postupným vkládáním klíčů v zadaném pořadí.",
        "Postavit (3 klíče)",
      ],
      ["example", "l03-delete"],
      ["params", 2],
    ]);
  });

  it("prázdný strom zakáže Find a Delete, plný Insert", () => {
    const e = defs([], emptyAB(2, 3));
    expect(byId(e, "find").disabledReason).toMatch(/prázdný/);
    expect(byId(e, "insert").disabledReason ?? null).toBeNull();
    const full = buildAB(
      Array.from({ length: AB_MAX_KEYS }, (_, i) => i + 1),
      2,
      3,
    );
    expect(byId(defs([], full), "insert").disabledReason).toContain(
      `${AB_MAX_KEYS} klíčů`,
    );
  });

  it("?ex= v adrese vybere příklad z přednášky, neznámé id nic", () => {
    expect(abExampleFromParam("l03-insert")?.id).toBe("l03-insert");
    expect(abExampleFromParam("foo")).toBeUndefined();
    expect(abExampleFromParam(null)).toBeUndefined();
  });
});
