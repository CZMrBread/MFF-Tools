/*
 * Model stránky k-d stromu (čisté funkce, bez Reactu): body v adrese (pts), body z čísel (Vytvořit ▸
 * Vlastní), gesta na rovině (klik = bod, tah = dotaz Q) a klidový krok po úpravě bodů.
 */
import { describe, expect, it } from "vitest";
import { MAX_N, PLANE, randomPoints, type Pt } from "./kdtree";
import {
  kdNudge,
  kdRemove,
  movePreview,
  editStep,
  kdGesture,
  parsePointsParam,
  parsePointsText,
  pointsFromNumbers,
  pointsParam,
  pointsText,
} from "./kdPageModel";

const xy = (ps: readonly Pt[]) => ps.map((p) => [p.x, p.y]);

describe("k-d stránka – body v adrese (pts)", () => {
  it("pts = x1,y1,x2,y2,… ; zpětný převod dá stejné body; prázdná rovina je „none“", () => {
    const ps = randomPoints(7, 3);
    expect(parsePointsParam(pointsParam(ps))).toEqual(
      ps.map((p, i) => ({ id: i, x: p.x, y: p.y })),
    );
    expect(pointsParam([{ id: 0, x: 10, y: 20 }])).toBe("10,20");
    expect(pointsParam([])).toBe("none");
    expect(parsePointsParam("none")).toEqual([]);
  });

  it("nesmyslný parametr vrátí null (stránka pak použije n/seed nebo výchozí příklad)", () => {
    for (const bad of [
      null,
      "",
      "1,2,3",
      "1,x",
      "10,20,10,30", // shodné x
      "-1,5",
      "50,101",
      "1.5,2",
      Array.from({ length: 2 * (MAX_N + 1) }, (_, i) => i).join(","),
    ])
      expect(parsePointsParam(bad)).toBeNull();
  });
});

describe("k-d stránka – Vytvořit ▸ Vlastní (čísla → body)", () => {
  it("po dvou: x, y; lichý zbytek se zahodí a řekne se to", () => {
    const r = pointsFromNumbers([10, 20, 30, 40, 50]);
    expect(xy(r.points)).toEqual([
      [10, 20],
      [30, 40],
    ]);
    expect(r.note).toMatch(/lichý počet/i);
  });

  it("shodná souřadnice se posune na nejbližší volnou (k-d strom předpokládá různé x i y), mimo rovinu se ořízne", () => {
    const r = pointsFromNumbers([10, 20, 10, 20, 150, 50]);
    expect(xy(r.points)).toEqual([
      [10, 20],
      [11, 21],
      [100, 50],
    ]);
    expect(r.note).toMatch(/posunut/);
    expect(new Set(r.points.map((p) => p.x)).size).toBe(3);
  });

  it("nejvýš MAX_N bodů", () => {
    const nums = Array.from({ length: 2 * (MAX_N + 3) }, (_, i) => i);
    const r = pointsFromNumbers(nums);
    expect(r.points).toHaveLength(MAX_N);
    expect(r.note).toMatch(new RegExp(`${MAX_N}`));
  });

  it("bez úprav není poznámka", () => {
    expect(pointsFromNumbers([1, 2, 3, 4]).note).toBeNull();
  });
});

describe("k-d stránka – gesta na rovině", () => {
  const pts: Pt[] = [
    { id: 0, x: 20, y: 30 },
    { id: 1, x: 70, y: 80 },
  ];

  it("klik do prázdna přidá bod (zaokrouhlený), klik na bod ho smaže, tah bodu ho přesune", () => {
    const add = kdGesture(pts, { kind: "add", at: { x: 40.4, y: 59.6 } });
    expect(add.kind).toBe("points");
    if (add.kind !== "points") return;
    expect(xy(add.points)).toEqual([
      [20, 30],
      [70, 80],
      [40, 60],
    ]);
    expect(add.change).toBe("Přidán bod (40, 60).");

    const rm = kdGesture(pts, { kind: "remove", id: 1 });
    expect(rm.kind === "points" && xy(rm.points)).toEqual([[20, 30]]);
    expect(rm.kind === "points" && rm.change).toBe("Odebrán bod (70, 80).");

    const mv = kdGesture(pts, { kind: "move", id: 0, to: { x: 5, y: 5 } });
    expect(mv.kind === "points" && xy(mv.points)).toEqual([
      [5, 5],
      [70, 80],
    ]);
    expect(mv.kind === "points" && mv.change).toBe(
      "Bod (20, 30) přesunut na (5, 5).",
    );
  });

  it("přidání nad MAX_N bodů odmítne s hláškou", () => {
    const full = randomPoints(MAX_N, 1);
    const r = kdGesture(full, { kind: "add", at: { x: 1, y: 1 } });
    expect(r).toEqual({ kind: "error", message: `Nejvýše ${MAX_N} bodů.` });
  });

  it("tah z prázdna = dotaz Q (normalizovaný, celočíselný, oříznutý do roviny)", () => {
    const r = kdGesture(pts, {
      kind: "query",
      from: { x: 60.2, y: 90 },
      to: { x: 10, y: -5 },
    });
    expect(r).toEqual({ kind: "query", q: [10, 0, 60, 90] });
  });

  it("přesun bodu na místo, kde zůstal (bez změny), nic neohlásí jako změnu", () => {
    const r = kdGesture(pts, { kind: "move", id: 0, to: { x: 20, y: 30 } });
    expect(r.kind).toBe("none");
  });
});

describe("k-d stránka – klidový krok po úpravě bodů", () => {
  it("ukáže hotový strom nad novými body (bez přehrávání stavby) a poradí další krok", () => {
    const ps = randomPoints(5, 2);
    const s = editStep(ps, "Přidán bod (1, 2).");
    expect(s.line).toBeNull();
    expect(Object.keys(s.state.nodes)).toHaveLength(5);
    expect(s.state.root).not.toBeNull();
    expect(s.state.region).toBeNull();
    expect(s.message).toMatch(/^Přidán bod \(1, 2\)\. Strom/);
    expect(s.message).toMatch(/Build\(P\)/);
    expect(editStep([], "Prázdná rovina.").message).toMatch(/klepnutím/i);
    expect(PLANE).toEqual([0, 0, 100, 100]);
  });
});

describe("k-d stránka – body z textu (Vytvořit ▸ Vlastní, TREEHASH-16)", () => {
  it("závorky, čárky i středníky jsou oddělovače: „(1,2), (3,4)“ i „1 2; 3 4“ dají 2 body", () => {
    expect(parsePointsText("(1,2), (3,4)")).toEqual({
      values: [1, 2, 3, 4],
      error: null,
    });
    expect(parsePointsText("1 2; 3 4")).toEqual({
      values: [1, 2, 3, 4],
      error: null,
    });
    expect(parsePointsText(" ( 64 , 38 ) ;(95,88) ").values).toEqual([
      64, 38, 95, 88,
    ]);
  });

  it("lichý počet čísel → „poslední bod nemá y“; text, desetinné číslo a mimo 0–100 → chyba s tokenem", () => {
    expect(parsePointsText("(1,2), (3)").error).toMatch(/poslední bod nemá y/);
    expect(parsePointsText("1, 2, x, 4").error).toContain("x");
    expect(parsePointsText("1, 2, 3, 400").error).toContain("400");
    expect(parsePointsText("").values).toEqual([]);
  });

  it("výchozí text pole: „(64, 38), (95, 88), …“", () => {
    expect(
      pointsText([
        { id: 0, x: 64, y: 38 },
        { id: 1, x: 95, y: 88 },
      ]),
    ).toBe("(64, 38), (95, 88)");
    expect(pointsText([])).toBe("");
  });
});

describe("k-d stránka – posun bodu klávesnicí a náhled tahu", () => {
  const P: Pt[] = [
    { id: 0, x: 10, y: 20 },
    { id: 1, x: 11, y: 50 },
    { id: 2, x: 12, y: 70 },
  ];

  it("kdNudge: Shift+šipka přeskočí obsazené souřadnice ve směru posunu (různá x i y)", () => {
    const r = kdNudge(P, 0, 1, 0);
    expect(r).toMatchObject({
      kind: "points",
      change: "Bod (10, 20) posunut na (13, 20).",
    });
    expect(kdNudge(P, 2, -1, 0)).toMatchObject({
      kind: "points",
      change: "Bod (12, 70) posunut na (9, 70).",
    });
    expect(kdNudge(P, 0, 0, -1)).toMatchObject({
      kind: "points",
      change: "Bod (10, 20) posunut na (10, 19).",
    });
  });

  it("kdNudge: na okraji roviny nic", () => {
    const edge: Pt[] = [{ id: 0, x: PLANE[2], y: 5 }];
    expect(kdNudge(edge, 0, 1, 0)).toEqual({ kind: "none" });
  });

  it("kdRemove smaže bod podle id", () => {
    expect(kdRemove(P, 1)).toMatchObject({
      kind: "points",
      points: [P[0], P[2]],
      change: "Odebrán bod (11, 50).",
    });
  });

  it("movePreview: hotový strom s bodem na zaokrouhlené volné souřadnici (během tahu), bez dotazu", () => {
    const st = movePreview(P, 0, { x: 40.4, y: 49.6 });
    const moved = st.points.find((p) => p.id === 0);
    expect(moved).toEqual({ id: 0, x: 40, y: 51 });
    expect(Object.keys(st.nodes)).toHaveLength(3);
    expect(st.query).toBeNull();
  });
});
