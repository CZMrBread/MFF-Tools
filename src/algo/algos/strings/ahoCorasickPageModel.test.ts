// Model stránky Aho–Corasickové bez Reactu: výchozí příklad, odkaz, přechody běhů a nabídka operací.
import { describe, expect, it } from "vitest";
import {
  initialMenu,
  menuReducer,
  prepareGo,
  type ActionDef,
} from "../../core/actionModel";
import {
  acBuild,
  acSearch,
  MAX_AC_HAYSTACK,
  MAX_WORDS,
  naiveFindAll,
} from "./ahoCorasick";
import {
  acActions,
  acCaption,
  acKmpLink,
  acReducer,
  acUrl,
  initialAc,
  randomAc,
  type AcCtx,
} from "./ahoCorasickPageModel";

const noop = () => {};
const ctx = (over: Partial<AcCtx> = {}): AcCtx => ({
  words: ["ara", "bar", "arab", "baraba", "barbara"],
  text: "barbara",
  wordsText: () => "ara, bar, arab, baraba, barbara",
  build: noop,
  search: noop,
  read: noop,
  add: noop,
  remove: noop,
  load: noop,
  random: noop,
  now: () => 1,
  ...over,
});
const labels = (defs: ActionDef[]) => defs.map((d) => d.label);

describe("výchozí stav a odkaz", () => {
  it("bez parametrů: obr. 13.2 se senem barbara – stavba i hledání v jedné sadě kroků", () => {
    const r = initialAc({});
    expect(r.words).toEqual(["ara", "bar", "arab", "baraba", "barbara"]);
    expect([r.text, r.mode, r.example]).toEqual(["barbara", "all", "fig132"]);
    expect(acCaption(r)).toContain("Obr. 13.2 (str. 326)");
  });

  it("?j=a,b&s=… předvyplní slovník a seno; knižní dvojici pozná", () => {
    const r = initialAc({ j: "ara,bar,arab,baraba,barbara", s: "bara" });
    expect(r.example).toBe("bara");
    const own = initialAc({ j: "he, she,his,hers,she", s: "ushers" });
    expect(own.words).toEqual(["he", "she", "his", "hers"]);
    expect([own.text, own.example]).toEqual(["ushers", null]);
    expect(own.note.text).toMatch(/Duplicitní/u);
  });

  it("acUrl zapíše j (čárky) a s", () => {
    expect(acUrl(initialAc({}))).toEqual({
      j: "ara,bar,arab,baraba,barbara",
      s: "barbara",
    });
  });

  it("odkaz do KMP jen s jedinou jehlou (stejný automat)", () => {
    expect(acKmpLink(initialAc({}))).toBeNull();
    expect(acKmpLink(initialAc({ j: "barbarossa", s: "barbarbarossa" }))).toBe(
      "/string/kmp?j=barbarossa&s=barbarbarossa",
    );
  });
});

describe("acReducer", () => {
  const r0 = initialAc({});

  it("Postavit automat: jen konstrukce, nové runId, slovník z pole", () => {
    const r = acReducer(r0, { type: "build", words: "he she his hers" });
    expect(r.words).toEqual(["he", "she", "his", "hers"]);
    expect([r.mode, r.runId, r.example]).toEqual(["build", 1, null]);
  });

  it("Hledat se změněným slovníkem postaví automat bez kroků a napíše poznámku", () => {
    const r = acReducer(r0, {
      type: "search",
      words: "he, she",
      text: "ushers",
    });
    expect([r.mode, r.text]).toEqual(["search", "ushers"]);
    expect(r.note.text).toMatch(/postaven/u);
    const same = acReducer(r0, {
      type: "search",
      words: "ara bar arab baraba barbara",
      text: "bara",
    });
    expect(same.note.text).toBe("");
  });

  it("prázdný slovník i prázdné seno jsou chyba a nic nespustí", () => {
    const bad = acReducer(r0, { type: "build", words: " , " });
    expect(bad.runId).toBe(r0.runId);
    expect(bad.note.error).toBe(true);
    const empty = acReducer(r0, { type: "search", words: "ara", text: " " });
    expect(empty.note.error).toBe(true);
    expect(empty.runId).toBe(r0.runId);
  });

  it("Přečti znak(x): připojí znak k senu a krokuje jen ten jeden AcKrok", () => {
    const r = acReducer(r0, { type: "read", x: "b" });
    expect([r.text, r.mode, r.from]).toEqual(["barbarab", "search", 7]);
    const full = acReducer(
      acReducer(r0, {
        type: "search",
        words: "a",
        text: "a".repeat(MAX_AC_HAYSTACK),
      }),
      { type: "read", x: "a" },
    );
    expect(full.note.error).toBe(true);
  });

  it("Přidat a Odebrat slovo postaví nový automat a hledá ve stejném seně", () => {
    const add = acReducer(r0, { type: "add", word: "rab" });
    expect(add.words).toEqual([
      "ara",
      "bar",
      "arab",
      "baraba",
      "barbara",
      "rab",
    ]);
    expect([add.mode, add.text, add.example]).toEqual(["all", "barbara", null]);
    const rm = acReducer(add, { type: "remove", word: "bar" });
    expect(rm.words).toEqual(["ara", "arab", "baraba", "barbara", "rab"]);
    expect(acReducer(r0, { type: "add", word: "ara" }).note.error).toBe(true);
    expect(acReducer(r0, { type: "remove", word: "xyz" }).note.error).toBe(
      true,
    );
    const one = initialAc({ j: "ara", s: "bara" });
    expect(acReducer(one, { type: "remove", word: "ara" }).note.error).toBe(
      true,
    );
    let full = initialAc({ j: "a,b,c,d,e,f,g,h", s: "abc" });
    expect(full.words).toHaveLength(MAX_WORDS);
    full = acReducer(full, { type: "add", word: "i" });
    expect(full.note.error).toBe(true);
  });

  it("load (příklad) spustí stavbu i hledání a pamatuje si příklad", () => {
    const r = acReducer(r0, {
      type: "load",
      words: ["a", "aa", "aaa"],
      text: "aaaa",
      example: "aaa",
    });
    expect([r.mode, r.example, r.runId]).toEqual(["all", "aaa", 1]);
    expect(acCaption(r)).toContain("cvičení 2, str. 329");
  });
});

describe("nabídka operací", () => {
  it("Vytvořit, Příklady z knihy, Postavit automat, Hledat, Přečti znak, Přidat a Odebrat slovo", () => {
    expect(labels(acActions(ctx()))).toEqual([
      "Vytvořit",
      "Příklady z knihy",
      "Postavit automat(slovník)",
      "Hledat(S)",
      "Přečti znak(x)",
      "Přidat slovo(ι)",
      "Odebrat slovo(ι)",
    ]);
  });

  it("Příklady z knihy: 8 variant, titulky se stranou", () => {
    const book = acActions(ctx()).find((d) => d.id === "book")!;
    expect(book.variants!).toHaveLength(8);
    expect(book.variants![0].title).toContain("Obr. 13.2");
    for (const v of book.variants!) expect(v.title).toMatch(/str\. \d+/u);
  });

  it("Hledat(S) převezme text pole slovníku; Enter s výchozími argumenty jde", () => {
    const calls: [string, string][] = [];
    const defs = acActions(
      ctx({ wordsText: () => "he, she", search: (w, s) => calls.push([w, s]) }),
    );
    const search = defs.find((d) => d.id === "search")!;
    const go = prepareGo(search, initialMenu(defs));
    expect(go.ok).toBe(true);
    if (go.ok) search.run(go.values, go.variant);
    expect(calls).toEqual([["he, she", "barbara"]]);
  });

  it("Přečti znak(x) bere přesně jeden znak; Přidat slovo bez mezer", () => {
    const defs = acActions(ctx());
    const read = defs.find((d) => d.id === "read")!;
    let st = initialMenu(defs);
    st = menuReducer(st, { type: "text", name: "x", text: "ab" });
    expect(prepareGo(read, st).ok).toBe(false);
    st = menuReducer(st, { type: "text", name: "x", text: "u" });
    expect(prepareGo(read, st).ok).toBe(true);
    const add = defs.find((d) => d.id === "add")!;
    st = menuReducer(st, { type: "text", name: "word", text: "a b" });
    expect(prepareGo(add, st).ok).toBe(false);
  });

  it("Náhodně: 3–5 jehel délky 2–4 nad {a, b}, seno 20 znaků s aspoň jedním výskytem", () => {
    for (let seed = 1; seed < 60; seed++) {
      const { words, text } = randomAc(seed);
      expect(words.length).toBeGreaterThanOrEqual(3);
      expect(words.length).toBeLessThanOrEqual(5);
      for (const w of words) expect(w).toMatch(/^[ab]{2,4}$/u);
      expect(new Set(words).size).toBe(words.length);
      expect(text).toMatch(/^[ab]{20}$/u);
      const want = naiveFindAll(words, text);
      expect(want.length).toBeGreaterThan(0);
      expect(acSearch(acBuild(words), text).out).toHaveLength(want.length);
    }
  });
});

describe("jednotné akce (CROSS-04)", () => {
  it("Vytvořit první, Příklady z knihy hned za ním; Výchozí příklad není varianta ani akce (je pod akcemi)", () => {
    const defs = acActions(ctx());
    expect(defs[0].id).toBe("create");
    expect(defs[1].label).toBe("Příklady z knihy");
    const all = defs.flatMap((d) => [
      d.label,
      ...(d.variants ?? []).map((v) => v.label),
    ]);
    expect(all).not.toContain("Výchozí příklad");
  });
});
