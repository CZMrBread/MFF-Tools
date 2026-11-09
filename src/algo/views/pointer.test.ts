// Převod ukazatele na souřadnice SVG s vloženou maticí (jsdom nemá getScreenCTM) a rozpoznání gest
// na plátně grafu: ťuknutí, dlouhý stisk, přesun, tah na jiný vrchol = hrana.
import { describe, expect, it } from "vitest";
import {
  classifyRelease,
  clientToLocal,
  invertMatrix,
  LONG_PRESS_MS,
  nodeAt,
  TAP_SLOP,
} from "./pointer";

describe("clientToLocal", () => {
  it("posunutí a zvětšení plátna (CTM) se odečte", () => {
    // SVG začíná na (100, 50) a je zvětšené 2×
    const ctm = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 };
    expect(clientToLocal(300, 250, ctm)).toEqual({ x: 100, y: 100 });
    expect(clientToLocal(100, 50, ctm)).toEqual({ x: 0, y: 0 });
  });
  it("otočení i zkosení – inverze obecné matice", () => {
    const m = { a: 0, b: 1, c: -1, d: 0, e: 10, f: 0 }; // otočení o 90°
    const inv = invertMatrix(m)!;
    // bod (1, 0) se zobrazí na (10, 1); zpět dá (1, 0)
    const p = clientToLocal(10, 1, m)!;
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(0);
    expect(inv.a).toBeCloseTo(0);
  });
  it("singulární nebo chybějící matice → null (vrchol se pak nepřidá)", () => {
    expect(clientToLocal(1, 1, null)).toBeNull();
    expect(
      clientToLocal(1, 1, { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }),
    ).toBeNull();
  });
});

describe("nodeAt – vrchol pod ukazatelem", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 103, y: 0 },
  ];
  it("v kruhu (s tolerancí) vrátí nejbližší vrchol, jinak null", () => {
    expect(nodeAt(pts, () => 18, { x: 10, y: 5 })).toBe(0);
    expect(nodeAt(pts, () => 18, { x: 104, y: 0 })).toBe(2);
    expect(nodeAt(pts, () => 18, { x: 50, y: 0 })).toBeNull();
    expect(nodeAt(pts, () => 18, { x: 30, y: 0 }, 14)).toBe(0);
  });
  it("vynechá zadaný vrchol (tažený)", () => {
    expect(nodeAt(pts, () => 18, { x: 101, y: 0 }, 0, 2)).toBe(1);
  });
});

describe("classifyRelease – co znamená puštění ukazatele", () => {
  const at = (x: number, y = 0) => ({ x, y });
  it("bez pohybu a krátce = ťuknutí; dlouho = dlouhý stisk (mazání na dotyku)", () => {
    const base = { start: at(0), end: at(TAP_SLOP - 1), ms: 100 };
    expect(
      classifyRelease({
        ...base,
        target: { kind: "node", id: 1 },
        over: 1,
        mode: "edit",
      }),
    ).toEqual({
      kind: "tap",
    });
    expect(
      classifyRelease({
        ...base,
        ms: LONG_PRESS_MS,
        target: { kind: "edge", id: 0 },
        over: null,
        mode: "edit",
      }),
    ).toEqual({ kind: "long-press" });
    expect(
      classifyRelease({
        ...base,
        ms: LONG_PRESS_MS + 5,
        target: { kind: "empty" },
        over: null,
        mode: "edit",
      }),
    ).toEqual({ kind: "tap" });
  });
  it("myš: dlouhý stisk nemaže (= ťuknutí, V-3); prst a pero ano", () => {
    const base = {
      start: at(0),
      end: at(1),
      ms: LONG_PRESS_MS + 200,
      target: { kind: "node", id: 1 },
      over: null,
      mode: "edit",
    } as const;
    expect(classifyRelease({ ...base, pointerType: "mouse" })).toEqual({
      kind: "tap",
    });
    expect(classifyRelease({ ...base, pointerType: "touch" })).toEqual({
      kind: "long-press",
    });
    expect(classifyRelease({ ...base, pointerType: "pen" })).toEqual({
      kind: "long-press",
    });
  });
  it("úprava: tah z vrcholu na jiný vrchol = hrana, do prázdna = přesun", () => {
    const drag = {
      start: at(0),
      end: at(80),
      ms: 300,
      target: { kind: "node", id: 1 },
    } as const;
    expect(classifyRelease({ ...drag, over: 4, mode: "edit" })).toEqual({
      kind: "connect",
      to: 4,
    });
    expect(classifyRelease({ ...drag, over: null, mode: "edit" })).toEqual({
      kind: "move",
    });
    // zpět na sebe = přesun (nic nespojí)
    expect(classifyRelease({ ...drag, over: 1, mode: "edit" })).toEqual({
      kind: "move",
    });
  });
  it("režim algoritmu: tah vrcholu = přesun i nad jiným vrcholem; tah po prázdnu nic", () => {
    const drag = { start: at(0), end: at(80), ms: 300 };
    expect(
      classifyRelease({
        ...drag,
        target: { kind: "node", id: 1 },
        over: 4,
        mode: "run",
      }),
    ).toEqual({
      kind: "move",
    });
    expect(
      classifyRelease({
        ...drag,
        target: { kind: "empty" },
        over: null,
        mode: "edit",
      }),
    ).toEqual({
      kind: "none",
    });
  });
});
