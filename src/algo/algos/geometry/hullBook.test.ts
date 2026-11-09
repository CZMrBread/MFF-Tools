// Předvolby konvexního obalu z Průvodce 16.1: souřadnice změřené z vektorové kresby obrázků (PDF, body) a
// převedené do roviny 0–100; testy ověřují, že algoritmus dává totéž co obrázky a text knihy.
import { describe, expect, it } from "vitest";
import { materialize } from "../../core/steps";
import { lexOrder, MAX_N, PLANE, sweep, wrap, type HullPt } from "./hull";
import {
  DEFAULT_EXAMPLE,
  FIG_16_1_FENCE,
  FIG_16_1_PDF,
  FIG_16_2_OPEN,
  FIG_16_3_NEW,
  FIG_16_3_REMOVED,
  HULL_EXAMPLES,
  exampleById,
  fromPdf,
} from "./hullBook";

const xy = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const at = (ps: readonly HullPt[], id: number) => ps.find((p) => p.id === id)!;

describe("knižní předvolby – obecně", () => {
  it("čtyři příklady (obr. 16.1, 16.2, 16.3, cv. 16.1.1), výchozí je jabloňový sad", () => {
    expect(HULL_EXAMPLES.map((e) => e.id)).toEqual([
      "obr-16-1",
      "obr-16-2",
      "obr-16-3",
      "cv-16-1-1",
    ]);
    expect(DEFAULT_EXAMPLE.id).toBe("obr-16-1");
    expect(exampleById("obr-16-2")?.alg).toBe("wrap");
    expect(exampleById("nic")).toBeNull();
  });

  it("body jsou různé, celočíselné, uvnitř roviny a nejvýš MAX_N", () => {
    for (const e of HULL_EXAMPLES) {
      expect(e.points.length).toBeLessThanOrEqual(MAX_N);
      expect(new Set(e.points.map(xy)).size, e.id).toBe(e.points.length);
      for (const p of e.points) {
        expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(PLANE[0]);
        expect(p.x).toBeLessThanOrEqual(PLANE[2]);
        expect(p.y).toBeGreaterThanOrEqual(PLANE[1]);
        expect(p.y).toBeLessThanOrEqual(PLANE[3]);
      }
      expect(e.label).toMatch(/^(Obr\.|Cv\.)/);
      expect(e.title.length).toBeGreaterThan(20);
    }
  });

  it("převod z PDF: x doprava, y z PDF (dolů) obráceně nahoru, zaokrouhleno", () => {
    expect(fromPdf([[100, 200]], { x0: 90, y0: 210, s: 2 })).toEqual([
      { id: 0, x: 20, y: 20 },
    ]);
  });
});

describe("obr. 16.1 – ohrazený jabloňový sad (str. 401)", () => {
  const e = exampleById("obr-16-1")!;
  it("21 jabloní z kresby, plot má 10 vrcholů – přesně stromy na lomené čáře obrázku, ve stejném pořadí", () => {
    expect(e.points).toHaveLength(FIG_16_1_PDF.length);
    expect(e.points).toHaveLength(21);
    const st = materialize(sweep(e.points)).at(-1)!.state;
    expect(st.hull).toEqual(FIG_16_1_FENCE);
    expect(st.hull).toHaveLength(10);
  });
  it("provázkový algoritmus dá stejný plot", () => {
    const st = materialize(wrap(e.points)).at(-1)!.state;
    expect(st.hull).toEqual(FIG_16_1_FENCE);
  });
});

describe("obr. 16.2 – provázkový algoritmus (str. 402)", () => {
  const e = exampleById("obr-16-2")!;
  it("z L najde postupně tři úsečky obalu z obrázku (prázdná kolečka L → X → … )", () => {
    const steps = materialize(wrap(e.points));
    const L = lexOrder(e.points)[0];
    expect(L.id).toBe(FIG_16_2_OPEN[0]);
    // stav po třetí přijaté úsečce (ř. 6 „Úsečka cq patří do obalu“)
    const accepted = steps.filter((s) => s.line === 5);
    expect(accepted[2].state.chain).toEqual(FIG_16_2_OPEN);
    // plné tečky z obrázku nejsou v té chvíli na obalu
    for (const p of e.points)
      if (!FIG_16_2_OPEN.includes(p.id))
        expect(accepted[2].state.chain).not.toContain(p.id);
  });
  it("první polopřímka z L míří doleva a otáčí se po směru hodinových ručiček – první úsečka vede nahoru", () => {
    const [L, X] = FIG_16_2_OPEN.map((id) => at(e.points, id));
    expect(X.y).toBeGreaterThan(L.y);
    expect(X.x).toBeGreaterThan(L.x);
  });
});

describe("obr. 16.3 – přidání bodu do konvexního obalu (str. 403)", () => {
  const e = exampleById("obr-16-3")!;
  const steps = materialize(sweep(e.points));
  const b = FIG_16_3_NEW;

  it("nový bod je nejpravější – zpracuje se jako poslední", () => {
    expect(lexOrder(e.points).at(-1)!.id).toBe(b);
  });
  it("„proti směru ručiček musíme odstranit dokonce tři body“ – z horní obálky odejdou tři prázdná kolečka", () => {
    const popsH = steps.filter(
      (s) =>
        s.state.cur === b && s.state.env === "H" && s.state.popped !== null,
    );
    expect(popsH.map((s) => s.state.popped)).toEqual(FIG_16_3_REMOVED);
  });
  it("„po směru hodinových ručiček nemusíme odebrat ani jeden bod“ – dolní obálka nic neodebere", () => {
    const popsD = steps.filter(
      (s) =>
        s.state.cur === b && s.state.env === "D" && s.state.popped !== null,
    );
    expect(popsD).toHaveLength(0);
  });
  it("výsledný obal = pravý obrázek: z odebraných bodů zůstane na obalu jen ten, který patří i do dolní obálky", () => {
    const st = steps.at(-1)!.state;
    expect(st.hull).toContain(b);
    expect(st.hull).not.toContain(FIG_16_3_REMOVED[1]);
    expect(st.hull).not.toContain(FIG_16_3_REMOVED[2]);
    expect(st.hull).toContain(FIG_16_3_REMOVED[0]);
    expect(st.hull).toHaveLength(6);
  });
});

describe("cvičení 16.1.1 – tři body na přímce", () => {
  const e = exampleById("cv-16-1-1")!;
  it("dolní obálka si nechá body na přímce (úhel 180°), horní je odebere", () => {
    const st = materialize(sweep(e.points)).at(-1)!.state;
    const pts = (ids: number[]) => ids.map((id) => xy(at(e.points, id)));
    expect(pts(st.H)).toEqual(["10,20", "10,80", "90,80"]);
    expect(pts(st.D)).toEqual([
      "10,20",
      "30,20",
      "50,20",
      "70,20",
      "90,20",
      "90,80",
    ]);
  });
});
