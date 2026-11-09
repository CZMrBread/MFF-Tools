/**
 * E3 (rozhodnutí vlastníka 7. 11. 2026): zobrazovaná desetinná čísla stránek stromů s českou čárkou
 * (Φ, α, mez α·s). Adresa (`alpha=0.7`) a identifikátory variant nabídky dál s tečkou.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import { TIPS, ALPHA_OPTIONS, alphaNotice, buildTree, planOp } from "./treeOps";
import type { OpName } from "./treeOps";
import { alphaError } from "./trees2";
import { treeActions } from "./treeMenu";
import { displayVars } from "./keys";

/** desetinná tečka mezi číslicemi */
const POINT = /\d\.\d/;
const OPS: OpName[] = ["find", "insert", "delete"];

describe("desetinná čárka ve zprávách kroků", () => {
  for (const kind of ["splay", "bb"] as const)
    for (const alpha of [0.55, 0.7, 0.95])
      it(`${kind}, α = ${alpha}: žádná zpráva nemá desetinnou tečku`, () => {
        let st = buildTree([40, 20, 60, 10, 30, 50, 70, 25, 1, 2, 3, 4], kind);
        const r = rng(Math.round(alpha * 100));
        const bad: string[] = [];
        let decimals = 0;
        for (let i = 0; i < 40; i++) {
          const op = OPS[Math.floor(r() * 3)];
          const x = Math.floor(r() * 80);
          const steps = materialize(
            planOp(kind, op, x, alpha).run(structuredClone(st)),
          );
          for (const s of steps) {
            if (POINT.test(s.message)) bad.push(s.message);
            if (/\d,\d/.test(s.message)) decimals++;
          }
          st = steps[steps.length - 1].state;
        }
        expect(bad).toEqual([]);
        // čísla s desetinnou částí se opravdu objevují (Φ splay stromu, mez α·s)
        expect(decimals).toBeGreaterThan(0);
      });

  it("BB[α]: snížení α ohlásí „z 0,95 na 0,55“", () => {
    let st = buildTree([1, 2, 3, 4, 5, 6, 7, 8], "bb");
    st = materialize(planOp("bb", "insert", 9, 0.7).run(st)).at(-1)!.state;
    for (let x = 10; x < 14; x++)
      st = materialize(planOp("bb", "insert", x, 0.95).run(st)).at(-1)!.state;
    const steps = materialize(planOp("bb", "insert", 20, 0.55).run(st));
    expect(steps.map((s) => s.message).join(" ")).toMatch(/z 0,95 na 0,55/);
  });
});

describe("desetinná čárka v textech stránky", () => {
  it("chyba α, upozornění na porušenou podmínku a tip BB[α]", () => {
    expect(alphaError(2)).toMatch(/například 0,7/);
    expect(alphaError(2)).not.toMatch(POINT);
    const path = buildTree([1, 2, 3, 4, 5, 6, 7, 8], "bst");
    const notice = alphaNotice(path, 0.55)!;
    expect(notice).toMatch(/α = 0,55/);
    expect(TIPS.bb).not.toMatch(POINT);
  });

  it("nabídka α: popisky s čárkou, id variant s tečkou (adresa alpha=0.6 beze změny)", () => {
    const st = buildTree([1, 2, 3], "bb");
    const defs = treeActions(
      {
        kind: "bb",
        state: st,
        keys: [1, 2, 3],
        x: 1,
        alpha: 0.7,
        seed: () => 1,
      },
      { op: () => {}, rebuild: () => {}, example: () => {}, alpha: () => {} },
    );
    const alpha = defs.find((d) => d.id === "alpha")!;
    expect(alpha.label).toBe("α = 0,7");
    expect(alpha.variants!.map((v) => v.id)).toEqual(ALPHA_OPTIONS.map(String));
    expect(alpha.variants!.map((v) => v.label)).toContain("0,55");
    expect(alpha.variants!.some((v) => POINT.test(v.label))).toBe(false);
  });

  it("panel proměnných: čísla s čárkou, texty beze změny", () => {
    expect(displayVars({ Φ: 9.17, x: 5, "δ(v)": "+1", α: 0.7 })).toEqual({
      Φ: "9,17",
      x: "5",
      "δ(v)": "+1",
      α: "0,7",
    });
  });
});
