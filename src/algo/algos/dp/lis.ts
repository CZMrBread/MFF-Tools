/**
 * Nejdelší rostoucí podposloupnost – algoritmus Nrp2 (Průvodce 12.2, str. 303) jako generátor kroků
 * a výpis řešení po odkazech P (text str. 304: „P[0] říká, jaký prvek je v optimálním řešení první,
 * P[P[0]] udává druhý a tak dále“). Čisté funkce bez Reactu (testy v lis.test.ts).
 */
import { formatMinus } from "../../core/format";
import { snap, type StepGen } from "../../core/steps";

/** pseudokód Nrp2 (str. 303) + výpis řešení podle textu str. 304 */
export const PC_NRP2 = [
  "x_0 ← −∞",
  "Pro i = n, n − 1, …, 0:   // všechny možné začátky NRP",
  "  T[i] ← 1",
  "  P[i] ← 0   // bude se později hodit pro výpis řešení",
  "  Pro j = i + 1, …, n:   // všechna možná pokračování",
  "    Pokud x_i < x_j a T[i] < 1 + T[j]:   // máme lepší řešení",
  "      T[i] ← 1 + T[j]",
  "      P[i] ← j",
  "Výstup: délka T[0] nejdelší rostoucí podposloupnosti",
  "Výpis řešení (str. 304): k ← P[0]",
  "  Dokud k ≠ 0: vypíšeme x_k, k ← P[k]",
];

/** řádky pseudokódu (0-based) */
export const LIS_LINE = {
  init: 0,
  setT1: 2,
  setP0: 3,
  test: 5,
  setT: 6,
  setP: 7,
  out: 8,
  walkStart: 9,
  walk: 10,
} as const;

/** výsledek porovnání na ř. 6: lepší pokračování / x_j nenavazuje / navazuje, ale není lepší */
export type LisVerdict = "better" | "notAbove" | "notBetter";

export interface LisState {
  /** x[0] = −∞, x[1 … n] vstup */
  x: number[];
  /** T[i] = délka NRP začínající x_i (null = ještě nespočítáno) */
  T: (number | null)[];
  /** P[i] = index druhého prvku té NRP (0 = žádný) */
  P: (number | null)[];
  i: number | null;
  j: number | null;
  /** výsledek posledního porovnání (jen v kroku ř. 6) */
  verdict: LisVerdict | null;
  /** vypsané indexy řešení (bez x₀) */
  chain: number[];
  /** aktuální k výpisu */
  k: number | null;
  /** běh doběhl (výpis hotový) */
  done: boolean;
  /** buňka změněná tímto krokem: T[i] nebo P[i] (podbarvení „nové“) */
  fresh: "T" | "P" | null;
}

/** x_i do zprávy: x_{13} = 43 */
const xi = (i: number) => (i < 10 ? `x_${i}` : `x_{${i}}`);
const num = (v: number) => formatMinus(v);

/** Nrp2 bez kroků: T a P jako v obr. 12.3. */
export function nrp2(values: readonly number[]): { T: number[]; P: number[] } {
  const x = [-Infinity, ...values];
  const n = values.length;
  const T: number[] = Array(n + 1).fill(1);
  const P: number[] = Array(n + 1).fill(0);
  for (let i = n; i >= 0; i--)
    for (let j = i + 1; j <= n; j++)
      if (x[i] < x[j] && T[i] < 1 + T[j]) {
        T[i] = 1 + T[j];
        P[i] = j;
      }
  return { T, P };
}

/** Indexy řešení po odkazech P od P[0] (bez x₀). */
export function lisChain(P: readonly (number | null)[], from = 0): number[] {
  const out: number[] = [];
  let k = P[from] ?? 0;
  while (k !== 0 && out.length < P.length) {
    out.push(k);
    k = P[k] ?? 0;
  }
  return out;
}

/** Hodnoty řešení „3, 14, 15“ */
export function chainText(x: readonly number[], chain: readonly number[]) {
  return chain.map((k) => num(x[k])).join(", ");
}

export function* nrp2Steps(values: readonly number[]): StepGen<LisState> {
  const n = values.length;
  const st: LisState = {
    x: [-Infinity, ...values],
    T: Array(n + 1).fill(null),
    P: Array(n + 1).fill(null),
    i: null,
    j: null,
    verdict: null,
    chain: [],
    k: null,
    done: false,
    fresh: null,
  };
  const { x, T, P } = st;
  yield snap(
    st,
    LIS_LINE.init,
    `x_0 ← −∞: dodefinovaný prvek, který v optimálním řešení určitě leží. Tabulku T vyplníme od konce (i = ${n}, …, 0).`,
  );
  for (let i = n; i >= 0; i--) {
    st.i = i;
    st.j = null;
    st.verdict = null;
    T[i] = 1;
    st.fresh = "T";
    yield snap(
      st,
      LIS_LINE.setT1,
      `i = ${i}: T[${i}] ← 1 – podposloupnost ze samotného ${xi(i)} = ${num(x[i])}.`,
    );
    P[i] = 0;
    st.fresh = "P";
    yield snap(
      st,
      LIS_LINE.setP0,
      i === n
        ? `P[${i}] ← 0. Za ${xi(i)} už nic není – T[${i}] = 1 je hotové.`
        : `P[${i}] ← 0 (zatím žádné pokračování); zkusíme všechna j = ${i + 1}, …, ${n}.`,
    );
    for (let j = i + 1; j <= n; j++) {
      st.j = j;
      st.fresh = null;
      const ti = T[i] as number;
      const tj = T[j] as number;
      const head = `${xi(i)} = ${num(x[i])}, ${xi(j)} = ${num(x[j])}`;
      if (!(x[i] < x[j])) {
        st.verdict = "notAbove";
        yield snap(
          st,
          LIS_LINE.test,
          `${head}: ${num(x[i])} ≥ ${num(x[j])}, ${xi(j)} na ${xi(i)} nenavazuje.`,
        );
        continue;
      }
      if (!(ti < 1 + tj)) {
        st.verdict = "notBetter";
        yield snap(
          st,
          LIS_LINE.test,
          `${head}: navazuje, ale T[${i}] = ${ti} ≥ 1 + T[${j}] = ${1 + tj} – nic lepšího.`,
        );
        continue;
      }
      st.verdict = "better";
      yield snap(
        st,
        LIS_LINE.test,
        `${head}: ${num(x[i])} < ${num(x[j])} a T[${i}] = ${ti} < 1 + T[${j}] = ${1 + tj} – máme lepší řešení.`,
      );
      st.verdict = null;
      T[i] = 1 + tj;
      st.fresh = "T";
      yield snap(
        st,
        LIS_LINE.setT,
        `T[${i}] ← 1 + T[${j}] = ${T[i]}: ${xi(i)} a za ním NRP začínající ${xi(j)}.`,
      );
      P[i] = j;
      st.fresh = "P";
      yield snap(
        st,
        LIS_LINE.setP,
        `P[${i}] ← ${j}: druhý prvek té podposloupnosti je ${xi(j)}.`,
      );
    }
    st.verdict = null;
    st.fresh = null;
  }
  st.i = null;
  st.j = null;
  const len = (T[0] as number) - 1;
  yield snap(
    st,
    LIS_LINE.out,
    `Výstup: T[0] = ${T[0]}, NRP má délku T[0] − 1 = ${len} (x_0 = −∞ do ní nepočítáme).`,
  );
  st.k = 0;
  yield snap(
    st,
    LIS_LINE.walkStart,
    len === 0
      ? "Výpis řešení: P[0] = 0 – posloupnost je prázdná."
      : `Výpis řešení: k ← P[0] = ${P[0]}.`,
  );
  let k = P[0] as number;
  while (k !== 0) {
    st.k = k;
    st.chain.push(k);
    const next = P[k] as number;
    yield snap(
      st,
      LIS_LINE.walk,
      `Vypíšeme ${xi(k)} = ${num(x[k])}; k ← P[${k}] = ${next}${next === 0 ? " – konec" : ""}.`,
    );
    k = next;
  }
  st.k = null;
  st.done = true;
  yield snap(
    st,
    null,
    len === 0
      ? "Hotovo – prázdná posloupnost nemá žádnou rostoucí podposloupnost."
      : `Hotovo – nejdelší rostoucí podposloupnost: ${chainText(x, st.chain)} (délka ${len}).`,
  );
}
