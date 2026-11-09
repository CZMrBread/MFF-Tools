/**
 * Kukaččí hešování (cuckoo.ts).
 * Testy s „BUG:“ v názvu hlídají dříve nalezené chyby (audit, skupina Hešování).
 */
import { describe, expect, it } from "vitest";
import { materialize, randomArray, rng, type Step } from "../../core/steps";
import { czNum } from "./hashfn";
import {
  ckDelete,
  ckFill,
  ckFind,
  ckForceCycle,
  ckInsert,
  ckInsertAll,
  cycleKeys,
  fns,
  MAX_REHASH,
  mkC,
  PC_CK_DELETE,
  PC_CK_FIND,
  PC_CK_INSERT,
  type CuckooState,
} from "./cuckoo";

/**
 * Spustí fn a spočítá snímky (snap → structuredClone). Po vyčerpání rozpočtu vyhodí chybu, takže se
 * případný nekonečný výpočet projeví selháním testu, ne zamrznutím test runneru.
 */
function withBudget<T>(
  budget: number,
  fn: () => T,
): { result?: T; error?: Error; clones: number } {
  const orig = globalThis.structuredClone;
  let clones = 0;
  globalThis.structuredClone = ((v: unknown) => {
    if (++clones > budget)
      throw new Error(`BUDGET: více než ${budget} snímků – výpočet nekončí`);
    return orig(v);
  }) as typeof structuredClone;
  try {
    return { result: fn(), clones };
  } catch (e) {
    return { error: e as Error, clones };
  } finally {
    globalThis.structuredClone = orig;
  }
}

/** Invariant kukaččí tabulky: každý uložený klíč leží v f(k) nebo g(k), žádné duplicity, n sedí. */
function problems(st: CuckooState, inHand = 0): string[] {
  const out: string[] = [];
  const [f, g] = fns(st);
  if (st.cells.length !== st.m)
    out.push(`cells.length ${st.cells.length} ≠ m ${st.m}`);
  const extra = Object.keys(st.cells).filter((k) => !/^\d+$/.test(k));
  if (extra.length)
    out.push(`pole cells má neindexové vlastnosti ${extra.join(",")}`);
  const seen = new Set<number>();
  let count = 0;
  st.cells.forEach((c, i) => {
    if (c === null) return;
    count++;
    if (typeof c !== "number") out.push(`buňka ${i} obsahuje ${String(c)}`);
    else {
      if (seen.has(c)) out.push(`klíč ${c} je v tabulce dvakrát`);
      seen.add(c);
      if (f(c) !== i && g(c) !== i)
        out.push(`klíč ${c} leží v buňce ${i}, ale f=${f(c)}, g=${g(c)}`);
    }
  });
  if (count + inHand !== st.n)
    out.push(
      `n = ${st.n}, ale v tabulce je ${count} klíčů (+${inHand} v ruce)`,
    );
  return out;
}

const stored = (st: CuckooState) =>
  st.cells.filter((c): c is number => c !== null).sort((a, b) => a - b);
const drain = (gen: Iterable<unknown>) => {
  for (const s of gen) void s;
};
const core = (st: CuckooState) => ({
  m: st.m,
  seed: st.seed,
  cells: st.cells,
  n: st.n,
});

/** Jako useStructure.run: novým stavem je POSLEDNÍ vydaný krok; nic se nesmí změnit až po něm. */
function run(
  st: CuckooState,
  gen: Iterable<Step<CuckooState>>,
  pc: string[],
): { steps: Step<CuckooState>[]; state: CuckooState } {
  const steps = [...gen];
  expect(steps.length).toBeGreaterThan(0);
  for (const s of steps)
    expect(
      s.line === null || (s.line >= 0 && s.line < pc.length),
      `řádek ${s.line} („${s.message}“)`,
    ).toBe(true);
  const state = steps[steps.length - 1].state;
  expect(core(st), "stav se změnil až po posledním kroku").toEqual(core(state));
  return { steps, state };
}

describe("kukaččí hešování – Insert", () => {
  it("do zaplnění m/2 drží invarianty v každém kroku a tabulka obsahuje přesně vložené klíče", () => {
    for (const m of [8, 16, 32])
      for (let seed = 1; seed <= 12; seed++) {
        const r = rng(seed * 977 + m);
        const st = mkC(m, 3);
        const ref = new Set<number>();
        for (let op = 0; op < 2 * m; op++) {
          const x = Math.floor(r() * 1000); // včetně 0 a duplicit
          if (!ref.has(x) && ref.size >= m / 2) continue;
          let visible = 0;
          const res = withBudget(5_000, () => {
            let last: CuckooState | null = null;
            for (const step of ckInsert(st, x)) {
              visible++;
              expect(
                step.line === null ||
                  (step.line >= 0 && step.line < PC_CK_INSERT.length),
                `řádek ${step.line}`,
              ).toBe(true);
              // během vyhazování a před přehešováním je jeden klíč „v ruce“
              const cnt = step.state.cells.filter((c) => c !== null).length;
              const p = problems(step.state, step.state.n - cnt === 1 ? 1 : 0);
              if (p.length)
                throw new Error(
                  `m=${m} seed=${seed} Insert(${x}), krok „${step.message}“: ${p.join("; ")}`,
                );
              last = step.state;
            }
            return last as CuckooState | null;
          });
          if (res.error) throw res.error;
          // žádné skryté snímky: přehešování nesmí volat snap()
          expect(
            res.clones,
            `Insert(${x}): snímků ${res.clones}, viditelných kroků ${visible}`,
          ).toBe(visible);
          ref.add(x);
          const fin = res.result!;
          expect(problems(fin), `m=${m} seed=${seed} po Insert(${x})`).toEqual(
            [],
          );
          expect(stored(fin)).toEqual([...ref].sort((a, b) => a - b));
          expect(core(st)).toEqual(core(fin));
        }
      }
  });

  it("opakované vložení téhož klíče tabulku nezmění", () => {
    const st = mkC(16, 3);
    drain(ckInsertAll(st, [5, 17, 33, 48]));
    const before = structuredClone(st.cells);
    for (const k of [5, 17, 33, 48]) {
      const steps = [...ckInsert(st, k)];
      expect(steps).toHaveLength(1);
      expect(steps[0].message).toContain("už v tabulce je");
      expect(Object.values(steps[0].state.marks)).toEqual(["cell-found"]);
    }
    expect(st.cells).toEqual(before);
    expect(st.n).toBe(4);
  });

  it("jedno naplnění na 60 % z prázdné tabulky skončí, uloží všechny klíče a zachová invarianty", () => {
    for (const m of [8, 16, 32])
      for (let s = 1; s <= 25; s++) {
        const keys = randomArray(Math.floor(m * 0.6), 999, s * 7717);
        const st = mkC(m, 3);
        const res = withBudget(20_000, () => drain(ckInsertAll(st, keys)));
        if (res.error) throw res.error;
        expect(problems(st), `m=${m} s=${s}`).toEqual([]);
        expect(stored(st)).toEqual([...new Set(keys)].sort((a, b) => a - b));
      }
  });

  it("BUG: vložení (m+1). různého klíče skončí odmítnutím, ne nekonečným přehešováváním", () => {
    for (const m of [8, 16, 32]) {
      const st = mkC(m, 3);
      const r = rng(99);
      const keys = new Set<number>();
      while (keys.size < m + 1) keys.add(1 + Math.floor(r() * 999));
      const rejected: string[] = [];
      const res = withBudget(20_000, () => {
        for (const k of keys) {
          const before = st.n;
          let last = "";
          for (const s of ckInsert(st, k)) last = s.message;
          if (st.n === before) rejected.push(last);
        }
      });
      expect(
        res.error?.message,
        `m=${m}: Insert ${m + 1}. klíče`,
      ).toBeUndefined();
      expect(problems(st), `m=${m}`).toEqual([]);
      expect(st.n).toBeLessThanOrEqual(m);
      for (const k of stored(st)) expect(keys.has(k)).toBe(true);
      // m + 1 různých klíčů se nevejde: aspoň jedno vložení muselo být odmítnuto, a to s vysvětlením
      expect(rejected.length).toBeGreaterThan(0);
      for (const msg of rejected) expect(msg).toMatch(/plná/);
    }
  });

  it("BUG: do zcela plné tabulky (n = m) se další klíč odmítne hned jedním krokem navíc", () => {
    // m = 8 zaplníme úplně klíči, které se vejdou: každý nový klíč, který projde, přidáme
    const st = mkC(8, 3);
    for (let k = 1; k < 3000 && st.n < 8; k++) drain(ckInsert(st, k));
    expect(st.n).toBe(8);
    const before = structuredClone(core(st));
    const { steps, state } = run(st, ckInsert(st, 60001), PC_CK_INSERT);
    expect(steps.map((s) => s.line)).toEqual([1, 8]);
    expect(steps[1].message).toContain("Tabulka je plná (n = m = 8)");
    expect(core(state)).toEqual(before);
  });

  it("BUG: dvě kliknutí na původní „Naplnit na 60 %“ (9 + 9 klíčů do 16 buněk) nezamrznou", () => {
    for (let s = 1; s <= 3; s++) {
      const st = mkC(16, 3);
      const keys = [
        ...randomArray(9, 999, s * 7717),
        ...randomArray(9, 999, s * 7717 + 12345),
      ];
      expect(new Set(keys).size).toBeGreaterThan(16);
      const res = withBudget(20_000, () => drain(ckInsertAll(st, keys)));
      expect(res.error?.message, `sada ${s}`).toBeUndefined();
      expect(problems(st), `sada ${s}`).toEqual([]);
      for (const k of stored(st)) expect(keys).toContain(k);
    }
  });

  it("BUG: cesta přes UI (klon stavu → materialize) – druhé naplnění skončí a nedělá skryté snímky", () => {
    const uiRun = (prev: CuckooState, keys: number[]) => {
      const start = structuredClone(prev);
      const out = materialize(ckInsertAll(start, keys));
      return {
        state: out.length ? out[out.length - 1].state : prev,
        visible: out.length,
      };
    };
    for (const m of [16, 32]) {
      const cnt = Math.floor(m * 0.6);
      const first = uiRun(mkC(m, 3), randomArray(cnt, 999, 1_700_000_000_001));
      let second: ReturnType<typeof uiRun> | undefined;
      const res = withBudget(
        20_000,
        () =>
          (second = uiRun(
            first.state,
            randomArray(cnt, 999, 1_700_000_004_321),
          )),
      );
      expect(res.error?.message, `m=${m}: druhé kliknutí`).toBeUndefined();
      expect(res.clones).toBe(second!.visible + 1); // + klon počátečního stavu
      expect(problems(second!.state)).toEqual([]);
    }
  });

  it("BUG: cena Insertu u téměř plné tabulky je malá (dřív desítky tisíc skrytých snímků)", () => {
    const r = rng(4242);
    const keys = new Set<number>();
    while (keys.size < 32) keys.add(1 + Math.floor(r() * 999));
    const st = mkC(32, 3);
    for (const k of keys) {
      let visible = 0;
      const res = withBudget(500, () => {
        visible = [...ckInsert(st, k)].length;
      });
      expect(res.error?.message).toBeUndefined();
      expect(res.clones).toBe(visible);
    }
    expect(problems(st)).toEqual([]);
  });

  it("BUG: když se nepodaří přehešovat, tabulka se vrátí do stavu před Insertem a hláška to řekne", () => {
    // plníme, dokud některé vložení neskončí neúspěšným přehešováním
    let failures = 0;
    for (let s = 1; s <= 6; s++) {
      const st = mkC(16, 3);
      const r = rng(s * 31);
      for (let t = 0; t < 60 && st.n < 16; t++) {
        const x = 1 + Math.floor(r() * 999);
        const before = structuredClone(core(st));
        const { steps, state } = run(st, ckInsert(st, x), PC_CK_INSERT);
        const last = steps[steps.length - 1];
        expect(problems(state), `sada ${s} Insert(${x})`).toEqual([]);
        if (last.message.includes(`Ani ${MAX_REHASH} pokusů`)) {
          failures++;
          expect(last.line).toBe(8);
          expect(core(state)).toEqual(before);
          expect(state.cells).not.toContain(x);
          expect(state.arrow).toBeNull();
          expect(state.vars["α = n/m"]).toBe(czNum(before.n / 16));
          expect(
            steps.some(
              (q) => q.line === 7 && q.message.includes("Vyčerpali jsme limit"),
            ),
          ).toBe(true);
        } else if (!last.message.includes("už v tabulce je")) {
          expect(stored(state)).toContain(x);
          expect(state.n).toBe(before.n + 1);
        }
      }
    }
    expect(
      failures,
      "aspoň jedno neúspěšné přehešování v testovaných sadách",
    ).toBeGreaterThan(0);
  });

  it("úspěšné přehešování změní funkce, zachová všechny klíče a zvýrazní vložený klíč", () => {
    const st = mkC(16, 3);
    const { steps, state } = run(st, ckForceCycle(st), PC_CK_INSERT);
    const done = steps.find((s) => s.message.startsWith("Přehešováno"))!;
    expect(done).toBeDefined();
    expect(done.line).toBe(7);
    expect(done.state.seed).not.toBe(3);
    expect(done.state.vars["nové f, g"]).toMatch(/^ano/);
    const x = done.state.vars.x as number;
    expect(done.state.marks[done.state.cells.indexOf(x)]).toBe("cell-new");
    expect(problems(state)).toEqual([]);
  });

  it("BUG: záporný, necelý nebo nekonečný klíč operace neshodí a tabulku nerozbije", () => {
    for (const x of [-5, -100, 3.5, 1.5, NaN, Infinity, 65536, 1e300]) {
      const st = mkC(16, 3);
      drain(ckInsertAll(st, [57, 10, 33]));
      const before = structuredClone(core(st));
      for (const [op, pc] of [
        [ckInsert, PC_CK_INSERT],
        [ckFind, PC_CK_FIND],
        [ckDelete, PC_CK_DELETE],
      ] as const) {
        const res = withBudget(100, () => run(st, op(st, x), pc));
        expect(res.error?.message, `${op.name}(${x})`).toBeUndefined();
        expect(res.result!.steps).toHaveLength(1);
        expect(res.result!.steps[0].message).toContain(
          "Klíč musí být celé číslo od 0 do 65535",
        );
        expect(core(st)).toEqual(before);
        expect(problems(st)).toEqual([]);
      }
    }
  });
});

describe("kukaččí hešování – Find a Delete", () => {
  const sample = () => {
    const st = mkC(16, 3);
    drain(ckInsertAll(st, [57, 10, 33, 48, 5]));
    return st;
  };

  it("BUG: Find zvýrazní nalezený klíč značkou cell-found už v posledním kroku", () => {
    const st = sample();
    for (const x of stored(st)) {
      const { steps } = run(st, ckFind(st, x), PC_CK_FIND);
      const last = steps[steps.length - 1];
      expect(last.message).toContain("nalezeno!");
      expect(last.state.marks[last.state.cells.indexOf(x)], `Find(${x})`).toBe(
        "cell-found",
      );
      expect(steps.length).toBeLessThanOrEqual(2);
      expect(last.line).toBe(steps.length); // 1 = f(x), 2 = g(x)
      expect(last.state.vars.x).toBe(x);
      expect(last.state.vars["α = n/m"]).toBe(czNum(5 / 16));
    }
  });

  it("Find nenalezeného klíče: 2 přístupy a závěr, žádná značka „nalezeno“", () => {
    const st = sample();
    const { steps } = run(st, ckFind(st, 999), PC_CK_FIND);
    expect(steps.map((s) => s.line)).toEqual([1, 2, 3]);
    expect(Object.values(steps[2].state.marks)).not.toContain("cell-found");
  });

  it("BUG: Delete má vlastní pseudokód, nastavuje proměnné pro mazaný klíč a přepočítá α", () => {
    const st = sample();
    drain(ckInsert(st, 10)); // předchozí operace s jiným klíčem
    const [f, g] = fns(st);
    for (const x of [57, 48]) {
      const nBefore = st.n;
      const { steps, state } = run(st, ckDelete(st, x), PC_CK_DELETE);
      for (const s of steps) {
        expect(s.state.vars.x, "proměnná x patří k mazanému klíči").toBe(x);
        expect(s.state.vars["f(x)"]).toBe(f(x));
        expect(s.state.vars["g(x)"]).toBe(g(x));
        expect(PC_CK_DELETE[s.line!]).toMatch(
          /^ {2}(Je-li|Jinak je-li) x v buňce [fg]\(x\)/,
        );
      }
      const hit = steps.find((s) => s.message.includes("nalezeno"))!;
      expect(PC_CK_DELETE[hit.line!]).toContain(
        hit.message.startsWith("f(") ? "f(x)" : "g(x)",
      );
      expect(Object.values(hit.state.marks)).toContain("cell-removed");
      expect(state.cells).not.toContain(x);
      expect(state.n).toBe(nBefore - 1);
      expect(state.vars["α = n/m"]).toBe(czNum((nBefore - 1) / 16));
      expect(state.marks).toEqual({});
      expect(problems(state)).toEqual([]);
    }
    const miss = run(st, ckDelete(st, 999), PC_CK_DELETE);
    expect(miss.steps.map((s) => s.line)).toEqual([1, 2, 3]);
    expect(miss.steps[2].message).toBe("999 v tabulce není.");
    expect(PC_CK_DELETE[0]).toBe("Delete(x):");
  });

  it("náhodné operace proti množině (Insert / Find / Delete)", () => {
    for (const m of [8, 16, 32])
      for (let seed = 1; seed <= 6; seed++) {
        const r = rng(seed * 53 + m);
        let st = mkC(m, 3);
        const ref = new Set<number>();
        for (let t = 0; t < 50; t++) {
          const x = Math.floor(r() * 40);
          const dice = r();
          if (dice < 0.5) {
            if (!ref.has(x) && ref.size >= m / 2) continue;
            st = run(st, ckInsert(st, x), PC_CK_INSERT).state;
            ref.add(x);
          } else if (dice < 0.75) {
            const res = run(st, ckDelete(st, x), PC_CK_DELETE);
            expect(
              res.steps.some((s) => s.message.includes("nalezeno")),
              `Delete(${x})`,
            ).toBe(ref.has(x));
            st = res.state;
            ref.delete(x);
          } else {
            const res = run(st, ckFind(st, x), PC_CK_FIND);
            expect(
              res.steps.some((s) => s.message.includes("nalezeno!")),
              `Find(${x})`,
            ).toBe(ref.has(x));
            st = res.state;
          }
          expect(problems(st), `m=${m} seed=${seed}`).toEqual([]);
          expect(stored(st)).toEqual([...ref].sort((a, b) => a - b));
        }
      }
  });
});

describe("kukaččí hešování – hromadná tlačítka", () => {
  it("BUG: „Vynutit cyklus“ opravdu vždy vyvolá vypršení limitu a přehešování", () => {
    for (const m of [8, 16, 32])
      for (let s = 0; s <= 4; s++) {
        const st = mkC(m, 3);
        // s = 0: prázdná tabulka; jinak pár náhodných klíčů a případně už změněné funkce po předchozím cyklu
        if (s > 0)
          drain(
            ckInsertAll(st, randomArray(Math.floor(m / 4), 999, s * 17 + m)),
          );
        if (s > 2) drain(ckForceCycle(st));
        const keys = cycleKeys(st);
        expect(keys).toHaveLength(3);
        const [f, g] = fns(st);
        const pair = (k: number) =>
          [f(k), g(k)].sort((a, b) => a - b).join("-");
        expect(
          new Set(keys.map(pair)).size,
          "tři klíče sdílejí stejnou dvojici buněk",
        ).toBe(1);
        for (const k of keys) expect(st.cells).not.toContain(k);

        const seedBefore = st.seed;
        const res = withBudget(2_000, () =>
          run(st, ckForceCycle(st), PC_CK_INSERT),
        );
        if (res.error) throw res.error;
        const { steps, state } = res.result!;
        expect(
          steps.some(
            (q) => q.line === 7 && q.message.includes("Vyčerpali jsme limit"),
          ),
          `m=${m} s=${s}: krok s vypršením limitu`,
        ).toBe(true);
        expect(
          steps.some((q) => q.message.startsWith("Přehešováno")),
          `m=${m} s=${s}: přehešováno`,
        ).toBe(true);
        expect(state.seed).not.toBe(seedBefore);
        expect(problems(state)).toEqual([]);
        for (const k of keys) expect(state.cells).toContain(k);
      }
  });

  it("BUG: „Doplnit na 60 %“ doplňuje jen do cílového počtu – opakované kliknutí už nic nepřidá", () => {
    for (const m of [8, 16, 32]) {
      const target = Math.floor(m * 0.6);
      for (let s = 1; s <= 8; s++) {
        const st = mkC(m, 3);
        if (s % 2 === 0) drain(ckInsertAll(st, randomArray(2, 999, s))); // částečně zaplněná tabulka
        const res = withBudget(5_000, () =>
          drain(ckFill(st, target, s * 1009)),
        );
        if (res.error) throw res.error;
        expect(st.n, `m=${m} s=${s}`).toBe(target);
        expect(problems(st)).toEqual([]);
        // druhé „kliknutí“: jediný krok s vysvětlením, tabulka beze změny
        const before = structuredClone(core(st));
        const again = [...ckFill(st, target, s * 1009 + 1)];
        expect(again).toHaveLength(1);
        expect(again[0].message).toContain("není co doplňovat");
        expect(core(st)).toEqual(before);
      }
    }
  });

  it("doplňování skončí i tehdy, když už další klíč vložit nejde (cíl = celá tabulka)", () => {
    for (const m of [8, 16]) {
      const st = mkC(m, 3);
      const res = withBudget(20_000, () => drain(ckFill(st, m, 77)));
      expect(res.error?.message).toBeUndefined();
      expect(st.n).toBeLessThanOrEqual(m);
      expect(problems(st)).toEqual([]);
      // nesmyslný cíl nic nerozbije
      for (const t of [NaN, -3, 1e9, Infinity]) drain(ckFill(st, t, 5));
      expect(problems(st)).toEqual([]);
    }
  });
});
