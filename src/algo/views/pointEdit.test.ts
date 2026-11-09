// Zadávání bodů a dotazového obdélníku myší (k-d strom) – čisté funkce: mapování roviny, přidání bodu
// s různými souřadnicemi, přesun, smazání, obdélník z tahu, rozpoznání gesta.
import { describe, expect, it } from "vitest";
import {
  addPoint,
  dragRect,
  movePoint,
  planeGesture,
  planeMapping,
  pointAt,
  removePoint,
} from "./pointEdit";

const PLANE: [number, number, number, number] = [0, 0, 100, 100];
const opts = { plane: PLANE, max: 5 };
const pts = [
  { id: 0, x: 10, y: 20 },
  { id: 3, x: 50, y: 60 },
];

describe("planeMapping", () => {
  it("osa y míří nahoru, okraj pad; tam a zpět je identita", () => {
    const m = planeMapping(360, 20, PLANE);
    expect(m.toPx(0, 0)).toEqual({ x: 20, y: 340 });
    expect(m.toPx(100, 100)).toEqual({ x: 340, y: 20 });
    expect(m.fromPx(180, 180)).toEqual({ x: 50, y: 50 });
  });
});

describe("addPoint", () => {
  it("zaokrouhlí na celá čísla, ořízne do roviny a dá nové id", () => {
    const r = addPoint(pts, { x: 70.4, y: 140 }, opts);
    expect(r.error).toBeNull();
    expect(r.added).toEqual({ id: 4, x: 70, y: 100 });
    expect(r.points).toHaveLength(3);
  });
  it("k-d strom chce různé x i y: shodná souřadnice se posune na nejbližší volnou", () => {
    const r = addPoint(pts, { x: 10, y: 60 }, opts);
    expect(r.added).toEqual({ id: 4, x: 11, y: 61 });
    // u okraje roviny se posune dovnitř
    const edge = addPoint([{ id: 0, x: 100, y: 0 }], { x: 100, y: 0 }, opts);
    expect(edge.added).toEqual({ id: 1, x: 99, y: 1 });
  });
  it("limit počtu bodů", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      x: i * 10,
      y: i * 10,
    }));
    const r = addPoint(many, { x: 55, y: 55 }, opts);
    expect(r.error).toBe("Nejvýše 5 bodů.");
    expect(r.points).toBe(many);
  });
});

describe("movePoint / removePoint / pointAt", () => {
  it("přesun hlídá různé souřadnice vůči ostatním, ne vůči sobě", () => {
    expect(movePoint(pts, 3, { x: 51, y: 60 }, opts).points[1]).toEqual({
      id: 3,
      x: 51,
      y: 60,
    });
    expect(movePoint(pts, 3, { x: 10, y: 61 }, opts).points[1]).toEqual({
      id: 3,
      x: 11,
      y: 61,
    });
  });
  it("removePoint smaže bod podle id; pointAt najde bod pod kurzorem", () => {
    expect(removePoint(pts, 0)).toEqual([pts[1]]);
    const m = planeMapping(360, 20, PLANE);
    const p = m.toPx(50, 60);
    expect(pointAt(pts, m.toPx, { x: p.x + 5, y: p.y - 4 })).toBe(3);
    expect(pointAt(pts, m.toPx, { x: 0, y: 0 })).toBeNull();
  });
});

describe("dragRect", () => {
  it("tah libovolným směrem dá normalizovaný obdélník v celých číslech uvnitř roviny", () => {
    expect(dragRect({ x: 60.6, y: 10 }, { x: 20, y: 70.2 }, PLANE)).toEqual([
      20, 10, 61, 70,
    ]);
    expect(dragRect({ x: -5, y: 50 }, { x: 120, y: 40 }, PLANE)).toEqual([
      0, 40, 100, 50,
    ]);
  });
});

describe("planeGesture – co znamená tah či klik na rovině", () => {
  const a = { x: 100, y: 100 };
  it("klik do prázdna = bod, klik na bod = smazat", () => {
    expect(
      planeGesture({
        startPx: a,
        endPx: a,
        start: { x: 30, y: 30 },
        end: { x: 30, y: 30 },
        hit: null,
      }),
    ).toEqual({
      kind: "add",
      at: { x: 30, y: 30 },
    });
    expect(
      planeGesture({
        startPx: a,
        endPx: { x: 102, y: 101 },
        start: { x: 30, y: 30 },
        end: { x: 30, y: 30 },
        hit: 3,
      }),
    ).toEqual({
      kind: "remove",
      id: 3,
    });
  });
  it("tah z prázdna = dotazový obdélník, tah bodu = přesun", () => {
    const b = { x: 200, y: 160 };
    expect(
      planeGesture({
        startPx: a,
        endPx: b,
        start: { x: 30, y: 30 },
        end: { x: 60, y: 10 },
        hit: null,
      }),
    ).toEqual({
      kind: "query",
      from: { x: 30, y: 30 },
      to: { x: 60, y: 10 },
    });
    expect(
      planeGesture({
        startPx: a,
        endPx: b,
        start: { x: 30, y: 30 },
        end: { x: 60, y: 10 },
        hit: 0,
      }),
    ).toEqual({
      kind: "move",
      id: 0,
      to: { x: 60, y: 10 },
    });
  });
});
