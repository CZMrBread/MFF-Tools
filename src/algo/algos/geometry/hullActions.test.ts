// Nabídka akcí konvexního obalu: pořadí (Vytvořit, Příklady z knihy, operace), co která akce připraví.
import { describe, expect, it, vi } from "vitest";
import { MAX_N } from "./hull";
import { exampleById } from "./hullBook";
import { hullActions, type HullCtx } from "./hullActions";
import { DEFAULT_CONFIG } from "./hullPageModel";

function ctx(over: Partial<HullCtx> = {}) {
  const c: HullCtx = {
    config: DEFAULT_CONFIG,
    apply: vi.fn(),
    edit: vi.fn(),
    seed: () => 42,
    ...over,
  };
  return c;
}
const byId = (c: HullCtx, id: string) =>
  hullActions(c).find((a) => a.id === id)!;

describe("hullActions", () => {
  it("pořadí: Vytvořit, Příklady z knihy, KonvexníObal, Provázkový, Přidat bod(x, y), Odebrat bod(x, y)", () => {
    expect(hullActions(ctx()).map((a) => a.label)).toEqual([
      "Vytvořit",
      "Příklady z knihy",
      "KonvexníObal",
      "Provázkový",
      "Přidat bod(x, y)",
      "Odebrat bod(x, y)",
    ]);
  });

  it("Odebrat bod(x, y): sdílí pole x, y s Přidat bod (klik na bod je vyplní), v prázdné rovině nejde", () => {
    const c = ctx({
      config: { points: [{ id: 0, x: 10, y: 20 }], alg: "sweep" },
    });
    const a = byId(c, "remove");
    expect(a.args?.map((x) => x.name)).toEqual(["x", "y"]);
    a.run({ x: 10, y: 20 }, null);
    expect(c.edit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "points", points: [] }),
    );
    expect(
      byId(ctx({ config: { points: [], alg: "sweep" } }), "remove")
        .disabledReason,
    ).toBeTruthy();
  });

  it("Vytvořit: Vlastní, Náhodně, Na kružnici, Prázdná rovina; náhodně n bodů se zachovaným algoritmem", () => {
    const c = ctx({ config: { ...DEFAULT_CONFIG, alg: "wrap" } });
    const a = byId(c, "create");
    expect(a.variants?.map((v) => v.label)).toEqual([
      "Vlastní",
      "Náhodně",
      "Na kružnici",
      "Prázdná rovina",
    ]);
    a.run({ n: 12 }, "random");
    const [cfg, title] = (c.apply as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(cfg.points).toHaveLength(12);
    expect(cfg.alg).toBe("wrap");
    expect(title).toBe("Vytvořit: náhodně, n = 12");
    a.run({}, "empty");
    expect(
      (c.apply as ReturnType<typeof vi.fn>).mock.calls[1][0].points,
    ).toEqual([]);
  });

  it("Vlastní: pole hlásí chybu u neplatného textu a upozorní na totožné body", () => {
    const a = byId(ctx(), "create");
    const arg = a.variants![0].args![0];
    expect(arg.check?.("(1, 2), (x, 4)")).toMatch(/celá čísla/);
    expect(arg.check?.("1 2 3")).toMatch(/lichý počet/);
    expect(arg.notice?.("1 2 1 2")).toMatch(/totožný/);
    const n = byId(ctx(), "create").variants![1].args![0];
    expect(n.kind === "int" && n.max).toBe(MAX_N);
  });

  it("Příklady z knihy připraví body i algoritmus příkladu a zvýrazní aktuální příklad", () => {
    const c = ctx();
    const a = byId(c, "book");
    expect(a.selectedVariant).toBe("obr-16-1");
    a.run({}, "obr-16-2");
    const [cfg, title] = (c.apply as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(cfg).toEqual({
      points: exampleById("obr-16-2")!.points,
      alg: "wrap",
    });
    expect(title).toContain("Obr. 16.2");
    expect(
      byId(ctx({ config: { points: [], alg: "sweep" } }), "book")
        .selectedVariant,
    ).toBeNull();
  });

  it("KonvexníObal / Provázkový spustí zvolený algoritmus nad stejnými body (nový běh)", () => {
    const c = ctx();
    byId(c, "wrap").run({}, null);
    byId(c, "sweep").run({}, null);
    const calls = (c.apply as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toEqual({ ...DEFAULT_CONFIG, alg: "wrap" });
    expect(calls[1][0]).toEqual({ ...DEFAULT_CONFIG, alg: "sweep" });
  });

  it("Přidat bod(x, y) předá úpravu bodů (stejná cesta jako klepnutí do roviny)", () => {
    const c = ctx({
      config: { points: [{ id: 0, x: 1, y: 1 }], alg: "sweep" },
    });
    byId(c, "add").run({ x: 40, y: 70 }, null);
    expect(c.edit).toHaveBeenCalledWith({
      kind: "points",
      points: [
        { id: 0, x: 1, y: 1 },
        { id: 1, x: 40, y: 70 },
      ],
      change: "Přidán bod (40, 70).",
    });
  });
});
