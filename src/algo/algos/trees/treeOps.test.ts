/**
 * Logika stránek stromů bez UI (keys.ts, treeOps.ts, abOps.ts): čtení vstupních polí, limity,
 * předvolby a zprávy. Regrese nálezů tree-inputs-silent-coercion, splay-sorted-hint-noop,
 * tree-view-no-scaling (logická část), bb-alpha-range-not-enforced a ab-param-switch-discards-tree.
 */
import { describe, expect, it } from "vitest";
import { materialize, type Step, type StepGen } from "../../core/steps";
import {
  AB_KEYS,
  AB_MAX_KEYS,
  AB_PARAMS,
  abSwitchMessage,
  buildAB,
  planAbOp,
} from "./abOps";
import { abKeys } from "./abtree";
import { type TreeState } from "./bst";
import { describeSkipped, parseKey, parseKeyList } from "./keys";
import {
  DEFAULT_KEYS,
  MAX_NODES,
  TREE_KEYS,
  buildMessage,
  buildTree,
  nodeCount,
  parseAlpha,
  planOp,
  sortedPreset,
  type Kind,
} from "./treeOps";
import { bbViolations } from "./trees2";

function apply<S>(
  state: S,
  op: (s: S) => StepGen<S>,
): { steps: Step<S>[]; state: S } {
  const steps = materialize(op(structuredClone(state)));
  return { steps, state: steps.length ? steps[steps.length - 1].state : state };
}

const keysOf = (st: TreeState) =>
  Object.values(st.nodes)
    .map((n) => n.key)
    .sort((a, b) => a - b);

const KINDS: Kind[] = ["bst", "avl", "splay", "bb"];

describe("keys.ts – čtení polí", () => {
  it("parseKey: celá čísla včetně záporných a typografického minusu; jinak null", () => {
    expect(parseKey("35")).toBe(35);
    expect(parseKey(" -5 ")).toBe(-5);
    expect(parseKey("−12")).toBe(-12);
    expect(parseKey("+7")).toBe(7);
    expect(Object.is(parseKey("-0"), 0)).toBe(true);
    for (const t of [
      "",
      "-",
      " ",
      "1.5",
      "1e3",
      "abc",
      "1O",
      "NaN",
      "Infinity",
    ])
      expect(parseKey(t), t).toBeNull();
  });

  it("parseKeyList hlásí neplatné, opakované a přebytečné hodnoty", () => {
    const p = parseKeyList("1, 2;3 1O 2 99999 4 5", { min: -9, max: 999 }, 4);
    expect(p).toEqual({
      keys: [1, 2, 3, 4],
      invalid: ["1O", "99999"],
      duplicates: 1,
      overLimit: 1,
    });
    const msg = describeSkipped(p, { min: -9, max: 999 }, 4);
    expect(msg).toContain("„1O“");
    expect(msg).toContain("jen jednou");
    expect(msg).toContain("prvních 4");
    expect(
      describeSkipped(
        parseKeyList("1 2", { min: 0, max: 9 }, 5),
        { min: 0, max: 9 },
        5,
      ),
    ).toBe("");
  });
});

describe("treeOps.ts – operace ze stránky", () => {
  it("prázdné nebo neplatné pole x operaci nespustí (dřív se z něj stala 0)", () => {
    for (const kind of KINDS) {
      const st = buildTree(DEFAULT_KEYS[kind], kind);
      for (const x of [
        parseKey(""),
        parseKey("-"),
        TREE_KEYS.max + 1,
        TREE_KEYS.min - 1,
        2.5,
      ]) {
        const res = apply(st, planOp(kind, "insert", x).run);
        expect(res.steps.length).toBe(1);
        expect(res.steps[0].error).toBe(true);
        expect(res.steps[0].message).toMatch(/celé číslo od −999 do 9999/);
        expect(keysOf(res.state)).toEqual(keysOf(st));
      }
    }
  });

  it("záporný klíč z pole se opravdu vloží", () => {
    for (const kind of KINDS) {
      const res = apply(
        buildTree(DEFAULT_KEYS[kind], kind),
        planOp(kind, "insert", parseKey("-5")).run,
      );
      expect(keysOf(res.state)).toContain(-5);
    }
  });

  it("název operace nese argument", () => {
    expect(planOp("bst", "insert", 35).title).toBe("Insert(35)");
    expect(planOp("avl", "delete", -5).title).toBe("Delete(−5)");
    expect(planOp("bst", "find", null).title).toBe("Find");
  });

  it(`Insert nad ${MAX_NODES} vrcholů se odmítne, duplicitní klíč ne`, () => {
    for (const kind of KINDS) {
      const st = buildTree(
        Array.from({ length: MAX_NODES }, (_, i) => i),
        kind,
      );
      expect(nodeCount(st)).toBe(MAX_NODES);
      const over = apply(st, planOp(kind, "insert", 1000).run);
      expect(over.steps[0].error).toBe(true);
      expect(nodeCount(over.state)).toBe(MAX_NODES);
      const dup = apply(st, planOp(kind, "insert", 5).run);
      expect(dup.steps.some((s) => s.error)).toBe(false);
    }
  });

  it("BB[α]: neplatné α z pole (prázdné, 0.3, 1) operaci odmítne", () => {
    const st = buildTree(DEFAULT_KEYS.bb, "bb");
    for (const t of ["", "0.3", "1", "x", "0,5"]) {
      const res = apply(st, planOp("bb", "insert", 35, parseAlpha(t)).run);
      expect(res.steps.length, t).toBe(1);
      expect(res.steps[0].error, t).toBe(true);
    }
    expect(parseAlpha("0,75")).toBe(0.75);
    const ok = apply(st, planOp("bb", "insert", 35, parseAlpha("0,75")).run);
    expect(keysOf(ok.state)).toContain(35);
  });

  it("stavba: BB je dokonale vyvážený, AVL vyvážený, splay a BST v pořadí vstupu", () => {
    const sorted = Array.from({ length: 10 }, (_, i) => (i + 1) * 10);
    expect(bbViolations(buildTree(sorted, "bb"), 0.55)).toEqual([]);
    const splay = buildTree(sorted, "splay");
    expect(splay.nodes[splay.root!].key).toBe(10);
    const avl = buildTree(sorted, "avl");
    expect(avl.nodes[avl.root!].key).toBe(40);
    expect(
      buildMessage("splay", parseKeyList("1 2 x", TREE_KEYS, MAX_NODES)),
    ).toMatch(/bez splayování.*„x“/);
  });

  it("regrese splay-sorted-hint-noop: doporučené Find u setříděného vstupu splay stromu opravdu rotuje", () => {
    const preset = sortedPreset("splay");
    expect(preset.message).toContain(`Find(${preset.x})`);
    const st = buildTree(preset.keys, "splay");
    const res = apply(st, planOp("splay", "find", preset.x).run);
    expect(Number(res.state.vars.rotace)).toBe(preset.keys.length - 1);
    expect(res.state.nodes[res.state.root!].key).toBe(preset.x);
  });
});

describe("abOps.ts – operace (a,b)-stromu ze stránky", () => {
  it("neplatné pole x a klíč mimo rozsah buňky se odmítnou", () => {
    const st = buildAB([5, 12, 20], 2, 3);
    for (const x of [null, AB_KEYS.max + 1, AB_KEYS.min - 1]) {
      const res = apply(st, planAbOp("insert", x).run);
      expect(res.steps[0].error).toBe(true);
      expect(abKeys(res.state)).toEqual([5, 12, 20]);
    }
    expect(planAbOp("delete", 12).title).toBe("Delete(12)");
  });

  it(`Insert nad ${AB_MAX_KEYS} klíčů se odmítne`, () => {
    const st = buildAB(
      Array.from({ length: AB_MAX_KEYS }, (_, i) => i),
      2,
      3,
    );
    const res = apply(st, planAbOp("insert", 500).run);
    expect(res.steps[0].error).toBe(true);
    expect(abKeys(res.state).length).toBe(AB_MAX_KEYS);
  });

  it("regrese ab-param-switch-discards-tree: strom pro jiné (a,b) se postaví ze stejných klíčů", () => {
    const keys = [3, 9, 14, 27, 31, 48, 52];
    for (const [a, b] of AB_PARAMS)
      expect(abKeys(buildAB(abKeys(buildAB(keys, 2, 3)), a, b))).toEqual(keys);
    expect(abSwitchMessage(3, 5, 7)).toContain("(3,5)");
    expect(abSwitchMessage(2, 3, 0)).toBe("Prázdný (2,3)-strom.");
  });
});
