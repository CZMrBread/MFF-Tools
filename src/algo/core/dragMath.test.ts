// Tah ukazatelem (myš, pero, prst) – čisté funkce sdílené kresbami s přetahovanými prvky (grafy, toky,
// později konvexní obal a k-d strom).
import { describe, expect, it } from "vitest";
import {
  clampPoint,
  clientToLocal,
  DRAG_THRESHOLD,
  followPointer,
  grabOffset,
  hitRadius,
  pastThreshold,
  pickNearest,
  spanKeepingScale,
  separateFrom,
} from "./dragMath";

describe("dragMath – práh tahu (klik vs. tah)", () => {
  it("práh je 3–4 px: menší posun je ťuknutí, od prahu tah", () => {
    expect(DRAG_THRESHOLD).toBeGreaterThanOrEqual(3);
    expect(DRAG_THRESHOLD).toBeLessThanOrEqual(4);
    const a = { x: 10, y: 10 };
    expect(pastThreshold(a, { x: 12, y: 11 })).toBe(false);
    expect(pastThreshold(a, { x: 10 + DRAG_THRESHOLD, y: 10 })).toBe(true);
    expect(pastThreshold(a, { x: 13, y: 13 })).toBe(true);
  });

  it("vlastní práh (dotyk smí mít větší)", () => {
    expect(pastThreshold({ x: 0, y: 0 }, { x: 6, y: 0 }, 8)).toBe(false);
    expect(pastThreshold({ x: 0, y: 0 }, { x: 8, y: 0 }, 8)).toBe(true);
  });
});

describe("dragMath – úchop", () => {
  it("myš a pero: neviditelný úchop aspoň 22 px kolem středu, vždy větší než viditelný kruh", () => {
    expect(hitRadius(18, "mouse")).toBeGreaterThanOrEqual(22);
    expect(hitRadius(18, "mouse")).toBeGreaterThan(18);
    expect(hitRadius(32, "pen")).toBeGreaterThan(32);
    expect(hitRadius(4, "mouse")).toBeGreaterThanOrEqual(22);
  });

  it("prst: úchop aspoň 44 px", () => {
    expect(hitRadius(18, "touch")).toBeGreaterThanOrEqual(44);
    expect(hitRadius(40, "touch")).toBeGreaterThan(44);
  });

  it("pickNearest: nejbližší prvek, jehož úchop bod obsahuje – i kousek mimo viditelný kruh; sousední úchopy rozhodne vzdálenost", () => {
    const pts = [
      { x: 100, y: 100 },
      { x: 150, y: 100 },
    ];
    const r = () => 30;
    // 27 px od prvního, 23 px od druhého → druhý (nejbližší), i když oba úchopy bod obsahují
    expect(pickNearest(pts, r, { x: 127, y: 100 })).toBe(1);
    expect(pickNearest(pts, r, { x: 75, y: 100 })).toBe(0);
    expect(pickNearest(pts, r, { x: 100, y: 200 })).toBeNull();
    expect(pickNearest(pts, r, { x: 127, y: 100 }, 1)).toBe(0);
  });

  it("grabOffset + followPointer: prvek se při uchopení nepřeskočí na ukazatel, jede s ním o stejný posun", () => {
    const center = { x: 100, y: 50 };
    const down = { x: 112, y: 41 };
    const off = grabOffset(down, center);
    expect(followPointer(down, off)).toEqual(center);
    expect(followPointer({ x: 132, y: 61 }, off)).toEqual({ x: 120, y: 70 });
  });
});

describe("dragMath – převod souřadnic a meze", () => {
  it("clientToLocal: souřadnice okna → SVG přes inverzi getScreenCTM (měřítko i posun)", () => {
    // SVG na stránce od (200, 150), zmenšené na polovinu (viewBox 2× větší než box)
    const ctm = { a: 0.5, b: 0, c: 0, d: 0.5, e: 200, f: 150 };
    expect(clientToLocal(250, 175, ctm)).toEqual({ x: 100, y: 50 });
    expect(clientToLocal(0, 0, null)).toBeNull();
    expect(
      clientToLocal(1, 1, { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }),
    ).toBeNull();
  });

  it("clampPoint drží bod v obdélníku; obrácený (příliš malý) obdélník = jeho střed", () => {
    const box = { x1: 10, y1: 20, x2: 110, y2: 220 };
    expect(clampPoint({ x: -50, y: 500 }, box)).toEqual({ x: 10, y: 220 });
    expect(clampPoint({ x: 50, y: 60 }, box)).toEqual({ x: 50, y: 60 });
    expect(
      clampPoint({ x: 0, y: 0 }, { x1: 10, y1: 0, x2: 0, y2: 10 }),
    ).toEqual({
      x: 5,
      y: 0,
    });
  });

  it("spanKeepingScale: rozsah, kam smí tažený bod, aby se kresba při nové velikosti nezmenšila", () => {
    // ostatní body 0,2…0,6, kresba smí mít rozpětí nejvýš 0,8 → bod 0…1 (ne dál)
    const k = spanKeepingScale(0.2, 0.6, 0.8);
    expect(k.lo).toBeCloseTo(-0.2, 9);
    expect(k.hi).toBeCloseTo(1, 9);
    // jediný bod: kolem něj na obě strany
    const one = spanKeepingScale(0.5, 0.5, 0.4);
    expect(one.lo).toBeCloseTo(0.1, 9);
    expect(one.hi).toBeCloseTo(0.9, 9);
    // ostatní už mají rozpětí větší než povolené (kresba se mezitím zmenšila) → jen mezi nimi
    expect(spanKeepingScale(0, 1, 0.5)).toEqual({ lo: 0, hi: 1 });
    // žádné ostatní body (prázdný rozsah) → bez omezení
    expect(spanKeepingScale(Infinity, -Infinity, 0.5)).toEqual({
      lo: -Infinity,
      hi: Infinity,
    });
  });
});

describe("dragMath – puštěný prvek nepřekryje jiný (V-5)", () => {
  const box = { x1: 0, y1: 0, x2: 200, y2: 100 };
  it("volné místo zůstane beze změny", () => {
    expect(
      separateFrom({ x: 50, y: 50 }, [{ p: { x: 150, y: 50 }, d: 40 }], box),
    ).toEqual({ x: 50, y: 50 });
  });
  it("puštění na jiný prvek: nejbližší volné místo aspoň d od něj, v mezích", () => {
    const others = [{ p: { x: 20, y: 20 }, d: 40 }];
    const q = separateFrom({ x: 22, y: 21 }, others, box);
    expect(Math.hypot(q.x - 20, q.y - 20)).toBeGreaterThanOrEqual(40 - 1e-6);
    expect(Math.hypot(q.x - 22, q.y - 21)).toBeLessThan(45);
    expect(q.x).toBeGreaterThanOrEqual(0);
    expect(q.y).toBeGreaterThanOrEqual(0);
    expect(q.x).toBeLessThanOrEqual(200);
    expect(q.y).toBeLessThanOrEqual(100);
  });
  it("v rohu mezí, kde už jeden prvek stojí, se druhý odsune podél okraje", () => {
    const others = [{ p: { x: 0, y: 0 }, d: 36 }];
    const q = separateFrom({ x: 0, y: 0 }, others, box);
    expect(Math.hypot(q.x, q.y)).toBeGreaterThanOrEqual(36 - 1e-6);
    expect(q.x).toBeGreaterThanOrEqual(0);
    expect(q.y).toBeGreaterThanOrEqual(0);
  });
  it("žádné volné místo v mezích → bod beze změny", () => {
    const tiny = { x1: 0, y1: 0, x2: 10, y2: 10 };
    expect(
      separateFrom({ x: 5, y: 5 }, [{ p: { x: 5, y: 5 }, d: 40 }], tiny),
    ).toEqual({ x: 5, y: 5 });
  });
});
