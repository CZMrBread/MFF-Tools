// Model stránky konvexního obalu: odkaz (pts, v), body z textu, gesta v rovině, posun klávesnicí, legenda.
import { describe, expect, it } from "vitest";
import { MAX_N, type HullPt } from "./hull";
import { DEFAULT_EXAMPLE, exampleById } from "./hullBook";
import {
  addAt,
  configFromUrl,
  configToUrl,
  DEFAULT_CONFIG,
  exampleOf,
  hullGesture,
  hullLegend,
  moveAt,
  nudge,
  removeAt,
  removeId,
  parsePtsParam,
  pointsFromNumbers,
  pointsText,
  ptsParam,
} from "./hullPageModel";

const pts = (xy: [number, number][]): HullPt[] =>
  xy.map(([x, y], id) => ({ id, x, y }));
const q = (s: string) => new URLSearchParams(s);

describe("odkaz: pts a v", () => {
  it("pts = dvojice x,y; prázdná rovina = none", () => {
    expect(
      ptsParam(
        pts([
          [1, 2],
          [30, 40],
        ]),
      ),
    ).toBe("1,2,30,40");
    expect(ptsParam([])).toBe("none");
    expect(parsePtsParam("1,2,30,40")).toEqual(
      pts([
        [1, 2],
        [30, 40],
      ]),
    );
    expect(parsePtsParam("none")).toEqual([]);
  });

  it("na rozdíl od k-d stromu smí dva body sdílet x i y, ale ne být totožné", () => {
    expect(parsePtsParam("10,10,10,50,50,10")).toHaveLength(3);
    expect(parsePtsParam("10,10,10,10")).toBeNull();
  });

  it("neplatné pts (lichý počet, mimo 0–100, nečísla, nad MAX_N bodů) = null", () => {
    expect(parsePtsParam("1,2,3")).toBeNull();
    expect(parsePtsParam("1,2,300,4")).toBeNull();
    expect(parsePtsParam("a,b")).toBeNull();
    const many = Array.from({ length: MAX_N + 1 }, (_, i) => `${i},${i}`).join(
      ",",
    );
    expect(parsePtsParam(many)).toBeNull();
    expect(parsePtsParam(null)).toBeNull();
  });

  it("bez parametrů = výchozí příklad (obr. 16.1, zametání) bez hlášky", () => {
    const r = configFromUrl(q(""));
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.config.points).toEqual(DEFAULT_EXAMPLE.points);
    expect(r.config.alg).toBe("sweep");
    expect(r.notice).toBeNull();
  });

  it("v=wrap otevře provázkový algoritmus; neznámé v = zametání s hláškou", () => {
    expect(configFromUrl(q("pts=1,2,3,4&v=wrap")).config).toEqual({
      points: pts([
        [1, 2],
        [3, 4],
      ]),
      alg: "wrap",
    });
    const bad = configFromUrl(q("v=xyz"));
    expect(bad.config.alg).toBe("sweep");
    expect(bad.notice).toMatch(/v=xyz/);
  });

  it("vadné pts = výchozí body s hláškou", () => {
    const r = configFromUrl(q("pts=1,2,3"));
    expect(r.config.points).toEqual(DEFAULT_EXAMPLE.points);
    expect(r.notice).toMatch(/výchozí příklad/);
  });

  it("zpět do adresy: výchozí stav = žádné parametry, jinak pts a u provázku v=wrap (round-trip)", () => {
    expect(configToUrl(DEFAULT_CONFIG)).toEqual({});
    const c = {
      points: pts([
        [5, 6],
        [70, 80],
      ]),
      alg: "wrap" as const,
    };
    expect(configToUrl(c)).toEqual({ pts: "5,6,70,80", v: "wrap" });
    expect(
      configFromUrl(q(new URLSearchParams(configToUrl(c)).toString())).config,
    ).toEqual(c);
    expect(configToUrl({ ...DEFAULT_CONFIG, alg: "wrap" })).toEqual({
      v: "wrap",
    });
    expect(configToUrl({ points: [], alg: "sweep" })).toEqual({ pts: "none" });
  });

  it("exampleOf pozná knižní příklad podle bodů", () => {
    expect(exampleOf(exampleById("obr-16-3")!.points)?.id).toBe("obr-16-3");
    expect(exampleOf(pts([[1, 1]]))).toBeNull();
  });
});

describe("Vytvořit ▸ Vlastní: body z čísel", () => {
  it("dvojice → body; totožné body se vynechají s poznámkou; lichý zbytek a body nad MAX_N také", () => {
    expect(pointsFromNumbers([1, 2, 3, 4])).toEqual({
      points: pts([
        [1, 2],
        [3, 4],
      ]),
      note: null,
    });
    const d = pointsFromNumbers([1, 2, 1, 2, 5, 5, 9]);
    expect(d.points).toEqual(
      pts([
        [1, 2],
        [5, 5],
      ]),
    );
    expect(d.note).toMatch(/Lichý počet/);
    expect(d.note).toMatch(/totožn/);
    const many = pointsFromNumbers(
      Array.from({ length: 2 * (MAX_N + 3) }, (_, i) => i),
    );
    expect(many.points).toHaveLength(MAX_N);
    expect(many.note).toMatch(String(MAX_N));
  });
  it("poznámka skloňuje počet vynechaných bodů", () => {
    expect(pointsFromNumbers([1, 2, 1, 2, 1, 2]).note).toBe(
      "Vynechány 2 totožné body.",
    );
    expect(pointsFromNumbers([1, 2, 1, 2]).note).toBe(
      "Vynechán 1 totožný bod.",
    );
  });
  it("text pole ukazuje body jako (x, y)", () => {
    expect(
      pointsText(
        pts([
          [1, 2],
          [3, 4],
        ]),
      ),
    ).toBe("(1, 2), (3, 4)");
  });
});

describe("úpravy bodů v rovině", () => {
  const base = pts([
    [10, 10],
    [50, 50],
  ]);

  it("klik do prázdna přidá zaokrouhlený bod (nové id), klik na bod ho smaže", () => {
    const r = hullGesture(base, { kind: "add", at: { x: 30.4, y: 70.6 } });
    expect(r).toEqual({
      kind: "points",
      points: [...base, { id: 2, x: 30, y: 71 }],
      change: "Přidán bod (30, 71).",
    });
    const d = hullGesture(base, { kind: "remove", id: 0 });
    expect(d.kind === "points" && d.points).toEqual([base[1]]);
  });

  it("přidání na místo existujícího bodu nebo nad MAX_N je chyba, mimo rovinu se ořízne", () => {
    expect(
      hullGesture(base, { kind: "add", at: { x: 10.2, y: 9.8 } }).kind,
    ).toBe("error");
    const full = pts(
      Array.from({ length: MAX_N }, (_, i) => [i, i] as [number, number]),
    );
    expect(addAt(full, 90, 1).kind).toBe("error");
    const c = addAt(base, 130, -4);
    expect(c.kind === "points" && c.points.at(-1)).toEqual({
      id: 2,
      x: 100,
      y: 0,
    });
  });

  it("tah bodu ho přesune (na volné místo), tah z prázdna nic nedělá", () => {
    const m = hullGesture(base, { kind: "move", id: 1, to: { x: 80, y: 20 } });
    expect(m.kind === "points" && m.points[1]).toEqual({ id: 1, x: 80, y: 20 });
    expect(
      hullGesture(base, { kind: "move", id: 1, to: { x: 10, y: 10 } }).kind,
    ).toBe("error");
    expect(
      hullGesture(base, {
        kind: "query",
        from: { x: 0, y: 0 },
        to: { x: 9, y: 9 },
      }),
    ).toEqual({ kind: "none" });
  });

  it("Shift+šipka posune bod o 1, na okraji ani na obsazené místo ne", () => {
    const r = nudge(base, 0, 1, 0);
    expect(r.kind === "points" && r.points[0]).toEqual({ id: 0, x: 11, y: 10 });
    expect(r.kind === "points" && r.change).toBe(
      "Bod (10, 10) posunut na (11, 10).",
    );
    expect(nudge(pts([[0, 5]]), 0, -1, 0)).toEqual({ kind: "none" });
    expect(
      nudge(
        pts([
          [10, 10],
          [11, 10],
        ]),
        0,
        1,
        0,
      ).kind,
    ).toBe("error");
  });
});

describe("legenda", () => {
  it("zametání: H, D, testovaný úhel, odebraný bod, zametací přímka, obal", () => {
    const l = hullLegend("sweep")
      .map((i) => i.label)
      .join(" | ");
    expect(l).toMatch(/horní obálka H/);
    expect(l).toMatch(/dolní obálka D/);
    expect(l).toMatch(/zametací přímka/);
    expect(l).toMatch(/odebraný/);
  });
  it("provázek: kandidát, zkoušený bod, nalezené úsečky", () => {
    const l = hullLegend("wrap")
      .map((i) => i.label)
      .join(" | ");
    expect(l).toMatch(/kandidát q/);
    expect(l).toMatch(/zkoušený bod p/);
  });
  it("každý vzorek má tvar nebo je výplň a vlastní třídu sw-…", () => {
    for (const a of ["sweep", "wrap"] as const)
      for (const i of hullLegend(a)) expect(i.cls).toMatch(/^sw-/);
  });
});

describe("tah a mazání bodu (planeDrag)", () => {
  const three = pts([
    [10, 10],
    [90, 10],
    [50, 90],
  ]);

  it("moveAt: přesun na zaokrouhlené souřadnice v rovině; na totožné místo chyba; beze změny nic", () => {
    const e = moveAt(three, 2, 61.4, 120);
    expect(e).toMatchObject({
      kind: "points",
      change: "Bod (50, 90) přesunut na (61, 100).",
    });
    expect(e.kind === "points" && e.points[2]).toEqual({
      id: 2,
      x: 61,
      y: 100,
    });
    expect(moveAt(three, 2, 10.2, 9.8)).toEqual({
      kind: "error",
      message: "Bod (10, 10) už v rovině je.",
    });
    expect(moveAt(three, 2, 50.3, 89.6)).toEqual({ kind: "none" });
  });

  it("removeId smaže bod podle id; removeAt podle souřadnic (akce Odebrat bod), chybějící bod = chyba", () => {
    expect(removeId(three, 1)).toMatchObject({
      kind: "points",
      change: "Odebrán bod (90, 10).",
    });
    expect(removeAt(three, 50, 90)).toMatchObject({
      kind: "points",
      change: "Odebrán bod (50, 90).",
    });
    expect(removeAt(three, 50, 50)).toEqual({
      kind: "error",
      message: "Bod (50, 50) v rovině není.",
    });
  });
});
