/*
 * Model stránek amortizace (bez Reactu): příklady z přednášky L01 a nabídky operací (ActionMenu).
 */
import { describe, expect, it, vi } from "vitest";
import { initialMenu, prepareGo } from "../../core/actionModel";
import { materialize } from "../../core/steps";
import {
  arrDelete,
  arrInsert,
  ARR_MAX_N,
  ARR_MAX_VALUE,
  CNT_MAX_START,
  cntValue,
  increment,
  mkArr,
  mkCounter,
  phiArr,
} from "./amortized";
import {
  ARRAY_EXAMPLES,
  COUNTER_EXAMPLES,
  sumsText,
  arrayActions,
  BATCH,
  capFromUrl,
  counterActions,
  nextX,
  xFromText,
  type ArrayCtx,
  type CounterCtx,
} from "./pageModel";

const lastState = <S>(steps: { state: S }[]) => steps[steps.length - 1].state;

describe("příklady z přednášky L01 (slide 13: body potenciálu Φ)", () => {
  it("tři stavy pole: plné (p = n, Φ = n), poloviční (p = 2n, Φ = 0), těsně před zmenšením", () => {
    expect(ARRAY_EXAMPLES.map((e) => e.id)).toEqual([
      "l01-full",
      "l01-half",
      "l01-sparse",
    ]);
    for (const e of ARRAY_EXAMPLES)
      expect(e.source).toBe("Přednáška L01, slide 13");
    const [full, half, sparse] = ARRAY_EXAMPLES;
    expect([full.p, full.values.length]).toEqual([4, 4]);
    expect(phiArr(full.values.length, full.p)).toBe(4);
    expect([half.p, half.values.length]).toEqual([8, 4]);
    expect(phiArr(half.values.length, half.p)).toBe(0);
    expect([sparse.p, sparse.values.length]).toEqual([8, 3]);
  });

  it("Insert do plného pole zdvojí kapacitu, Delete z řídkého ji zmenší na polovinu", () => {
    const [full, half, sparse] = ARRAY_EXAMPLES;
    expect(
      lastState(materialize(arrInsert(mkArr(full.p, full.values), 5))).p,
    ).toBe(8);
    expect(
      lastState(materialize(arrInsert(mkArr(half.p, half.values), 5))).p,
    ).toBe(8);
    const s = lastState(materialize(arrDelete(mkArr(sparse.p, sparse.values))));
    expect([s.p, s.items.length]).toEqual([4, 2]);
  });
});

describe("pomůcky", () => {
  it("capFromUrl: kapacita z adresy jen jako mocnina dvojky ≥ n v rozumném rozsahu", () => {
    expect(capFromUrl("8", 4)).toBe(8);
    expect(capFromUrl("4", 4)).toBe(4);
    expect(capFromUrl("2", 4)).toBeNull();
    expect(capFromUrl("6", 4)).toBeNull();
    expect(capFromUrl("x", 4)).toBeNull();
    expect(capFromUrl(null, 4)).toBeNull();
    expect(capFromUrl(String(4 * ARR_MAX_N), 4)).toBeNull();
  });

  it("nextX a xFromText: další navržené x po Insertu, text pole → číslo", () => {
    expect(nextX(5)).toBe(6);
    expect(nextX(ARR_MAX_VALUE)).toBe(ARR_MAX_VALUE);
    expect(xFromText("42", 5)).toBe(42);
    expect(xFromText("−3", 5)).toBe(-3);
    expect(xFromText("abc", 5)).toBe(5);
    expect(xFromText(undefined, 5)).toBe(5);
  });
});

/* ---------------------------------------------------------------- nafukovací pole */

function arr(over: Partial<ArrayCtx> = {}): ArrayCtx {
  return {
    n: 4,
    full: false,
    values: [1, 2, 3, 4],
    xDefault: 5,
    xText: () => undefined,
    insert: vi.fn(),
    remove: vi.fn(),
    insertMany: vi.fn(),
    removeMany: vi.fn(),
    build: vi.fn(),
    random: vi.fn(),
    empty: vi.fn(),
    example: vi.fn(),
    ...over,
  };
}

describe("nabídka nafukovacího pole", () => {
  it("akce: Vytvořit, Insert(x), Delete, 8× Insert, 8× Delete", () => {
    const defs = arrayActions(arr());
    expect(defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Insert(x)",
      "Delete",
      `${BATCH}× Insert`,
      `${BATCH}× Delete`,
    ]);
    expect(defs[1].args![0]).toMatchObject({
      kind: "int",
      name: "x",
      label: "x =",
      default: 5,
    });
    // Delete a dávky jdou jedním klikem jako dřív tlačítka
    for (const d of defs.slice(2)) expect(d.args ?? []).toEqual([]);
    expect(defs[3].title).toContain("x, x+1");
  });

  it("Vytvořit ▸ Vlastní / Z přednášky / Náhodně / Prázdné", () => {
    const c = arr();
    const create = arrayActions(c)[0];
    expect(create.variants!.map((v) => v.label)).toEqual([
      "Vlastní",
      "Z přednášky",
      "Náhodně",
      "Prázdné",
    ]);
    const st = initialMenu([create]);
    const g = prepareGo(create, { ...st, texts: { A: "A = 9, 4, 7" } });
    expect(g.ok).toBe(true);
    if (g.ok) create.run(g.values, g.variant);
    expect(c.build).toHaveBeenCalledWith([9, 4, 7]);
    expect(create.title).toContain("nejvýše 64 čísel");
    const lecture = create.variants![1].args![0];
    expect(lecture.kind).toBe("choice");
    create.run({ ex: "l01-half" }, "lecture");
    expect(c.example).toHaveBeenCalledWith(ARRAY_EXAMPLES[1]);
    create.run({}, "random");
    expect(c.random).toHaveBeenCalled();
    create.run({}, "empty");
    expect(c.empty).toHaveBeenCalled();
  });

  it("Insert(x) předá x; 8× Insert vezme x z pole (nebo výchozí)", () => {
    const c = arr({ xText: () => "40" });
    const defs = arrayActions(c);
    defs[1].run({ x: 42 }, null);
    expect(c.insert).toHaveBeenCalledWith(42);
    defs[3].run({}, null);
    expect(c.insertMany).toHaveBeenCalledWith(40);
    const c2 = arr({ xText: () => "nic" });
    arrayActions(c2)[3].run({}, null);
    expect(c2.insertMany).toHaveBeenCalledWith(5);
  });

  it("prázdné pole: Delete i 8× Delete zakázané s vysvětlením; plné pole: Insert zakázaný", () => {
    const empty = arrayActions(arr({ n: 0, values: [] }));
    expect(empty[2].disabledReason).toContain("prázdné");
    expect(empty[4].disabledReason).toContain("prázdné");
    expect(empty[1].disabledReason ?? null).toBeNull();
    const full = arrayActions(arr({ n: ARR_MAX_N, full: true }));
    expect(full[1].disabledReason).toContain(`${ARR_MAX_N} prvků`);
    expect(full[3].disabledReason).toContain(`${ARR_MAX_N} prvků`);
  });
});

/* ---------------------------------------------------------------- počítadlo */

function cnt(over: Partial<CounterCtx> = {}): CounterCtx {
  return {
    value: 7,
    set: vi.fn(),
    zero: vi.fn(),
    increment: vi.fn(),
    incrementMany: vi.fn(),
    example: vi.fn(),
    ...over,
  };
}

describe("nabídka binárního počítadla", () => {
  it("akce: Vytvořit ▸ Hodnota / Nula, Increment, 8× Increment", () => {
    const c = cnt();
    const defs = counterActions(c);
    expect(defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Increment",
      `${BATCH}× Increment`,
    ]);
    const create = defs[0];
    expect(create.variants!.map((v) => v.label)).toEqual([
      "Hodnota",
      "Nula",
      "Příklady z knihy",
    ]);
    expect(create.variants![0].args![0]).toMatchObject({
      kind: "int",
      name: "v",
      label: "hodnota =",
      min: 0,
      max: CNT_MAX_START,
      default: 7,
    });
    create.run({ v: 15 }, "value");
    expect(c.set).toHaveBeenCalledWith(15);
    create.run({}, "zero");
    expect(c.zero).toHaveBeenCalled();
    defs[1].run({}, null);
    expect(c.increment).toHaveBeenCalled();
    defs[2].run({}, null);
    expect(c.incrementMany).toHaveBeenCalled();
    expect(defs[1].args ?? []).toEqual([]);
  });
});

describe("příklady z knihy a součty (SORTDS-05)", () => {
  it("Obr. 9.1 (s. 222): počítadlo od 0 a 8× Increment dá stavy 0 … 8 jako v knize; obr. 9.2 delší posloupnost", () => {
    expect(COUNTER_EXAMPLES.map((e) => [e.id, e.figure, e.page])).toEqual([
      ["obr-9-1", "9.1", 222],
      ["obr-9-2", "9.2", 226],
    ]);
    const ex = COUNTER_EXAMPLES[0];
    expect(ex.start).toBe(0);
    expect(ex.increments).toBe(8);
    let st = mkCounter(ex.start);
    const seen = [cntValue(st).toString(2)];
    for (let i = 0; i < ex.increments; i++) {
      st = lastState(materialize(increment(structuredClone(st))));
      seen.push(cntValue(st).toString(2));
    }
    // obr. 9.1: 0, 1, 10, 11, 100, 101, 110, 111, 1000
    expect(seen).toEqual([
      "0",
      "1",
      "10",
      "11",
      "100",
      "101",
      "110",
      "111",
      "1000",
    ]);
    expect(COUNTER_EXAMPLES[1].increments).toBeGreaterThan(8);
  });

  it("Vytvořit ▸ Příklady z knihy zavolá example s obrázkem", () => {
    const c = cnt();
    const create = counterActions(c)[0];
    const book = create.variants!.find((v) => v.id === "book")!;
    expect(book.args![0]).toMatchObject({ kind: "choice", name: "fig" });
    create.run({ fig: "obr-9-2" }, "book");
    expect(c.example).toHaveBeenCalledWith(COUNTER_EXAMPLES[1]);
  });

  it("řádek součtů: Σ skutečná = 33 ≤ 45 = Σ amortizovaná + Φ₀ − Φ; „=“ kde platí rovnost", () => {
    expect(sumsText(33, 45)).toBe(
      "Σ skutečná = 33 ≤ 45 = Σ amortizovaná + Φ₀ − Φ",
    );
    expect(sumsText(16, 16)).toBe(
      "Σ skutečná = 16 = 16 = Σ amortizovaná + Φ₀ − Φ",
    );
  });

  it("řádek součtů píše desetinná čísla s čárkou a skutečným minusem (E3: pole kapacity 1 má Φ₀ = 0,5)", () => {
    expect(sumsText(1, 2.5)).toBe(
      "Σ skutečná = 1 ≤ 2,5 = Σ amortizovaná + Φ₀ − Φ",
    );
    expect(sumsText(-1.5, 0.25)).toBe(
      "Σ skutečná = −1,5 ≤ 0,25 = Σ amortizovaná + Φ₀ − Φ",
    );
  });
});
