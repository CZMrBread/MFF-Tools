import { snap, type StepGen } from "../../core/steps";
import {
  allIndices,
  finished,
  fresh,
  plural,
  reject,
  SWAPS,
  type MovesName,
  type SortAlgorithm,
  type SortState,
} from "./types";

/* Indexy v pseudokódu i v popiscích jsou 1-based (jako v Průvodci), interně 0-based. */

/** Prohodí dva prvky a započítá přesun. */
function swapItems(st: SortState, i: number, j: number) {
  const t = st.items[i];
  st.items[i] = st.items[j];
  st.items[j] = t;
  st.stats.moves++;
}

const SHIFTS: MovesName = {
  label: "posuny",
  forms: ["posun", "posuny", "posunů"],
};

/* ------------------------------------------------------------------ Bubblesort */

export const bubbleSort: SortAlgorithm = {
  id: "bubble",
  name: "Bubblesort",
  title: "Bubblesort – bublinkové třídění",
  description:
    "Opakovaně procházíme celé pole a prohazujeme sousední dvojice, které jsou ve špatném pořadí. Větší prvky „bublají“ na konec. Po k-tém průchodu je k největších prvků na svých místech (zeleně). Skončíme, jakmile průchod nic neprohodí. Základní verze, kterou tu krokujeme, přesto pokaždé kontroluje celé pole – zkrátit k-tý průchod o už hotový konec je snadné vylepšení.",
  complexity: { time: "Θ(n²)", space: "Θ(1)", stable: true },
  moves: SWAPS,
  tip: "„Vytvořit ▸ Setříděné“ – stačí jediný průchod bez prohození. Pak „Vytvořit ▸ Sestupné“: prohození je tolik, kolik je v poli inverzí.",
  legend: {
    compare: "porovnávaná dvojice",
    swap: "prohozená dvojice",
    sorted: "na správném místě",
  },
  pseudocode: [
    "pokračuj ← 1",
    "Dokud je pokračuj = 1:",
    "  pokračuj ← 0",
    "  Pro i = 1, …, n − 1:",
    "    Pokud je P[i] > P[i+1]:",
    "      Prohodíme P[i] a P[i+1].",
    "      pokračuj ← 1",
    "Výstup: setříděné pole P",
  ],
  *run(input): StepGen<SortState> {
    const bad = reject(input);
    if (bad) {
      yield bad;
      return;
    }
    const st = fresh(input);
    const n = st.items.length;
    let pass = 0;
    let cont = true;
    st.vars = { pokračuj: 1 };
    yield snap(
      st,
      0,
      "Začínáme – nastavíme příznak pokračuj, aby proběhl první průchod.",
    );
    while (cont) {
      pass++;
      st.vars = { pokračuj: 1, průchod: pass };
      yield snap(st, 1, `pokračuj = 1, začíná průchod č. ${pass}.`);
      cont = false;
      st.vars.pokračuj = 0;
      yield snap(st, 2, "Zatím jsme v tomto průchodu nic neprohodili.");
      // průchod jde vždy přes celé pole – přesně jako v pseudokódu („Pro i = 1, …, n − 1“)
      for (let i = 0; i + 1 < n; i++) {
        const a = st.items[i].v;
        const b = st.items[i + 1].v;
        st.marks = { [i]: "compare", [i + 1]: "compare" };
        st.vars.i = i + 1;
        st.stats.cmp++;
        if (a > b) {
          yield snap(
            st,
            4,
            `P[${i + 1}] = ${a} > P[${i + 2}] = ${b} – dvojice je ve špatném pořadí.`,
          );
          swapItems(st, i, i + 1);
          st.marks = { [i]: "swap", [i + 1]: "swap" };
          cont = true;
          st.vars.pokračuj = 1;
          yield snap(st, 5, `Prohodíme ${a} a ${b} a nastavíme pokračuj ← 1.`);
        } else {
          yield snap(
            st,
            4,
            `P[${i + 1}] = ${a} ≤ P[${i + 2}] = ${b} – dvojice je ve správném pořadí.`,
          );
        }
      }
      // lemma: po k-tém průchodu je k největších prvků na správných místech
      if (pass <= n) st.sorted.push(n - pass);
      st.marks = {};
      delete st.vars.i;
    }
    st.sorted = allIndices(n);
    yield snap(
      st,
      1,
      `pokračuj = 0: průchod č. ${pass} nic neprohodil, pole je tedy setříděné.`,
    );
    st.vars = { pokračuj: 0, průchod: pass };
    yield snap(st, 7, `${finished(st, SWAPS)} Průchodů: ${pass}.`);
  },
};

/* ------------------------------------------------------------------ Selectsort */

export const selectSort: SortAlgorithm = {
  id: "select",
  name: "Selectsort",
  title: "Selectsort – třídění výběrem",
  description:
    "V každém kroku najdeme nejmenší prvek v nesetříděné části a prohodíme ho na začátek této části. Setříděná část roste zleva.",
  complexity: { time: "Θ(n²)", space: "Θ(1)", stable: false },
  moves: SWAPS,
  tip: "„Vytvořit ▸ Setříděné“ a pak „Vytvořit ▸ Sestupné“ – porovnání je pokaždé stejně, n(n − 1)/2, prohození nejvýš n − 1.",
  legend: {
    active: "pozice i (sem patří minimum)",
    min: "zatím nejmenší P[m]",
    compare: "porovnávaný P[j]",
    swap: "prohozené",
    sorted: "na správném místě",
  },
  pseudocode: [
    "Pro i = 1, …, n − 1:",
    "  m ← i   // index nejmenšího dosud nalezeného prvku",
    "  Pro j = i + 1, …, n:",
    "    Pokud je P[j] < P[m]: m ← j",
    "  Prohodíme P[i] a P[m].",
    "Výstup: setříděné pole P",
  ],
  *run(input): StepGen<SortState> {
    const bad = reject(input);
    if (bad) {
      yield bad;
      return;
    }
    const st = fresh(input);
    const n = st.items.length;
    if (n === 1)
      yield snap(
        st,
        0,
        "Pole má jediný prvek – cyklus pro i = 1, …, n − 1 vůbec neproběhne.",
      );
    for (let i = 0; i < n - 1; i++) {
      let m = i;
      st.vars = { i: i + 1, m: m + 1 };
      st.marks = { [i]: "active", [m]: "min" };
      yield snap(
        st,
        1,
        `Hledáme minimum úseku P[${i + 1} … ${n}]; zatím m = ${i + 1}.`,
      );
      for (let j = i + 1; j < n; j++) {
        st.marks = { [i]: "active", [m]: "min", [j]: "compare" };
        st.vars.j = j + 1;
        st.stats.cmp++;
        yield snap(
          st,
          3,
          `Je P[${j + 1}] = ${st.items[j].v} < P[${m + 1}] = ${st.items[m].v}?`,
        );
        if (st.items[j].v < st.items[m].v) {
          m = j;
          st.vars.m = m + 1;
          st.marks = { [i]: "active", [m]: "min" };
          yield snap(st, 3, `Ano, nové minimum je na pozici ${m + 1}.`);
        }
      }
      // prohození prvku se sebou samým (minimum už je na místě) nepočítáme
      if (m !== i) swapItems(st, i, m);
      st.marks = m === i ? { [i]: "min" } : { [i]: "swap", [m]: "swap" };
      delete st.vars.j;
      yield snap(
        st,
        4,
        m === i
          ? `Minimum je už na místě ${i + 1}.`
          : `Prohodíme P[${i + 1}] a P[${m + 1}].`,
      );
      st.sorted.push(i);
    }
    // poslední prvek zbyl jako největší
    st.sorted.push(n - 1);
    st.marks = {};
    yield snap(st, 5, finished(st, SWAPS));
  },
};

/* ------------------------------------------------------------------ Insertsort */

/**
 * Svorka pod setříděným začátkem P[1 … len]. Zelená barva („na správném místě“) se pro něj nehodí –
 * prvky začátku se při dalším vkládání ještě posouvají. Popisek přidáme, jen když se pod svorku vejde
 * (plátno je široké 900 jednotek, znak popisku zabere zhruba 6,5), jinak by ho levý okraj uřízl.
 */
function sortedPrefix(len: number, n: number): SortState["ranges"] {
  const width = len * (900 / n);
  const label = ["setříděný začátek", "setříděno"].find(
    (l) => l.length * 6.5 <= width,
  );
  return [label ? { from: 0, to: len - 1, label } : { from: 0, to: len - 1 }];
}

export const insertSort: SortAlgorithm = {
  id: "insert",
  name: "Insertsort",
  title: "Insertsort – třídění vkládáním",
  description:
    "Pole dělíme na setříděný začátek (vyznačený svorkou pod polem) a nesetříděný zbytek. Každý další prvek zatřídíme na správné místo posouváním větších prvků doprava. Na téměř setříděných datech běží skoro lineárně.",
  complexity: { time: "Θ(n²), nejlepší Θ(n)", space: "Θ(1)", stable: true },
  moves: SHIFTS,
  tip: "„Vytvořit ▸ Téměř setříděné“ – Insertsort pak běží skoro lineárně. Počet posunů je přesně počet inverzí ve vstupu.",
  legend: {
    active: "zatřiďovaný prvek x",
    compare: "porovnávaný P[j]",
    swap: "posunutý doprava",
    sorted: "na správném místě",
  },
  pseudocode: [
    "Pro i = 2, …, n:",
    "  x ← P[i]   // prvek, který zatřiďujeme",
    "  j ← i − 1",
    "  Dokud j ≥ 1 a P[j] > x:",
    "    P[j+1] ← P[j]   // posuneme doprava",
    "    j ← j − 1",
    "  P[j+1] ← x",
    "Výstup: setříděné pole P",
  ],
  *run(input): StepGen<SortState> {
    const bad = reject(input);
    if (bad) {
      yield bad;
      return;
    }
    const st = fresh(input);
    const n = st.items.length;
    st.ranges = sortedPrefix(1, n);
    if (n > 1) st.vars = { i: 2 };
    yield snap(
      st,
      0,
      "Jednoprvkový začátek P[1] je setříděný. Další prvky do něj budeme postupně zatřiďovat.",
    );
    for (let i = 1; i < n; i++) {
      const x = st.items[i];
      st.vars = { i: i + 1, x: x.v };
      st.marks = { [i]: "active" };
      st.ranges = sortedPrefix(i, n);
      yield snap(
        st,
        1,
        `Zatřiďujeme x = P[${i + 1}] = ${x.v} do setříděného začátku P[1 … ${i}].`,
      );
      let j = i - 1;
      st.vars.j = j + 1;
      while (j >= 0) {
        st.marks = { [j]: "compare", [j + 1]: "active" };
        st.stats.cmp++;
        if (st.items[j].v <= x.v) {
          yield snap(
            st,
            3,
            `P[${j + 1}] = ${st.items[j].v} ≤ x = ${x.v} – dál už neposouváme.`,
          );
          break;
        }
        yield snap(
          st,
          3,
          `P[${j + 1}] = ${st.items[j].v} > x = ${x.v} – musí uhnout doprava.`,
        );
        st.items[j + 1] = st.items[j];
        st.items[j] = x;
        st.stats.moves++;
        st.marks = { [j]: "active", [j + 1]: "swap" };
        yield snap(st, 4, `Posuneme ${st.items[j + 1].v} na pozici ${j + 2}.`);
        j--;
        st.vars.j = j + 1;
      }
      st.marks = { [j + 1]: "active" };
      st.ranges = sortedPrefix(i + 1, n);
      yield snap(
        st,
        6,
        `Vložíme x = ${x.v} na pozici ${j + 2}. Setříděný začátek má teď ${i + 1} ${plural(i + 1, "prvek", "prvky", "prvků")}.`,
      );
    }
    st.marks = {};
    st.ranges = [];
    st.sorted = allIndices(n);
    yield snap(st, 7, finished(st, SHIFTS));
  },
};
