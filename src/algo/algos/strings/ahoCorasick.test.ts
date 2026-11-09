/*
 * Aho–Corasicková (Průvodce 13.3, str. 324–330) proti knize: celá tabulka obr. 13.2, pořadí fronty,
 * přesně čtyři zkratky, sena bara a barbara se stranou 325–326, cvičení 13.3.1 a 13.3.2; AC s jednou
 * jehlou = automat KMP; náhodné slovníky proti hledání hrubou silou; kroky (řádky pseudokódu, fáze).
 */
import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import {
  acBuild,
  acSearch,
  acSteps,
  cleanWords,
  MAX_WORDS,
  MAX_WORDS_TOTAL,
  naiveFindAll,
  PC_AC_BUILD,
  PC_AC_SEARCH,
  pseudocodeForAcPhase,
  type AcAutomaton,
} from "./ahoCorasick";
import {
  AC_EX1,
  AC_EX2,
  AC_SEARCHES,
  FIG_13_2,
  FIG_13_1,
  type AcHit,
} from "./bookStrings.fixtures";
import { kmpTable } from "./kmp";

const nameOf = (A: AcAutomaton, id: number | null) =>
  id === null ? null : A.nodes[id].name;
const byName = (A: AcAutomaton, name: string) =>
  A.nodes.find((n) => n.name === name)!;
const hits = (A: AcAutomaton, text: string): AcHit[] =>
  acSearch(A, text).out.map((o) => [o.k, A.words[o.word]] as const);

describe("acBuild – obr. 13.2 (str. 326)", () => {
  const A = acBuild([...FIG_13_2.words]);

  it("15 stavů očíslovaných podle vzniku; Zpět, Zkratka a Slovo přesně jako na obrázku", () => {
    expect(A.nodes).toHaveLength(15);
    const table = A.nodes.map((n) => ({
      name: n.name,
      depth: n.depth,
      back: nameOf(A, A.back[n.id]),
      short: nameOf(A, A.short[n.id]),
      word: n.word === null ? null : A.words[n.word],
    }));
    expect(table).toEqual(FIG_13_2.states);
  });

  it("fronta F po hladinách: a b ar ba ara bar arab bara barb barab barba baraba barbar barbara", () => {
    expect(A.order.map((id) => A.nodes[id].name).join(" ")).toBe(FIG_13_2.bfs);
  });

  it("zkratky jsou právě čtyři (tečkované na obrázku)", () => {
    const sc = A.nodes
      .filter((n) => A.short[n.id] !== null)
      .map((n) => [n.name, nameOf(A, A.short[n.id])]);
    expect(sc).toEqual(FIG_13_2.shortcuts.map((p) => [...p]));
  });

  it("každá zpětná hrana vede o hladinu výš a zkratka je nejbližší koncový stav po zpětných hranách", () => {
    for (const n of A.nodes.slice(1)) {
      const b = A.back[n.id]!;
      expect(A.nodes[b].depth).toBeLessThan(n.depth);
      let z: number | null = b;
      while (z !== null && A.nodes[z].word === null) z = A.back[z];
      expect(A.short[n.id]).toBe(z);
    }
  });

  it("synové v abecedním pořadí písmen; Dopředu je strom slov", () => {
    expect(byName(A, "bar").kids.map((k) => k[0])).toEqual(["a", "b"]);
    expect(A.nodes[0].kids.map((k) => k[0])).toEqual(["a", "b"]);
    for (const n of A.nodes.slice(1))
      expect((n.parent === 0 ? "" : A.nodes[n.parent!].name) + n.ch).toBe(
        n.name,
      );
  });
});

describe("acSearch – sena ze str. 325–326", () => {
  const A = acBuild([...FIG_13_2.words]);

  it("bara: stav bara není koncový, přesto zkratka ohlásí ara → (0, bar), (1, ara)", () => {
    const r = acSearch(A, AC_SEARCHES.bara.text);
    expect(r.states.map((s) => A.nodes[s].name).join(" ")).toBe(
      AC_SEARCHES.bara.states,
    );
    expect(hits(A, "bara")).toEqual(AC_SEARCHES.bara.hits);
  });

  it("barbara: pořadí hlášení (0, bar), (3, bar), (0, barbara), (4, ara)", () => {
    const r = acSearch(A, AC_SEARCHES.barbara.text);
    expect(r.states.map((s) => A.nodes[s].name).join(" ")).toBe(
      AC_SEARCHES.barbara.states,
    );
    expect(hits(A, "barbara")).toEqual(AC_SEARCHES.barbara.hits);
  });

  it("barbarabaraba: všech 5 jehel, 10 hlášení, 2 zpětné kroky; zpětných ≤ dopředných ≤ S", () => {
    const r = acSearch(A, AC_SEARCHES.barbarabaraba.text);
    expect(hits(A, AC_SEARCHES.barbarabaraba.text)).toEqual(
      AC_SEARCHES.barbarabaraba.hits,
    );
    expect(r.count.back).toBe(AC_SEARCHES.barbarabaraba.back);
    expect(r.count.reports).toBe(10);
    expect(r.count.back).toBeLessThanOrEqual(r.count.fwd);
    expect(r.count.fwd).toBeLessThanOrEqual(13);
  });

  it("znak, který v žádné jehle není, se v kořeni zahodí", () => {
    const r = acSearch(A, "barxa");
    expect(r.states.map((s) => A.nodes[s].name)).toEqual([
      "b",
      "ba",
      "bar",
      "ε",
      "a",
    ]);
  });
});

describe("cvičení 13.3.1 a 13.3.2 (str. 329)", () => {
  it("abrakadabra: 12 stavů, Zpět = Z z KMP, bez zkratek", () => {
    const e = AC_EX1.abrakadabra;
    const A = acBuild([...e.words]);
    expect(A.nodes).toHaveLength(e.states);
    expect(A.nodes.slice(1).map((n) => nameOf(A, A.back[n.id]))).toEqual(
      e.back,
    );
    expect(A.short.every((s) => s === null)).toBe(true);
    expect(hits(A, e.text)).toEqual(e.hits);
  });

  it("+ brak, kobra, obr, obrok: 26 stavů, zkratky abrak → brak a kobr → obr", () => {
    const e = AC_EX1.more;
    const A = acBuild([...e.words]);
    expect(A.nodes).toHaveLength(e.states);
    for (const [s, z] of Object.entries(e.back))
      expect(nameOf(A, A.back[byName(A, s).id])).toBe(z);
    const sc = Object.fromEntries(
      A.nodes
        .filter((n) => A.short[n.id] !== null)
        .map((n) => [n.name, nameOf(A, A.short[n.id])]),
    );
    expect(sc).toEqual(e.shortcuts);
    expect(hits(A, e.text)).toEqual(e.hits);
  });

  it("+ kandelabr: 34 stavů, abraka teď vede do ka; kandelabrakadabra s jedním zpětným krokem", () => {
    const e = AC_EX1.kandelabr;
    const A = acBuild([...e.words]);
    expect(A.nodes).toHaveLength(e.states);
    for (const [s, z] of Object.entries(e.back))
      expect(nameOf(A, A.back[byName(A, s).id])).toBe(z);
    expect(hits(A, e.text)).toEqual(e.hits);
    expect(acSearch(A, e.text).count.back).toBe(e.back1);
  });

  it("cvičení 2: a, aa, aaa v aaaa → 9 výskytů (na téže pozici konce od nejdelší)", () => {
    const A = acBuild([...AC_EX2.words]);
    expect(hits(A, AC_EX2.text)).toEqual(AC_EX2.hits);
  });
});

describe("AC zobecňuje KMP (str. 325)", () => {
  it("s jedinou jehlou barbarossa (obr. 13.1) jsou zpětné hrany přesně Z", () => {
    const A = acBuild([FIG_13_1.needle]);
    const Z = A.nodes.map((n) => (n.id === 0 ? null : A.back[n.id]));
    expect(Z).toEqual(kmpTable(FIG_13_1.needle));
    expect(Z).toEqual([...FIG_13_1.Z]);
  });
});

describe("náhodné slovníky proti hrubé síle", () => {
  it("výskyty jako multimnožina, na téže pozici konce od nejdelší jehly", () => {
    const r = rng(13);
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(r() * 5);
      const words = Array.from({ length: n }, () =>
        Array.from({ length: 1 + Math.floor(r() * 4) }, () =>
          r() < 0.5 ? "a" : "b",
        ).join(""),
      );
      const { words: clean } = cleanWords(words.join(","));
      const A = acBuild(clean);
      const text = Array.from({ length: 1 + Math.floor(r() * 20) }, () =>
        r() < 0.45 ? "a" : r() < 0.9 ? "b" : "c",
      ).join("");
      const got = acSearch(A, text).out;
      const want = naiveFindAll(clean, text);
      const key = (o: { k: number; word: number }) => `${o.k}:${o.word}`;
      expect(got.map(key).sort()).toEqual(want.map(key).sort());
      // pořadí: podle konce výskytu, na témže konci od nejdelší jehly
      for (let i = 1; i < got.length; i++) {
        const end = (o: { k: number; word: number }) =>
          o.k + clean[o.word].length;
        const a = got[i - 1];
        const b = got[i];
        expect(end(a)).toBeLessThanOrEqual(end(b));
        if (end(a) === end(b))
          expect(clean[a.word].length).toBeGreaterThan(clean[b.word].length);
      }
      const c = acSearch(A, text).count;
      expect(c.back).toBeLessThanOrEqual(c.fwd);
      expect(c.fwd).toBeLessThanOrEqual(text.length);
      expect(c.reports).toBe(want.length);
    }
  });
});

describe("cleanWords – vstup slovníku", () => {
  it("čárky i mezery oddělují, duplicity a prázdné tokeny pryč s poznámkou", () => {
    const c = cleanWords(" ara, bar,,arab ara  bar");
    expect(c.words).toEqual(["ara", "bar", "arab"]);
    expect(c.note).toMatch(/Duplicitní/u);
  });
  it(`nejvýš ${MAX_WORDS} slov a ${MAX_WORDS_TOTAL} znaků celkem`, () => {
    const many = cleanWords(
      Array.from({ length: 12 }, (_, i) => "w" + i).join(","),
    );
    expect(many.words).toHaveLength(MAX_WORDS);
    expect(many.note).toMatch(/nejvýše/u);
    const long = cleanWords(
      ["abrakadabra", "kandelabr", "barbarossa", "obrokobrok", "abcdefgh"].join(
        ",",
      ),
    );
    expect(long.words.join("").length).toBeLessThanOrEqual(MAX_WORDS_TOTAL);
    expect(long.note).not.toBe("");
  });
  it("prázdný vstup → žádné slovo", () => {
    expect(cleanWords(" , ,").words).toEqual([]);
  });
});

describe("acSteps – kroky", () => {
  const words = [...FIG_13_2.words];
  const all = materialize(acSteps(words, "barbara", "all"));
  const lineOk = (s: (typeof all)[number]) =>
    s.line === null ||
    (s.line >= 0 && s.line < pseudocodeForAcPhase(s.state.phase).length);

  it("příklad = jedna sada kroků: nejdřív stavba (AcKonstrukce), pak hledání (AcHledej)", () => {
    expect(all[0].state.phase).toBe("build");
    expect(all[all.length - 1].state.phase).toBe("search");
    const firstSearch = all.findIndex((s) => s.state.phase === "search");
    expect(
      all.slice(firstSearch).every((s) => s.state.phase === "search"),
    ).toBe(true);
    expect(all.every(lineOk)).toBe(true);
    const fin = all[all.length - 1].state;
    expect(fin.out.map((o) => [o.k, words[o.word]])).toEqual(
      AC_SEARCHES.barbara.hits,
    );
  });

  it("stavba: první krok jen kořen, pak jedno vložené slovo na krok (řádek 3)", () => {
    expect(all[0].line).toBe(2);
    expect(all[0].state.shown).toBe(1);
    const ins = all.filter((s) => s.state.phase === "build" && s.line === 3);
    expect(ins.map((s) => s.state.inserted)).toEqual([1, 2, 3, 4, 5]);
    expect(ins.map((s) => s.state.shown)).toEqual([4, 7, 8, 11, 15]);
  });

  it("stavba: zpětné hrany po hladinách – AcKrok projde jen stavy menší hloubky", () => {
    const build = all.filter((s) => s.state.phase === "build");
    for (const st of build) {
      const c = st.state.child;
      if (c === null) continue;
      for (const v of st.state.chain)
        expect(st.state.nodes[v].depth).toBeLessThan(st.state.nodes[c].depth);
    }
    const fin = build[build.length - 1].state;
    expect(fin.known.every(Boolean)).toBe(true);
    const A = acBuild(words);
    expect(fin.back).toEqual(A.back);
    expect(fin.short).toEqual(A.short);
  });

  it("zkratka barbara: řádek 13 „Zkratka(barbara) ← Zkratka(bara) = ara“; bara řádek 12", () => {
    const b = all.find(
      (s) => s.line === 13 && s.message.includes("Zkratka(barbara)"),
    );
    expect(b?.message).toMatch(/Zkratka\(bara\) = ara/u);
    const a = all.find(
      (s) => s.line === 12 && s.message.includes("Zkratka(bara)"),
    );
    expect(a).toBeDefined();
    const short = all.filter(
      (s) => s.state.phase === "build" && (s.line === 12 || s.line === 13),
    );
    // 4 neprázdné zkratky (obr. 13.2); ostatní stavy mají na ř. 13 „Zkratka(s) ← Zkratka(z) = ∅“
    expect(short.filter((s) => !/= ∅;/u.test(s.message))).toHaveLength(4);
    for (const s of short.filter((s) => /= ∅;/u.test(s.message)))
      expect(s.line).toBe(13);
  });

  it("stavba: zpětná hrana v AcKroku řádek 18, při hledání řádek 12; hlášení řádek 8", () => {
    const s = materialize(acSteps(words, "barbarabaraba", "all"));
    const back = s.filter((x) => x.state.edge?.kind === "back");
    expect(back.length).toBeGreaterThan(0);
    for (const x of back)
      expect(x.line).toBe(x.state.phase === "build" ? 18 : 12);
    const reports = s.filter((x) => x.state.phase === "search" && x.line === 8);
    expect(reports).toHaveLength(10);
    expect(PC_AC_SEARCH[8]).toContain("Ohlásíme");
    expect(PC_AC_BUILD[18]).toContain("Zpět(s)");
    const fin = s[s.length - 1].state;
    expect(fin.count.back).toBe(2);
  });

  it("hlášení po zkratce kreslí zkratku jako procházenou hranu (barbar → bar, barbara → ara)", () => {
    const r = all.filter(
      (s) =>
        s.state.phase === "search" &&
        s.line === 8 &&
        s.state.edge?.kind === "short",
    );
    expect(
      r.map(
        (s) =>
          `${s.state.nodes[s.state.edge!.from].name}→${s.state.nodes[s.state.j!].name}`,
      ),
    ).toEqual(["barbar→bar", "barbara→ara"]);
  });

  it("režim build skončí po stavbě, search začne hledáním (automat bez kroků)", () => {
    const b = materialize(acSteps(words, "barbara", "build"));
    expect(b.every((s) => s.state.phase === "build")).toBe(true);
    expect(b[b.length - 1].message).toMatch(/15 stavů/u);
    const q = materialize(acSteps(words, "barbara", "search"));
    expect(q[0].state.phase).toBe("search");
    expect(q[0].state.known.every(Boolean)).toBe(true);
  });

  it("navazující čtení (from): seno do from bez kroků, krokuje se jen poslední znak", () => {
    const s = materialize(acSteps(words, "barbara", "search", 6));
    expect(s[0].message).toMatch(/přečtené/u);
    expect(s[0].state.out).toHaveLength(2);
    const fin = s[s.length - 1].state;
    expect(fin.out.map((o) => [o.k, words[o.word]])).toEqual(
      AC_SEARCHES.barbara.hits,
    );
    expect(s.filter((x) => x.state.k !== null && x.state.k < 6)).toHaveLength(
      0,
    );
  });

  it("sazba pseudokódu: bez knižních čísel řádků a bez ^( / _(", () => {
    for (const l of [...PC_AC_BUILD, ...PC_AC_SEARCH]) {
      expect(l).not.toMatch(/^\s*\d+\./u);
      expect(l).not.toMatch(/\^\(|_\(/u);
    }
  });
});

describe("AcKonstrukce: zpráva kroku popisuje zvýrazněný řádek", () => {
  const words = ["ara", "bar", "arab", "baraba", "barbara"];
  const b = materialize(acSteps(words, "barbara", "build"));
  const at = (line: number) =>
    b.filter((s) => s.line === line).map((s) => s.message);
  const L = (text: string) => PC_AC_BUILD.findIndex((l) => l.includes(text));
  it("inicializace kořene (ř. Zpět(r) ← ∅) má vlastní krok, fronta (ř. 5) už ne", () => {
    const init = at(L("Zpět(r) ← ∅, Zkratka(r) ← ∅"));
    expect(init).toHaveLength(1);
    expect(init[0]).toMatch(/Zpět\(r\)/);
    for (const m of at(L("Založíme frontu F")))
      expect(m).not.toMatch(/Zpět\(r\)/);
  });
  it("Zpět(s) ← z nenese nastavení zkratky; Zkratka(s) ← Zkratka(z) = ∅ je na svém řádku", () => {
    for (const m of at(L("      Zpět(s) ← z")))
      expect(m).not.toMatch(/Zkratka\(/);
    const copy = at(L("Jinak Zkratka(s) ← Zkratka(z)"));
    expect(copy.some((m) => /= ∅/.test(m))).toBe(true);
  });
});
