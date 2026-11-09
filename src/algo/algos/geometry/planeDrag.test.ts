// Tah v rovině (konvexní obal, k-d strom): výběr cíle pod ukazatelem s velkým úchopem, změna velikosti
// a posun obdélníku Q, měřítko obrazovky. Čisté funkce – planeDrag.ts.
import { describe, expect, it } from "vitest";
import {
  DEL_OFF,
  moveBox,
  removeButtonAt,
  pickPlaneTarget,
  resizeBox,
  screenUnit,
  TAP_SELECT_R,
  tapSelects,
} from "./planeDrag";

const PLANE: [number, number, number, number] = [0, 0, 100, 100];
const pts = [
  { id: 0, at: { x: 100, y: 100 } },
  { id: 1, at: { x: 200, y: 100 } },
];
const base = {
  unit: 1,
  pointerType: "mouse",
  points: pts,
  pointR: 5.5,
};

describe("screenUnit", () => {
  it("jednotky viewBoxu na 1 px obrazovky z matice getScreenCTM (bez matice 1)", () => {
    expect(screenUnit({ a: 0.5, b: 0, c: 0, d: 0.5, e: 10, f: 20 })).toBe(2);
    expect(screenUnit({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 })).toBe(0.5);
    expect(screenUnit(null)).toBe(1);
  });
});

describe("pickPlaneTarget – body", () => {
  it("bod jde chytit i 20 px vedle viditelného kruhu (úchop myši ≥ 22 px)", () => {
    expect(pickPlaneTarget({ ...base, p: { x: 120, y: 100 } })).toMatchObject({
      kind: "point",
      id: 0,
    });
    expect(pickPlaneTarget({ ...base, p: { x: 130, y: 100 } }).kind).toBe(
      "empty",
    );
  });

  it("prst má úchop 44 px; vybere se nejbližší bod", () => {
    const t = pickPlaneTarget({
      ...base,
      pointerType: "touch",
      p: { x: 140, y: 100 },
    });
    expect(t).toMatchObject({ kind: "point", id: 0 });
    expect(
      pickPlaneTarget({ ...base, pointerType: "touch", p: { x: 160, y: 100 } }),
    ).toMatchObject({ kind: "point", id: 1 });
  });

  it("úchop se počítá v px obrazovky: v rovině zmenšené na polovinu (unit 2) je 22 px = 44 jednotek", () => {
    expect(
      pickPlaneTarget({ ...base, unit: 2, p: { x: 140, y: 100 } }),
    ).toMatchObject({ kind: "point", id: 0 });
    expect(
      pickPlaneTarget({ ...base, unit: 2, p: { x: 146, y: 100 } }).kind,
    ).toBe("empty");
  });

  it("vzdálenost od středu bodu je v px obrazovky (pro rozlišení výběr / přidání)", () => {
    const t = pickPlaneTarget({ ...base, unit: 2, p: { x: 120, y: 100 } });
    expect(t).toMatchObject({ kind: "point", id: 0, d: 10 });
  });

  it("tlačítko × u vybraného bodu má přednost, když je ukazatel blíž k němu než ke středu bodu", () => {
    const remove = { id: 0, at: { x: 116, y: 116 }, r: 8 };
    expect(pickPlaneTarget({ ...base, remove, p: { x: 117, y: 117 } })).toEqual(
      { kind: "remove", id: 0 },
    );
    expect(
      pickPlaneTarget({ ...base, remove, p: { x: 103, y: 103 } }),
    ).toMatchObject({ kind: "point", id: 0 });
  });
});

describe("pickPlaneTarget – × se netrefí omylem", () => {
  it("úchop × není u prstu nafouknutý na 44 px: ťuknutí 21 px od × ho nesmaže (smazání chce mířit)", () => {
    const remove = { id: 0, at: { x: 116, y: 116 }, r: 8 };
    const t = pickPlaneTarget({
      ...base,
      pointerType: "touch",
      remove,
      p: { x: 130, y: 100 },
    });
    expect(t.kind).not.toBe("remove");
    expect(
      pickPlaneTarget({
        ...base,
        pointerType: "touch",
        remove,
        p: { x: 125, y: 125 },
      }),
    ).toEqual({ kind: "remove", id: 0 });
  });
});

describe("pickPlaneTarget – obdélník Q", () => {
  // Q v px: x 250–350, y 50–150; v rovině (osa y nahoru) je horní hrana px y1 = y2 roviny
  const rect = { x1: 250, y1: 50, x2: 350, y2: 150 };
  const r = { ...base, points: [], rect };

  it("roh: horní levý v px = (x1, y2) roviny", () => {
    expect(pickPlaneTarget({ ...r, p: { x: 255, y: 55 } })).toEqual({
      kind: "handle",
      xi: 0,
      yi: 3,
    });
    expect(pickPlaneTarget({ ...r, p: { x: 345, y: 148 } })).toEqual({
      kind: "handle",
      xi: 2,
      yi: 1,
    });
  });

  it("hrana: pruh kolem ní (myš 11 px), jen mezi rohy", () => {
    expect(pickPlaneTarget({ ...r, p: { x: 300, y: 58 } })).toEqual({
      kind: "handle",
      xi: null,
      yi: 3,
    });
    expect(pickPlaneTarget({ ...r, p: { x: 359, y: 100 } })).toEqual({
      kind: "handle",
      xi: 2,
      yi: null,
    });
    expect(pickPlaneTarget({ ...r, p: { x: 300, y: 30 } }).kind).toBe("empty");
  });

  it("vnitřek = posun celého Q; mimo = prázdno", () => {
    expect(pickPlaneTarget({ ...r, p: { x: 300, y: 100 } })).toEqual({
      kind: "inside",
    });
    expect(pickPlaneTarget({ ...r, p: { x: 50, y: 300 } })).toEqual({
      kind: "empty",
    });
  });

  it("bod uvnitř Q má přednost před vnitřkem i hranou", () => {
    const t = pickPlaneTarget({
      ...r,
      points: [{ id: 4, at: { x: 300, y: 60 } }],
      p: { x: 300, y: 55 },
    });
    expect(t).toMatchObject({ kind: "point", id: 4 });
  });

  it("malé Q: úchopy rohů a hran se zmenší, vnitřek zůstane chytitelný", () => {
    const small = { x1: 100, y1: 100, x2: 130, y2: 130 };
    expect(
      pickPlaneTarget({
        ...r,
        rect: small,
        pointerType: "touch",
        p: { x: 115, y: 115 },
      }),
    ).toEqual({ kind: "inside" });
    expect(
      pickPlaneTarget({
        ...r,
        rect: small,
        pointerType: "touch",
        p: { x: 98, y: 98 },
      }),
    ).toEqual({ kind: "handle", xi: 0, yi: 3 });
  });
});

describe("tapSelects", () => {
  it("ťuknutí do 22 px od středu bodu ho vybere; dál (jen v úchopu prstu) přidá nový bod", () => {
    expect(TAP_SELECT_R).toBe(22);
    expect(tapSelects(22)).toBe(true);
    expect(tapSelects(30)).toBe(false);
  });
});

describe("resizeBox / moveBox", () => {
  const q: [number, number, number, number] = [10, 20, 40, 60];

  it("roh mění dvě strany, hrana jednu; výsledek je celočíselný a srovnaný", () => {
    expect(resizeBox(q, { xi: 2, yi: 3 }, { x: 5.4, y: 9.6 }, PLANE)).toEqual([
      10, 20, 45, 70,
    ]);
    expect(resizeBox(q, { xi: 0, yi: null }, { x: -3, y: 50 }, PLANE)).toEqual([
      7, 20, 40, 60,
    ]);
  });

  it("přetažení hrany přes protější stranu obdélník převrátí (meze se prohodí)", () => {
    expect(resizeBox(q, { xi: 0, yi: null }, { x: 50, y: 0 }, PLANE)).toEqual([
      40, 20, 60, 60,
    ]);
  });

  it("změna velikosti nevyjede z roviny", () => {
    expect(resizeBox(q, { xi: 2, yi: 3 }, { x: 500, y: 500 }, PLANE)).toEqual([
      10, 20, 100, 100,
    ]);
  });

  it("posun drží rozměr a zastaví se o okraj roviny", () => {
    expect(moveBox(q, { x: 5.2, y: -4.7 }, PLANE)).toEqual([15, 15, 45, 55]);
    expect(moveBox(q, { x: 500, y: -500 }, PLANE)).toEqual([70, 0, 100, 40]);
  });
});

describe("removeButtonAt", () => {
  const frame = { x1: 20, y1: 20, x2: 380, y2: 380 };
  it("× je vpravo dole od bodu; u pravého / dolního okraje roviny se překlopí dovnitř", () => {
    expect(removeButtonAt({ x: 100, y: 100 }, frame)).toEqual({
      x: 100 + DEL_OFF,
      y: 100 + DEL_OFF,
    });
    expect(removeButtonAt({ x: 375, y: 372 }, frame)).toEqual({
      x: 375 - DEL_OFF,
      y: 372 - DEL_OFF,
    });
  });
});
