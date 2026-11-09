/**
 * Matice „klíč → bity“ pod Bloomovým filtrem: pro každý vložený klíč řádek se značkami pod jeho bity
 * h₁(x), …, h_k(x). Probíhající Insert / Lookup má řádek zvýrazněný a značky přibývají s kroky.
 */
import { describe, expect, it } from "vitest";
import { materialize, type Step } from "../../core/steps";
import {
  blBuild,
  bloomBits,
  blOp,
  blTestForeign,
  type BloomState,
} from "./bloom";
import { bloomMatrix } from "./ui";
import { BLOOM_DEFAULT } from "./ui";

const base = () =>
  blBuild(BLOOM_DEFAULT.m, BLOOM_DEFAULT.k, BLOOM_DEFAULT.keys).state;
const last = <S>(steps: Step<S>[]) => steps[steps.length - 1].state;
/** bity h₁(x), …, h_k(x) v pořadí funkcí, bez opakování */
const distinct = (st: BloomState, x: number) => [...new Set(bloomBits(st, x))];

describe("bloomMatrix", () => {
  it("výchozí filtr: řádek pro každý vložený klíč se všemi jeho bity, nic zvýrazněné", () => {
    const st = base();
    const rows = bloomMatrix(st);
    expect(rows.map((r) => r.key)).toEqual([17, 42, 99]);
    for (const r of rows) {
      expect(r.hot).toBe(false);
      expect(r.cells.map((c) => c.bit)).toEqual(distinct(st, r.key));
      expect(r.cells.every((c) => c.state === "")).toBe(true);
    }
  });

  it("prázdný filtr: žádné řádky", () => {
    expect(bloomMatrix(blBuild(32, 3, []).state)).toEqual([]);
  });

  it("Insert(55): řádek 55 je zvýrazněný a značky přibývají po krocích (nový bit is-ok, už 1 is-done)", () => {
    const steps = materialize(blOp(base(), 55, "insert"));
    const first = bloomMatrix(steps[0].state);
    const row = first.find((r) => r.key === 55)!;
    expect(row.hot).toBe(true);
    expect(row.cells).toHaveLength(1);
    const end = bloomMatrix(last(steps)).find((r) => r.key === 55)!;
    expect(end.cells.map((c) => c.bit)).toEqual(distinct(last(steps), 55));
    for (const c of end.cells) expect(["is-ok", "is-done"]).toContain(c.state);
  });

  it("Lookup nevloženého klíče: řádek navíc na konci; bit 0 je is-fail", () => {
    const st = base();
    // najdeme klíč, jehož některý bit je 0 (odpověď NE)
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((y) =>
      bloomBits(st, y).some((p) => !st.bits[p]),
    )!;
    const rows = bloomMatrix(last(materialize(blOp(st, x, "lookup"))));
    expect(rows.map((r) => r.key)).toEqual([17, 42, 99, x]);
    const row = rows[3];
    expect(row.hot).toBe(true);
    expect(row.cells[row.cells.length - 1].state).toBe("is-fail");
  });

  it("souhrn testu nevložených klíčů zvýraznění zruší", () => {
    const rows = bloomMatrix(last(materialize(blTestForeign(base(), 3, 7))));
    expect(rows.map((r) => r.key)).toEqual([17, 42, 99]);
    expect(rows.some((r) => r.hot)).toBe(false);
  });
});
