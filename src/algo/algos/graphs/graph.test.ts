/**
 * Testy graph.ts: parsování vstupu, uspořádání popisků, rozložení, náhodný graf a pomocné funkce.
 * (Algoritmy samotné testuje algorithms.test.ts.)
 */
import { describe, expect, it } from "vitest";
import { rng } from "../../core/steps";
import {
  cmpLabel,
  fmtNum,
  graphToText,
  layoutGraph,
  MAX_EDGES,
  MAX_NODES,
  neighbors,
  parseGraph,
  parseGraphInput,
  plural,
  randomEdgeRange,
  randomGraph,
  remapStart,
  roundNum,
  type Graph,
} from "./graph";
import { PRESETS } from "./presets";

const SEEDS = 60;

/** Komponenty souvislosti (neorientovaně) – pole reprezentantů. */
function components(g: Graph): number[] {
  const comp = g.nodes.map((n) => n.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of g.edges) {
      const m = Math.min(comp[e.u], comp[e.v]);
      if (comp[e.u] !== m || comp[e.v] !== m) {
        comp[e.u] = m;
        comp[e.v] = m;
        changed = true;
      }
    }
  }
  return comp;
}

/** Kahnův algoritmus: má orientovaný graf cyklus? */
function hasCycle(g: Graph): boolean {
  const indeg = g.nodes.map(() => 0);
  for (const e of g.edges) indeg[e.v]++;
  const q = g.nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
  let removed = 0;
  while (q.length) {
    const v = q.pop()!;
    removed++;
    for (const e of g.edges) if (e.u === v && --indeg[e.v] === 0) q.push(e.v);
  }
  return removed !== g.nodes.length;
}

/** Vrcholy dosažitelné z `s` po směru hran. */
function reachable(g: Graph, s: number): Set<number> {
  const seen = new Set([s]);
  const q = [s];
  while (q.length) {
    const v = q.pop()!;
    for (const { v: w } of neighbors(g, v)) {
      if (!seen.has(w)) {
        seen.add(w);
        q.push(w);
      }
    }
  }
  return seen;
}

/* ------------------------------------------------------------------ parsování */

describe("parseGraph", () => {
  it("vrcholy, hrany, váhy, komentáře, oddělovače", () => {
    const g = parseGraph(
      "a b 3\n# komentář\n\n  b,c;7  # pozn.\nd\r\na b",
      false,
      true,
    );
    expect(g.nodes.map((n) => n.label)).toEqual(["a", "b", "c", "d"]);
    expect(g.edges.map((e) => [e.u, e.v, e.w])).toEqual([
      [0, 1, 3],
      [1, 2, 7],
      [0, 1, 1],
    ]);
  });

  it("oddělovač na začátku/konci řádku nevytvoří vrchol s prázdným názvem", () => {
    const g1 = parseGraph("a,", false, false);
    expect(g1.nodes.map((n) => n.label)).toEqual(["a"]);
    expect(g1.edges).toEqual([]);
    const g2 = parseGraph(",a b", false, false);
    expect(g2.nodes.map((n) => n.label)).toEqual(["a", "b"]);
    expect(g2.edges.map((e) => [e.u, e.v])).toEqual([[0, 1]]);
  });

  it("oddělovač na konci řádku s hranou nezmění cenu hrany na 0", () => {
    // dříve: "A B;" → tokeny ['A', 'B', ''] → Number('') = 0
    for (const line of ["A B;", "A B,", "A B ;"]) {
      const g = parseGraph(line, false, true);
      expect(
        g.edges.map((e) => e.w),
        `řádek "${line}"`,
      ).toEqual([1]);
    }
  });

  it("řádek jen z oddělovačů nebo komentáře nic nepřidá a nespadne", () => {
    const p = parseGraphInput(",\n ; , \n# jen komentář\n\n", false, true);
    expect(p.graph.nodes).toEqual([]);
    expect(p.graph.edges).toEqual([]);
    expect(p.errors).toEqual([]);
  });

  it("ceny: desetinná tečka, desetinná čárka u třetího údaje, typografické minus, exponent", () => {
    const p = parseGraphInput(
      "A B 2,5\nA C 0.25\nA D −5\nA E -3\nA F 1e2\nA G +4\nA H .5",
      false,
      true,
    );
    expect(p.errors).toEqual([]);
    expect(p.graph.edges.map((e) => e.w)).toEqual([
      2.5, 0.25, -5, -3, 100, 4, 0.5,
    ]);
    // čárka dál funguje jako oddělovač, kde není pochyb
    expect(
      parseGraph("1,2,3", false, true).edges.map((e) => [e.u, e.v, e.w]),
    ).toEqual([[0, 1, 3]]);
    expect(parseGraph("1 2,5", false, true).edges.map((e) => e.w)).toEqual([5]);
  });

  it("neplatná cena a údaje navíc se nehlásí tiše jako cena 1 – řádek je chyba a hrana nevznikne", () => {
    const p = parseGraphInput(
      "A B 4\nA C x\nC B 1\nA E 1e999\nA F 0x10\nA G 3 7\nA H 1 2,5",
      false,
      true,
    );
    expect(
      p.graph.edges.map(
        (e) => `${p.graph.nodes[e.u].label}${p.graph.nodes[e.v].label}${e.w}`,
      ),
    ).toEqual(["AB4", "CB1"]);
    expect(p.errors.map((e) => e.line)).toEqual([2, 4, 5, 6, 7]);
    expect(p.errors[0].message).toMatch(/Řádek 2: cena „x“ není číslo/);
    expect(p.errors[3].message).toMatch(/Řádek 6: příliš mnoho údajů/);
    // i v neohodnoceném grafu je nečíselný třetí údaj chyba (jinak by se tiše zahodil)
    expect(parseGraphInput("a b c", true, false).errors).toHaveLength(1);
  });

  it("smyčky a násobné hrany projdou, ale s upozorněním", () => {
    const und = parseGraphInput("a a\na b\nb a\nb c", false, false);
    expect(und.errors).toEqual([]);
    expect(und.graph.edges).toHaveLength(4);
    expect(und.warnings.map((w) => w.line)).toEqual([1, 3]);
    expect(und.warnings[0].message).toMatch(/smyčka/);
    expect(und.warnings[1].message).toMatch(/už je na řádku 2/);
    // v orientovaném grafu je protisměrná dvojice v pořádku, stejnosměrná ne
    const dir = parseGraphInput("a b\nb a\na b", true, false);
    expect(dir.warnings.map((w) => w.line)).toEqual([3]);
  });

  it("limit velikosti: větší graf je chyba (stránka ho nepřijme), menší ne", () => {
    const path = (n: number) =>
      Array.from({ length: n - 1 }, (_, i) => `${i + 1} ${i + 2}`).join("\n");
    expect(parseGraphInput(path(MAX_NODES), false, false).errors).toEqual([]);
    const big = parseGraphInput(path(MAX_NODES + 1), false, false);
    expect(big.errors).toHaveLength(1);
    expect(big.errors[0].message).toMatch(/61 vrcholů.*nejvýše 60/);
    const dense: string[] = [];
    for (let i = 1; i <= 21; i++)
      for (let j = i + 1; j <= 21; j++) dense.push(`${i} ${j}`);
    expect(dense.length).toBeGreaterThan(MAX_EDGES);
    expect(
      parseGraphInput(dense.join("\n"), false, false).errors[0].message,
    ).toMatch(/210 hran.*nejvýše 200/);
  });

  it("velký vstup nezmrazí stránku: 400 vrcholů do 1 s, 5000 vrcholů doběhne se souřadnicemi v [0, 1]", () => {
    for (const n of [400, 5000]) {
      const lines: string[] = [];
      for (let i = 1; i < n; i++) lines.push(`${i} ${i + 1}`);
      const t0 = performance.now();
      const g = parseGraph(lines.join("\n"), false, false);
      const ms = performance.now() - t0;
      expect(g.nodes.length).toBe(n);
      expect(ms, `parseGraph(${n}) trval ${ms.toFixed(0)} ms`).toBeLessThan(
        1000,
      );
      expect(
        g.nodes.every((v) => v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1),
      ).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ uspořádání popisků */

describe("cmpLabel / neighbors", () => {
  const LABELS = [
    "2",
    "10",
    "1a",
    "1",
    "01",
    "1.0",
    "-3",
    "1.5",
    "1.10",
    "a",
    "A",
    "b",
    "č",
    "c",
    "v2",
    "v10",
    "x",
    "",
    "0x10",
    "1e3",
    "9".repeat(400),
    "8".repeat(400),
  ];

  it("je úplné uspořádání (antisymetrie, tranzitivita) i na smíšených popiscích", () => {
    // dříve: 2 < 10 (číselně), 10 < 1a (textově), 1a < 2 (textově) → cyklus
    const sgn = (a: string, b: string) => Math.sign(cmpLabel(a, b));
    expect(
      sgn("2", "10") < 0 && sgn("10", "1a") < 0 && sgn("1a", "2") < 0,
    ).toBe(false);
    for (const a of LABELS) {
      for (const b of LABELS) {
        expect(sgn(a, b), `${a} vs ${b}`).toBe(-sgn(b, a) || 0);
        if (a !== b)
          expect(
            sgn(a, b),
            `různé popisky ${a}, ${b} nesmí být „stejné“`,
          ).not.toBe(0);
        for (const c of LABELS) {
          if (sgn(a, b) < 0 && sgn(b, c) < 0)
            expect(sgn(a, c), `${a} < ${b} < ${c}`).toBeLessThan(0);
        }
      }
    }
  });

  it("čísla podle hodnoty a před ostatními, zbytek přirozeně česky", () => {
    expect(["10", "9", "2", "-1", "-2", "1.5", "1.10"].sort(cmpLabel)).toEqual([
      "-2",
      "-1",
      "1.10",
      "1.5",
      "2",
      "9",
      "10",
    ]);
    expect(["b", "10", "a", "2", "1a"].sort(cmpLabel)).toEqual([
      "2",
      "10",
      "1a",
      "a",
      "b",
    ]);
    expect(["v10", "v2", "v1"].sort(cmpLabel)).toEqual(["v1", "v2", "v10"]);
    expect(["d", "č", "c"].sort(cmpLabel)).toEqual(["c", "č", "d"]);
  });

  it("pořadí sousedů „podle názvu“ nezávisí na pořadí řádků vstupu", () => {
    const orders = new Set<string>();
    const labs = ["2", "10", "1a"];
    for (const perm of [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ]) {
      const g = parseGraph(
        perm.map((i) => `x ${labs[i]}`).join("\n"),
        true,
        false,
      );
      orders.add(
        neighbors(g, 0)
          .map((nb) => g.nodes[nb.v].label)
          .join(" "),
      );
    }
    expect([...orders]).toEqual(["2 10 1a"]);
  });

  it("předvolby: sousedé „prasátka“ jdou podle čísel", () => {
    const g = parseGraph(PRESETS[0].text, true, false);
    const id = (l: string) => g.nodes.find((n) => n.label === l)!.id;
    expect(neighbors(g, id("0")).map((x) => g.nodes[x.v].label)).toEqual([
      "1",
      "3",
      "9",
    ]);
    expect(neighbors(g, id("6")).map((x) => g.nodes[x.v].label)).toEqual([
      "0",
      "3",
      "7",
    ]);
  });
});

/* ------------------------------------------------------------------ rozložení */

/** Původní (pomalá) verze rozložení – reference: zrychlená verze musí dát stejný obrázek. */
function referenceLayout(g: Graph, seed = 42) {
  const n = g.nodes.length;
  const r = rng(seed);
  g.nodes.forEach((nd, i) => {
    const a = (2 * Math.PI * i) / n;
    nd.x = 0.5 + 0.4 * Math.cos(a) + (r() - 0.5) * 0.05;
    nd.y = 0.5 + 0.4 * Math.sin(a) + (r() - 0.5) * 0.05;
  });
  const adj = new Set(g.edges.map((e) => e.u + ":" + e.v));
  const k = 0.9 / Math.sqrt(n);
  let temp = 0.1;
  for (let it = 0; it < 300; it++) {
    const dx = new Array(n).fill(0);
    const dy = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ex = g.nodes[i].x - g.nodes[j].x;
        const ey = g.nodes[i].y - g.nodes[j].y;
        const d = Math.hypot(ex, ey);
        const rep = (k * k) / d;
        const att =
          adj.has(i + ":" + j) || adj.has(j + ":" + i) ? (d * d) / k : 0;
        const f = (rep - att) / d;
        dx[i] += ex * f;
        dy[i] += ey * f;
        dx[j] -= ex * f;
        dy[j] -= ey * f;
      }
    }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(dx[i], dy[i]) || 1;
      const s = Math.min(d, temp) / d;
      g.nodes[i].x += dx[i] * s;
      g.nodes[i].y += dy[i] * s;
      g.nodes[i].x += (0.5 - g.nodes[i].x) * 0.01;
      g.nodes[i].y += (0.5 - g.nodes[i].y) * 0.01;
    }
    temp *= 0.985;
  }
  const xs = g.nodes.map((v) => v.x);
  const ys = g.nodes.map((v) => v.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  for (const v of g.nodes) {
    v.x = 0.06 + (0.88 * (v.x - minX)) / (maxX - minX);
    v.y = 0.08 + (0.84 * (v.y - minY)) / (maxY - minY);
  }
}

describe("layoutGraph", () => {
  it("předvolby a náhodné grafy vypadají stejně jako před zrychlením", () => {
    const texts = PRESETS.map((p) => p.text);
    for (let s = 1; s <= 5; s++)
      texts.push(randomGraph(8 + s, 12 + 2 * s, false, false, s));
    for (const text of texts) {
      const g = parseGraph(text, false, false);
      const ref: Graph = structuredClone(g);
      referenceLayout(ref);
      for (const n of g.nodes) {
        expect(n.x).toBeCloseTo(ref.nodes[n.id].x, 9);
        expect(n.y).toBeCloseTo(ref.nodes[n.id].y, 9);
      }
    }
  });

  it("souřadnice jsou konečné a v [0, 1] i pro smyčky, násobné hrany, izolované vrcholy a jediný vrchol", () => {
    const texts = ["a", "a a", "a\nb", "a b\na b\nb a\nc", "1 1\n2 2\n3 3"];
    for (let s = 1; s <= SEEDS; s++)
      texts.push(randomGraph(1 + (s % 12), s % 20, s % 2 === 0, false, s));
    for (const text of texts) {
      const g = parseGraph(text, false, false);
      expect(g.nodes.length).toBeGreaterThan(0);
      for (const n of g.nodes) {
        expect(Number.isFinite(n.x) && Number.isFinite(n.y), text).toBe(true);
        expect(n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1, text).toBe(true);
      }
    }
  });

  it("poškozený graf (hrana mimo vrcholy) rozložení neshodí", () => {
    const g: Graph = {
      nodes: [0, 1, 2].map((id) => ({ id, label: String(id), x: 0, y: 0 })),
      edges: [
        { id: 0, u: 0, v: 7, w: 1 },
        { id: 1, u: -1, v: 1.5, w: 1 },
      ],
      directed: false,
      weighted: false,
    };
    expect(() => layoutGraph(g)).not.toThrow();
    expect(
      g.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ náhodný graf */

describe("randomGraph", () => {
  it("n vrcholů, m hran, souvislý, bez smyček a násobných hran, ceny 1…20", () => {
    for (let s = 1; s <= SEEDS; s++) {
      for (const directed of [false, true]) {
        const p = parseGraphInput(
          randomGraph(8, 12, directed, true, s),
          directed,
          true,
        );
        const g = p.graph;
        expect(p.errors).toEqual([]);
        expect(p.warnings).toEqual([]);
        expect(g.nodes.length).toBe(8);
        expect(g.edges.length).toBe(12);
        expect(new Set(components(g)).size).toBe(1);
        expect(
          g.edges.every(
            (e) =>
              e.u !== e.v && Number.isInteger(e.w) && e.w >= 1 && e.w <= 20,
          ),
        ).toBe(true);
      }
    }
  });

  it("orientovaný graf: z prvního vrcholu vstupu (výchozí v₀) je dosažitelný celý graf", () => {
    // dříve byly hrany kostry orientované náhodně a z v₀ bylo dosažitelných průměrně jen 6 z 8 vrcholů
    for (let s = 1; s <= SEEDS; s++) {
      const g = parseGraph(randomGraph(8, 12, true, false, s), true, false);
      expect(reachable(g, 0).size, `seed ${s}`).toBe(8);
    }
  });

  it("volba acyclic: vždy DAG (dříve 9 % případů), 12 různých hran, pořadí není triviálně 1…n", () => {
    let trivial = 0;
    for (let s = 1; s <= SEEDS; s++) {
      const p = parseGraphInput(
        randomGraph(8, 12, true, false, s, { acyclic: true }),
        true,
        false,
      );
      const g = p.graph;
      expect(p.warnings).toEqual([]);
      expect(g.nodes.length).toBe(8);
      expect(g.edges.length).toBe(12);
      expect(hasCycle(g), `seed ${s}`).toBe(false);
      expect(new Set(components(g)).size).toBe(1);
      if (
        g.edges.every(
          (e) => Number(g.nodes[e.u].label) < Number(g.nodes[e.v].label),
        )
      )
        trivial++;
    }
    expect(trivial).toBeLessThan(SEEDS / 10);
    // bez volby (nebo u neorientovaného grafu) se nic nemění
    expect(randomGraph(8, 12, false, false, 5, { acyclic: true })).toBe(
      randomGraph(8, 12, false, false, 5),
    );
  });

  it("nesmyslné parametry (NaN, záporné, zlomky, obří čísla) neshodí ani nezacyklí generátor", () => {
    for (const n of [NaN, -5, 0, 0.5, 1, 2.9, 1e9, Infinity, -Infinity]) {
      for (const m of [NaN, -1, 0, 3.7, 1e9, Infinity]) {
        for (const seed of [1, NaN, -7, 1e300]) {
          const p = parseGraphInput(
            randomGraph(n, m, true, true, seed),
            true,
            true,
          );
          expect(p.errors, `n=${n} m=${m}`).toEqual([]);
          expect(p.graph.nodes.length).toBeGreaterThanOrEqual(1);
          expect(p.graph.nodes.length).toBeLessThanOrEqual(MAX_NODES);
          expect(p.graph.edges.length).toBeLessThanOrEqual(MAX_EDGES);
        }
      }
    }
    expect(randomGraph(1, 5, false, false, 3)).toBe("1");
    // m menší než n − 1 dá aspoň kostru, m větší než úplný graf dá úplný graf
    expect(
      parseGraph(randomGraph(6, 0, false, false, 3), false, false).edges.length,
    ).toBe(5);
    expect(
      parseGraph(randomGraph(6, 999, false, false, 3), false, false).edges
        .length,
    ).toBe(15);
    expect(
      parseGraph(randomGraph(5, 999, true, false, 3), true, false).edges.length,
    ).toBe(20);
    expect(
      parseGraph(
        randomGraph(5, 999, true, false, 3, { acyclic: true }),
        true,
        false,
      ).edges.length,
    ).toBe(10);
  });
});

/* ------------------------------------------------------------------ drobnosti */

describe("pomocné funkce", () => {
  it("remapStart: v₀ zůstane na vrcholu se stejným názvem, jinak první vrchol", () => {
    const a = parseGraph("A B 4\nA C 2\nC F 1", false, true);
    const b = parseGraph("X A 1\nA B 1\nF C 2", false, true); // id se posunula
    const idA = (g: Graph, l: string) => g.nodes.find((n) => n.label === l)!.id;
    expect(remapStart(a, idA(a, "F"), b)).toBe(idA(b, "F"));
    expect(remapStart(a, idA(a, "C"), b)).toBe(idA(b, "C"));
    expect(remapStart(a, idA(a, "F"), parseGraph("P Q", false, true))).toBe(0);
    for (const bad of [NaN, -1, 99, 0.5]) expect(remapStart(a, bad, b)).toBe(0);
  });

  it("fmtNum / roundNum: celá čísla beze změny, součty bez artefaktů plovoucí čárky, česká desetinná čárka (E3)", () => {
    expect(fmtNum(0.1 + 0.2)).toBe("0,3");
    expect(roundNum(0.1 + 0.2)).toBe(0.3);
    expect(fmtNum(17)).toBe("17");
    expect(fmtNum(-2.5)).toBe("−2,5");
    expect(fmtNum(-3)).toBe("−3");
    expect(fmtNum(-0)).toBe("0");
    expect(fmtNum(1e21)).toBe("1e+21");
    expect(fmtNum(Infinity)).toBe("∞");
    expect(fmtNum(-Infinity)).toBe("−∞");
    expect(fmtNum(NaN)).toBe("?");
  });

  it("textový zápis grafu (import/export, odkaz) drží desetinnou tečku – čárka je jen pro zobrazení (E3)", () => {
    const g = parseGraph("A B 2,5\nB C 0.25", false, true);
    expect(graphToText(g)).toBe("A B 2.5\nB C 0.25");
  });

  it("plural: česká množná čísla", () => {
    expect(plural(1, "hranu", "hrany", "hran")).toBe("1 hranu");
    expect(plural(3, "hranu", "hrany", "hran")).toBe("3 hrany");
    expect(plural(5, "hranu", "hrany", "hran")).toBe("5 hran");
    expect(plural(0, "hranu", "hrany", "hran")).toBe("0 hran");
  });
});

describe("stránka: kontrola během psaní a rozsah náhodného grafu", () => {
  it("parseGraphInput bez rozložení hlásí stejné chyby, upozornění i graf, jen souřadnice zůstanou 0", () => {
    const text = "a b 2\nb c x\na a\na b 3\nd";
    const full = parseGraphInput(text, false, true);
    const fast = parseGraphInput(text, false, true, { layout: false });
    expect(fast.errors).toEqual(full.errors);
    expect(fast.warnings).toEqual(full.warnings);
    expect(fast.graph.edges).toEqual(full.graph.edges);
    expect(fast.graph.nodes.map((n) => n.label)).toEqual(
      full.graph.nodes.map((n) => n.label),
    );
    expect(fast.graph.nodes.every((n) => n.x === 0 && n.y === 0)).toBe(true);
  });

  it("randomEdgeRange: n − 1 … nejvýše úplný graf a MAX_EDGES; randomGraph dodrží každé m z rozsahu", () => {
    expect(randomEdgeRange(8, false)).toEqual({ min: 7, max: 28 });
    expect(randomEdgeRange(8, true)).toEqual({ min: 7, max: 56 });
    expect(randomEdgeRange(8, true, true)).toEqual({ min: 7, max: 28 });
    expect(randomEdgeRange(1, false)).toEqual({ min: 0, max: 0 });
    expect(randomEdgeRange(MAX_NODES, true)).toEqual({
      min: MAX_NODES - 1,
      max: MAX_EDGES,
    });
    for (const [n, directed, acyclic] of [
      [5, false, false],
      [5, true, false],
      [6, true, true],
    ] as const) {
      const { min, max } = randomEdgeRange(n, directed, acyclic);
      for (let m = min; m <= max; m++) {
        const g = parseGraph(
          randomGraph(n, m, directed, false, m * 31 + n, { acyclic }),
          directed,
          false,
        );
        expect(g.edges.length, `n=${n} m=${m}`).toBe(m);
        expect(g.nodes.length).toBe(n);
      }
    }
  });
});
