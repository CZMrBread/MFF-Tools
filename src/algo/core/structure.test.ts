import { describe, expect, it, vi } from "vitest";
import { snap, type StepGen } from "./steps";
import {
  HISTORY_LIMIT,
  initStructure,
  resetTo,
  restoreInitial,
  runOp,
  undoOp,
} from "./structure";

interface S {
  v: number[];
}

const push = (x: number) =>
  function* (st: S): StepGen<S> {
    yield snap(st, 0, `vkládám ${x}`);
    st.v.push(x);
    yield snap(st, 1, `vloženo ${x}`);
  };

describe("runOp", () => {
  it("provede operaci nad kopií posledního stavu, zvýší opId a zapíše historii", () => {
    const s0 = initStructure<S>({ v: [1] });
    const s1 = runOp(s0, "Insert(5)", ["a", "b"], push(5));
    expect(s1.last.v).toEqual([1, 5]);
    expect(s0.last.v).toEqual([1]); // původní stav se nezměnil
    expect(s1.opId).toBe(1);
    expect(s1.opTitle).toBe("Insert(5)");
    expect(s1.pseudocode).toEqual(["a", "b"]);
    expect(s1.steps).toHaveLength(2);
    expect(s1.history.map((h) => h.title)).toEqual(["Insert(5)"]);
  });

  it("operace bez jediného kroku nezmění nic (ani pseudokód a titulek předchozí operace)", () => {
    const s1 = runOp(
      initStructure<S>({ v: [] }),
      "A",
      ["A1", "A2", "A3"],
      push(1),
    );
    const s2 = runOp(s1, "B", ["B1"], function* () {});
    expect(s2).toBe(s1);
  });

  it("výjimka v generátoru: struktura beze změny, jeden chybový krok s vysvětlením, žádná výjimka ven", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const s1 = runOp(initStructure<S>({ v: [1] }), "Insert(2)", [], push(2));
    const s2 = runOp(s1, "Insert(1.5)", ["x"], function* (st) {
      yield snap(st, 0, "začínám");
      throw new Error("klíč musí být celé číslo");
    });
    quiet.mockRestore();
    expect(s2.last).toBe(s1.last);
    expect(s2.opId).toBe(s1.opId); // neúspěch nespouští automatické přehrání
    expect(s2.history).toBe(s1.history);
    expect(s2.steps).toHaveLength(1);
    expect(s2.steps[0].error).toBe(true);
    expect(s2.steps[0].message).toMatch(
      /Insert\(1\.5\).*klíč musí být celé číslo.*beze změny/,
    );
  });

  it("operace jen s chybovými kroky (Pop z prázdného): zpráva se ukáže, struktura, opId ani historie se nemění", () => {
    const s1 = runOp(initStructure<S>({ v: [1] }), "Insert(2)", [], push(2));
    const s2 = runOp(s1, "Pop", ["p1"], function* (st) {
      // generátor stav změní, ale krok je chybový → změna se nesmí stát výchozím stavem
      st.v.length = 0;
      yield { ...snap(st, 0, "Zásobník je prázdný."), error: true };
    });
    expect(s2.steps).toHaveLength(1);
    expect(s2.steps[0].message).toBe("Zásobník je prázdný.");
    expect(s2.opTitle).toBe("Pop");
    expect(s2.pseudocode).toEqual(["p1"]);
    expect(s2.last).toBe(s1.last);
    expect(s2.opId).toBe(s1.opId);
    expect(s2.history).toBe(s1.history);
    // undo pak vrací předchozí skutečnou operaci, ne no-op
    expect(undoOp(s2).last.v).toEqual([1]);
  });

  it("operace s aspoň jedním nechybovým krokem se provede normálně", () => {
    const s1 = runOp(initStructure<S>({ v: [] }), "X", [], function* (st) {
      yield { ...snap(st, 0, "varování"), error: true };
      st.v.push(1);
      yield snap(st, 1, "hotovo");
    });
    expect(s1.opId).toBe(1);
    expect(s1.last.v).toEqual([1]);
    expect(s1.history).toHaveLength(1);
  });

  it("operace oříznutá limitem kroků se nestane výchozím stavem další operace", () => {
    const s0 = initStructure<{ n: number }>({ n: 0 });
    const s1 = runOp(
      s0,
      "Loop",
      [],
      function* (st) {
        for (;;) {
          st.n++;
          yield snap(st, null, "x");
        }
      },
      100,
    );
    expect(s1.last.n).toBe(0);
    expect(s1.steps).toHaveLength(1);
    expect(s1.steps[0].error).toBe(true);
    expect(s1.steps[0].message).toMatch(/limit 100 kroků/);
    expect(s1.opId).toBe(0);
  });
});

describe("historie, undo a výchozí příklad", () => {
  it("undo vrací operace jednu po druhé, i „Vyprázdnit“ (reset)", () => {
    let st = initStructure<S>({ v: [1] });
    st = runOp(st, "Insert(2)", [], push(2));
    st = runOp(st, "Insert(3)", [], push(3));
    st = resetTo(st, { v: [] }, "Struktura vyprázdněna.", "Vyprázdnit");
    expect(st.last.v).toEqual([]);
    expect(st.history.map((h) => h.title)).toEqual([
      "Insert(2)",
      "Insert(3)",
      "Vyprázdnit",
    ]);

    st = undoOp(st);
    expect(st.last.v).toEqual([1, 2, 3]);
    expect(st.steps[0].message).toMatch(/Vráceno: Vyprázdnit/);
    st = undoOp(st);
    expect(st.last.v).toEqual([1, 2]);
    st = undoOp(st);
    expect(st.last.v).toEqual([1]);
    expect(st.history).toEqual([]);
    expect(undoOp(st)).toBe(st);
  });

  it("undo nemění opId a zahodí pseudokód", () => {
    const s1 = runOp(initStructure<S>({ v: [] }), "Insert(1)", ["a"], push(1));
    const s2 = undoOp(s1);
    expect(s2.opId).toBe(s1.opId);
    expect(s2.pseudocode).toEqual([]);
    expect(s2.opTitle).toBe("");
  });

  it("restoreInitial vrátí stav z otevření stránky a jde také vrátit", () => {
    let st = initStructure<S>({ v: [4, 2] }, "Výchozí zpráva");
    st = runOp(st, "Insert(7)", [], push(7));
    st = restoreInitial(st);
    expect(st.last.v).toEqual([4, 2]);
    expect(st.steps[0].message).toBe("Výchozí zpráva");
    st = undoOp(st);
    expect(st.last.v).toEqual([4, 2, 7]);
  });

  it("počáteční stav je kopie – pozdější operace ho nezmění", () => {
    const initial = { v: [1] };
    let st = initStructure<S>(initial);
    st = runOp(st, "Insert(2)", [], push(2));
    expect(initial.v).toEqual([1]);
    expect(restoreInitial(st).last.v).toEqual([1]);
  });

  it("historie má nejvýše HISTORY_LIMIT položek", () => {
    let st = initStructure<S>({ v: [] });
    for (let i = 0; i < HISTORY_LIMIT + 5; i++)
      st = runOp(st, `Insert(${i})`, [], push(i));
    expect(st.history).toHaveLength(HISTORY_LIMIT);
    expect(st.history[0].title).toBe("Insert(5)");
  });
});

describe("version – každá změna struktury (i přestavba a vrácení)", () => {
  it("roste s operací, resetem i vrácením; neúspěšná operace ho nemění", () => {
    const s0 = initStructure<S>({ v: [] });
    expect(s0.version).toBe(0);
    const s1 = runOp(s0, "Insert(1)", ["a"], push(1));
    expect(s1.version).toBe(1);
    const s2 = resetTo(s1, { v: [1, 2, 3] }, "Seřazeně", "Seřazeně");
    expect(s2.opId).toBe(1); // přestavba nemění opId (nic se samo nepřehrává)…
    expect(s2.version).toBe(2); // …ale je to nový stav na plátně
    const s3 = undoOp(s2);
    expect(s3.version).toBe(3);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const s4 = runOp(s3, "Chyba", ["a"], function* (st) {
      yield snap(st, 0, "začínám");
      throw new Error("x");
    });
    quiet.mockRestore();
    expect(s4.version).toBe(3);
  });
});
