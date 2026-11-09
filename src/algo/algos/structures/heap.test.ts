/**
 * Binární halda – regresní testy generátorů kroků.
 * Testy „BUG:“ jsou převzaté z auditu (src/_audit/structures*.test.ts) a hlídají opravené chyby.
 */
import { describe, expect, it } from "vitest";
import { rng, type StepGen } from "../../core/steps";
import {
  EXTRACT,
  HEAP_MAX,
  INSERT,
  MAKE,
  heapExtractMin,
  heapInsert,
  heapOf,
  makeHeap,
  type HeapState,
} from "./heap";
import { badLines, runOp, type OpResult } from "./testutil";

type Op = (st: HeapState) => StepGen<HeapState>;
const isMinHeap = (a: { v: number }[]) =>
  a.every((it, i) => i === 0 || a[Math.floor((i - 1) / 2)].v <= it.v);
const sortedVals = (a: { v: number }[]) =>
  a.map((x) => x.v).sort((x, y) => x - y);
const vals = (st: HeapState) => st.a.map((x) => x.v);

/** malá „stránka“: drží trvalý stav a řetězí operace jako useStructure */
function page(initial = [3, 7, 5, 12, 9, 8, 6]) {
  let st = heapOf(initial);
  return {
    get st() {
      return st;
    },
    run(op: Op): OpResult<HeapState> {
      const r = runOp(st, op);
      st = r.last;
      return r;
    },
  };
}

describe("halda – řádky pseudokódu", () => {
  it("BUG: MakeHeap – kroky BubbleDown ukazují na existující řádky zobrazeného pseudokódu (heap-makeheap-bubbledown-lines-out-of-range)", () => {
    const { steps } = page().run((st) =>
      makeHeap(st, [15, 3, 9, 1, 12, 7, 4, 10]),
    );
    expect(badLines(steps, MAKE)).toEqual([]);
    // bublání opravdu zvýrazňuje tělo procedury BubbleDown, ne jen hlavičku MakeHeap
    const body = MAKE.indexOf("BubbleDown(i):");
    expect(body).toBeGreaterThan(0);
    const inBody = steps.filter((s) => s.line !== null && s.line > body);
    expect(inBody.length).toBeGreaterThan(steps.length / 2);
    for (const s of steps) {
      if (
        s.message.startsWith("Synové vrcholu") ||
        s.message.includes("jediného syna")
      )
        expect(MAKE[s.line!]).toContain("s ← 2i");
      if (s.message.startsWith("Je k(i)"))
        expect(MAKE[s.line!]).toContain("k(i) < k(s)");
      if (s.message.startsWith("Ne – prohodíme"))
        expect(MAKE[s.line!]).toContain("Prohodíme p(i) a p(s)");
      if (s.message.includes("nemá syny"))
        expect(MAKE[s.line!]).toContain("Dokud 2i ≤ n");
    }
  });

  it("Insert a ExtractMin zvýrazňují řádky, které odpovídají hlášce", () => {
    const p = page();
    const ins = p.run((st) => heapInsert(st, 1));
    expect(badLines(ins.steps, INSERT)).toEqual([]);
    for (const s of ins.steps) {
      if (s.message.includes("Je k(o)"))
        expect(INSERT[s.line!]).toContain("k(o) ≤ k(i)");
      if (s.message.startsWith("Ne – prohodíme"))
        expect(INSERT[s.line!]).toContain("Prohodíme p(i) a p(o)");
      if (s.message.includes("vybublal"))
        expect(INSERT[s.line!]).toContain("Dokud i > 1");
    }
    const ext = p.run((st) => heapExtractMin(st));
    expect(badLines(ext.steps, EXTRACT)).toEqual([]);
    for (const s of ext.steps) {
      if (s.message.startsWith("Je k(i)"))
        expect(EXTRACT[s.line!]).toContain("k(i) < k(s)");
      if (s.message.startsWith("Ne – prohodíme"))
        expect(EXTRACT[s.line!]).toContain("Prohodíme p(i) a p(s)");
    }
    expect(ext.steps.at(-1)!.message).toBe(
      "ExtractMin: vrací 1 – halda má 7 prvků, nové minimum je 3. Cena O(log n).",
    );
    expect(EXTRACT[ext.steps.at(-1)!.line!]).toContain("Vrátíme");
  });

  it("všechny tři pseudokódy obsahují tělo pomocné procedury, na kterou kroky odkazují", () => {
    expect(INSERT).toContain("BubbleUp(i):");
    expect(EXTRACT).toContain("BubbleDown(i):");
    expect(MAKE).toContain("BubbleDown(i):");
    expect(MAKE.some((l) => l.includes("viz ExtractMin"))).toBe(false);
  });
});

describe("halda – limit velikosti (heap-insert-unbounded-tree-overlap)", () => {
  it(`BUG: Insert do plné haldy (${HEAP_MAX} prvků) se odmítne jediným krokem, halda se nezmění`, () => {
    const p = page();
    p.run((st) =>
      makeHeap(
        st,
        Array.from({ length: 31 }, (_, i) => i + 1),
      ),
    );
    expect(p.st.a.length).toBe(HEAP_MAX);
    const before = vals(p.st);
    for (let rep = 0; rep < 2; rep++) {
      const { steps, last } = p.run((st) => heapInsert(st, 99));
      expect(steps).toHaveLength(1);
      expect(steps[0].line).toBeNull();
      expect(steps[0].message).toContain(`nejvýše ${HEAP_MAX} prvků`);
      expect(vals(last)).toEqual(before);
    }
    // po ExtractMin je zase místo
    p.run((st) => heapExtractMin(st));
    p.run((st) => heapInsert(st, 99));
    expect(p.st.a.length).toBe(HEAP_MAX);
    expect(isMinHeap(p.st.a)).toBe(true);
  });

  it("MakeHeap bere nejvýše 31 čísel a oříznutí ohlásí v prvním kroku", () => {
    const p = page();
    const { steps, last } = p.run((st) =>
      makeHeap(
        st,
        Array.from({ length: 40 }, (_, i) => 40 - i),
        ["abc", "1e999"],
      ),
    );
    expect(last.a.length).toBe(HEAP_MAX);
    expect(isMinHeap(last.a)).toBe(true);
    expect(steps[0].message).toContain(
      "vstup má 40 čísel, vizualizace bere jen prvních 31",
    );
    expect(steps[0].message).toContain("přeskočeno, není číslo: abc, 1e999");
  });
});

describe("halda – neplatný vstup (structures-silent-input-corrections)", () => {
  it("MakeHeap bez jediného čísla haldu nesmaže a neohlásí úspěch", () => {
    for (const [values, ignored] of [
      [[], ["abc"]],
      [[], []],
      [[NaN, Infinity], []],
    ] as [number[], string[]][]) {
      const p = page();
      const { steps, last } = p.run((st) => makeHeap(st, values, ignored));
      expect(steps).toHaveLength(1);
      expect(steps[0].line).toBeNull();
      expect(steps[0].message).toContain("Ve vstupu není žádné číslo");
      expect(steps[0].message).toContain("Halda se nezměnila.");
      expect(vals(last)).toEqual([3, 7, 5, 12, 9, 8, 6]);
    }
    expect(
      page().run((st) => makeHeap(st, [], ["abc"])).steps[0].message,
    ).toContain("přeskočeno, není číslo: abc");
  });

  it("Insert(NaN) a Insert(±∞) se odmítnou, halda se nezmění", () => {
    for (const x of [NaN, Infinity, -Infinity]) {
      const { steps, last } = page().run((st) => heapInsert(st, x));
      expect(steps).toHaveLength(1);
      expect(steps[0].message).toBe(
        "Hodnota x není číslo – Insert nelze provést.",
      );
      expect(vals(last)).toEqual([3, 7, 5, 12, 9, 8, 6]);
      expect(last.marks).toEqual({});
    }
  });

  it("MakeHeap přeskočí nekonečna a NaN mezi čísly", () => {
    const { last } = page().run((st) => makeHeap(st, [5, NaN, 1, Infinity, 3]));
    expect(sortedVals(last.a)).toEqual([1, 3, 5]);
    expect(isMinHeap(last.a)).toBe(true);
  });
});

describe("halda – invarianty", () => {
  it("výchozí příklad je korektní minimová halda", () => {
    expect(isMinHeap(page().st.a)).toBe(true);
  });

  it("náhodné posloupnosti Insert / ExtractMin / MakeHeap proti referenčnímu multisetu", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const p = page();
      let ref = sortedVals(p.st.a);
      for (let op = 0; op < 12; op++) {
        const dice = r();
        let res: OpResult<HeapState>;
        let code: string[];
        if (dice < 0.45) {
          const x = Math.floor(r() * 41) - 20; // i záporné a duplicitní klíče
          res = p.run((st) => heapInsert(st, x));
          code = INSERT;
          if (ref.length < HEAP_MAX) ref = [...ref, x].sort((a, b) => a - b);
        } else if (dice < 0.85) {
          res = p.run((st) => heapExtractMin(st));
          code = EXTRACT;
          const msg = res.steps.at(-1)!.message;
          if (ref.length === 0)
            expect(msg).toBe("ExtractMin: halda je prázdná – není co odebrat.");
          else {
            expect(msg.startsWith(`ExtractMin: vrací ${ref[0]} – `)).toBe(true);
            ref = ref.slice(1);
          }
        } else {
          const n = 1 + Math.floor(r() * 31); // 1 … 31
          const input = Array.from(
            { length: n },
            () => Math.floor(r() * 30) - 5,
          );
          res = p.run((st) => makeHeap(st, input));
          code = MAKE;
          ref = [...input].sort((a, b) => a - b);
        }
        const st = p.st;
        expect(badLines(res.steps, code)).toEqual([]);
        expect(isMinHeap(st.a), `seed ${seed} op ${op}`).toBe(true);
        expect(sortedVals(st.a)).toEqual(ref);
        expect(new Set(st.a.map((x) => x.id)).size).toBe(st.a.length); // unikátní id
        expect(st.marks).toEqual({}); // po operaci žádné zvýraznění
        expect(st.vars).toEqual({});
        for (const s of res.steps) {
          // mezikroky nikdy neztratí ani nepřidají prvek navíc a značky míří jen na existující vrcholy
          expect(Math.abs(s.state.a.length - st.a.length)).toBeLessThanOrEqual(
            1,
          );
          for (const k of Object.keys(s.state.marks))
            expect(Number(k)).toBeLessThan(s.state.a.length);
        }
      }
    }
  });

  it("desetinné, záporné, nulové a obří klíče: ExtractMin vrací klíče vzestupně", () => {
    const p = page();
    const input = [2.5, -0.5, 0, 1e15, -1e15, 2.5, 7, -3, 0.001];
    p.run((st) => makeHeap(st, input));
    p.run((st) => heapInsert(st, -7.25));
    expect(isMinHeap(p.st.a)).toBe(true);
    const out: number[] = [];
    for (let i = 0; i < input.length + 1; i++) {
      out.push(p.st.a[0].v);
      p.run((st) => heapExtractMin(st));
      expect(isMinHeap(p.st.a)).toBe(true);
    }
    expect(out).toEqual([...input, -7.25].sort((a, b) => a - b));
    expect(p.st.a).toEqual([]);
  });

  it("prázdná a jednoprvková halda", () => {
    const p = page([]);
    const empty = p.run((st) => heapExtractMin(st));
    expect(empty.steps.map((s) => [s.line, s.message, s.error])).toEqual([
      [null, "ExtractMin: halda je prázdná – není co odebrat.", true],
    ]);
    const first = p.run((st) => heapInsert(st, 5));
    expect(vals(first.last)).toEqual([5]);
    expect(first.steps.map((s) => s.message)).toContain(
      "Nový prvek je kořen – není s čím ho porovnávat.",
    );
    const only = p.run((st) => heapExtractMin(st));
    expect(only.last.a).toEqual([]);
    expect(only.steps.map((s) => s.line)).toEqual([1, 2, 4]);
    expect(only.steps.at(-1)!.message).toBe(
      "ExtractMin: vrací 5 – halda je teď prázdná. Cena O(log n).",
    );
    const single = p.run((st) => makeHeap(st, [4]));
    expect(vals(single.last)).toEqual([4]);
    expect(badLines(single.steps, MAKE)).toEqual([]);
  });

  it("BubbleDown vybírá menšího syna; při rovnosti klíčů levého", () => {
    const { steps } = page().run((st) => makeHeap(st, [9, 4, 4]));
    const sons = steps.find((s) => s.message.startsWith("Synové vrcholu 1"))!;
    expect(sons.message).toBe(
      "Synové vrcholu 1 jsou 2 a 3 (klíče 4 a 4) – klíče jsou stejné, zůstaneme u levého syna 2.",
    );
    expect(sons.state.marks).toEqual({ 0: "active", 1: "min", 2: "compare" });
    const right = page()
      .run((st) => makeHeap(st, [9, 6, 2]))
      .steps.find((s) => s.message.startsWith("Synové vrcholu 1"))!;
    expect(right.message).toContain("menší klíč má pravý syn 3");
    expect(right.state.marks).toEqual({ 0: "active", 1: "compare", 2: "min" });
  });
});
