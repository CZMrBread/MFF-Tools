/**
 * Počítadla porovnání a přesunů, závěrečné kroky, legenda a čistá logika stránky třídění (vstup z adresy,
 * titulek operace, popisky). Stránku samotnou vykreslíme na server (renderToStaticMarkup) uvnitř MemoryRouteru.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step } from "../../core/steps";
import { MARK_GLYPH } from "../../views/arrayLayout";
import { SORTING } from "./algorithms";
import { bubbleSort, insertSort, selectSort } from "./simple";
import { mergeSort } from "./merge";
import { quickSort } from "./quick";
import { countingSort, heapSort } from "./heapcount";
import {
  DEFAULT_INPUT,
  DEFAULT_SMALL_INPUT,
  MAX_INPUT_N,
  defaultInput,
  inputFromUrl,
  inputLimits,
  inputToUrl,
  opTitleFor,
  plainMath,
  scaleMin,
} from "./input";
import { legendFor, usedMarks } from "./legend";
import { finished, type SortAlgorithm, type SortState } from "./types";
import { SortingPage } from "./SortingPage";

function randomInput(seed: number, maxN: number, maxV: number): number[] {
  const r = rng(seed);
  const n = 1 + Math.floor(r() * maxN);
  return Array.from({ length: n }, () => 1 + Math.floor(r() * maxV));
}

const SMALL: number[][] = [
  [5],
  [1, 2],
  [2, 1],
  [7, 7, 7],
  [9, 8, 7, 6, 5, 4, 3, 2, 1],
  DEFAULT_SMALL_INPUT,
  ...Array.from({ length: 12 }, (_, k) => randomInput(k + 7, 14, 9)),
];
const WIDE: number[][] = [
  DEFAULT_INPUT,
  ...Array.from({ length: 8 }, (_, k) => randomInput(k + 501, 20, 99)),
];
const inputsFor = (algo: SortAlgorithm) =>
  algo === countingSort ? SMALL : [...SMALL, ...WIDE];

const cache = new Map<string, Step<SortState>[]>();
function run(algo: SortAlgorithm, input: number[]): Step<SortState>[] {
  const key = algo.id + ":" + input.join(" ");
  let steps = cache.get(key);
  if (!steps) cache.set(key, (steps = materialize(algo.run(input))));
  return steps;
}
const last = (steps: Step<SortState>[]) => steps[steps.length - 1];

/** počet inverzí (dvojic i < j s a_i > a_j) */
function inversions(a: number[]): number {
  let c = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) c++;
  return c;
}

/* ------------------------------------------------------------------ počítadla */

describe("počítadla porovnání a přesunů", () => {
  for (const algo of SORTING) {
    it(`${algo.id}: začínají na nule a nikdy neklesají`, () => {
      for (const input of inputsFor(algo)) {
        const steps = run(algo, input);
        expect(steps[0].state.stats.moves).toBe(0);
        expect(steps[0].state.stats.cmp).toBeLessThanOrEqual(1);
        for (let k = 1; k < steps.length; k++) {
          const a = steps[k - 1].state.stats;
          const b = steps[k].state.stats;
          expect(
            b.cmp >= a.cmp && b.moves >= a.moves,
            `${algo.id} [${input.join(" ")}] krok ${k}`,
          ).toBe(true);
        }
      }
    });

    it(`${algo.id}: poslední krok je jasný závěr se shrnutím počítadel`, () => {
      for (const input of inputsFor(algo)) {
        const end = last(run(algo, input));
        expect(end.error).toBeFalsy();
        expect(
          end.message.startsWith(finished(end.state, algo.moves)),
          end.message,
        ).toBe(true);
        expect(end.message).toContain(
          `n = ${input.length}: ${end.state.stats.cmp} porovnání`,
        );
      }
    });
  }

  it("bubble: prohození = počet inverzí, porovnání = průchody · (n − 1)", () => {
    for (const input of inputsFor(bubbleSort)) {
      const steps = run(bubbleSort, input);
      const passes = steps.filter((s) => s.line === 2).length;
      const { cmp, moves } = last(steps).state.stats;
      expect(moves).toBe(inversions(input));
      expect(cmp).toBe(passes * (input.length - 1));
      expect(last(steps).message).toContain(`Průchodů: ${passes}.`);
    }
  });

  it("select: porovnání = n(n − 1)/2 vždy, prohození nejvýš n − 1 (prohození prvku se sebou se nepočítá)", () => {
    for (const input of inputsFor(selectSort)) {
      const n = input.length;
      const { cmp, moves } = last(run(selectSort, input)).state.stats;
      expect(cmp).toBe((n * (n - 1)) / 2);
      expect(moves).toBeLessThanOrEqual(Math.max(0, n - 1));
    }
    expect(last(run(selectSort, [1, 2, 3, 4])).state.stats.moves).toBe(0);
    expect(last(run(selectSort, [2, 1])).state.stats.moves).toBe(1);
  });

  it("insert: posunů je přesně tolik, kolik je inverzí; porovnání nejvýš inverze + n − 1", () => {
    for (const input of inputsFor(insertSort)) {
      const { cmp, moves } = last(run(insertSort, input)).state.stats;
      const inv = inversions(input);
      expect(moves).toBe(inv);
      expect(cmp).toBeGreaterThanOrEqual(inv);
      expect(cmp).toBeLessThanOrEqual(inv + input.length - 1);
    }
    // setříděný vstup: lineárně mnoho porovnání, žádný posun
    expect(last(run(insertSort, [1, 2, 3, 4, 5])).state.stats).toEqual({
      cmp: 4,
      moves: 0,
    });
  });

  it("merge: přesunů do Z je stejně pro každý vstup délky n (n · log₂ n pro mocninu dvou), porovnání nejvýš tolik", () => {
    const sorted = last(run(mergeSort, [1, 2, 3, 4, 5, 6, 7, 8])).state.stats;
    const reversed = last(run(mergeSort, [8, 7, 6, 5, 4, 3, 2, 1])).state.stats;
    expect(sorted.moves).toBe(24);
    expect(reversed.moves).toBe(24);
    expect(sorted.cmp).toBe(12); // každé slévání skončí, jakmile se vyčerpá X
    expect(reversed.cmp).toBe(12);
    for (const input of inputsFor(mergeSort)) {
      const { cmp, moves } = last(run(mergeSort, input)).state.stats;
      expect(cmp).toBeLessThanOrEqual(moves);
    }
  });

  it("quick: prohození = kroky „Prohodili jsme“, každé posunutí jezdce stojí jedno porovnání", () => {
    for (const input of inputsFor(quickSort)) {
      const steps = run(quickSort, input);
      const { cmp, moves } = last(steps).state.stats;
      expect(moves).toBe(
        steps.filter((s) => s.message.startsWith("Prohodili jsme")).length,
      );
      const slides = steps.filter((s) => s.line === 5 || s.line === 6).length;
      expect(cmp).toBeGreaterThanOrEqual(slides);
      if (input.length > 1)
        expect(cmp).toBeGreaterThanOrEqual(input.length - 1);
    }
  });

  it("heap: prohození = n − 1 přesunů maxima + prohození v BubbleDown", () => {
    for (const input of inputsFor(heapSort)) {
      const steps = run(heapSort, input);
      const down = steps.filter((s) => s.line === 10).length;
      expect(last(steps).state.stats.moves).toBe(input.length - 1 + down);
    }
  });

  it("counting: nic neporovnává, zápisů do výstupu je n", () => {
    for (const input of SMALL) {
      const end = last(run(countingSort, input));
      expect(end.state.stats).toEqual({ cmp: 0, moves: input.length });
      expect(end.message).toContain(
        `${input.length} ${input.length === 1 ? "zápis" : input.length <= 4 ? "zápisy" : "zápisů"}`,
      );
    }
  });

  it("odmítnutý vstup je chybový krok (Counting sort mimo rozsah, prázdný vstup)", () => {
    const bad = materialize(countingSort.run([3, 12]));
    expect(bad).toHaveLength(1);
    expect(bad[0].error).toBe(true);
    for (const algo of SORTING)
      expect(materialize(algo.run([]))[0].error).toBe(true);
  });
});

/* ------------------------------------------------------------------ legenda */

describe("legenda", () => {
  for (const algo of SORTING) {
    it(`${algo.id}: obsahuje právě značky, které se v krocích vyskytnou, se znakem jako na plátně`, () => {
      const steps = run(algo, defaultInput(algo));
      const used = usedMarks(steps);
      const legend = legendFor(algo, steps);
      expect(legend.map((l) => l.cls.replace("bar-", "")).sort()).toEqual(
        [...used].sort(),
      );
      for (const l of legend) {
        const mark = l.cls.replace("bar-", "") as keyof typeof MARK_GLYPH;
        expect(l.glyph).toBe(MARK_GLYPH[mark]);
        expect(l.label).not.toMatch(/_/); // indexy převedené na Unicode (legenda je prostý text)
      }
    });
  }

  it("Bubblesort nenabízí pivot, jezdce ani větší syn; Quicksort pivot i jezdce ano", () => {
    const bubble = legendFor(bubbleSort, run(bubbleSort, DEFAULT_INPUT)).map(
      (l) => l.cls,
    );
    expect(bubble).toEqual(["bar-compare", "bar-swap", "bar-sorted"]);
    const quick = legendFor(quickSort, run(quickSort, DEFAULT_INPUT)).map(
      (l) => l.cls,
    );
    expect(quick).toEqual(expect.arrayContaining(["bar-pivot", "bar-bound"]));
    expect(quick).not.toContain("bar-min");
  });

  it("popisky podle algoritmu: u Heapsortu je „min“ větší syn, u Selectsortu zatím nejmenší", () => {
    const label = (algo: SortAlgorithm, cls: string) =>
      legendFor(algo, run(algo, DEFAULT_INPUT)).find((l) => l.cls === cls)
        ?.label;
    expect(label(heapSort, "bar-min")).toBe("větší syn s");
    expect(label(selectSort, "bar-min")).toBe("zatím nejmenší P[m]");
    expect(label(insertSort, "bar-swap")).toBe("posunutý doprava");
  });

  it("odmítnutý vstup nemá v legendě nic", () => {
    expect(
      legendFor(countingSort, materialize(countingSort.run(DEFAULT_INPUT))),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ logika stránky */

describe("stránka třídění – vstup, adresa, titulky", () => {
  it("každý algoritmus má krátký název, námět a pojmenované přesuny", () => {
    for (const algo of SORTING) {
      expect(algo.name).toMatch(/^[A-Z][A-Za-z]+$/);
      expect(algo.tip.length).toBeGreaterThan(20);
      expect(algo.moves.forms).toHaveLength(3);
    }
  });

  it("inputFromUrl: platná čísla v rozsahu algoritmu, jinak null", () => {
    expect(inputFromUrl("38,27,43", quickSort)).toEqual([38, 27, 43]);
    expect(inputFromUrl("38, x, 7.5, 200, 5", quickSort)).toEqual([38, 5]);
    expect(inputFromUrl(null, quickSort)).toBeNull();
    expect(inputFromUrl("  ", quickSort)).toBeNull();
    expect(inputFromUrl("abc", quickSort)).toBeNull();
    // Counting sort přijme jen 1 … 9
    expect(inputFromUrl("12,3,0,9", countingSort)).toEqual([3, 9]);
    expect(inputFromUrl("40,50", countingSort)).toBeNull();
    // nejvýš MAX_INPUT_N prvků
    expect(
      inputFromUrl(Array.from({ length: 80 }, () => 5).join(","), quickSort),
    ).toHaveLength(MAX_INPUT_N);
  });

  it("inputToUrl: výchozí příklad adresu nezatěžuje, jinak čísla oddělená čárkou", () => {
    expect(inputToUrl(DEFAULT_INPUT, quickSort)).toBeNull();
    expect(inputToUrl(DEFAULT_SMALL_INPUT, countingSort)).toBeNull();
    expect(inputToUrl([3, 1, 2], quickSort)).toBe("3,1,2");
    expect(inputFromUrl(inputToUrl([3, 1, 2], quickSort), quickSort)).toEqual([
      3, 1, 2,
    ]);
  });

  it("inputLimits: stejné meze jako NumberInput (Counting sort max = inputMax)", () => {
    expect(inputLimits(quickSort)).toEqual({
      min: 1,
      max: 99,
      maxCount: MAX_INPUT_N,
    });
    expect(inputLimits(countingSort).max).toBe(countingSort.inputMax);
  });

  it("opTitleFor: název algoritmu s argumentem, dlouhý vstup zkrácený", () => {
    expect(opTitleFor(quickSort, [3, 1, 2])).toBe("Quicksort(3, 1, 2)");
    expect(opTitleFor(bubbleSort, DEFAULT_INPUT)).toBe(
      "Bubblesort(38, 27, 43, 3, 9, 82, 10, 55, …) · n = 12",
    );
    expect(opTitleFor(countingSort, DEFAULT_SMALL_INPUT)).toBe(
      "CountingSort(3, 1, 4, 1, 5, 9, 2, 6, 5)",
    );
  });

  it("scaleMin: nejvýš 0, záporné hodnoty posunou osu", () => {
    expect(scaleMin([3, 1])).toBe(0);
    expect(scaleMin([3, -4, null, NaN])).toBe(-4);
  });

  it("plainMath: jednoznakové dolní indexy na Unicode, delší nechá", () => {
    expect(plainMath("počítadla p_1 … p_r")).toBe("počítadla p₁ … pᵣ");
    expect(plainMath("prvek x_i")).toBe("prvek xᵢ");
    expect(plainMath("x_ij")).toBe("x_ij");
    expect(plainMath("bez indexu")).toBe("bez indexu");
  });
});

/* ------------------------------------------------------------------ vykreslená stránka */

function render(url: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [url] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/sort/:id",
          element: createElement(SortingPage),
        }),
      ),
    ),
  );
}

describe("SortingPage (vykreslení na server)", () => {
  it("vstup z odkazu, titulek operace, námět, počítadla a legenda jen se skutečnými značkami", () => {
    const html = render("/sort/quick?a=5,3,1");
    expect(html).toContain("Quicksort(5, 3, 1)");
    expect(html).toContain("Zkuste:");
    expect(html).toContain("porovnání");
    expect(html).toContain("Kopírovat odkaz");
    expect(html).toContain("swatch bar-pivot");
    expect(html).not.toContain("swatch bar-min");
    // vstup se zadává v nabídce operací (Vytvořit, P[i] ← x, Quicksort(P)), staré pole „Použít“ zmizelo
    expect(html).toContain('data-am-id="create"');
    expect(html).toContain("P[i] ← x");
    expect(html).toContain("Quicksort(P)");
    expect(html).not.toContain("Použít");
    // sloupce jdou vybrat (klik vyplní P[i] ← x)
    expect(html).toContain('aria-label="Prvek 1: 5 – vybrat"');
  });

  it("výchozí stav: výchozí příklad, nabídka se jménem algoritmu, tip míří do nabídky", () => {
    const html = render("/sort/bubble");
    expect(html).toContain("Bubblesort(38, 27, 43");
    expect(html).toContain("Bubblesort(P)");
    expect(html).toContain("„Vytvořit ▸ Setříděné“");
    expect(html).not.toContain("swatch bar-pivot");
  });

  it("Counting sort: vlastní vstup a popisek počítadel s indexy", () => {
    const html = render("/sort/counting");
    expect(html).toContain("CountingSort(3, 1, 4, 1, 5, 9, 2, 6, 5)");
    expect(html).toContain("Counting sort má vlastní vstup");
  });
});

describe("SortingPage – rozložení na jednu obrazovku", () => {
  it("poznámka o sdíleném vstupu je ve sbalené nápovědě, ne v doku s akcemi", () => {
    const html = render("/sort/quick");
    const more = html.indexOf('<details class="viz-more"');
    const note = html.indexOf("Vstup zůstává stejný");
    expect(more).toBeGreaterThan(0);
    expect(note).toBeGreaterThan(more);
    const actions = html.slice(
      html.indexOf('class="viz-actions"'),
      html.indexOf('class="viz-status"'),
    );
    expect(actions).not.toContain("Vstup zůstává stejný");
  });
});
