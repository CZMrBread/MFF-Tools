/*
 * Nerekurzivní FFT2 (Průvodce 17.5, str. 439) a motýlková síť obr. 17.4 (str. 438) – proti knize:
 * bitové zrcadlení, popisky kroužků „±k“, dvojkové popisky nad dráty, exponenty α z ř. 7, mezistavy
 * po vrstvách pro x = (0, 1, …, 7) (fft.md §3, ověřeno výpočtem) a shoda s rekurzivní FFT z fft.ts.
 */
import { describe, expect, it } from "vitest";
import { parseMath } from "../../core/format";
import { rng } from "../../core/steps";
import { c, cClose, type C } from "./complex";
import { fft, toField } from "./fft";
import {
  bitReverse,
  butterflies,
  fft2,
  fft2Layers,
  fft2Steps,
  gateLabels,
  PC_FFT2,
  wireLabels,
  type NetState,
} from "./fft2";
import { FIELDS } from "./field";
import { materialize, type Step } from "../../core/steps";

const CF = FIELDS.C;
const Z = FIELDS.Z17;
const RANGE8 = [0, 1, 2, 3, 4, 5, 6, 7];
const s2 = Math.SQRT2;

const close = (a: readonly (C | null)[], b: readonly C[]) =>
  a.length === b.length && a.every((z, i) => z !== null && cClose(z, b[i]));

describe("bitové zrcadlení r(k)", () => {
  it("obr. 17.4: vstupy shora x₀, x₄, x₂, x₆, x₁, x₅, x₃, x₇", () => {
    expect(bitReverse(8)).toEqual([0, 4, 2, 6, 1, 5, 3, 7]);
  });
  it("n = 4, 2, 1 a 16", () => {
    expect(bitReverse(4)).toEqual([0, 2, 1, 3]);
    expect(bitReverse(2)).toEqual([0, 1]);
    expect(bitReverse(1)).toEqual([0]);
    expect(bitReverse(16)).toEqual([
      0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15,
    ]);
  });
  it("je involuce (zrcadlení dvakrát = identita)", () => {
    for (const n of [4, 8, 16]) {
      const r = bitReverse(n);
      expect(r.map((k) => r[k])).toEqual(r.map((_, i) => i));
    }
  });
});

describe("popisky sítě obr. 17.4", () => {
  it("kroužky po vrstvách: +k nahoře v bloku, −k dole", () => {
    expect(gateLabels(8)).toEqual([
      ["+0", "−0", "+0", "−0", "+0", "−0", "+0", "−0"],
      ["+0", "+1", "−0", "−1", "+0", "+1", "−0", "−1"],
      ["+0", "+1", "+2", "+3", "−0", "−1", "−2", "−3"],
    ]);
  });
  it("dvojkové popisky nad dráty (4 sloupce) přesně jako na obrázku", () => {
    expect(wireLabels(8)).toEqual([
      ["000", "100", "010", "110", "001", "101", "011", "111"],
      ["000", "100", "010", "110", "001", "101", "011", "111"],
      ["000", "010", "100", "110", "001", "011", "101", "111"],
      ["000", "001", "010", "011", "100", "101", "110", "111"],
    ]);
  });
  it("n = 4: 2 vrstvy, 3 sloupce popisků", () => {
    expect(gateLabels(4)).toEqual([
      ["+0", "−0", "+0", "−0"],
      ["+0", "+1", "−0", "−1"],
    ]);
    expect(wireLabels(4)).toEqual([
      ["00", "10", "01", "11"],
      ["00", "10", "01", "11"],
      ["00", "01", "10", "11"],
    ]);
  });
});

describe("motýlky a exponenty α (FFT2 ř. 5–8)", () => {
  it("(j, k, e) s e = (nk/2b) mod n – seznam z fft.md §3", () => {
    const jke = butterflies(8).map((layer) =>
      layer.map((g) => [g.j, g.k, g.e]),
    );
    expect(jke).toEqual([
      [
        [0, 0, 0],
        [2, 0, 0],
        [4, 0, 0],
        [6, 0, 0],
      ],
      [
        [0, 0, 0],
        [0, 1, 2],
        [4, 0, 0],
        [4, 1, 2],
      ],
      [
        [0, 0, 0],
        [0, 1, 1],
        [0, 2, 2],
        [0, 3, 3],
      ],
    ]);
  });
  it("motýlek spojuje řádky j+k a j+k+b; síť má (n/2)·log₂ n motýlků", () => {
    const L = butterflies(8);
    expect(L.map((l) => l[0].b)).toEqual([1, 2, 4]);
    expect(L[1][1]).toMatchObject({ top: 1, bot: 3 });
    expect(L.flat().length).toBe(12);
    expect(butterflies(16).flat().length).toBe(32);
  });
});

describe("FFT2 – hodnoty", () => {
  const x = toField(RANGE8, "C");
  it("mezistavy po zrcadlení a po b = 1, 2, 4 pro x = (0, 1, …, 7)", () => {
    const cols = fft2Layers(x, CF);
    expect(cols.length).toBe(4);
    expect(close(cols[0], toField([0, 4, 2, 6, 1, 5, 3, 7], "C"))).toBe(true);
    expect(close(cols[1], toField([4, -4, 8, -4, 6, -4, 10, -4], "C"))).toBe(
      true,
    );
    expect(
      close(cols[2], [
        c(12),
        c(-4, -4),
        c(-4),
        c(-4, 4),
        c(16),
        c(-4, -4),
        c(-4),
        c(-4, 4),
      ]),
    ).toBe(true);
    const a = 4 * (1 + s2);
    const b = 4 * (s2 - 1);
    expect(
      close(cols[3], [
        c(28),
        c(-4, -a),
        c(-4, -4),
        c(-4, -b),
        c(-4),
        c(-4, b),
        c(-4, 4),
        c(-4, a),
      ]),
    ).toBe(true);
  });

  it("výsledek = rekurzivní FFT (str. 430) pro n = 2, 4, 8, 16 v ℂ i ℤ₁₇", () => {
    const r = rng(17);
    for (const n of [2, 4, 8, 16])
      for (const f of [CF, Z]) {
        const v = toField(
          Array.from({ length: n }, () => Math.floor(r() * 21) - 10),
          f.id,
        );
        const got = fft2(v, f);
        const want = fft(v, f);
        expect(close(got, want), `${f.id} n=${n}`).toBe(true);
      }
  });

  it("cvičení 17.3.2: (1, …, 1) → (8, 0, …), (1, −1, …) → 8 na pozici 4, (1, 0, 1, 0, …) → (4, 0, 0, 0, 4, 0, 0, 0)", () => {
    const re = (v: C[]) => v.map((z) => Math.round(z.re * 1e9) / 1e9 + 0);
    expect(re(fft2(toField([1, 1, 1, 1, 1, 1, 1, 1], "C"), CF))).toEqual([
      8, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(re(fft2(toField([1, -1, 1, -1, 1, -1, 1, -1], "C"), CF))).toEqual([
      0, 0, 0, 0, 8, 0, 0, 0,
    ]);
    expect(re(fft2(toField([1, 0, 1, 0, 1, 0, 1, 0], "C"), CF))).toEqual([
      4, 0, 0, 0, 4, 0, 0, 0,
    ]);
  });

  it("ℤ₁₇ (str. 439, ω = 2): F(0, 1, …, 7) = (11, 8, 14, 6, 13, 3, 12, 1)", () => {
    expect(fft2(toField(RANGE8, "Z17"), Z).map((z) => z.re)).toEqual([
      11, 8, 14, 6, 13, 3, 12, 1,
    ]);
  });
});

/* ------------------------------------------------------------------ kroky */

const steps = (
  xs: number[],
  field: "C" | "Z17" = "C",
  detail: "bf" | "layer" = "bf",
): Step<NetState>[] =>
  materialize(fft2Steps(toField(xs, field), field, detail));

describe("PC_FFT2 – sazba", () => {
  it("11 řádků podle str. 439, bez knižních čísel a nevysázených mocnin", () => {
    expect(PC_FFT2.length).toBe(11);
    for (const line of PC_FFT2) {
      expect(line).not.toMatch(/^\s*\d+\./);
      expect(line).not.toMatch(/[_^]\(/);
      expect(parseMath(line).length).toBeGreaterThan(0);
    }
    expect(PC_FFT2[7]).toContain("ω^{(nk/2b) mod n}");
  });
});

describe("FFT2 – kroky", () => {
  it("každý motýlek: ř. 7 (α) a pak ř. 8 (zápis dvou hodnot); 12 motýlků pro n = 8", () => {
    const s = steps(RANGE8);
    expect(s[0].line).toBe(0);
    expect(s.filter((x) => x.line === 8).length).toBe(12);
    s.forEach((x, i) => {
      if (x.line === 8) expect(s[i - 1].line).toBe(7);
      if (x.line !== null) expect(x.line).toBeLessThan(PC_FFT2.length);
    });
    expect(s.filter((x) => x.line === 5).length).toBe(4 + 2 + 1);
    expect(s.filter((x) => x.line === 9).length).toBe(3);
    expect(s.length).toBeLessThan(60);
  });

  it("pořadí řádků na začátku: 0, 1 (tabulka ω), 2 (zrcadlení), 3 (b ← 1), 4", () => {
    expect(
      steps(RANGE8)
        .slice(0, 5)
        .map((x) => x.line),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it("zrcadlení naplní sloupec 0 hodnotami x_{r(k)}; ostatní sloupce zatím prázdné", () => {
    const s = steps(RANGE8).find((x) => x.line === 2)!;
    expect(s.state.cols[0].map((z) => z?.re)).toEqual([0, 4, 2, 6, 1, 5, 3, 7]);
    expect(s.state.cols[1].every((z) => z === null)).toBe(true);
  });

  it("motýlek b = 2, k = 1: α = ω², aktivní řádky 1 a 3, hodnoty −4−4i a −4+4i", () => {
    const s = steps(RANGE8);
    const i = s.findIndex(
      (x) => x.line === 8 && x.state.b === 2 && x.state.k === 1,
    );
    const st = s[i].state;
    expect(st.e).toBe(2);
    expect(st.gates).toEqual([1, 3]);
    expect(st.wrote).toEqual([1, 3]);
    expect(cClose(st.cols[2][1]!, c(-4, -4))).toBe(true);
    expect(cClose(st.cols[2][3]!, c(-4, 4))).toBe(true);
    expect(s[i - 1].state.e).toBe(2);
    expect(s[i - 1].message).toContain("α");
  });

  it("poslední krok ř. 10 nese výsledek = FFT; snímky jsou nezávislé", () => {
    const s = steps(RANGE8);
    const last = s[s.length - 1];
    expect(last.line).toBe(10);
    expect(close(last.state.result!, fft(toField(RANGE8, "C"), CF))).toBe(true);
    // pozdější kroky nemění dřívější snímek
    expect(s[3].state.cols[3].every((z) => z === null)).toBe(true);
  });

  it("po vrstvách: jeden krok ř. 8 na vrstvu se všemi kroužky aktivními", () => {
    const s = steps(RANGE8, "C", "layer");
    const l8 = s.filter((x) => x.line === 8);
    expect(l8.length).toBe(3);
    expect(l8[0].state.gates).toEqual(RANGE8);
    expect(s.some((x) => x.line === 5 || x.line === 7)).toBe(false);
  });

  it("ℤ₁₇: kroky počítají přesně, výsledek (11, 8, 14, 6, 13, 3, 12, 1)", () => {
    const s = steps(RANGE8, "Z17");
    expect(s[s.length - 1].state.result!.map((z) => z.re)).toEqual([
      11, 8, 14, 6, 13, 3, 12, 1,
    ]);
  });

  it("n = 16 doběhne; 32 motýlků", () => {
    const s = steps(Array.from({ length: 16 }, (_, i) => i));
    expect(s.filter((x) => x.line === 8).length).toBe(32);
  });
});
