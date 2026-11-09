// Polohy vrcholů hradlové sítě v odkazu (xy=…): kompaktní zápis bez %-kódování, vadný zápis = null.
import { describe, expect, it } from "vitest";
import type { Circuit } from "./circuit";
import { applyPositions, encodePositions } from "./circuitPositions";
import { majority, orTree } from "./circuitPresets";

/** zápis přežije URLSearchParams i encodeURIComponent beze změny (žádné %xx) */
const urlSafe = (s: string) =>
  encodeURIComponent(s) === s &&
  new URLSearchParams({ xy: s }).toString() === `xy=${s}`;

const moved = (c: Circuit, id: string, dx: number, dy: number): Circuit => ({
  ...c,
  nodes: c.nodes.map((n) => {
    if (n.id !== id) return n;
    const m = { ...n, x: n.x + dx, y: n.y + dy };
    delete m.bus;
    return m;
  }),
});

describe("encodePositions", () => {
  it("vstupy, hradla, výstupy v pořadí sítě; celá čísla; sběrnice jako třetí číslo; bez %-kódování", () => {
    const s = encodePositions(majority());
    expect(s).toBe(
      "0.12.63_0.80.36_0.148.63_106.0_106.80_106.160_212.40_318.120_384.120",
    );
    expect(urlSafe(s)).toBe(true);
  });

  it("záporné a necelé souřadnice se zaokrouhlí; tok shora dolů = předpona d", () => {
    const c: Circuit = {
      flow: "down",
      nodes: [
        { id: "a", kind: "in", inputs: [], x: -12.4, y: 0.6 },
        { id: "q", kind: "out", inputs: ["a"], x: 30.5, y: -40 },
      ],
    };
    const s = encodePositions(c);
    expect(s).toBe("d-12.1_31.-40");
    expect(urlSafe(s)).toBe(true);
    expect(urlSafe(encodePositions(orTree(16)))).toBe(true);
  });

  it("pořadí: vstupy, hradla, výstupy (jako textový zápis c=), i když síť má vrcholy promíchané", () => {
    const c: Circuit = {
      flow: "right",
      nodes: [
        { id: "q", kind: "out", inputs: ["G"], x: 200, y: 0 },
        { id: "G", kind: "gate", fn: "not", inputs: ["a"], x: 100, y: 0 },
        { id: "a", kind: "in", inputs: [], x: 0, y: 0 },
      ],
    };
    expect(encodePositions(c)).toBe("0.0_100.0_200.0");
  });
});

describe("applyPositions", () => {
  it("tam a zpět: posunuté hradlo i zachované sběrnice", () => {
    const c = moved(majority(), "A2", 40, -20);
    const back = applyPositions(majority(), encodePositions(c));
    expect(back).toEqual(c);
  });

  it("vrchol bez třetího čísla sběrnici ztratí (jako po přesunu v editoru)", () => {
    const c = moved(majority(), "y", 20, 0);
    const back = applyPositions(majority(), encodePositions(c))!;
    expect(back.nodes.find((n) => n.id === "y")).not.toHaveProperty("bus");
    expect(back.nodes.find((n) => n.id === "x")!.bus).toBe(63);
  });

  it("předpona d přepne tok shora dolů, bez ní zleva doprava", () => {
    const t = orTree(4);
    const back = applyPositions({ ...t, flow: "right" }, encodePositions(t))!;
    expect(back.flow).toBe("down");
    const r = applyPositions(t, encodePositions({ ...t, flow: "right" }))!;
    expect(r.flow).toBe("right");
  });

  it.each([
    ["", "prázdné"],
    ["0.12_0.80", "málo vrcholů"],
    [encodePositions(majority()) + "_1.1", "moc vrcholů"],
    [
      "0.12.63_0.80.36_0.148.63_106.0_106.80_106.160_212.40_318.x_384.120",
      "písmeno",
    ],
    [
      "0.12.63_0.80.36_0.148.63_106.0_106.80_106.160_212.40_318_384.120",
      "jedno číslo",
    ],
    [
      "0.12.63_0.80.36_0.148.63_106.0_106.80_106.160_212.40_318.1.2.3_384.120",
      "čtyři čísla",
    ],
    [
      "0.12.63_0.80.36_0.148.63_106.0_106.80_106.160_212.40_99999999.0_384.120",
      "obří číslo",
    ],
    [
      "0.12.63_0.80.36_0.148.63_106.0_106.80_106.160_212.40_1e3.0_384.120",
      "exponent",
    ],
    [
      "0.12.63_0.80.36_0.148.63_106.0_106.80_106.160_212.40_--1.0_384.120",
      "dvě minus",
    ],
    [
      "x0.12.63_0.80.36_0.148.63_106.0_106.80_106.160_212.40_318.120_384.120",
      "neznámá předpona",
    ],
  ])("vadný zápis (%s → %s) = null, nic nespadne", (s) => {
    expect(applyPositions(majority(), s)).toBeNull();
  });

  it("prázdná síť a prázdný zápis jdou k sobě", () => {
    expect(applyPositions({ nodes: [], flow: "right" }, "")).toEqual({
      nodes: [],
      flow: "right",
    });
  });
});
