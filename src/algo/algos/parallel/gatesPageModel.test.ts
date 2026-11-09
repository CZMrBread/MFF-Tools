// Stránka Hradlové sítě – čistá logika: odkaz (net / c / p / in), bity vstupů, akce nabídky.
import { describe, expect, it, vi } from "vitest";
import { materialize } from "../../core/steps";
import {
  circuitSteps,
  structureKey,
  validateCircuit,
  type Bit,
  type Circuit,
} from "./circuit";
import { autoLayout } from "../../views/circuitLayout";
import { majority, orChain, orTree } from "./circuitPresets";
import { encodePositions } from "./circuitPositions";
import { parseCircuitText } from "./circuitText";
import { gatesActionDefs, type GatesHandlers } from "./gatesActions";
import {
  bitsText,
  gatesFromParams,
  gatesParams,
  nextBits,
  normalizeBits,
  summaryText,
  toggleBit,
} from "./gatesPageModel";

const P = (s: string) => new URLSearchParams(s);

describe("odkaz → síť a vstupy", () => {
  it("prázdná adresa = obr. 15.1 se vstupy x = 1, y = 0, z = 1 (jako v návrhu)", () => {
    const g = gatesFromParams(P(""));
    expect(structureKey(g.circuit)).toBe(structureKey(majority()));
    expect(g.circuit.nodes).toEqual(majority().nodes);
    expect(g.net).toEqual({ id: "maj" });
    expect(bitsText(g.circuit, g.bits)).toBe("101");
    expect(g.problem).toBeNull();
  });

  it("net + n + in", () => {
    const g = gatesFromParams(P("net=or-tree&n=4&in=0010"));
    expect(structureKey(g.circuit)).toBe(structureKey(orTree(4)));
    expect(g.net).toEqual({ id: "or-tree", n: 4 });
    expect(bitsText(g.circuit, g.bits)).toBe("0010");
    const c = gatesFromParams(P("net=or-chain&n=6"));
    expect(structureKey(c.circuit)).toBe(structureKey(orChain(6)));
    expect(bitsText(c.circuit, c.bits)).toBe("000000");
  });

  it("vlastní síť textem c=…; s p=… zdědí kresbu předlohy", () => {
    const g = gatesFromParams(P("c=in a, b; G = nand(a, b); out q = G&in=11"));
    expect(g.circuit.nodes.map((n) => n.id)).toEqual(["a", "b", "G", "q"]);
    expect(g.net).toBeUndefined();
    expect(bitsText(g.circuit, g.bits)).toBe("11");
    const text =
      "in x, y, z; A1 = and(y, x); A2 = and(x, z); A3 = and(z, y); O1 = or(A1, A2); O2 = xor(O1, A3); out q = O2";
    const h = gatesFromParams(P(`c=${encodeURIComponent(text)}&p=maj`));
    expect(h.circuit.nodes.find((n) => n.id === "O2")).toMatchObject({
      fn: "xor",
      x: 318,
      y: 120,
    });
    expect(h.layoutFrom).toBe("maj");
  });

  it("vadný odkaz: výchozí příklad + srozumitelná poznámka (adresa se nepřepisuje)", () => {
    const g = gatesFromParams(
      P("c=in a; G = and(a, G2); G2 = not(G); out q = G2"),
    );
    expect(structureKey(g.circuit)).toBe(structureKey(majority()));
    expect(g.problem).toMatch(/^Síť z odkazu nešla použít: .*cyklus/);
    const n = gatesFromParams(P("net=nic"));
    expect(n.problem).toMatch(/neznámá síť „nic“/);
    const t = gatesFromParams(P("net=or-tree&n=6"));
    expect(t.problem).toMatch(/mocnina dvou/);
  });

  it("vstupy z odkazu: kratší doplní nulami, delší ořízne, jiné znaky = výchozí; vždy s poznámkou", () => {
    const a = gatesFromParams(P("in=1"));
    expect(bitsText(a.circuit, a.bits)).toBe("100");
    expect(a.problem).toMatch(/3 bity/);
    const b = gatesFromParams(P("in=11011"));
    expect(bitsText(b.circuit, b.bits)).toBe("110");
    const c = gatesFromParams(P("in=1x1"));
    expect(bitsText(c.circuit, c.bits)).toBe("101");
    expect(c.problem).toMatch(/jen 0 a 1/);
  });
});

describe("síť → odkaz", () => {
  it("výchozí příklad = prázdná adresa; knižní síť = net, jinak c (+ p)", () => {
    const g = gatesFromParams(P(""));
    expect(gatesParams(g.circuit, g.net, g.layoutFrom, g.bits)).toEqual({});
    expect(
      gatesParams(g.circuit, g.net, g.layoutFrom, { x: 0, y: 1, z: 1 }),
    ).toEqual({ net: "maj", in: "011" });
    const t = gatesFromParams(P("net=or-tree&n=4&in=0010"));
    expect(gatesParams(t.circuit, t.net, t.layoutFrom, t.bits)).toEqual({
      net: "or-tree",
      n: "4",
      in: "0010",
    });
    const changed = {
      ...g.circuit,
      nodes: g.circuit.nodes
        .filter((n) => n.id !== "A3")
        .map((n) => (n.id === "O2" ? { ...n, inputs: ["O1", "z"] } : n)),
    };
    const out = gatesParams(changed, g.net, g.layoutFrom, g.bits);
    expect(out.net).toBeUndefined();
    expect(out.p).toBe("maj");
    expect(out.c).toBe(
      "in x, y, z; A1 = and(y, x); A2 = and(x, z); O1 = or(A1, A2); O2 = or(O1, z); out q = O2",
    );
    // odkaz jde zpět přečíst
    const back = gatesFromParams(new URLSearchParams(out));
    expect(structureKey(back.circuit)).toBe(structureKey(changed));
    expect(back.circuit.nodes.find((n) => n.id === "O1")).toMatchObject({
      x: 212,
      y: 40,
    });
  });
});

describe("polohy vrcholů v odkazu (xy=)", () => {
  const move = (c: Circuit, id: string, dx: number, dy: number): Circuit => ({
    ...c,
    nodes: c.nodes.map((n) => {
      if (n.id !== id) return n;
      const m = { ...n, x: n.x + dx, y: n.y + dy };
      delete m.bus;
      return m;
    }),
  });
  const reopen = (out: Record<string, string>) =>
    gatesFromParams(new URLSearchParams(new URLSearchParams(out).toString()));

  it("neposunutá síť odkaz nemění (bez xy=): výchozí, knižní, parametrická, vlastní c=", () => {
    for (const q of [
      "",
      "net=xor-nand",
      "net=or-tree&n=16",
      "net=or-chain&n=5&in=10101",
      "c=in a, b; G = nor(a, b); out q = G",
      "c=in x, y, z; A1 = and(y, x); A2 = and(x, z); O1 = or(A1, A2); O2 = or(O1, z); out q = O2&p=maj",
    ]) {
      const g = gatesFromParams(P(q));
      expect(
        gatesParams(g.circuit, g.net, g.layoutFrom, g.bits),
      ).not.toHaveProperty("xy");
    }
  });

  it("posunuté hradlo výchozího příkladu: net=maj + xy=, odkaz v novém okně = stejné polohy", () => {
    const g = gatesFromParams(P(""));
    const c = move(g.circuit, "A2", 40, -20);
    const out = gatesParams(c, g.net, g.layoutFrom, g.bits);
    expect(out).toEqual({ net: "maj", xy: encodePositions(c) });
    const back = reopen(out);
    expect(back.circuit).toEqual(c);
    expect(back.net).toEqual({ id: "maj" });
    expect(back.problem).toBeNull();
    // a znovu do odkazu – stejný odkaz
    expect(
      gatesParams(back.circuit, back.net, back.layoutFrom, back.bits),
    ).toEqual(out);
  });

  it("posun spolu se vstupy: net, in i xy", () => {
    const g = gatesFromParams(P("net=or-chain&n=3&in=010"));
    const c = move(g.circuit, "O1", 20, 0);
    const out = gatesParams(c, g.net, g.layoutFrom, g.bits);
    expect(out).toMatchObject({ net: "or-chain", n: "3", in: "010" });
    const back = reopen(out);
    expect(back.circuit).toEqual(c);
    expect(bitsText(back.circuit, back.bits)).toBe("010");
  });

  it("tok shora dolů (or stromem) přežije i vlastní síť bez předlohy", () => {
    const t = gatesFromParams(P("net=or-tree&n=4"));
    const c = move(t.circuit, "O3", -40, 20);
    const out = gatesParams(c, t.net, t.layoutFrom, t.bits);
    expect(out.xy?.startsWith("d")).toBe(true);
    expect(reopen(out).circuit).toEqual(c);
    // úprava struktury → c= bez p; kresba i tok z xy
    const changed: Circuit = {
      ...c,
      nodes: c.nodes.map((n) => (n.id === "O3" ? { ...n, fn: "xor" } : n)),
    };
    const o2 = gatesParams(changed, undefined, undefined, t.bits);
    expect(o2.c).toBeDefined();
    const back = reopen(o2);
    expect(back.circuit.flow).toBe("down");
    expect(back.circuit.nodes).toEqual(changed.nodes);
  });

  it("nakreslená síť (c= bez předlohy) nese polohy; starý odkaz bez xy= se rozvrhne automaticky", () => {
    const c: Circuit = {
      flow: "right",
      nodes: [
        { id: "a", kind: "in", inputs: [], x: 0, y: 0 },
        { id: "b", kind: "in", inputs: [], x: 0, y: 100 },
        { id: "G", kind: "gate", fn: "nor", inputs: ["a", "b"], x: 220, y: 60 },
        { id: "q", kind: "out", inputs: ["G"], x: 340, y: -20 },
      ],
    };
    const out = gatesParams(c, undefined, undefined, { a: 0, b: 1 });
    expect(out.c).toBe("in a, b; G = nor(a, b); out q = G");
    expect(out.xy).toBe("0.0_0.100_220.60_340.-20");
    expect(reopen(out).circuit.nodes).toEqual(c.nodes);
    const text = "in a, b; G = nor(a, b); out q = G";
    const old = gatesFromParams(P(`c=${encodeURIComponent(text)}`));
    expect(old.circuit).toEqual(
      autoLayout({ ...parseCircuitText(text).circuit, flow: "right" }, "right"),
    );
  });

  it.each([
    "xy=nesmysl",
    "xy=0.0_1.1",
    "xy=1e9.0",
    "xy=" + "0.0_".repeat(9) + "0.0",
    "xy=%E2%9C%93",
  ])(
    "vadné xy= (%s) se ignoruje: síť jako bez něj, poznámka, nic nespadne",
    (q) => {
      const g = gatesFromParams(P(`net=maj&${q}`));
      expect(g.circuit).toEqual(majority());
      expect(g.problem).toMatch(/Polohy vrcholů z odkazu/);
      expect(bitsText(g.circuit, g.bits)).toBe("101");
    },
  );

  it("xy= u odkazu, který nešel použít, se nepoužije (výchozí příklad jako v knize)", () => {
    const c = move(majority(), "A2", 40, -20);
    const g = gatesFromParams(
      P(`c=in a; G = andd(a, a)&xy=${encodePositions(c)}`),
    );
    expect(g.circuit).toEqual(majority());
    expect(g.problem).toMatch(/^Síť z odkazu nešla použít/);
  });

  it("špatné in= i vadné xy=: poznámka ke vstupům má přednost", () => {
    const g = gatesFromParams(P("net=maj&in=1&xy=zz"));
    expect(g.problem).toMatch(/3 bity/);
  });
});

describe("bity vstupů", () => {
  const c = majority();
  it("přepnutí jednoho vstupu, další vstup binárně +1 (cyklicky), doplnění chybějících", () => {
    const b: Record<string, Bit> = { x: 1, y: 0, z: 1 };
    expect(toggleBit(b, "y")).toEqual({ x: 1, y: 1, z: 1 });
    expect(bitsText(c, nextBits(c, b))).toBe("110");
    expect(bitsText(c, nextBits(c, { x: 1, y: 1, z: 1 }))).toBe("000");
    expect(normalizeBits(c, { x: 1, w: 1 })).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("souhrn: hloubka (vrstvy S₀…Sₖ) a velikost (hradla) – i u neúplné sítě", () => {
    expect(summaryText(c)).toBe("hloubka 5 vrstev (S₀…S₄) · velikost 5 hradel");
    const broken = {
      ...c,
      nodes: c.nodes.map((n) =>
        n.id === "O2" ? { ...n, inputs: ["O1", null] } : n,
      ),
    };
    expect(summaryText(broken)).toBe(
      "hloubka 5 vrstev (S₀…S₄) · velikost 5 hradel",
    );
    expect(summaryText({ nodes: [] })).toBe("prázdná síť");
  });
});

describe("nabídka akcí", () => {
  const handlers = (): GatesHandlers => ({
    simulate: vi.fn(),
    next: vi.fn(),
    loadPreset: vi.fn(),
    build: vi.fn(),
    custom: vi.fn(),
    empty: vi.fn(),
  });
  const c = majority();
  const bits: Record<string, Bit> = { x: 1, y: 0, z: 1 };

  it("pořadí akcí jako jinde: Vytvořit, Příklady z knihy, pak Spočítat(vstupy) a Další vstup (CROSS-06)", () => {
    const defs = gatesActionDefs(c, bits, validateCircuit(c), handlers());
    expect(defs.map((d) => d.label)).toEqual([
      "Vytvořit",
      "Příklady z knihy",
      "Spočítat(vstupy)",
      "Další vstup",
    ]);
    const sim = defs.find((d) => d.id === "sim")!;
    const arg = sim.args![0];
    expect(arg).toMatchObject({ kind: "text", name: "bits", default: "101" });
    if (arg.kind !== "text") throw new Error();
    expect(arg.pattern!.test("011")).toBe(true);
    expect(arg.pattern!.test("01")).toBe(false);
    expect(arg.pattern!.test("012")).toBe(false);
    // mezery a čárky mezi bity projdou (vynechají se s poznámkou)
    expect(arg.pattern!.test("0 1 1")).toBe(true);
    expect(arg.pattern!.test("0, 1, 1")).toBe(true);
    expect(arg.pattern!.test("0 1")).toBe(false);
    expect(arg.notice?.("0 1 1")).toBe("Mezery vynechány.");
    expect(arg.notice?.(" 011 ")).toBeNull();
    expect(arg.patternHint).toBe("přesně 3 bity 0/1 v pořadí x, y, z");
  });

  it("Spočítat předá bity, Příklady z knihy mají všechny předlohy s čísly obrázků", () => {
    const h = handlers();
    const defs = gatesActionDefs(c, bits, validateCircuit(c), h);
    const sim = defs.find((d) => d.id === "sim")!;
    sim.run({ bits: " 011 " }, null);
    expect(h.simulate).toHaveBeenCalledWith([0, 1, 1]);
    sim.run({ bits: "1 0, 0" }, null);
    expect(h.simulate).toHaveBeenLastCalledWith([1, 0, 0]);
    const book = defs.find((d) => d.id === "book")!;
    expect(book.variants!.map((v) => v.label)).toEqual([
      "Obr. 15.1 Majorita ze tří vstupů",
      "Obr. 15.2 vlevo: or řetězcem (n = 4)",
      "Obr. 15.2 vpravo: or stromem (n = 8)",
      "Cv. 15.1.4 xor ze čtyř nand",
      "Školní sčítačka ze hradel (k obr. 15.3, n = 2)",
    ]);
    book.run({}, "xor-nand");
    expect(h.loadPreset).toHaveBeenCalledWith("xor-nand");
    const create = defs.find((d) => d.id === "create")!;
    expect(create.variants!.map((v) => v.id)).toEqual([
      "random",
      "or-chain",
      "or-tree",
      "custom",
      "empty",
    ]);
    create.run({ n: 3, m: 5 }, "random");
    expect(h.build).toHaveBeenCalledWith("random", 3, 5);
    create.run({ text: "in a; out q = a" }, "custom");
    expect(h.custom).toHaveBeenCalledWith("in a; out q = a");
  });

  it("neúplná síť: výpočet nejde (důvod = první chyba), Vytvořit a příklady ano", () => {
    const broken = {
      ...c,
      nodes: c.nodes.map((n) =>
        n.id === "O2" ? { ...n, inputs: ["O1", null] } : n,
      ),
    };
    const defs = gatesActionDefs(
      broken,
      bits,
      validateCircuit(broken),
      handlers(),
    );
    const by = (id: string) => defs.find((d) => d.id === id)!;
    expect(by("sim").disabledReason).toBe("Hradlo O2 nemá zapojený 2. vstup.");
    expect(by("next").disabledReason).toBeTruthy();
    expect(by("create").disabledReason).toBeFalsy();
    expect(by("book").disabledReason).toBeFalsy();
  });
});

describe("výpočet pro stránku", () => {
  it("nová sada kroků po přepnutí vstupu začíná taktem 0", () => {
    const c = majority();
    const s1 = materialize(circuitSteps(c, { x: 1, y: 0, z: 1 }));
    const s2 = materialize(
      circuitSteps(c, toggleBit({ x: 1, y: 0, z: 1 }, "x")),
    );
    expect(s2[0].state.takt).toBe(0);
    expect(s1[s1.length - 1].state.values.q).toBe(1);
    expect(s2[s2.length - 1].state.values.q).toBe(0);
  });
});
