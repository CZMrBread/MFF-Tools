import { snap, type StepGen } from "../../core/steps";
import {
  allIndices,
  finished,
  fresh,
  reject,
  SWAPS,
  type Mark,
  type SortAlgorithm,
  type SortState,
} from "./types";

/**
 * Quicksort s rozdělováním dvěma jezdci (QuickSort2 z Průvodce, odd. 10.7), pivot = prostřední prvek.
 * Rekurze jde vždy nejdřív do levé a pak do pravé části, zásobník proto může narůst až na n − 1 úrovní.
 */
export const quickSort: SortAlgorithm = {
  id: "quick",
  name: "Quicksort",
  title: "Quicksort",
  description:
    "Zvolíme pivot a prvky přerozdělíme tak, aby vlevo byly prvky ≤ pivot a vpravo ≥ pivot. Obě části setřídíme rekurzivně. V průměru Θ(n log n), v nejhorším případě (nešťastné pivoty) Θ(n²). Proměnná hloubka ukazuje zanoření rekurze: obvykle je logaritmické, při nešťastných pivotech ale až n − 1. Aby zásobník zůstal vždy logaritmický, stačí rekurzivně volat jen menší část a větší zpracovat cyklem.",
  complexity: {
    time: "Θ(n log n) v průměru, Θ(n²) nejhůře",
    space: "Θ(log n) v průměru, Θ(n) nejhůře (zásobník rekurze)",
    stable: false,
  },
  moves: SWAPS,
  tip: "„Vytvořit ▸ Mnoho duplicit“ – jezdci se zastaví i na prvku rovném pivotu, úseky se proto dělí napůl. Sledujte proměnnou hloubka.",
  legend: {
    pivot: "pivot p",
    bound: "jezdec i / j",
    compare: "porovnávaný s pivotem",
    swap: "prohozené",
    sorted: "na správném místě",
  },
  pseudocode: [
    "QuickSort(l, r):",
    "  Pokud l ≥ r, skončíme.",
    "  p ← P[⌊(l + r)/2⌋]   // pivot",
    "  i ← l, j ← r",
    "  Dokud i ≤ j:",
    "    Dokud P[i] < p: i ← i + 1",
    "    Dokud P[j] > p: j ← j − 1",
    "    Pokud i < j: prohodíme P[i] a P[j].",
    "    Pokud i ≤ j: i ← i + 1, j ← j − 1",
    "  QuickSort(l, j)",
    "  QuickSort(i, r)",
  ],
  *run(input): StepGen<SortState> {
    const bad = reject(input);
    if (bad) {
      yield bad;
      return;
    }
    const st = fresh(input);
    const n = st.items.length;
    const a = st.items;

    function* qs(l: number, r: number, depth: number): StepGen<SortState> {
      // prázdný úsek (l > r): podle pseudokódu se volání hned vrátí – není co ukazovat ani kreslit
      if (l > r) return;
      const range = [{ from: l, to: r, label: `úsek ${l + 1}–${r + 1}` }];
      st.ranges = range;
      st.vars = { l: l + 1, r: r + 1, hloubka: depth };
      st.marks = {};
      if (l === r) {
        st.sorted.push(l);
        yield snap(
          st,
          1,
          `Úsek P[${l + 1}] má jediný prvek (l ≥ r) – je setříděný, končíme.`,
        );
        return;
      }
      yield snap(st, 0, `Třídíme úsek P[${l + 1} … ${r + 1}].`);
      const pIdx = Math.floor((l + r) / 2);
      const pivotId = a[pIdx].id;
      const p = a[pIdx].v;
      st.vars.p = p;

      /**
       * Značky kroku. Pivota hledáme podle identity prvku (při prohazování se stěhuje) a necháváme
       * ho zvýrazněného po celé rozdělování; značka jezdce / porovnání / prohození má přednost.
       */
      const marks = (extra: Record<number, Mark>): Record<number, Mark> => {
        const out: Record<number, Mark> = {};
        for (let k = l; k <= r; k++) if (a[k].id === pivotId) out[k] = "pivot";
        for (const [key, m] of Object.entries(extra)) {
          const k = Number(key);
          if (k >= l && k <= r) out[k] = m; // jezdec, který právě vyjel z úseku, se nekreslí
        }
        return out;
      };

      st.marks = marks({});
      yield snap(
        st,
        2,
        `Pivot p = P[${pIdx + 1}] = ${p} (prostřední prvek úseku).`,
      );
      let i = l;
      let j = r;
      // každé vyhodnocení podmínky jezdce je jedno porovnání s pivotem (i to, které jezdce zastaví)
      const less = () => {
        st.stats.cmp++;
        return a[i].v < p;
      };
      const greater = () => {
        st.stats.cmp++;
        return a[j].v > p;
      };
      st.vars.i = i + 1;
      st.vars.j = j + 1;
      st.marks = marks({ [i]: "bound", [j]: "bound" });
      yield snap(st, 3, "Jezdci i a j startují na krajích úseku.");
      while (i <= j) {
        // meze i ≤ r a j ≥ l jsou jen pojistka: pro čísla se jezdec vždy zastaví nejpozději o pivot
        while (i <= r && less()) {
          st.marks = marks({ [j]: "bound", [i]: "compare" });
          yield snap(st, 5, `P[${i + 1}] = ${a[i].v} < ${p}, i jde doprava.`);
          i++;
          st.vars.i = i + 1;
        }
        while (j >= l && greater()) {
          st.marks = marks({ [i]: "bound", [j]: "compare" });
          yield snap(st, 6, `P[${j + 1}] = ${a[j].v} > ${p}, j jde doleva.`);
          j--;
          st.vars.j = j + 1;
        }
        if (i < j) {
          st.marks = marks({ [i]: "compare", [j]: "compare" });
          yield snap(
            st,
            7,
            `Jezdci se zastavili: P[${i + 1}] = ${a[i].v} ≥ ${p} a P[${j + 1}] = ${a[j].v} ≤ ${p}. Je i < j, prohodíme je.`,
          );
          const t = a[i];
          a[i] = a[j];
          a[j] = t;
          st.stats.moves++;
          st.marks = marks({ [i]: "swap", [j]: "swap" });
          yield snap(st, 7, `Prohodili jsme ${a[j].v} a ${a[i].v}.`);
        } else if (i === j) {
          st.marks = marks({ [i]: "compare" });
          yield snap(
            st,
            7,
            `Jezdci se potkali na P[${i + 1}] = ${a[i].v} (i = j) – není co prohazovat.`,
          );
        }
        if (i <= j) {
          i++;
          j--;
          st.vars.i = i + 1;
          st.vars.j = j + 1;
          st.marks = marks({ [i]: "bound", [j]: "bound" });
          yield snap(st, 8, `Posuneme oba jezdce: i = ${i + 1}, j = ${j + 1}.`);
        }
      }
      st.marks = {};
      // prvek mezi j a i (nejvýš jeden) je roven pivotu a leží už na svém místě
      for (let k = j + 1; k < i; k++) st.sorted.push(k);
      const left =
        j > l
          ? `vlevo P[${l + 1} … ${j + 1}] ≤ ${p}`
          : j === l
            ? `vlevo jediný prvek P[${l + 1}] ≤ ${p}`
            : "levá část je prázdná";
      const right =
        i < r
          ? `vpravo P[${i + 1} … ${r + 1}] ≥ ${p}`
          : i === r
            ? `vpravo jediný prvek P[${r + 1}] ≥ ${p}`
            : "pravá část je prázdná";
      const middle =
        i - j > 1 ? ` P[${j + 2}] = ${p} mezi nimi je už na svém místě.` : "";
      const next = j >= l ? " Nejdřív rekurzivně setřídíme levou část." : "";
      yield snap(
        st,
        9,
        `Rozděleno (jezdci se minuli): ${left}, ${right}.${middle}${next}`,
      );
      yield* qs(l, j, depth + 1);

      // potomek přepsal úsek i proměnné – před druhým voláním obnovíme pohled tohoto volání
      st.ranges = range;
      st.vars = { l: l + 1, r: r + 1, hloubka: depth, p, i: i + 1, j: j + 1 };
      st.marks = {};
      const done =
        j > l
          ? `Levá část P[${l + 1} … ${j + 1}] je setříděná. `
          : j === l
            ? `Levá část P[${l + 1}] je setříděná. `
            : "";
      const todo =
        i < r
          ? `pravou část P[${i + 1} … ${r + 1}]`
          : i === r
            ? `pravou část P[${r + 1}]`
            : "prázdnou pravou část";
      yield snap(st, 10, `${done}Teď rekurzivně setřídíme ${todo}.`);
      yield* qs(i, r, depth + 1);
    }

    yield* qs(0, n - 1, 0);
    st.ranges = [];
    st.marks = {};
    st.sorted = allIndices(n);
    st.vars = { hloubka: 0 };
    yield snap(st, null, finished(st, SWAPS));
  },
};
