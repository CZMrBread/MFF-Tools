// Stránka Sčítačka – čistá logika: doplnění vstupu, odkaz ↔ konfigurace, přepnutí bitu, Vytvořit
// (náhodně, desítkově, nejhorší přenos), příklady z knihy, nabídka akcí, hloubka.
import { describe, expect, it } from "vitest";
import { FIG_15_4 } from "./adderBook.fixtures";
import {
  adderActions,
  adderLegend,
  ADDER_LEGEND,
  BOOK_EXAMPLES,
  configFromUrl,
  configToUrl,
  DEFAULT_CONFIG,
  decimalPair,
  depthText,
  exampleOf,
  normalizePair,
  randomPair,
  toggleBit,
  worstCarry,
  type AdderConfig,
  type AdderHandlers,
} from "./adderPageModel";

const url = (s: string) => new URLSearchParams(s);

describe("vstup", () => {
  it("doplnění zleva nulami na mocninu dvou (nejméně 4): 101 + 11 → 0101 + 0011", () => {
    expect(normalizePair("101", "11")).toEqual({
      x: "0101",
      y: "0011",
      n: 4,
      padded: true,
    });
    expect(normalizePair("1", "000001001")).toMatchObject({
      n: 16,
      x: "0000000000000001",
    });
    expect(normalizePair(FIG_15_4.x, FIG_15_4.y)).toMatchObject({
      n: 8,
      padded: false,
    });
  });

  it("jiné znaky, prázdný vstup a víc než 16 bitů odmítne", () => {
    expect(normalizePair("102", "1")).toHaveProperty("error");
    expect(normalizePair("", "1")).toHaveProperty("error");
    expect(normalizePair("1".repeat(17), "1")).toHaveProperty("error");
  });

  it("výchozí příklad = obr. 15.4, obě sčítačky; dá prázdnou adresu", () => {
    expect(DEFAULT_CONFIG).toEqual({
      x: FIG_15_4.x,
      y: FIG_15_4.y,
      mode: "both",
      pq: false,
    });
    expect(configToUrl(DEFAULT_CONFIG)).toEqual({});
    expect(configFromUrl(url(""))).toEqual({
      config: DEFAULT_CONFIG,
      notice: null,
    });
  });

  it("odkaz ↔ konfigurace (x, y, m, pq)", () => {
    const c: AdderConfig = { x: "1011", y: "0110", mode: "par", pq: true };
    const u = configToUrl(c);
    expect(u).toEqual({ x: "1011", y: "0110", m: "par", pq: "1" });
    expect(configFromUrl(url(new URLSearchParams(u).toString()))).toEqual({
      config: c,
      notice: null,
    });
    expect(configToUrl({ ...DEFAULT_CONFIG, mode: "school" })).toEqual({
      m: "school",
    });
    // kratší y se doplní, chybějící y = 0
    expect(configFromUrl(url("x=1101&y=1")).config).toMatchObject({
      x: "1101",
      y: "0001",
    });
    expect(configFromUrl(url("x=11")).config).toMatchObject({
      x: "0011",
      y: "0000",
    });
  });

  it("vadný odkaz → výchozí příklad a hláška", () => {
    const r = configFromUrl(url("x=12&y=1"));
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.notice).toMatch(/nešel použít.*výchozí příklad/);
    const m = configFromUrl(url("m=xyz"));
    expect(m.config.mode).toBe("both");
    expect(m.notice).toMatch(/režim/);
  });

  it("přepnutí bitu řádu i (x₀ = vpravo)", () => {
    const c = toggleBit(DEFAULT_CONFIG, "x", 0);
    expect(c.x).toBe("01110101");
    expect(toggleBit(c, "y", 7).y).toBe("10111011");
    expect(c.y).toBe(DEFAULT_CONFIG.y);
  });

  it("Vytvořit: náhodně n bitů, desítkově (0 … 65535), nejhorší přenos 0111…1 + 0…01", () => {
    const r = randomPair(16, () => 0.99);
    expect(r.x).toHaveLength(16);
    expect(r.x).toMatch(/^[01]+$/);
    expect(randomPair(4, () => 0).x).toBe("0000");
    expect(decimalPair(116, 59)).toMatchObject({
      x: FIG_15_4.x,
      y: FIG_15_4.y,
      n: 8,
    });
    expect(decimalPair(65535, 1)).toMatchObject({ n: 16 });
    expect(decimalPair(3, 1)).toMatchObject({ x: "0011", y: "0001", n: 4 });
    expect(worstCarry(8)).toEqual({ x: "01111111", y: "00000001" });
  });

  it("příklady z knihy: obr. 15.4, jednobitové bloky (s. 388) a obr. 15.3 (školně)", () => {
    expect(BOOK_EXAMPLES.map((e) => e.label)).toEqual([
      "Obr. 15.4 Průběh paralelního sčítání (n = 8)",
      "Obr. 15.3 Školní sčítání (vstup z obr. 15.4)",
      "Jednobitové bloky (s. 388): 0011 + 0101",
    ]);
    expect(exampleOf(DEFAULT_CONFIG)?.id).toBe("fig15-4");
    expect(exampleOf({ ...DEFAULT_CONFIG, mode: "school" })?.id).toBe(
      "fig15-3",
    );
    expect(exampleOf({ ...DEFAULT_CONFIG, x: "00000000" })).toBeUndefined();
  });

  it("hloubka obou sčítaček pro n", () => {
    expect(depthText(8)).toBe(
      "školní 8 hladin (Θ(n)) · paralelní 2·log₂ 8 + 3 = 9 hladin (Θ(log n))",
    );
    expect(depthText(16)).toContain("= 11 hladin");
  });

  it("legenda používá jen existující vzorky; školní režim bez vzorků tabulky bloků", () => {
    for (const l of ADDER_LEGEND) expect(l.cls).toMatch(/^sw-/);
    expect(adderLegend("both")).toBe(ADDER_LEGEND);
    const school = adderLegend("school").map((l) => l.label);
    expect(school).not.toContain("blok kopíruje přenos");
    expect(school).toContain("krabička Σ, která právě počítá");
  });
});

describe("nabídka akcí", () => {
  const calls: unknown[][] = [];
  const h: AdderHandlers = {
    add: (x, y) => calls.push(["add", x, y]),
    random: (n) => calls.push(["random", n]),
    decimal: (a, b) => calls.push(["decimal", a, b]),
    worst: (n) => calls.push(["worst", n]),
    example: (id) => calls.push(["example", id]),
    mode: (m) => calls.push(["mode", m]),
  };
  const defs = adderActions(DEFAULT_CONFIG, h);
  const def = (id: string) => defs.find((d) => d.id === id)!;

  it("pořadí akcí jako jinde: Vytvořit, Příklady z knihy, Sečíst(x, y), Režim (CROSS-06)", () => {
    expect(defs.map((d) => d.id)).toEqual(["create", "book", "add", "mode"]);
  });

  it("Sečíst(x, y) s poli x a y (0 a 1, nejvýš 16 bitů)", () => {
    expect(def("add").label).toBe("Sečíst(x, y)");
    const [ax, ay] = def("add").args!;
    expect(ax).toMatchObject({ kind: "text", name: "x", default: FIG_15_4.x });
    expect(ay).toMatchObject({ kind: "text", name: "y", default: FIG_15_4.y });
    const re = (ax as { pattern: RegExp }).pattern;
    expect(re.test("0101")).toBe(true);
    expect(re.test("1".repeat(17))).toBe(false);
    expect(re.test("12")).toBe(false);
    def("add").run({ x: " 101 ", y: "11" }, null);
    expect(calls.pop()).toEqual(["add", "101", "11"]);
  });

  it("Vytvořit, Příklady z knihy a Režim volají obsluhy", () => {
    expect(def("create").variants!.map((v) => v.label)).toEqual([
      "Náhodně",
      "Desítkově",
      "Nejhorší přenos",
    ]);
    def("create").run({ n: "16" }, "random");
    expect(calls.pop()).toEqual(["random", 16]);
    def("create").run({ a: 116, b: 59 }, "decimal");
    expect(calls.pop()).toEqual(["decimal", 116, 59]);
    def("create").run({ nw: "8" }, "worst");
    expect(calls.pop()).toEqual(["worst", 8]);
    def("book").run({}, "fig15-3");
    expect(calls.pop()).toEqual(["example", "fig15-3"]);
    expect(def("mode").variants!.map((v) => v.label)).toEqual([
      "Obě souběžně",
      "Paralelní (obr. 15.4)",
      "Školní (obr. 15.3)",
    ]);
    def("mode").run({}, "par");
    expect(calls.pop()).toEqual(["mode", "par"]);
  });
});
