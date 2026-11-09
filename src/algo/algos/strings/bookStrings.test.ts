/*
 * Předvolby textových algoritmů proti knize: každá knižní předvolba (bookStrings.ts) má stranu
 * a skutečný algoritmus na ní dá přesně data z knihy (bookStrings.fixtures.ts).
 */
import { describe, expect, it } from "vitest";
import { acBuild, acSearch } from "./ahoCorasick";
import {
  AC_EXAMPLES,
  acExample,
  acExampleFor,
  FIG_13_2_BENDS,
  FIG_13_2_COORDS,
  KMP_EXAMPLES,
  kmpExample,
  RK_EXAMPLES,
  rkExample,
} from "./bookStrings";
import {
  AC_EX1,
  AC_EX2,
  AC_SEARCHES,
  ANA,
  FIG_13_1,
  FIG_13_2,
  KOKOS,
  NAIVE_WORST,
  RK,
  type AcHit,
} from "./bookStrings.fixtures";
import { kmpRun, kmpTable, naiveComparisons } from "./kmp";
import { rkPow, rkRun } from "./rabinKarp";

describe("KMP – příklady z knihy", () => {
  it("pořadí a zdroje: kokos (výchozí, str. 320–321), obr. 13.1, bananas a anna (str. 319), cvičení 1, zarážka", () => {
    expect(KMP_EXAMPLES.map((e) => e.id)).toEqual([
      "kokos",
      "barbarossa",
      "bananas",
      "anna",
      "aaab",
      "aaaa",
    ]);
    expect(kmpExample("kokos").source).toContain("str. 320–321");
    expect(kmpExample("barbarossa").source).toContain("Obr. 13.1 (str. 321)");
    expect(kmpExample("bananas").source).toContain("str. 319");
    expect(kmpExample("anna").source).toContain("str. 319");
    expect(kmpExample("aaab").source).toContain("str. 324");
    for (const e of KMP_EXAMPLES) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.note.length).toBeGreaterThan(0);
    }
  });

  it("obr. 13.1: Z pro barbarossa", () => {
    const e = kmpExample("barbarossa");
    expect(e.needle).toBe(FIG_13_1.needle);
    expect(kmpTable(e.needle)).toEqual(FIG_13_1.Z);
  });

  it("kokos / clanekokokosu: Z, stavy po znacích a výskyt jako na str. 320–321", () => {
    const e = kmpExample("kokos");
    expect([e.needle, e.text]).toEqual([KOKOS.needle, KOKOS.text]);
    const r = kmpRun(e.needle, e.text);
    expect(r.Z).toEqual(KOKOS.Z);
    expect(r.states).toEqual(KOKOS.states);
    expect(r.found).toEqual(KOKOS.found);
  });

  it("ana v bananas (1, 3) a v anna (nic) – str. 319", () => {
    expect(kmpTable(kmpExample("bananas").needle)).toEqual(ANA.Z);
    expect(kmpRun(ANA.needle, kmpExample("bananas").text).found).toEqual(
      ANA.bananas.found,
    );
    expect(kmpExample("anna").text).toBe(ANA.anna.text);
    expect(kmpRun(ANA.needle, ANA.anna.text).found).toEqual(ANA.anna.found);
  });

  it("cvičení 1: aaab / aaaaaaaaaa – naivně 28 porovnání, KMP 17", () => {
    const e = kmpExample("aaab");
    expect(kmpTable(e.needle)).toEqual(NAIVE_WORST.Z);
    expect(naiveComparisons(e.needle, e.text)).toBe(NAIVE_WORST.naive);
    expect(kmpRun(e.needle, e.text).count.cmp).toBe(NAIVE_WORST.kmp);
  });
});

describe("Rabin–Karp – příklady (sena z knihy, P a N naše)", () => {
  it("bez kolize (N = 101), falešná shoda (N = 17), bananas N = 13, nejhorší případ, N = 2", () => {
    expect(RK_EXAMPLES.map((e) => e.id)).toEqual([
      "kokos101",
      "kokos17",
      "bananas13",
      "worst",
      "tiny",
    ]);
    expect(rkExample("kokos101").label).toContain("bez kolize");
    expect(rkExample("kokos17").label).toContain("falešná shoda");
    for (const e of RK_EXAMPLES) expect(e.title).toMatch(/str\. 3\d\d|naše/);
  });

  it.each(["kokos101", "kokos17", "bananas13"] as const)(
    "%s: heše okének, j, P^J mod N a falešné shody",
    (id) => {
      const e = rkExample(id);
      const r = rkRun(e.needle, e.text, e.P, e.N);
      expect(r.hashes).toEqual(RK[id].hashes);
      expect(r.j).toBe(RK[id].j);
      expect(rkPow(e.P, e.needle.length, e.N)).toBe(RK[id].PJ);
      expect(r.falseHits).toEqual(RK[id].falseHits);
    },
  );

  it("bananas s N = 101 je bez falešné shody", () => {
    const r = rkRun("ana", "bananas", 31, 101);
    expect(r.hashes).toEqual(RK.bananas101.hashes);
    expect(r.falseHits).toEqual([]);
  });
});

describe("Aho–Corasicková – příklady z knihy", () => {
  const hits = (words: readonly string[], text: string): AcHit[] => {
    const A = acBuild(words);
    return acSearch(A, text).out.map((o) => [o.k, A.words[o.word]] as const);
  };

  it("pořadí a zdroje: obr. 13.2 se seny barbara (výchozí), bara a naším, cvičení 1 (tři části), obr. 13.1, cvičení 2", () => {
    expect(AC_EXAMPLES.map((e) => e.id)).toEqual([
      "fig132",
      "bara",
      "all5",
      "abrakadabra",
      "kobra",
      "kandelabr",
      "barbarossa",
      "aaa",
    ]);
    expect(acExample("fig132").source).toBe("Obr. 13.2 (str. 326)");
    expect(acExample("bara").source).toContain("str. 325–326");
    for (const id of ["abrakadabra", "kobra", "kandelabr"])
      expect(acExample(id).source).toContain("cvičení 1, str. 329");
    expect(acExample("barbarossa").source).toContain("Obr. 13.1 (str. 321)");
    expect(acExample("aaa").source).toContain("cvičení 2, str. 329");
    for (const e of AC_EXAMPLES) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.note.length).toBeGreaterThan(0);
    }
  });

  it("obr. 13.2: slova a sena barbara, bara, barbarabaraba dají výskyty z knihy", () => {
    for (const id of ["fig132", "bara", "all5"])
      expect(acExample(id).words).toEqual(FIG_13_2.words);
    expect(acExample("fig132").text).toBe(AC_SEARCHES.barbara.text);
    expect(hits(FIG_13_2.words, acExample("fig132").text)).toEqual(
      AC_SEARCHES.barbara.hits,
    );
    expect(hits(FIG_13_2.words, acExample("bara").text)).toEqual(
      AC_SEARCHES.bara.hits,
    );
    expect(hits(FIG_13_2.words, acExample("all5").text)).toEqual(
      AC_SEARCHES.barbarabaraba.hits,
    );
  });

  it("cvičení 1 a 2 (str. 329): slovníky a výskyty", () => {
    const ex = [
      ["abrakadabra", AC_EX1.abrakadabra],
      ["kobra", AC_EX1.more],
      ["kandelabr", AC_EX1.kandelabr],
      ["aaa", AC_EX2],
    ] as const;
    for (const [id, f] of ex) {
      const e = acExample(id);
      expect(e.words).toEqual(f.words);
      expect(e.text).toBe(f.text);
      expect(hits(e.words, e.text)).toEqual(f.hits);
    }
  });

  it("obr. 13.1 jako AC: jedna jehla barbarossa", () => {
    expect(acExample("barbarossa").words).toEqual([FIG_13_1.needle]);
  });

  it("odkaz pozná příklad podle slov a sena", () => {
    expect(acExampleFor([...FIG_13_2.words], "bara")?.id).toBe("bara");
    expect(acExampleFor(["ara"], "bara")).toBeNull();
  });

  it("polohy vrcholů obr. 13.2 pro kresbu = data z obrázku", () => {
    expect(FIG_13_2_COORDS).toEqual(FIG_13_2.coords);
  });

  it("ruční ohyby hran obr. 13.2 jsou jen u hran, které na obrázku existují", () => {
    const A = acBuild([...FIG_13_2.words]);
    const by = new Map(A.nodes.map((n) => [n.name, n.id]));
    for (const key of Object.keys(FIG_13_2_BENDS)) {
      const [kind, from] = key.split(":");
      const id = by.get(from)!;
      expect(id).toBeDefined();
      expect(kind === "back" ? A.back[id] : A.short[id]).not.toBeNull();
    }
  });
});
