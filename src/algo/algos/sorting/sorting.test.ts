/**
 * Regresní testy třídicích algoritmů (generátory kroků) a čisté logiky stránky třídění.
 * Každý vstup se pro daný algoritmus odkrokuje jen jednou (cache), invarianty se pak kontrolují nad hotovými kroky.
 */
import { describe, expect, it } from "vitest";
import { MAX_STEPS, materialize, rng, type Step } from "../../core/steps";
import { SORTING } from "./algorithms";
import { bubbleSort, insertSort, selectSort } from "./simple";
import { mergeSort } from "./merge";
import { quickSort } from "./quick";
import { countingSort, heapSort } from "./heapcount";
import {
  DEFAULT_INPUT,
  DEFAULT_SMALL_INPUT,
  defaultInput,
  layoutOf,
  sameNumbers,
  scaleMax,
} from "./input";
import {
  MAX_SORT_N,
  plural,
  reject,
  type SortAlgorithm,
  type SortState,
} from "./types";

const COMPARISON: SortAlgorithm[] = [
  bubbleSort,
  selectSort,
  insertSort,
  mergeSort,
  quickSort,
  heapSort,
];

/* ------------------------------------------------------------------ vstupy */

function randomInput(seed: number, maxN: number, maxV: number): number[] {
  const r = rng(seed);
  const n = 1 + Math.floor(r() * maxN);
  return Array.from({ length: n }, () => 1 + Math.floor(r() * maxV));
}

/** vstupy s hodnotami 1 … 9 – projdou všemi algoritmy včetně Counting sortu */
const SMALL: number[][] = [
  [5],
  [1, 2],
  [2, 1],
  [3, 3],
  [7, 7, 7, 7, 7, 7],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [9, 8, 7, 6, 5, 4, 3, 2, 1],
  [1, 9, 1, 9, 1, 9, 1],
  [2, 1, 2, 1, 2, 1, 2, 1],
  [5, 1, 4, 2, 3, 3, 2, 4, 1, 5],
  DEFAULT_SMALL_INPUT,
  ...Array.from({ length: 24 }, (_, k) => randomInput(k + 1, 14, 9)),
  ...Array.from({ length: 4 }, (_, k) => randomInput(k + 301, 30, 3)),
  Array.from({ length: 36 }, (_, i) => 9 - (i % 9)),
];

/** vstupy jen pro porovnávací algoritmy: velká, záporná, necelá a obří čísla */
const WIDE: number[][] = [
  DEFAULT_INPUT,
  ...Array.from({ length: 8 }, (_, k) => randomInput(k + 1001, 16, 99)),
  [-5, 3, -1, 0, 2],
  [2.5, 1.5, 2.25, -0.5],
  [1e9, 3, 1e12, 7],
  [0, 0, 0],
  [-50, -20, -30],
  [Number.MAX_VALUE, -Number.MAX_VALUE, 0, Number.MIN_VALUE],
];

const inputsFor = (algo: SortAlgorithm) =>
  algo === countingSort ? SMALL : [...SMALL, ...WIDE];

/**
 * Nejhorší vstup pro Quicksort s pivotem uprostřed: v každém úseku je pivot maximem, úsek se tedy
 * zmenší jen o jeden prvek. (Konstrukce pozpátku: do pole délky k + 1 dáme maximum doprostřed
 * a prvek, který tam byl, na konec – přesně to rozdělování vrátí.)
 */
function quickKiller(n: number): number[] {
  let b = [1];
  for (let k = 1; k < n; k++) {
    const m = Math.floor(k / 2);
    const a = [...b, b[m]];
    a[m] = k + 1;
    b = a;
  }
  return b;
}

const ref = (a: number[]) => [...a].sort((x, y) => x - y);
const vals = (st: SortState) => st.items.map((i) => i.v);

const cache = new Map<string, Step<SortState>[]>();
function run(algo: SortAlgorithm, input: number[]): Step<SortState>[] {
  const key = algo.id + ":" + input.join(" ");
  let steps = cache.get(key);
  if (!steps) {
    const copy = [...input];
    steps = materialize(algo.run(copy));
    expect(copy, `${algo.id}: generátor nesmí měnit vstupní pole`).toEqual(
      input,
    );
    cache.set(key, steps);
  }
  return steps;
}

/* ------------------------------------------------------------------ invarianty všech algoritmů */

describe("třídění – invarianty", () => {
  for (const algo of SORTING) {
    const inputs = inputsFor(algo);

    it(`${algo.id}: výsledek je setříděná permutace vstupu, kroků je méně než limit`, () => {
      for (const input of inputs) {
        const steps = run(algo, input);
        expect(steps.length).toBeGreaterThan(1);
        expect(steps.length).toBeLessThan(MAX_STEPS);
        expect(
          vals(steps[steps.length - 1].state),
          `vstup ${input.join(" ")}`,
        ).toEqual(ref(input));
      }
    });

    it(`${algo.id}: řádek pseudokódu existuje a není prázdný, zpráva je smysluplná`, () => {
      for (const input of inputs) {
        for (const s of run(algo, input)) {
          if (s.line !== null) {
            expect(s.line).toBeGreaterThanOrEqual(0);
            expect(s.line).toBeLessThan(algo.pseudocode.length);
            expect(algo.pseudocode[s.line].trim()).not.toBe("");
          }
          expect(s.message).not.toMatch(/undefined|NaN|\[object/);
          expect(s.message.length).toBeGreaterThan(0);
        }
      }
    });

    it(`${algo.id}: id prvků jsou unikátní; značky, „na místě“ i svorky ukazují dovnitř pole`, () => {
      for (const input of inputs) {
        const n = input.length;
        for (const s of run(algo, input)) {
          const st = s.state;
          const where = `${algo.id} [${input.join(" ")}]: ${s.message}`;
          expect(st.items.length).toBe(n);
          expect(new Set(st.items.map((i) => i.id)).size).toBe(n);
          for (const k of [
            ...Object.keys(st.marks).map(Number),
            ...st.sorted,
          ]) {
            expect(Number.isInteger(k) && k >= 0 && k < n, where).toBe(true);
          }
          for (const rg of st.ranges)
            expect(
              0 <= rg.from && rg.from <= rg.to && rg.to <= n - 1,
              `${where} (${rg.from}–${rg.to})`,
            ).toBe(true);
          if (st.aux) {
            const ids = st.aux.items.filter((i) => i !== null).map((i) => i.id);
            expect(new Set(ids).size).toBe(ids.length);
            for (const k of Object.keys(st.aux.marks).map(Number))
              expect(k >= 0 && k < st.aux.items.length, where).toBe(true);
          }
        }
      }
    });

    it(`${algo.id}: prvek označený „na správném místě“ už má svou konečnou hodnotu`, () => {
      for (const input of inputs) {
        const r = ref(input);
        for (const s of run(algo, input)) {
          for (const idx of s.state.sorted)
            expect(
              s.state.items[idx].v,
              `${algo.id} [${input.join(" ")}]: ${s.message}`,
            ).toBe(r[idx]);
        }
      }
    });

    it(`${algo.id}: poslední krok má vše „na místě“, žádné značky ani svorky`, () => {
      for (const input of inputs) {
        const steps = run(algo, input);
        const last = steps[steps.length - 1].state;
        expect([...new Set(last.sorted)].sort((a, b) => a - b)).toEqual(
          input.map((_, i) => i),
        );
        expect(last.marks).toEqual({});
        expect(last.ranges).toEqual([]);
      }
    });

    it(`${algo.id}: panel proměnných se mezi kroky neobjevuje a nemizí (plátno by poskakovalo)`, () => {
      for (const input of inputs) {
        const withVars = run(algo, input).map(
          (s) => Object.keys(s.state.vars).length > 0,
        );
        expect(new Set(withVars).size, `${algo.id} [${input.join(" ")}]`).toBe(
          1,
        );
      }
    });
  }

  for (const algo of COMPARISON) {
    it(`${algo.id}: pole je v každém kroku permutací vstupu`, () => {
      for (const input of inputsFor(algo)) {
        const r = ref(input);
        for (const s of run(algo, input)) expect(ref(vals(s.state))).toEqual(r);
      }
    });
  }

  for (const algo of [bubbleSort, insertSort, mergeSort]) {
    it(`${algo.id}: je stabilní (stejné hodnoty zůstanou v původním pořadí)`, () => {
      for (const input of SMALL) {
        const steps = run(algo, input);
        const items = steps[steps.length - 1].state.items;
        for (let i = 1; i < items.length; i++) {
          if (items[i - 1].v === items[i].v)
            expect(items[i - 1].id).toBeLessThan(items[i].id);
        }
      }
    });
  }

  it("žádné třídění na 60 prvcích (největší vstup, který pustí UI) nenarazí na limit kroků", () => {
    const desc = Array.from({ length: 60 }, (_, i) => 60 - i);
    for (const algo of SORTING) {
      const input = algo.inputMax
        ? desc.map((v) => ((v - 1) % algo.inputMax!) + 1)
        : algo === quickSort
          ? quickKiller(60)
          : desc;
      const steps = run(algo, input);
      expect(steps.length, algo.id).toBeLessThan(MAX_STEPS);
      expect(vals(steps[steps.length - 1].state)).toEqual(ref(input));
    }
  });
});

/* ------------------------------------------------------------------ vstupy, které nejdou třídit */

describe("třídění – ochrana proti špatnému vstupu", () => {
  it("prázdný vstup: jediný krok s hláškou, nic „na místě“, žádné svorky ani značky (dřív sorted = [−1], svorka 0…−1)", () => {
    for (const algo of SORTING) {
      const steps = materialize(algo.run([]));
      expect(steps.length, algo.id).toBe(1);
      expect(steps[0].message).toMatch(/Prázdný vstup/);
      expect(steps[0].line).toBeNull();
      expect(steps[0].state).toEqual({
        items: [],
        marks: {},
        sorted: [],
        ranges: [],
        vars: {},
        stats: { cmp: 0, moves: 0 },
      });
      // odmítnutý vstup Visualizer ukáže jako chybu (červeně)
      expect(steps[0].error).toBe(true);
    }
  });

  it("NaN a ±∞: žádná výjimka ani zacyklení, jediný krok s hláškou a jen vykreslitelnými prvky", () => {
    for (const algo of SORTING) {
      for (const input of [
        [NaN],
        [3, NaN, 1],
        [Infinity, 2],
        [1, -Infinity, 5, NaN],
      ]) {
        const steps = materialize(algo.run(input));
        expect(steps.length, algo.id).toBe(1);
        expect(steps[0].message).toMatch(/není konečné číslo/);
        expect(steps[0].state.items.every((it) => Number.isFinite(it.v))).toBe(
          true,
        );
      }
    }
  });

  it(`více než ${MAX_SORT_N} prvků: jediný krok s hláškou (nekrokujeme tisíce snímků obřího pole)`, () => {
    const big = Array.from({ length: 5000 }, (_, i) => (i % 9) + 1);
    for (const algo of SORTING) {
      const steps = materialize(algo.run(big));
      expect(steps.length, algo.id).toBe(1);
      expect(steps[0].message).toContain(`nejvýše ${MAX_SORT_N}`);
      expect(steps[0].state.items.length).toBeLessThanOrEqual(MAX_SORT_N);
    }
    expect(reject(Array.from({ length: MAX_SORT_N }, () => 1))).toBeNull();
  });

  it("counting: limit generátoru = inputMax stránky; hodnota nad limit, nula, záporné a necelé číslo skončí hláškou", () => {
    const lim = countingSort.inputMax!;
    const ok = run(countingSort, [lim, 1]);
    expect(vals(ok[ok.length - 1].state)).toEqual([1, lim]);
    for (const input of [
      [lim + 1, 1],
      [0],
      [-1, 2],
      [1.5],
      [3, 1000],
      DEFAULT_INPUT,
    ]) {
      const steps = materialize(countingSort.run(input));
      expect(steps.length, input.join(" ")).toBe(1);
      expect(steps[0].message).toContain(
        `Counting sort tu ukazujeme jen pro celá čísla 1 … ${lim}`,
      );
      expect(vals(steps[0].state)).toEqual(input); // vstup zůstává vidět tak, jak byl zadán
    }
    // hláška jmenuje, co vadí (nejvýš tři různé hodnoty)
    expect(
      materialize(countingSort.run([3, 12, 12, 0, 40, 77]))[0].message,
    ).toContain("je ale 12, 0, 40, …");
  });

  it("výchozí vstup každého algoritmu je platný a opravdu se třídí", () => {
    for (const algo of SORTING) {
      const input = defaultInput(algo);
      if (algo.inputMax)
        expect(
          input.every(
            (v) => Number.isInteger(v) && v >= 1 && v <= algo.inputMax!,
          ),
        ).toBe(true);
      const steps = run(algo, input);
      expect(steps.length, algo.id).toBeGreaterThan(5);
      expect(vals(steps[steps.length - 1].state)).toEqual(ref(input));
    }
  });
});

/* ------------------------------------------------------------------ Bubblesort, Selectsort, Insertsort */

describe("bubble / select / insert", () => {
  it("bubble: každý průchod porovná n − 1 dvojic, přesně jako pseudokód „Pro i = 1, …, n − 1“ (dřív 4, 3, 2, 1, 0)", () => {
    expect(bubbleSort.pseudocode[3].trim()).toBe("Pro i = 1, …, n − 1:");
    for (const input of [
      [5, 4, 3, 2, 1],
      [1, 2, 3],
      [2, 1, 3, 1],
      DEFAULT_INPUT,
    ]) {
      const perPass: number[] = [];
      for (const s of run(bubbleSort, input)) {
        if (s.line === 2) perPass.push(0);
        if (s.line === 4) perPass[perPass.length - 1]++;
      }
      expect(
        perPass.every((c) => c === input.length - 1),
        `porovnání v průchodech: ${perPass}`,
      ).toBe(true);
      expect(perPass.length).toBeLessThanOrEqual(input.length);
    }
  });

  it("bubble: poslední průchod je ten, který nic neprohodil; sestupné pole potřebuje n průchodů", () => {
    const steps = run(bubbleSort, [5, 4, 3, 2, 1]);
    expect(steps.filter((s) => s.line === 2).length).toBe(5);
    const end = steps[steps.length - 2];
    expect(end.line).toBe(1);
    expect(end.message).toContain("průchod č. 5 nic neprohodil");
    expect(end.state.vars.pokračuj).toBe(0);
    // setříděné pole: jediný průchod
    expect(run(bubbleSort, [1, 2, 3]).filter((s) => s.line === 2).length).toBe(
      1,
    );
  });

  it("bubble: po k-tém průchodu je zeleně právě k posledních pozic (lemma z Průvodce)", () => {
    const steps = run(bubbleSort, [3, 1, 4, 1, 5, 9, 2, 6]);
    for (const s of steps.filter((x) => x.line === 2)) {
      const k = Number(s.state.vars.průchod) - 1;
      expect([...s.state.sorted].sort((a, b) => a - b)).toEqual(
        Array.from({ length: k }, (_, t) => 8 - k + t),
      );
    }
  });

  it("select: jednoprvkové pole neoznačí index −1 a po prohození nezůstane viset proměnná j", () => {
    const one = run(selectSort, [7]);
    expect(one[one.length - 1].state.sorted).toEqual([0]);
    for (const s of run(selectSort, [3, 1, 2]))
      if (s.line === 4 || s.line === 5) expect(s.state.vars.j).toBeUndefined();
  });

  it("insert: zeleně („na správném místě“) označený prvek se už nehýbe – setříděný začátek ukazuje svorka", () => {
    const steps = run(insertSort, [2, 3, 4, 1]);
    // zelená až v posledním kroku
    expect(steps.slice(0, -1).every((s) => s.state.sorted.length === 0)).toBe(
      true,
    );
    // svorka = začátek, který je opravdu setříděný (mimo okamžiky, kdy jím právě cestuje x)
    for (const s of steps.slice(0, -1)) {
      expect(s.state.ranges.length).toBe(1);
      const { from, to } = s.state.ranges[0];
      expect(from).toBe(0);
      if (s.line === 0 || s.line === 1 || s.line === 6) {
        const prefix = vals(s.state).slice(0, to + 1);
        expect(prefix, s.message).toEqual(ref(prefix));
      }
    }
    const grown = steps
      .filter((s) => s.line === 6)
      .map((s) => s.state.ranges[0].to + 1);
    expect(grown).toEqual([2, 3, 4]);
  });

  it("insert: popisek svorky se ukáže, jen když se pod ni vejde (jinak by ho uřízl levý okraj plátna)", () => {
    const labels = (n: number) => {
      const input = Array.from({ length: n }, (_, i) => i + 1);
      return run(insertSort, input)
        .filter((s) => s.line === 6)
        .map((s) => s.state.ranges[0].label);
    };
    expect(labels(12).slice(0, 2)).toEqual([
      "setříděný začátek",
      "setříděný začátek",
    ]);
    expect(run(insertSort, [1, 2, 3])[0].state.ranges[0].label).toBe(
      "setříděný začátek",
    );
    expect(
      run(
        insertSort,
        Array.from({ length: 12 }, (_, i) => i + 1),
      )[0].state.ranges[0].label,
    ).toBe("setříděno");
    const wide = labels(40);
    expect(wide[0]).toBeUndefined(); // 2 ze 40 slotů = 45 jednotek, nevejde se ani krátký popisek
    expect(wide[wide.length - 1]).toBe("setříděný začátek");
  });

  it("insert: zprávy porovnání odpovídají tomu, co se stane (posun × konec posouvání)", () => {
    const steps = run(insertSort, [1, 3, 2]);
    const msgs = steps.map((s) => s.message);
    expect(msgs).toContain("P[1] = 1 ≤ x = 3 – dál už neposouváme.");
    expect(msgs).toContain("P[2] = 3 > x = 2 – musí uhnout doprava.");
    expect(msgs).toContain(
      "Vložíme x = 2 na pozici 2. Setříděný začátek má teď 3 prvky.",
    );
  });
});

/* ------------------------------------------------------------------ Mergesort */

describe("merge", () => {
  it("slévané běhy X a Y jsou setříděné a Z je vždy setříděný prefix", () => {
    for (const input of SMALL) {
      for (const s of run(mergeSort, input)) {
        const st = s.state;
        if (!st.aux) continue;
        expect(st.ranges.map((rg) => rg.label)).toEqual(["X", "Y"]);
        for (const rg of st.ranges) {
          if (s.line === 5) continue; // po zápisu zpět už úseky obsahují slitý výsledek
          for (let k = rg.from + 1; k <= rg.to; k++)
            expect(st.items[k - 1].v).toBeLessThanOrEqual(st.items[k].v);
        }
        const z = st.aux.items.filter((i) => i !== null).map((i) => i.v);
        expect(z).toEqual(ref(z));
      }
    }
  });

  it("mezi sléváními svorky ukazují všechny běhy délky b a každý z nich je setříděný", () => {
    const input = [5, 1, 4, 2, 3, 3, 2, 4, 1, 5, 9];
    const steps = run(mergeSort, input);
    const between = steps.slice(0, -1).filter((s) => !s.state.aux);
    expect(between.length).toBeGreaterThan(4);
    for (const s of between) {
      const b = Number(s.state.vars.b);
      const rs = s.state.ranges;
      expect(rs.length, s.message).toBe(Math.ceil(input.length / b));
      rs.forEach((rg, k) => {
        expect(rg.from).toBe(k * b);
        expect(rg.to).toBe(Math.min(k * b + b - 1, input.length - 1));
        const part = vals(s.state).slice(rg.from, rg.to + 1);
        expect(part, s.message).toEqual(ref(part));
      });
    }
  });

  it("svorky nechybí v žádném kroku kromě posledního (plátno nemění výšku)", () => {
    const steps = run(mergeSort, DEFAULT_INPUT);
    expect(steps.slice(0, -1).every((s) => s.state.ranges.length > 0)).toBe(
      true,
    );
  });

  it("při porovnání čel nezůstává v Z zvýrazněný naposledy přesunutý prvek", () => {
    for (const s of run(mergeSort, DEFAULT_INPUT))
      if (s.line === 10) expect(s.state.aux!.marks).toEqual({});
  });
});

/* ------------------------------------------------------------------ Quicksort */

describe("quick", () => {
  const idx = (text: string) =>
    quickSort.pseudocode.findIndex((l) => l.trim() === text);
  const L_CALL = idx("QuickSort(l, j)");
  const R_CALL = idx("QuickSort(i, r)");

  it("pseudokód odpovídá QuickSort2 z Průvodce (prohození jen pro i < j, posun jezdců pro i ≤ j)", () => {
    expect(idx("Pokud i < j: prohodíme P[i] a P[j].")).toBe(7);
    expect(idx("Pokud i ≤ j: i ← i + 1, j ← j − 1")).toBe(8);
    expect([L_CALL, R_CALL]).toEqual([9, 10]);
    // nikdy se „neprohazuje“ prvek sám se sebou
    for (const input of [...SMALL, ...WIDE]) {
      for (const s of run(quickSort, input))
        expect(
          Object.values(s.state.marks).filter((m) => m === "swap").length,
        ).not.toBe(1);
    }
  });

  it("pomocná paměť přiznává nejhorší případ: pro nešťastné pivoty je hloubka rekurze n − 1", () => {
    const n = 60;
    const steps = run(quickSort, quickKiller(n));
    const depth = Math.max(
      ...steps.map((s) => Number(s.state.vars.hloubka ?? 0)),
    );
    expect(depth).toBe(n - 1);
    expect(quickSort.complexity.space).toMatch(/Θ\(log n\) v průměru/);
    expect(quickSort.complexity.space).toMatch(/Θ\(n\) nejhůře/);
  });

  it("žádný krok nekreslí prázdný úsek („úsek 1–0“) a nevzniká krok „Prázdný úsek.“", () => {
    for (const input of [[1, 2], [2, 1], DEFAULT_INPUT, ...SMALL]) {
      for (const s of run(quickSort, input)) {
        expect(s.message).not.toMatch(/Prázdný úsek/);
        expect(badInterval(s.message), s.message).toBe(false);
        for (const rg of s.state.ranges)
          expect(rg.from).toBeLessThanOrEqual(rg.to);
      }
    }
    // vstup 1 2: levá část je po rozdělení prázdná – řekne to slovy
    const done = run(quickSort, [1, 2]).find((s) =>
      s.message.startsWith("Rozděleno"),
    )!;
    expect(done.message).toContain("levá část je prázdná");
    expect(done.state.ranges).toEqual([{ from: 0, to: 1, label: "úsek 1–2" }]);
  });

  it("„Rozděleno“ svítí na řádku QuickSort(l, j) a před druhým voláním je krok na řádku QuickSort(i, r)", () => {
    const steps = run(quickSort, DEFAULT_INPUT);
    const done = steps.filter((s) => s.message.startsWith("Rozděleno"));
    expect(done.length).toBeGreaterThan(0);
    expect(new Set(done.map((s) => s.line))).toEqual(new Set([L_CALL]));
    const second = steps.filter((s) => s.line === R_CALL);
    expect(second.length).toBe(done.length);
  });

  it("krok před druhým rekurzivním voláním ukazuje úsek a proměnné volajícího, ne potomka", () => {
    for (const input of [
      DEFAULT_INPUT,
      [5, 1, 4, 2, 3, 3, 2, 4, 1, 5],
      quickKiller(9),
    ]) {
      const steps = run(quickSort, input);
      // zásobník rozdělených úseků: „Rozděleno“ ukládá, krok na řádku druhého volání vybírá
      const stack: Record<string, string | number>[] = [];
      steps.forEach((s, k) => {
        if (s.message.startsWith("Rozděleno")) stack.push(s.state.vars);
        if (s.line !== R_CALL) return;
        const v = s.state.vars;
        expect(v, s.message).toEqual(stack.pop());
        expect(s.state.ranges).toEqual([
          {
            from: Number(v.l) - 1,
            to: Number(v.r) - 1,
            label: `úsek ${v.l}–${v.r}`,
          },
        ]);
        expect(s.state.marks).toEqual({});
        // následuje volání na pravou část (i … r)
        const next = steps[k + 1].state.vars;
        expect([next.l, next.r, next.hloubka]).toEqual([
          v.i,
          v.r,
          Number(v.hloubka) + 1,
        ]);
      });
      expect(stack).toEqual([]);
    }
  });

  it("po kroku „Rozděleno“ je levá část ≤ pivot ≤ pravá část a pravá část není prázdná", () => {
    for (const input of [...SMALL, ...WIDE]) {
      for (const s of run(quickSort, input)) {
        if (!s.message.startsWith("Rozděleno")) continue;
        const st = s.state;
        const [l, r, i, j] = [st.vars.l, st.vars.r, st.vars.i, st.vars.j].map(
          (x) => Number(x) - 1,
        );
        const p = Number(st.vars.p);
        expect(j).toBeLessThan(i);
        expect(i - j).toBeLessThanOrEqual(2);
        expect(i).toBeLessThanOrEqual(r);
        for (let k = l; k <= j; k++)
          expect(st.items[k].v).toBeLessThanOrEqual(p);
        for (let k = j + 1; k < i; k++) expect(st.items[k].v).toBe(p);
        for (let k = i; k <= r; k++)
          expect(st.items[k].v).toBeGreaterThanOrEqual(p);
      }
    }
  });

  it("pivot zůstává zvýrazněný po celé rozdělování (jezdec na něm má přednost)", () => {
    for (const input of [
      DEFAULT_INPUT,
      [5, 1, 4, 2, 3, 3, 2, 4, 1, 5],
      [2, 1],
    ]) {
      const steps = run(quickSort, input);
      let pivotId: number | null = null;
      let seen = 0;
      for (const s of steps) {
        if (s.line === 2) {
          const at = Object.entries(s.state.marks).find(
            ([, m]) => m === "pivot",
          )!;
          pivotId = s.state.items[Number(at[0])].id;
        } else if (s.message.startsWith("Rozděleno")) pivotId = null;
        if (pivotId === null) continue;
        seen++;
        const where = s.state.items.findIndex((it) => it.id === pivotId);
        expect(
          s.state.marks[where],
          `${input.join(" ")}: ${s.message}`,
        ).toBeDefined();
      }
      expect(seen).toBeGreaterThan(3);
    }
    // ve výchozím běhu je pivot vidět i během pohybu jezdců, ne jen ve dvou krocích
    const scan = run(quickSort, DEFAULT_INPUT).filter(
      (s) => s.line === 5 || s.line === 6,
    );
    expect(
      scan.every(
        (s) =>
          Object.values(s.state.marks).includes("pivot") ||
          Object.values(s.state.marks).includes("compare"),
      ),
    ).toBe(true);
    expect(
      scan.filter((s) => Object.values(s.state.marks).includes("pivot")).length,
    ).toBeGreaterThan(scan.length / 2);
  });

  it("poslední krok neukazuje proměnné posledního rekurzivního volání", () => {
    const steps = run(quickSort, DEFAULT_INPUT);
    expect(steps[steps.length - 1].state.vars).toEqual({ hloubka: 0 });
  });
});

/** najde ve zprávě interval P[a … b] s a > b */
function badInterval(message: string): boolean {
  for (const m of message.matchAll(/P\[(\d+) … (\d+)\]/g))
    if (Number(m[1]) > Number(m[2])) return true;
  return false;
}

/* ------------------------------------------------------------------ Heapsort */

describe("heap", () => {
  it("po stavbě haldy i po každém BubbleDown při vybírání platí haldové uspořádání na aktuální haldě", () => {
    for (const input of SMALL) {
      const n = input.length;
      const steps = run(heapSort, input);
      steps.forEach((s, k) => {
        const next = steps[k + 1];
        // stav těsně před dalším „Prohodíme x_1 s x_i“ (řádek 3) nebo před „Hotovo.“ = halda je opravená
        const repaired =
          s.line === 2 ||
          (next !== undefined && (next.line === 3 || next.line === null));
        if (!repaired) return;
        const a = vals(s.state);
        const m = n - s.state.sorted.length;
        for (let i = 1; i < m; i++)
          expect(
            a[Math.floor((i - 1) / 2)],
            `[${input.join(" ")}]: ${s.message}`,
          ).toBeGreaterThanOrEqual(a[i]);
      });
    }
  });

  it("svorka „halda“ má vždy tolik prvků, kolik jich ještě není na místě", () => {
    const steps = run(heapSort, DEFAULT_INPUT);
    for (const s of steps.slice(0, -1)) {
      expect(s.state.ranges).toEqual([
        {
          from: 0,
          to: DEFAULT_INPUT.length - s.state.sorted.length - 1,
          label: "halda",
        },
      ]);
    }
  });

  it("zprávy: jediný syn se nenazývá „větší“, počet prvků haldy je správně skloňovaný", () => {
    const msgs = run(heapSort, [1, 2, 3, 4]).map((s) => s.message);
    expect(msgs).toContain("Vrchol 2 má jediného syna 4.");
    expect(msgs).toContain("Syn je x_4 = 4. Je x_2 = 2 větší?");
    expect(msgs.some((m) => m.endsWith("halda má teď 3 prvky."))).toBe(true);
    expect(msgs.some((m) => m.endsWith("halda má teď 1 prvek."))).toBe(true);
    expect(msgs.join(" ")).not.toMatch(/Syn\(ové\)/);
  });
});

/* ------------------------------------------------------------------ Counting sort */

describe("counting", () => {
  it("počítadla po fázi počítání odpovídají četnostem a je jich r = největší hodnota", () => {
    for (const input of SMALL) {
      const s = run(countingSort, input).find((x) => x.line === 3)!;
      const counts = s.state.aux!.items.map((i) => i!.v);
      expect(counts.length).toBe(Math.max(...input));
      counts.forEach((c, k) =>
        expect(c).toBe(input.filter((v) => v === k + 1).length),
      );
    }
  });

  it("výstup se zapisuje zleva do téhož pole: zapsaná část je setříděná, zbytek je dosud nepřepsaný vstup", () => {
    for (const input of [[3, 1, 2], DEFAULT_SMALL_INPUT, [2, 2, 1, 9, 1]]) {
      const sorted = ref(input);
      for (const s of run(countingSort, input)) {
        const done = s.state.sorted.length;
        expect(s.state.sorted).toEqual(
          Array.from({ length: done }, (_, k) => k),
        );
        expect(vals(s.state), s.message).toEqual([
          ...sorted.slice(0, done),
          ...input.slice(done),
        ]);
      }
    }
  });

  it("výstupní fáze projde každé počítadlo, i nulové (Θ(n + r)), a zprávy jsou správně skloňované", () => {
    const steps = run(countingSort, [4, 1, 4]);
    const perCounter = steps.filter((s) => s.line === 5);
    expect(perCounter.map((s) => s.state.vars.i)).toEqual([1, 2, 3, 4]);
    expect(perCounter.map((s) => s.message)).toEqual([
      "p_1 = 1: hodnotu 1 zapíšeme 1×.",
      "p_2 = 0: hodnota 2 ve vstupu není, nic nezapisujeme.",
      "p_3 = 0: hodnota 3 ve vstupu není, nic nezapisujeme.",
      "p_4 = 2: hodnotu 4 zapíšeme 2×.",
    ]);
    expect(steps[0].message).toBe(
      "Největší hodnota ve vstupu je r = 4: vynulujeme 4 počítadla.",
    );
    expect(run(countingSort, [1])[0].message).toContain(
      "vynulujeme 1 počítadlo.",
    );
    expect(run(countingSort, [9, 1])[0].message).toContain(
      "vynulujeme 9 počítadel.",
    );
  });
});

/* ------------------------------------------------------------------ čistá logika stránky */

describe("stránka třídění – pomocná logika", () => {
  it("sameNumbers: stejný obsah v jiné instanci pole se nepovažuje za změnu vstupu", () => {
    expect(sameNumbers([3, 1, 2], [3, 1, 2])).toBe(true);
    expect(sameNumbers([], [])).toBe(true);
    expect(sameNumbers([3, 1, 2], [3, 2, 1])).toBe(false);
    expect(sameNumbers([3, 1], [3, 1, 2])).toBe(false);
    expect(sameNumbers([3, 1, 2], [3, 1])).toBe(false);
  });

  it("scaleMax: největší konečná hodnota, nejméně 1, i pro obří pole (bez Math.max(...pole))", () => {
    expect(scaleMax([38, 27, 82])).toBe(82);
    expect(scaleMax([])).toBe(1);
    expect(scaleMax([-5, -1])).toBe(1);
    expect(scaleMax([0.5, null, undefined, NaN, Infinity])).toBe(1);
    expect(scaleMax(Array.from({ length: 300_000 }, (_, i) => i))).toBe(
      299_999,
    );
  });

  it("layoutOf: Mergesort rezervuje pomocné pole Z i svorky, Bubblesort nic", () => {
    const merge = layoutOf(run(mergeSort, DEFAULT_INPUT));
    expect(merge.aux?.label).toBe("Z (výsledek slévání)");
    expect(merge.ranges).toBe(true);
    expect(layoutOf(run(bubbleSort, DEFAULT_INPUT))).toEqual({
      aux: null,
      auxMax: 1,
      ranges: false,
    });
    expect(layoutOf(run(quickSort, DEFAULT_INPUT))).toEqual({
      aux: null,
      auxMax: 1,
      ranges: true,
    });
  });

  it("layoutOf: měřítko počítadel Counting sortu je stálé = největší konečná četnost", () => {
    const l = layoutOf(run(countingSort, [2, 2, 1, 9, 2]));
    expect(l.auxMax).toBe(3);
    expect(l.aux?.label).toBe("počítadla p_1 … p_r");
    // odmítnutý vstup žádné pomocné pole nemá
    expect(layoutOf(materialize(countingSort.run(DEFAULT_INPUT)))).toEqual({
      aux: null,
      auxMax: 1,
      ranges: false,
    });
  });

  it("plural: české skloňování po číslovce", () => {
    expect(
      [0, 1, 2, 4, 5, 12].map((n) => plural(n, "prvek", "prvky", "prvků")),
    ).toEqual(["prvků", "prvek", "prvky", "prvky", "prvků", "prvků"]);
  });
});
