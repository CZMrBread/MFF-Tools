import { describe, expect, it } from "vitest";
import { materialize, rng } from "../../core/steps";
import {
  badSequence,
  DEFAULT_SEQ,
  LINE_EVICT,
  LINE_FREE_SLOT,
  LINE_HIT,
  MAX_REQUESTS,
  normP,
  PAGE_MAX,
  paging,
  parseRequests,
  PC,
  prepareRun,
  randomSequence,
  readP,
  readSeq,
  runTitle,
  SEQ_RULES,
  STRATS,
} from "./paging";

const run = (seq: number[], P: number) => materialize(paging(seq, P));
const final = (seq: number[], P: number) => {
  const steps = run(seq, P);
  return steps[steps.length - 1].state;
};

function refLRU(seq: number[], P: number) {
  const c: number[] = []; // od nejdéle nepoužité
  let miss = 0;
  for (const x of seq) {
    const k = c.indexOf(x);
    if (k >= 0) c.splice(k, 1);
    else {
      miss++;
      if (c.length === P) c.shift();
    }
    c.push(x);
  }
  return miss;
}
function refFIFO(seq: number[], P: number) {
  const c: number[] = [];
  let miss = 0;
  for (const x of seq) {
    if (c.includes(x)) continue;
    miss++;
    if (c.length === P) c.shift();
    c.push(x);
  }
  return miss;
}
/** Skutečné optimum hrubou silou: DP přes všechny obsahy cache. */
function refOPT(seq: number[], P: number) {
  let dp = new Map<string, number>([["", 0]]);
  for (const x of seq) {
    const next = new Map<string, number>();
    const put = (set: number[], cost: number) => {
      const key = [...set].sort((a, b) => a - b).join(",");
      if (!next.has(key) || next.get(key)! > cost) next.set(key, cost);
    };
    for (const [key, cost] of dp) {
      const set = key === "" ? [] : key.split(",").map(Number);
      if (set.includes(x)) put(set, cost);
      else if (set.length < P) put([...set, x], cost + 1);
      else
        for (let v = 0; v < set.length; v++)
          put([...set.slice(0, v), ...set.slice(v + 1), x], cost + 1);
    }
    dp = next;
  }
  return Math.min(...dp.values());
}

describe("stránkování", () => {
  it("počty výpadků LRU/FIFO odpovídají referenci a OPT je skutečné optimum (60 náhodných vstupů + okrajové)", () => {
    const inputs: { seq: number[]; P: number }[] = [
      { seq: [], P: 3 },
      { seq: [5], P: 1 },
      { seq: [1, 1, 1, 1], P: 1 },
      { seq: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], P: 3 },
      { seq: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], P: 4 },
      { seq: [0, -1, 0, -1, 2.5, 0], P: 2 },
    ];
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      const len = Math.floor(r() * 16);
      const pages = 2 + Math.floor(r() * 5);
      inputs.push({
        seq: Array.from({ length: len }, () => 1 + Math.floor(r() * pages)),
        P: 1 + Math.floor(r() * 5),
      });
    }
    for (const { seq, P } of inputs) {
      const steps = run(seq, P);
      expect(steps.length).toBe(seq.length + 2);
      const fin = steps[steps.length - 1].state;
      expect(fin.seq).toEqual(seq);
      expect(fin.P).toBe(P);
      expect(fin.caches.LRU.misses).toBe(refLRU(seq, P));
      expect(fin.caches.FIFO.misses).toBe(refFIFO(seq, P));
      expect(fin.caches.OPT.misses).toBe(refOPT(seq, P));
      for (const s of steps) {
        expect(s.line === null || PC[s.line] !== undefined).toBe(true);
        for (const strat of STRATS) {
          const loaded = s.state.caches[strat].slots.filter((x) => x !== null);
          expect(s.state.caches[strat].slots.length).toBe(P);
          expect(new Set(loaded).size).toBe(loaded.length);
          // právě obsluhovaná stránka je po kroku v cache
          if (s.state.i >= 0 && s.state.i < seq.length)
            expect(loaded).toContain(seq[s.state.i]);
        }
      }
      // po skončení nezůstane zvýrazněný poslední zásah / výpadek
      for (const strat of STRATS)
        expect(fin.caches[strat].last).toBeUndefined();
    }
  });

  it("neplatné P (desetinné, nulové, záporné, NaN, obří) simulaci neshodí – použije se celé číslo 1–8 a krok to oznámí", () => {
    const cases: [number, number][] = [
      [2.5, 2],
      [0, 1],
      [-3, 1],
      [NaN, 1],
      [20, 8],
      [Infinity, 8],
      [-Infinity, 1],
      [1e308, 8],
    ];
    for (const [raw, want] of cases) {
      expect(normP(raw)).toBe(want);
      const steps = run([1, 2, 3, 1, 2], raw);
      expect(steps[steps.length - 1].state.P).toBe(want);
      for (const strat of STRATS)
        expect(steps[0].state.caches[strat].slots).toHaveLength(want);
      expect(steps[0].message).toMatch(/použito P = /);
    }
    for (let P = 1; P <= 8; P++) {
      expect(normP(P)).toBe(P);
      expect(run([1, 2], P)[0].message).not.toMatch(/použito/);
    }
  });

  it("zvýrazněný řádek odpovídá ději: volný slot → řádek „je-li volný slot“, vyhození → „vybereme oběť“, samé zásahy → „zásah“", () => {
    const steps = run([1, 2, 3, 1, 4], 3);
    // 1, 2, 3 se načítají do volných slotů (dřív svítil řádek o výběru oběti)
    expect(steps.slice(1, 4).map((s) => s.line)).toEqual([
      LINE_FREE_SLOT,
      LINE_FREE_SLOT,
      LINE_FREE_SLOT,
    ]);
    expect(steps[4].line).toBe(LINE_HIT);
    expect(steps[5].line).toBe(LINE_EVICT);
    expect(PC[LINE_HIT]).toContain("zásah");
    expect(PC[LINE_FREE_SLOT]).toContain("volný slot");
    expect(PC[LINE_EVICT]).toContain("oběť");
    // závěrečný krok nezvýrazňuje větu Sleatora a Tarjana – ta předpokládá P_LRU > P_OPT, tady je P stejné
    const last = steps[steps.length - 1];
    expect(last.line).toBeNull();
    expect(last.message).toContain("P_LRU > P_OPT");
    expect(PC.join("\n")).toMatch(/pro P_LRU > P_OPT/);
  });

  it("zprávy používají „zásah“ / „výpadek“", () => {
    const msgs = run([1, 2, 1, 3, 4], 2)
      .map((s) => s.message)
      .join("\n");
    expect(msgs).toContain("zásah");
    expect(msgs).toContain("výpadek");
    expect(msgs).not.toMatch(/\bhit\b|\bmiss\b/);
  });

  it("vstup delší než limit se ořízne a první krok to řekne; nekonečna a NaN se zahodí", () => {
    const seq = Array.from({ length: 70 }, (_, i) => (i % 5) + 1);
    const steps = run(seq, 3);
    expect(steps[steps.length - 1].state.seq).toEqual(
      seq.slice(0, MAX_REQUESTS),
    );
    expect(steps[0].message).toMatch(/70 požadavků, použito prvních 60/);
    expect(prepareRun(seq.join(" "), 3).notes.join(" ")).toMatch(
      /použito prvních 60/,
    );
    expect(final([1, NaN, 2, Infinity, 1], 2).seq).toEqual([1, 2, 1]);
    // obří vstup neudělá tisíce kroků
    expect(
      run(
        Array.from({ length: 100000 }, (_, i) => i % 7),
        3,
      ).length,
    ).toBe(MAX_REQUESTS + 2);
  });

  it("prázdná posloupnost dá srozumitelnou hlášku místo „0 požadavků“", () => {
    const steps = run([], 3);
    expect(steps).toHaveLength(2);
    expect(steps[0].message).toMatch(/prázdná/);
    expect(prepareRun("abc", 3).notes.join(" ")).toMatch(
      /Zadejte čísla stránek/,
    );
  });

  it("parseRequests bere čísla zapsaná číslicemi a ostatní tokeny vrátí jako ignorované", () => {
    expect(parseRequests("1 2 a 3 x1 4,5;6 1e2 0x10 -1 2.5")).toEqual({
      seq: [1, 2, 3, 4, 5, 6, -1, 2.5],
      ignored: ["a", "x1", "1e2", "0x10"],
    });
    expect(parseRequests("")).toEqual({ seq: [], ignored: [] });
    expect(parseRequests("  7  ")).toEqual({ seq: [7], ignored: [] });
    const r = prepareRun("1 2 a 3 x1", 3);
    expect(r.seq).toEqual([1, 2, 3]);
    expect(r.notes.join(" ")).toMatch(/Ignorováno.*a, x1/);
    expect(prepareRun("1 2 3", 3).notes).toEqual([]);
  });

  it("prepareRun normalizuje P na jednom místě a oznámí to", () => {
    expect(prepareRun("1 2 3", 2.5).P).toBe(2);
    expect(prepareRun("1 2 3", 2.5).notes.join(" ")).toMatch(/použito P = 2/);
    expect(prepareRun("1 2 3", 0).P).toBe(1);
    expect(prepareRun("1 2 3", 20).P).toBe(8);
  });

  it("„zlá posloupnost“ je zlá pro skutečně použité P – LRU má samé výpadky, OPT je od P = 2 ostře lepší (i pro P mimo rozsah)", () => {
    for (const raw of [0, 1, 2, 2.5, 3, 4, 5, 6, 7, 8, 20, -1, NaN]) {
      const P = normP(raw);
      const seq = badSequence(raw);
      expect(seq.length).toBeLessThanOrEqual(MAX_REQUESTS);
      // aspoň tři celé cykly P+1 stránek
      expect(seq.length).toBeGreaterThanOrEqual(3 * (P + 1));
      expect(new Set(seq).size).toBe(P + 1);
      const fin = final(seq, raw);
      expect(fin.P).toBe(P);
      expect(fin.caches.LRU.misses).toBe(seq.length);
      if (P >= 2)
        expect(fin.caches.OPT.misses).toBeLessThan(fin.caches.LRU.misses);
    }
  });

  it("náhodná posloupnost je deterministická podle semínka a má víc stránek než slotů (dojde na vyhazování)", () => {
    for (let P = 1; P <= 8; P++) {
      const seq = randomSequence(P, 12345 + P);
      expect(seq).toEqual(randomSequence(P, 12345 + P));
      expect(seq).toHaveLength(20);
      expect(
        seq.every((x) => Number.isInteger(x) && x >= 1 && x <= P + 3),
      ).toBe(true);
    }
    expect(randomSequence(2.5, 1).every((x) => x >= 1 && x <= 5)).toBe(true);
    expect(randomSequence(NaN, 1)).toHaveLength(20);
  });
});

describe("stránkování – vstup ze stránky a z adresy, závěr simulace", () => {
  it("závěrečný krok shrne výsledek s P a počtem požadavků", () => {
    const steps = run([1, 2, 3, 1, 4], 3);
    expect(steps[steps.length - 1].message).toMatch(
      /^Simulace hotová \(P = 3, 5 požadavků\): výpadky OPT 4, LRU 4, FIFO 4;/,
    );
    expect(runTitle(3, 12)).toBe("Simulace: P = 3, 12 požadavků");
    expect(runTitle(2.5, 100)).toBe(
      `Simulace: P = 2, ${MAX_REQUESTS} požadavků`,
    );
    expect(runTitle(1, 1)).toBe("Simulace: P = 1, 1 požadavek");
  });

  it("výchozí příklad ukazuje Béládyho anomálii FIFO (tip na stránce): P = 3 → 9 výpadků, P = 4 → 10", () => {
    expect(final(DEFAULT_SEQ, 3).caches.FIFO.misses).toBe(9);
    expect(final(DEFAULT_SEQ, 4).caches.FIFO.misses).toBe(10);
    // LRU ani OPT anomálii nemají
    expect(final(DEFAULT_SEQ, 4).caches.LRU.misses).toBeLessThanOrEqual(
      final(DEFAULT_SEQ, 3).caches.LRU.misses,
    );
    expect(final(DEFAULT_SEQ, 4).caches.OPT.misses).toBeLessThanOrEqual(
      final(DEFAULT_SEQ, 3).caches.OPT.misses,
    );
    // zlá posloupnost s P = 3: LRU i FIFO samé výpadky, OPT polovina
    const bad = final(badSequence(3), 3);
    expect(bad.caches.LRU.misses).toBe(bad.seq.length);
    expect(bad.caches.FIFO.misses).toBe(bad.seq.length);
    expect(bad.caches.OPT.misses * 2).toBe(bad.seq.length);
  });

  it("parametry adresy: neplatné hodnoty se nepoužijí, posloupnost se omezí stejně jako pole na stránce", () => {
    expect(readSeq("1,2,3")).toEqual([1, 2, 3]);
    expect(readSeq("1,x,2.5,200,3")).toEqual([1, 3]);
    expect(readSeq("a,b")).toBeNull();
    expect(readSeq(null)).toBeNull();
    expect(
      readSeq(Array.from({ length: 80 }, (_, i) => i % 10).join(",")),
    ).toHaveLength(MAX_REQUESTS);
    expect(readP("4")).toBe(4);
    expect(readP("0")).toBeNull();
    expect(readP("2.5")).toBeNull();
    expect(readP(null)).toBeNull();
    expect(SEQ_RULES.max).toBe(PAGE_MAX);
    // generované posloupnosti projdou pravidly pole bez úprav
    for (let P = 1; P <= 8; P++) {
      expect(readSeq(badSequence(P).join(","))).toEqual(badSequence(P));
      expect(readSeq(randomSequence(P, P).join(","))).toEqual(
        randomSequence(P, P),
      );
    }
  });
});

describe("E3: poměr LRU/OPT s českou desetinnou čárkou", () => {
  it("výchozí posloupnost s P = 3 končí větou s „LRU/OPT = x,yy“", () => {
    const steps = materialize(paging(DEFAULT_SEQ, 3));
    const last = steps[steps.length - 1].message;
    expect(last).toMatch(/LRU\/OPT = \d+,\d\d\./);
    expect(last).not.toMatch(/LRU\/OPT = \d+\.\d/);
  });
});
