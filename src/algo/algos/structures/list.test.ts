/**
 * Zásobník, fronta, spojový seznam – regresní testy generátorů kroků.
 * Testy „BUG:“ jsou převzaté z auditu (src/_audit/structures*.test.ts) a hlídají opravené chyby.
 */
import { describe, expect, it } from "vitest";
import { rng, type StepGen } from "../../core/steps";
import {
  DEQ,
  ENQ,
  L_DELETE,
  L_FIND,
  L_INSERT_AFTER,
  L_INSERT_HEAD,
  POP,
  PUSH,
  dequeue,
  enqueue,
  listDelete,
  listFind,
  listInsertAfter,
  listInsertFirst,
  makeList,
  stackPop,
  stackPush,
  type ListKind,
  type ListState,
} from "./list";
import { badLines, runOp, type OpResult } from "./testutil";

type Op = (st: ListState) => StepGen<ListState>;
const labels = (st: ListState) => st.boxes.map((b) => Number(b.label));
const hasP = (st: ListState) => st.pointers.some((q) => q.label === "p");

/** malá „stránka“: drží trvalý stav a řetězí operace jako useStructure */
function page(kind: ListKind, values = [5, 12, 8]) {
  let st = makeList(kind, values);
  return {
    get st() {
      return st;
    },
    run(op: Op): OpResult<ListState> {
      const r = runOp(st, op);
      st = r.last;
      return r;
    },
  };
}

describe("seznam – úklid přechodného stavu mezi operacemi (list-cleanup-after-last-yield-lost)", () => {
  const insertFirstShowsNoLeftovers = (
    p: ReturnType<typeof page>,
    x: number,
  ) => {
    const { steps } = p.run((st) => listInsertFirst(st, x));
    for (const s of steps) {
      expect(
        hasP(s.state),
        `krok „${s.message}“ ukazuje starý ukazatel p`,
      ).toBe(false);
      expect(
        [undefined, x],
        `krok „${s.message}“ ukazuje x = ${s.state.vars.x}`,
      ).toContain(s.state.vars.x);
    }
  };

  it("BUG: InsertFirst(1) po neúspěšném Find(99) neukazuje „x = 99“ ani starý ukazatel p na ∅", () => {
    const p = page("list");
    p.run((st) => listFind(st, 99));
    insertFirstShowsNoLeftovers(p, 1);
  });

  it("BUG: InsertFirst(1) po úspěšném Find(12) neukazuje „x = 12“ ani starý ukazatel p", () => {
    const p = page("list");
    p.run((st) => listFind(st, 12));
    insertFirstShowsNoLeftovers(p, 1);
  });

  it("BUG: InsertFirst(1) po Delete(8) (nalezeno) neukazuje „x = 8“", () => {
    const p = page("list");
    p.run((st) => listDelete(st, 8));
    insertFirstShowsNoLeftovers(p, 1);
  });

  it("BUG: InsertFirst(1) po Delete(77) (nenalezeno) neukazuje „x = 77“ ani starý ukazatel p", () => {
    const p = page("list");
    p.run((st) => listDelete(st, 77));
    insertFirstShowsNoLeftovers(p, 1);
  });

  it("BUG: InsertAfter s neplatným k po Find(99) neukazuje u chybové hlášky „x = 99“ ani ukazatel p", () => {
    const p = page("list");
    p.run((st) => listFind(st, 99));
    const { steps } = p.run((st) => listInsertAfter(st, 50, 1));
    expect(steps).toHaveLength(1);
    for (const s of steps) {
      expect(hasP(s.state)).toBe(false);
      expect([undefined, 1]).toContain(s.state.vars.x);
    }
  });

  it("BUG: zbytkové „x = 99“ po Find(99) není trvalé – neukáže ho žádný z dalších InsertFirst", () => {
    const p = page("list");
    p.run((st) => listFind(st, 99));
    for (let rep = 0; rep < 3; rep++) {
      const { steps } = p.run((st) => listInsertFirst(st, 1));
      for (const s of steps)
        expect(
          [undefined, 1],
          `InsertFirst č. ${rep + 1}, krok „${s.message}“`,
        ).toContain(s.state.vars.x);
    }
  });

  it("po Find / Delete začíná KAŽDÁ další operace bez zvýraznění, bez p a bez cizích proměnných", () => {
    const leftovers: Op[] = [
      (st) => listFind(st, 12),
      (st) => listFind(st, 99),
      (st) => listDelete(st, 77),
      (st) => listDelete(st, 8),
    ];
    const next: [string, Op, number][] = [
      ["InsertFirst", (st) => listInsertFirst(st, 1), 1],
      ["InsertAfter", (st) => listInsertAfter(st, 1, 1), 1],
      ["InsertAfter (neplatné k)", (st) => listInsertAfter(st, 99, 1), 1],
      ["Find", (st) => listFind(st, 1), 1],
      ["Delete", (st) => listDelete(st, 5), 5],
      ["Delete (není)", (st) => listDelete(st, 1), 1],
    ];
    for (const before of leftovers) {
      for (const [name, op, x] of next) {
        const p = page("list");
        p.run(before);
        const { steps } = p.run(op);
        for (const s of steps)
          expect([undefined, x], `${name}: krok „${s.message}“`).toContain(
            s.state.vars.x,
          );
        // zvýraznění z minulé operace (box-found) se nepřenáší
        expect(
          steps[0].state.boxes.some((b) => b.cls === "box-found"),
          name,
        ).toBe(false);
      }
    }
  });

  it("výsledek Find zůstává v posledním kroku vidět (p na nalezeném prvku, resp. p = ∅)", () => {
    const p = page("list");
    const hit = p.run((st) => listFind(st, 12));
    expect(hit.last.pointers).toContainEqual({
      at: 1,
      label: "p",
      cls: "ptr-p",
    });
    expect(hit.last.boxes[1].cls).toBe("box-found");
    expect(hit.steps.at(-1)!.message).toBe(
      "Find(12): nalezeno na pozici 2 po 2 porovnáních – vracíme p.",
    );
    const miss = p.run((st) => listFind(st, 99));
    expect(miss.last.pointers).toContainEqual({
      at: -1,
      label: "p",
      cls: "ptr-p",
    });
    expect(miss.last.boxes.every((b) => !b.cls)).toBe(true);
    expect(miss.steps.at(-1)!.message).toBe(
      "Find(99): 99 v seznamu není – porovnali jsme ho se všemi 3 prvky a p došel na ∅.",
    );
  });
});

describe("seznam – InsertAfter(k, x) a neplatná pozice (list-insertafter-fractional-k)", () => {
  it("BUG: neceločíselné k (1.5) se odmítne – nic se nevloží před uzel p", () => {
    const p = page("list"); // 5 → 12 → 8
    const { steps, last } = p.run((st) => listInsertAfter(st, 1.5, 7));
    expect(labels(last)).toEqual([5, 12, 8]);
    expect(steps).toHaveLength(1);
    expect(steps[0].line).toBeNull();
    expect(steps[0].message).toBe("Pozice k musí být celé číslo od 1 do 3.");
  });

  it("BUG: ukazatel p nikdy nemíří na právě vkládaný prvek; nový prvek je hned za p", () => {
    for (const k of [1, 2, 3]) {
      const p = page("list");
      const { steps, last } = p.run((st) => listInsertAfter(st, k, 7));
      let pAt = -1;
      for (const s of steps) {
        const ptr = s.state.pointers.find((q) => q.label === "p");
        if (!ptr) continue;
        pAt = Math.max(pAt, ptr.at);
        expect(s.state.boxes[ptr.at].cls, `krok „${s.message}“`).not.toBe(
          "box-new",
        );
      }
      expect(pAt).toBe(k - 1);
      expect(labels(last).indexOf(7)).toBe(pAt + 1);
      expect(badLines(steps, L_INSERT_AFTER)).toEqual([]);
    }
  });

  it("k mimo rozsah, záporné, NaN, nekonečné i obří: jediný krok s hláškou, seznam beze změny", () => {
    for (const k of [0, -1, 4, 1e9, 2.000001, NaN, Infinity, -Infinity]) {
      const p = page("list");
      const { steps, last } = p.run((st) => listInsertAfter(st, k, 7));
      expect(steps, `k = ${k}`).toHaveLength(1);
      expect(labels(last)).toEqual([5, 12, 8]);
      expect(last.vars).toEqual({});
      expect(last.pointers).toEqual([{ at: 0, label: "hlava" }]);
    }
    expect(
      page("list").run((st) => listInsertAfter(st, 4, 7)).steps[0].message,
    ).toBe("Pozice 4 neexistuje – seznam má 3 prvky, k musí být od 1 do 3.");
    expect(
      page("list", []).run((st) => listInsertAfter(st, 1, 7)).steps[0].message,
    ).toContain("Seznam je prázdný");
  });
});

describe("zásobník, fronta, seznam – neplatné x", () => {
  it("NaN a nekonečno se odmítnou jediným krokem a strukturu nezmění (žádný prvek „NaN“)", () => {
    const cases: [ListKind, string, (x: number) => Op][] = [
      ["stack", "Push", (x) => (st) => stackPush(st, x)],
      ["queue", "Enqueue", (x) => (st) => enqueue(st, x)],
      ["list", "InsertFirst", (x) => (st) => listInsertFirst(st, x)],
      ["list", "InsertAfter", (x) => (st) => listInsertAfter(st, 1, x)],
      ["list", "Find", (x) => (st) => listFind(st, x)],
      ["list", "Delete", (x) => (st) => listDelete(st, x)],
    ];
    for (const [kind, name, op] of cases) {
      for (const x of [NaN, Infinity, -Infinity]) {
        const p = page(kind);
        const { steps, last } = p.run(op(x));
        expect(steps, `${name}(${x})`).toHaveLength(1);
        expect(steps[0].message).toBe(
          `Hodnota x není číslo – ${name} nelze provést.`,
        );
        expect(labels(last)).toEqual([5, 12, 8]);
      }
    }
  });

  it("záporné, desetinné a obří hodnoty jsou běžné prvky", () => {
    const p = page("list", []);
    for (const x of [-5, 2.5, 1e15, 0]) p.run((st) => listInsertFirst(st, x));
    expect(labels(p.st)).toEqual([0, 1e15, 2.5, -5]);
    expect(p.run((st) => listFind(st, 2.5)).steps.at(-1)!.message).toBe(
      "Find(2.5): nalezeno na pozici 3 po 3 porovnáních – vracíme p.",
    );
    p.run((st) => listDelete(st, -5));
    expect(labels(p.st)).toEqual([0, 1e15, 2.5]);
  });
});

describe("zásobník, fronta, seznam – invarianty", () => {
  it("zásobník: náhodné posloupnosti Push/Pop jsou LIFO", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = rng(seed * 31);
      const p = page("stack");
      const ref = [5, 12, 8];
      for (let op = 0; op < 15; op++) {
        if (r() < 0.45) {
          const x = Math.floor(r() * 20) - 5;
          const { steps } = p.run((st) => stackPush(st, x));
          ref.push(x);
          expect(badLines(steps, PUSH)).toEqual([]);
        } else {
          const { steps } = p.run((st) => stackPop(st));
          const msg = steps.at(-1)!.message;
          if (!ref.length)
            expect(msg).toBe(
              "Pop: zásobník je prázdný – není co odebrat, ohlásíme chybu.",
            );
          else expect(msg.startsWith(`Pop: vrací ${ref.pop()} – `)).toBe(true);
          expect(badLines(steps, POP)).toEqual([]);
        }
        expect(labels(p.st), `seed ${seed} op ${op}`).toEqual(ref);
        expect(p.st.pointers).toEqual(
          ref.length ? [{ at: ref.length - 1, label: "vrchol" }] : [],
        );
        expect(p.st.boxes.every((b) => !b.cls)).toBe(true);
        expect(new Set(p.st.boxes.map((b) => b.id)).size).toBe(
          p.st.boxes.length,
        );
      }
    }
  });

  it("fronta: náhodné posloupnosti Enqueue/Dequeue jsou FIFO", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = rng(seed * 37);
      const p = page("queue");
      const ref = [5, 12, 8];
      for (let op = 0; op < 15; op++) {
        if (r() < 0.45) {
          const x = Math.floor(r() * 20) - 5;
          const { steps } = p.run((st) => enqueue(st, x));
          ref.push(x);
          expect(badLines(steps, ENQ)).toEqual([]);
        } else {
          const { steps } = p.run((st) => dequeue(st));
          const msg = steps.at(-1)!.message;
          if (!ref.length)
            expect(msg).toBe(
              "Dequeue: fronta je prázdná – není co odebrat, ohlásíme chybu.",
            );
          else
            expect(msg.startsWith(`Dequeue: vrací ${ref.shift()} – `)).toBe(
              true,
            );
          expect(badLines(steps, DEQ)).toEqual([]);
        }
        expect(labels(p.st), `seed ${seed} op ${op}`).toEqual(ref);
        expect(p.st.pointers).toEqual(
          ref.length
            ? [
                { at: 0, label: "začátek" },
                { at: ref.length - 1, label: "konec" },
              ]
            : [],
        );
        expect(p.st.boxes.every((b) => !b.cls)).toBe(true);
      }
    }
  });

  it("seznam: náhodné posloupnosti – obsah a výsledek Find proti referenčnímu poli, řádky pseudokódu existují", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed * 41);
      const p = page("list");
      const ref = [5, 12, 8];
      for (let op = 0; op < 14; op++) {
        const d = r();
        const x = Math.floor(r() * 9); // malý rozsah → duplicity a zásahy
        let res: OpResult<ListState>;
        let code: string[];
        if (d < 0.25) {
          res = p.run((st) => listInsertFirst(st, x));
          code = L_INSERT_HEAD;
          ref.unshift(x);
        } else if (d < 0.5) {
          const k = Math.floor(r() * (ref.length + 3)) - 1; // i neplatné pozice −1, 0, n+1
          res = p.run((st) => listInsertAfter(st, k, x));
          code = L_INSERT_AFTER;
          if (k >= 1 && k <= ref.length) ref.splice(k, 0, x);
        } else if (d < 0.7) {
          res = p.run((st) => listFind(st, x));
          code = L_FIND;
          const at = ref.indexOf(x);
          expect(res.steps.at(-1)!.message).toMatch(
            at >= 0
              ? `Find(${x}): nalezeno na pozici ${at + 1} po `
              : `Find(${x}): `,
          );
        } else {
          res = p.run((st) => listDelete(st, x));
          code = L_DELETE;
          const at = ref.indexOf(x); // maže se první výskyt
          if (at >= 0) ref.splice(at, 1);
        }
        expect(badLines(res.steps, code)).toEqual([]);
        expect(labels(p.st), `seed ${seed} op ${op}`).toEqual(ref);
        expect(new Set(p.st.boxes.map((b) => b.id)).size).toBe(
          p.st.boxes.length,
        );
        // „hlava“ vždy míří na první prvek (nebo na ∅), žádný ukazatel nemíří mimo seznam
        expect(p.st.pointers.find((q) => q.label === "hlava")).toEqual({
          at: ref.length ? 0 : -1,
          label: "hlava",
        });
        for (const s of res.steps) {
          for (const q of s.state.pointers) {
            expect(Number.isInteger(q.at)).toBe(true);
            expect(q.at).toBeGreaterThanOrEqual(-1);
            expect(q.at).toBeLessThan(s.state.boxes.length);
          }
        }
      }
    }
  });

  it("Delete: prázdný seznam, hlava, prostřední prvek, chybějící prvek", () => {
    expect(
      page("list", [])
        .run((st) => listDelete(st, 1))
        .steps.map((s) => [s.line, s.message]),
    ).toEqual([[1, "Delete(1): seznam je prázdný – není co mazat."]]);

    const head = page("list").run((st) => listDelete(st, 5));
    expect(labels(head.last)).toEqual([12, 8]);
    expect(head.steps.map((s) => s.line)).toEqual([2, null]);
    expect(head.last.vars).toEqual({});

    const mid = page("list").run((st) => listDelete(st, 8));
    expect(labels(mid.last)).toEqual([5, 12]);
    expect(mid.last.vars).toEqual({});
    expect(mid.last.pointers).toEqual([{ at: 0, label: "hlava" }]);
    expect(mid.last.boxes.every((b) => !b.cls)).toBe(true);

    const miss = page("list").run((st) => listDelete(st, 77));
    expect(labels(miss.last)).toEqual([5, 12, 8]);
    expect(miss.steps.at(-1)!.message).toBe(
      "Delete(77): 77 v seznamu není (následník(p) = ∅) – seznam se nezměnil.",
    );
  });

  it("hlášky skloňují počet prvků", () => {
    const one = page("stack", []).run((st) => stackPush(st, 1));
    expect(one.steps.at(-1)!.message).toBe(
      "Push(1): hotovo – 1 je na vrcholu, zásobník má 1 prvek. Cena O(1).",
    );
    const four = page("stack").run((st) => stackPush(st, 1));
    expect(four.steps.at(-1)!.message).toBe(
      "Push(1): hotovo – 1 je na vrcholu, zásobník má 4 prvky. Cena O(1).",
    );
    const q = page("queue", [1, 2, 3, 4]).run((st) => enqueue(st, 9));
    expect(q.steps.at(-1)!.message).toBe(
      "Enqueue(9): hotovo – 9 je na konci, fronta má 5 prvků. Cena O(1).",
    );
  });

  it("makeList nastaví klidové ukazatele podle druhu struktury", () => {
    expect(makeList("stack", [1, 2]).pointers).toEqual([
      { at: 1, label: "vrchol" },
    ]);
    expect(makeList("stack", []).pointers).toEqual([]);
    expect(
      makeList("queue", [1, 2]).pointers.map((q) => [q.at, q.label]),
    ).toEqual([
      [0, "začátek"],
      [1, "konec"],
    ]);
    expect(makeList("queue", []).pointers).toEqual([]);
    expect(makeList("list", [1]).pointers).toEqual([{ at: 0, label: "hlava" }]);
    expect(makeList("list", []).pointers).toEqual([{ at: -1, label: "hlava" }]);
  });
});
