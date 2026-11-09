/*
 * Červeno-černý strom LLRB (Průvodce 8.4, str. 206–214): procedury LlrbInsert (obě varianty), LlrbFixup,
 * MoveRedLeft, MoveRedRight, LlrbDeleteMin, LlrbDeleteMax a LlrbDelete. Výsledky se porovnávají s obrázky
 * a textem knihy a s množinovým modelem; po každé operaci platí axiomy LLRB stromu.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import {
  PC_LLRB_DELETE,
  PC_LLRB_DELETE_MAX,
  PC_LLRB_DELETE_MIN,
  PC_LLRB_INSERT_23,
  PC_LLRB_INSERT_24,
  blackHeight,
  buildLlrb,
  emptyLlrb,
  islands,
  islandsLayout,
  llrbDelete,
  llrbDeleteMax,
  llrbDeleteMin,
  llrbFind,
  llrbFromSpec,
  llrbInsert,
  llrbKeys,
  llrbLayout,
  llrbProblems,
  llrbShape,
  llrbSpec,
  type LlrbState,
  type LlrbVariant,
} from "./llrb";

const run = (
  gen: (
    st: LlrbState,
  ) => Generator<import("../../core/steps").Step<LlrbState>, void, unknown>,
  st: LlrbState,
) => materialize(gen(structuredClone(st)));

const last = <T>(a: readonly T[]) => a[a.length - 1];

/** Tvar „klíč(levý, pravý)“ s r u vrcholu s červenou hranou shora – čitelné srovnání s obrázky. */
const shape = llrbShape;

const spec = (s: string, v: LlrbVariant = "23") => {
  const st = llrbFromSpec(s, v);
  if (!st) throw new Error(`neplatný zápis ${s}`);
  return st;
};

describe("zápis stromu (odkaz t=)", () => {
  it("po hladinách, r = červená hrana shora; zpět dá stejný řetězec", () => {
    const st = spec("4,1r,6r,0,3,5,8,2r,7r,9r", "24");
    expect(llrbSpec(st)).toBe("4,1r,6r,0,3,5,8,2r,7r,9r");
    expect(shape(st)).toBe("4(1r(0,3(2r,-)),6r(5,8(7r,9r)))");
  });
  it("neplatný zápis (text, opakovaný klíč, prázdný) → null", () => {
    expect(llrbFromSpec("4,x", "23")).toBeNull();
    expect(llrbFromSpec("4,4r", "23")).toBeNull();
    expect(llrbFromSpec("", "23")).toBeNull();
  });
  it("kořen je vždy černý (barva hrany nad kořenem nemá význam)", () => {
    expect(llrbSpec(spec("4r,1r"))).toBe("4,1r");
  });
});

describe("axiomy LLRB (str. 206)", () => {
  it("obr. 8.11 je platný LLRB strom varianty (2,4), ne (2,3) – má 4-vrcholy", () => {
    const st = spec("4,1r,6r,0,3,5,8,2r,7r,9r", "24");
    expect(llrbProblems(st)).toEqual([]);
    expect(blackHeight(st)).toBe(2);
    // ve variantě (2,3) jsou oba ostrůvky {1 4 6} a {7 8 9} navíc
    expect(llrbProblems({ ...st, variant: "23" })).toEqual([
      expect.stringMatching(/vrchol 4 .*4-vrchol/),
      expect.stringMatching(/vrchol 8 .*4-vrchol/),
    ]);
  });
  it("hlásí dvě červené hrany nad sebou, osamělou pravou červenou hranu a různé černé hloubky", () => {
    expect(llrbProblems(spec("3,2r,1r"))).toEqual([
      expect.stringMatching(/Axiom 1/),
    ]);
    expect(llrbProblems(spec("1,2r"))).toEqual([
      expect.stringMatching(/Axiom 2/),
    ]);
    expect(llrbProblems(spec("2,1"))).toEqual([
      expect.stringMatching(/Axiom 4/),
    ]);
  });
});

describe("překlad na (2,4)-strom – obr. 8.11", () => {
  it("ostrůvky spojené červenými hranami jsou vrcholy (2,4)-stromu z obrázku", () => {
    const st = spec("4,1r,6r,0,3,5,8,2r,7r,9r", "24");
    const isl = islands(st);
    const root = isl.find((i) => i.depth === 0)!;
    expect(root.keys).toEqual([1, 4, 6]);
    expect(root.children.map((c) => isl.find((i) => i.id === c)!.keys)).toEqual(
      [[0], [2, 3], [5], [7, 8, 9]],
    );
    const lay = islandsLayout(st);
    expect(lay.nodes.map((n) => n.keys.join(" ")).sort()).toEqual(
      ["0", "1 4 6", "2 3", "5", "7 8 9"].sort(),
    );
    expect(lay.edges).toHaveLength(4);
  });
});

describe("rozložení kresby", () => {
  it("červená hrana a vrchol pod ní nesou třídy e-red / n-red, kořen nikdy", () => {
    const st = spec("2,1r");
    const lay = llrbLayout(st);
    const one = lay.nodes.find((n) => n.label === "1")!;
    const two = lay.nodes.find((n) => n.label === "2")!;
    expect(one.cls).toContain("n-red");
    expect(two.cls ?? "").not.toContain("n-red");
    expect(lay.edges[0].cls).toContain("e-red");
    expect(one.aria).toMatch(/červen/);
  });
});

describe("LlrbInsert – varianta (2,3) s LlrbFixup (str. 210)", () => {
  it("str. 209: nekorektní 3-vrchol (pravá červená hrana) se zrotuje", () => {
    const steps = run((s) => llrbInsert(s, 2), spec("1"));
    expect(shape(last(steps).state)).toBe("2(1r,-)");
    const rot = steps.find((s) => /rotujeme/i.test(s.message))!;
    expect(PC_LLRB_INSERT_23[rot.line!]).toMatch(/Rotace\(v, r\(v\)\)/);
  });
  it("str. 209: dvě levé červené hrany nad sebou → rotace horní hrany, pak přebarvení", () => {
    const steps = run((s) => llrbInsert(s, 1), spec("3,2r"));
    expect(shape(last(steps).state)).toBe("2(1,3)");
    const lines = steps.map((s) => s.line);
    const rot = PC_LLRB_INSERT_23.findIndex((l) =>
      l.includes("Rotace(v, ℓ(v))"),
    );
    const flip = PC_LLRB_INSERT_23.findIndex((l) => l.includes("přebarvíme"));
    expect(lines).toContain(rot);
    expect(lines).toContain(flip);
    expect(lines.indexOf(flip)).toBeGreaterThan(lines.indexOf(rot));
  });
  it("str. 209: pravá červená hrana pod levou → dvě rotace a přebarvení", () => {
    const steps = run((s) => llrbInsert(s, 2), spec("3,1r"));
    expect(shape(last(steps).state)).toBe("2(1,3)");
    expect(steps.filter((s) => /^Po rotaci/.test(s.message))).toHaveLength(2);
  });
  it("vložení existujícího klíče nic nezmění (ⓘ)", () => {
    const st = spec("2,1r");
    const steps = run((s) => llrbInsert(s, 1), st);
    expect(last(steps).outcome).toBe("neutral");
    expect(llrbSpec(last(steps).state)).toBe("2,1r");
  });
  it("vzestupná posloupnost 1…15 dá dokonale vyvážený strom (všechny hrany černé)", () => {
    const st = buildLlrb(
      Array.from({ length: 15 }, (_, i) => i + 1),
      "23",
    );
    expect(llrbProblems(st)).toEqual([]);
    expect(llrbKeys(st)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    // černé hrany na cestě z kořene do listu včetně hrany do vnějšího vrcholu
    expect(blackHeight(st)).toBe(4);
    expect(llrbSpec(st)).toBe("8,4,12,2,6,10,14,1,3,5,7,9,11,13,15");
  });
});

describe("LlrbInsert – varianta (2,4), štěpení shora dolů (str. 210)", () => {
  it("cestou dolů přebarví 4-vrchol (krok 3) dřív, než sestoupí", () => {
    const st = spec("2,1r,3r", "24");
    const steps = run((s) => llrbInsert(s, 4), st);
    const flip = PC_LLRB_INSERT_24.findIndex((l) => l.includes("přebarvíme"));
    const first = steps.findIndex((s) => s.line === flip);
    const descend = steps.findIndex((s) => /pokračujeme/.test(s.message));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(descend);
    expect(shape(last(steps).state)).toBe("2(1,4(3r,-))");
  });
  it("obr. 8.11 + Insert(10): rozštěpí se kořen {1 4 6} i {7 8 9}", () => {
    const st = spec("4,1r,6r,0,3,5,8,2r,7r,9r", "24");
    const end = last(run((s) => llrbInsert(s, 10), st)).state;
    expect(llrbProblems(end)).toEqual([]);
    const flips = run((s) => llrbInsert(s, 10), st).filter((s) =>
      /^Přebarvíme/.test(s.message),
    );
    expect(flips.map((s) => s.message)).toEqual([
      expect.stringContaining("4"),
      expect.stringContaining("8"),
    ]);
    expect(islands(end).find((i) => i.depth === 0)!.keys).toEqual([4]);
  });
});

describe("mazání – MoveRedLeft, MoveRedRight (str. 211–214)", () => {
  it("str. 211: LlrbDeleteMin s rotacemi v MoveRedLeft (pravý syn má levou červenou hranu)", () => {
    const steps = run(llrbDeleteMin, spec("2,1,4,3r"));
    expect(shape(last(steps).state)).toBe("3(2,4)");
    const rot = PC_LLRB_DELETE_MIN.findIndex((l) =>
      l.includes("Rotace(r(v), ℓ(r(v)))"),
    );
    expect(steps.some((s) => s.line === rot)).toBe(true);
  });
  it("str. 213: LlrbDeleteMax s rotací v MoveRedRight (levý syn má levou červenou hranu)", () => {
    const steps = run(llrbDeleteMax, spec("3,2,4,1r"));
    expect(shape(last(steps).state)).toBe("2(1,3)");
    const rot = PC_LLRB_DELETE_MAX.findIndex((l) =>
      l.includes("t ← Rotace(v, ℓ(v))"),
    );
    expect(steps.some((s) => s.line === rot)).toBe(true);
  });
  it("Delete(x) klíče se dvěma syny prohodí klíč s minimem pravého podstromu", () => {
    const steps = run((s) => llrbDelete(s, 2), spec("2,1,3"));
    const swap = PC_LLRB_DELETE.findIndex((l) => l.includes("Prohodíme"));
    expect(steps.some((s) => s.line === swap)).toBe(true);
    const end = last(steps).state;
    expect(llrbKeys(end)).toEqual([1, 3]);
    expect(llrbProblems(end)).toEqual([]);
  });
  it("ℓ(ℓ(v)) = ∅ se počítá jako černý: Delete(1) z 4(2(1,3),6(5,7)) nepoškodí černé axiomy", () => {
    // doslovné čtení „ℓ(v) i ℓ(ℓ(v)) existují“ by smazalo černý list 1 a porušilo axiom 4
    const end = last(run((s) => llrbDelete(s, 1), spec("4,2,6,1,3,5,7"))).state;
    expect(llrbKeys(end)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(llrbProblems(end)).toEqual([]);
  });
  it("Delete chybějícího klíče: ⓘ, když se strom nezměnil", () => {
    const steps = run((s) => llrbDelete(s, 9), spec("2,1r"));
    expect(last(steps).outcome).toBe("neutral");
    expect(last(steps).message).toMatch(/nebyl/);
  });
  it("Delete jediného vrcholu dá prázdný strom", () => {
    const end = last(run((s) => llrbDelete(s, 5), spec("5"))).state;
    expect(end.root).toBeNull();
  });
});

describe("Find", () => {
  it("najde klíč (✓) a nenajde chybějící (ⓘ)", () => {
    const st = spec("4,1r,6r,0,3,5,8,2r,7r,9r", "24");
    const ok = run((s) => llrbFind(s, 7), st);
    expect(last(ok).outcome).toBeUndefined();
    expect(last(ok).message).toMatch(/nalezen/);
    expect(last(run((s) => llrbFind(s, 11), st)).outcome).toBe("neutral");
  });
});

describe("množinový model a axiomy po každé operaci", () => {
  for (const variant of ["23", "24"] as const)
    it(`náhodné Insert (varianta ${variant}) – axiomy platí, klíče jako množina`, () => {
      const r = rng(7 + variant.length);
      for (let t = 0; t < 30; t++) {
        let st = emptyLlrb(variant);
        const set = new Set<number>();
        for (let i = 0; i < 25; i++) {
          const x = Math.floor(r() * 40);
          st = last(run((s) => llrbInsert(s, x), st)).state;
          set.add(x);
          expect(llrbProblems(st)).toEqual([]);
          expect(llrbKeys(st)).toEqual([...set].sort((a, b) => a - b));
        }
      }
    });

  it("náhodné Insert / Delete / DeleteMin / DeleteMax (varianta (2,3))", () => {
    const r = rng(42);
    for (let t = 0; t < 40; t++) {
      let st = emptyLlrb("23");
      let set: number[] = [];
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(r() * 30);
        const k = r();
        if (k < 0.45) {
          st = last(run((s) => llrbInsert(s, x), st)).state;
          if (!set.includes(x)) set.push(x);
        } else if (k < 0.8) {
          st = last(run((s) => llrbDelete(s, x), st)).state;
          set = set.filter((y) => y !== x);
        } else if (k < 0.9) {
          if (!set.length) continue;
          st = last(run(llrbDeleteMin, st)).state;
          set = set.filter((y) => y !== Math.min(...set));
        } else {
          if (!set.length) continue;
          st = last(run(llrbDeleteMax, st)).state;
          set = set.filter((y) => y !== Math.max(...set));
        }
        expect(llrbProblems(st)).toEqual([]);
        expect(llrbKeys(st)).toEqual([...set].sort((a, b) => a - b));
      }
    }
  });
});

describe("kroky", () => {
  it("každý krok má řádek z pseudokódu operace (kromě závěrečného) a poslední začíná názvem operace", () => {
    const st = buildLlrb([5, 2, 8, 1, 4, 7, 9, 0, 3, 6], "23");
    const cases: [ReturnType<typeof run>, string[], RegExp][] = [
      [run((s) => llrbInsert(s, 10), st), PC_LLRB_INSERT_23, /^Insert\(10\)/],
      [run((s) => llrbDelete(s, 5), st), PC_LLRB_DELETE, /^Delete\(5\)/],
      [run(llrbDeleteMin, st), PC_LLRB_DELETE_MIN, /^DeleteMin/],
      [run(llrbDeleteMax, st), PC_LLRB_DELETE_MAX, /^DeleteMax/],
    ];
    for (const [steps, pc, title] of cases) {
      for (const s of steps.slice(0, -1)) {
        expect(s.line).not.toBeNull();
        expect(s.line!).toBeLessThan(pc.length);
      }
      expect(last(steps).line).toBeNull();
      expect(last(steps).message).toMatch(title);
    }
  });
  it("závěrečný krok nemá značky a v proměnných nese počty rotací a přebarvení", () => {
    const steps = run((s) => llrbInsert(s, 1), spec("3,2r"));
    const end = last(steps).state;
    expect(end.marks).toEqual({});
    expect(end.edgeMarks).toEqual({});
    expect(end.vars).toMatchObject({ rotace: 1, přebarvení: 1 });
  });
});
