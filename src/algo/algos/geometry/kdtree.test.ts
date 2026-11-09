import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { materialize, rng, type Step } from "../../core/steps";
import {
  build,
  clampInt,
  clipBox,
  DEFAULT_N,
  DEFAULT_QUERY,
  DEFAULT_SEED,
  finalXs,
  kdDepth,
  layoutKd,
  MAX_N,
  normalizeQuery,
  parseIntParam,
  parseNumberField,
  parseQueryParam,
  PC_BUILD,
  PC_QUERY,
  query,
  queryParam,
  randomPoints,
  sameBox,
  type Box,
  type KdState,
  type KNode,
  type Pt,
} from "./kdtree";

/* ---------- pomocníci ---------- */

const buildSteps = (points: Pt[]) => materialize(build(points));
const last = <S>(steps: Step<S>[]) => steps[steps.length - 1];
const built = (points: Pt[]) => last(buildSteps(points)).state;
const querySteps = (tree: KdState, q: readonly number[]) =>
  materialize(query(structuredClone(tree), q));

const coord = (p: Pt, axis: 0 | 1) => (axis === 0 ? p.x : p.y);
function subtree(st: KdState, id: number | null, out: KNode[] = []): KNode[] {
  if (id === null) return out;
  out.push(st.nodes[id]);
  subtree(st, st.nodes[id].left, out);
  subtree(st, st.nodes[id].right, out);
  return out;
}
const inQ = (p: Pt, q: Box) =>
  p.x >= q[0] && p.x <= q[2] && p.y >= q[1] && p.y <= q[3];
const foundIds = (st: KdState) =>
  Object.entries(st.ptMarks)
    .filter(([, cls]) => cls === "pt-found")
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
const bruteIds = (st: KdState, q: Box) =>
  st.points
    .filter((p) => inQ(p, q))
    .map((p) => p.id)
    .sort((a, b) => a - b);

/** Strom obsahuje každý bod právě jednou, střídá osy, v kořeni každého podstromu je medián a oblast vrcholu obsahuje celý podstrom. */
function checkKdInvariants(st: KdState, strict: boolean) {
  const all = subtree(st, st.root);
  expect(all.map((v) => v.pt.id).sort((a, b) => a - b)).toEqual(
    st.points.map((p) => p.id).sort((a, b) => a - b),
  );
  const rec = (id: number | null, d: number) => {
    if (id === null) return;
    const v = st.nodes[id];
    expect(v.axis).toBe(d % 2);
    const L = subtree(st, v.left);
    const R = subtree(st, v.right);
    expect(L.length).toBe(Math.floor((L.length + R.length + 1) / 2));
    for (const u of L) {
      if (strict) expect(coord(u.pt, v.axis)).toBeLessThan(coord(v.pt, v.axis));
      else expect(coord(u.pt, v.axis)).toBeLessThanOrEqual(coord(v.pt, v.axis));
    }
    for (const u of R) {
      if (strict)
        expect(coord(u.pt, v.axis)).toBeGreaterThan(coord(v.pt, v.axis));
      else
        expect(coord(u.pt, v.axis)).toBeGreaterThanOrEqual(coord(v.pt, v.axis));
    }
    for (const u of [v, ...L, ...R]) expect(inQ(u.pt, v.box)).toBe(true);
    rec(v.left, d + 1);
    rec(v.right, d + 1);
  };
  rec(st.root, 0);
}

/* ---------- vstupy ---------- */

describe("k-d strom – vstupy", () => {
  it("randomPoints: n bodů v 5..95, žádné dva nesdílejí x ani y (předpoklad ze skript)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const pts = randomPoints(MAX_N, seed);
      expect(pts.length).toBe(MAX_N);
      expect(new Set(pts.map((p) => p.x)).size).toBe(MAX_N);
      expect(new Set(pts.map((p) => p.y)).size).toBe(MAX_N);
      expect(pts.map((p) => p.id)).toEqual(
        Array.from({ length: MAX_N }, (_, i) => i),
      );
      for (const p of pts)
        expect(
          p.x >= 5 &&
            p.x <= 95 &&
            p.y >= 5 &&
            p.y <= 95 &&
            Number.isInteger(p.x) &&
            Number.isInteger(p.y),
        ).toBe(true);
    }
    expect(randomPoints(12, 11)).toEqual(randomPoints(12, 11));
  });

  it("BUG kd-n-input-noninteger: neceločíselné / nesmyslné n nikdy nedá jiný počet bodů, než jaký se ukáže v poli", () => {
    expect(clampInt(2.5, 1, MAX_N, 12)).toBe(3);
    expect(randomPoints(clampInt(2.5, 1, MAX_N, 12), 5).length).toBe(3);
    expect(clampInt(0, 1, MAX_N, 12)).toBe(1);
    expect(clampInt(-7, 1, MAX_N, 12)).toBe(1);
    expect(clampInt(1e9, 1, MAX_N, 12)).toBe(MAX_N);
    expect(clampInt(NaN, 1, MAX_N, 12)).toBe(12);
    expect(clampInt(Infinity, 1, MAX_N, 12)).toBe(12);
    // prázdné / rozepsané pole hodnotu nemění (dřív Number('') = 0 → n = 1 a nové body)
    expect(parseNumberField("")).toBeNull();
    expect(parseNumberField("  ")).toBeNull();
    expect(parseNumberField("abc")).toBeNull();
    expect(parseNumberField("-")).toBeNull();
    expect(parseNumberField(" 20 ")).toBe(20);
    expect(parseNumberField("2.5")).toBe(2.5);
    // i přímé volání s nesmyslným n skončí a vrátí 0..MAX_N bodů
    for (const n of [2.5, -3, 0, NaN, Infinity, -Infinity, 1e12, 30.4]) {
      const pts = randomPoints(n, 7);
      expect(pts.length).toBeLessThanOrEqual(MAX_N);
      expect(Number.isFinite(n) ? pts.length : 0).toBe(pts.length);
    }
    expect(randomPoints(5, NaN).length).toBe(5);
  });

  it("normalizeQuery seřadí meze a odmítne nečíselné; clipBox ořízne do roviny", () => {
    expect(normalizeQuery([70, 30, 20, 80])).toEqual([20, 30, 70, 80]);
    expect(normalizeQuery([20, 80, 70, 30])).toEqual([20, 30, 70, 80]);
    expect(normalizeQuery([20, 30, 70, 80])).toEqual([20, 30, 70, 80]);
    expect(normalizeQuery([NaN, 30, 70, 80])).toBeNull();
    expect(normalizeQuery([0, 0, Infinity, 80])).toBeNull();
    expect(normalizeQuery([1, 2, 3])).toBeNull();
    expect(clipBox([-50, 20, 150, 30])).toEqual([0, 20, 100, 30]);
    expect(clipBox([120, 0, 150, 30])).toBeNull();
  });
});

/* ---------- Build ---------- */

describe("k-d strom – Build", () => {
  it("pro n = 1..30 postaví dokonale vyvážený strom se střídáním os; body < m vlevo, body > m vpravo", () => {
    for (let n = 1; n <= MAX_N; n++) {
      const steps = buildSteps(randomPoints(n, 100 + n));
      const st = last(steps).state;
      expect(st.points.length).toBe(n);
      expect(Object.keys(st.nodes).length).toBe(n);
      checkKdInvariants(st, true);
      // jeden krok na vrchol + úvod + závěr; řádky pseudokódu existují
      expect(steps.length).toBe(n + 2);
      for (const s of steps)
        expect(
          s.line === null || (s.line >= 0 && s.line < PC_BUILD.length),
        ).toBe(true);
      // po dokončení nezůstane žádné zvýraznění
      expect(st.marks).toEqual({});
      expect(st.ptMarks).toEqual({});
      expect(st.region).toBeNull();
    }
  });

  it("BUG kd-depth-claim-ceil-log: závěrečná zpráva uvádí skutečnou hloubku ⌊log₂ n⌋ (kořen = 0), ne ⌈log₂ n⌉", () => {
    for (let n = 1; n <= MAX_N; n++) {
      const steps = buildSteps(randomPoints(n, n));
      const fin = last(steps);
      const depth = kdDepth(fin.state);
      const shown = Math.max(
        ...steps.map((s) => Number(s.state.vars["hloubka"] ?? 0)),
      );
      expect(shown).toBe(depth);
      expect(depth).toBe(Math.floor(Math.log2(n)));
      expect(fin.message).not.toContain("⌈");
      expect(fin.message).toContain(`hloubka ${depth} = ⌊log₂ ${n}⌋`);
    }
  });

  it("BUG kd-build-pseudocode-sort-vs-complexity: pseudokód hledá medián lineárně (netřídí), takže O(n log n) platí", () => {
    expect(PC_BUILD.join("\n")).not.toMatch(/[Ss]etřídíme/);
    expect(PC_BUILD[3]).toMatch(/medián/);
    expect(last(buildSteps(randomPoints(12, 11))).message).toContain(
      "O(n log n)",
    );
  });

  it("česká čísla: 1 bod / 3 body / 12 bodů", () => {
    expect(buildSteps(randomPoints(1, 1))[0].message).toMatch(
      /^1 bod v rovině/,
    );
    expect(buildSteps(randomPoints(3, 1))[0].message).toMatch(
      /^3 body v rovině/,
    );
    expect(buildSteps(randomPoints(12, 1))[0].message).toMatch(
      /^12 bodů v rovině/,
    );
    expect(last(buildSteps(randomPoints(1, 1))).message).toMatch(/1 vrchol,/);
  });

  it("nespadne na nesmyslném vstupu: prázdná množina, NaN, body mimo rovinu, příliš mnoho bodů, shodné souřadnice", () => {
    const empty = buildSteps([]);
    expect(empty.length).toBe(1);
    expect(empty[0].message).toMatch(/strom je prázdný/);
    expect(last(querySteps(empty[0].state, [0, 0, 100, 100])).message).toMatch(
      /^RangeQuery: v Q leží 0 bodů, navštíveno 0 z 0/,
    );

    const bad = buildSteps([
      { id: 0, x: NaN, y: 5 },
      { id: 1, x: 10, y: Infinity },
      { id: 2, x: -5, y: 50 },
      { id: 3, x: 50, y: 1e9 },
      { id: 4, x: 40.5, y: 60.25 },
      { id: 5, x: 0, y: 100 },
    ]);
    expect(last(bad).state.points.map((p) => p.id)).toEqual([4, 5]);
    expect(bad[0].message).toMatch(/vynechali \(4\)/);
    checkKdInvariants(last(bad).state, true);

    const many = buildSteps(
      Array.from({ length: 80 }, (_, i) => ({ id: i, x: i + 1, y: 99 - i })),
    );
    expect(last(many).state.points.length).toBe(MAX_N);
    expect(many[0].message).toMatch(/prvních 30/);

    // shodné souřadnice i duplicitní id: strom je pořád vyvážený a dotaz souhlasí s hrubou silou
    const r = rng(5);
    const ties = Array.from({ length: 25 }, () => ({
      id: 0,
      x: 10 * Math.floor(r() * 4),
      y: 10 * Math.floor(r() * 4),
    }));
    const st = built(ties);
    expect(new Set(st.points.map((p) => p.id)).size).toBe(25);
    checkKdInvariants(st, false);
    for (const q of [
      [0, 0, 10, 10],
      [10, 10, 10, 10],
      [20, 0, 30, 30],
      [0, 0, 100, 100],
      [5, 5, 9, 9],
    ] as Box[]) {
      const fin = last(querySteps(st, q)).state;
      expect(foundIds(fin)).toEqual(bruteIds(st, q));
    }
  });
});

/* ---------- RangeQuery ---------- */

describe("k-d strom – RangeQuery", () => {
  it("souhlasí s hrubou silou a každý vrchol skončí jako ohlášený, navštívený nebo odříznutý (60 náhodných vstupů)", () => {
    const r = rng(20261105);
    for (let t = 0; t < 60; t++) {
      const n = t < 30 ? t + 1 : 1 + Math.floor(r() * MAX_N);
      const tree = built(randomPoints(n, 1 + Math.floor(r() * 99999)));
      const [a, b, c, d] = [0, 0, 0, 0].map(() => Math.floor(r() * 101));
      // každý 10. dotaz je celá rovina, každý 7. degenerovaný (úsečka)
      const q: Box =
        t % 10 === 0
          ? [0, 0, 100, 100]
          : t % 7 === 0
            ? [Math.min(a, b), c, Math.max(a, b), c]
            : [Math.min(a, b), Math.min(c, d), Math.max(a, b), Math.max(c, d)];
      const steps = querySteps(tree, q);
      const fin = last(steps);
      const st = fin.state;
      expect(st.query).toEqual(q);
      const want = bruteIds(st, q);
      expect(foundIds(st)).toEqual(want);
      expect(st.vars["nalezeno"]).toBe(want.length);
      const visited = Number(st.vars["navštíveno vrcholů"]);
      expect(visited).toBeLessThanOrEqual(n);
      expect(fin.message).toContain(`navštíveno ${visited} z ${n} `);
      expect(fin.message).toMatch(
        new RegExp(`^RangeQuery: v Q leží ${want.length} (bod|body|bodů)[ ,]`),
      );
      for (const s of steps)
        expect(
          s.line === null || (s.line >= 0 && s.line < PC_QUERY.length),
        ).toBe(true);
      // rozklad vrcholů: navštívené (n-found / n-visited mimo ohlášené podstromy), ohlášené podstromy, odříznuté podstromy
      const cls = Object.keys(st.nodes).map((id) => st.marks[Number(id)]);
      expect(
        cls.every(
          (c) => c === "n-found" || c === "n-visited" || c === "n-pruned",
        ),
      ).toBe(true);
      for (const v of Object.values(st.nodes)) {
        if (st.marks[v.id] === "n-found") expect(inQ(v.pt, q)).toBe(true);
        // odříznutý podstrom je označený celý, včetně bodů v rovině, a žádný jeho bod v Q neleží
        if (st.marks[v.id] === "n-pruned") {
          expect(st.ptMarks[v.pt.id]).toBe("pt-pruned");
          expect(inQ(v.pt, q)).toBe(false);
          for (const u of subtree(st, v.id))
            expect(st.marks[u.id]).toBe("n-pruned");
        }
      }
      expect(st.region).toBeNull();
    }
  });

  it("celá rovina: kořen se ohlásí najednou (1 navštívený vrchol); dotaz mimo všechny body nic nenajde", () => {
    const tree = built(randomPoints(20, 3));
    const all = last(querySteps(tree, [0, 0, 100, 100]));
    expect(all.state.vars["navštíveno vrcholů"]).toBe(1);
    expect(all.state.vars["nalezeno"]).toBe(20);
    const none = last(querySteps(tree, [0, 0, 4, 4]));
    expect(none.state.vars["nalezeno"]).toBe(0);
    expect(none.message).toMatch(/^RangeQuery: v Q leží 0 bodů,/);
  });

  it("BUG kd-inverted-query-silently-accepted: obrácené meze se seřadí a dotaz dá stejný výsledek jako správně zadaný", () => {
    const tree = built(randomPoints(DEFAULT_N, DEFAULT_SEED));
    const ok = last(querySteps(tree, [20, 30, 70, 80]));
    for (const q of [
      [70, 30, 20, 80],
      [20, 80, 70, 30],
      [70, 80, 20, 30],
    ]) {
      const steps = querySteps(tree, q);
      const fin = last(steps);
      expect(fin.state.query).toEqual([20, 30, 70, 80]);
      expect(foundIds(fin.state)).toEqual(foundIds(ok.state));
      expect(fin.message).toBe(ok.message);
      expect(steps[0].message).toMatch(/\[20, 70\] × \[30, 80\]/);
      expect(steps[0].message).toMatch(/obráceně/);
    }
    expect(foundIds(ok.state).length).toBeGreaterThan(0);
    expect(querySteps(tree, [20, 30, 70, 80])[0].message).not.toMatch(
      /obráceně/,
    );
  });

  it("nečíselné meze dotaz odmítne srozumitelnou zprávou, obří a zlomkové meze fungují", () => {
    const tree = built(randomPoints(15, 9));
    for (const q of [[NaN, 0, 50, 50], [0, 0, Infinity, 50], [0, 0, 50], []]) {
      const steps = querySteps(tree, q);
      expect(steps.length).toBe(1);
      expect(steps[0].message).toMatch(/Neplatný dotaz/);
      expect(steps[0].state.query).toBeNull();
    }
    const huge = last(querySteps(tree, [-1e300, -1e300, 1e300, 1e300]));
    expect(huge.state.vars["nalezeno"]).toBe(15);
    const frac: Box = [10.5, 20.25, 77.75, 90.5];
    expect(foundIds(last(querySteps(tree, frac)).state)).toEqual(
      bruteIds(tree, frac),
    );
  });

  it("BUG kd-default-demo-shows-no-pruning: výchozí ukázka předvede ohlášení celého podstromu i odříznutí", () => {
    const tree = built(randomPoints(DEFAULT_N, DEFAULT_SEED));
    const steps = querySteps(tree, DEFAULT_QUERY);
    const lines = steps.map((s) => s.line);
    expect(lines).toContain(2); // oblast(v) ⊆ Q: ohlásíme celý podstrom
    expect(lines).toContain(3); // jednotlivě ohlášený bod
    expect(lines).toContain(6); // syn, jehož oblast Q neprotíná
    expect(Number(last(steps).state.vars["navštíveno vrcholů"])).toBeLessThan(
      DEFAULT_N,
    );
    expect(Number(last(steps).state.vars["nalezeno"])).toBeGreaterThan(1);
    // vstup do vrcholu zvýrazňuje hlavičku procedury, ne „Je-li v = ∅: konec.“ (prázdní synové se nenavštěvují)
    for (const s of steps)
      if (s.message.startsWith("Vrchol ")) expect(s.line).toBe(0);
    expect(lines).not.toContain(1);
  });
});

/* ---------- rozložení a vykreslení ---------- */

describe("k-d strom – rozložení a vykreslení", () => {
  it("BUG kd-build-layout-unstable: vrcholy stojí během Buildu od začátku na konečném místě", () => {
    for (const [n, seed] of [
      [DEFAULT_N, DEFAULT_SEED],
      [1, 4],
      [2, 5],
      [30, 6],
    ]) {
      const steps = buildSteps(randomPoints(n, seed));
      const xs = finalXs(last(steps).state);
      const fin = new Map(
        layoutKd(last(steps).state, xs).nodes.map((v) => [v.id, v]),
      );
      expect(fin.size).toBe(n);
      const rootX = new Set<number>();
      for (const s of steps) {
        const lay = layoutKd(s.state, xs);
        expect(lay.nodes.length).toBe(Object.keys(s.state.nodes).length);
        expect(lay.edges.length).toBe(Math.max(0, lay.nodes.length - 1));
        for (const v of lay.nodes) {
          expect(v.x).toBe(fin.get(v.id)!.x);
          expect(v.y).toBe(fin.get(v.id)!.y);
          expect(v.x >= 0 && v.x <= 1).toBe(true);
          if (v.y === 0) rootX.add(v.x);
        }
      }
      expect(rootX.size).toBe(1);
      // in-order pořadí = zleva doprava
      const st = last(steps).state;
      const check = (id: number | null) => {
        if (id === null) return;
        const v = st.nodes[id];
        if (v.left !== null) expect(xs[v.left]).toBeLessThan(xs[id]);
        if (v.right !== null) expect(xs[v.right]).toBeGreaterThan(xs[id]);
        check(v.left);
        check(v.right);
      };
      check(st.root);
    }
    expect(finalXs(built(randomPoints(1, 1)))).toEqual({ 1: 0.5 });
  });

  it("rovina se vykreslí bez NaN a bez záporných rozměrů v každém kroku (i pro obrácený a degenerovaný dotaz)", async () => {
    const { Plane } = await import("./KdTreeViews");
    const tree = built(randomPoints(DEFAULT_N, DEFAULT_SEED));
    const all = [
      ...buildSteps(randomPoints(2, 6)),
      ...querySteps(tree, [70, 30, 20, 80]),
      ...querySteps(tree, [50, 0, 50, 100]),
      ...querySteps(tree, [NaN, 0, 1, 1]),
    ];
    for (const s of all) {
      const html = renderToStaticMarkup(
        createElement(Plane, {
          st: s.state,
          preview: normalizeQuery([90, 90, 10, 10]),
        }),
      );
      expect(html).not.toMatch(/NaN|undefined/);
      expect(html).not.toMatch(/(width|height)="-/);
    }
    // dotaz Q se kreslí kladným obdélníkem, ve fázi Build je vidět jeho náhled
    const q = renderToStaticMarkup(
      createElement(Plane, {
        st: last(querySteps(tree, [70, 30, 20, 80])).state,
      }),
    );
    const m =
      /<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)" class="kd-query"/.exec(
        q,
      );
    expect(m).not.toBeNull();
    expect([Math.round(Number(m![1])), Math.round(Number(m![2]))]).toEqual([
      160, 160,
    ]);
    const b = renderToStaticMarkup(
      createElement(Plane, { st: tree, preview: [20, 30, 70, 80] }),
    );
    expect(b).toContain("kd-query-preview");
    expect(
      renderToStaticMarkup(createElement(Plane, { st: tree })),
    ).not.toContain("kd-query");
  });
});

describe("k-d strom – závěrečné kroky a adresa stránky", () => {
  it("Build i RangeQuery končí shrnujícím krokem bez řádku pseudokódu, dotaz vyjmenuje nalezené body", () => {
    const steps = buildSteps(randomPoints(DEFAULT_N, DEFAULT_SEED));
    const fin = last(steps);
    expect(fin.line).toBeNull();
    expect(fin.message).toMatch(
      /^Build: strom postaven – 12 vrcholů, hloubka 3 = ⌊log₂ 12⌋/,
    );
    const q = querySteps(fin.state, DEFAULT_QUERY);
    const qf = last(q);
    expect(qf.line).toBeNull();
    const hits = bruteIds(fin.state, DEFAULT_QUERY).map(
      (id) => fin.state.points[id],
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(qf.message).toMatch(
      new RegExp(`^RangeQuery: v Q leží ${hits.length} bod`),
    );
    for (const p of hits) expect(qf.message).toContain(`(${p.x}, ${p.y})`);
    // dlouhý výčet se zkrátí
    const all = querySteps(built(randomPoints(MAX_N, 3)), [0, 0, 100, 100]);
    expect(last(all).message).toMatch(
      /^RangeQuery: v Q leží 30 bodů \((\(\d+, \d+\), ){8}…\)/,
    );
  });

  it("parseIntParam / parseQueryParam / queryParam: platné parametry projdou, nesmysly vrátí null", () => {
    expect(parseIntParam("12", 1, MAX_N)).toBe(12);
    for (const bad of [null, "", "0", "31", "2.5", "1e1", "abc", "12x"])
      expect(parseIntParam(bad, 1, MAX_N)).toBeNull();
    // pořadí v adrese je jako pořadí polí: x od, x do, y od, y do
    expect(parseQueryParam("0,60,10,70")).toEqual([0, 10, 60, 70]);
    for (const bad of [
      null,
      "",
      "0,60,10",
      "0,60,10,70,5",
      "0,60,10,101",
      "0,x,10,70",
      "-1,60,10,70",
    ])
      expect(parseQueryParam(bad)).toBeNull();
    const qs: Box[] = [DEFAULT_QUERY, [90, 10, 20, 80], [0, 0, 100, 100]];
    for (const q of qs) expect(parseQueryParam(queryParam(q))).toEqual(q);
    expect(sameBox([1, 2, 3, 4], [1, 2, 3, 4])).toBe(true);
    expect(sameBox([1, 2, 3, 4], [1, 2, 4, 3])).toBe(false);
  });

  it("stránka se vykreslí z adresy (n, seed, q, pts): rovina má n bodů, dotaz Q z adresy je připravený, bez q stavba bez náhledu", async () => {
    const { KdTreePage } = await import("./KdTreePage");
    const page = (url: string) =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          { initialEntries: [url] },
          createElement(KdTreePage),
        ),
      );
    /** obdélník náhledu Q v px roviny (360 px, okraj 20, 3,2 px na jednotku, y nahoru) */
    const previewRect = (q: Box) =>
      `<rect x="${20 + q[0] * 3.2}" y="${340 - q[3] * 3.2}" width="${(q[2] - q[0]) * 3.2}" height="${(q[3] - q[1]) * 3.2}" class="kd-query kd-query-preview"></rect>`;
    const html = page("/geom/kdtree?n=5&seed=3&q=10,40,20,90");
    expect(html).not.toMatch(/NaN|undefined/);
    expect(html.split('class="kd-pt').length - 1).toBe(5);
    // vstup je v nabídce operací pod plátnem (ActionMenu), staré fieldsety zmizely
    expect(html).toContain('class="action-menu"');
    expect(html).not.toContain("op-group");
    for (const label of ["Vytvořit", "Build(P)", "RangeQuery(Q)"])
      expect(html).toContain(`>${label}</button>`);
    // odkaz s q= otevře připravený RangeQuery(Q) nad postaveným stromem (TREEHASH-12)
    expect(html).toContain(
      previewRect([10, 20, 40, 90]).replace(" kd-query-preview", ""),
    );
    expect(html).toContain("RangeQuery([10, 40] × [20, 90])");
    expect(html).toContain("odříznutý podstrom");
    // vlastní body z adresy (pts) mají přednost před n a seed
    const own = page("/geom/kdtree?n=5&seed=3&pts=10,20,30,40");
    expect(own.split('class="kd-pt').length - 1).toBe(2);
    // neplatné parametry → výchozí příklad
    const def = page("/geom/kdtree?n=99&seed=-4&q=1,2&pts=1,2,3");
    expect(def.split('class="kd-pt').length - 1).toBe(DEFAULT_N);
    // stavba: náhled Q se nekreslí, legenda je pro Build (TREEHASH-15)
    expect(def).not.toContain("kd-query-preview");
    expect(def).toContain("body aktuálního podproblému P");
  });
});
