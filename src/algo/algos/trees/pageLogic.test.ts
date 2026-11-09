/**
 * Logika stránek stromů z 3. fáze: závěrečné kroky operací („Insert(35): …“), legendy přesně podle tříd,
 * které generátory kreslí, výchozí x a tipy (ověřené na výchozím příkladu), neaktivní tlačítka a parametry adresy.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step, type StepGen } from "../../core/steps";
import {
  AB_DEFAULT_KEYS,
  AB_DEFAULT_X,
  AB_MAX_KEYS,
  AB_PARAMS,
  abDisabledReason,
  abIndexOf,
  abParamIndex,
  buildAB,
  planAbOp,
  randomAbKeys,
  switchAB,
  type AbOpName,
} from "./abOps";
import { abHeight, abKeys, emptyAB, type ABState } from "./abtree";
import { treeDepth, type TreeState } from "./bst";
import { keysFromList, keysFromParam, randomKeys } from "./keys";
import { AB_LEGEND, toLegend, treeLegend } from "./legend";
import {
  ALPHA_OPTIONS,
  DEFAULT_ALPHA,
  DEFAULT_KEYS,
  DEFAULT_INSERT_X,
  DEFAULT_X,
  insertDefault,
  MAX_NODES,
  TREE_KEYS,
  alphaFromParam,
  alphaNotice,
  buildTree,
  nodeCount,
  normalizeKeysText,
  opDisabledReason,
  planOp,
  randomTreeKeys,
  sortedPreset,
  type Kind,
  type OpName,
} from "./treeOps";
import { bbInsert, potential } from "./trees2";

function apply<S>(
  state: S,
  op: (s: S) => StepGen<S>,
): { steps: Step<S>[]; state: S } {
  const steps = materialize(op(structuredClone(state)));
  return { steps, state: steps.length ? steps[steps.length - 1].state : state };
}

const KINDS: Kind[] = ["bst", "avl", "splay", "bb"];
const OPS: OpName[] = ["find", "insert", "delete"];
const TITLE: Record<OpName, string> = {
  find: "Find",
  insert: "Insert",
  delete: "Delete",
};
const fmt = (x: number) => String(x).replace("-", "−");
const keysOf = (st: TreeState) =>
  Object.values(st.nodes)
    .map((n) => n.key)
    .sort((a, b) => a - b);

/** Třídy, které se během kroků objevily na plátně (vrcholy, hrany, u (a,b)-stromu i „hot“). */
function marksIn(
  steps: Step<TreeState>[] | Step<ABState>[],
  into: Set<string>,
) {
  for (const s of steps) {
    for (const m of Object.values(s.state.marks)) into.add(m);
    if ("edgeMarks" in s.state)
      for (const m of Object.values(s.state.edgeMarks)) into.add(m);
    if ("hot" in s.state && Object.keys(s.state.hot).length) into.add("hot");
  }
}

describe("závěrečný krok každé operace", () => {
  it("binární stromy: poslední krok je „Op(x): …“ bez řádku pseudokódu a odpovídá výsledku", () => {
    for (const kind of KINDS) {
      const r = rng(17 + kind.length);
      let st = buildTree(DEFAULT_KEYS[kind], kind);
      for (let i = 0; i < 40; i++) {
        const op = OPS[Math.floor(r() * 3)];
        const x = -5 + Math.floor(r() * 90);
        const had = keysOf(st).includes(x);
        const res = apply(st, planOp(kind, op, x).run);
        const last = res.steps[res.steps.length - 1];
        const ctx = `${kind} ${op}(${x})`;
        expect(last.line, ctx).toBeNull();
        expect(last.error, ctx).toBeUndefined();
        expect(last.message.startsWith(`${TITLE[op]}(${fmt(x)}): `), ctx).toBe(
          true,
        );
        if (op === "find")
          expect(last.message.includes("nalezen."), ctx).toBe(had);
        if (op === "insert")
          expect(last.message, ctx).toMatch(
            had ? /už ve stromu byl/ : /nový (list|vrchol)/,
          );
        if (op === "delete")
          expect(last.message, ctx).toMatch(
            had ? /odstraněn/ : /ve stromu není|prázdný/,
          );
        // souhrn sedí se skutečným stavem
        const n = nodeCount(res.state);
        if (op !== "find" && n > 0)
          expect(last.message, ctx).toContain(
            `hloubka ${treeDepth(res.state)}`,
          );
        st = res.state;
      }
    }
  });

  it("AVL hlásí počet rotací, splay Φ po operaci", () => {
    const avl = buildTree(DEFAULT_KEYS.avl, "avl");
    expect(
      apply(avl, planOp("avl", "delete", 10).run).steps.at(-1)!.message,
    ).toContain("2 rotace");
    expect(
      apply(avl, planOp("avl", "insert", 22).run).steps.at(-1)!.message,
    ).toContain("1 rotace");
    expect(
      apply(avl, planOp("avl", "insert", 35).run).steps.at(-1)!.message,
    ).toContain("bez rotace");
    const sp = apply(
      buildTree(DEFAULT_KEYS.splay, "splay"),
      planOp("splay", "find", 70).run,
    );
    expect(sp.steps.at(-1)!.message).toContain(
      `Φ = ${String(potential(sp.state)).replace(".", ",")}`,
    );
  });

  it("(a,b)-strom: poslední krok „Op(x): …“, souhrn s počtem klíčů a výškou", () => {
    for (const [a, b] of AB_PARAMS) {
      const r = rng(a * 10 + b);
      let st = buildAB(AB_DEFAULT_KEYS, a, b);
      for (let i = 0; i < 40; i++) {
        const op = (["find", "insert", "delete"] as AbOpName[])[
          Math.floor(r() * 3)
        ];
        const x = Math.floor(r() * 80);
        const had = abKeys(st).includes(x);
        const res = apply(st, planAbOp(op, x).run);
        const last = res.steps[res.steps.length - 1];
        const ctx = `(${a},${b}) ${op}(${x})`;
        expect(last.line, ctx).toBeNull();
        expect(last.message.startsWith(`${TITLE[op]}(${x}): `), ctx).toBe(true);
        if (op === "find")
          expect(last.message.includes("nalezeno"), ctx).toBe(had);
        const n = abKeys(res.state).length;
        if (op !== "find" && n > 1)
          expect(last.message, ctx).toContain(`výška ${abHeight(res.state)}`);
        st = res.state;
      }
    }
    expect(
      apply(emptyAB(2, 3), planAbOp("find", 5).run).steps.at(-1)!.message,
    ).toBe("Find(5): strom je prázdný, klíč v něm není.");
  });
});

describe("legendy odpovídají tomu, co se kreslí", () => {
  /** Posloupnost operací, která projde všemi větvemi (dva synové, rotace, přestavba, splay zig-zig/zag…). */
  function seenMarks(kind: Kind): Set<string> {
    const seen = new Set<string>();
    let st = buildTree(DEFAULT_KEYS[kind], kind);
    const script: [OpName, number][] = [
      ["find", 25],
      ["find", 99],
      ["insert", 35],
      ["insert", 30],
      ["delete", 20],
      ["delete", 10],
      ["delete", 99],
      ["insert", 22],
      ["insert", 27],
      ["insert", 71],
      ["insert", 72],
      ["insert", 73],
      ["insert", 74],
      ["insert", 75],
      ["delete", 40],
      ["find", 70],
    ];
    for (const [op, x] of script) {
      const res = apply(st, planOp(kind, op, x).run);
      marksIn(res.steps, seen);
      st = res.state;
    }
    const r = rng(5);
    for (let i = 0; i < 60; i++) {
      const res = apply(
        st,
        planOp(kind, OPS[Math.floor(r() * 3)], Math.floor(r() * 100)).run,
      );
      marksIn(res.steps, seen);
      st = res.state;
    }
    return seen;
  }

  for (const kind of KINDS) {
    it(`${kind}: každá kreslená třída má položku legendy a každá položka se opravdu objeví`, () => {
      const seen = seenMarks(kind);
      const legend = new Set(treeLegend(kind).flatMap((l) => l.marks));
      expect(
        [...seen].filter((m) => !legend.has(m)),
        "chybí v legendě",
      ).toEqual([]);
      expect(
        [...legend].filter((m) => !seen.has(m)),
        "v legendě navíc",
      ).toEqual([]);
    });
  }

  it("(a,b)-strom: totéž", () => {
    const seen = new Set<string>();
    for (const [a, b] of AB_PARAMS) {
      let st = buildAB(AB_DEFAULT_KEYS, a, b);
      const r = rng(a + b);
      for (let i = 0; i < 50; i++) {
        const res = apply(
          st,
          planAbOp(
            (["find", "insert", "delete"] as AbOpName[])[Math.floor(r() * 3)],
            Math.floor(r() * 80),
          ).run,
        );
        marksIn(res.steps, seen);
        st = res.state;
      }
    }
    const legend = new Set(AB_LEGEND.flatMap((l) => l.marks));
    expect([...seen].filter((m) => !legend.has(m))).toEqual([]);
    expect([...legend].filter((m) => !seen.has(m))).toEqual([]);
  });

  it("odstraňovaný vrchol má čárkovaný vzorek (ne stejný jako „přepis klíče“) a hrany tvar čáry", () => {
    for (const items of [...KINDS.map(treeLegend), AB_LEGEND]) {
      expect(items.find((l) => l.marks.includes("n-removed"))!.cls).toBe(
        "sw-removed-dashed",
      );
      for (const l of items.filter((l) =>
        l.marks.some((m) => m.startsWith("e-")),
      ))
        expect(l.shape).toBe("line");
      const keys = items.map((l) => l.cls + "|" + (l.shape ?? "fill"));
      // stejný vzorek smí mít jen položky, které se liší tvarem
      expect(new Set(keys).size).toBe(keys.length);
      expect(toLegend(items).every((l) => !("marks" in l))).toBe(true);
    }
  });
});

describe("výchozí stav a tipy", () => {
  it("výchozí x je ve výchozím příkladu", () => {
    for (const kind of KINDS)
      expect(DEFAULT_KEYS[kind]).toContain(DEFAULT_X[kind]);
    expect(AB_DEFAULT_KEYS).toContain(AB_DEFAULT_X);
  });

  it("Insert má vlastní výchozí x, který ve stromu ještě není; u AVL vyvolá rotaci (UX-03)", () => {
    for (const kind of KINDS) {
      const x = insertDefault(kind, DEFAULT_KEYS[kind]);
      expect(DEFAULT_KEYS[kind], kind).not.toContain(x);
      expect(x).toBe(DEFAULT_INSERT_X[kind]);
    }
    const avl = apply(
      buildTree(DEFAULT_KEYS.avl, "avl"),
      planOp("avl", "insert", DEFAULT_INSERT_X.avl).run,
    ).steps.map((s) => s.message);
    expect(avl.some((m) => /rotace/i.test(m))).toBe(true);
    // jiný strom (z odkazu), který výchozí klíč obsahuje: nejmenší volný klíč nad ním
    expect(insertDefault("avl", [27, 28, 30])).toBe(29);
    expect(insertDefault("bst", [])).toBe(DEFAULT_INSERT_X.bst);
  });

  it("tipy slibují to, co se na výchozím příkladu opravdu stane", () => {
    const msgs = (kind: Kind, op: OpName, x: number) =>
      apply(
        buildTree(DEFAULT_KEYS[kind], kind),
        planOp(kind, op, x).run,
      ).steps.map((s) => s.message);
    // BST: Delete(20) – následník 25
    expect(msgs("bst", "delete", 20)).toContain("Následník je 25.");
    // AVL: Delete(10) dvojitá rotace u 20 (δ = +2), Insert(22) jednoduchá, Insert(27) dvojitá
    const del10 = msgs("avl", "delete", 10);
    expect(del10.some((m) => m.startsWith("δ(20) = +2"))).toBe(true);
    expect(del10.some((m) => m.startsWith("Dvojitá rotace"))).toBe(true);
    expect(
      msgs("avl", "insert", 22).filter((m) => m.startsWith("Rotace")).length,
    ).toBe(1);
    expect(
      msgs("avl", "insert", 27).some((m) => m.startsWith("Dvojitá rotace")),
    ).toBe(true);
    // splay: Find(70) zig-zig a Φ klesne
    const sp0 = buildTree(DEFAULT_KEYS.splay, "splay");
    const sp = apply(sp0, planOp("splay", "find", 70).run);
    expect(sp.steps.some((s) => s.message.includes("zig-zig"))).toBe(true);
    expect(potential(sp.state)).toBeLessThan(potential(sp0));
    expect(treeDepth(sp.state)).toBeLessThan(treeDepth(sp0));
    // BB[α]: Insert(71), (72), (73)… přestaví podstrom během pár vložení
    let bb = buildTree(DEFAULT_KEYS.bb, "bb");
    let rebuiltAt = 0;
    for (let x = 71; x <= 76 && !rebuiltAt; x++) {
      const res = apply(bb, planOp("bb", "insert", x).run);
      if (res.steps.some((s) => s.message.startsWith("Přestavíme podstrom")))
        rebuiltAt = x;
      bb = res.state;
    }
    expect(rebuiltAt).toBeGreaterThan(0);
    // BB[α]: snížení α na 0.55 – strom po těch vloženích porušuje podmínku a upozornění to řekne
    let bb2 = buildTree(DEFAULT_KEYS.bb, "bb");
    for (const x of [71, 72])
      bb2 = apply(bb2, planOp("bb", "insert", x).run).state;
    expect(alphaNotice(bb2, DEFAULT_ALPHA)).toBeNull();
    expect(alphaNotice(bb2, 0.55)).toMatch(/nesplňuje podmínku/);
    const after = apply(bb2, planOp("bb", "insert", 5, 0.55).run);
    expect(alphaNotice(after.state, 0.55)).toBeNull();
    // (a,b): Delete(41) přesun od bratra, Insert(50) dělení, Delete(5) sloučení a pokles výšky
    const ab = buildAB(AB_DEFAULT_KEYS, 2, 3);
    expect(
      apply(ab, planAbOp("delete", 41).run).steps.some((s) =>
        s.message.includes("nazbyt"),
      ),
    ).toBe(true);
    expect(
      apply(ab, planAbOp("insert", 50).run).steps.some((s) =>
        s.message.includes("rozdělíme"),
      ),
    ).toBe(true);
    const d5 = apply(ab, planAbOp("delete", 5).run);
    expect(d5.steps.some((s) => s.message.startsWith("Sloučíme"))).toBe(true);
    expect(abHeight(d5.state)).toBe(abHeight(ab) - 1);
  });

  it("Setříděný vstup u BST a splay radí Find největšího klíče, který projde celou cestu", () => {
    for (const kind of ["bst", "splay"] as Kind[]) {
      const p = sortedPreset(kind);
      const st = buildTree(p.keys, kind);
      expect(treeDepth(st)).toBe(p.keys.length - 1);
      expect(p.x).toBe(Math.max(...p.keys));
    }
  });
});

describe("neaktivní tlačítka", () => {
  it("prázdný strom: Find a Delete nejdou, Insert ano", () => {
    const empty = buildTree([], "bst");
    expect(opDisabledReason(empty, "find", 1)).toMatch(/prázdný/);
    expect(opDisabledReason(empty, "delete", 1)).toMatch(/prázdný/);
    expect(opDisabledReason(empty, "insert", 1)).toBeNull();
    expect(abDisabledReason(emptyAB(2, 3), "delete", 1)).toMatch(/prázdný/);
  });

  it("plný strom: Insert nového klíče nejde, existujícího ano (nic nepřidá)", () => {
    const full = buildTree(
      Array.from({ length: MAX_NODES }, (_, i) => i),
      "avl",
    );
    expect(opDisabledReason(full, "insert", 1000)).toMatch(String(MAX_NODES));
    expect(opDisabledReason(full, "insert", 5)).toBeNull();
    expect(opDisabledReason(full, "delete", 5)).toBeNull();
    const abFull = buildAB(
      Array.from({ length: AB_MAX_KEYS }, (_, i) => i),
      2,
      3,
    );
    expect(abDisabledReason(abFull, "insert", 999)).toMatch(
      String(AB_MAX_KEYS),
    );
    expect(abDisabledReason(abFull, "insert", 3)).toBeNull();
  });
});

describe("vstupy, adresa a parametry", () => {
  it("randomKeys: různé klíče v rozsahu, deterministicky podle semínka", () => {
    for (const seed of [1, 2, 99, 123456]) {
      const k = randomTreeKeys(seed);
      expect(k.length).toBe(12);
      expect(new Set(k).size).toBe(12);
      expect(k.every((x) => x >= 1 && x <= 99)).toBe(true);
      expect(randomTreeKeys(seed)).toEqual(k);
      expect(new Set(randomAbKeys(seed)).size).toBe(14);
    }
    expect(randomKeys(10, 1, 3, 5).sort()).toEqual([1, 2, 3]); // víc, než kolik je v rozsahu, nejde
  });

  it("keysFromList odstraní opakování a převezme ignorované i oříznuté hodnoty", () => {
    expect(
      keysFromList([3, 1, 3, 2], { ignored: ["x", "7.5"], valid: 6 }),
    ).toEqual({
      keys: [3, 1, 2],
      invalid: ["x", "7.5"],
      duplicates: 1,
      overLimit: 2,
    });
  });

  it("keysFromParam: klíče z adresy, neplatný parametr → null", () => {
    expect(keysFromParam("40,20,60", TREE_KEYS, MAX_NODES)).toEqual([
      40, 20, 60,
    ]);
    expect(keysFromParam("a,b", TREE_KEYS, MAX_NODES)).toBeNull();
    expect(keysFromParam(null, TREE_KEYS, MAX_NODES)).toBeNull();
    expect(
      keysFromParam(
        Array.from({ length: 50 }, (_, i) => i).join(","),
        TREE_KEYS,
        MAX_NODES,
      )!.length,
    ).toBe(MAX_NODES);
  });

  it("α z adresy jen z nabízených hodnot, (a,b) z adresy", () => {
    expect(alphaFromParam("0.8")).toBe(0.8);
    for (const p of [null, "", "0.3", "1", "abc", "0.71"])
      expect(alphaFromParam(p)).toBe(DEFAULT_ALPHA);
    expect(ALPHA_OPTIONS.every((a) => a > 0.5 && a < 1)).toBe(true);
    expect(abParamIndex("3,5")).toBe(2);
    expect(abParamIndex("(4, 7)")).toBe(4);
    expect(abParamIndex("9,9")).toBe(0);
    expect(abParamIndex(null)).toBe(0);
  });

  it("přepnutí (a,b) zachová klíče a změní parametry stromu", () => {
    let st = buildAB(AB_DEFAULT_KEYS, 2, 3);
    st = apply(st, planAbOp("insert", 50).run).state;
    const next = switchAB(st, 3);
    expect([next.state.a, next.state.b]).toEqual([3, 6]);
    expect(abIndexOf(next.state)).toBe(3);
    expect(abKeys(next.state)).toEqual(abKeys(st));
    expect(next.message).toContain("(3,6)");
  });

  it("normalizeKeysText sjednotí oddělovače", () => {
    expect(normalizeKeysText(" 1, 2;3   4 ")).toBe("1 2 3 4");
    expect(normalizeKeysText("")).toBe("");
  });

  it("bbInsert pořád odmítá neplatné α (stránka ho ale zadat nedovolí)", () => {
    const res = apply(buildTree(DEFAULT_KEYS.bb, "bb"), (s) =>
      bbInsert(s, 5, 0.3),
    );
    expect(res.steps.length).toBe(1);
    expect(res.steps[0].error).toBe(true);
  });
});
