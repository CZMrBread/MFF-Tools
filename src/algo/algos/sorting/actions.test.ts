/**
 * Nabídka operací stránky třídění (Vytvořit ▸ Vlastní / Náhodně / …, P[i] ← x, Quicksort(P)) – čisté
 * definice akcí a pomocné funkce bez Reactu.
 */
import { describe, expect, it } from "vitest";
import { prepareGo, initialMenu, type ActionDef } from "../../core/actionModel";
import { countingSort } from "./heapcount";
import { quickSort } from "./quick";
import { SORTING } from "./algorithms";
import { DEFAULT_INPUT, MAX_INPUT_N } from "./input";
import {
  CREATE_VARIANTS,
  generatorLength,
  inputPosition,
  setValueAt,
  sortingActions,
} from "./actions";
import type { SortAlgorithm } from "./types";

type Applied = { values: number[]; restart: boolean; title?: string };

function setup(algo: SortAlgorithm, values: number[]) {
  const applied: Applied[] = [];
  const defs = sortingActions(algo, values, {
    apply: (v, restart, title) =>
      applied.push(
        title === undefined
          ? { values: v, restart }
          : { values: v, restart, title },
      ),
    seed: () => 42,
  });
  const byId = (id: string) => defs.find((d) => d.id === id) as ActionDef;
  return { defs, byId, applied };
}

describe("sortingActions – akce stránky třídění", () => {
  it("Vytvořit, P[i] ← x a název algoritmu s argumentem P jako v pseudokódu", () => {
    const { defs } = setup(quickSort, DEFAULT_INPUT);
    expect(defs.map((d) => d.id)).toEqual(["create", "set", "sort"]);
    expect(defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "P[i] ← x",
      "Quicksort(P)",
    ]);
  });

  it("Vytvořit: první (výchozí) varianta je Vlastní s polem P = aktuální vstup v mezích algoritmu", () => {
    const { byId } = setup(quickSort, [5, 3, 9]);
    const create = byId("create");
    expect(create.variants?.map((v) => v.id)).toEqual(CREATE_VARIANTS);
    expect(CREATE_VARIANTS[0]).toBe("custom");
    const p = create.variants?.[0].args?.[0];
    expect(p).toMatchObject({
      kind: "list",
      name: "P",
      label: "P =",
      min: 1,
      max: 99,
      maxCount: MAX_INPUT_N,
      default: [5, 3, 9],
    });
    // šířku pole určuje nabídka (vejde se vedle Provést i v úzkém sloupci)
    expect(p?.width).toBeUndefined();
    // Counting sort přijme jen 1 … inputMax
    const c = setup(countingSort, [3, 1]).byId("create").variants?.[0]
      .args?.[0];
    expect(c).toMatchObject({ max: countingSort.inputMax });
  });

  it("Vytvořit ▸ Vlastní: zadaný seznam se použije jako nový běh", () => {
    const { byId, applied } = setup(quickSort, DEFAULT_INPUT);
    byId("create").run({ P: [5, 3, 1] }, "custom");
    expect(applied).toMatchObject([{ values: [5, 3, 1], restart: true }]);
  });

  it("generátory bez argumentu: stejná délka jako aktuální vstup, hodnoty v rozsahu, nový běh", () => {
    const { byId, applied } = setup(quickSort, [9, 8, 7, 6, 5, 4, 3, 2]);
    const create = byId("create");
    for (const id of ["random", "sorted", "reversed", "nearly", "dupes"]) {
      const v = create.variants?.find((x) => x.id === id);
      expect(v?.args ?? [], id).toEqual([]);
      create.run({}, id);
    }
    expect(applied.every((a) => a.restart)).toBe(true);
    expect(applied.every((a) => a.values.length === 8)).toBe(true);
    for (const a of applied)
      expect(a.values.every((x) => x >= 1 && x <= 99)).toBe(true);
    const [, sorted, reversed] = applied.map((a) => a.values);
    expect(sorted).toEqual([...sorted].sort((x, y) => x - y));
    expect(reversed).toEqual([...sorted].reverse());
  });

  it("Náhodně n prvků: argument n (1 … MAX_INPUT_N, výchozí = délka vstupu)", () => {
    const { byId, applied } = setup(countingSort, [3, 1, 4]);
    const v = byId("create").variants?.find((x) => x.id === "randomN");
    expect(v?.args?.[0]).toMatchObject({
      kind: "int",
      name: "n",
      min: 1,
      max: MAX_INPUT_N,
      default: 3,
    });
    byId("create").run({ n: 20 }, "randomN");
    expect(applied[0].values).toHaveLength(20);
    expect(applied[0].values.every((x) => x >= 1 && x <= 9)).toBe(true);
  });

  it("Vytvořit nemá variantu Výchozí příklad (je jednou v řádku pod akcemi, CROSS-04); každé použití má název do historie", () => {
    const { byId, applied } = setup(countingSort, [1, 2]);
    expect(byId("create").variants?.map((x) => x.id)).not.toContain("default");
    expect(byId("create").variants?.map((x) => x.label)).not.toContain(
      "Výchozí příklad",
    );
    byId("create").run({ P: [3, 1, 2] }, "custom");
    byId("set").run({ x: 5, i: 1 }, null);
    byId("sort").run({}, null);
    expect(applied.map((a) => a.title)).toEqual([
      "Vytvořit(3, 1, 2)",
      "P[1] ← 5",
      "CountingSort(P)",
    ]);
  });

  it("P[i] ← x: x první (vyplní ho klik na sloupec), i od 1 do n; přepíše prvek (nový běh)", () => {
    const { byId, applied } = setup(quickSort, [5, 3, 9]);
    const set = byId("set");
    expect(set.args?.map((a) => a.name)).toEqual(["x", "i"]);
    expect(set.args?.[0]).toMatchObject({ kind: "int", min: 1, max: 99 });
    expect(set.args?.[1]).toMatchObject({ kind: "int", min: 1, max: 3 });
    set.run({ x: 50, i: 2 }, null);
    expect(applied).toMatchObject([{ values: [5, 50, 9], restart: true }]);
    // i mimo rozsah pole menu nepustí
    const st = {
      ...initialMenu([set]),
      texts: { x: "50", i: "4" },
    };
    expect(prepareGo(set, st).ok).toBe(false);
  });

  it("Quicksort(P): stejný vstup znovu od začátku (nové pole → nové kroky)", () => {
    const values = [5, 3, 9];
    const { byId, applied } = setup(quickSort, values);
    expect(byId("sort").args ?? []).toEqual([]);
    byId("sort").run({}, null);
    expect(applied[0]).toMatchObject({ values: [5, 3, 9], restart: true });
    expect(applied[0].values).not.toBe(values);
  });
});

describe("pomocné funkce", () => {
  it("generatorLength: délka vstupu, u jednoho prvku 12", () => {
    expect(generatorLength([1, 2, 3])).toBe(3);
    expect(generatorLength([7])).toBe(12);
    expect(generatorLength([])).toBe(12);
  });

  it("setValueAt: 1-based, nové pole, mimo rozsah beze změny", () => {
    const a = [1, 2, 3];
    expect(setValueAt(a, 1, 9)).toEqual([9, 2, 3]);
    expect(setValueAt(a, 3, 9)).toEqual([1, 2, 9]);
    expect(setValueAt(a, 0, 9)).toBe(a);
    expect(setValueAt(a, 4, 9)).toBe(a);
    expect(a).toEqual([1, 2, 3]);
  });

  it("inputPosition: klik na sloupec uprostřed třídění míří na pozici prvku ve vstupu (podle identity)", () => {
    const values = [38, 27, 43];
    // po prohození: na indexu 0 leží prvek, který byl ve vstupu třetí
    const items = [
      { id: 2, v: 43 },
      { id: 1, v: 27 },
      { id: 0, v: 38 },
    ];
    expect(inputPosition(items, 0, values)).toBe(3);
    expect(inputPosition(items, 2, values)).toBe(1);
    // identita nesedí s hodnotou (jiný stav) → pozice na plátně
    expect(inputPosition([{ id: 7, v: 5 }], 0, [1])).toBe(1);
  });
});

describe("námět „Zkuste“ odkazuje na skutečné položky nabídky", () => {
  it("každá uvozovka v tipu je „Vytvořit ▸ <varianta>“ nebo název akce", () => {
    for (const algo of SORTING) {
      const { defs } = setup(algo, DEFAULT_INPUT);
      const create = defs.find((d) => d.id === "create");
      const names = [
        ...(create?.variants ?? []).map((v) => `Vytvořit ▸ ${v.label}`),
        ...defs.map((d) => d.label),
      ];
      const quoted = [...algo.tip.matchAll(/„([^“]+)“/g)].map((m) => m[1]);
      expect(quoted.length, algo.id).toBeGreaterThan(0);
      for (const q of quoted) expect(names, `${algo.id}: „${q}“`).toContain(q);
    }
  });
});
