// „Naposledy otevřené“ moduly v localStorage (nový klíč algo-recent, JSON pole cest): čtení, zápis, poškozená data.
import { describe, expect, it } from "vitest";
import {
  RECENT_KEY,
  RECENT_MAX,
  parseRecent,
  pushRecent,
  readRecent,
  rememberModule,
} from "./recent";

/** Úložiště jako localStorage (jen to, co recent.ts používá). */
function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

/** Úložiště, které při každém přístupu vyhodí výjimku (zakázané cookies, Safari v soukromém okně). */
const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("recent – klíč a formát", () => {
  it("nový klíč algo-recent, nejvýš 4 moduly", () => {
    expect(RECENT_KEY).toBe("algo-recent");
    expect(RECENT_MAX).toBe(4);
  });

  it("parseRecent: platné JSON pole cest známých modulů, bez duplicit, nejvýš 4", () => {
    expect(parseRecent('["/sort/quick","/graph/dfs"]')).toEqual([
      "/sort/quick",
      "/graph/dfs",
    ]);
    expect(
      parseRecent(
        JSON.stringify([
          "/sort/quick",
          "/sort/quick",
          "/tree/avl",
          "/ds/heap",
          "/hash/bloom",
          "/graph/bfs",
        ]),
      ),
    ).toEqual(["/sort/quick", "/tree/avl", "/ds/heap", "/hash/bloom"]);
  });

  it("parseRecent: poškozená nebo cizí data → prázdný seznam (nespadne)", () => {
    for (const raw of [
      null,
      "",
      "{",
      "nejson",
      "42",
      "null",
      '{"a":1}',
      '"/sort/quick"',
      "[1,2,3]",
    ])
      expect(parseRecent(raw), String(raw)).toEqual([]);
  });

  it("parseRecent: neznámé cesty (smazaný modul, /, cizí hodnoty) vynechá", () => {
    expect(
      parseRecent('["/sort/foo","/","/sort/quick",null,7,"/tree/__proto__"]'),
    ).toEqual(["/sort/quick"]);
  });

  it("pushRecent: nejnovější na začátek, bez duplicit, nejvýš 4", () => {
    expect(pushRecent([], "/sort/quick")).toEqual(["/sort/quick"]);
    expect(pushRecent(["/a", "/sort/quick", "/b"], "/sort/quick")).toEqual([
      "/sort/quick",
      "/a",
      "/b",
    ]);
    expect(pushRecent(["/1", "/2", "/3", "/4"], "/5")).toEqual([
      "/5",
      "/1",
      "/2",
      "/3",
    ]);
  });
});

describe("recent – úložiště", () => {
  it("rememberModule zapíše JSON pole a readRecent ho přečte", () => {
    const s = memoryStorage();
    rememberModule("/sort/quick", s);
    rememberModule("/graph/dfs", s);
    rememberModule("/sort/quick", s);
    expect(JSON.parse(s.data.get(RECENT_KEY)!)).toEqual([
      "/sort/quick",
      "/graph/dfs",
    ]);
    expect(readRecent(s)).toEqual(["/sort/quick", "/graph/dfs"]);
  });

  it("rememberModule: neznámou cestu (přehled, překlep) nezapíše", () => {
    const s = memoryStorage();
    rememberModule("/", s);
    rememberModule("/sort/foo", s);
    expect(s.data.has(RECENT_KEY)).toBe(false);
  });

  it("rememberModule: koncové lomítko = stejný modul", () => {
    const s = memoryStorage();
    rememberModule("/sort/quick/", s);
    expect(readRecent(s)).toEqual(["/sort/quick"]);
  });

  it("poškozený JSON v úložišti: čtení vrátí [] a další zápis ho přepíše platným polem", () => {
    const s = memoryStorage({ [RECENT_KEY]: "[[[nejson" });
    expect(readRecent(s)).toEqual([]);
    rememberModule("/tree/bst", s);
    expect(readRecent(s)).toEqual(["/tree/bst"]);
  });

  it("úložiště, které vyhazuje výjimky, ani chybějící úložiště nic neshodí", () => {
    expect(readRecent(throwing)).toEqual([]);
    expect(() => rememberModule("/sort/quick", throwing)).not.toThrow();
    expect(readRecent(null)).toEqual([]);
    expect(() => rememberModule("/sort/quick", null)).not.toThrow();
  });

  it("ostatní klíče (algo-theme, algo-speed) se nemění", () => {
    const s = memoryStorage({ "algo-theme": "dark", "algo-speed": "400" });
    rememberModule("/sort/quick", s);
    expect(s.data.get("algo-theme")).toBe("dark");
    expect(s.data.get("algo-speed")).toBe("400");
    expect([...s.data.keys()].sort()).toEqual([
      "algo-recent",
      "algo-speed",
      "algo-theme",
    ]);
  });
});
