/*
 * Model stránky sufixového pole (bez Reactu): příklady z přednášky L05, přechody stránky (reducer)
 * a nabídka operací (ActionMenu).
 */
import { describe, expect, it, vi } from "vitest";
import { initialMenu, prepareGo } from "../../core/actionModel";
import {
  stripZoom,
  stripZoomLimits,
  initialSuffix,
  SUFFIX_EXAMPLES,
  suffixActions,
  suffixCaption,
  suffixReducer,
  withLcp,
  type SuffixCtx,
} from "./pageModel";
import { suffixSteps, type SAState } from "./suffix";

const end = (alpha: string, kind: "build" | "kasai"): SAState => {
  const s = suffixSteps(alpha, { kind });
  return s[s.length - 1].state;
};
const found = (alpha: string, beta: string) => {
  const s = suffixSteps(alpha, { kind: "search", beta });
  return Object.entries(s[s.length - 1].state.rowMarks)
    .filter(([, c]) => c === "row-found")
    .map(([i]) => Number(i))
    .sort((a, b) => a - b);
};
const ex = (id: string) => SUFFIX_EXAMPLES.find((e) => e.id === id)!;

describe("příklady z přednášky L05", () => {
  it("seznam příkladů: nejdřív přednáška (se zdrojem), pak další slova", () => {
    expect(SUFFIX_EXAMPLES.map((e) => e.id)).toEqual([
      "banana",
      "barokoarokoko",
      "bananas",
      "anna",
      "mississippi",
      "abracadabra",
    ]);
    for (const e of SUFFIX_EXAMPLES.slice(0, 4))
      expect(e.source).toMatch(/^Přednáška L05, slide \d+/);
    expect(ex("mississippi").source).toBeNull();
  });

  it("banana (slide 6 a 13): tabulka X, R, L a sloupce R₁, R₂, R₄ jako na slidech", () => {
    const e = ex("banana");
    expect([e.alpha, e.beta]).toEqual(["banana", "ana"]);
    const b = end(e.alpha, "build");
    expect(b.rounds.map((r) => r.k)).toEqual([1, 2, 4]);
    expect(b.rounds[0].R).toEqual([4, 1, 5, 1, 5, 1, 0]);
    expect(b.rounds[1].R).toEqual([4, 2, 5, 2, 5, 1, 0]);
    expect(b.rounds[2].R).toEqual([4, 3, 6, 2, 5, 1, 0]);
    const k = end(e.alpha, "kasai");
    expect(k.X).toEqual([6, 5, 3, 1, 0, 4, 2]);
    expect(k.L).toEqual([0, 1, 3, 0, 0, 2]);
    expect(e.note).toContain("R₈");
  });

  it("barokoarokoko (slide 7): X, R a L přesně podle tabulky na slidu", () => {
    const e = ex("barokoarokoko");
    const k = end(e.alpha, "kasai");
    expect(k.X).toEqual([13, 1, 6, 0, 11, 4, 9, 12, 5, 10, 3, 8, 2, 7]);
    const b = end(e.alpha, "build");
    expect(b.rounds[b.rounds.length - 1].R).toEqual([
      3, 1, 12, 10, 5, 8, 2, 13, 11, 6, 9, 4, 7, 0,
    ]);
    expect(k.L).toEqual([0, 5, 0, 0, 2, 2, 0, 1, 1, 3, 3, 0, 4]);
    expect(found(e.alpha, e.beta)).toEqual([3, 8, 10]);
  });

  it("slide 2: v seně bananas je jehla ana dvakrát, v seně anna vůbec", () => {
    expect(found(ex("bananas").alpha, ex("bananas").beta)).toEqual([1, 3]);
    expect(found(ex("anna").alpha, ex("anna").beta)).toEqual([]);
  });
});

/* ---------------------------------------------------------------- přechody */

describe("přechody stránky (suffixReducer)", () => {
  const start = initialSuffix("banana", "banana");

  it("výchozí stav: postavené α, fáze stavby, bez přehrávání; příklad podle slova", () => {
    expect(start).toMatchObject({
      applied: "banana",
      phase: { kind: "build" },
      lcpFor: null,
      runId: 0,
      example: "banana",
    });
    expect(initialSuffix("abab", null).example).toBeNull();
  });

  it("Postavit převezme text pole, nový běh (runId) a zapomene LCP i příklad", () => {
    const s = suffixReducer(start, {
      type: "run",
      text: "abab",
      next: { kind: "build" },
    });
    expect(s).toMatchObject({
      applied: "abab",
      runId: 1,
      lcpFor: null,
      example: null,
    });
    expect(s.note.text).toBe("");
  });

  it("Kasai nad změněným α nejdřív postaví nové pole a řekne to; hledání pak navazuje se sloupcem L", () => {
    const k = suffixReducer(start, {
      type: "run",
      text: "abab",
      next: { kind: "kasai" },
    });
    expect(k.applied).toBe("abab");
    expect(k.lcpFor).toBe("abab");
    expect(k.note.text).toContain("postavili znovu pro „abab“");
    const s = suffixReducer(k, {
      type: "run",
      text: "abab",
      next: { kind: "search", beta: "ab" },
    });
    expect(withLcp(s)).toBe(true);
    expect(s.runId).toBe(2);
    // hledání po samotné stavbě sloupec L nemá
    const b = suffixReducer(start, {
      type: "run",
      text: "banana",
      next: { kind: "search", beta: "an" },
    });
    expect(withLcp(b)).toBe(false);
    expect(b.example).toBe("banana");
  });

  it("prázdné α se nepostaví: chyba v poznámce, nový běh nevznikne", () => {
    const s = suffixReducer(start, {
      type: "run",
      text: " $ ",
      next: { kind: "build" },
    });
    expect(s.applied).toBe("banana");
    expect(s.runId).toBe(0);
    expect(s.note.error).toBe(true);
  });

  it("načtení příkladu postaví slovo; restart = nový běh (runId), bez něj ne", () => {
    const s = suffixReducer(start, {
      type: "load",
      alpha: "barokoarokoko",
      restart: true,
      example: "barokoarokoko",
    });
    expect(s).toMatchObject({
      applied: "barokoarokoko",
      phase: { kind: "build" },
      runId: 1,
      example: "barokoarokoko",
    });
    const d = suffixReducer(s, {
      type: "load",
      alpha: "banana",
      restart: false,
      example: "banana",
    });
    expect(d.runId).toBe(1);
  });

  it("název běhu u příkladu z přednášky uvede zdroj", () => {
    expect(suffixCaption(start)).toBe(
      "Stavba X zdvojováním: α = „banana“ – Přednáška L05, slide 6 a 13",
    );
    const own = suffixReducer(start, {
      type: "run",
      text: "abab",
      next: { kind: "build" },
    });
    expect(suffixCaption(own)).toBe("Stavba X zdvojováním: α = „abab“");
    const mis = suffixReducer(start, {
      type: "load",
      alpha: "mississippi",
      restart: true,
      example: "mississippi",
    });
    expect(suffixCaption(mis)).toBe("Stavba X zdvojováním: α = „mississippi“");
  });
});

/* ---------------------------------------------------------------- nabídka */

function ctx(over: Partial<SuffixCtx> = {}): SuffixCtx {
  return {
    applied: "banana",
    beta: "ana",
    alphaText: () => "banana",
    run: vi.fn(),
    load: vi.fn(),
    random: vi.fn(),
    now: () => 7,
    ...over,
  };
}

describe("nabídka operací sufixového pole", () => {
  it("akce: Vytvořit (Náhodně), Příklady z knihy, Postavit X(α), LCP pole (Kasai), Hledat(β); Výchozí příklad je tlačítko Visualizeru (CROSS-04, CROSS-07)", () => {
    const all = suffixActions(ctx());
    expect(all.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Příklady z knihy",
      "Postavit X(α)",
      "LCP pole (Kasai)",
      "Hledat(β)",
    ]);
    const create = all[0];
    expect(create.variants!.map((v) => v.label)).toEqual(["Náhodně"]);
    expect(create.variants![0].args!.map((a) => a.name)).toEqual(["len"]);
    const defs = all.slice(2);
    expect(defs[0].args![0]).toMatchObject({
      kind: "text",
      name: "alpha",
      label: "α =",
      default: "banana",
    });
    expect(defs[0].title).toContain("nejvýše 24 znaků");
    expect(defs[2].args![0]).toMatchObject({
      kind: "text",
      name: "beta",
      label: "β =",
      default: "ana",
    });
    // Kasai jde jedním klikem
    expect(defs[1].args ?? []).toEqual([]);
  });

  it("Vytvořit ▸ Náhodně předá semínko z now a délku (stránka nevolá Date.now při vykreslení)", () => {
    const c = ctx();
    suffixActions(c)[0].run({ len: 12 }, "random");
    expect(c.random).toHaveBeenCalledWith(7, 12);
  });

  it("prázdné α / β: Provést zablokované s hláškou; $ a mezery i zkrácení hlásí ⚠ už při psaní (NEWMODS-12)", () => {
    const defs = suffixActions(ctx());
    const build = defs.find((d) => d.id === "build")!;
    const alpha = build.args![0];
    expect(alpha.kind === "text" && alpha.maxLength).toBeGreaterThan(24);
    expect(alpha.check?.("  $ ")).toMatch(/neprázdný/);
    expect(alpha.check?.("banana")).toBeNull();
    expect(alpha.notice?.("ba na$")).toBe("$ a mezery budou vynechány.");
    expect(alpha.notice?.("a".repeat(30))).toBe("Zkráceno na 24 znaků.");
    expect(alpha.notice?.("banana")).toBeNull();
    const beta = defs.find((d) => d.id === "search")!.args![0];
    // prázdné β blokuje vzor pole (hláška „aspoň jeden znak vzorku“)
    expect(beta.kind === "text" && beta.pattern!.test(" $ ")).toBe(false);
    expect(beta.notice?.("a na")).toBe("$ a mezery budou vynechány.");
  });

  it("Postavit a Hledat předají text pole; Kasai vezme aktuální text α", () => {
    const c = ctx({ alphaText: () => "abab" });
    const all = suffixActions(c);
    const st = initialMenu(all);
    const defs = ["build", "kasai", "search"].map((id) =>
      all.find((d) => d.id === id)!,
    );
    const g = prepareGo(defs[0], { ...st, texts: { alpha: "mississippi" } });
    expect(g.ok).toBe(true);
    if (g.ok) defs[0].run(g.values, null);
    expect(c.run).toHaveBeenLastCalledWith("mississippi", { kind: "build" });
    defs[1].run({}, null);
    expect(c.run).toHaveBeenLastCalledWith("abab", { kind: "kasai" });
    const s = prepareGo(defs[2], { ...st, texts: { beta: " s si " } });
    if (s.ok) defs[2].run(s.values, null);
    expect(c.run).toHaveBeenLastCalledWith("abab", {
      kind: "search",
      beta: "ssi",
    });
  });

  it("prázdný vzorek β (jen $ a mezery) zablokuje Hledat s vysvětlením", () => {
    const all = suffixActions(ctx());
    const st = initialMenu(all);
    const defs = ["build", "kasai", "search"].map((id) =>
      all.find((d) => d.id === id)!,
    );
    const g = prepareGo(defs[2], { ...st, texts: { beta: " $ " } });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toContain("aspoň jeden znak");
  });

  it("Příklady: varianta na klik načte slovo i vzorek; zdroj je ve vysvětlivce", () => {
    const c = ctx();
    const d = suffixActions(c).find((x) => x.id === "examples")!;
    expect(d.variants!.map((v) => v.id)).toEqual(
      SUFFIX_EXAMPLES.map((e) => e.id),
    );
    expect(d.variants!.every((v) => !v.args?.length)).toBe(true);
    expect(d.variants![1].title).toContain("Přednáška L05, slide 7");
    d.run({}, "barokoarokoko");
    expect(c.load).toHaveBeenCalledWith(ex("barokoarokoko"));
  });
});

describe("zvětšení kresby na velkém plátně (NEWMODS-09)", () => {
  it("stripZoom: delta 0 = 1, roste s volnou výškou nejvýš 1,6×, nezmenšuje", () => {
    expect(stripZoom(0, 200)).toBe(1);
    expect(stripZoom(100, 200)).toBeCloseTo(1.5, 9);
    expect(stripZoom(10_000, 200)).toBe(1.6);
    expect(stripZoom(-50, 200)).toBe(1);
    expect(stripZoomLimits(200)).toEqual({ shrink: 0, grow: 120 });
  });
});
