// Model stránky KMP bez Reactu: výchozí příklad, odkaz, přechody běhů a nabídka operací.
import { describe, expect, it } from "vitest";
import {
  prepareGo,
  initialMenu,
  menuReducer,
  validateArg,
  type ActionDef,
} from "../../core/actionModel";
import { MAX_HAYSTACK } from "./kmp";
import {
  initialKmp,
  kmpActions,
  kmpTip,
  kmpCaption,
  kmpReducer,
  kmpUrl,
  randomKmp,
  type KmpCtx,
} from "./kmpPageModel";
import { kmpRun, naiveFind } from "./kmp";

const noop = () => {};
const ctx = (over: Partial<KmpCtx> = {}): KmpCtx => ({
  needle: "kokos",
  text: "clanekokokosu",
  needleText: () => "kokos",
  build: noop,
  search: noop,
  read: noop,
  load: noop,
  random: noop,
  now: () => 1,
  ...over,
});
const labels = (defs: ActionDef[]) => defs.map((d) => d.label);

describe("výchozí stav a odkaz", () => {
  it("bez parametrů: příklad z knihy kokos / clanekokokosu – stavba i hledání v jedné sadě kroků", () => {
    const r = initialKmp({});
    expect([r.needle, r.text, r.mode, r.example]).toEqual([
      "kokos",
      "clanekokokosu",
      "all",
      "kokos",
    ]);
    expect(kmpCaption(r)).toBe(
      "KMP: ι = „kokos“, σ = „clanekokokosu“ – str. 320–321",
    );
  });

  it("?j=…&s=… předvyplní jehlu a seno; knižní dvojici pozná (obr. 13.1)", () => {
    const r = initialKmp({ j: "barbarossa", s: "barbarbarossa" });
    expect(r.example).toBe("barbarossa");
    expect(kmpCaption(r)).toContain("Obr. 13.1 (str. 321)");
    const own = initialKmp({ j: "ab ra", s: "abrakadabra" });
    expect([own.needle, own.text, own.example]).toEqual([
      "abra",
      "abrakadabra",
      null,
    ]);
    expect(own.note.text).toContain("Mezery");
  });

  it("kmpUrl zapíše j a s", () => {
    expect(kmpUrl(initialKmp({}))).toEqual({ j: "kokos", s: "clanekokokosu" });
  });
});

describe("kmpReducer", () => {
  const r0 = initialKmp({});

  it("Postavit automat: jen konstrukce, nové runId, není to příklad z knihy", () => {
    const r = kmpReducer(r0, { type: "build", needle: "abab" });
    expect([r.needle, r.mode, r.runId, r.example]).toEqual([
      "abab",
      "build",
      1,
      null,
    ]);
  });

  it("Hledat se změněnou jehlou postaví automat bez kroků a napíše poznámku", () => {
    const r = kmpReducer(r0, {
      type: "search",
      needle: "ana",
      text: "bananas",
    });
    expect([r.mode, r.needle, r.text]).toEqual(["search", "ana", "bananas"]);
    expect(r.note.text).toMatch(/postaven/);
    const same = kmpReducer(r0, {
      type: "search",
      needle: "kokos",
      text: "kokoskokos",
    });
    expect(same.note.text).toBe("");
  });

  it("prázdná jehla je chyba a nic nespustí; dlouhé seno se zkrátí – poznámku hlásí formulář (notice)", () => {
    const bad = kmpReducer(r0, { type: "build", needle: "  " });
    expect(bad.runId).toBe(r0.runId);
    expect(bad.note.error).toBe(true);
    const long = kmpReducer(r0, {
      type: "search",
      needle: "a",
      text: "a".repeat(MAX_HAYSTACK + 5),
    });
    expect(long.text).toHaveLength(MAX_HAYSTACK);
    expect(long.note.text).not.toContain(String(MAX_HAYSTACK));
    const search = kmpActions(ctx()).find((d) => d.id === "search")!;
    const sigma = search.args!.find((a) => a.name === "text")!;
    expect(validateArg(sigma, "a".repeat(MAX_HAYSTACK + 5)).note).toContain(
      String(MAX_HAYSTACK),
    );
  });

  it("Přečti znak(x): připojí znak k senu a krokuje jen ten jeden KmpKrok", () => {
    const r = kmpReducer(
      kmpReducer(r0, { type: "search", needle: "kokos", text: "clanekokokos" }),
      {
        type: "read",
        x: "u",
      },
    );
    expect([r.text, r.mode, r.from]).toEqual(["clanekokokosu", "search", 12]);
    const full = kmpReducer(
      kmpReducer(r0, {
        type: "search",
        needle: "a",
        text: "a".repeat(MAX_HAYSTACK),
      }),
      { type: "read", x: "a" },
    );
    expect(full.note.error).toBe(true);
  });

  it("load (příklad, náhodně) spustí stavbu i hledání a pamatuje si příklad", () => {
    const r = kmpReducer(r0, {
      type: "load",
      needle: "ana",
      text: "anna",
      example: "anna",
    });
    expect([r.mode, r.example, r.runId]).toEqual(["all", "anna", 1]);
    expect(kmpCaption(r)).toContain("str. 319");
  });
});

describe("nabídka operací", () => {
  it("Vytvořit, Příklady z knihy, Postavit automat(ι), Hledat(σ), Přečti znak(x)", () => {
    expect(labels(kmpActions(ctx()))).toEqual([
      "Vytvořit",
      "Příklady z knihy",
      "Postavit automat(ι)",
      "Hledat(σ)",
      "Přečti znak(x)",
    ]);
  });

  it("Příklady z knihy: 6 variant v pořadí knihy, titulky se stranou", () => {
    const book = kmpActions(ctx()).find((d) => d.id === "book")!;
    expect(book.variants!.map((v) => v.id)).toEqual([
      "kokos",
      "barbarossa",
      "bananas",
      "anna",
      "aaab",
      "aaaa",
    ]);
    expect(book.variants![1].title).toContain("Obr. 13.1");
    for (const v of book.variants!) expect(v.title).toMatch(/str\. \d+/);
  });

  it("Hledat(σ) převezme text pole jehly; Enter/Provést s výchozími argumenty jde", () => {
    const calls: [string, string][] = [];
    const defs = kmpActions(
      ctx({ needleText: () => "ana", search: (j, s) => calls.push([j, s]) }),
    );
    const search = defs.find((d) => d.id === "search")!;
    const go = prepareGo(search, initialMenu(defs));
    expect(go.ok).toBe(true);
    if (go.ok) search.run(go.values, go.variant);
    expect(calls).toEqual([["ana", "clanekokokosu"]]);
  });

  it("Přečti znak(x) bere přesně jeden znak", () => {
    const defs = kmpActions(ctx());
    const read = defs.find((d) => d.id === "read")!;
    let st = initialMenu(defs);
    st = menuReducer(st, { type: "text", name: "x", text: "ab" });
    expect(prepareGo(read, st).ok).toBe(false);
    st = menuReducer(st, { type: "text", name: "x", text: "u" });
    expect(prepareGo(read, st).ok).toBe(true);
  });

  it("Náhodně: jehla 3–5 znaků nad {a, b}, seno 16–24 znaků s aspoň jedním výskytem", () => {
    for (let seed = 1; seed < 60; seed++) {
      const { needle, text } = randomKmp(seed);
      expect(needle).toMatch(/^[ab]{3,5}$/);
      expect(text).toMatch(/^[ab]{16,24}$/);
      expect(naiveFind(needle, text).length).toBeGreaterThan(0);
      expect(kmpRun(needle, text).found).toEqual(naiveFind(needle, text));
    }
  });
});

describe("tip „Zkuste…“ podle načteného příkladu", () => {
  it("kokos mluví o kokosu, barbarossa o obr. 13.1, vlastní vstup obecně", () => {
    const base = initialKmp({});
    expect(kmpTip(base)).toMatch(/clanekokoko|kokos/);
    const bar = {
      ...base,
      example: "barbarossa",
      needle: "barbarossa",
      text: "barbarbarossa",
    };
    expect(kmpTip(bar)).toMatch(/barbarossa/);
    expect(kmpTip(bar)).not.toMatch(/kokos/);
    const own = { ...base, example: null, needle: "abc", text: "xabcx" };
    expect(kmpTip(own)).not.toMatch(/kokos|barbarbarossa/);
    expect(kmpTip(own)).toMatch(/Příklad/);
  });
});

describe("jednotné akce (CROSS-04)", () => {
  it("Vytvořit první, Příklady z knihy hned za ním; Výchozí příklad není varianta ani akce (je pod akcemi)", () => {
    const defs = kmpActions(ctx());
    expect(defs[0].id).toBe("create");
    expect(defs[1].label).toBe("Příklady z knihy");
    const all = defs.flatMap((d) => [
      d.label,
      ...(d.variants ?? []).map((v) => v.label),
    ]);
    expect(all).not.toContain("Výchozí příklad");
  });
});
