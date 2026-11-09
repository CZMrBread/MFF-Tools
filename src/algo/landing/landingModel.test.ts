// Úvodní stránka /algo/#/: filtr Vše / Bc. / Mgr. + hledání (stejná logika jako levá lišta), kotvy skupin.
import { describe, expect, it } from "vitest";
import { CATEGORIES, MODULES, filterCategories } from "../registry";
import {
  LEVEL_FILTERS,
  countModules,
  groupAnchorId,
  landingCategories,
} from "./landingModel";

const paths = (cats: ReturnType<typeof landingCategories>) =>
  cats.flatMap((c) => c.modules.map((m) => m.path));

describe("landingModel – filtr úrovně a hledání", () => {
  it("přepínač má Vše, Bc., Mgr.", () => {
    expect(LEVEL_FILTERS.map((f) => [f.id, f.label])).toEqual([
      ["all", "Vše"],
      ["bc", "Bc."],
      ["mgr", "Mgr."],
    ]);
  });

  it("Vše bez dotazu = všech 52 modulů ve skupinách z registru", () => {
    const cats = landingCategories("", "all");
    expect(cats.map((c) => c.title)).toEqual(CATEGORIES.map((c) => c.title));
    expect(paths(cats)).toEqual(MODULES.map((m) => m.path));
    expect(countModules(cats)).toBe(52);
  });

  it("Bc. / Mgr. nechá jen moduly dané úrovně a vynechá prázdné skupiny", () => {
    const bc = landingCategories("", "bc");
    const mgr = landingCategories("", "mgr");
    expect(paths(bc)).toEqual(
      MODULES.filter((m) => m.level === "bc").map((m) => m.path),
    );
    expect(paths(mgr)).toEqual(
      MODULES.filter((m) => m.level === "mgr").map((m) => m.path),
    );
    expect(countModules(bc) + countModules(mgr)).toBe(52);
    expect(countModules(mgr)).toBe(13);
    for (const c of [...bc, ...mgr])
      expect(c.modules.length).toBeGreaterThan(0);
    // Hešování je celé magisterské → ve filtru Bc. chybí
    expect(bc.map((c) => c.title)).not.toContain("Hešování");
  });

  it("hledání je stejné jako v levé liště (bez diakritiky, tagy) a kombinuje se s úrovní", () => {
    for (const q of ["jarnik", "lifo", "heap", "strom", "mgr", "xyz123"])
      expect(paths(landingCategories(q, "all")), q).toEqual(
        paths(filterCategories(q)),
      );
    expect(paths(landingCategories("strom", "mgr"))).toEqual(
      paths(filterCategories("strom")).filter(
        (p) => MODULES.find((m) => m.path === p)!.level === "mgr",
      ),
    );
    expect(landingCategories("xyz123", "all")).toEqual([]);
  });
});

describe("landingModel – kotvy skupin", () => {
  it("id kotvy je jedinečné, bez diakritiky a mezer (platné id, nekoliduje s cestou #/…)", () => {
    const ids = CATEGORIES.map((c) => groupAnchorId(c.title));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^skupina-[a-z0-9-]+$/);
    expect(groupAnchorId("Vyhledávací stromy")).toBe(
      "skupina-vyhledavaci-stromy",
    );
  });
});

describe("hledání – tagy, zdroj a krátké dotazy (CROSS-10)", () => {
  const found = (q: string) => paths(landingCategories(q, "all"));
  it("najde řetězec, toposort, RMQ, otisk a oddíl knihy 13.2", () => {
    expect(found("retezec")).toEqual(
      expect.arrayContaining([
        "/string/kmp",
        "/string/aho-corasick",
        "/string/rabin-karp",
        "/string/suffix",
      ]),
    );
    expect(found("toposort")).toEqual(["/graph/topo"]);
    expect(found("rmq")).toContain("/ds/segtree");
    expect(found("otisk")).toEqual(["/string/rabin-karp"]);
    expect(found("fingerprint")).toEqual(["/string/rabin-karp"]);
    expect(found("13.2")).toContain("/string/kmp");
    expect(found("vyhledavani v textu")).toEqual(
      expect.arrayContaining(["/string/kmp", "/string/suffix"]),
    );
    expect(found("sjednoceni")).toContain("/graph/kruskal");
    expect(found("range query")).toEqual(
      expect.arrayContaining(["/geom/kdtree", "/ds/segtree"]),
    );
    expect(found("amortizovana slozitost")).toEqual(
      expect.arrayContaining([
        "/ds2/array",
        "/ds2/counter",
        "/tree/splay",
        "/tree/bb",
      ]),
    );
    expect(found("fifo")).toContain("/cache/paging");
  });
  it("„kd strom“ nenajde Binární haldu, „aho“ nenajde BB[α]", () => {
    expect(found("kd strom")).toContain("/geom/kdtree");
    expect(found("kd strom")).not.toContain("/ds/heap");
    expect(found("aho")).toEqual(["/string/aho-corasick"]);
  });
  it("„Bc“ / „mgr“ vrátí totéž co filtr úrovně", () => {
    expect(countModules(landingCategories("Bc", "all"))).toBe(
      countModules(landingCategories("", "bc")),
    );
    expect(countModules(landingCategories("mgr", "all"))).toBe(
      countModules(landingCategories("", "mgr")),
    );
  });
  it("dlouhá slova dál hledají i uvnitř slova (sort ⊂ Heapsort, strom ⊂ podstrom)", () => {
    expect(found("sort")).toEqual(
      expect.arrayContaining(["/sort/bubble", "/sort/heap", "/graph/topo"]),
    );
  });
});
