/**
 * Hešování se separovanými řetězci a s otevřenou adresací (tables.ts).
 * Testy s „BUG:“ v názvu hlídají dříve nalezené chyby (audit, skupina Hešování).
 */
import { describe, expect, it } from "vitest";
import { rng, type Step } from "../../core/steps";
import { czNum, HASH_FNS } from "./hashfn";
import {
  chainOp,
  insertAll,
  LP_LINES,
  mkTable,
  multiplesOf,
  PC_CHAIN,
  PC_LP,
  probeOp,
  rehashTable,
  storedKeys,
  type HashOp,
  type HashState,
} from "./tables";

const BAD = [-5, -100, 1.5, 3.5, NaN, Infinity, -Infinity, 65536, 1e300];
const hashOf = (st: HashState) =>
  HASH_FNS.find((f) => f.id === st.fnId)!.make(st.m, st.seed);

/** Spustí operaci jako useStructure.run: kroky se vyrobí nad st, novým stavem je POSLEDNÍ vydaný krok. */
function run(
  st: HashState,
  probing: boolean,
  x: number,
  op: HashOp,
): { steps: Step<HashState>[]; state: HashState } {
  const steps = [...(probing ? probeOp : chainOp)(st, x, op)];
  expect(steps.length, "operace musí vydat aspoň jeden krok").toBeGreaterThan(
    0,
  );
  const pc = (probing ? PC_LP : PC_CHAIN)[op];
  for (const s of steps)
    expect(
      s.line === null || (s.line >= 0 && s.line < pc.length),
      `řádek ${s.line} mimo pseudokód ${op} („${s.message}“)`,
    ).toBe(true);
  const state = steps[steps.length - 1].state;
  // nic se nesmí změnit až po posledním yield (kromě zvýraznění by se to ztratilo)
  expect({ ...st, marks: 0, keyMark: 0 }).toEqual({
    ...state,
    marks: 0,
    keyMark: 0,
  });
  return { steps, state };
}

/** Řádek pseudokódu zvýrazněný u kroku, jehož hláška obsahuje daný text. */
function lineText(
  steps: Step<HashState>[],
  pc: string[],
  part: string,
): string {
  const s = steps.find((q) => q.message.includes(part));
  if (!s)
    throw new Error(
      `krok s hláškou „${part}“ nenalezen: ${steps.map((q) => q.message).join(" | ")}`,
    );
  return s.line === null
    ? "(žádný řádek)"
    : (pc[s.line] ?? `(řádek ${s.line} mimo pseudokód)`);
}

/** Invarianty otevřené adresace: bez duplicit, n sedí, každý klíč je dosažitelný sondováním z h(k). */
function probeProblems(st: HashState): string[] {
  const out: string[] = [];
  const h = hashOf(st);
  const keys = storedKeys(st, true);
  if (st.cells.length !== st.m) out.push(`cells.length ${st.cells.length} ≠ m`);
  if (new Set(keys).size !== keys.length) out.push("duplicitní klíč");
  if (keys.length !== st.n)
    out.push(`n = ${st.n}, ale klíčů je ${keys.length}`);
  for (const k of keys) {
    let i = h(k);
    let found = false;
    for (let s = 0; s < st.m; s++) {
      if (st.cells[i] === k) {
        found = true;
        break;
      }
      if (st.cells[i] === null) break;
      i = (i + 1) % st.m;
    }
    if (!found) out.push(`klíč ${k} není dosažitelný z h(k) = ${h(k)}`);
  }
  return out;
}

function chainProblems(st: HashState): string[] {
  const out: string[] = [];
  const h = hashOf(st);
  const keys = st.buckets.flat();
  if (st.buckets.length !== st.m) out.push("špatný počet přihrádek");
  if (new Set(keys).size !== keys.length) out.push("duplicitní klíč");
  if (keys.length !== st.n)
    out.push(`n = ${st.n}, ale klíčů je ${keys.length}`);
  st.buckets.forEach((chain, i) =>
    chain.forEach(
      (k) =>
        h(k) !== i && out.push(`klíč ${k} leží v přihrádce ${i}, h = ${h(k)}`),
    ),
  );
  return out;
}

describe("separované řetězce a lineární přidávání – náhodné operace proti množině", () => {
  for (const probing of [false, true])
    it(probing ? "otevřená adresace" : "řetězce", () => {
      for (const fnId of HASH_FNS.map((f) => f.id))
        for (const m of [4, 16])
          for (let seed = 1; seed <= 3; seed++) {
            const r = rng(seed * 131 + m + fnId.length);
            let st = mkTable(m, fnId, seed);
            const ref = new Set<number>();
            for (let t = 0; t < 40; t++) {
              const x = Math.floor(r() * 24) * (r() < 0.3 ? m : 1); // malé univerzum → duplicity, mazání, kolize
              const op = (["insert", "insert", "find", "delete"] as const)[
                Math.floor(r() * 4)
              ];
              const had = ref.has(x);
              const full = probing && storedKeys(st, true).length >= m;
              const { steps, state } = run(st, probing, x, op);
              st = state;
              const last = steps[steps.length - 1].message;
              if (op === "insert") {
                if (had)
                  expect(
                    steps.some((s) => s.message.includes("už v tabulce je")),
                    `Insert(${x}) duplicitní`,
                  ).toBe(true);
                else if (full) expect(last).toContain("Tabulka je plná");
                else ref.add(x);
              } else if (op === "delete") {
                if (had) ref.delete(x);
                else expect(last).toContain("v tabulce není");
              } else {
                expect(
                  steps.some((s) => s.message.startsWith("Nalezeno")),
                  `Find(${x})`,
                ).toBe(had);
                if (!had) expect(last).toContain("v tabulce není");
              }
              expect(
                probing ? probeProblems(st) : chainProblems(st),
                `${fnId} m=${m} seed=${seed} po ${op}(${x})`,
              ).toEqual([]);
              expect(storedKeys(st, probing).sort((a, b) => a - b)).toEqual(
                [...ref].sort((a, b) => a - b),
              );
              expect(st.vars["α = n/m"]).toBe(czNum(ref.size / m));
            }
          }
    });
});

describe("otevřená adresace – pseudokód a zvýrazněné řádky", () => {
  it("BUG: každá operace zvýrazňuje řádky VLASTNÍHO pseudokódu (scénář z auditu: m = 16, x mod m)", () => {
    let st = mkTable(16, "mod", 1);
    st = run(st, true, 16, "insert").state;
    st = run(st, true, 32, "insert").state;

    // Delete(32): posun přes cizí klíč nesmí zvýraznit „Buňku nesmíme vyprázdnit…“
    let r = run(st, true, 32, "delete");
    expect(lineText(r.steps, PC_LP.delete, "obsahuje 16 ≠ 32")).toContain(
      "i ← (i + 1) mod m",
    );
    expect(lineText(r.steps, PC_LP.delete, "Nalezeno v buňce 1")).toContain(
      "nahradíme ho náhrobkem",
    );
    expect(lineText(r.steps, PC_LP.delete, "vložíme náhrobek")).toContain(
      "náhrobkem",
    );
    st = r.state;
    expect(st.cells[1]).toBe("tomb");

    // Insert(48): náhrobek se zapamatuje (ne „buňka i ← x“), vloží se až po nalezení prázdné buňky
    r = run(st, true, 48, "insert");
    expect(lineText(r.steps, PC_LP.insert, "je náhrobek")).toContain(
      "náhrobek",
    );
    expect(lineText(r.steps, PC_LP.insert, "je prázdná")).toContain(
      "Dokud buňka i není prázdná",
    );
    expect(lineText(r.steps, PC_LP.insert, "Vložíme 48")).toContain(
      "Uložíme x",
    );
    st = r.state;
    expect(st.cells[1]).toBe(48);

    // Insert(16) znovu
    r = run(st, true, 16, "insert");
    expect(lineText(r.steps, PC_LP.insert, "už v tabulce je")).toContain(
      "x už v tabulce je",
    );

    // Delete(99) a Find(99): prázdná buňka → nenalezeno, poslední krok má zvýrazněný řádek
    r = run(st, true, 99, "delete");
    expect(lineText(r.steps, PC_LP.delete, "je prázdná")).toContain(
      "Dokud buňka i není prázdná",
    );
    expect(lineText(r.steps, PC_LP.delete, "99 v tabulce není")).toContain(
      "x v tabulce není",
    );
    r = run(st, true, 99, "find");
    expect(lineText(r.steps, PC_LP.find, "99 v tabulce není")).toContain(
      "Nenalezeno",
    );
    r = run(st, true, 48, "find");
    expect(lineText(r.steps, PC_LP.find, "obsahuje 16 ≠ 48")).toContain(
      "i ← (i + 1) mod m",
    );
    expect(lineText(r.steps, PC_LP.find, "Nalezeno v buňce 1")).toContain(
      "nalezeno",
    );
  });

  it("BUG: Find v plné tabulce končí řádkem „Nenalezeno“, Insert do plné tabulky řádkem „tabulka je plná“", () => {
    let st = mkTable(4, "mod", 1);
    for (const k of [0, 1, 2, 3]) st = run(st, true, k, "insert").state;
    let r = run(st, true, 7, "find");
    expect(
      lineText(r.steps, PC_LP.find, "prošli jsme celou tabulku"),
    ).toContain("Nenalezeno");
    expect(r.steps).toHaveLength(1 + 4 + 1);
    r = run(st, true, 7, "insert");
    expect(lineText(r.steps, PC_LP.insert, "Tabulka je plná")).toContain(
      "tabulka je plná",
    );
    expect(storedKeys(r.state, true)).toEqual([0, 1, 2, 3]);
  });

  it("BUG: vložení do náhrobku v tabulce bez prázdné buňky aktualizuje α = n/m", () => {
    let st = mkTable(4, "mod", 1);
    for (const k of [0, 1, 2, 3]) st = run(st, true, k, "insert").state;
    st = run(st, true, 2, "delete").state;
    expect(st.vars["α = n/m"]).toBe("0,75");
    const r = run(st, true, 9, "insert");
    expect(
      lineText(r.steps, PC_LP.insert, "vložíme do prvního náhrobku"),
    ).toContain("Uložíme x");
    expect(r.state.cells).toEqual([0, 1, 9, 3]);
    expect(r.state.n).toBe(4);
    expect(r.state.vars["α = n/m"]).toBe("1,00");
  });

  it("mapa řádků odpovídá textu pseudokódu všech tří operací", () => {
    for (const op of ["insert", "find", "delete"] as const) {
      const pc = PC_LP[op];
      const L = LP_LINES[op];
      for (const v of Object.values(L)) expect(v).toBeLessThan(pc.length);
      expect(pc[L.hash]).toContain("i ← h(x)");
      expect(pc[L.empty]).toContain("není prázdná");
      expect(pc[L.next]).toContain("i ← (i + 1) mod m");
    }
    expect(PC_LP.insert[LP_LINES.insert.tomb]).toContain("náhrobek");
    expect(PC_LP.insert[LP_LINES.insert.fail]).toContain("plná");
    expect(PC_LP.find[LP_LINES.find.fail]).toContain("Nenalezeno");
    expect(PC_LP.delete[LP_LINES.delete.place]).toContain("náhrobkem");
  });

  it("duplicitní klíč za náhrobkem se nevloží podruhé; nový klíč obsadí první náhrobek na cestě", () => {
    let st = mkTable(8, "mod", 1);
    for (const k of [8, 16, 24]) st = run(st, true, k, "insert").state; // buňky 0, 1, 2
    st = run(st, true, 8, "delete").state; // náhrobek v buňce 0
    let r = run(st, true, 24, "insert");
    expect(r.steps[r.steps.length - 1].message).toContain("už v tabulce je");
    expect(r.state.n).toBe(2);
    r = run(st, true, 32, "insert");
    expect(r.state.cells.slice(0, 4)).toEqual([32, 16, 24, null]);
  });
});

describe("řetězce – pseudokód", () => {
  it("řádky kroků odpovídají pseudokódu operace", () => {
    let st = mkTable(8, "mod", 1);
    let r = run(st, false, 8, "insert");
    expect(r.steps.map((s) => s.line)).toEqual([1, 3]);
    st = r.state;
    r = run(st, false, 16, "insert");
    expect(r.steps.map((s) => s.line)).toEqual([1, 2, 3]);
    st = r.state;
    r = run(st, false, 16, "find");
    expect(r.steps.map((s) => s.line)).toEqual([1, 2, 2, 2]);
    expect(r.steps[3].message).toBe("Nalezeno po 2 porovnáních.");
    expect(r.steps[3].state.keyMark?.cls).toBe("key-found");
    r = run(st, false, 8, "delete");
    expect(r.steps.map((s) => s.line)).toEqual([1, 2, 3, 3]);
    expect(r.state.buckets[0]).toEqual([16]);
  });
});

describe("neplatné klíče", () => {
  it("BUG: záporný, necelý nebo nekonečný klíč operaci neshodí a tabulku nezmění (dřív TypeError / „Tabulka je plná“)", () => {
    for (const probing of [false, true])
      for (const fnId of HASH_FNS.map((f) => f.id)) {
        let st = mkTable(8, fnId, 2);
        for (const k of [3, 11, 19]) st = run(st, probing, k, "insert").state;
        const before = structuredClone({
          buckets: st.buckets,
          cells: st.cells,
          n: st.n,
        });
        for (const x of BAD)
          for (const op of ["insert", "find", "delete"] as const) {
            const { steps, state } = run(st, probing, x, op);
            expect(steps, `${fnId} ${op}(${x})`).toHaveLength(1);
            expect(steps[0].message).toContain(
              "Klíč musí být celé číslo od 0 do 65535",
            );
            expect({
              buckets: state.buckets,
              cells: state.cells,
              n: state.n,
            }).toEqual(before);
            expect(Object.keys(state.cells).length).toBe(8);
            st = state;
          }
      }
  });
});

describe("hromadné vkládání", () => {
  it("násobky m: „x mod m“ je pošle do jedné přihrádky / jednoho shluku, tabulační funkce je rozprostře", () => {
    expect(multiplesOf(8)).toEqual([8, 16, 24, 32]);
    const run2 = (fnId: string, probing: boolean) => {
      const st = mkTable(8, fnId, 3);
      for (const s of insertAll(st, multiplesOf(8), probing)) void s;
      return st;
    };
    expect(run2("mod", false).buckets[0]).toEqual([8, 16, 24, 32]);
    expect(run2("mod", true).cells.slice(0, 4)).toEqual([8, 16, 24, 32]);
    const tab = run2("tab", false);
    expect(tab.n).toBe(4);
    expect(tab.buckets.filter((b) => b.length > 0).length).toBeGreaterThan(1);
  });
});

describe("přehešování (změna m, funkce nebo seedu)", () => {
  const filled = (probing: boolean, m: number, keys: number[]) => {
    const st = mkTable(m, "mod", 1);
    for (const s of insertAll(st, keys, probing)) void s;
    return st;
  };

  it("BUG: hláška po změně funkce popisuje NOVOU funkci", () => {
    const st = filled(false, 8, [1, 9, 17]);
    const r = rehashTable(st, false, 8, "linear", 1);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("((a·x + b) mod 65537) mod 8");
    expect(r.message).not.toContain("x mod 8");
    expect(r.state.fnId).toBe("linear");
    expect(chainProblems(r.state)).toEqual([]);
  });

  it("BUG: zmenšení otevřené adresace pod počet klíčů žádný klíč nezahodí – odmítne se", () => {
    const keys = [5, 21, 37, 53, 2, 18, 34, 7];
    const st = filled(true, 16, keys);
    const r = rehashTable(st, true, 4, "mod", 1);
    expect(r.ok).toBe(false);
    expect(r.state.m).toBe(16);
    expect(r.message).toContain("se 8 klíčů nevejde");
    expect(storedKeys(r.state, true).sort((a, b) => a - b)).toEqual(
      [...keys].sort((a, b) => a - b),
    );
    // do m = 8 se vejdou všechny (plná tabulka)
    const ok = rehashTable(st, true, 8, "mod", 1);
    expect(ok.ok).toBe(true);
    expect(storedKeys(ok.state, true).sort((a, b) => a - b)).toEqual(
      [...keys].sort((a, b) => a - b),
    );
    expect(probeProblems(ok.state)).toEqual([]);
  });

  it("přehešování zachová všechny klíče pro každou funkci a velikost; náhrobky zmizí", () => {
    const r = rng(5);
    const keys = [
      ...new Set(Array.from({ length: 14 }, () => Math.floor(r() * 1000))),
    ];
    for (const probing of [false, true]) {
      let st = filled(probing, 16, keys);
      if (probing) {
        for (const s of probeOp(st, keys[0], "delete")) void s;
        expect(st.cells).toContain("tomb");
      }
      const want = storedKeys(st, probing).sort((a, b) => a - b);
      for (const fnId of HASH_FNS.map((f) => f.id))
        for (const nm of [4, 16, 32]) {
          const res = rehashTable(st, probing, nm, fnId, 7);
          if (probing && nm < want.length) {
            expect(res.ok).toBe(false);
            continue;
          }
          expect(res.ok).toBe(true);
          expect(res.state.m).toBe(nm);
          expect(res.state.cells).not.toContain("tomb");
          expect(storedKeys(res.state, probing).sort((a, b) => a - b)).toEqual(
            want,
          );
          expect(
            probing ? probeProblems(res.state) : chainProblems(res.state),
            `${fnId} m=${nm}`,
          ).toEqual([]);
        }
      st = rehashTable(st, probing, 32, "tab", 9).state;
      expect(st.n).toBe(want.length);
    }
  });

  it("neplatná velikost tabulky se odmítne (žádné zacyklení ani pád)", () => {
    const st = filled(true, 8, [1, 2, 3]);
    for (const nm of [0, -4, 2.5, NaN]) {
      const r = rehashTable(st, true, nm, "mod", 1);
      expect(r.ok).toBe(false);
      expect(r.state.m).toBe(8);
    }
  });
});
