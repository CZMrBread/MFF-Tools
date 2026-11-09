/*
 * Model stránky NRP (#/dp/lis): odkaz ?a=…, předvolby z knihy, nabídka operací, náhodné vstupy, popisek
 * běhu a výběr podproblému (klik na sloupec).
 */
import { describe, expect, it, vi } from "vitest";
import { materialize } from "../../core/steps";
import { FIG_12_3, FIG_12_4 } from "./dpBook.fixtures";
import { nrp2Steps } from "./lis";
import {
  LIS_DEFAULT,
  LIS_EXAMPLES,
  LIS_MAX_N,
  lisActions,
  lisCaption,
  lisExampleFor,
  lisFromUrl,
  lisSelection,
  lisToUrl,
  randomLis,
} from "./lisPageModel";

describe("předvolby a výchozí příklad", () => {
  it("výchozí příklad je obr. 12.3; předvolby obr. 12.4 a rostoucí posloupnost (str. 303)", () => {
    expect(LIS_DEFAULT.values).toEqual(FIG_12_3.x);
    expect(LIS_DEFAULT.label).toMatch(/^Obr\. 12\.3/);
    const f124 = LIS_EXAMPLES.find((e) => /12\.4/.test(e.label))!;
    expect(f124.values).toEqual(FIG_12_4.x);
    expect(LIS_EXAMPLES.some((e) => /str\. 303/.test(e.label))).toBe(true);
    for (const e of LIS_EXAMPLES)
      expect(e.values.length).toBeLessThanOrEqual(LIS_MAX_N);
  });

  it("lisExampleFor pozná předvolbu podle hodnot", () => {
    expect(lisExampleFor(FIG_12_3.x)?.id).toBe(LIS_DEFAULT.id);
    expect(lisExampleFor([1, 2])).toBeNull();
  });
});

describe("odkaz ?a=", () => {
  it("bez a = výchozí příklad bez hlášky; výchozí příklad se do adresy nepíše", () => {
    expect(lisFromUrl(null)).toEqual({ values: [...FIG_12_3.x], note: null });
    expect(lisToUrl([...FIG_12_3.x])).toBeNull();
    expect(lisToUrl([5, -3, 8])).toBe("5,-3,8");
  });

  it("platný odkaz se použije; neplatné položky a přebytek se ohlásí; prázdný = výchozí s hláškou", () => {
    expect(lisFromUrl("5,-3,8").values).toEqual([5, -3, 8]);
    const bad = lisFromUrl("5,x,8,5000");
    expect(bad.values).toEqual([5, 8]);
    expect(bad.note).toMatch(/x/);
    const long = lisFromUrl(Array.from({ length: 30 }, (_, i) => i).join(","));
    expect(long.values).toHaveLength(LIS_MAX_N);
    expect(long.note).toMatch(/prvních/);
    const none = lisFromUrl("x,y");
    expect(none.values).toEqual([...FIG_12_3.x]);
    expect(none.note).toMatch(/výchozí/);
  });
});

describe("popisek a náhodné vstupy", () => {
  it("popisek běhu: Nrp2(…) a u předvolby její zdroj", () => {
    expect(lisCaption([...FIG_12_3.x])).toMatch(
      /^Nrp2\(3, 14, 15, …\) – obr\. 12\.3/,
    );
    expect(lisCaption([1, 2])).toBe("Nrp2(1, 2)");
  });

  it("náhodné vstupy: deterministické podle semínka, 12 prvků 1 až 99; rostoucí a klesající", () => {
    expect(randomLis(5, "random")).toEqual(randomLis(5, "random"));
    const r = randomLis(5, "random");
    expect(r).toHaveLength(12);
    expect(r.every((v) => v >= 1 && v <= 99)).toBe(true);
    const inc = randomLis(5, "increasing");
    expect(inc.every((v, i) => i === 0 || v > inc[i - 1])).toBe(true);
    const dec = randomLis(5, "decreasing");
    expect(dec.every((v, i) => i === 0 || v < dec[i - 1])).toBe(true);
  });
});

describe("nabídka operací", () => {
  const ctx = () => ({
    values: [...FIG_12_3.x],
    run: vi.fn(),
    now: () => 3,
  });

  it("pořadí: Vytvořit, Příklady z knihy, Nrp2(x); Vytvořit nemá Výchozí příklad", () => {
    const defs = lisActions(ctx());
    expect(defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Příklady z knihy",
      "Nrp2(x_1, …, x_n)",
    ]);
    expect(defs[0].variants!.some((v) => /Výchozí/.test(v.label))).toBe(false);
  });

  it("Nrp2 s argumentem x spustí běh nad zadanou posloupností; předvolba a náhodný vstup také", () => {
    const c = ctx();
    const defs = lisActions(c);
    defs[2].run({ x: [4, 1, 3] }, null);
    expect(c.run).toHaveBeenLastCalledWith([4, 1, 3], "Nrp2(4, 1, 3)");
    defs[1].run({}, LIS_EXAMPLES[1].id);
    expect(c.run).toHaveBeenLastCalledWith(
      [...LIS_EXAMPLES[1].values],
      expect.stringMatching(/^Příklad/),
    );
    defs[0].run({}, "random");
    expect(c.run).toHaveBeenLastCalledWith(
      randomLis(3, "random"),
      "Vytvořit: náhodně",
    );
  });

  it("argument x má meze a nejvýš LIS_MAX_N čísel; výchozí = aktuální vstup", () => {
    const arg = lisActions(ctx())[2].args![0];
    expect(arg).toMatchObject({ kind: "list", name: "x", maxCount: LIS_MAX_N });
    expect(arg.kind === "list" && arg.default).toEqual(FIG_12_3.x);
  });
});

describe("výběr podproblému (klik na sloupec i)", () => {
  const steps = materialize(nrp2Steps(FIG_12_3.x));
  const last = steps[steps.length - 1].state;

  it("spočítané T[i]: NRP začínající xᵢ po odkazech P", () => {
    const s = lisSelection(last, 5)!;
    expect(s.cols).toEqual([5, 7]);
    expect(s.text).toContain("T[5] = 2");
    expect(s.text).toContain("65, 89");
  });

  it("i = 0: celé řešení (bez −∞); nespočítané T[i]: jen poznámka", () => {
    expect(lisSelection(last, 0)!.cols).toEqual([0, 1, 2, 3, 6, 10, 11]);
    const early = steps[3].state;
    expect(lisSelection(early, 1)!.cols).toEqual([]);
    expect(lisSelection(early, 1)!.text).toMatch(/ještě/);
    expect(lisSelection(last, null)).toBeNull();
  });
});
