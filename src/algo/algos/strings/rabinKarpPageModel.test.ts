// Model stránky Rabin–Karp bez Reactu: odkaz ?j=&s=&p=&n=, přechody, nabídka operací, náhodný vstup.
import { describe, expect, it } from "vitest";
import {
  initialMenu,
  prepareGo,
  validateArg,
  type ActionDef,
} from "../../core/actionModel";
import { gcd, rkRun } from "./rabinKarp";
import {
  initialRk,
  randomRk,
  rkActions,
  rkCaption,
  rkReducer,
  rkUrl,
  rkZoom,
  rkZoomLimits,
  RK_ZOOM_BASE,
  RK_ZOOM_MAX,
  type RkCtx,
} from "./rabinKarpPageModel";

const noop = () => {};
const ctx = (over: Partial<RkCtx> = {}): RkCtx => ({
  needle: "kokos",
  text: "clanekokokosu",
  P: 31,
  N: 101,
  search: noop,
  load: noop,
  random: noop,
  now: () => 1,
  ...over,
});
const ids = (defs: ActionDef[]) => defs.map((d) => d.id);

describe("výchozí stav a odkaz", () => {
  it("bez parametrů: kokos v clanekokokosu, P = 31, N = 101 (bez kolize)", () => {
    const r = initialRk({});
    expect([r.needle, r.text, r.P, r.N, r.example]).toEqual([
      "kokos",
      "clanekokokosu",
      31,
      101,
      "kokos101",
    ]);
    expect(rkCaption(r)).toContain("bez kolize");
  });

  it("?j=&s=&p=&n= předvyplní všechna čtyři pole; odkaz na N = 17 pozná předvolbu s falešnou shodou", () => {
    const r = initialRk({ j: "kokos", s: "clanekokokosu", p: "31", n: "17" });
    expect([r.P, r.N, r.example]).toEqual([31, 17, "kokos17"]);
    expect(rkCaption(r)).toContain("falešná shoda");
    expect(rkUrl(r)).toEqual({
      j: "kokos",
      s: "clanekokokosu",
      p: "31",
      n: "17",
    });
  });

  it("neplatné p / n / text z odkazu → výchozí hodnoty s poznámkou", () => {
    const r = initialRk({ j: "kočka", s: "abc", p: "x", n: "1" });
    expect([r.needle, r.P, r.N]).toEqual(["kokos", 31, 101]);
    expect(r.note.text).toMatch(/P/);
    expect(r.note.text).toMatch(/N/);
  });
});

describe("rkReducer", () => {
  const r0 = initialRk({});
  it("Hledat: vyčistí text (velká písmena – hlásí formulář), nové runId, poznámka k malému N", () => {
    const r = rkReducer(r0, {
      type: "search",
      needle: "ANA",
      text: "bananas",
      P: 31,
      N: 13,
    });
    expect([r.needle, r.N, r.runId, r.example]).toEqual([
      "ana",
      13,
      1,
      "bananas13",
    ]);
    expect(r.note.text).not.toContain("malá");
    expect(r.note.text).toContain("falešné shody");
    const search = rkActions(ctx()).find((d) => d.id === "search")!;
    const iota = search.args!.find((a) => a.name === "needle")!;
    expect(validateArg(iota, "ANA").note).toContain("malá");
  });

  it("znaky mimo a–z jsou chyba a nic nespustí", () => {
    const r = rkReducer(r0, {
      type: "search",
      needle: "kočka",
      text: "abc",
      P: 31,
      N: 101,
    });
    expect(r.runId).toBe(0);
    expect(r.note.error).toBe(true);
  });

  it("soudělné P, N se spustí jako jediný chybový krok (kroky to oznámí) a poznámka je chyba", () => {
    const r = rkReducer(r0, {
      type: "search",
      needle: "ana",
      text: "bananas",
      P: 26,
      N: 13,
    });
    expect(r.runId).toBe(1);
    expect(r.note.error).toBe(true);
    expect(r.note.text).toContain("nesoudělná");
  });
});

describe("nabídka operací", () => {
  it("Vytvořit, Příklady z knihy, Hledat(ι, σ) s argumenty ι, σ, P, N", () => {
    const defs = rkActions(ctx());
    expect(ids(defs)).toEqual(["create", "book", "search"]);
    const search = defs.find((d) => d.id === "search")!;
    expect(search.label).toBe("Hledat(ι, σ)");
    expect(search.args!.map((a) => a.name)).toEqual([
      "needle",
      "text",
      "P",
      "N",
    ]);
    const calls: unknown[] = [];
    const d2 = rkActions(ctx({ search: (...a) => calls.push(a) }));
    const go = prepareGo(d2[2], initialMenu(d2));
    expect(go.ok).toBe(true);
    if (go.ok) d2[2].run(go.values, go.variant);
    expect(calls).toEqual([["kokos", "clanekokokosu", 31, 101]]);
  });

  it("Příklady: bez kolize, falešná shoda, bananas, nejhorší případ, N = 2", () => {
    const book = rkActions(ctx()).find((d) => d.id === "book")!;
    expect(book.variants!.map((v) => v.id)).toEqual([
      "kokos101",
      "kokos17",
      "bananas13",
      "worst",
      "tiny",
    ]);
  });

  it("Náhodně: ι délky 3, σ délky 24 nad {a, b, c} s výskytem, N ∈ {7, 11, 13} nesoudělné s P", () => {
    for (let seed = 1; seed < 50; seed++) {
      const x = randomRk(seed);
      expect(x.needle).toMatch(/^[abc]{3}$/);
      expect(x.text).toMatch(/^[abc]{24}$/);
      expect([7, 11, 13]).toContain(x.N);
      expect(gcd(x.P, x.N)).toBe(1);
      expect(rkRun(x.needle, x.text, x.P, x.N).found.length).toBeGreaterThan(0);
    }
  });
});

describe("jednotné akce (CROSS-04)", () => {
  it("Vytvořit první, Příklady z knihy hned za ním; Výchozí příklad není varianta ani akce (je pod akcemi)", () => {
    const defs = rkActions(ctx());
    expect(defs[0].id).toBe("create");
    expect(defs[1].label).toBe("Příklady z knihy");
    const all = defs.flatMap((d) => [
      d.label,
      ...(d.variants ?? []).map((v) => v.label),
    ]);
    expect(all).not.toContain("Výchozí příklad");
  });
});

describe("zvětšení pásu na velkém plátně (E6: ≥ 55 % výšky plátna při 1920 × 1080)", () => {
  it("pás roste nad dřívějších 1,6× (jinak zabíral jen polovinu plátna), nejvýš RK_ZOOM_MAX; nezmenšuje se", () => {
    expect(RK_ZOOM_MAX).toBeGreaterThanOrEqual(2.2);
    expect(rkZoom(0)).toBe(1);
    expect(rkZoom(-50)).toBe(1);
    expect(rkZoom(RK_ZOOM_BASE)).toBe(2);
    expect(rkZoom(1e6)).toBe(RK_ZOOM_MAX);
    expect(rkZoomLimits()).toEqual({
      shrink: 0,
      grow: Math.round(RK_ZOOM_BASE * (RK_ZOOM_MAX - 1)),
    });
  });
});
