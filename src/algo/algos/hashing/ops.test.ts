/**
 * Závěrečné kroky operací („Insert(35): …“), tichá stavba z klíčů a hromadné operace se shrnutím
 * (tables.ts, cuckoo.ts, bloom.ts).
 */
import { describe, expect, it } from "vitest";
import { materialize, randomArray, rng, type Step } from "../../core/steps";
import {
  blBuild,
  blInsertAllOp,
  blOp,
  bloomBits,
  PC_BL_INSERT,
  PC_BL_QUERY,
  type BloomState,
} from "./bloom";
import {
  ckBuild,
  ckBulkOp,
  ckFill,
  ckForceCycle,
  ckOp,
  mkC,
  PC_CK_DELETE,
  PC_CK_FIND,
  PC_CK_INSERT,
  type CuckooState,
} from "./cuckoo";
import {
  buildTable,
  hashOp,
  insertAllOp,
  longestChain,
  longestRun,
  multiplesOf,
  PC_CHAIN,
  PC_LP,
  storedKeys,
  type HashOp,
  type HashState,
} from "./tables";

const last = <S>(steps: Step<S>[]) => steps[steps.length - 1];
const run = <S>(st: S, gen: (s: S) => Generator<Step<S>, void, unknown>) => {
  const s = structuredClone(st);
  const steps = materialize(gen(s));
  return { steps, end: s };
};

/** Každý krok má řádek v pseudokódu dané operace, nebo žádný. */
function linesInside<S>(steps: Step<S>[], pc: string[]) {
  for (const s of steps)
    expect(
      s.line === null || (s.line >= 0 && s.line < pc.length),
      `řádek ${s.line} („${s.message}“)`,
    ).toBe(true);
}

describe("hashOp – závěrečný krok", () => {
  const OPS: HashOp[] = ["insert", "find", "delete"];
  const NAME = { insert: "Insert", find: "Find", delete: "Delete" };

  it("každá operace končí krokem bez řádku „Op(x): …“ se stavem shodným s koncem operace", () => {
    const r = rng(11);
    for (const probing of [false, true]) {
      for (const fnId of ["mod", "linear", "tab"]) {
        let st = buildTable(16, fnId, 3, randomArray(6, 60, 5), probing).state;
        for (let i = 0; i < 25; i++) {
          const op = OPS[Math.floor(r() * 3)];
          const x = 1 + Math.floor(r() * 60);
          const { steps, end } = run(st, (s) => hashOp(s, x, op, probing));
          linesInside(steps, (probing ? PC_LP : PC_CHAIN)[op]);
          const fin = last(steps);
          expect(fin.line).toBeNull();
          expect(
            fin.message.startsWith(`${NAME[op]}(${x}): `),
            fin.message,
          ).toBe(true);
          expect(fin.state.n).toBe(end.n);
          expect(steps.length).toBeGreaterThanOrEqual(2);
          st = end;
        }
      }
    }
  });

  it("výsledek odpovídá množině klíčů (řetězení i otevřená adresace)", () => {
    for (const probing of [false, true]) {
      let st = buildTable(8, "mod", 1, [12, 20, 28, 7], probing).state;
      const ins = run(st, (s) => hashOp(s, 36, "insert", probing));
      expect(last(ins.steps).message).toMatch(
        probing
          ? /^Insert\(36\): uloženo do buňky \d+ po \d+ sond/
          : /^Insert\(36\): uloženo do přihrádky 4, její řetězec má teď délku 4/,
      );
      st = ins.end;
      expect(
        last(run(st, (s) => hashOp(s, 36, "insert", probing)).steps).message,
      ).toContain("už v tabulce je");
      expect(
        last(run(st, (s) => hashOp(s, 28, "find", probing)).steps).message,
      ).toMatch(/^Find\(28\): nalezeno/);
      expect(
        last(run(st, (s) => hashOp(s, 99, "find", probing)).steps).message,
      ).toContain("99 v tabulce není");
      const del = run(st, (s) => hashOp(s, 20, "delete", probing));
      expect(last(del.steps).message).toMatch(
        probing
          ? /^Delete\(20\): smazáno – v buňce 5 je teď náhrobek/
          : /^Delete\(20\): smazáno z přihrádky 4/,
      );
      expect(storedKeys(del.end, probing)).not.toContain(20);
      expect(
        last(run(del.end, (s) => hashOp(s, 20, "delete", probing)).steps)
          .message,
      ).toContain("nic se nezměnilo");
    }
  });

  it("řetězení: Find hlásí počet porovnání (Find(28) v řetězci 12 → 20 → 28 = 3)", () => {
    const st = buildTable(8, "mod", 1, [12, 20, 28], false).state;
    expect(
      last(run(st, (s) => hashOp(s, 28, "find", false)).steps).message,
    ).toBe("Find(28): nalezeno v přihrádce 4 po 3 porovnáních.");
    expect(
      last(run(st, (s) => hashOp(s, 12, "find", false)).steps).message,
    ).toBe("Find(12): nalezeno v přihrádce 4 po 1 porovnání.");
  });

  it("Insert do plné tabulky s otevřenou adresací končí chybovým krokem, neplatný klíč jediným chybovým krokem", () => {
    const st = buildTable(4, "mod", 1, [1, 2, 3, 4], true).state;
    const { steps, end } = run(st, (s) => hashOp(s, 9, "insert", true));
    expect(last(steps).error).toBe(true);
    expect(last(steps).message).toBe(
      "Insert(9): tabulka je plná – 9 se nevložil.",
    );
    expect(end.cells).toEqual(st.cells);
    for (const x of [-1, 1.5, 70000]) {
      const bad = run(st, (s) => hashOp(s, x, "find", true)).steps;
      expect(bad).toHaveLength(1);
      expect(bad[0].error).toBe(true);
    }
  });

  it("insertAllOp shrne, kolik klíčů přibylo, a nejdelší řetězec / shluk („Vložit násobky m“ pro x mod m)", () => {
    const chain = run(buildTable(8, "mod", 1, [], false).state, (s) =>
      insertAllOp(s, multiplesOf(8), false, "Insert násobků 8"),
    );
    expect(longestChain(chain.end)).toBe(4);
    expect(last(chain.steps).message).toBe(
      "Insert násobků 8: přibyly 4 klíče; n = 4, α = 0,50, nejdelší řetězec má délku 4.",
    );
    const dup = run(chain.end, (s) =>
      insertAllOp(s, [8, 3], false, "Insert ×2"),
    );
    expect(last(dup.steps).message).toContain("přibyl 1 klíč, 1 se nevložil");
    const probe = run(buildTable(16, "mod", 1, [], true).state, (s) =>
      insertAllOp(s, multiplesOf(16), true, "Insert násobků 16"),
    );
    expect(longestRun(probe.end)).toBe(8);
    expect(last(probe.steps).message).toContain(
      "nejdelší shluk obsazených buněk má 8",
    );
  });

  it("longestRun počítá shluk přes konec tabulky i náhrobky", () => {
    const st = buildTable(8, "mod", 1, [7, 15, 23, 3], true).state; // buňky 7, 0, 1 a 3
    expect(longestRun(st)).toBe(3);
    st.cells[2] = "tomb";
    expect(longestRun(st)).toBe(5);
    expect(longestRun(buildTable(4, "mod", 1, [0, 1, 2, 3], true).state)).toBe(
      4,
    );
    expect(longestRun(buildTable(4, "mod", 1, [], true).state)).toBe(0);
  });
});

describe("buildTable – tichá stavba", () => {
  it("stejné uložení jako postupné Insert (řetězení i otevřená adresace)", () => {
    for (const probing of [false, true]) {
      for (const fnId of ["mod", "linear", "mulshift", "tab"]) {
        const keys = [...new Set(randomArray(10, 500, 7 + fnId.length))];
        const built = buildTable(16, fnId, 9, keys, probing).state;
        let st: HashState = buildTable(16, fnId, 9, [], probing).state;
        for (const k of keys)
          st = run(st, (s) => hashOp(s, k, "insert", probing)).end;
        expect(probing ? built.cells : built.buckets).toEqual(
          probing ? st.cells : st.buckets,
        );
        expect(built.n).toBe(keys.length);
      }
    }
  });

  it("přeskočí opakované a neplatné klíče a u otevřené adresace i klíče nad kapacitu m", () => {
    const r = buildTable(4, "mod", 1, [1, 1, -3, 2, 3, 4, 5, 1.5], true);
    expect(r.used).toEqual([1, 2, 3, 4]);
    expect(r.skipped).toEqual([1, -3, 5, 1.5]);
    expect(r.state.n).toBe(4);
    expect(
      buildTable(4, "mod", 1, [1, 5, 9, 13, 17], false).state.buckets[1],
    ).toEqual([1, 5, 9, 13, 17]);
  });
});

describe("ckOp, ckBulkOp, ckBuild – kukaččí hešování", () => {
  it("Insert / Find / Delete končí shrnutím a řádky leží v pseudokódu", () => {
    const r = rng(5);
    const PC = { insert: PC_CK_INSERT, find: PC_CK_FIND, delete: PC_CK_DELETE };
    let st: CuckooState = ckBuild(16, 3, [57, 12, 33]).state;
    for (let i = 0; i < 40; i++) {
      const op = (["insert", "insert", "find", "delete"] as const)[
        Math.floor(r() * 4)
      ];
      const x = 1 + Math.floor(r() * 40);
      const had = st.cells.includes(x);
      const { steps, end } = run(st, (s) => ckOp(s, x, op));
      linesInside(steps, PC[op]);
      const fin = last(steps);
      expect(fin.line).toBeNull();
      expect(fin.message).toMatch(/^(Insert|Find|Delete)\(\d+\): /);
      if (op === "find")
        expect(fin.message.includes("nalezeno"), fin.message).toBe(had);
      if (op === "delete") expect(end.cells.includes(x)).toBe(false);
      if (op === "insert" && !fin.error)
        expect(end.cells.includes(x)).toBe(true);
      expect(fin.state.arrow).toBeNull();
      st = end;
    }
  });

  it("Insert rozliší volnou buňku, vyhazování a přehešování; plná tabulka je chybový krok", () => {
    const empty = run(mkC(16, 3), (s) => ckOp(s, 57, "insert"));
    expect(last(empty.steps).message).toMatch(
      /^Insert\(57\): uloženo do volné buňky \d+ bez vyhazování/,
    );
    const cyc = run(mkC(16, 3), (s) =>
      ckBulkOp(s, "Vynutit cyklus", ckForceCycle(s)),
    );
    expect(last(cyc.steps).message).toMatch(
      /^Vynutit cyklus: přibyly 3 klíče, přehešováno [1-9]\d*×; n = 3/,
    );
    const full = ckBuild(8, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).state;
    const x = [100, 101, 102, 103].find((k) => !full.cells.includes(k))!;
    const rej = run(full, (s) => ckOp(s, x, "insert"));
    if (full.n === full.m) {
      expect(last(rej.steps).error).toBe(true);
      expect(last(rej.steps).message).toContain("příliš plná");
    }
    expect(rej.end.n).toBeGreaterThanOrEqual(full.n);
  });

  it("Find hlásí, ve které buňce (f(x) nebo g(x)) klíč leží", () => {
    const st = ckBuild(16, 3, [57, 12, 33, 90, 41]).state;
    for (const k of [57, 12, 33, 90, 41]) {
      const msg = last(run(st, (s) => ckOp(s, k, "find")).steps).message;
      expect(msg).toMatch(
        new RegExp(
          `^Find\\(${k}\\): nalezeno v buňce ${st.cells.indexOf(k)} = [fg]\\(x\\)`,
        ),
      );
    }
  });

  it("ckBulkOp: „Doplnit na 60 %“ při splněném cíli nepřidá shrnutí navíc", () => {
    const st = ckBuild(16, 3, randomArray(10, 999, 4)).state;
    const { steps } = run(st, (s) =>
      ckBulkOp(s, "Doplnit na 60 %", ckFill(s, 9, 1)),
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].message).toContain("není co doplňovat");
    const fill = run(mkC(16, 3), (s) =>
      ckBulkOp(s, "Doplnit na 60 %", ckFill(s, 9, 1)),
    );
    expect(fill.end.n).toBe(9);
    expect(last(fill.steps).message).toMatch(
      /^Doplnit na 60 %: přibylo 9 klíčů, (bez přehešování|přehešováno \d+×); n = 9, α = 0,56\.$/,
    );
  });

  it("ckBuild vloží všechny klíče jako postupné Insert a nevložitelné vrátí ve skipped", () => {
    const r = ckBuild(16, 3, [57, 12, 57, -1, 33]);
    expect(r.used).toEqual([57, 12, 33]);
    expect(r.skipped).toEqual([57, -1]);
    expect(
      r.state.cells.filter((c) => c !== null).sort((a, b) => a! - b!),
    ).toEqual([12, 33, 57]);
    const over = ckBuild(
      8,
      3,
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(over.used.length + over.skipped.length).toBe(12);
    expect(over.state.n).toBe(over.used.length);
    expect(over.state.n).toBeLessThanOrEqual(8);
  });
});

describe("blOp, blBuild – Bloomův filtr", () => {
  const lookup = (st: BloomState, x: number) =>
    run(st, (s) => blOp(s, x, "lookup"));

  it("Lookup končí odpovědí ANO / NE a falešně pozitivní odpověď je tak označená", () => {
    const st = blBuild(32, 3, [17, 42, 99]).state;
    expect(last(lookup(st, 17).steps).message).toBe(
      "Lookup(17): ANO – 17 byl opravdu vložen.",
    );
    let fp = 0;
    let no = 0;
    for (let x = 0; x < 400; x++) {
      if (st.inserted.includes(x)) continue;
      const { steps } = lookup(st, x);
      linesInside(steps, PC_BL_QUERY);
      const msg = last(steps).message;
      const yes = bloomBits(st, x).every((p) => st.bits[p]);
      if (yes) {
        fp++;
        expect(msg).toContain("falešně pozitivní");
      } else {
        no++;
        expect(msg).toBe(`Lookup(${x}): NE – ${x} v množině určitě není.`);
      }
    }
    expect(no).toBeGreaterThan(0);
    expect(fp).toBeGreaterThan(0); // 9 jedniček z 32 při k = 3 → zhruba 2 % ze 400 klíčů
  });

  it("Lookup značí testovaný bit = 1 jako cell-hit (ne zelený cell-found nového bitu)", () => {
    const st = blBuild(32, 3, [17]).state;
    const marks = lookup(st, 17).steps.flatMap((s) =>
      Object.values(s.state.marks),
    );
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((c) => c === "cell-hit")).toBe(true);
  });

  it("Insert spočítá nové bity a filtr se shoduje s blBuild", () => {
    const st = blBuild(32, 3, []).state;
    const a = run(st, (s) => blOp(s, 17, "insert"));
    linesInside(a.steps, PC_BL_INSERT);
    const distinct = new Set(bloomBits(st, 17)).size;
    expect(last(a.steps).message).toMatch(
      new RegExp(`^Insert\\(17\\): nastaven[oy]? ${distinct} nov`),
    );
    expect(
      last(run(a.end, (s) => blOp(s, 17, "insert")).steps).message,
    ).toContain("žádný nový bit");
    expect(a.end.bits).toEqual(blBuild(32, 3, [17]).state.bits);
    const many = run(st, (s) => blInsertAllOp(s, [5, 6, 7], "Insert ×3"));
    expect(many.end.bits).toEqual(blBuild(32, 3, [5, 6, 7]).state.bits);
    expect(last(many.steps).message).toMatch(
      /^Insert ×3: n = 3, jedniček \d+ z 32, odhad P\(falešně pozitivní\) = \d+,\d %\.$/,
    );
  });

  it("blBuild přeskočí opakované a neplatné klíče", () => {
    const r = blBuild(16, 2, [3, 3, -1, 70000, 4]);
    expect(r.used).toEqual([3, 4]);
    expect(r.skipped).toEqual([3, -1, 70000]);
    expect(r.state.inserted).toEqual([3, 4]);
  });
});
