/*
 * Model stránky Editační vzdálenost (#/dp/edit): odkaz ?x=…&y=…, předvolby z knihy, čištění slov,
 * nabídka operací, náhodná slova, popisek běhu a výběr podproblému (klik na buňku T[i, j]).
 */
import { describe, expect, it, vi } from "vitest";
import { materialize } from "../../core/steps";
import { FIG_12_5 } from "./dpBook.fixtures";
import { edit2, edit2Steps } from "./editDistance";
import {
  cleanWord,
  EDIT_DEFAULT,
  EDIT_EXAMPLES,
  EDIT_MAX,
  editActions,
  editCaption,
  editFromUrl,
  editSelection,
  editToUrl,
  randomEdit,
} from "./editPageModel";

describe("předvolby z knihy", () => {
  it("výchozí poutník → potemník (obr. 12.5); koule → boule a kdoule (str. 306); stejná slova (str. 308)", () => {
    expect(EDIT_DEFAULT).toMatchObject({ x: FIG_12_5.x, y: FIG_12_5.y });
    expect(EDIT_DEFAULT.label).toMatch(/^Obr\. 12\.5/);
    const pairs = EDIT_EXAMPLES.map((e) => `${e.x}/${e.y}`);
    expect(pairs).toContain("koule/boule");
    expect(pairs).toContain("koule/kdoule");
    expect(EDIT_EXAMPLES.some((e) => e.x === e.y)).toBe(true);
    for (const e of EDIT_EXAMPLES) {
      expect([...e.x].length).toBeLessThanOrEqual(EDIT_MAX);
      expect([...e.y].length).toBeLessThanOrEqual(EDIT_MAX);
    }
  });
});

describe("slova a odkaz", () => {
  it("cleanWord: ořízne okraje, sjednotí diakritiku (NFC); mezera uvnitř, prázdné a dlouhé slovo jsou chyba", () => {
    expect(cleanWord("  koule ")).toEqual({ value: "koule", error: null });
    expect(cleanWord("poutník").value).toBe("poutník");
    expect(cleanWord("dvě slova").error).toMatch(/mezer/);
    expect(cleanWord("  ").error).toMatch(/aspoň/);
    expect(cleanWord("a".repeat(EDIT_MAX + 1)).error).toMatch(/Nejvýše/);
  });

  it("bez parametrů výchozí příklad; výchozí se do adresy nepíše; vadné slovo = výchozí s hláškou", () => {
    expect(editFromUrl(null, null)).toEqual({
      x: FIG_12_5.x,
      y: FIG_12_5.y,
      note: null,
    });
    expect(editToUrl(FIG_12_5.x, FIG_12_5.y)).toBeNull();
    expect(editToUrl("koule", "boule")).toEqual({ x: "koule", y: "boule" });
    expect(editFromUrl("koule", "boule")).toMatchObject({
      x: "koule",
      y: "boule",
      note: null,
    });
    const bad = editFromUrl("dvě slova", "boule");
    expect(bad).toMatchObject({ x: FIG_12_5.x, y: FIG_12_5.y });
    expect(bad.note).toMatch(/výchozí/);
    // jen jedno slovo v odkazu: druhé z výchozího příkladu
    expect(editFromUrl("pout", null)).toMatchObject({
      x: "pout",
      y: FIG_12_5.y,
    });
  });
});

describe("popisek a náhodná slova", () => {
  it("Edit2(x, y) a u předvolby obrázek", () => {
    expect(editCaption(FIG_12_5.x, FIG_12_5.y)).toBe(
      "Edit2(poutník, potemník) – obr. 12.5",
    );
    expect(editCaption("ab", "ba")).toBe("Edit2(ab, ba)");
  });

  it("náhodná slova: deterministická, 4 až 8 znaků; překlepy se od slova liší nejvýš 3 úpravami", () => {
    expect(randomEdit(9, "typo")).toEqual(randomEdit(9, "typo"));
    for (let s = 1; s < 40; s++) {
      const t = randomEdit(s, "typo");
      expect([...t.x].length).toBeGreaterThanOrEqual(4);
      expect([...t.y].length).toBeLessThanOrEqual(EDIT_MAX);
      expect(edit2(t.x, t.y)[0][0]).toBeLessThanOrEqual(3);
      const w = randomEdit(s, "words");
      expect([...w.x].length).toBeLessThanOrEqual(8);
    }
  });
});

describe("nabídka operací", () => {
  const ctx = () => ({ x: "koule", y: "boule", run: vi.fn(), now: () => 4 });

  it("Vytvořit, Příklady z knihy, Edit2(x, y)", () => {
    const defs = editActions(ctx());
    expect(defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Příklady z knihy",
      "Edit2(x, y)",
    ]);
    expect(defs[1].selectedVariant).toBe("koule-boule");
  });

  it("Edit2 s argumenty spustí běh; mezera uvnitř slova a příliš dlouhé slovo neprojdou kontrolou", () => {
    const c = ctx();
    const defs = editActions(c);
    defs[2].run({ x: " kos ", y: "kosa" }, null);
    expect(c.run).toHaveBeenLastCalledWith("kos", "kosa", "Edit2(kos, kosa)");
    const xArg = defs[2].args![0];
    expect(xArg.kind === "text" && xArg.pattern?.test("dvě slova")).toBe(false);
    expect(xArg.kind === "text" && xArg.maxLength).toBe(EDIT_MAX);
    defs[0].run({}, "typo");
    const t = randomEdit(4, "typo");
    expect(c.run).toHaveBeenLastCalledWith(t.x, t.y, "Vytvořit: překlepy");
    defs[1].run({}, "fig12-5");
    expect(c.run).toHaveBeenLastCalledWith(
      FIG_12_5.x,
      FIG_12_5.y,
      "Příklad: Obr. 12.5",
    );
  });
});

describe("výběr podproblému (klik na buňku)", () => {
  const steps = materialize(edit2Steps(FIG_12_5.x, FIG_12_5.y));
  const last = steps[steps.length - 1].state;

  it("spočítaná buňka: L přípon a jejich nejkratší úpravy, cesta do rohu", () => {
    const s = editSelection(last, 2, 2)!;
    expect(s.text).toContain("T[3, 3] = 3");
    expect(s.text).toContain("L(„utník“, „temník“)");
    expect(s.cells[0]).toEqual([2, 2]);
    expect(s.cells.at(-1)).toEqual([7, 8]);
  });

  it("okraj a nespočítaná buňka", () => {
    expect(editSelection(last, 7, 8)!.text).toContain("= 0");
    expect(editSelection(steps[2].state, 0, 0)!.cells).toEqual([]);
    expect(editSelection(steps[2].state, 0, 0)!.text).toMatch(/ještě/);
    expect(editSelection(last, null, null)).toBeNull();
  });
});
