import { snap, type StepGen } from "../../core/steps";
import {
  allIndices,
  errorStep,
  finished,
  fresh,
  plural,
  reject,
  SWAPS,
  type Item,
  type MovesName,
  type SortAlgorithm,
  type SortState,
} from "./types";

/* ------------------------------------------------------------------ Heapsort */

export const heapSort: SortAlgorithm = {
  id: "heap",
  name: "Heapsort",
  title: "Heapsort – třídění haldou",
  description:
    "Z pole vytvoříme maximovou haldu (v čase O(n)), pak opakovaně prohazujeme maximum z kořene na konec haldy a haldu o jeden prvek zkrátíme. Vrchol s indexem i má syny 2i a 2i+1. Svorka pod polem ukazuje aktuální velikost haldy.",
  complexity: { time: "Θ(n log n)", space: "Θ(1)", stable: false },
  moves: SWAPS,
  tip: "„Vytvořit ▸ Setříděné“ – stavba maximové haldy vzestupné pole nejdřív celé přeháže, takže Heapsortu setříděný vstup nepomůže.",
  legend: {
    active: "vrchol i",
    compare: "synové vrcholu i",
    min: "větší syn s",
    swap: "prohozené",
    sorted: "na správném místě (mimo haldu)",
  },
  pseudocode: [
    "Pro i = ⌊n/2⌋, …, 1:   // vytvoříme maximovou haldu",
    "  BubbleDown(n, i)",
    "Pro i = n, …, 2:",
    "  Prohodíme x_1 s x_i.   // maximum na správné místo",
    "  BubbleDown(i − 1, 1)   // opravíme haldu",
    "",
    "BubbleDown(m, i):",
    "  Dokud 2i ≤ m:",
    "    s ← 2i; pokud s+1 ≤ m a x_{s+1} > x_s: s ← s + 1",
    "    Pokud x_i > x_s, skončíme.",
    "    Prohodíme x_i a x_s; i ← s",
  ],
  *run(input): StepGen<SortState> {
    const bad = reject(input);
    if (bad) {
      yield bad;
      return;
    }
    const st = fresh(input);
    const n = st.items.length;
    const x = st.items;

    function* bubbleDown(m: number, i: number): StepGen<SortState> {
      // i, m 0-based; m = počet prvků haldy
      while (2 * i + 1 < m) {
        let s = 2 * i + 1;
        const two = s + 1 < m;
        st.marks = { [i]: "active", [s]: "compare" };
        if (two) st.marks[s + 1] = "compare";
        yield snap(
          st,
          8,
          two
            ? `Synové vrcholu ${i + 1} jsou ${s + 1} a ${s + 2}.`
            : `Vrchol ${i + 1} má jediného syna ${s + 1}.`,
        );
        if (two) st.stats.cmp++;
        if (two && x[s + 1].v > x[s].v) s++;
        st.marks = { [i]: "active", [s]: "min" };
        st.stats.cmp++;
        yield snap(
          st,
          9,
          `${two ? "Větší syn" : "Syn"} je x_${s + 1} = ${x[s].v}. Je x_${i + 1} = ${x[i].v} větší?`,
        );
        if (x[i].v > x[s].v) {
          yield snap(st, 9, "Ano – haldové uspořádání platí, končíme.");
          break;
        }
        const t = x[i];
        x[i] = x[s];
        x[s] = t;
        st.stats.moves++;
        st.marks = { [i]: "swap", [s]: "swap" };
        yield snap(
          st,
          10,
          `Ne – prohodíme ${x[s].v} a ${x[i].v} a pokračujeme z vrcholu ${s + 1}.`,
        );
        i = s;
      }
    }

    st.ranges = [{ from: 0, to: n - 1, label: "halda" }];
    st.vars = { fáze: "stavba haldy" };
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      st.vars = { i: i + 1, fáze: "stavba haldy" };
      st.marks = { [i]: "active" };
      yield snap(st, 1, `BubbleDown z vrcholu ${i + 1}.`);
      yield* bubbleDown(n, i);
    }
    st.marks = {};
    yield snap(st, 2, "Pole je maximová halda, v kořeni je maximum.");
    for (let i = n - 1; i >= 1; i--) {
      st.vars = { i: i + 1, fáze: "vybírání maxima" };
      const t = x[0];
      x[0] = x[i];
      x[i] = t;
      st.stats.moves++;
      st.marks = { 0: "swap", [i]: "swap" };
      st.ranges = [{ from: 0, to: i - 1, label: "halda" }];
      st.sorted.push(i);
      yield snap(
        st,
        3,
        `Maximum ${x[i].v} přesuneme na pozici ${i + 1}; halda má teď ${i} ${plural(i, "prvek", "prvky", "prvků")}.`,
      );
      yield* bubbleDown(i, 0);
    }
    st.sorted = allIndices(n);
    st.marks = {};
    st.ranges = [];
    st.vars = { fáze: "hotovo" };
    yield snap(st, null, finished(st, SWAPS));
  },
};

/* ------------------------------------------------------------------ Counting sort */

const WRITES: MovesName = {
  label: "zápisy",
  forms: ["zápis", "zápisy", "zápisů"],
};

/** Největší hodnota, pro kterou Counting sort ukazujeme (počítadla se musí vejít na plátno). */
const COUNTING_MAX = 9;

export const countingSort: SortAlgorithm = {
  id: "counting",
  name: "CountingSort",
  title: "Counting sort – třídění počítáním",
  description: `Pro celá čísla z malého rozsahu 1 … r (zde nejvýše ${COUNTING_MAX}): spočítáme výskyty každé hodnoty a pak hodnoty vypíšeme v pořadí. Nic neporovnáváme, proto se na algoritmus nevztahuje dolní mez Ω(n log n) pro porovnávací třídění. Pomocné pole ukazuje počítadla p_1 … p_r. Po spočítání už vstup nepotřebujeme, výstup proto zapisujeme zleva do téhož pole (zeleně).`,
  complexity: { time: "Θ(n + r)", space: "Θ(r)", stable: true },
  inputMax: COUNTING_MAX,
  moves: WRITES,
  tip: "„Vytvořit ▸ Mnoho duplicit“ a sledujte počítadla pod plátnem – porovnání zůstane 0 a počítadel p_i je pořád r, ne n.",
  legend: {
    active: "právě počítaný prvek x_i",
    swap: "zvýšené počítadlo / zapsaný v_j",
    compare: "vypisované počítadlo p_i",
    sorted: "zapsaný výstup",
  },
  pseudocode: [
    "Pro i = 1, …, r: p_i ← 0   // počítadla",
    "Pro i = 1, …, n:",
    "  p_{x_i} ← p_{x_i} + 1",
    "j ← 1   // pozice ve výstupu",
    "Pro i = 1, …, r:",
    "  Opakujeme p_i-krát:",
    "    v_j ← i; j ← j + 1",
    "Výstup: setříděná posloupnost v",
  ],
  *run(input): StepGen<SortState> {
    const bad = reject(input);
    if (bad) {
      yield bad;
      return;
    }
    const st = fresh(input);
    const n = st.items.length;
    // stejný limit, jaký hlásí stránka (inputMax) – jinak by se počítadla nevešla na plátno
    const wrong = [
      ...new Set(
        input.filter((v) => !Number.isInteger(v) || v < 1 || v > COUNTING_MAX),
      ),
    ];
    if (wrong.length > 0) {
      const list =
        wrong.slice(0, 3).join(", ") + (wrong.length > 3 ? ", …" : "");
      yield errorStep(
        st,
        `Counting sort tu ukazujeme jen pro celá čísla 1 … ${COUNTING_MAX}, ve vstupu je ale ${list}. Zadejte prosím hodnoty z tohoto rozsahu.`,
      );
      return;
    }
    const r = Math.max(...input);
    const counts: Item[] = Array.from({ length: r }, (_, k) => ({
      id: 1000 + k,
      v: 0,
    }));
    st.aux = { label: "počítadla p_1 … p_r", items: counts, marks: {} };
    st.vars = { r };
    yield snap(
      st,
      0,
      `Největší hodnota ve vstupu je r = ${r}: vynulujeme ${r} ${plural(r, "počítadlo", "počítadla", "počítadel")}.`,
    );
    for (let i = 0; i < n; i++) {
      const v = st.items[i].v;
      counts[v - 1].v++;
      st.marks = { [i]: "active" };
      st.aux.marks = { [v - 1]: "swap" };
      st.vars = { r, i: i + 1, x_i: v };
      yield snap(
        st,
        2,
        `x_${i + 1} = ${v}, zvýšíme p_${v} na ${counts[v - 1].v}.`,
      );
    }
    st.marks = {};
    st.aux.marks = {};
    let j = 0;
    st.vars = { r, j: 1 };
    yield snap(
      st,
      3,
      "Počítadla jsou hotová – vstup už nepotřebujeme. Výstup budeme zapisovat od pozice j = 1 do téhož pole.",
    );
    const out: Item[] = [];
    for (let i = 0; i < r; i++) {
      const c = counts[i].v;
      st.marks = {};
      st.aux.marks = { [i]: "compare" };
      st.vars.i = i + 1;
      yield snap(
        st,
        5,
        c === 0
          ? `p_${i + 1} = 0: hodnota ${i + 1} ve vstupu není, nic nezapisujeme.`
          : `p_${i + 1} = ${c}: hodnotu ${i + 1} zapíšeme ${c}×.`,
      );
      for (let t = 0; t < c; t++) {
        // v_j ← i: přepíšeme j-tou buňku (identita = pozice, sloupec jen změní výšku); zbytek pole je dosud nepřepsaný vstup
        out.push({ id: j, v: i + 1 });
        st.items = [...out, ...st.items.slice(out.length)];
        st.sorted = out.map((_, k) => k);
        st.marks = { [j]: "swap" };
        st.stats.moves++;
        j++;
        st.vars.j = j + 1;
        yield snap(st, 6, `Zapíšeme v_${j} = ${i + 1}.`);
      }
    }
    st.marks = {};
    st.aux.marks = {};
    st.vars = { r };
    yield snap(st, 7, `${finished(st, WRITES)} Počítadel: r = ${r}.`);
  },
};
