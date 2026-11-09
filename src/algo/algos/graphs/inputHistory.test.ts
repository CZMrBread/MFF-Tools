// Historie vstupu stránek bez useStructure (grafy, Aho-Corasicková, hradla): „↶ Vrátit operaci“.
import { describe, expect, it } from "vitest";
import {
  INPUT_HISTORY_LIMIT,
  inputHistoryControl,
  MOVE_GROUP_MS,
  popInput,
  pushInput,
  pushInputGrouped,
} from "./inputHistory";

describe("historie vstupu", () => {
  it("push uloží název a stav před operací, pop vrátí poslední", () => {
    let h = pushInput<number>([], "Náhodně", 1);
    h = pushInput(h, "Délky hran", 2);
    expect(h.map((e) => e.title)).toEqual(["Náhodně", "Délky hran"]);
    const r = popInput(h);
    expect(r?.before).toBe(2);
    expect(r?.rest.map((e) => e.title)).toEqual(["Náhodně"]);
    expect(popInput([])).toBeNull();
  });

  it("drží nejvýše INPUT_HISTORY_LIMIT položek (nejstarší zahodí)", () => {
    let h: ReturnType<typeof pushInput<number>> = [];
    for (let i = 0; i < INPUT_HISTORY_LIMIT + 5; i++)
      h = pushInput(h, `op ${i}`, i);
    expect(h).toHaveLength(INPUT_HISTORY_LIMIT);
    expect(h[0].before).toBe(5);
  });

  it("tvar pro Visualizer: history, canUndo, undo", () => {
    let undone = 0;
    const c = inputHistoryControl(
      pushInput<number>([], "A", 0),
      () => undone++,
    );
    expect(c.history).toEqual(["A"]);
    expect(c.canUndo).toBe(true);
    c.undo();
    expect(undone).toBe(1);
    expect(inputHistoryControl([], () => {}).canUndo).toBe(false);
  });
});

describe("historie vstupu – přesuny vrcholů (V-4)", () => {
  it("celý tah (stejná skupina gesta) je jedna položka se stavem před prvním pohybem", () => {
    let h = pushInput<number>([], "Náhodně", 0);
    h = pushInputGrouped(h, "Přesun vrcholu a", 1, "g7", 1000, Infinity);
    h = pushInputGrouped(h, "Přesun vrcholu a", 2, "g7", 9000, Infinity);
    h = pushInputGrouped(h, "Přesun vrcholu a", 3, "g7", 99000, Infinity);
    expect(h.map((e) => e.title)).toEqual(["Náhodně", "Přesun vrcholu a"]);
    expect(h[1].before).toBe(1);
    // další tah = další položka
    h = pushInputGrouped(h, "Přesun vrcholu a", 4, "g8", 99100, Infinity);
    expect(h).toHaveLength(3);
  });
  it("Shift+šipky: stisky téhož vrcholu krátce po sobě jsou jedna položka, po pauze nebo jiném vrcholu nová", () => {
    let h = pushInputGrouped<number>([], "Přesun vrcholu b", 1, "k1", 0);
    h = pushInputGrouped(h, "Přesun vrcholu b", 2, "k1", 300);
    h = pushInputGrouped(
      h,
      "Přesun vrcholu b",
      3,
      "k1",
      300 + MOVE_GROUP_MS - 1,
    );
    expect(h).toHaveLength(1);
    h = pushInputGrouped(
      h,
      "Přesun vrcholu b",
      4,
      "k1",
      400 + 2 * MOVE_GROUP_MS,
    );
    expect(h).toHaveLength(2);
    h = pushInputGrouped(
      h,
      "Přesun vrcholu c",
      5,
      "k2",
      401 + 2 * MOVE_GROUP_MS,
    );
    expect(h).toHaveLength(3);
    // jiná operace mezi přesuny přeruší skupinu
    h = pushInput(h, "Kapacity hran", 6);
    h = pushInputGrouped(
      h,
      "Přesun vrcholu c",
      7,
      "k2",
      402 + 2 * MOVE_GROUP_MS,
    );
    expect(h.map((e) => e.title).slice(-2)).toEqual([
      "Kapacity hran",
      "Přesun vrcholu c",
    ]);
  });
});
