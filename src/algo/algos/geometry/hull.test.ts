// Konvexní obal (Průvodce 16.1): KonvexníObal (zametání) a provázkový algoritmus – kroky, orientace, výsledek.
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step } from "../../core/steps";
import {
  bLabel,
  circlePoints,
  det,
  hullSteps,
  lexOrder,
  MAX_N,
  PC_SWEEP,
  PC_WRAP,
  PLANE,
  randomHullPoints,
  sweep,
  wrap,
  type HullPt,
  type HullState,
} from "./hull";

const pts = (xy: [number, number][]): HullPt[] =>
  xy.map(([x, y], id) => ({ id, x, y }));
const last = <S>(s: Step<S>[]) => s[s.length - 1];

/** Referenční obal (monotónní řetězec, bez bodů uvnitř hran) jako množina „x,y“. */
function reference(points: readonly HullPt[]): Set<string> {
  const ps = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (ps.length < 3) return new Set(ps.map((p) => `${p.x},${p.y}`));
  const cr = (o: HullPt, a: HullPt, b: HullPt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: HullPt[] = [];
  const up: HullPt[] = [];
  for (const p of ps) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0)
      lo.pop();
    lo.push(p);
  }
  for (const p of [...ps].reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0)
      up.pop();
    up.push(p);
  }
  return new Set([...lo, ...up].map((p) => `${p.x},${p.y}`));
}
const hullXY = (st: HullState) =>
  (st.hull ?? []).map((id) => {
    const p = st.points.find((q) => q.id === id)!;
    return `${p.x},${p.y}`;
  });
/** vrcholy obalu bez vnitřních úhlů 180° (ty kniha připouští, cv. 16.1.1) – pro srovnání s referencí */
function strictXY(st: HullState): Set<string> {
  const h = (st.hull ?? []).map((id) => st.points.find((p) => p.id === id)!);
  if (h.length < 3) return new Set(hullXY(st));
  return new Set(
    h
      .filter((v, i) => {
        const a = h[(i + h.length - 1) % h.length];
        const b = h[(i + 1) % h.length];
        return det(a, v, b).det !== 0;
      })
      .map((p) => `${p.x},${p.y}`),
  );
}
/** dvojnásobek orientované plochy (záporná = po směru hodinových ručiček, osa y nahoru) */
function area2(st: HullState): number {
  const h = (st.hull ?? []).map((id) => st.points.find((p) => p.id === id)!);
  let s = 0;
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

describe("pseudokód a pomůcky", () => {
  it("KonvexníObal má 9 řádků z knihy (str. 403–404)", () => {
    expect(PC_SWEEP).toHaveLength(9);
    expect(PC_SWEEP[0]).toMatch(/^Setřídíme body podle x-ové souřadnice/);
    expect(PC_SWEEP[1]).toContain("H ← D ← (b_1)");
    expect(PC_SWEEP[4]).toContain("orientovaný doleva");
    expect(PC_SWEEP[5]).toContain("Odebereme poslední bod");
    expect(PC_SWEEP[7]).toContain("s orientací doprava");
    expect(PC_SWEEP[8]).toContain("Výsledný obal");
    // Pseudocode čísluje sám – žádná knižní čísla na začátku
    for (const l of [...PC_SWEEP, ...PC_WRAP])
      expect(l).not.toMatch(/^\s*\d+\./);
  });

  it("provázkový algoritmus má vlastní pseudokód podle textu str. 402 a cv. 16.1.7", () => {
    expect(PC_WRAP.length).toBeGreaterThanOrEqual(5);
    expect(PC_WRAP.join(" ")).toContain("nejlevější");
  });

  it("det podle str. 404: u = h_k − h_{k−1}, v = b − h_k, det = x₁y₂ − x₂y₁", () => {
    const r = det({ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 3 });
    expect(r.u).toEqual([2, 1]);
    expect(r.v).toEqual([1, 2]);
    expect(r.det).toBe(2 * 2 - 1 * 1);
    expect(det({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }).det).toBe(0);
    expect(
      det({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }).det,
    ).toBeLessThan(0);
  });

  it("lexikografické třídění: podle x, při shodě podle y (str. 404)", () => {
    const o = lexOrder(
      pts([
        [5, 9],
        [1, 4],
        [5, 2],
        [1, 1],
      ]),
    );
    expect(o.map((p) => [p.x, p.y])).toEqual([
      [1, 1],
      [1, 4],
      [5, 2],
      [5, 9],
    ]);
  });

  it("popisky b₁ … b₄₀ dolními indexy", () => {
    expect(bLabel(0)).toBe("b₁");
    expect(bLabel(11)).toBe("b₁₂");
  });

  it("náhodné body: různé, uvnitř roviny, n oříznuté do 0…MAX_N, deterministické", () => {
    const a = randomHullPoints(25, 7);
    expect(a).toHaveLength(25);
    expect(new Set(a.map((p) => `${p.x},${p.y}`)).size).toBe(25);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(PLANE[0]);
      expect(p.y).toBeLessThanOrEqual(PLANE[3]);
    }
    expect(randomHullPoints(25, 7)).toEqual(a);
    expect(randomHullPoints(500, 1)).toHaveLength(MAX_N);
  });

  it("body na kružnici leží všechny na obalu (n = 3 … 24)", () => {
    for (let n = 3; n <= 24; n++) {
      const c = circlePoints(n);
      expect(c, `n=${n}`).toHaveLength(n);
      expect(reference(c).size, `n=${n}`).toBe(n);
    }
  });
});

describe("KonvexníObal – zametání", () => {
  it("krok 1 je třídění (ř. 1) a ukáže pořadí b₁ … bₙ, krok 2 vloží b₁ do obou obálek", () => {
    const s = materialize(
      sweep(
        pts([
          [50, 50],
          [10, 10],
          [90, 20],
        ]),
      ),
    );
    expect(s[0].line).toBe(0);
    expect(s[0].state.order).toEqual([1, 0, 2]);
    expect(s[0].message).toContain("b₁ = (10, 10)");
    expect(s[1].line).toBe(1);
    expect(s[1].state.H).toEqual([1]);
    expect(s[1].state.D).toEqual([1]);
  });

  it("zpráva o třídění skloňuje počet bodů (2–4 body, 5 bodů)", () => {
    const m = (n: number) =>
      materialize(sweep(randomHullPoints(n, 1)))[0].message;
    expect(m(3)).toContain("Setřídíme 3 body ");
    expect(m(4)).toContain("Setřídíme 4 body ");
    expect(m(5)).toContain("Setřídíme 5 bodů ");
  });

  it("hotový obal skloňuje počet vrcholů (4 vrcholy, 5 vrcholů)", () => {
    const end = (xy: [number, number][]) =>
      materialize(sweep(pts(xy))).at(-1)!.message;
    expect(
      end([
        [0, 0],
        [0, 9],
        [9, 9],
        [9, 0],
      ]),
    ).toContain("4 vrcholy");
    expect(
      end([
        [0, 0],
        [0, 9],
        [5, 12],
        [9, 9],
        [9, 0],
      ]),
    ).toContain("5 vrcholů");
  });

  it("výsledek = konvexní obal po směru hodinových ručiček od b₁ (náhodné množiny)", () => {
    const r = rng(3);
    for (let t = 0; t < 40; t++) {
      const n = 3 + Math.floor(r() * 30);
      const p = randomHullPoints(n, 100 + t);
      const st = last(materialize(sweep(p))).state;
      expect(strictXY(st), `t=${t}`).toEqual(reference(p));
      expect(area2(st)).toBeLessThan(0);
      expect(st.hull![0]).toBe(lexOrder(p)[0].id);
    }
  });

  it("všechny body na jedné přímce: zametání hlásí úsečku, ne „3 vrcholy po směru hodinových ručiček“ (CR-1)", () => {
    for (const xy of [
      [
        [0, 0],
        [5, 5],
        [10, 10],
      ],
      [
        [0, 2],
        [0, 6],
        [0, 0],
      ],
      [
        [10, 40],
        [30, 40],
        [20, 40],
        [90, 40],
      ],
    ] as [number, number][][]) {
      const p = pts(xy);
      const msg = last(materialize(sweep(p))).message;
      const ends = lexOrder(p);
      expect(msg, JSON.stringify(xy)).toMatch(
        new RegExp(
          `úsečka ${bLabel(0)} → ${bLabel(ends.length - 1)} – všechny body leží na přímce`,
        ),
      );
      expect(msg).not.toMatch(/po směru hodinových ručiček/);
      expect(last(materialize(wrap(p))).message).toMatch(/úsečka/);
    }
  });

  it("malá mřížka 0–6 (hodně bodů na přímce a se stejným x): zametání i provázek = ostrý obal (CR-4)", () => {
    const r = rng(11);
    for (let t = 0; t < 300; t++) {
      const n = 2 + Math.floor(r() * 14);
      const seen = new Set<string>();
      const xy: [number, number][] = [];
      while (xy.length < n) {
        const q: [number, number] = [
          Math.floor(r() * 7) * 10,
          Math.floor(r() * 7) * 10,
        ];
        if (seen.has(`${q}`)) continue;
        seen.add(`${q}`);
        xy.push(q);
      }
      const p = pts(xy);
      const ends = lexOrder(p);
      const a = ends[0];
      const b = ends[ends.length - 1];
      const flat = p.every((q) => det(a, b, q).det === 0);
      for (const run of [sweep, wrap]) {
        const s = materialize(run(p));
        const st = last(s).state;
        if (flat) {
          expect(last(s).message, `t=${t}`).toMatch(/úsečka|jediný bod/);
          continue;
        }
        expect(strictXY(st), `t=${t} ${run.name}`).toEqual(reference(p));
        expect(area2(st)).toBeLessThan(0);
      }
    }
  });

  it("horní obálka odebírá při det ≥ 0, dolní jen při det < 0 – body na přímce v D zůstanou (cv. 16.1.1)", () => {
    const p = pts([
      [10, 20],
      [50, 20],
      [90, 20],
      [50, 80],
    ]);
    const s = materialize(sweep(p));
    const st = last(s).state;
    expect(st.H).toEqual([0, 3, 2]);
    expect(st.D).toEqual([0, 1, 2]);
    expect(st.hull).toEqual([0, 3, 2, 1]);
    // test v D s det = 0 bod neodebral a zpráva vysvětluje proč
    const flat = s.find((x) => x.state.env === "D" && x.state.test?.det === 0);
    expect(flat?.state.test?.pop).toBe(false);
    expect(flat?.message).toMatch(/det M = .* = 0 –/);
    expect(flat?.message).toMatch(/180°/);
  });

  it("kroky odebírání (ř. 6) ubírají poslední bod obálky a ukazují ho jako odebraný", () => {
    const s = materialize(sweep(randomHullPoints(20, 5)));
    let pops = 0;
    for (let i = 1; i < s.length; i++) {
      const st = s[i].state;
      if (st.popped === null) continue;
      pops++;
      const prev = s[i - 1].state;
      const env = st.env === "H" ? "H" : "D";
      expect(st[env]).toEqual(prev[env].slice(0, -1));
      expect(prev[env][prev[env].length - 1]).toBe(st.popped);
      expect(prev.test?.pop).toBe(true);
      expect([5, 7]).toContain(s[i].line);
    }
    expect(pops).toBeGreaterThan(0);
  });

  it("každý test úhlu nese u, v a det; zpráva má typografické minus, žádné ASCII „-“ u čísel", () => {
    const s = materialize(sweep(randomHullPoints(15, 9)));
    const tests = s.filter((x) => x.state.test);
    expect(tests.length).toBeGreaterThan(5);
    for (const t of tests) {
      const { u, v, det: d } = t.state.test!;
      expect(d).toBe(u[0] * v[1] - v[0] * u[1]);
      expect(t.message).not.toMatch(/-\d/);
      // záporný činitel v závorce: „17·(−56)“, ne „17·−56“ ani „− −3·…“
      expect(t.message).not.toMatch(/·−|− −/);
      expect(t.message).toContain("det M");
    }
  });

  it("zametací přímka stojí na x aktuálního bodu b a body vpravo od ní ještě nejsou zpracované", () => {
    const p = randomHullPoints(12, 4);
    for (const st of materialize(sweep(p)).map((x) => x.state)) {
      if (st.cur === null) continue;
      const b = st.points.find((q) => q.id === st.cur)!;
      expect(st.sweepX).toBe(b.x);
    }
  });

  it("poslední krok je ř. 9 „Hotovo …“ s výčtem vrcholů obalu", () => {
    const s = materialize(sweep(randomHullPoints(10, 2)));
    expect(last(s).line).toBe(8);
    expect(last(s).message).toMatch(/^Hotovo/);
    expect(last(s).state.hull?.length).toBeGreaterThanOrEqual(3);
  });

  it("malé případy n = 0, 1, 2 (str. 402)", () => {
    const e = materialize(sweep([]));
    expect(e).toHaveLength(1);
    expect(e[0].outcome).toBe("neutral");
    expect(e[0].message).toMatch(/Žádné body/);
    const one = last(materialize(sweep(pts([[40, 40]])))).state;
    expect(one.hull).toEqual([0]);
    const two = last(
      materialize(
        sweep(
          pts([
            [70, 40],
            [20, 60],
          ]),
        ),
      ),
    ).state;
    expect(two.hull).toEqual([1, 0]);
  });

  it("40 bodů se vejde pod limit kroků a stejná x řeší lexikograficky", () => {
    const s = materialize(sweep(randomHullPoints(MAX_N, 1)));
    expect(s.length).toBeLessThan(1000);
    const col = last(
      materialize(
        sweep(
          pts([
            [10, 10],
            [10, 50],
            [10, 90],
            [60, 50],
          ]),
        ),
      ),
    ).state;
    expect(new Set(hullXY(col))).toEqual(new Set(["10,10", "10,90", "60,50"]));
  });
});

describe("provázkový algoritmus (obr. 16.2)", () => {
  it("začne v nejlevějším bodě L a dá stejný obal jako zametání, po směru hodinových ručiček", () => {
    for (let t = 0; t < 30; t++) {
      const p = randomHullPoints(3 + (t % 25), 200 + t);
      const st = last(materialize(wrap(p))).state;
      expect(st.hull![0]).toBe(lexOrder(p)[0].id);
      expect(strictXY(st), `t=${t}`).toEqual(reference(p));
      expect(area2(st)).toBeLessThan(0);
    }
  });

  it("kandidáta q nahradí bod p nalevo od cq; na přímce vyhraje vzdálenější", () => {
    const s = materialize(
      wrap(
        pts([
          [0, 0],
          [10, 10],
          [20, 20],
          [20, 0],
        ]),
      ),
    );
    expect(last(s).state.hull).toEqual([0, 2, 3]);
    expect(
      s.some((x) => x.state.probe !== null && x.state.test?.det === 0),
    ).toBe(true);
  });

  it("poslední krok začíná „Hotovo“, malé vstupy fungují", () => {
    const s = materialize(wrap(randomHullPoints(8, 3)));
    expect(last(s).message).toMatch(/^Hotovo/);
    expect(materialize(wrap([]))[0].outcome).toBe("neutral");
    expect(last(materialize(wrap(pts([[5, 5]])))).state.hull).toEqual([0]);
    expect(
      last(
        materialize(
          wrap(
            pts([
              [50, 5],
              [5, 5],
            ]),
          ),
        ),
      ).state.hull,
    ).toEqual([1, 0]);
  });

  it("hullSteps vybere algoritmus a vrací materializované kroky", () => {
    const p = randomHullPoints(6, 1);
    expect(hullSteps(p, "wrap")[0].state.alg).toBe("wrap");
    expect(hullSteps(p, "sweep")[0].state.alg).toBe("sweep");
  });
});
