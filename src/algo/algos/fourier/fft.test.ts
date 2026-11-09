// Rekurzivní FFT podle Průvodce 17.3 (Algoritmus FFT, str. 430; DFT a inverze str. 431–432).
// Konvence knihy: ω = e^{2πi/n}, y_j = Σ_k x_k · ω^{jk} – POZOR, numpy.fft má opačné znaménko.
import { describe, expect, it } from "vitest";
import { parseMath } from "../../core/format";
import { materialize } from "../../core/steps";
import { c, cClose, type C } from "./complex";
import { FIELDS } from "./field";
import {
  callTree,
  circleMarks,
  codeFor,
  dft,
  fft,
  fftSteps,
  ifft,
  ifftSteps,
  PC_FFT,
  PC_IFFT,
  tableModel,
  toField,
  transformSize,
  type FftState,
} from "./fft";

const F = FIELDS.C;
const re = (xs: number[]): C[] => xs.map((x) => c(x));
const S2 = 4 * (1 + Math.SQRT2); // 9.657 (fft.md §3)
const S2m = 4 * (Math.SQRT2 - 1); // 1.657
const F0_7: C[] = [
  c(28),
  c(-4, -S2),
  c(-4, -4),
  c(-4, -S2m),
  c(-4),
  c(-4, S2m),
  c(-4, 4),
  c(-4, S2),
];

function expectVec(got: readonly (C | null)[] | null, want: readonly C[]) {
  expect(got).not.toBeNull();
  expect(got!.length).toBe(want.length);
  got!.forEach((z, i) =>
    expect(cClose(z!, want[i], 1e-9), `[${i}] ${JSON.stringify(z)}`).toBe(true),
  );
}

/** deterministické „náhodné“ vektory */
function lcg(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 20 - 10;
}

describe("DFT podle definice (str. 431) – cvičení 17.3.2 (str. 432), n = 8", () => {
  it.each([
    [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [8, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
      [1, -1, 1, -1, 1, -1, 1, -1],
      [0, 0, 0, 0, 8, 0, 0, 0],
    ],
    [
      [1, 0, 1, 0, 1, 0, 1, 0],
      [4, 0, 0, 0, 4, 0, 0, 0],
    ],
  ])("F(%j) = %j", (x, y) => {
    expectVec(dft(re(x), F), re(y));
    expectVec(fft(re(x), F), re(y));
  });

  it("(ω⁰, ω¹, …, ω⁷) má obraz (0, …, 0, 8) a (ω⁰, ω², …, ω¹⁴) obraz (0, …, 8, 0) – cvičení 17.3.2", () => {
    const w = Array.from({ length: 8 }, (_, k) => F.omega(8, k, false));
    const w2 = Array.from({ length: 8 }, (_, k) => F.omega(8, 2 * k, false));
    expectVec(fft(w, F), re([0, 0, 0, 0, 0, 0, 0, 8]));
    expectVec(fft(w2, F), re([0, 0, 0, 0, 0, 0, 8, 0]));
  });

  it("F(0, 1, …, 7) = (28, −4−9.657i, −4−4i, −4−1.657i, −4, −4+1.657i, −4+4i, −4+9.657i) (vstup obr. 17.4)", () => {
    expectVec(dft(re([0, 1, 2, 3, 4, 5, 6, 7]), F), F0_7);
    expectVec(fft(re([0, 1, 2, 3, 4, 5, 6, 7]), F), F0_7);
  });

  it("y₀ = součet složek a y_{n/2} = střídavý součet (cvičení 17.3.1)", () => {
    const x = re([3, 1, 4, 1, 5, 9, 2, 6]);
    const y = fft(x, F);
    expect(y[0].re).toBeCloseTo(31, 9);
    expect(y[4].re).toBeCloseTo(3 - 1 + 4 - 1 + 5 - 9 + 2 - 6, 9);
  });
});

describe("FFT = DFT, inverze, lemma Ω · Ω̄ = n · E", () => {
  it("fft = dft pro náhodné vektory n = 1, 2, 4, 8, 16", () => {
    const r = lcg(7);
    for (const n of [1, 2, 4, 8, 16]) {
      const x = Array.from({ length: n }, () => c(r(), r()));
      expectVec(fft(x, F), dft(x, F));
    }
  });

  it("ifft(fft(x)) = x v ℂ i v ℤ₁₇", () => {
    const r = lcg(3);
    for (const n of [4, 8, 16]) {
      const x = Array.from({ length: n }, () => c(Math.round(r())));
      expectVec(ifft(fft(x, F), F), x);
      const z = toField(
        x.map((v) => v.re),
        "Z17",
      );
      expect(ifft(fft(z, FIELDS.Z17), FIELDS.Z17)).toEqual(z);
    }
  });

  it("Ω · Ω̄ = n · E pro n = 4 a 8 (lemma str. 431)", () => {
    for (const n of [4, 8]) {
      for (let j = 0; j < n; j++)
        for (let k = 0; k < n; k++) {
          let s = c(0);
          for (let l = 0; l < n; l++) {
            const a = F.omega(n, j * l, false);
            const b = F.omega(n, l * k, true);
            s = c(
              s.re + a.re * b.re - a.im * b.im,
              s.im + a.re * b.im + a.im * b.re,
            );
          }
          expect(cClose(s, c(j === k ? n : 0), 1e-9)).toBe(true);
        }
    }
  });

  it("ℤ₁₇ s ω = 2: F(0, 1, …, 7) = (11, 8, 14, 6, 13, 3, 12, 1) (17.5, str. 439)", () => {
    const x = toField([0, 1, 2, 3, 4, 5, 6, 7], "Z17");
    expect(fft(x, FIELDS.Z17).map((z) => z.re)).toEqual([
      11, 8, 14, 6, 13, 3, 12, 1,
    ]);
    expect(dft(x, FIELDS.Z17).map((z) => z.re)).toEqual([
      11, 8, 14, 6, 13, 3, 12, 1,
    ]);
  });

  it("transformSize: doplnění nulami na mocninu dvojky, n = 4 / 8 / 16", () => {
    expect(transformSize(1)).toBe(4);
    expect(transformSize(4)).toBe(4);
    expect(transformSize(5)).toBe(8);
    expect(transformSize(8)).toBe(8);
    expect(transformSize(9)).toBe(16);
    expect(transformSize(16)).toBe(16);
    expect(() => transformSize(17)).toThrow();
  });
});

describe("strom volání (obr. 17.4: pořadí listů = bitové zrcadlení)", () => {
  it("n = 8: 15 volání, hloubka 3, listy zleva 0, 4, 2, 6, 1, 5, 3, 7", () => {
    const t = callTree(8);
    expect(t.length).toBe(15);
    expect(Math.max(...t.map((v) => v.depth))).toBe(3);
    const leaves = t.filter((v) => v.idx.length === 1).map((v) => v.idx[0]);
    expect(leaves).toEqual([0, 4, 2, 6, 1, 5, 3, 7]);
    expect(t[0].idx).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(t[1].idx).toEqual([0, 2, 4, 6]); // sudá část
    expect(t.find((v) => v.parent === 0 && v.id !== 1)!.idx).toEqual([
      1, 3, 5, 7,
    ]);
    // listy leží v pořadí zleva doprava, vnitřní vrchol uprostřed nad syny
    const xs = t.filter((v) => v.idx.length === 1).map((v) => v.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(t[0].x).toBeCloseTo(0.5, 9);
  });

  it("mezivýsledky volání pro p = (0, 1, …, 7) – fft.md §3", () => {
    const steps = materialize(fftSteps(re([0, 1, 2, 3, 4, 5, 6, 7]), "C"));
    const last = steps[steps.length - 1].state;
    const out = (idx: number[]) =>
      last.calls.find((v) => v.idx.join() === idx.join())!.out;
    expectVec(out([0, 4]), re([4, -4]));
    expectVec(out([2, 6]), re([8, -4]));
    expectVec(out([1, 5]), re([6, -4]));
    expectVec(out([3, 7]), re([10, -4]));
    expectVec(out([0, 2, 4, 6]), [c(12), c(-4, -4), c(-4), c(-4, 4)]);
    expectVec(out([1, 3, 5, 7]), [c(16), c(-4, -4), c(-4), c(-4, 4)]);
    expectVec(last.result, F0_7);
    expect(last.calls.every((v) => v.status === "done")).toBe(true);
  });
});

describe("kroky rekurzivní FFT (řádky PC_FFT)", () => {
  const steps = materialize(fftSteps(re([0, 1, 2, 3, 4, 5, 6, 7]), "C"));

  it("první krok ř. 0 (kořen aktivní), poslední ř. 9 s výsledkem; každý list prošel ř. 1", () => {
    expect(steps[0].line).toBe(0);
    expect(steps[0].state.calls[0].status).toBe("active");
    expect(steps[0].message).toContain("FFT(8, ω");
    const end = steps[steps.length - 1];
    expect(end.line).toBe(9);
    expectVec(end.state.result, F0_7);
    expect(steps.filter((s) => s.line === 1).length).toBe(8);
  });

  it("každý motýlek = krok ř. 7 hned následovaný ř. 8; pro n = 8 jich je (n/2)·log₂ n = 12", () => {
    const l7 = steps.flatMap((s, i) => (s.line === 7 ? [i] : []));
    expect(l7.length).toBe(12);
    for (const i of l7) expect(steps[i + 1].line).toBe(8);
    expect(steps.filter((s) => s.line === 8).length).toBe(12);
    // každé vnitřní volání se rozdělí (ř. 2) a vrátí (ř. 9)
    expect(steps.filter((s) => s.line === 2).length).toBe(7);
    expect(steps.filter((s) => s.line === 9).length).toBe(7);
  });

  it("motýlek v kořeni pro j = 1: y₁ = s₁ + ω·ℓ₁ a y₅ = s₁ − ω·ℓ₁", () => {
    const i = steps.findIndex(
      (s) => s.line === 7 && s.state.shown === 0 && s.state.j === 1,
    );
    expect(i).toBeGreaterThan(0);
    const bf = steps[i].state.bf!;
    expectVec([bf.s, bf.l, bf.w], [c(-4, -4), c(-4, -4), F.omega(8, 1, false)]);
    expectVec([bf.top!], [F0_7[1]]);
    expect(steps[i].state.wrote).toEqual([1]);
    expect(steps[i + 1].state.wrote).toEqual([5]);
    expectVec([steps[i + 1].state.bf!.bot!], [F0_7[5]]);
    expect(steps[i].message).toMatch(/^y₁ ← s₁ \+ ω¹·ℓ₁ = /);
  });

  it("rozdělení (ř. 2) obarví ve vrcholu sudé a liché koeficienty", () => {
    const s = steps.find((x) => x.line === 2)!;
    expect(s.state.calls[s.state.shown!].split).toBe(true);
  });

  it("snímky jsou nezávislé (pozdější krok nemění dřívější)", () => {
    expect(steps[0].state.calls[0].out).toBeNull();
    expect(steps[0].state.calls.every((v) => v.out === null)).toBe(true);
  });

  it("n = 4 v ℤ₁₇ používá ω = 4 a zprávy hodnoty modulo 17", () => {
    const st = materialize(fftSteps(toField([1, 2, 3, 4], "Z17"), "Z17"));
    const end = st[st.length - 1].state;
    // přímý výpočet: y_j = Σ x_k 4^{jk} mod 17
    expect(end.result!.map((z) => z.re)).toEqual(
      dft(toField([1, 2, 3, 4], "Z17"), FIELDS.Z17).map((z) => z.re),
    );
    expect(st[0].state.vars["ω"]).toBe("4");
  });
});

describe("kružnice a tabulka – odvozeno ze stavu", () => {
  const steps = materialize(fftSteps(re([0, 1, 2, 3, 4, 5, 6, 7]), "C"));
  const at = (pred: (s: FftState) => boolean) =>
    steps.find((s) => pred(s.state))!.state;

  it("hladina d má n/2^d bodů (ω^{2^d})^k – body se umocněním slévají a zůstávají spárované", () => {
    expect(circleMarks(steps[0].state).active).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    const d1 = at((s) => s.shown !== null && s.calls[s.shown].depth === 1);
    expect(circleMarks(d1).active).toEqual([0, 2, 4, 6]);
    const d2 = at((s) => s.shown !== null && s.calls[s.shown].depth === 2);
    expect(circleMarks(d2).active).toEqual([0, 4]);
    const bf = at((s) => s.shown === 0 && s.j === 3);
    expect(circleMarks(bf).pair).toEqual([3, 7]); // ω³ a ω⁷ = −ω³
  });

  it("tabulka aktivního volání: vstup p (s indexy), s, ℓ, ω^j a postupně plněné y", () => {
    const bf = steps.find((s) => s.line === 8 && s.state.shown === 0)!.state;
    const t = tableModel(bf);
    expect(t.heads).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
    const row = (k: string) => t.rows.find((r) => r.key === k)!;
    expect(row("p").cells.map((x) => x.text)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
    expect(
      row("s")
        .cells.slice(0, 4)
        .map((x) => x.text),
    ).toEqual(["12", "−4−4i", "−4", "−4+4i"]);
    expect(row("s").cells[4].text).toBe("");
    expect(row("y").cells[0].text).toBe("28");
    expect(row("y").cells[4].text).toBe("−4");
    expect(row("y").cells[4].cls).toContain("cell-hot");
    expect(row("y").cells[1].text).toBe("");
  });
});

describe("inverzní FFT (str. 431–432: Ω⁻¹ = (1/n) · Ω̄)", () => {
  it("InverzníFFT(F(0…7)) = (0, …, 7): nejdřív FFT s ω̄, pak dělení n", () => {
    const steps = materialize(ifftSteps(F0_7, "C"));
    expect(steps[0].state.code).toBe("ifft");
    expect(steps[0].line).toBe(0);
    const inner = steps.filter((s) => s.state.code === "fft");
    expect(inner.length).toBeGreaterThan(20);
    expect(inner.every((s) => s.state.inverse)).toBe(true);
    const end = steps[steps.length - 1];
    expect(end.state.code).toBe("ifft");
    expect(end.line).toBe(PC_IFFT.length - 1);
    expectVec(end.state.result, re([0, 1, 2, 3, 4, 5, 6, 7]));
  });

  it("kružnice inverzní FFT obíhá opačně (ω̄^k = ω^{n−k})", () => {
    const steps = materialize(ifftSteps(F0_7, "C"));
    const s = steps.find((x) => x.state.code === "fft")!.state;
    expect(circleMarks(s).inverse).toBe(true);
  });

  it("ℤ₁₇: inverze s ω⁻¹ = 9 a n⁻¹ = 15 vrátí vstup", () => {
    const x = toField([0, 1, 2, 3, 4, 5, 6, 7], "Z17");
    const steps = materialize(ifftSteps(fft(x, FIELDS.Z17), "Z17"));
    expect(steps[steps.length - 1].state.result).toEqual(x);
  });
});

describe("pseudokód z knihy", () => {
  it("řádky nezačínají knižním číslem a nemají nevysázenou mocninu ani index", () => {
    for (const line of [...PC_FFT, ...PC_IFFT]) {
      expect(line).not.toMatch(/^\s*\d+\./);
      expect(line).not.toMatch(/[\^_]\(/);
      // každý ^ / _ za písmenem se vysází (parseMath ho nenechá v textu)
      const flat = parseMath(line)
        .filter((n) => typeof n === "string")
        .join("");
      expect(flat).not.toMatch(/[\p{L}\p{N})][\^_]/u);
    }
  });

  it("každý krok má řádek v rozsahu pseudokódu, který jeho stav vybírá", () => {
    const all = [
      ...materialize(fftSteps(re([0, 1, 2, 3, 4, 5, 6, 7]), "C")),
      ...materialize(ifftSteps(F0_7, "C")),
    ];
    for (const s of all) {
      const code = codeFor(s.state);
      expect(s.line).not.toBeNull();
      expect(s.line!).toBeGreaterThanOrEqual(0);
      expect(s.line!).toBeLessThan(code.length);
    }
  });
});
