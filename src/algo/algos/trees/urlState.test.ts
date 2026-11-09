/*
 * „Kopírovat odkaz“ = aktuální stav (CROSS-01): stránka stromu zapisuje do ?k= klíče v pořadí po hladinách.
 * Strom postavený z odkazu (buildTree) má u BST, AVL i splay stejný tvar (vkládání po hladinách nic
 * nerotuje), u BB[α] a (a,b) stejnou množinu klíčů.
 */
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { AB_DEFAULT_KEYS, buildAB, planAbOp } from "./abOps";
import { abKeys } from "./abtree";
import { layout, type TreeState } from "./bst";
import {
  buildTree,
  DEFAULT_KEYS,
  levelOrderKeys,
  planOp,
  type Kind,
  type OpName,
} from "./treeOps";

function apply(st: TreeState, kind: Kind, ops: [OpName, number][]) {
  for (const [op, x] of ops) {
    const steps = materialize(planOp(kind, op, x).run(structuredClone(st)));
    st = steps[steps.length - 1].state;
  }
  return st;
}

/** tvar: poloha a hloubka každého klíče */
const shape = (st: TreeState) =>
  layout(st)
    .nodes.map((n) => `${n.label}@${n.x.toFixed(4)},${n.y}`)
    .sort();

const SCENARIOS: [OpName, number][][] = [
  [["insert", 27]],
  [
    ["insert", 27],
    ["delete", 20],
    ["find", 60],
  ],
  [
    ["delete", 40],
    ["insert", 1],
    ["insert", 2],
    ["insert", 3],
    ["insert", 4],
  ],
  [
    ["find", 70],
    ["find", 10],
    ["delete", 30],
    ["insert", 99],
  ],
];

describe("klíče do odkazu po hladinách", () => {
  it("levelOrderKeys: kořen, pak hladiny zleva doprava", () => {
    const st = buildTree([40, 20, 60, 10, 30, 50, 70, 25], "bst");
    expect(levelOrderKeys(st)).toEqual([40, 20, 60, 10, 30, 50, 70, 25]);
    expect(levelOrderKeys(buildTree([], "bst"))).toEqual([]);
  });

  for (const kind of ["bst", "avl", "splay"] as Kind[])
    it(`${kind}: strom z odkazu má po operacích stejný tvar`, () => {
      for (const ops of SCENARIOS) {
        const st = apply(buildTree(DEFAULT_KEYS[kind], kind), kind, ops);
        const again = buildTree(levelOrderKeys(st), kind);
        expect(shape(again), JSON.stringify(ops)).toEqual(shape(st));
      }
    });

  it("bb a (a,b): odkaz nese množinu klíčů", () => {
    const st = apply(buildTree(DEFAULT_KEYS.bb, "bb"), "bb", SCENARIOS[2]);
    expect([...levelOrderKeys(st)].sort((a, b) => a - b)).toEqual(
      [...levelOrderKeys(buildTree(levelOrderKeys(st), "bb"))].sort(
        (a, b) => a - b,
      ),
    );
    let ab = buildAB(AB_DEFAULT_KEYS, 2, 3);
    for (const [op, x] of [
      ["insert", 50],
      ["delete", 5],
    ] as const) {
      const steps = materialize(planAbOp(op, x).run(structuredClone(ab)));
      ab = steps[steps.length - 1].state;
    }
    expect(abKeys(buildAB(abKeys(ab), 2, 3))).toEqual(abKeys(ab));
  });
});
