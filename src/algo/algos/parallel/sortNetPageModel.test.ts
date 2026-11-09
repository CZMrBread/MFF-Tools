/**
 * Model stránky třídicích sítí bez Reactu: odkaz (?net=t&a=…&lay=seq&x=…&o=h), příklady z knihy
 * (obr. 15.6–15.10, cv. 15.3.6–7), generátory vstupu, nabídka akcí a legenda.
 */
import { describe, expect, it } from "vitest";
import {
  initialMenu,
  prepareGo,
  type ActionDef,
  type MenuState,
} from "../../core/actionModel";
import { isBitonic, isSorted } from "./sortNet";
import {
  adaptToKind,
  autoOrient,
  BOOK_EXAMPLES,
  configFromUrl,
  configToUrl,
  DEFAULT_CONFIG,
  generateInput,
  inputProblem,
  netOf,
  sizeOptions,
  sortNetActions,
  sortNetLegend,
  toggleRemoved,
  type SortNetConfig,
  type SortNetCtx,
} from "./sortNetPageModel";

const params = (s: string) => new URLSearchParams(s);

describe("odkaz", () => {
  it("prázdná adresa = výchozí příklad T₈ na 5, 2, 7, 1, 8, 3, 6, 4", () => {
    const r = configFromUrl(params(""));
    expect(r.notice).toBeNull();
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toMatchObject({
      kind: "t",
      input: [5, 2, 7, 1, 8, 3, 6, 4],
      seq: false,
      removed: [],
      orient: null,
    });
  });

  it("tam a zpět: síť, vstup, zápis, vynechané komparátory (od 1) a orientace", () => {
    const c: SortNetConfig = {
      kind: "bubble",
      input: [5, 2, 4, 1, 3],
      seq: true,
      removed: [2, 6],
      orient: "h",
    };
    const url = configToUrl(c);
    expect(url).toEqual({
      net: "bubble",
      a: "5,2,4,1,3",
      lay: "seq",
      x: "3,7",
      o: "h",
    });
    expect(configFromUrl(params(new URLSearchParams(url).toString()))).toEqual({
      config: c,
      notice: null,
    });
    // výchozí hodnoty se do adresy nepíšou
    expect(configToUrl(DEFAULT_CONFIG)).toEqual({
      net: "t",
      a: "5,2,7,1,8,3,6,4",
    });
  });

  it("neplatný odkaz: hláška a výchozí příklad (nebo platná část)", () => {
    const bad = configFromUrl(params("net=t&a=1,2,3"));
    expect(bad.config.input).toEqual(DEFAULT_CONFIG.input);
    expect(bad.notice).toMatch(/2, 4, 8 nebo 16/);
    const kind = configFromUrl(params("net=xyz"));
    expect(kind.config.kind).toBe("t");
    expect(kind.notice).toMatch(/neznámá síť/);
    // zápis „jak je zapsaná“ jen u bublinky do n = 8; vynechané mimo rozsah se zahodí
    expect(configFromUrl(params("net=t&lay=seq")).config.seq).toBe(false);
    expect(configFromUrl(params("net=t&x=1,99")).config.removed).toEqual([0]);
  });

  it("n bez vstupu: deterministický vstup dané délky (u separátoru a třídičky Bₙ bitonický)", () => {
    const a = configFromUrl(params("net=batcher&n=16")).config.input;
    expect(a.length).toBe(16);
    expect(configFromUrl(params("net=batcher&n=16")).config.input).toEqual(a);
    const b = configFromUrl(params("net=bitonic&n=8")).config.input;
    expect(isBitonic(b)).toBe(true);
  });
});

describe("vstup a přepnutí sítě", () => {
  it("délka vstupu musí sedět se sítí", () => {
    expect(inputProblem("t", [1, 2, 3])).toMatch(/2, 4, 8 nebo 16 čísel/);
    expect(inputProblem("t", [1, 2, 3, 4])).toBeNull();
    expect(inputProblem("bubble", [1])).toMatch(/2 až 16/);
    expect(inputProblem("bubble", [1, 2, 3])).toBeNull();
  });

  it("generátory: náhodně (různá čísla), bitonická, obráceně, nuly a jedničky", () => {
    const r = generateInput("random", 8, 7);
    expect(r.length).toBe(8);
    expect(new Set(r).size).toBe(8);
    expect(isBitonic(generateInput("bitonic", 16, 3))).toBe(true);
    expect(new Set(generateInput("bitonic", 16, 3)).size).toBe(16);
    expect(generateInput("reversed", 4, 0)).toEqual([4, 3, 2, 1]);
    const z = generateInput("zeroOne", 8, 5);
    expect(z.every((v) => v === 0 || v === 1)).toBe(true);
    expect(isSorted(z)).toBe(false);
  });

  it("přepnutí sítě: vstup zůstane, když sedí; jinak nejbližší platné n; Sₙ/Bₙ dostane bitonický vstup", () => {
    const keep = adaptToKind(DEFAULT_CONFIG, "batcher", 1);
    expect(keep.input).toEqual(DEFAULT_CONFIG.input);
    const five: SortNetConfig = {
      ...DEFAULT_CONFIG,
      kind: "bubble",
      input: [5, 2, 4, 1, 3],
    };
    expect(adaptToKind(five, "t", 1).input.length).toBe(8);
    const sep = adaptToKind(DEFAULT_CONFIG, "sep", 1);
    expect(sep.input.length).toBe(8);
    expect(isBitonic(sep.input)).toBe(true);
    // vynechané komparátory a zápis patří ke staré síti
    expect(
      adaptToKind({ ...five, seq: true, removed: [1] }, "bubble", 1),
    ).toMatchObject({ removed: [], seq: true });
    expect(adaptToKind({ ...five, removed: [1] }, "t", 1).removed).toEqual([]);
  });

  it("vynechání komparátoru se přepíná", () => {
    expect(toggleRemoved([], 3)).toEqual([3]);
    expect(toggleRemoved([1, 3], 3)).toEqual([1]);
    expect(toggleRemoved([5], 1)).toEqual([1, 5]);
  });

  it("orientace: svisle jako v knize do n = 8, větší sítě vodorovně", () => {
    expect(autoOrient(8)).toBe("v");
    expect(autoOrient(16)).toBe("h");
  });

  it("netOf: „jak je zapsaná“ jen bublinka do n = 8", () => {
    expect(netOf({ ...DEFAULT_CONFIG, kind: "bubble", seq: true }).seq).toBe(
      true,
    );
    expect(
      netOf({
        ...DEFAULT_CONFIG,
        kind: "bubble",
        seq: true,
        input: generateInput("random", 16, 1),
      }).seq,
    ).toBe(false);
  });
});

describe("příklady z knihy", () => {
  it("obrázky 15.6–15.10 a cvičení 15.3.6–7, každý s platným vstupem", () => {
    expect(BOOK_EXAMPLES.map((e) => e.id)).toEqual([
      "fig15.6",
      "fig15.7",
      "fig15.8",
      "fig15.9",
      "fig15.10",
      "ex15.3.6",
      "ex15.3.7",
    ]);
    for (const e of BOOK_EXAMPLES) {
      expect(inputProblem(e.config.kind, e.config.input), e.id).toBeNull();
      expect(e.label).toMatch(/^(Obr\. 15\.\d+|Cv\. 15\.3\.\d)/);
    }
    const f = (id: string) => BOOK_EXAMPLES.find((e) => e.id === id)!.config;
    expect(f("fig15.6")).toMatchObject({ kind: "bubble", seq: true });
    expect(f("fig15.6").input.length).toBe(5);
    expect(f("fig15.7")).toMatchObject({ kind: "bubble", seq: false });
    expect(f("fig15.10")).toMatchObject({
      kind: "sep",
      input: [4, 5, 7, 8, 6, 3, 1, 2],
    });
    expect(f("fig15.8").kind).toBe("bitonic");
    expect(isBitonic(f("fig15.8").input)).toBe(true);
    expect(f("fig15.9")).toEqual(DEFAULT_CONFIG);
    expect(f("ex15.3.6").input.every((v) => v === 0 || v === 1)).toBe(true);
    expect(f("ex15.3.7").kind).toBe("batcher");
  });
});

describe("nabídka akcí", () => {
  function setup(config: SortNetConfig = DEFAULT_CONFIG) {
    const calls: { type: string; arg?: unknown }[] = [];
    const ctx: SortNetCtx = {
      config,
      apply: (c) => calls.push({ type: "apply", arg: c }),
      note: (text) => calls.push({ type: "note", arg: text }),
      verify: () => calls.push({ type: "verify" }),
      seed: () => 42,
    };
    const defs = sortNetActions(ctx);
    const go = (id: string, st: Partial<MenuState> = {}) => {
      const def = defs.find((d) => d.id === id) as ActionDef;
      const menu = { ...initialMenu(defs), ...st };
      const r = prepareGo(def, menu);
      if (!r.ok) throw new Error(r.reason);
      def.run(r.values, r.variant);
    };
    return { defs, calls, go };
  }

  it("pořadí: Vytvořit, Příklady z knihy, spuštění sítě, Síť, 0-1 princip, Vynechat(c); Výchozí příklad je tlačítko Visualizeru (CROSS-04)", () => {
    expect(setup().defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Příklady z knihy",
      "T₈(P)",
      "Síť",
      "Ověřit 0-1 principem",
      "Vynechat(c)",
    ]);
  });

  it("Vytvořit ▸ Vlastní P spustí síť na P; špatná délka = chyba pole (akce se neprovede, nic se nevolá)", () => {
    const s = setup();
    s.go("create", { texts: { P: "8, 7, 6, 5" } });
    expect(s.calls).toEqual([
      { type: "apply", arg: { ...DEFAULT_CONFIG, input: [8, 7, 6, 5] } },
    ]);
    const t = setup();
    expect(() => t.go("create", { texts: { P: "1, 2, 3" } })).toThrow(
      /2, 4, 8 nebo 16 čísel.*zadáno 3/,
    );
    expect(t.calls).toEqual([]);
  });

  it("Vytvořit ▸ Náhodně s volbou n; spuštění sítě znovu na stejném vstupu (nový běh)", () => {
    const s = setup();
    s.go("create", {
      variant: { create: "random", net: "t" },
      texts: { n: "16" },
    });
    const c = s.calls[0].arg as SortNetConfig;
    expect(c.input.length).toBe(16);
    const r = setup();
    r.go("run");
    expect(r.calls[0]).toEqual({ type: "apply", arg: DEFAULT_CONFIG });
    expect(r.calls[0].arg).not.toBe(DEFAULT_CONFIG.input);
  });

  it("Síť ▸ varianta přepne druh sítě; Vynechat(c) bere číslo komparátoru 1 … velikost", () => {
    const s = setup();
    s.go("net", { variant: { create: "custom", net: "batcher" } });
    expect((s.calls[0].arg as SortNetConfig).kind).toBe("batcher");
    const r = setup();
    r.go("remove", { texts: { c: "5" } });
    expect((r.calls[0].arg as SortNetConfig).removed).toEqual([4]);
    const def = r.defs.find((d) => d.id === "remove")!;
    expect(def.args?.[0]).toMatchObject({ kind: "int", min: 1, max: 24 });
  });

  it("volby n podle sítě", () => {
    expect(sizeOptions("t")).toEqual([4, 8, 16]);
    expect(sizeOptions("bubble")).toEqual([4, 5, 8, 16]);
  });

  it("Ověřit 0-1 principem zavolá kontrolu", () => {
    const s = setup();
    s.go("zeroOne");
    expect(s.calls).toEqual([{ type: "verify" }]);
  });
});

describe("legenda", () => {
  it("jen třídy, které se kreslí: 0/1, hora a údolí, vynechaný komparátor", () => {
    const cls = (c: SortNetConfig) => sortNetLegend(c).map((l) => l.cls);
    expect(cls(DEFAULT_CONFIG)).toEqual(["sw-compare", "sw-removed", "sw-new"]);
    expect(cls({ ...DEFAULT_CONFIG, input: [0, 1, 1, 0] })).toContain(
      "sw-wire1",
    );
    expect(
      cls({ ...DEFAULT_CONFIG, kind: "sep", input: [4, 5, 7, 8, 6, 3, 1, 2] }),
    ).toEqual(["sw-compare", "sw-removed", "sw-orange", "sw-teal"]);
    expect(cls({ ...DEFAULT_CONFIG, removed: [1] })).toContain("sw-seen");
  });
});
