// Editor hradlové sítě na plátně – čistý reducer: přidat hradlo (mřížka, jména), spojit porty (cyklus
// odmítnut, obsazený port přepojen), smazat, přesun s přichytáváním, změna funkce, Zpět, import textem.
import { describe, expect, it } from "vitest";
import {
  circuitLayers,
  MAX_INPUTS,
  TABLE_MAX_INPUTS,
  structureKey,
  type Circuit,
} from "../algos/parallel/circuit";
import { majority } from "../algos/parallel/circuitPresets";
import { circuitText } from "../algos/parallel/circuitText";
import {
  circuitEditReducer as reduce,
  importCircuitText,
  initCircuitEdit,
  nextName,
  type CircuitEditAction,
  type CircuitEditState,
} from "./circuitEdit";
import { GRID, overlaps } from "./circuitLayout";

const run = (st: CircuitEditState, ...as: CircuitEditAction[]) =>
  as.reduce(reduce, st);
const node = (c: Circuit, id: string) => c.nodes.find((n) => n.id === id);
const empty = () => initCircuitEdit({ nodes: [], flow: "right" });

describe("přidání vrcholu", () => {
  it("hradlo se přichytí k mřížce, dostane jméno podle funkce a je vybrané; jde vrátit", () => {
    const st = run(empty(), {
      type: "add",
      kind: "gate",
      fn: "and",
      x: 103,
      y: 57,
    });
    const g = st.circuit.nodes[0];
    expect(g).toMatchObject({
      id: "A1",
      kind: "gate",
      fn: "and",
      inputs: [null, null],
      x: 100,
      y: 60,
    });
    expect(st.selected).toEqual({ kind: "node", id: "A1" });
    const st2 = run(st, {
      type: "add",
      kind: "gate",
      fn: "and",
      x: 300,
      y: 60,
    });
    expect(st2.circuit.nodes.map((n) => n.id)).toEqual(["A1", "A2"]);
    expect(run(st2, { type: "undo" }).circuit.nodes.map((n) => n.id)).toEqual([
      "A1",
    ]);
  });

  it("jména: vstupy x, y, z, w…, výstupy q, q1…, hradla A/O/N/NA/NO/X + číslo", () => {
    const c: Circuit = { nodes: [] };
    expect(nextName(c, "in")).toBe("x");
    expect(nextName(majority(), "in")).toBe("w");
    expect(nextName(majority(), "out")).toBe("q1");
    expect(nextName(majority(), "gate", "and")).toBe("A4");
    expect(nextName(majority(), "gate", "xor")).toBe("X1");
    expect(nextName(c, "gate", "nand")).toBe("NA1");
  });

  it("pořadí v síti: vstupy, hradla, výstupy (pořadí bitů vstupu)", () => {
    const st = run(
      empty(),
      { type: "add", kind: "out", x: 300, y: 0 },
      { type: "add", kind: "gate", fn: "or", x: 150, y: 0 },
      { type: "add", kind: "in", x: 0, y: 0 },
      { type: "add", kind: "in", x: 0, y: 60 },
    );
    expect(st.circuit.nodes.map((n) => `${n.kind}:${n.id}`)).toEqual([
      "in:x",
      "in:y",
      "gate:O1",
      "out:q",
    ]);
  });

  it("bez souřadnic (klávesnice) na volné místo; nejvýše MAX_INPUTS vstupů", () => {
    let st = initCircuitEdit(majority());
    st = run(st, { type: "addFree", kind: "gate", fn: "not" });
    const n = node(st.circuit, "N1")!;
    expect(overlaps(st.circuit, n)).toBe(false);
    let s2 = empty();
    for (let i = 0; i < MAX_INPUTS + 1; i++)
      s2 = run(s2, { type: "addFree", kind: "in" });
    expect(s2.circuit.nodes).toHaveLength(MAX_INPUTS);
    expect(s2.message).toMatch(/nejvýše 8 vstupů/);
    // hláška nesmí slibovat tabulku pro 8 vstupů – ukazuje se jen do TABLE_MAX_INPUTS
    expect(s2.message).toContain(`do ${TABLE_MAX_INPUTS} vstupů`);
  });
});

describe("spojení portů vodičem", () => {
  const base = () =>
    run(
      empty(),
      { type: "add", kind: "in", x: 0, y: 0 },
      { type: "add", kind: "in", x: 0, y: 60 },
      { type: "add", kind: "gate", fn: "and", x: 120, y: 40 },
      { type: "add", kind: "out", x: 240, y: 40 },
    );

  it("tah z výstupu na konkrétní port; bez portu do prvního volného", () => {
    let st = run(base(), { type: "connect", from: "x", to: "A1", port: 1 });
    expect(node(st.circuit, "A1")!.inputs).toEqual([null, "x"]);
    expect(st.selected).toEqual({ kind: "wire", to: "A1", port: 1 });
    st = run(st, { type: "connect", from: "y", to: "A1" });
    expect(node(st.circuit, "A1")!.inputs).toEqual(["y", "x"]);
    st = run(st, { type: "connect", from: "A1", to: "q" });
    expect(node(st.circuit, "q")!.inputs).toEqual(["A1"]);
  });

  it("obsazený port se přepojí (s hláškou); plné hradlo bez portu odmítne", () => {
    let st = run(
      base(),
      { type: "connect", from: "x", to: "A1" },
      { type: "connect", from: "y", to: "A1" },
    );
    st = run(st, { type: "connect", from: "y", to: "A1", port: 0 });
    expect(node(st.circuit, "A1")!.inputs).toEqual(["y", "y"]);
    expect(st.message).toMatch(/přepojen z x na y/);
    const before = st.circuit;
    st = run(st, { type: "connect", from: "x", to: "A1" });
    expect(st.circuit).toBe(before);
    expect(st.message).toMatch(/obsazené/);
  });

  it("cyklus i smyčku odmítne s jasnou zprávou a síť nezmění", () => {
    const st0 = initCircuitEdit(majority());
    const st = run(st0, { type: "connect", from: "O2", to: "A1", port: 0 });
    expect(st.circuit).toBe(st0.circuit);
    expect(st.message).toBe(
      "Vodič O2 → A1 by vytvořil cyklus A1 → O1 → O2 → A1 – hradlová síť musí být acyklická.",
    );
    const st2 = run(st0, { type: "connect", from: "O1", to: "O1", port: 0 });
    expect(st2.circuit).toBe(st0.circuit);
    expect(st2.message).toMatch(/cyklus/);
  });

  it("z výstupu sítě ani do vstupu sítě vodič nevede", () => {
    const st0 = initCircuitEdit(majority());
    expect(
      run(st0, { type: "connect", from: "q", to: "A1", port: 0 }).message,
    ).toMatch(/Z výstupu sítě q nevede žádný vodič/);
    expect(run(st0, { type: "connect", from: "A1", to: "x" }).message).toMatch(
      /Do vstupu sítě x nevede žádný vodič/,
    );
  });

  it("ťuknutí (klávesnice, dotyk): první vrchol = zdroj, druhý = cíl (první volný port)", () => {
    let st = run(base(), { type: "tapNode", id: "y" });
    expect(st.source).toBe("y");
    st = run(st, { type: "tapNode", id: "A1" });
    expect(node(st.circuit, "A1")!.inputs).toEqual(["y", null]);
    expect(st.source).toBeNull();
    // výstup sítě jako zdroj nejde
    st = run(st, { type: "tapNode", id: "q" });
    expect(st.source).toBeNull();
  });
});

describe("mazání, přesun, změna funkce", () => {
  it("smazání vrcholu odpojí jeho vodiče; smazání vodiče uvolní port", () => {
    const st0 = initCircuitEdit(majority());
    const st = run(st0, { type: "remove", target: { kind: "node", id: "A1" } });
    expect(node(st.circuit, "A1")).toBeUndefined();
    expect(node(st.circuit, "O1")!.inputs).toEqual([null, "A2"]);
    const st2 = run(
      st0,
      { type: "select", target: { kind: "wire", to: "O2", port: 1 } },
      { type: "remove" },
    );
    expect(node(st2.circuit, "O2")!.inputs).toEqual(["O1", null]);
    expect(st2.selected).toBeNull();
  });

  it("přesun se přichytí k mřížce, celý tah je v historii jednou a zahodí knižní sběrnici", () => {
    const st0 = initCircuitEdit(majority());
    let st = run(
      st0,
      { type: "move", id: "x", x: 7, y: 33, gesture: 1 },
      { type: "move", id: "x", x: 28, y: 52, gesture: 1 },
    );
    expect(node(st.circuit, "x")).toMatchObject({ x: 20, y: 60 });
    expect(node(st.circuit, "x")!.bus).toBeUndefined();
    expect(st.undo).toHaveLength(1);
    st = run(st, { type: "nudge", id: "x", dx: 1, dy: -1 });
    expect(node(st.circuit, "x")).toMatchObject({ x: 20 + GRID, y: 60 - GRID });
    expect(structureKey(st.circuit)).toBe(structureKey(st0.circuit));
  });

  it("změna funkce hradla upraví počet portů", () => {
    const st0 = initCircuitEdit(majority());
    const st = run(st0, { type: "setFn", id: "A1", fn: "not" });
    expect(node(st.circuit, "A1")).toMatchObject({ fn: "not", inputs: ["y"] });
    const st2 = run(st, { type: "setFn", id: "A1", fn: "xor" });
    expect(node(st2.circuit, "A1")).toMatchObject({
      fn: "xor",
      inputs: ["y", null],
    });
  });

  it("Uspořádat = rozvržení po vrstvách (struktura beze změny)", () => {
    const st0 = initCircuitEdit(majority());
    const st = run(st0, { type: "arrange" });
    expect(structureKey(st.circuit)).toBe(structureKey(st0.circuit));
    const L = circuitLayers(st.circuit);
    expect(node(st.circuit, "A1")!.x).toBe(node(st.circuit, "A3")!.x);
    expect(node(st.circuit, "O2")!.x).toBeGreaterThan(
      node(st.circuit, "O1")!.x,
    );
    expect(L.q).toBe(4);
  });
});

describe("import textem", () => {
  it("vrcholy se stejným jménem zůstanou na místě, nové se umístí bez překryvu; tok se zachová", () => {
    const cur = majority();
    const text = circuitText(cur).replace(
      "out q = O2",
      "N1 = not(O2)\nout q = N1",
    );
    const r = importCircuitText(cur, text);
    expect(r.errors).toEqual([]);
    expect(node(r.circuit, "A1")).toMatchObject({ x: 106, y: 0 });
    expect(node(r.circuit, "x")!.bus).toBe(node(cur, "x")!.bus);
    expect(overlaps(r.circuit, node(r.circuit, "N1")!)).toBe(false);
    expect(r.circuit.flow).toBe("right");
  });

  it("bez jediného známého vrcholu se síť rozvrhne po vrstvách", () => {
    const r = importCircuitText(
      majority(),
      "in a, b\nG = xor(a, b)\nout s = G",
    );
    expect(r.errors).toEqual([]);
    expect(node(r.circuit, "a")!.x).toBeLessThan(node(r.circuit, "G")!.x);
    expect(node(r.circuit, "G")!.x).toBeLessThan(node(r.circuit, "s")!.x);
  });

  it("chyba v textu (cyklus) síť nezmění a vrátí hlášku", () => {
    const cur = majority();
    const r = importCircuitText(
      cur,
      "in a\nG1 = and(a, G2)\nG2 = not(G1)\nout q = G2",
    );
    expect(r.errors.map((e) => e.message).join(" ")).toMatch(
      /cyklus G1 → G2 → G1/,
    );
    expect(r.circuit).toBe(cur);
  });
});
