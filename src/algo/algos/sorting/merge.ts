import { snap, type StepGen } from "../../core/steps";
import {
  allIndices,
  finished,
  fresh,
  reject,
  type Item,
  type MovesName,
  type SortAlgorithm,
  type SortState,
} from "./types";

/** Svorky všech běhů délky b (poslední může být kratší). */
function runs(n: number, b: number): SortState["ranges"] {
  const out: SortState["ranges"] = [];
  for (let from = 0; from < n; from += b)
    out.push({ from, to: Math.min(from + b - 1, n - 1) });
  return out;
}

const TO_Z: MovesName = {
  label: "přesuny do Z",
  forms: ["přesun do Z", "přesuny do Z", "přesunů do Z"],
};

/**
 * Mergesort podle Průvodce (odd. 3.2): iterativní slévání běhů délky 1, 2, 4, …
 * Pomocné pole Z ukazuje právě slévaný výsledek.
 */
export const mergeSort: SortAlgorithm = {
  id: "merge",
  name: "Mergesort",
  title: "Mergesort – třídění sléváním",
  description:
    "Pole rozdělíme na setříděné běhy délky 1 a opakovaně sléváme sousední dvojice běhů do běhu dvojnásobné délky. Slévání dvou setříděných posloupností je lineární, iterací je log n. Svorky pod polem vyznačují aktuální běhy, při slévání dvojici X a Y.",
  complexity: { time: "Θ(n log n)", space: "Θ(n)", stable: true },
  moves: TO_Z,
  tip: "„Vytvořit ▸ Setříděné“ a pak „Vytvořit ▸ Sestupné“ – přesunů do Z je pokaždé stejně (závisí jen na n), mění se jen počet porovnání.",
  legend: {
    compare: "porovnávaná čela běhů",
    swap: "přesouvaný do Z",
    sorted: "na správném místě",
  },
  pseudocode: [
    "b ← 1   // aktuální délka běhu",
    "Dokud b < n:",
    "  i ← 1, j ← b + 1   // začátky sudého a lichého běhu",
    "  Dokud j ≤ n:",
    "    k ← min(j + b − 1, n)",
    "    (a_i … a_k) ← Merge((a_i … a_{j−1}), (a_j … a_k))",
    "    i ← i + 2b, j ← j + 2b",
    "  b ← 2b",
    "",
    "Merge(X, Y):",
    "  Dokud zbývají prvky v obou bězích:",
    "    Menší z čel X a Y přesuneme do Z.",
    "  Zbytek X nebo Y zkopírujeme do Z.",
  ],
  *run(input): StepGen<SortState> {
    const bad = reject(input);
    if (bad) {
      yield bad;
      return;
    }
    const st = fresh(input);
    const n = st.items.length;
    let b = 1;
    st.vars = { b };
    st.ranges = runs(n, b);
    yield snap(st, 0, "Každý prvek je běh délky 1.");
    while (b < n) {
      st.ranges = runs(n, b);
      yield snap(st, 1, `Sléváme sousední dvojice běhů délky b = ${b}.`);
      let i = 0;
      let j = b;
      while (j < n) {
        const k = Math.min(j + b - 1, n - 1);
        st.vars = { b, i: i + 1, j: j + 1, k: k + 1 };
        st.ranges = [
          { from: i, to: j - 1, label: "X" },
          { from: j, to: k, label: "Y" },
        ];
        st.marks = {};
        st.aux = {
          label: "Z (výsledek slévání)",
          offset: i,
          items: Array<Item | null>(k - i + 1).fill(null),
          marks: {},
        };
        yield snap(
          st,
          4,
          `Slijeme běhy X = a[${i + 1} … ${j}] a Y = a[${j + 1} … ${k + 1}].`,
        );

        // --- Merge ---
        const X = st.items.slice(i, j);
        const Y = st.items.slice(j, k + 1);
        let xi = 0;
        let yi = 0;
        let z = 0;
        while (xi < X.length && yi < Y.length) {
          st.aux.marks = {};
          st.marks = { [i + xi]: "compare", [j + yi]: "compare" };
          st.stats.cmp++;
          yield snap(
            st,
            10,
            `Porovnáme čela běhů: ${X[xi].v} (X) a ${Y[yi].v} (Y).`,
          );
          if (X[xi].v <= Y[yi].v) {
            st.aux.items[z] = X[xi];
            st.stats.moves++;
            st.aux.marks = { [z]: "swap" };
            st.marks = { [i + xi]: "swap" };
            yield snap(
              st,
              11,
              `${X[xi].v} ≤ ${Y[yi].v}, do Z přesuneme ${X[xi].v} z X.`,
            );
            xi++;
          } else {
            st.aux.items[z] = Y[yi];
            st.stats.moves++;
            st.aux.marks = { [z]: "swap" };
            st.marks = { [j + yi]: "swap" };
            yield snap(
              st,
              11,
              `${Y[yi].v} < ${X[xi].v}, do Z přesuneme ${Y[yi].v} z Y.`,
            );
            yi++;
          }
          z++;
        }
        while (xi < X.length) {
          st.aux.items[z] = X[xi];
          st.stats.moves++;
          st.aux.marks = { [z]: "swap" };
          st.marks = { [i + xi]: "swap" };
          yield snap(
            st,
            12,
            `Běh Y je vyčerpaný, do Z zkopírujeme ${X[xi].v} z X.`,
          );
          xi++;
          z++;
        }
        while (yi < Y.length) {
          st.aux.items[z] = Y[yi];
          st.stats.moves++;
          st.aux.marks = { [z]: "swap" };
          st.marks = { [j + yi]: "swap" };
          yield snap(
            st,
            12,
            `Běh X je vyčerpaný, do Z zkopírujeme ${Y[yi].v} z Y.`,
          );
          yi++;
          z++;
        }
        // zapíšeme výsledek zpět
        for (let t = 0; t < st.aux.items.length; t++)
          st.items[i + t] = st.aux.items[t]!;
        st.marks = {};
        st.aux.marks = {};
        yield snap(st, 5, `Slitý běh zapíšeme zpět do a[${i + 1} … ${k + 1}].`);
        st.aux = undefined;

        i += 2 * b;
        j += 2 * b;
      }
      b *= 2;
      st.vars = { b };
      // mezi sléváními ukazujeme všechny (už slité) běhy nové délky
      st.ranges = runs(n, b);
      yield snap(st, 7, `Zdvojnásobíme délku běhu: b = ${b}.`);
    }
    // svorka jediného běhu (celé pole) zůstane, dokud nezazní závěr – plátno nemění výšku
    st.ranges = runs(n, b);
    yield snap(st, 1, `b = ${b} ≥ n = ${n}: zbývá jediný běh, slévání končí.`);
    st.sorted = allIndices(n);
    st.ranges = [];
    yield snap(st, null, finished(st, TO_Z));
  },
};
