/*
 * Historie vstupů stránek bez struktury (třídění: P, stránkování: σ a P) pro řádek
 * „Historie … ↶ Vrátit operaci · Výchozí příklad“ ve Visualizeru (CROSS-04/05).
 */
import { describe, expect, it } from "vitest";
import { initInputs, pushInput, titlesOf, undoInput } from "./inputHistory";

const same = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

describe("historie vstupů", () => {
  it("nový vstup se zapíše s názvem, ↶ vrátí předchozí; stejný vstup historii nemění", () => {
    let h = initInputs([5, 3, 9]);
    expect(titlesOf(h)).toEqual([]);
    expect(undoInput(h)).toBe(h);
    h = pushInput(h, [5, 3, 9], "Quicksort(P)", same);
    expect(titlesOf(h)).toEqual([]);
    h = pushInput(h, [5, 7, 9], "P[2] ← 7", same);
    h = pushInput(h, [1, 2], "Vytvořit(1, 2)", same);
    expect(h.current).toEqual([1, 2]);
    expect(titlesOf(h)).toEqual(["P[2] ← 7", "Vytvořit(1, 2)"]);
    h = undoInput(h);
    expect(h.current).toEqual([5, 7, 9]);
    h = undoInput(h);
    expect(h.current).toEqual([5, 3, 9]);
    expect(titlesOf(h)).toEqual([]);
  });

  it("historie má horní mez (nejstarší záznamy odpadnou)", () => {
    let h = initInputs(0);
    for (let i = 1; i <= 80; i++)
      h = pushInput(h, i, `#${i}`, (a, b) => a === b);
    expect(titlesOf(h).length).toBeLessThanOrEqual(50);
    expect(titlesOf(h).at(-1)).toBe("#80");
  });
});
