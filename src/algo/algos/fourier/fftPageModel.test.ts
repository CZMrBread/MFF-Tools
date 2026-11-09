// Model stránky #/fft/fft: příklady z knihy, odkaz (parametry za #), nabídka operací, běh → kroky.
import { describe, expect, it, vi } from "vitest";
import {
  initialMenu,
  validateArg,
  type ActionDef,
} from "../../core/actionModel";
import { FFT_EXAMPLES } from "./bookExamples";
import {
  DEFAULT_RUN,
  fftActions,
  fftCaption,
  fftUrlParams,
  parseFftUrl,
  runSteps,
  type FftRun,
} from "./fftPageModel";

const params = (s: string) => new URLSearchParams(s);

describe("příklady", () => {
  it("id jsou unikátní; knižní příklady mají zdroj se stranou kapitoly 17 (str. 423–440)", () => {
    const ids = FFT_EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of FFT_EXAMPLES)
      if (e.source) {
        const page = Number(e.source.match(/str\. (\d+)/)?.[1]);
        expect(page, e.id).toBeGreaterThanOrEqual(423);
        expect(page, e.id).toBeLessThanOrEqual(440);
      }
    expect(FFT_EXAMPLES.filter((e) => e.source).length).toBeGreaterThanOrEqual(
      5,
    );
  });

  it("je mezi nimi 123 × 456 (cv. 17.5.2) a vektory cvičení 17.3.2", () => {
    const num = FFT_EXAMPLES.find((e) => e.op === "mul" && e.base === 10)!;
    expect(num.p).toEqual([3, 2, 1]);
    expect(num.q).toEqual([6, 5, 4]);
    expect(num.source).toContain("17.5.2");
    expect(
      FFT_EXAMPLES.filter((e) => e.source?.includes("17.3.2")).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("každý příklad jde spustit a jeho poslední krok nese výsledek", () => {
    for (const e of FFT_EXAMPLES) {
      const steps = runSteps({ ...DEFAULT_RUN, ...e });
      expect(steps.length, e.id).toBeGreaterThan(1);
      expect(steps[steps.length - 1].state.result, e.id).not.toBeNull();
    }
  });
});

describe("odkaz", () => {
  it("prázdná adresa = výchozí příklad FFT(0, 1, …, 7) v ℂ", () => {
    const r = parseFftUrl(params(""));
    expect(r.notice).toBeNull();
    expect(r.run.op).toBe("fft");
    expect(r.run.p).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(r.run.field).toBe("C");
  });

  it.each<[Partial<FftRun>]>([
    [{ op: "fft", p: [1, 0, 1, 0, 1, 0, 1, 0], field: "C" }],
    [{ op: "fft", p: [0, 1, 2, 3], field: "Z17" }],
    [{ op: "ifft", p: [8, 0, 0, 0], field: "C" }],
    [{ op: "ifft", p: [0, 1, 2, 3, 4, 5, 6, 7], yFromFft: true, field: "C" }],
    [{ op: "mul", p: [3, 2, 1], q: [6, 5, 4], detail: "bf", base: 10 }],
    [{ op: "mul", p: [1, 2, 3], q: [4, 5, 6], field: "Z17", detail: "alg" }],
  ])("tam a zpět: %j", (patch) => {
    const run: FftRun = { ...DEFAULT_RUN, ...patch };
    const back = parseFftUrl(new URLSearchParams(fftUrlParams(run))).run;
    expect(back.op).toBe(run.op);
    expect(back.p).toEqual(run.p);
    expect(back.field).toBe(run.field);
    if (run.op === "mul") {
      expect(back.q).toEqual(run.q);
      expect(back.detail).toBe(run.detail);
      expect(back.base).toBe(run.base);
    }
    if (run.op === "ifft") expect(back.yFromFft).toBe(run.yFromFft);
  });

  it("neplatný odkaz → výchozí příklad s hláškou; příliš dlouhý vstup se ohlásí", () => {
    const bad = parseFftUrl(params("p=abc&op=fft"));
    expect(bad.run.p).toEqual(DEFAULT_RUN.p);
    expect(bad.notice).toMatch(/výchozí/);
    const long = parseFftUrl(params("op=mul&p=1,2,3,4,5,6,7,8,9&q=1"));
    expect(long.run.p).toEqual(DEFAULT_RUN.p);
    expect(long.notice).not.toBeNull();
  });

  it("základ b u násobení čísel: celé 2–16 a číslice menší než základ, jinak bez převodu s poznámkou", () => {
    const frac = parseFftUrl(params("op=mul&p=3,2,1&q=6,5,4&b=2.5"));
    expect(frac.run.base).toBeNull();
    expect(frac.notice).toMatch(/[Zz]áklad/);
    const digit = parseFftUrl(params("op=mul&p=3,2,1&q=6,5,4&b=4"));
    expect(digit.run.base).toBeNull(); // číslice 5 a 6 nejsou v soustavě o základu 4
    expect(digit.notice).toMatch(/[Zz]áklad/);
    const ok = parseFftUrl(params("op=mul&p=3,2,1&q=6,5,4&b=10"));
    expect(ok.run.base).toBe(10);
    expect(ok.notice).toBeNull();
    expect(parseFftUrl(params("op=mul&p=3,2,1&q=6,5,4")).notice).toBeNull();
  });

  it("ručně psaný odkaz ?p=… bez op je FFT", () => {
    expect(parseFftUrl(params("p=1,0,1,0,1,0,1,0")).run.op).toBe("fft");
  });
});

describe("nabídka operací", () => {
  const ctx = () => ({
    run: DEFAULT_RUN,
    hasResult: true,
    start: vi.fn(),
    load: vi.fn(),
    random: vi.fn(),
    now: () => 42,
  });
  const byId = (defs: ActionDef[], id: string) =>
    defs.find((d) => d.id === id)!;

  it("akce: Vytvořit (Náhodně), Příklady z knihy, FFT(p), Inverzní FFT(y), Násobení P · Q; Výchozí příklad je tlačítko Visualizeru (CROSS-04, CROSS-07)", () => {
    const defs = fftActions(ctx());
    expect(defs.map((d) => d.id)).toEqual([
      "create",
      "examples",
      "fft",
      "ifft",
      "mul",
    ]);
    expect(byId(defs, "fft").label).toBe("FFT(p)");
    const create = byId(defs, "create");
    expect(create.label).toBe("Vytvořit");
    expect(create.variants!.map((v) => v.label)).toEqual(["Náhodně"]);
    expect(create.variants![0].args!.map((a) => a.name)).toEqual(["n"]);
    initialMenu(defs); // varianty jsou platné
  });

  it("potvrzení „Spočítat FFT“ / „Spočítat inverzní FFT“ (ne „Spustit“ – nic se nepřehrává samo, CROSS-08)", () => {
    const defs = fftActions(ctx());
    expect(byId(defs, "fft").goLabel).toBe("Spočítat FFT");
    expect(byId(defs, "ifft").goLabel).toBe("Spočítat inverzní FFT");
  });

  it("vstup, který není 2ᵏ, se doplní nulami s poznámkou; první krok uvede doplněný vektor (NEWMODS-14)", () => {
    const fft = byId(fftActions(ctx()), "fft");
    expect(fft.notice?.({ p: [1, 2, 3, 4, 5], f: "C" }, null)).toContain(
      "Doplněno nulami na n = 8 (FFT potřebuje n = 2ᵏ).",
    );
    expect(
      fft.notice?.({ p: [1, 2, 3, 4, 5, 6, 7, 8], f: "C" }, null),
    ).toBeNull();
    const first = runSteps({ ...DEFAULT_RUN, p: [1, 2, 3, 4, 5] })[0];
    expect(first.message).toContain("0, 0, 0");
  });

  it("FFT(p) spustí běh s vstupem a tělesem; seznam bere nejvýš 16 čísel", () => {
    const c = ctx();
    const fft = byId(fftActions(c), "fft");
    fft.run({ p: [1, 2, 3], f: "Z17" }, null);
    expect(c.start).toHaveBeenCalledWith({
      op: "fft",
      p: [1, 2, 3],
      field: "Z17",
    });
    const p = fft.args!.find((a) => a.name === "p")!;
    expect(
      validateArg(p, "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17").note,
    ).toMatch(/17/);
  });

  it("Inverzní FFT: vlastní y, nebo výsledek poslední FFT", () => {
    const c = ctx();
    const ifft = byId(fftActions(c), "ifft");
    expect(ifft.variants!.map((v) => v.id)).toEqual(["own", "result"]);
    ifft.run({ y: [8, 0, 0, 0], f: "C" }, "own");
    expect(c.start).toHaveBeenLastCalledWith({
      op: "ifft",
      p: [8, 0, 0, 0],
      field: "C",
      yFromFft: false,
    });
    ifft.run({}, "result");
    expect(c.start).toHaveBeenLastCalledWith({
      op: "ifft",
      p: DEFAULT_RUN.p,
      field: DEFAULT_RUN.field,
      yFromFft: true,
    });
  });

  it("Násobení P · Q: dva seznamy (nejvýš 8), těleso a podrobnost", () => {
    const c = ctx();
    const mul = byId(fftActions(c), "mul");
    mul.run({ P: [3, 2, 1], Q: [6, 5, 4], f: "C", d: "bf" }, null);
    expect(c.start).toHaveBeenCalledWith({
      op: "mul",
      p: [3, 2, 1],
      q: [6, 5, 4],
      field: "C",
      detail: "bf",
    });
    const P = mul.args!.find((a) => a.name === "P")!;
    expect(P.kind === "list" && P.maxCount).toBe(8);
  });

  it("Příklady z knihy načtou příklad; Náhodně dostane semínko", () => {
    const c = ctx();
    const defs = fftActions(c);
    const ex = byId(defs, "examples");
    ex.run({}, ex.variants![1].id);
    expect(c.load).toHaveBeenCalledWith(FFT_EXAMPLES[1]);
    byId(defs, "create").run({ n: "16" }, "random");
    expect(c.random).toHaveBeenCalledWith(42, 16);
  });
});

describe("název běhu", () => {
  it("FFT, inverze a násobení; u knižního příkladu i zdroj", () => {
    expect(fftCaption(DEFAULT_RUN)).toBe("FFT(0, 1, 2, 3, 4, 5, 6, 7)");
    expect(
      fftCaption({ ...DEFAULT_RUN, op: "mul", p: [3, 2, 1], q: [6, 5, 4] }),
    ).toBe("Násobení (3, 2, 1) · (6, 5, 4)");
    const num = FFT_EXAMPLES.find((e) => e.base === 10)!;
    expect(fftCaption({ ...DEFAULT_RUN, ...num, example: num.id })).toContain(
      "17.5.2",
    );
    expect(fftCaption({ ...DEFAULT_RUN, op: "ifft", yFromFft: true })).toBe(
      "Inverzní FFT(F(0, 1, 2, 3, 4, 5, 6, 7))",
    );
    expect(fftCaption({ ...DEFAULT_RUN, field: "Z17" })).toBe(
      "FFT(0, 1, 2, 3, 4, 5, 6, 7) v ℤ₁₇",
    );
  });
});

describe("odkaz na knižní příklad (NEWMODS-11)", () => {
  it("?p=1,1,1,1,1,1,1,1 = cvičení 17.3.2: běh pozná příklad a nadpis uvede zdroj", () => {
    const r = parseFftUrl(params("p=1,1,1,1,1,1,1,1")).run;
    expect(r.example).toBe("ones");
    expect(fftCaption(r)).toContain("Cvičení 17.3.2");
    // vlastní vstup žádný příklad nemá
    expect(parseFftUrl(params("p=1,2")).run.example).toBeNull();
  });
});
