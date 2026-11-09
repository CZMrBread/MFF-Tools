// Hradlové sítě (kap. 15.1): vrstvy, hloubka, velikost, výpočet po taktech, validace – proti knize.
import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import {
  CIRCUIT_PSEUDOCODE,
  circuitDepth,
  circuitLayers,
  circuitSteps,
  evaluateCircuit,
  findCycle,
  gateCount,
  structureKey,
  truthTable,
  validateCircuit,
  wouldCycle,
  type Bit,
  type Circuit,
  type CNode,
  type GateFn,
} from "./circuit";
import { EX_15_1_4, FIG_15_1, FIG_15_2 } from "./circuitBook.fixtures";
import {
  BOOK_PRESETS,
  majority,
  orChain,
  orTree,
  randomCircuit,
  rippleAdder,
  xorFromNand,
} from "./circuitPresets";

const byId = (c: Circuit, id: string) => c.nodes.find((n) => n.id === id)!;
const bitsOf = (c: Circuit, arr: Bit[]) =>
  Object.fromEntries(
    c.nodes.filter((n) => n.kind === "in").map((n, i) => [n.id, arr[i]]),
  ) as Record<string, Bit>;
const allBits = (n: number): Bit[][] =>
  Array.from({ length: 1 << n }, (_, v) =>
    Array.from({ length: n }, (_, i) => ((v >> (n - 1 - i)) & 1) as Bit),
  );

describe("obr. 15.1 – majorita ze tří vstupů", () => {
  const c = majority();

  it("zapojení je přesně z obrázku (vstup 1 = horní, 2 = dolní)", () => {
    expect(c.nodes.filter((n) => n.kind === "in").map((n) => n.id)).toEqual(
      FIG_15_1.inputs,
    );
    expect(c.nodes.filter((n) => n.kind === "out").map((n) => n.id)).toEqual(
      FIG_15_1.outputs,
    );
    for (const [id, g] of Object.entries(FIG_15_1.gates)) {
      const n = byId(c, id);
      expect(n.kind, id).toBe("gate");
      expect(n.fn, id).toBe(g.fn);
      expect(n.inputs, id).toEqual(g.inputs);
    }
    expect(byId(c, "q").inputs).toEqual([FIG_15_1.out.q]);
  });

  it("vrstvy S₀ … S₄ podle definice ze s. 383", () => {
    expect(circuitLayers(c)).toEqual(FIG_15_1.layers);
  });

  it("5 hradel, hloubka 5 vrstev, výpočet má 5 kroků (takty 0 … 4)", () => {
    expect(gateCount(c)).toBe(FIG_15_1.gateCount);
    expect(circuitDepth(c)).toBe(FIG_15_1.depth);
    const steps = materialize(circuitSteps(c, bitsOf(c, [1, 0, 1])));
    expect(steps).toHaveLength(5);
    expect(steps.map((s) => s.state.takt)).toEqual([0, 1, 2, 3, 4]);
  });

  it("na výstupu je 1 právě tehdy, jsou-li jedničky na aspoň dvou vstupech (všech 8 vstupů)", () => {
    for (const b of allBits(3)) {
      const want = b[0] + b[1] + b[2] >= 2 ? 1 : 0;
      expect(evaluateCircuit(c, bitsOf(c, b)).q, b.join("")).toBe(want);
      const steps = materialize(circuitSteps(c, bitsOf(c, b)));
      expect(steps[steps.length - 1].state.values.q, b.join("")).toBe(want);
    }
  });

  it("krok t: aktivní je právě vrstva S_t a hodnotu mají právě vrcholy S₀ ∪ … ∪ S_t", () => {
    const L = circuitLayers(c);
    const steps = materialize(circuitSteps(c, bitsOf(c, [1, 0, 1])));
    steps.forEach((s, t) => {
      const layer = Object.keys(L).filter((id) => L[id] === t);
      expect([...s.state.active].sort(), `takt ${t}`).toEqual(layer.sort());
      for (const n of c.nodes)
        expect(s.state.values[n.id] !== null, `${n.id} v taktu ${t}`).toBe(
          L[n.id] <= t,
        );
    });
  });

  it("zprávy a řádky pseudokódu: takt 0 = vstupy, takty s hradly = výpočet hradla, poslední = výsledek", () => {
    const steps = materialize(circuitSteps(c, bitsOf(c, [1, 0, 1])));
    expect(steps[0].line).toBe(0);
    expect(steps[0].message).toContain("Takt 0");
    expect(steps[0].message).toContain("x = 1, y = 0, z = 1");
    expect(CIRCUIT_PSEUDOCODE[steps[1].line!]).toMatch(/hradlo/);
    expect(steps[1].message).toMatch(/Takt 1 \(S₁\)/);
    expect(steps[1].message).toContain("A1 = y ∧ x = 0 ∧ 1 = 0");
    expect(steps[1].message).toContain("A2 = x ∧ z = 1 ∧ 1 = 1");
    const last = steps[steps.length - 1];
    expect(CIRCUIT_PSEUDOCODE[last.line!]).toMatch(/Výsledek/);
    expect(last.message).toContain("q = 1");
    expect(last.message).toContain("5 vrstev");
    expect(last.message).toContain("5 hradel");
    expect(last.state.done).toBe(true);
    expect(steps.slice(0, -1).every((s) => !s.state.done)).toBe(true);
  });

  it("pravdivostní tabulka: 8 řádků v binárním pořadí x y z, sloupec q = majorita", () => {
    const t = truthTable(c);
    expect(t.inputs).toEqual(["x", "y", "z"]);
    expect(t.outputs).toEqual(["q"]);
    expect(t.rows.map((r) => r.bits.join(""))).toEqual([
      "000",
      "001",
      "010",
      "011",
      "100",
      "101",
      "110",
      "111",
    ]);
    expect(t.rows.map((r) => r.outs[0])).toEqual([0, 0, 0, 1, 0, 1, 1, 1]);
  });
});

describe("obr. 15.2 – n-bitový or", () => {
  it("řetězcem: n − 1 hradel, hradlo i ve vrstvě i, výstup ve vrstvě n", () => {
    for (const n of [2, 3, 4, 8]) {
      const c = orChain(n);
      expect(gateCount(c), `n = ${n}`).toBe(FIG_15_2.chain.gates(n));
      const L = circuitLayers(c);
      const out = c.nodes.find((x) => x.kind === "out")!;
      expect(L[out.id], `n = ${n}`).toBe(FIG_15_2.chain.outLayer(n));
      expect(circuitDepth(c)).toBe(n + 1);
    }
  });

  it("stromem (n = 8): 7 hradel ve 3 vrstvách po 4, 2, 1", () => {
    const c = orTree(8);
    expect(gateCount(c)).toBe(FIG_15_2.tree8.gates);
    const L = circuitLayers(c);
    const gates = c.nodes.filter((n) => n.kind === "gate");
    const per = [1, 2, 3].map((l) => gates.filter((g) => L[g.id] === l).length);
    expect(per).toEqual(FIG_15_2.tree8.perLayer);
    expect(Math.max(...gates.map((g) => L[g.id]))).toBe(
      FIG_15_2.tree8.gateLayers,
    );
  });

  it("stromem obecně n − 1 hradel a log₂ n vrstev hradel", () => {
    for (const n of [2, 4, 16]) {
      const c = orTree(n);
      expect(gateCount(c)).toBe(n - 1);
      expect(circuitDepth(c)).toBe(Math.log2(n) + 2);
    }
  });

  it("řetězec i strom počítají or pro všech 2ⁿ vstupů (n ≤ 8)", () => {
    for (const n of [2, 4, 8]) {
      for (const c of [orChain(n), orTree(n)]) {
        const out = c.nodes.find((x) => x.kind === "out")!.id;
        for (const b of allBits(n))
          expect(evaluateCircuit(c, bitsOf(c, b))[out]).toBe(
            b.includes(1) ? 1 : 0,
          );
      }
    }
  });

  it("strom přijme jen mocninu dvou", () => {
    expect(() => orTree(6)).toThrow(/mocnin/);
  });
});

describe("cv. 15.1.4 – xor ze čtyř nand", () => {
  it("4 hradla nand, počítá xor", () => {
    const c = xorFromNand();
    const gates = c.nodes.filter((n) => n.kind === "gate");
    expect(gates).toHaveLength(EX_15_1_4.gates);
    expect(gates.every((g) => g.fn === EX_15_1_4.fn)).toBe(true);
    const out = c.nodes.find((x) => x.kind === "out")!.id;
    for (const b of allBits(2))
      expect(evaluateCircuit(c, bitsOf(c, b))[out]).toBe((b[0] ^ b[1]) as Bit);
  });
});

describe("školní sčítačka ze hradel (k obr. 15.3)", () => {
  it("n = 2 sečte všechny dvojice 2bitových čísel", () => {
    const c = rippleAdder(2);
    expect(c.nodes.filter((n) => n.kind === "in").map((n) => n.id)).toEqual([
      "x0",
      "y0",
      "x1",
      "y1",
    ]);
    for (let x = 0; x < 4; x++)
      for (let y = 0; y < 4; y++) {
        const b = [x & 1, y & 1, x >> 1, y >> 1] as Bit[];
        const v = evaluateCircuit(c, bitsOf(c, b));
        expect(v.z0 + 2 * v.z1 + 4 * v.z2, `${x} + ${y}`).toBe(x + y);
      }
  });
});

describe("knižní předvolby", () => {
  it("každá předvolba je platná síť se stranou knihy", () => {
    for (const p of BOOK_PRESETS) {
      const c = p.build();
      expect(validateCircuit(c).errors, p.id).toEqual([]);
      expect(p.page, p.id).toBeGreaterThanOrEqual(381);
      expect(p.page, p.id).toBeLessThanOrEqual(398);
    }
  });
});

/* ------------------------------------------------------------------ obecné vlastnosti */

const gate = (id: string, fn: GateFn, inputs: (string | null)[]): CNode => ({
  id,
  kind: "gate",
  fn,
  inputs,
  x: 0,
  y: 0,
});
const inp = (id: string): CNode => ({ id, kind: "in", inputs: [], x: 0, y: 0 });
const out = (id: string, src: string | null): CNode => ({
  id,
  kind: "out",
  inputs: [src],
  x: 0,
  y: 0,
});

describe("validace (podmínky definice, s. 382–383)", () => {
  it("úplná síť bez chyb", () => {
    expect(validateCircuit(majority())).toEqual({ errors: [], warnings: [] });
  });

  it("cyklus – chyba s cestou", () => {
    const c: Circuit = {
      nodes: [
        inp("a"),
        gate("G1", "and", ["a", "G2"]),
        gate("G2", "not", ["G1"]),
        out("q", "G2"),
      ],
    };
    expect(findCycle(c)).toEqual(["G1", "G2", "G1"]);
    expect(validateCircuit(c).errors.join(" ")).toMatch(/cyklus G1 → G2 → G1/i);
  });

  it("nezapojený vstup hradla, výstup bez hrany, chybějící vstupy a výstupy", () => {
    const c: Circuit = {
      nodes: [inp("a"), gate("G1", "and", ["a", null]), out("q", null)],
    };
    const e = validateCircuit(c).errors.join(" | ");
    expect(e).toMatch(/G1 nemá zapojený 2\. vstup/);
    expect(e).toMatch(/Výstup q nemá zapojený vstup/);
    expect(validateCircuit({ nodes: [] }).errors.join(" ")).toMatch(
      /nemá žádný vstup/,
    );
    expect(
      validateCircuit({
        nodes: [inp("a"), gate("G", "not", ["a"])],
      }).errors.join(" "),
    ).toMatch(/nemá žádný výstup/);
  });

  it("hradlo, ze kterého nic nevede, je jen varování (síť jde spočítat)", () => {
    const c: Circuit = {
      nodes: [inp("a"), gate("G", "not", ["a"]), out("q", "a")],
    };
    const v = validateCircuit(c);
    expect(v.errors).toEqual([]);
    expect(v.warnings.join(" ")).toMatch(/Z hradla G nevede žádná hrana/);
  });

  it("vstup sítě, ze kterého nic nevede, je varování (tabulka ho dál vypisuje)", () => {
    const c: Circuit = {
      nodes: [inp("a"), inp("b"), gate("G", "not", ["a"]), out("q", "G")],
    };
    const v = validateCircuit(c);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toContain(
      "Vstup b se nikde nepoužívá (výstupy na něm nezávisí).",
    );
  });

  it("wouldCycle: nový vodič, který by uzavřel cyklus, vrátí cestu", () => {
    const c = majority();
    expect(wouldCycle(c, "O2", "A1")).toEqual(["A1", "O1", "O2", "A1"]);
    expect(wouldCycle(c, "A1", "A1")).toEqual(["A1", "A1"]);
    expect(wouldCycle(c, "A3", "O1")).toBeNull();
  });

  it("vrstvy počítají i s neúplnou sítí (nezapojený port se ignoruje)", () => {
    const c: Circuit = {
      nodes: [
        inp("a"),
        gate("G1", "and", [null, null]),
        gate("G2", "or", ["a", "G1"]),
        out("q", null),
      ],
    };
    expect(circuitLayers(c)).toEqual({ a: 0, G1: 1, G2: 2, q: 1 });
    expect(circuitDepth(c)).toBe(3);
  });

  it("klíč struktury nezávisí na poloze vrcholů", () => {
    const a = majority();
    const b: Circuit = {
      ...a,
      nodes: a.nodes.map((n) => ({ ...n, x: n.x + 40, y: n.y - 20 })),
    };
    expect(structureKey(b)).toBe(structureKey(a));
    const c: Circuit = {
      ...a,
      nodes: a.nodes.map((n) => (n.id === "A1" ? { ...n, fn: "or" } : n)),
    };
    expect(structureKey(c)).not.toBe(structureKey(a));
  });
});

describe("všechny funkce hradel", () => {
  it.each<[GateFn, (a: number, b: number) => number]>([
    ["and", (a, b) => a & b],
    ["or", (a, b) => a | b],
    ["nand", (a, b) => 1 - (a & b)],
    ["nor", (a, b) => 1 - (a | b)],
    ["xor", (a, b) => a ^ b],
  ])("%s", (fn, f) => {
    const c: Circuit = {
      nodes: [inp("a"), inp("b"), gate("G", fn, ["a", "b"]), out("q", "G")],
    };
    for (const [a, b] of allBits(2))
      expect(evaluateCircuit(c, { a, b }).q).toBe(f(a, b));
  });
  it("not", () => {
    const c: Circuit = {
      nodes: [inp("a"), gate("N", "not", ["a"]), out("q", "N")],
    };
    expect(evaluateCircuit(c, { a: 0 }).q).toBe(1);
    expect(evaluateCircuit(c, { a: 1 }).q).toBe(0);
  });
});

describe("lemma o průběhu výpočtu (s. 383) – náhodné sítě", () => {
  it("jednou určená hodnota se už nezmění a výsledek = přímé vyhodnocení", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const nIn = 2 + (seed % 3);
      const c = randomCircuit(nIn, 3 + (seed % 6), seed);
      expect(validateCircuit(c).errors, `seed ${seed}`).toEqual([]);
      const r = rng(seed * 7);
      const b = c.nodes
        .filter((n) => n.kind === "in")
        .map(() => (r() < 0.5 ? 0 : 1) as Bit);
      const steps = materialize(circuitSteps(c, bitsOf(c, b)));
      expect(steps).toHaveLength(circuitDepth(c));
      const seen: Record<string, Bit> = {};
      for (const s of steps)
        for (const [id, v] of Object.entries(s.state.values)) {
          if (v === null) continue;
          if (id in seen) expect(v, `seed ${seed}, ${id}`).toBe(seen[id]);
          seen[id] = v;
        }
      expect(seen).toEqual(evaluateCircuit(c, bitsOf(c, b)));
    }
  });
});
