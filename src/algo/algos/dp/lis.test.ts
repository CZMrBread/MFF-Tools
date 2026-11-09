/*
 * Nrp2 (Průvodce 12.2, str. 303–304): výsledky proti obr. 12.3 a 12.4 a proti hrubé síle, kroky podle
 * řádků pseudokódu, rekonstrukce řešení po odkazech P.
 */
import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import { FIG_12_3, FIG_12_4 } from "./dpBook.fixtures";
import { LIS_LINE, lisChain, nrp2, nrp2Steps, PC_NRP2 } from "./lis";

/** délka NRP hrubou silou (všechny podmnožiny) */
function bruteLis(x: readonly number[]): number {
  let best = 0;
  for (let mask = 0; mask < 1 << x.length; mask++) {
    let last = -Infinity;
    let len = 0;
    let ok = true;
    for (let i = 0; i < x.length && ok; i++)
      if (mask & (1 << i)) {
        if (x[i] <= last) ok = false;
        last = x[i];
        len++;
      }
    if (ok) best = Math.max(best, len);
  }
  return best;
}

describe("Nrp2 – obr. 12.3 (str. 304)", () => {
  it("T a P přesně podle tabulky obrázku", () => {
    const r = nrp2(FIG_12_3.x);
    expect(r.T).toEqual(FIG_12_3.T);
    expect(r.P).toEqual(FIG_12_3.P);
  });

  it("řešení po odkazech P[0], P[P[0]], …: 3, 14, 15, 35, 38, 46 (jiné než tučné na str. 302), délka T[0] − 1 = 6", () => {
    const r = nrp2(FIG_12_3.x);
    const chain = lisChain(r.P);
    expect(chain.map((i) => FIG_12_3.x[i - 1])).toEqual(FIG_12_3.solution);
    expect(r.T[0] - 1).toBe(6);
  });
});

describe("Nrp2 – obr. 12.4 (str. 305)", () => {
  it("−∞, 1, 13, 7, 15, 10: nejdelší cesta má 3 prvky; cesta z obrázku je také nejdelší", () => {
    const r = nrp2(FIG_12_4.x);
    expect(r.T[0] - 1).toBe(3);
    // obrázek vyznačil 0 → 1 → 3 → 4 (→ +∞), tj. 1, 7, 15 – rostoucí a stejně dlouhá
    const fig = FIG_12_4.figurePath.map((i) => FIG_12_4.x[i - 1]);
    expect(fig).toEqual([1, 7, 15]);
    expect(fig.length).toBe(r.T[0] - 1);
    // Nrp2 bere první nejlepší pokračování: 1, 13, 15
    expect(lisChain(r.P).map((i) => FIG_12_4.x[i - 1])).toEqual([1, 13, 15]);
  });
});

describe("Nrp2 – okrajové případy a hrubá síla", () => {
  it("prázdná posloupnost: T[0] = 1, řešení prázdné", () => {
    const r = nrp2([]);
    expect(r.T).toEqual([1]);
    expect(lisChain(r.P)).toEqual([]);
  });

  it("klesající posloupnost: NRP délky 1 (T[0] = 2); opakované hodnoty se nepočítají (ostře rostoucí)", () => {
    expect(nrp2([5, 4, 3, 2]).T[0]).toBe(2);
    expect(nrp2([2, 2, 2]).T[0]).toBe(2);
    expect(nrp2([1, 2, 2, 3]).T[0]).toBe(4);
  });

  it("T[0] − 1 = délka NRP hrubou silou (200 náhodných posloupností, n ≤ 11)", () => {
    const r = rng(42);
    for (let t = 0; t < 200; t++) {
      const n = Math.floor(r() * 12);
      const x = Array.from({ length: n }, () => Math.floor(r() * 21) - 10);
      const res = nrp2(x);
      expect(res.T[0] - 1, x.join(",")).toBe(bruteLis(x));
      const chain = lisChain(res.P).map((i) => x[i - 1]);
      expect(chain.length).toBe(res.T[0] - 1);
      for (let k = 1; k < chain.length; k++)
        expect(chain[k]).toBeGreaterThan(chain[k - 1]);
    }
  });
});

describe("záporná čísla v hláškách NRP: typografické minus (CR-2)", () => {
  it("„x₁ = −2“, ne „-2“ – jako grafy, obal a LLRB", () => {
    const msgs = materialize(nrp2Steps([-2, 5, -7, 3])).map((s) => s.message);
    expect(msgs.join(" ")).toContain("−2");
    for (const m of msgs) expect(m).not.toMatch(/-\d/);
  });
});

describe("kroky Nrp2", () => {
  const steps = materialize(nrp2Steps(FIG_12_3.x));
  const last = steps[steps.length - 1];

  it("pseudokód z knihy: x₀ ← −∞ … Výstup, za ním výpis řešení podle textu str. 304", () => {
    expect(PC_NRP2[LIS_LINE.init]).toContain("x_0 ← −∞");
    expect(PC_NRP2[LIS_LINE.test]).toContain(
      "Pokud x_i < x_j a T[i] < 1 + T[j]",
    );
    expect(PC_NRP2[LIS_LINE.out]).toContain("T[0]");
    expect(PC_NRP2.length).toBeGreaterThan(LIS_LINE.walk);
  });

  it("první krok je x₀ ← −∞ s prázdnými T a P; poslední „Hotovo“ s řešením a obr. 12.3 v tabulce", () => {
    expect(steps[0].line).toBe(LIS_LINE.init);
    expect(steps[0].state.T.every((v) => v === null)).toBe(true);
    expect(last.message).toMatch(/^Hotovo/);
    expect(last.message).toContain("3, 14, 15, 35, 38, 46");
    expect(last.state.T).toEqual(FIG_12_3.T);
    expect(last.state.P).toEqual(FIG_12_3.P);
    expect(last.state.chain).toEqual([1, 2, 3, 6, 10, 11]);
  });

  it("každé porovnání (ř. 6) má svůj krok: Σ (n − i) = 91 pro n = 13; zlepšení ř. 7 a 8 po něm", () => {
    const tests = steps.filter((s) => s.line === LIS_LINE.test);
    expect(tests).toHaveLength((13 * 14) / 2);
    steps.forEach((s, k) => {
      if (s.line === LIS_LINE.setT) {
        expect(steps[k - 1].line).toBe(LIS_LINE.test);
        expect(steps[k - 1].state.verdict).toBe("better");
        expect(steps[k + 1].line).toBe(LIS_LINE.setP);
      }
    });
  });

  it("zprávy píší −∞ a čísla s desetinnou čárkou nepotřebují; porovnání říká proč", () => {
    const msgs = steps
      .filter((s) => s.line === LIS_LINE.test)
      .map((s) => s.message);
    expect(msgs.some((m) => m.includes("−∞"))).toBe(true);
    expect(msgs.some((m) => /nenavazuje/.test(m))).toBe(true);
    expect(msgs.some((m) => /lepší/.test(m))).toBe(true);
  });

  it("výpis řešení: krok na každý prvek (ř. výpisu), aktuální k ve stavu", () => {
    const walk = steps.filter((s) => s.line === LIS_LINE.walk);
    expect(walk).toHaveLength(6);
    expect(walk[0].state.k).toBe(1);
  });

  it("na rostoucí cestě se 16 prvky víc kroků než prvků a stav i, j sedí", () => {
    const x = Array.from({ length: 16 }, (_, i) => i);
    const s = materialize(nrp2Steps(x));
    expect(s.length).toBeGreaterThan(100);
    const t = s.find((st) => st.line === LIS_LINE.test)!;
    expect(t.state.i).toBe(15);
    expect(t.state.j).toBe(16);
  });
});
