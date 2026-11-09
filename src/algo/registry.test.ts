// Registr modulů a kostra aplikace: každá cesta má stránku a popis, hledání bez diakritiky, neznámé adresy → přehled.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, matchPath } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  filterCategories,
  formatSource,
  isKnownPath,
  LEVEL_LABEL,
  matchesQuery,
  moduleByPath,
  MODULES,
  normalizePath,
  normalizeSearch,
  ROUTE_PATTERNS,
  START_HERE,
} from "./registry";
import { Shell } from "./App";
import { readFileSync } from "node:fs";

describe("registry – konzistence", () => {
  it("každá cesta z menu odpovídá některému vzoru rout v App.tsx", () => {
    for (const m of MODULES)
      expect(
        ROUTE_PATTERNS.some((p) => matchPath(p, m.path)),
        m.path,
      ).toBe(true);
  });

  it("každý vzor rout má v menu aspoň jeden modul (žádná mrtvá stránka)", () => {
    for (const p of ROUTE_PATTERNS)
      expect(
        MODULES.some((m) => matchPath(p, m.path)),
        p,
      ).toBe(true);
  });

  it("cesty jsou jedinečné, každý modul má jednovětý český popis a úroveň", () => {
    expect(new Set(MODULES.map((m) => m.path)).size).toBe(MODULES.length);
    for (const m of MODULES) {
      expect(m.desc.length, m.path).toBeGreaterThan(30);
      expect(m.desc.length, m.path).toBeLessThan(160);
      expect(m.desc, m.path).toMatch(/^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ(]/);
      expect(m.desc, m.path).toMatch(/\.$/);
      expect(LEVEL_LABEL[m.level], m.path).toBeDefined();
    }
    for (const c of CATEGORIES) expect(c.modules.length).toBeGreaterThan(0);
  });

  it("„Kde začít“ odkazuje jen na existující moduly", () => {
    for (const p of START_HERE) expect(moduleByPath(p), p).toBeDefined();
  });
});

/** Cesty všech 33 modulů před přeskupením do tematických skupin (7. 11. 2026) – odkazy kolují, nesmí zmizet. */
const OLD_PATHS = [
  "/sort/bubble",
  "/sort/select",
  "/sort/insert",
  "/sort/merge",
  "/sort/quick",
  "/sort/heap",
  "/sort/counting",
  "/ds/stack",
  "/ds/queue",
  "/ds/list",
  "/ds/heap",
  "/ds/segtree",
  "/tree/bst",
  "/tree/avl",
  "/graph/bfs",
  "/graph/dfs",
  "/graph/topo",
  "/graph/dijkstra",
  "/graph/jarnik",
  "/graph/kruskal",
  "/ds2/array",
  "/ds2/counter",
  "/tree/bb",
  "/tree/splay",
  "/tree/ab",
  "/cache/paging",
  "/string/suffix",
  "/hash/chaining",
  "/hash/probing",
  "/hash/cuckoo",
  "/hash/bloom",
  "/geom/kdtree",
  "/parallel/lockfree",
];
/** Moduly fáze 2 (7. 11. 2026): kap. 13, 15 a 17 Průvodce. */
const NEW_PATHS = [
  "/string/kmp",
  "/string/aho-corasick",
  "/string/rabin-karp",
  "/parallel/gates",
  "/parallel/adder",
  "/parallel/sortnet",
  "/fft/fft",
  "/fft/net",
];
/** Moduly fáze 4 (8. 11. 2026, rozhodnutí vlastníka): toky, grafy, dynamické programování, obal, LLRB. */
const PHASE4_PATHS = [
  "/flow/ford-fulkerson",
  "/flow/dinic",
  "/graph/bellman-ford",
  "/graph/boruvka",
  "/graph/bridges",
  "/graph/scc",
  "/dp/edit",
  "/dp/lis",
  "/geom/hull",
  "/tree/llrb",
];
/** Goldbergův algoritmus (8. 11. 2026, přání vlastníka „chybí Goldbergův algoritmus“). */
const GOLDBERG_PATHS = ["/flow/goldberg"];
/** Mgr. moduly, které jsou i v Průvodci labyrintem algoritmů (kap. 8, 9, 11, 13). */
const MGR_IN_BOOK = [
  "/ds2/array",
  "/ds2/counter",
  "/tree/bb",
  "/tree/splay",
  "/tree/ab",
  "/hash/chaining",
  "/hash/probing",
  "/string/suffix",
];

describe("registry – tematické skupiny a zdroje (vlastník 7. 11. 2026)", () => {
  it("skupiny jdou v pořadí podle kapitol knihy; žádná „II“ ani „(Mgr.)“; každá je neprázdná", () => {
    expect(CATEGORIES.map((c) => c.title)).toEqual([
      "Třídění",
      "Datové struktury",
      "Vyhledávací stromy",
      "Hešování",
      "Grafy",
      "Dynamické programování",
      "Textové algoritmy",
      "Toky v sítích",
      "Paralelní algoritmy",
      "Geometrie",
      "Fourierova transformace",
    ]);
    for (const c of CATEGORIES) {
      expect(c.title).not.toMatch(/\bII\b|\(Mgr\.\)/);
      expect(c.modules.length, c.title).toBeGreaterThan(0);
      expect(c.intro, c.title).toBeTruthy();
    }
  });

  it("moduly leží v tematických skupinách (cesty i úrovně beze změny)", () => {
    const group = (t: string) =>
      CATEGORIES.find((c) => c.title === t)?.modules.map((m) => m.path);
    expect(group("Datové struktury")).toEqual([
      "/ds/stack",
      "/ds/queue",
      "/ds/list",
      "/ds/heap",
      "/ds/segtree",
      "/ds2/array",
      "/ds2/counter",
      "/cache/paging",
    ]);
    expect(group("Vyhledávací stromy")).toEqual([
      "/tree/bst",
      "/tree/avl",
      "/tree/llrb",
      "/tree/bb",
      "/tree/splay",
      "/tree/ab",
    ]);
    expect(group("Hešování")).toEqual([
      "/hash/chaining",
      "/hash/probing",
      "/hash/cuckoo",
      "/hash/bloom",
    ]);
    // textové algoritmy v pořadí kapitol 13.2 KMP, 13.3 Aho-Corasicková, 13.4 Rabin-Karp, 13.5 sufixové pole
    expect(group("Textové algoritmy")).toEqual([
      "/string/kmp",
      "/string/aho-corasick",
      "/string/rabin-karp",
      "/string/suffix",
    ]);
    // kap. 15.1 hradla, 15.2 sčítačka, 15.3 třídicí sítě, pak magisterský bezzámkový zásobník
    expect(group("Paralelní algoritmy")).toEqual([
      "/parallel/gates",
      "/parallel/adder",
      "/parallel/sortnet",
      "/parallel/lockfree",
    ]);
    // fáze 4: v pořadí oddílů knihy (Bc. před Mgr. jako u stromů)
    expect(group("Grafy")).toEqual([
      "/graph/bfs",
      "/graph/dfs",
      "/graph/bridges",
      "/graph/topo",
      "/graph/scc",
      "/graph/dijkstra",
      "/graph/bellman-ford",
      "/graph/jarnik",
      "/graph/boruvka",
      "/graph/kruskal",
    ]);
    expect(group("Dynamické programování")).toEqual(["/dp/lis", "/dp/edit"]);
    expect(group("Toky v sítích")).toEqual([
      "/flow/ford-fulkerson",
      "/flow/dinic",
      "/flow/goldberg",
    ]);
    expect(group("Geometrie")).toEqual(["/geom/hull", "/geom/kdtree"]);
    expect(group("Fourierova transformace")).toEqual(["/fft/fft", "/fft/net"]);
  });

  it("všech 33 starých cest dál existuje, přibylo 8 modulů fáze 2, 10 modulů fáze 4 a Goldberg", () => {
    expect([...MODULES.map((m) => m.path)].sort()).toEqual(
      [...OLD_PATHS, ...NEW_PATHS, ...PHASE4_PATHS, ...GOLDBERG_PATHS].sort(),
    );
    expect(MODULES).toHaveLength(52);
    for (const p of [
      ...OLD_PATHS,
      ...NEW_PATHS,
      ...PHASE4_PATHS,
      ...GOLDBERG_PATHS,
    ])
      expect(isKnownPath(p), p).toBe(true);
  });

  it("nové moduly fáze 2: úroveň Bc., zdroj = oddíl a tištěná strana Průvodce (ověřeno v textu knihy)", () => {
    const src = (p: string) => moduleByPath(p)?.source;
    expect(src("/string/kmp")).toEqual({ chapter: "13.2", page: 320 });
    expect(src("/string/aho-corasick")).toEqual({ chapter: "13.3", page: 324 });
    expect(src("/string/rabin-karp")).toEqual({ chapter: "13.4", page: 330 });
    expect(src("/parallel/gates")).toEqual({ chapter: "15.1", page: 381 });
    expect(src("/parallel/adder")).toEqual({ chapter: "15.2", page: 386 });
    expect(src("/parallel/sortnet")).toEqual({ chapter: "15.3", page: 392 });
    expect(src("/fft/fft")).toEqual({ chapter: "17.3", page: 430 });
    expect(src("/fft/net")).toEqual({ chapter: "17.5", page: 438 });
    for (const p of NEW_PATHS) expect(moduleByPath(p)?.level, p).toBe("bc");
  });

  it("nové moduly najde hledání česky i anglicky (synonyma ve štítcích)", () => {
    const find = (q: string) =>
      MODULES.filter((m) => matchesQuery(m, q)).map((m) => m.path);
    expect(find("knuth morris pratt")).toEqual(["/string/kmp"]);
    expect(find("kmp")).toContain("/string/kmp");
    expect(find("automat")).toEqual(
      expect.arrayContaining(["/string/kmp", "/string/aho-corasick"]),
    );
    expect(find("aho corasick")).toEqual(["/string/aho-corasick"]);
    expect(find("slovník")).toContain("/string/aho-corasick");
    expect(find("rabin karp")).toEqual(["/string/rabin-karp"]);
    expect(find("rolling hash")).toEqual(["/string/rabin-karp"]);
    expect(find("hradla")).toContain("/parallel/gates");
    expect(find("logický obvod")).toContain("/parallel/gates");
    expect(find("circuit")).toContain("/parallel/gates");
    expect(find("sčítačka")).toEqual(["/parallel/adder"]);
    expect(find("carry lookahead")).toEqual(["/parallel/adder"]);
    expect(find("třídicí síť")).toEqual(["/parallel/sortnet"]);
    expect(find("comparator network")).toEqual(["/parallel/sortnet"]);
    expect(find("bitonic")).toEqual(["/parallel/sortnet"]);
    expect(find("batcher")).toEqual(["/parallel/sortnet"]);
    expect(find("fft")).toEqual(
      expect.arrayContaining(["/fft/fft", "/fft/net"]),
    );
    expect(find("fourier")).toEqual(
      expect.arrayContaining(["/fft/fft", "/fft/net"]),
    );
    expect(find("polynomy")).toContain("/fft/fft");
    expect(find("motýlek")).toContain("/fft/net");
    expect(find("butterfly")).toContain("/fft/net");
    // integrace fáze 2 (patchList stop): štítky z hotových modulů
    expect(find("nor")).toContain("/parallel/gates");
    expect(find("kombinační obvod")).toEqual(["/parallel/gates"]);
    expect(find("pravdivostní tabulka")).toEqual(["/parallel/gates"]);
    expect(find("0-1 princip")).toEqual(["/parallel/sortnet"]);
    expect(find("bitové zrcadlení")).toEqual(["/fft/net"]);
  });

  it("popisy nových modulů odpovídají knize (AC: Θ(ΣJᵢ + S + V), str. 329)", () => {
    expect(moduleByPath("/string/aho-corasick")?.desc).toContain(
      "Θ(ΣJᵢ + S + V)",
    );
  });

  it("13 Mgr. modulů si drží štítek a hledání „mgr“ je najde všechny", () => {
    const mgr = MODULES.filter((m) => m.level === "mgr").map((m) => m.path);
    expect(mgr).toHaveLength(13);
    const found = MODULES.filter((m) => matchesQuery(m, "mgr")).map(
      (m) => m.path,
    );
    expect(found.sort()).toEqual([...mgr].sort());
  });

  it("každý modul má zdroj; Bc. moduly kapitolu a stranu Průvodce, Mgr. přednášku (a kapitolu, jsou-li v knize)", () => {
    for (const m of MODULES) {
      expect(m.source, m.path).toBeDefined();
      const s = m.source!;
      if (s.chapter !== undefined) {
        expect(s.chapter, m.path).toMatch(/^\d+\.\d+$/);
        expect(s.page, m.path).toBeGreaterThan(16);
        expect(s.page, m.path).toBeLessThan(500);
      }
      if (m.level === "bc") {
        expect(s.chapter, m.path).toBeDefined();
        expect(s.page, m.path).toBeDefined();
      } else {
        expect(s.lecture, m.path).toMatch(/^DS I, /);
        if (MGR_IN_BOOK.includes(m.path)) {
          expect(s.chapter, m.path).toBeDefined();
          expect(s.page, m.path).toBeDefined();
        } else expect(s.chapter, m.path).toBeUndefined();
      }
    }
  });

  it("každý oddíl a strana z registru leží v knize: strana je mezi začátkem oddílu a začátkem dalšího (všechny moduly)", () => {
    // bookSections.fixture.json = nadpisy oddílů a tištěné strany vytažené z textu Průvodce (validace F4)
    const sections = (
      JSON.parse(
        readFileSync(
          new URL("./bookSections.fixture.json", import.meta.url),
          "utf8",
        ),
      ) as { sections: Record<string, { page: number; title: string }> }
    ).sections;
    const order = Object.keys(sections).sort((a, b) => {
      const [a1, a2] = a.split(".").map(Number);
      const [b1, b2] = b.split(".").map(Number);
      return a1 - b1 || a2 - b2;
    });
    let checked = 0;
    for (const m of MODULES) {
      const s = m.source;
      if (s.chapter === undefined) continue;
      const sec = sections[s.chapter];
      expect(sec, `${m.path}: oddíl ${s.chapter} v knize`).toBeDefined();
      const next = sections[order[order.indexOf(s.chapter) + 1]];
      expect(
        s.page,
        `${m.path}: strana ≥ začátek ${s.chapter}`,
      ).toBeGreaterThanOrEqual(sec.page);
      if (next)
        expect(
          s.page,
          `${m.path}: strana ≤ začátek dalšího oddílu`,
        ).toBeLessThanOrEqual(next.page);
      checked++;
    }
    expect(checked).toBe(MODULES.filter((m) => m.source.chapter).length);
    expect(checked).toBeGreaterThan(25);
  });

  it("zdroje vybraných modulů (snímek ručně ověřený proti knize 7. 11. 2026)", () => {
    const src = (p: string) => moduleByPath(p)?.source;
    expect(src("/sort/bubble")).toEqual({ chapter: "3.1", page: 61 });
    expect(src("/sort/quick")).toEqual({ chapter: "10.7", page: 259 });
    expect(src("/sort/heap")).toEqual({ chapter: "4.2", page: 90 });
    expect(src("/ds/segtree")).toEqual({ chapter: "4.5", page: 98 });
    expect(src("/graph/topo")).toEqual({ chapter: "5.8", page: 127 });
    expect(src("/graph/kruskal")).toEqual({ chapter: "7.4", page: 174 });
    expect(src("/tree/splay")).toEqual({
      chapter: "9.5",
      page: 230,
      lecture: "DS I, přednáška 2",
    });
    expect(src("/hash/probing")?.page).toBe(279);
    expect(src("/string/suffix")?.chapter).toBe("13.5");
    expect(src("/cache/paging")).toEqual({ lecture: "DS I, přednáška 4" });
  });

  it("formatSource: „Průvodce 9.5, str. 230“, přednáška za tečkou, prázdný zdroj = ''", () => {
    expect(formatSource({ chapter: "9.5", page: 230 })).toBe(
      "Průvodce 9.5, str. 230",
    );
    expect(
      formatSource({ chapter: "9.5", page: 230, lecture: "DS I, přednáška 2" }),
    ).toBe("Průvodce 9.5, str. 230 · DS I, přednáška 2");
    expect(formatSource({ lecture: "DS I, přednáška 4" })).toBe(
      "DS I, přednáška 4",
    );
    expect(formatSource({ chapter: "4.1" })).toBe("Průvodce 4.1");
    expect(formatSource({})).toBe("");
    expect(formatSource(undefined)).toBe("");
  });
});

describe("registry – moduly fáze 4 (vlastník 8. 11. 2026)", () => {
  it("úroveň Bc., zdroj = oddíl a tištěná strana Průvodce (ověřeno v textu knihy)", () => {
    const src = (p: string) => moduleByPath(p)?.source;
    expect(src("/flow/ford-fulkerson")).toEqual({ chapter: "14.2", page: 353 });
    expect(src("/flow/dinic")).toEqual({ chapter: "14.4", page: 361 });
    expect(src("/flow/goldberg")).toEqual({ chapter: "14.5", page: 368 });
    expect(src("/graph/bellman-ford")).toEqual({ chapter: "6.3", page: 149 });
    expect(src("/graph/boruvka")).toEqual({ chapter: "7.3", page: 173 });
    expect(src("/graph/bridges")).toEqual({ chapter: "5.7", page: 123 });
    expect(src("/graph/scc")).toEqual({ chapter: "5.10", page: 134 });
    expect(src("/dp/edit")).toEqual({ chapter: "12.3", page: 306 });
    expect(src("/dp/lis")).toEqual({ chapter: "12.2", page: 302 });
    expect(src("/geom/hull")).toEqual({ chapter: "16.1", page: 401 });
    expect(src("/tree/llrb")).toEqual({ chapter: "8.4", page: 206 });
    for (const p of PHASE4_PATHS) expect(moduleByPath(p)?.level, p).toBe("bc");
  });

  it("nové moduly najde hledání česky i anglicky (synonyma ve štítcích)", () => {
    const find = (q: string) =>
      MODULES.filter((m) => matchesQuery(m, q)).map((m) => m.path);
    expect(find("ford fulkerson")).toEqual(["/flow/ford-fulkerson"]);
    expect(find("maximální tok")).toEqual([
      "/flow/ford-fulkerson",
      "/flow/dinic",
      "/flow/goldberg",
    ]);
    expect(find("max flow")).toEqual([
      "/flow/ford-fulkerson",
      "/flow/dinic",
      "/flow/goldberg",
    ]);
    expect(find("párování")).toContain("/flow/ford-fulkerson");
    expect(find("blokující tok")).toEqual(["/flow/dinic"]);
    expect(find("goldberg")).toEqual(["/flow/goldberg"]);
    expect(find("push-relabel")).toEqual(["/flow/goldberg"]);
    expect(find("přebytek")).toEqual(["/flow/goldberg"]);
    expect(find("bellman ford")).toEqual(["/graph/bellman-ford"]);
    expect(find("záporný cyklus")).toEqual(["/graph/bellman-ford"]);
    expect(find("relaxace")).toContain("/graph/bellman-ford");
    expect(find("borůvka")).toEqual(["/graph/boruvka"]);
    expect(find("most")).toContain("/graph/bridges");
    expect(find("artikulace")).toEqual(["/graph/bridges"]);
    expect(find("bridges")).toEqual(["/graph/bridges"]);
    expect(find("silně souvislé")).toContain("/graph/scc");
    expect(find("tarjan")).toEqual(["/graph/scc"]);
    expect(find("scc")).toEqual(["/graph/scc"]);
    expect(find("editační vzdálenost")).toEqual(["/dp/edit"]);
    expect(find("levenshtein")).toEqual(["/dp/edit"]);
    expect(find("rostoucí podposloupnost")).toEqual(["/dp/lis"]);
    expect(find("lis")).toContain("/dp/lis");
    expect(find("dynamické programování")).toEqual(["/dp/lis", "/dp/edit"]);
    expect(find("konvexní obal")).toEqual(["/geom/hull"]);
    expect(find("convex hull")).toEqual(["/geom/hull"]);
    expect(find("llrb")).toEqual(["/tree/llrb"]);
    expect(find("červeno-černý")).toEqual(["/tree/llrb"]);
    expect(find("red black")).toEqual(["/tree/llrb"]);
  });

  it("skupiny fáze 4 mají uvedení a stávající popisy zmiňují nové moduly", () => {
    const intro = (t: string) => CATEGORIES.find((c) => c.title === t)?.intro;
    expect(intro("Dynamické programování")).toBeTruthy();
    expect(intro("Toky v sítích")).toBeTruthy();
    expect(intro("Geometrie")).toMatch(/konvexní obal/i);
  });
});

describe("registry – známé cesty", () => {
  it("neznámé :id i zděděné vlastnosti objektů nejsou známé cesty", () => {
    for (const p of [
      "/sort/foo",
      "/ds/constructor",
      "/ds/toString",
      "/ds/__proto__",
      "/tree/hasOwnProperty",
      "/graph/",
      "/hash/x",
      "/nic",
    ]) {
      expect(isKnownPath(p), p).toBe(false);
    }
  });

  it("známé cesty včetně koncového lomítka a kořene", () => {
    expect(isKnownPath("/")).toBe(true);
    expect(isKnownPath("/sort/quick")).toBe(true);
    expect(isKnownPath("/sort/quick/")).toBe(true);
    expect(normalizePath("/sort/quick///")).toBe("/sort/quick");
    expect(normalizePath("")).toBe("/");
    expect(moduleByPath("/graph/jarnik/")?.title).toBe(
      "Jarníkův (Primův) algoritmus",
    );
  });
});

describe("registry – hledání", () => {
  it("normalizeSearch odstraní diakritiku, velikost písmen a nadbytečné mezery", () => {
    expect(normalizeSearch("  Jarníkův   ALGORITMUS ")).toBe(
      "jarnikuv algoritmus",
    );
    expect(normalizeSearch("Kukaččí hešování")).toBe("kukacci hesovani");
  });

  it("hledá v názvu, popisu i štítcích bez diakritiky; všechna slova musí sedět", () => {
    const find = (q: string) =>
      MODULES.filter((m) => matchesQuery(m, q)).map((m) => m.path);
    expect(find("jarnik")).toEqual(["/graph/jarnik"]);
    expect(find("prim")).toContain("/graph/jarnik");
    expect(find("kostra")).toEqual([
      "/graph/jarnik",
      "/graph/boruvka",
      "/graph/kruskal",
    ]);
    expect(find("HEŠ")).toEqual(
      expect.arrayContaining([
        "/hash/chaining",
        "/hash/probing",
        "/hash/cuckoo",
      ]),
    );
    expect(find("halda třídění")).toEqual(["/sort/heap"]);
    expect(find("mgr splay")).toEqual(["/tree/splay"]);
    expect(find("neexistujícíslovo")).toEqual([]);
    expect(find("")).toHaveLength(MODULES.length);
  });

  it("filterCategories vynechá kategorie bez výsledku a zachová pořadí", () => {
    const cats = filterCategories("dijkstra");
    expect(cats.map((c) => c.title)).toEqual(["Grafy"]);
    expect(cats[0].modules.map((m) => m.path)).toEqual(["/graph/dijkstra"]);
    expect(filterCategories("").map((c) => c.title)).toEqual(
      CATEGORIES.map((c) => c.title),
    );
  });
});

describe("App – routování (SSR v MemoryRouteru)", () => {
  const at = (entry: string | { pathname: string; state: unknown }) =>
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        createElement(Shell),
      ),
    );
  const h1 = (html: string) => html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1] ?? null;

  it("známý modul vykreslí svou stránku a název v horní liště", () => {
    const html = at("/sort/quick");
    expect(h1(html)).toBe("Quicksort");
    expect(html).toMatch(/<span class="topbar-title">Quicksort<\/span>/);
  });

  it("stránka modulu ukáže u nadpisu zdroj z knihy / přednášky", () => {
    const html = at("/tree/splay");
    expect(html).toMatch(
      /<span class="viz-source"[^>]*>Průvodce 9\.5, str\. 230 · DS I, přednáška 2<\/span>/,
    );
    expect(at("/cache/paging")).toMatch(
      /<span class="viz-source"[^>]*>DS I, přednáška 4<\/span>/,
    );
  });

  it("neznámé id (#/sort/foo, #/ds/constructor) neukáže potichu první modul", () => {
    for (const p of [
      "/sort/foo",
      "/ds/constructor",
      "/ds/xyz",
      "/tree/__proto__",
      "/neco/jineho",
    ]) {
      const html = at(p);
      expect(h1(html), p).toBeNull();
      expect(html, p).not.toContain("Bubblesort</h1>");
    }
  });

  it("stránky fáze 2 a 4 se načítají líně, každá ze svého souboru (vlastní chunk, souběžné stopy)", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    for (const file of [
      "./algos/flows/FordFulkersonPage",
      "./algos/flows/DinicPage",
      "./algos/flows/GoldbergPage",
      "./algos/dp/EditDistancePage",
      "./algos/dp/LisPage",
      "./algos/geometry/HullPage",
      "./algos/trees/LlrbPage",
      "./algos/strings/KmpPage",
      "./algos/strings/AhoCorasickPage",
      "./algos/strings/RabinKarpPage",
      "./algos/parallel/GatesPage",
      "./algos/parallel/AdderPage",
      "./algos/parallel/SortNetPage",
      "./algos/fourier/FftPage",
      "./algos/fourier/FftNetPage",
    ]) {
      expect(app, file).toContain(`import("${file}")`);
      expect(app, file).not.toContain(`from "${file}"`);
    }
  });

  it("líně načítaná stránka při SSR ukáže zástupný text a název modulu v horní liště", () => {
    const html = at("/string/kmp");
    expect(html).toMatch(
      /<span class="topbar-title">Knuth–Morris–Pratt \(KMP\)<\/span>/,
    );
    expect(html).toContain('class="page-loading"');
  });

  it("přehled po přesměrování ohlásí neexistující adresu", () => {
    const html = at({ pathname: "/", state: { unknown: "/sort/foo" } });
    expect(h1(html)).toBe("Algoritmy a datové struktury");
    expect(html).toContain("<code>#/sort/foo</code> neexistuje");
  });

  it("přehled: hledání, „Kde začít“ a karty s popisem a úrovní", () => {
    const html = at("/");
    expect(html).toContain("Kde začít");
    expect(html.match(/<a class="card"/g)).toHaveLength(MODULES.length);
    expect(html).toContain('type="search"');
    expect(html).toContain('class="level-tag level-mgr"');
  });

  it("menu: tlačítko s aria-expanded / aria-controls, navigace s názvem, odkaz na obsah", () => {
    const html = at("/");
    expect(html).toMatch(
      /<button[^>]*class="menu-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="sidebar"/,
    );
    expect(html).toMatch(
      /<nav id="sidebar" class="sidebar" aria-label="Moduly"/,
    );
    expect(html).toContain("Přeskočit na obsah");
    expect(html).toMatch(/<main id="main" tabindex="-1" class="content">/);
  });
});

describe("registry – titulky a popisy sjednocené s knihou (CROSS-14, SORTDS-12)", () => {
  it("Stránkování: LRU, FIFO a OPT; Mergesort zdola nahoru po bězích", () => {
    expect(moduleByPath("/cache/paging")?.title).toBe(
      "Stránkování: LRU, FIFO a OPT",
    );
    expect(moduleByPath("/sort/merge")?.desc).toBe(
      "Slévá sousední setříděné běhy délky 1, 2, 4, … (zdola nahoru); Θ(n log n), stabilní, s pomocným polem.",
    );
  });
});
