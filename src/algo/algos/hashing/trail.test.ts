/**
 * Stopa operace pod řadou buněk (E6): posloupnost sond otevřené adresace a cesta vyhazování kukačky.
 * Generátory ji ukládají do stavu (`trail`), takže každý krok přehrávání ukazuje stopu až po sebe.
 */
import { describe, expect, it } from "vitest";
import { materialize, type Step } from "../../core/steps";
import {
  ckBuild,
  ckBulkOp,
  ckInsertAll,
  ckOp,
  mkC,
  type CuckooState,
} from "./cuckoo";
import {
  buildTable,
  hashOp,
  insertAllOp,
  mkTable,
  type HashState,
} from "./tables";
import {
  cuckooTrailSteps,
  probeTrailSteps,
  TRAIL_GAP,
  trailBox,
} from "./trail";
import { CUCKOO_DEFAULT, PROBE_DEFAULT, trailRows } from "./ui";

const probe = () =>
  buildTable(
    PROBE_DEFAULT.m,
    PROBE_DEFAULT.fnId,
    PROBE_DEFAULT.seed,
    PROBE_DEFAULT.keys,
    true,
  ).state;
const last = <S>(steps: Step<S>[]) => steps[steps.length - 1].state;
const ops = (st: HashState, x: number, op: "insert" | "find" | "delete") =>
  materialize(hashOp(st, x, op, true));
const short = (st: HashState) =>
  st.trail.map(
    (t) => `${t.cell}:${t.kind}${t.key === undefined ? "" : `=${t.key}`}`,
  );

describe("otevřená adresace: stopa sond", () => {
  it("nová a postavená tabulka stopu nemá", () => {
    expect(mkTable(8, "mod", 1).trail).toEqual([]);
    expect(probe().trail).toEqual([]);
  });

  it("Insert(51): sondy 3–7 obsazené, v buňce 8 se klíč uloží; stopa roste krok po kroku", () => {
    const steps = ops(probe(), 51, "insert");
    expect(short(last(steps))).toEqual([
      "3:other=3",
      "4:other=19",
      "5:other=35",
      "6:other=20",
      "7:other=7",
      "8:placed=51",
    ]);
    // první krok (h(x)) stopu ještě nemá, pak přibývá po jedné sondě
    expect(steps[0].state.trail).toEqual([]);
    const lengths = steps.map((s) => s.state.trail.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(lengths).toContain(3);
  });

  it("Delete(19) a pak Find(35): mazaný klíč, náhrobek se přeskočí", () => {
    const st = probe();
    expect(short(last(ops(st, 19, "delete")))).toEqual([
      "3:other=3",
      "4:removed=19",
    ]);
    expect(short(last(ops(st, 35, "find")))).toEqual([
      "3:other=3",
      "4:tomb",
      "5:found=35",
    ]);
    // další operace začíná s prázdnou stopou
    expect(ops(st, 99, "find")[0].state.trail).toEqual([]);
  });

  it("Insert do náhrobku: poslední sonda je prázdná buňka, uloží se do prvního náhrobku", () => {
    const st = probe();
    ops(st, 19, "delete");
    expect(short(last(ops(st, 51, "insert")))).toEqual([
      "3:other=3",
      "4:tomb",
      "5:other=35",
      "6:other=20",
      "7:other=7",
      "8:empty",
      "4:placed=51",
    ]);
  });

  it("Find nenalezeného klíče končí prázdnou buňkou", () => {
    expect(short(last(ops(probe(), 99, "find")))).toEqual([
      "3:other=3",
      "4:other=19",
      "5:other=35",
      "6:other=20",
      "7:other=7",
      "8:empty",
    ]);
  });

  it("řetězení stopu nepoužívá", () => {
    const st = buildTable(8, "mod", 1, [12, 20], false).state;
    expect(last(materialize(hashOp(st, 28, "insert", false))).trail).toEqual(
      [],
    );
  });
});

describe("kukačka: stopa vyhazování", () => {
  const base = () =>
    ckBuild(CUCKOO_DEFAULT.m, CUCKOO_DEFAULT.seed, CUCKOO_DEFAULT.keys).state;
  const trailOf = (st: CuckooState) => st.trail;

  it("postavená tabulka stopu nemá", () => {
    expect(mkC(8, 1).trail).toEqual([]);
    expect(base().trail).toEqual([]);
  });

  it("Insert(20): 20 do buňky 14 vyhodí 90, každý další řádek stěhuje vyhozený klíč, poslední se usadí", () => {
    const st = base();
    const steps = materialize(ckOp(st, 20, "insert"));
    const tr = trailOf(last(steps));
    expect(tr.length).toBeGreaterThanOrEqual(2);
    expect(tr[0]).toEqual({ key: 20, cell: 14, evicted: 90 });
    for (let k = 1; k < tr.length; k++)
      expect(tr[k].key).toBe(tr[k - 1].evicted);
    const end = tr[tr.length - 1];
    expect(end.evicted).toBeNull();
    expect(st.cells[end.cell]).toBe(end.key);
    // kandidátní krok ještě bez stopy, pak roste
    expect(steps[0].state.trail).toEqual([]);
  });

  it("vložení do volné buňky: jediný řádek; Find a Delete stopu nemají", () => {
    const st = base();
    const tr = trailOf(last(materialize(ckOp(st, 58, "insert"))));
    expect(tr).toEqual([
      { key: 58, cell: st.cells.indexOf(58), evicted: null },
    ]);
    expect(trailOf(last(materialize(ckOp(st, 58, "find"))))).toEqual([]);
    expect(trailOf(last(materialize(ckOp(st, 58, "delete"))))).toEqual([]);
  });
});

describe("trailRows: řádky stopy podle místa na plátně", () => {
  it("bez známé výšky (telefon) všechny řádky po 24 px", () => {
    expect(trailRows(7, null)).toEqual({ rowH: 24, shown: 7 });
    expect(trailRows(0, null)).toEqual({ rowH: 24, shown: 0 });
  });

  it("řádky vyplní místo (16–32 px); když se nevejdou, ukáže se konec stopy", () => {
    expect(trailRows(4, 400)).toEqual({ rowH: 32, shown: 4 });
    expect(trailRows(10, 200)).toEqual({ rowH: 20, shown: 10 });
    expect(trailRows(16, 160)).toEqual({ rowH: 16, shown: 10 });
    expect(trailRows(3, 10)).toEqual({ rowH: 16, shown: 0 });
  });

  it("výška řádku podle kapacity (nejdelší možné stopy), ne podle délky – během operace se nemění", () => {
    // m = 16: nejvýš 17 řádků do 340 px → 20 px, ať je stopa dlouhá 2 nebo 12
    expect(trailRows(2, 340, 17)).toEqual({ rowH: 20, shown: 2 });
    expect(trailRows(12, 340, 17)).toEqual({ rowH: 20, shown: 12 });
    // delší stopa než kapacita: ukáže se konec
    expect(trailRows(30, 340, 17)).toEqual({ rowH: 20, shown: 17 });
  });
});

describe("trailBox: místo pro stopu je vyhrazené už před první operací", () => {
  it("bez rezervy jen výška řádků (beze změny)", () => {
    expect(trailBox(0, 400).height).toBe(0);
    expect(trailBox(3, 400).height).toBe(TRAIL_GAP + 3 * 32);
  });

  it("s rezervou na desktopu zabere celé zbylé místo plátna, i když je stopa prázdná", () => {
    expect(trailBox(0, 500, 17, true)).toEqual({
      rowH: 29, // (500 − mezera 6) / 17 řádků
      shown: 0,
      height: 500,
    });
    expect(trailBox(6, 500, 17, true).height).toBe(500);
    expect(trailBox(6, 500, 17, true).shown).toBe(6);
    // záporné místo (plátno je plné) → nic
    expect(trailBox(0, -20, 17, true).height).toBe(0);
  });

  it("na telefonu a v náhledu (výška neznámá) nic navíc – stopa až s operací, po 24 px", () => {
    expect(trailBox(0, null, 17, true).height).toBe(0);
    expect(trailBox(4, null, 17, true).height).toBe(TRAIL_GAP + 4 * 24);
  });
});

describe("řádky stopy: stav buňky podle sdílené kresby .viz-trail", () => {
  it("otevřená adresace: obsazeno bez třídy, náhrobek is-done s †, prázdno s ∅, uloženo is-ok", () => {
    const st = probe();
    ops(st, 19, "delete");
    const steps = probeTrailSteps(last(ops(st, 51, "insert")).trail);
    expect(steps.map((s) => [s.cell, s.label, s.state])).toEqual([
      [3, "1", ""],
      [4, "2 †", "is-done"],
      [5, "3", ""],
      [6, "4", ""],
      [7, "5", ""],
      [8, "6 ∅", ""],
      [4, "51", "is-ok"],
    ]);
  });

  it("nalezený klíč is-ok, mazaný is-fail", () => {
    const st = probe();
    expect(
      probeTrailSteps(last(ops(st, 35, "find")).trail).map((s) => s.state),
    ).toEqual(["", "", "is-ok"]);
    expect(
      probeTrailSteps(last(ops(st, 19, "delete")).trail).map((s) => s.state),
    ).toEqual(["", "is-fail"]);
  });

  it("kukačka: stěhovaný klíč bez třídy, usazený is-ok", () => {
    const st = ckBuild(
      CUCKOO_DEFAULT.m,
      CUCKOO_DEFAULT.seed,
      CUCKOO_DEFAULT.keys,
    ).state;
    const steps = cuckooTrailSteps(
      last(materialize(ckOp(st, 20, "insert"))).trail,
    );
    expect(steps[0]).toEqual({ cell: 14, label: "20", state: "" });
    expect(steps[steps.length - 1].state).toBe("is-ok");
  });
});

describe("hromadné operace končí souhrnem bez stopy", () => {
  it("otevřená adresace: Insert ×3 – stopa jen u jednotlivých vložení, ne v souhrnu", () => {
    const steps = materialize(
      insertAllOp(probe(), [51, 67, 83], true, "Insert ×3"),
    );
    expect(steps.some((s) => s.state.trail.length > 0)).toBe(true);
    expect(last(steps).trail).toEqual([]);
  });

  it("kukačka: Vložit náhodné – souhrn bez stopy", () => {
    const st = ckBuild(
      CUCKOO_DEFAULT.m,
      CUCKOO_DEFAULT.seed,
      CUCKOO_DEFAULT.keys,
    ).state;
    const steps = materialize(
      ckBulkOp(st, "Insert ×2", ckInsertAll(st, [20, 58])),
    );
    expect(steps.some((s) => s.state.trail.length > 0)).toBe(true);
    expect(last(steps).trail).toEqual([]);
  });
});
