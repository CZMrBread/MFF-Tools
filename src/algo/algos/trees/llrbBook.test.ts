/*
 * Příklady z knihy pro LLRB (Průvodce 8.4): obr. 8.11 a obrázky postupů na str. 209, 211 a 213. Každý
 * příklad je přesně strom z obrázku a operace z něj dá výsledek z obrázku (klíče doplněné za x, y, z, …).
 */
import { describe, expect, it } from "vitest";
import { materialize, type Step } from "../../core/steps";
import { islands, llrbProblems, llrbShape, type LlrbState } from "./llrb";
import { LLRB_BOOK_EXAMPLES, llrbBookById, runBookOp } from "./llrbBook";

const last = <T>(a: readonly T[]) => a[a.length - 1];
const ex = (id: string) => {
  const e = llrbBookById(id);
  if (!e) throw new Error(id);
  return e;
};
const play = (id: string): Step<LlrbState>[] => {
  const e = ex(id);
  const op = e.ops[0];
  return materialize(runBookOp(op)(e.build()));
};

describe("příklady z knihy – LLRB", () => {
  it("všechny jsou platné LLRB stromy své varianty, mají stranu z oddílu 8.4 a nejvýš jednu operaci", () => {
    expect(LLRB_BOOK_EXAMPLES.length).toBeGreaterThanOrEqual(7);
    for (const e of LLRB_BOOK_EXAMPLES) {
      expect(llrbProblems(e.build()), e.id).toEqual([]);
      expect(e.page, e.id).toBeGreaterThanOrEqual(206);
      expect(e.page, e.id).toBeLessThanOrEqual(214);
      expect(e.label, e.id).toMatch(/^(Obr\. 8\.11|Str\. 2\d\d)/);
      expect(e.ops.length, e.id).toBeLessThanOrEqual(1);
    }
    expect(new Set(LLRB_BOOK_EXAMPLES.map((e) => e.id)).size).toBe(
      LLRB_BOOK_EXAMPLES.length,
    );
  });

  it("obr. 8.11: přesně strom z obrázku a jeho překlad na (2,4)-strom", () => {
    const e = ex("obr-8-11");
    const st = e.build();
    expect(st.variant).toBe("24");
    expect(llrbShape(st)).toBe("4(1r(0,3(2r,-)),6r(5,8(7r,9r)))");
    expect(islands(st).map((i) => i.keys.join(" "))).toEqual([
      "1 4 6",
      "0",
      "2 3",
      "5",
      "7 8 9",
    ]);
  });

  it("str. 209: pravá červená hrana se zrotuje (x, y → 1, 2)", () => {
    const steps = play("str-209-rotace");
    expect(llrbShape(last(steps).state)).toBe("2(1r,-)");
  });

  it("str. 209: nekorektní 4-vrchol z pravé odbočky – dvě rotace a přebarvení (x, y, z → 1, 2, 3)", () => {
    const steps = play("str-209-odbocka");
    expect(llrbShape(last(steps).state)).toBe("2(1,3)");
    expect(last(steps).state.vars).toMatchObject({ rotace: 2, přebarvení: 1 });
  });

  it("str. 209: dvě levé červené hrany nad sebou – rotace a přebarvení", () => {
    const steps = play("str-209-dve-leve");
    expect(llrbShape(last(steps).state)).toBe("2(1,3)");
    expect(last(steps).state.vars).toMatchObject({ rotace: 1, přebarvení: 1 });
  });

  it("str. 211: MoveRedLeft jen přebarvením (sloučení se sousedem)", () => {
    const steps = play("str-211-slouceni");
    expect(steps.some((s) => /^Přebarvíme 1, 3 i 2/.test(s.message))).toBe(
      true,
    );
    expect(llrbShape(last(steps).state)).toBe("3(2r,-)");
  });

  it("str. 211: MoveRedLeft s půjčkou od bratra – rotace yx, vx a přebarvení (v, t, y, x → 2, 1, 4, 3)", () => {
    const steps = play("str-211-pujcka");
    const rotations = steps.filter((s) => /rotujeme/.test(s.message));
    expect(rotations.map((s) => s.message)).toEqual([
      expect.stringContaining("4–3"),
      expect.stringContaining("2–3"),
    ]);
    expect(llrbShape(last(steps).state)).toBe("3(2,4)");
  });

  it("str. 213: MoveRedRight jen přebarvením", () => {
    const steps = play("str-213-slouceni");
    expect(llrbShape(last(steps).state)).toBe("2(1r,-)");
  });

  it("str. 213: MoveRedRight s rotací hrany vt a přebarvením kolem t (v, t, y, s → 3, 2, 4, 1)", () => {
    const steps = play("str-213-rotace");
    expect(
      steps.some((s) => /rotujeme červenou hranu 3–2/.test(s.message)),
    ).toBe(true);
    expect(llrbShape(last(steps).state)).toBe("2(1,3)");
  });

  it("každý příklad, který není přesně z knihy, to říká v poznámce (doplněné klíče)", () => {
    for (const e of LLRB_BOOK_EXAMPLES)
      expect(e.note, e.id).toMatch(
        e.id === "obr-8-11" ? /v knize není/ : /doplněn/,
      );
  });
});
