/**
 * Komparátorové sítě z kap. 15.3 Průvodce (s. 392–398) proti knize: bublinková síť (obr. 15.6 / 15.7),
 * separátor S₈ (obr. 15.10, důkaz s. 396), bitonická třídička B₈ (obr. 15.8), třídička T₈ (obr. 15.9),
 * Batcherovo třídění (cv. 15.3.7, procedura BMerge) a 0-1 princip (cv. 15.3.6).
 * Data obrázků přepsaná a ověřená v research2/circuits.md (§ 2 a 10.2).
 */
import { describe, expect, it } from "vitest";
import { rng } from "../../core/steps";
import {
  applyNet,
  asapLayers,
  batcherSortBook,
  bmergeBook,
  bubbleComparators,
  buildNet,
  isBitonic,
  isSorted,
  literalMerge,
  mergerComparators,
  NET_KINDS,
  netSizes,
  runNet,
  separatorSplit,
  validSizes,
  zeroOneCheck,
  type NetKind,
  type SortNet,
} from "./sortNet";

const pairs = (net: SortNet, layer: number) =>
  net.layers[layer].map((c) => [net.comps[c].a, net.comps[c].b]);
const allPairs = (net: SortNet) => net.layers.map((_, i) => pairs(net, i));
const sortedCopy = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);

function permutations(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs.slice()];
  const out: number[][] = [];
  xs.forEach((x, i) => {
    for (const p of permutations([...xs.slice(0, i), ...xs.slice(i + 1)]))
      out.push([x, ...p]);
  });
  return out;
}

/** všechny bitonické permutace 1…n: čistě bitonické (každý prvek kromě maxima vlevo, nebo vpravo) a jejich rotace */
function bitonicPermutations(n: number): number[][] {
  const out: number[][] = [];
  for (let mask = 0; mask < 1 << (n - 1); mask++) {
    const left: number[] = [];
    const right: number[] = [];
    for (let v = 1; v < n; v++) ((mask >> (v - 1)) & 1 ? left : right).push(v);
    const pure = [...left, n, ...right.reverse()];
    for (let r = 0; r < n; r++)
      out.push([...pure.slice(r), ...pure.slice(0, r)]);
  }
  return out;
}

describe("bublinková síť (obr. 15.6 a 15.7, s. 392–393)", () => {
  it("n = 5: 10 komparátorů v pořadí zápisu z obr. 15.6 (průchody 4, 3, 2, 1)", () => {
    expect(bubbleComparators(5).map((c) => [c.a, c.b])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [0, 1],
      [1, 2],
      [2, 3],
      [0, 1],
      [1, 2],
      [0, 1],
    ]);
    expect(bubbleComparators(5).map((c) => c.pass)).toEqual([
      1, 1, 1, 1, 2, 2, 2, 3, 3, 4,
    ]);
  });

  it("skutečný průběh (ASAP) je přesně obr. 15.7: 7 vrstev = 2n − 3", () => {
    const net = buildNet("bubble", 5);
    expect(allPairs(net)).toEqual([
      [[0, 1]],
      [[1, 2]],
      [
        [0, 1],
        [2, 3],
      ],
      [
        [1, 2],
        [3, 4],
      ],
      [
        [0, 1],
        [2, 3],
      ],
      [[1, 2]],
      [[0, 1]],
    ]);
  });

  it("obecně hloubka 2n − 3 a n(n − 1)/2 komparátorů (n = 8: 13 a 28)", () => {
    for (let n = 2; n <= 16; n++) {
      const s = netSizes(buildNet("bubble", n));
      expect(s, `n = ${n}`).toEqual({
        depth: 2 * n - 3,
        size: (n * (n - 1)) / 2,
      });
    }
    expect(netSizes(buildNet("bubble", 8))).toEqual({ depth: 13, size: 28 });
  });

  it("„jak je zapsaná“ (obr. 15.6): každý komparátor ve vlastní vrstvě, n(n − 1)/2 vrstev", () => {
    const net = buildNet("bubble", 5, { seq: true });
    expect(net.seq).toBe(true);
    expect(net.layers).toEqual(net.comps.map((_, i) => [i]));
    expect(netSizes(net)).toEqual({ depth: 10, size: 10 });
  });
});

describe("separátor Sₙ (obr. 15.10, s. 395–396)", () => {
  it("S₈ = (0,4) (1,5) (2,6) (3,7) v jedné vrstvě, blok S₈", () => {
    const net = buildNet("sep", 8);
    expect(allPairs(net)).toEqual([
      [
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      ],
    ]);
    expect(net.blocks).toEqual([{ label: "S₈", lo: 0, hi: 7, from: 0, to: 0 }]);
  });

  it("na každém bitonickém vstupu délky 8: obě poloviny bitonické a levá < pravá (definice s. 393–394)", () => {
    const net = buildNet("sep", 8);
    const inputs = bitonicPermutations(8);
    expect(inputs.length).toBe(128 * 8);
    for (const x of inputs) {
      const y = applyNet(net, x);
      const L = y.slice(0, 4);
      const R = y.slice(4);
      expect(isBitonic(L) && isBitonic(R), x.join(",")).toBe(true);
      expect(Math.max(...L) < Math.min(...R), x.join(",")).toBe(true);
    }
  });

  it("příklad 4, 5, 7, 8, 6, 3, 1, 2 podle důkazu: k = 1, komparátor 0 neprohodí, 1–3 prohodí", () => {
    const x = [4, 5, 7, 8, 6, 3, 1, 2];
    const net = buildNet("sep", 8);
    const r = runNet(net, x);
    expect(r.swapped).toEqual([false, true, true, true]);
    expect(r.gaps[1]).toEqual([4, 3, 1, 2, 6, 5, 7, 8]);
    // levá = x₀, x₅, x₆, x₇ (rotace údolí), pravá = x₄, x₁, x₂, x₃ (rotace hory)
    expect(r.ids[1]).toEqual([0, 5, 6, 7, 4, 1, 2, 3]);
    const s = separatorSplit(x);
    expect(s).toEqual({
      k: 1,
      mountain: [false, true, true, true, true, false, false, false],
    });
  });

  it("hora a údolí jen pro bitonický vstup s různými prvky", () => {
    expect(separatorSplit([5, 2, 7, 1, 8, 3, 6, 4])).toBeNull();
    expect(separatorSplit([1, 1, 2, 2])).toBeNull();
    // k ≥ n/2: hora x₅, x₆, x₇, x₀ → k = 5
    expect(separatorSplit([8, 1, 2, 3, 4, 5, 6, 7])?.k).toBe(5);
  });
});

describe("bitonická třídička Bₙ (obr. 15.8, s. 394)", () => {
  it("B₈: 12 komparátorů ve 3 vrstvách po 4, bloky S₈ / S₄ S₄ / S₂ × 4", () => {
    const net = buildNet("bitonic", 8);
    expect(allPairs(net)).toEqual([
      [
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      ],
      [
        [0, 2],
        [1, 3],
        [4, 6],
        [5, 7],
      ],
      [
        [0, 1],
        [2, 3],
        [4, 5],
        [6, 7],
      ],
    ]);
    expect(net.blocks.map((b) => [b.label, b.lo, b.hi, b.from, b.to])).toEqual([
      ["S₈", 0, 7, 0, 0],
      ["S₄", 0, 3, 1, 1],
      ["S₄", 4, 7, 1, 1],
      ["S₂", 0, 1, 2, 2],
      ["S₂", 2, 3, 2, 2],
      ["S₂", 4, 5, 2, 2],
      ["S₂", 6, 7, 2, 2],
    ]);
  });

  it("setřídí každý bitonický vstup délky 8", () => {
    const net = buildNet("bitonic", 8);
    for (const x of bitonicPermutations(8))
      expect(isSorted(applyNet(net, x)), x.join(",")).toBe(true);
  });

  it("hloubka log n a (n/2) log n komparátorů", () => {
    for (const [n, k] of [
      [2, 1],
      [4, 2],
      [8, 3],
      [16, 4],
    ])
      expect(netSizes(buildNet("bitonic", n))).toEqual({
        depth: k,
        size: (n / 2) * k,
      });
  });
});

describe("třídička Tₙ (obr. 15.9, s. 395)", () => {
  it("T₈: 6 vrstev přesně podle rozpisu slévaček M₁, M₂, M₄", () => {
    const net = buildNet("t", 8);
    expect(allPairs(net)).toEqual([
      [
        [0, 1],
        [2, 3],
        [4, 5],
        [6, 7],
      ],
      [
        [0, 3],
        [1, 2],
        [4, 7],
        [5, 6],
      ],
      [
        [0, 1],
        [2, 3],
        [4, 5],
        [6, 7],
      ],
      [
        [0, 7],
        [1, 6],
        [2, 5],
        [3, 4],
      ],
      [
        [0, 2],
        [1, 3],
        [4, 6],
        [5, 7],
      ],
      [
        [0, 1],
        [2, 3],
        [4, 5],
        [6, 7],
      ],
    ]);
    expect(netSizes(net)).toEqual({ depth: 6, size: 24 });
  });

  it("bloky jako obr. 15.9: M₁ M₁ M₁ M₁ / M₂ M₂ / M₄", () => {
    const net = buildNet("t", 8);
    expect(net.blocks.map((b) => [b.label, b.lo, b.hi, b.from, b.to])).toEqual([
      ["M₁", 0, 1, 0, 0],
      ["M₁", 2, 3, 0, 0],
      ["M₁", 4, 5, 0, 0],
      ["M₁", 6, 7, 0, 0],
      ["M₂", 0, 3, 1, 2],
      ["M₂", 4, 7, 1, 2],
      ["M₄", 0, 7, 3, 5],
    ]);
    // popis vrstvy ve zprávě: obrácení + S₂ₘ, pak separátory
    expect(net.comps[net.layers[3][0]].part).toBe("obrácení + S₈");
    expect(net.comps[net.layers[4][0]].part).toBe("S₄");
  });

  it("n = 2ᵏ: hloubka k(k + 1)/2 a (n/2) · k(k + 1)/2 komparátorů (n = 16: 10 a 80)", () => {
    for (const [n, k] of [
      [2, 1],
      [4, 2],
      [8, 3],
      [16, 4],
    ])
      expect(netSizes(buildNet("t", n))).toEqual({
        depth: (k * (k + 1)) / 2,
        size: ((n / 2) * k * (k + 1)) / 2,
      });
  });

  it("trasa T₈ na 5, 2, 7, 1, 8, 3, 6, 4 po vrstvách a prohození 4, 2, 2, 2, 1, 2", () => {
    const r = runNet(buildNet("t", 8), [5, 2, 7, 1, 8, 3, 6, 4]);
    expect(r.gaps).toEqual([
      [5, 2, 7, 1, 8, 3, 6, 4],
      [2, 5, 1, 7, 3, 8, 4, 6],
      [2, 1, 5, 7, 3, 4, 8, 6],
      [1, 2, 5, 7, 3, 4, 6, 8],
      [1, 2, 4, 3, 7, 5, 6, 8],
      [1, 2, 4, 3, 6, 5, 7, 8],
      [1, 2, 3, 4, 5, 6, 7, 8],
    ]);
    expect(r.swapsPerLayer).toEqual([4, 2, 2, 2, 1, 2]);
  });

  it("zrcadlová slévačka (i, 2m − 1 − i) dá totéž co doslovná: obrátit, přilepit, B₂ₘ", () => {
    for (const m of [1, 2, 4]) {
      const merger = mergerComparators(m);
      const net: SortNet = {
        kind: "t",
        n: 2 * m,
        comps: merger,
        layers: asapLayers(merger, 2 * m),
        blocks: [],
        seq: false,
      };
      const values = Array.from({ length: 2 * m }, (_, i) => i + 1);
      // všechny rozdělení 1…2m na dvě setříděné poloviny
      for (let mask = 0; mask < 1 << (2 * m); mask++) {
        const x = values.filter((_, i) => (mask >> i) & 1);
        if (x.length !== m) continue;
        const y = values.filter((_, i) => !((mask >> i) & 1));
        expect(applyNet(net, [...x, ...y]), `${x}|${y}`).toEqual(
          literalMerge(x, y),
        );
      }
    }
  });

  it("T₈ setřídí všech 8! permutací", () => {
    const net = buildNet("t", 8);
    for (const p of permutations([1, 2, 3, 4, 5, 6, 7, 8]))
      expect(isSorted(applyNet(net, p))).toBe(true);
  });
});

describe("Batcherovo třídění (cv. 15.3.7, s. 398)", () => {
  it("n = 8: 19 komparátorů, hloubka 6, vrstvy sudo-liché slévačky", () => {
    const net = buildNet("batcher", 8);
    expect(netSizes(net)).toEqual({ depth: 6, size: 19 });
    const asSets = allPairs(net).map((l) =>
      l.map(([a, b]) => `${a},${b}`).sort(),
    );
    expect(asSets).toEqual(
      [
        ["0,1", "2,3", "4,5", "6,7"],
        ["0,2", "1,3", "4,6", "5,7"],
        ["1,2", "5,6", "0,4", "3,7"],
        ["2,6", "1,5"],
        ["2,4", "3,5"],
        ["1,2", "3,4", "5,6"],
      ].map((l) => l.sort()),
    );
  });

  it("BMerge z knihy jako rekurzivní funkce slévá dvě setříděné posloupnosti", () => {
    expect(bmergeBook([1, 4, 6, 7], [2, 3, 5, 8])).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(bmergeBook([3], [1])).toEqual([1, 3]);
  });

  it("síť dává stejný výstup jako BMerge z knihy (třídění = setřiď poloviny, pak BMerge)", () => {
    const r = rng(15_3_7);
    for (const n of [2, 4, 8, 16]) {
      const net = buildNet("batcher", n);
      for (let t = 0; t < 200; t++) {
        const x = Array.from({ length: n }, () => Math.floor(r() * 50));
        expect(applyNet(net, x)).toEqual(batcherSortBook(x));
        expect(batcherSortBook(x)).toEqual(sortedCopy(x));
      }
    }
  });

  it("komparátory jsou označené podle řádku BMerge: triviální případ, nebo min/max ve výstupu", () => {
    const net = buildNet("batcher", 8);
    expect(net.layers[0].every((c) => net.comps[c].base)).toBe(true);
    expect(net.layers[5].every((c) => !net.comps[c].base)).toBe(true);
  });
});

describe("0-1 princip (cv. 15.3.6) a společné vlastnosti", () => {
  const sorting: NetKind[] = ["bubble", "t", "batcher"];

  it("bublinková, Tₙ i Batcher setřídí všech 2ⁿ vstupů z nul a jedniček (n ≤ 8)", () => {
    for (const kind of sorting)
      for (const n of validSizes(kind).filter((n) => n <= 8)) {
        const c = zeroOneCheck(buildNet(kind, n));
        expect(c, `${kind} n = ${n}`).toEqual({
          total: 2 ** n,
          sorted: 2 ** n,
          counter: null,
        });
      }
  });

  it("n = 16: 0-1 princip i náhodné permutace", () => {
    const r = rng(16);
    for (const kind of sorting) {
      const net = buildNet(kind, 16);
      expect(zeroOneCheck(net).counter, kind).toBeNull();
      for (let t = 0; t < 100; t++) {
        const x = Array.from({ length: 16 }, (_, i) => i);
        for (let i = 15; i > 0; i--) {
          const j = Math.floor(r() * (i + 1));
          [x[i], x[j]] = [x[j], x[i]];
        }
        expect(isSorted(applyNet(net, x)), kind).toBe(true);
      }
    }
  });

  it("rozbitá síť (vynechaný komparátor) se odhalí na vstupu z nul a jedniček", () => {
    const net = buildNet("t", 8);
    for (let c = 0; c < net.comps.length; c++) {
      const chk = zeroOneCheck(net, [c]);
      expect(chk.counter, `bez komparátoru ${c}`).not.toBeNull();
      expect(chk.sorted).toBeLessThan(chk.total);
      expect(isSorted(applyNet(net, chk.counter!, [c]))).toBe(false);
      expect(chk.counter!.every((v) => v === 0 || v === 1)).toBe(true);
    }
  });

  it("separátor ani bitonická třídička nejsou třídicí sítě – 0-1 princip najde protipříklad", () => {
    expect(zeroOneCheck(buildNet("bitonic", 8)).counter).not.toBeNull();
    expect(zeroOneCheck(buildNet("sep", 8)).counter).not.toBeNull();
  });

  it("komparátory jedné vrstvy nesdílejí vodič (vrstva je opravdu paralelní) a menší vodič je vlevo", () => {
    for (const kind of NET_KINDS)
      for (const n of validSizes(kind)) {
        const net = buildNet(kind, n);
        for (const layer of net.layers) {
          const used = layer.flatMap((c) => [net.comps[c].a, net.comps[c].b]);
          expect(new Set(used).size, `${kind} ${n}`).toBe(used.length);
        }
        for (const c of net.comps) {
          expect(c.a).toBeLessThan(c.b);
          expect(c.b).toBeLessThan(n);
        }
        // každý komparátor je právě v jedné vrstvě
        expect(net.layers.flat().sort((a, b) => a - b)).toEqual(
          net.comps.map((_, i) => i),
        );
      }
  });

  it("výstup každé vrstvy je permutace vstupu (s. 392) a identity žetonů sedí s hodnotami", () => {
    const x = [9, 3, 3, 7, 1, 0, 5, 2];
    for (const kind of NET_KINDS) {
      const r = runNet(buildNet(kind, 8), x);
      for (let g = 0; g < r.gaps.length; g++) {
        expect(sortedCopy(r.gaps[g])).toEqual(sortedCopy(x));
        expect(r.ids[g].map((id) => x[id])).toEqual(r.gaps[g]);
      }
    }
  });

  it("platné velikosti: mocniny dvojky 2…16, bublinka 2…16", () => {
    expect(validSizes("t")).toEqual([2, 4, 8, 16]);
    expect(validSizes("bubble")).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect(() => buildNet("t", 6)).toThrow();
  });

  it("isBitonic: rotace čistě bitonické posloupnosti", () => {
    expect(isBitonic([4, 5, 7, 8, 6, 3, 1, 2])).toBe(true);
    expect(isBitonic([3, 1, 2])).toBe(true);
    expect(isBitonic([1, 2, 3, 4])).toBe(true);
    expect(isBitonic([1, 3, 2, 4])).toBe(false);
    expect(isBitonic([5, 2, 7, 1, 8, 3, 6, 4])).toBe(false);
    expect(isBitonic([0, 1, 0, 1])).toBe(false);
    expect(isBitonic([1, 1, 0, 0])).toBe(true);
  });
});
