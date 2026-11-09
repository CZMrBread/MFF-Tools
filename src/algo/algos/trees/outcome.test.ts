/*
 * Závěrečný krok operací bez účinku (klíč nenalezen, už existuje, strom prázdný) nese outcome „neutral“
 * – Visualizer pak místo zeleného ✓ ukáže ⓘ. Skutečná změna nebo nález outcome nemá (TREEHASH-18).
 */
import { describe, expect, it } from "vitest";
import { materialize, type Step } from "../../core/steps";
import { AB_DEFAULT_KEYS, buildAB, planAbOp } from "./abOps";
import {
  buildTree,
  DEFAULT_KEYS,
  planOp,
  type Kind,
  type OpName,
} from "./treeOps";

const last = <S>(steps: Step<S>[]) => steps[steps.length - 1];

function treeRun(kind: Kind, op: OpName, x: number, keys = DEFAULT_KEYS[kind]) {
  const p = planOp(kind, op, x);
  return materialize(p.run(buildTree(keys, kind)));
}

describe("outcome závěrečného kroku stromových operací", () => {
  it("BST Delete(33) na stromu bez 33 → outcome neutral, text bez ✓", () => {
    expect(DEFAULT_KEYS.bst).not.toContain(33);
    const f = last(treeRun("bst", "delete", 33));
    expect(f.outcome).toBe("neutral");
    expect(f.message).not.toContain("✓");
  });

  for (const kind of ["bst", "avl", "splay", "bb"] as Kind[]) {
    const keys = DEFAULT_KEYS[kind];
    const inTree = keys[0];
    const missing = 98;
    it(`${kind}: Find nenalezeno, Insert existujícího, Delete chybějícího → neutral; nález a změna bez outcome`, () => {
      expect(keys).not.toContain(missing);
      expect(last(treeRun(kind, "find", missing)).outcome).toBe("neutral");
      expect(last(treeRun(kind, "insert", inTree)).outcome).toBe("neutral");
      expect(last(treeRun(kind, "delete", missing)).outcome).toBe("neutral");
      expect(last(treeRun(kind, "find", inTree)).outcome).toBeUndefined();
      expect(last(treeRun(kind, "insert", missing)).outcome).toBeUndefined();
      expect(last(treeRun(kind, "delete", inTree)).outcome).toBeUndefined();
      // prázdný strom
      expect(last(treeRun(kind, "find", 5, [])).outcome).toBe("neutral");
      expect(last(treeRun(kind, "delete", 5, [])).outcome).toBe("neutral");
    });
  }

  it("(a,b)-strom: totéž", () => {
    const run = (
      op: "find" | "insert" | "delete",
      x: number,
      keys = AB_DEFAULT_KEYS,
    ) => last(materialize(planAbOp(op, x).run(buildAB(keys, 2, 3))));
    expect(run("find", 35).outcome).toBe("neutral");
    expect(run("insert", 41).outcome).toBe("neutral");
    expect(run("delete", 35).outcome).toBe("neutral");
    expect(run("find", 41).outcome).toBeUndefined();
    expect(run("insert", 35).outcome).toBeUndefined();
    expect(run("delete", 41).outcome).toBeUndefined();
    expect(run("find", 5, []).outcome).toBe("neutral");
    expect(run("delete", 5, []).outcome).toBe("neutral");
  });
});
