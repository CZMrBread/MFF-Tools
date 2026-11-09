import { describe, expect, it } from "vitest";
import {
  argList,
  count,
  failStep,
  ignoredList,
  inputNote,
  listFromUrl,
  plural,
  toUrl,
} from "./input";

describe("hlášky", () => {
  it("plural skloňuje po číslovce", () => {
    expect(plural(1, "prvek", "prvky", "prvků")).toBe("1 prvek");
    expect(plural(3, "prvek", "prvky", "prvků")).toBe("3 prvky");
    expect(plural(5, "prvek", "prvky", "prvků")).toBe("5 prvků");
    expect(plural(0, "prvek", "prvky", "prvků")).toBe("0 prvků");
    expect(count(2)).toBe("2 prvky");
  });

  it("inputNote popíše oříznutí i přeskočené tokeny, jinak je prázdná", () => {
    expect(inputNote(8, 8)).toBe("");
    expect(inputNote(31, 40)).toBe(
      " (vstup má 40 čísel, vizualizace bere jen prvních 31)",
    );
    expect(inputNote(2, 2, ["abc"])).toBe(" (přeskočeno, není číslo: abc)");
    expect(inputNote(16, 20, ["x", "y"])).toBe(
      " (vstup má 20 čísel, vizualizace bere jen prvních 16; přeskočeno, není číslo: x, y)",
    );
  });

  it("ignoredList zkrátí dlouhý výčet i dlouhé tokeny", () => {
    expect(ignoredList(["a", "b", "c", "d", "e", "f", "g"])).toBe(
      "a, b, c, d, e a další",
    );
    expect(ignoredList(["abcdefghijklmnopq"])).toBe("abcdefghijkl…");
  });

  it("argList zkrátí dlouhý seznam argumentů do názvu operace", () => {
    expect(argList([5, 12, 8])).toBe("5, 12, 8");
    expect(argList([15, 3, 9, 1, 12, 7, 4, 10])).toBe("15, 3, 9, 1, 12, 7, …");
    expect(argList([])).toBe("");
  });

  it("failStep je chybový krok bez řádku s kopií stavu", () => {
    const st = { a: [1] };
    const s = failStep(st, "Nelze.");
    expect(s).toEqual({
      state: { a: [1] },
      line: null,
      message: "Nelze.",
      error: true,
    });
    expect(s.state).not.toBe(st);
  });
});

describe("vstup z adresy", () => {
  it("listFromUrl vezme platná celá čísla v rozsahu, nejvýše maxCount", () => {
    expect(listFromUrl("15,3,9", 31)).toEqual([15, 3, 9]);
    expect(listFromUrl("1,2,3,4", 2)).toEqual([1, 2]);
    expect(listFromUrl("5,abc,−7,2000", 31)).toEqual([5, -7]);
  });

  it("chybějící nebo nepoužitelný parametr = výchozí příklad (null)", () => {
    expect(listFromUrl(null, 31)).toBeNull();
    expect(listFromUrl("", 31)).toBeNull();
    expect(listFromUrl("abc,1.5", 31)).toBeNull();
  });

  it("toUrl a listFromUrl jsou navzájem inverzní", () => {
    const v = [-5, 0, 12, 999];
    expect(listFromUrl(toUrl(v), 31)).toEqual(v);
  });
});
