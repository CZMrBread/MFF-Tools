// Model stránky #/fft/net: příklady z knihy, odkaz (parametry za #), nabídka operací, běh → kroky.
import { describe, expect, it, vi } from "vitest";
import {
  initialMenu,
  validateArg,
  type ActionDef,
} from "../../core/actionModel";
import {
  NET_DEFAULT,
  NET_EXAMPLES,
  netActions,
  netCaption,
  netRandom,
  netRunSteps,
  netUrlParams,
  parseNetUrl,
  stepOfGate,
  type NetCtx,
} from "./fft2PageModel";

const params = (s: string) => new URLSearchParams(s);
const result = (xs: number[], field: "C" | "Z17" = "C") => {
  const s = netRunSteps({ ...NET_DEFAULT, x: xs, field });
  return s[s.length - 1].state.result!.map(
    (z) => Math.round(z.re * 1e6) / 1e6 + 0,
  );
};

describe("příklady", () => {
  it("id jsou unikátní; knižní mají zdroj se stranou 17. kapitoly (432–440)", () => {
    const ids = NET_EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of NET_EXAMPLES)
      if (e.source) {
        const page = Number(e.source.match(/str\. (\d+)/)?.[1]);
        expect(page, e.id).toBeGreaterThanOrEqual(432);
        expect(page, e.id).toBeLessThanOrEqual(440);
      }
    expect(NET_EXAMPLES.filter((e) => e.source).length).toBeGreaterThanOrEqual(
      5,
    );
  });

  it("výchozí příklad je síť obr. 17.4 (n = 8)", () => {
    const fig = NET_EXAMPLES.find((e) => e.id === NET_DEFAULT.example)!;
    expect(fig.source).toContain("Obr. 17.4, str. 438");
    expect(fig.x).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("výsledky příkladů podle knihy (cv. 17.3.2, ℤ₁₇ ze str. 439)", () => {
    const by = (id: string) => NET_EXAMPLES.find((e) => e.id === id)!;
    expect(result(by("ones").x)).toEqual([8, 0, 0, 0, 0, 0, 0, 0]);
    expect(result(by("alternating").x)).toEqual([0, 0, 0, 0, 8, 0, 0, 0]);
    expect(result(by("every-other").x)).toEqual([4, 0, 0, 0, 4, 0, 0, 0]);
    expect(result(by("z17").x, "Z17")).toEqual([11, 8, 14, 6, 13, 3, 12, 1]);
    expect(by("z17").field).toBe("Z17");
  });

  it("každý příklad jde spustit a poslední krok nese výsledek", () => {
    for (const e of NET_EXAMPLES) {
      const s = netRunSteps({ ...NET_DEFAULT, ...e });
      expect(s[s.length - 1].state.result, e.id).not.toBeNull();
    }
  });
});

describe("běh", () => {
  it("vstup se doplní nulami na mocninu dvojky (aspoň 4, nejvýš 16)", () => {
    expect(netRunSteps({ ...NET_DEFAULT, x: [1, 2, 3, 4, 5] })[0].state.n).toBe(
      8,
    );
    expect(netRunSteps({ ...NET_DEFAULT, x: [1, 2] })[0].state.n).toBe(4);
    expect(
      netRunSteps({ ...NET_DEFAULT, x: Array(16).fill(1) })[0].state.n,
    ).toBe(16);
  });

  it("stepOfGate: klik na kroužek najde krok jeho motýlku (ř. 8)", () => {
    const s = netRunSteps(NET_DEFAULT);
    const i = stepOfGate(s, 2, 3);
    expect(s[i].line).toBe(8);
    expect(s[i].state.layer).toBe(2);
    expect(s[i].state.gates).toContain(3);
    const lay = netRunSteps({ ...NET_DEFAULT, detail: "layer" });
    expect(lay[stepOfGate(lay, 3, 0)].state.layer).toBe(3);
  });

  it("náhodný vstup: n čísel 0–9, deterministicky podle semínka", () => {
    expect(netRandom(1, 16).x.length).toBe(16);
    expect(netRandom(5, 4)).toEqual(netRandom(5, 4));
    expect(netRandom(5, 8).x.every((v) => v >= 0 && v <= 9)).toBe(true);
  });
});

describe("odkaz", () => {
  it("prázdná adresa = výchozí příklad bez hlášky", () => {
    const r = parseNetUrl(params(""));
    expect(r.notice).toBeNull();
    expect(r.run).toEqual(NET_DEFAULT);
  });

  it("tam a zpět: x, těleso ℤ₁₇ a podrobnost po vrstvách", () => {
    const run = {
      ...NET_DEFAULT,
      x: [1, -2, 3],
      field: "Z17" as const,
      detail: "layer" as const,
      example: null,
    };
    const p = netUrlParams(run);
    expect(p).toEqual({ x: "1,-2,3", f: "z17", d: "layer" });
    const back = parseNetUrl(params(new URLSearchParams(p).toString()));
    expect(back.run).toMatchObject({
      x: [1, -2, 3],
      field: "Z17",
      detail: "layer",
    });
    expect(netUrlParams(NET_DEFAULT)).toEqual({ x: "0,1,2,3,4,5,6,7" });
  });

  it("neplatný nebo příliš dlouhý vstup → výchozí příklad s hláškou", () => {
    for (const bad of ["x=abc", "x=", `x=${Array(17).fill(1).join(",")}`]) {
      const r = parseNetUrl(params(bad));
      expect(r.run.x, bad).toEqual(NET_DEFAULT.x);
      expect(r.notice, bad).toMatch(/výchozí/);
    }
  });
});

describe("nabídka", () => {
  const ctx = () =>
    ({
      run: NET_DEFAULT,
      start: vi.fn(),
      load: vi.fn(),
      random: vi.fn(),
      now: () => 42,
    }) satisfies NetCtx;
  const byId = (defs: ActionDef[], id: string) =>
    defs.find((d) => d.id === id)!;

  it("akce: Vytvořit (Náhodně s n), Příklady z knihy, FFT2(x); Výchozí příklad je tlačítko Visualizeru; potvrzení „Spočítat FFT2“", () => {
    const defs = netActions(ctx());
    expect(defs.map((d) => d.id)).toEqual(["create", "examples", "fft2"]);
    expect(byId(defs, "fft2").label).toBe("FFT2(x)");
    expect(byId(defs, "fft2").goLabel).toBe("Spočítat FFT2");
    expect(byId(defs, "create").variants!.map((v) => v.label)).toEqual([
      "Náhodně",
    ]);
    initialMenu(defs);
  });

  it("FFT2(x) spustí běh se vstupem, tělesem a podrobností; nejvýš 16 čísel", () => {
    const c = ctx();
    const a = byId(netActions(c), "fft2");
    a.run({ x: [1, 2, 3, 4], f: "Z17", d: "layer" }, null);
    expect(c.start).toHaveBeenCalledWith({
      x: [1, 2, 3, 4],
      field: "Z17",
      detail: "layer",
    });
    const x = a.args!.find((d) => d.name === "x")!;
    expect(
      validateArg(x, "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17").note,
    ).toMatch(/17/);
  });

  it("Příklady z knihy načtou příklad; Náhodně n = 4 / 8 / 16 se semínkem", () => {
    const c = ctx();
    const defs = netActions(c);
    const ex = byId(defs, "examples");
    ex.run({}, ex.variants![1].id);
    expect(c.load).toHaveBeenCalledWith(NET_EXAMPLES[1]);
    const rnd = byId(defs, "create");
    const n = rnd.variants![0].args![0];
    expect(n.kind === "choice" && n.options.map((o) => o.value)).toEqual([
      "4",
      "8",
      "16",
    ]);
    rnd.run({ n: "16" }, "random");
    expect(c.random).toHaveBeenCalledWith(42, 16);
  });
});

describe("název běhu", () => {
  it("FFT2 se vstupem; u knižního příkladu zdroj, v ℤ₁₇ těleso", () => {
    expect(netCaption({ ...NET_DEFAULT, example: null })).toBe(
      "FFT2(0, 1, 2, 3, 4, 5, 6, 7)",
    );
    expect(netCaption(NET_DEFAULT)).toContain("Obr. 17.4, str. 438");
    expect(
      netCaption({ ...NET_DEFAULT, field: "Z17", example: null, x: [1, -2] }),
    ).toBe("FFT2(1, −2) v ℤ₁₇");
  });
});

describe("odkaz na knižní příklad (NEWMODS-11)", () => {
  it("#/fft/net?x=0,…,7&d=layer → příklad „po vrstvách“, nadpis „Hradlová síť, str. 439“", () => {
    const r = parseNetUrl(params("x=0,1,2,3,4,5,6,7&d=layer")).run;
    expect(r.example).toBe("layers");
    expect(netCaption(r)).toContain("Hradlová síť, str. 439");
    expect(parseNetUrl(params("x=5,6")).run.example).toBeNull();
  });

  it("doplnění nulami: poznámka u FFT2(x) (NEWMODS-14)", () => {
    const a = netActions({
      run: NET_DEFAULT,
      start: vi.fn(),
      load: vi.fn(),
      random: vi.fn(),
      now: () => 1,
    }).find((d) => d.id === "fft2")!;
    expect(a.notice?.({ x: [1, 2, 3, 4, 5], f: "C", d: "bf" }, null)).toContain(
      "n = 8",
    );
  });
});
