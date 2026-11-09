/**
 * Nerekurzivní FFT2 (Průvodce 17.5 „Nerekurzivní FFT“, str. 439) a motýlková síť obr. 17.4 (str. 438) –
 * čisté funkce a generátor kroků bez Reactu.
 *
 * Síť: vlevo vstupy v pořadí bitového zrcadlení r(k), pak log₂ n vrstev kroužků („hradel“). Vrstva
 * s velikostí bloku b spojí v každém bloku j řádky j+k a j+k+b motýlkem s α = ω^{(nk/2b) mod n}:
 * horní výstup s + α·ℓ, dolní s − α·ℓ (s = horní řádek bloku, ℓ = dolní). Číslo v kroužku je k, tedy
 * exponent lokální odmocniny ω_{2b} (vrstva 2: ω₄¹ = i = ω₈²) – stejně jako na obrázku.
 * Stav kroku nese hodnoty na drátech po každé vrstvě (`cols`), aktivní vrstvu, blok a motýlek.
 * Testy: fft2.test.ts (proti obr. 17.4, tabulce mezistavů a rekurzivní FFT z fft.ts).
 */
import { snap, type Step } from "../../core/steps";
import { subDigits, supDigits, type C } from "./complex";
import { FIELDS, type Field, type FieldId } from "./field";

/** Algoritmus FFT2, str. 439 (bez knižních čísel řádků; ◁ komentáře knihy za //). */
export const PC_FFT2 = [
  "Algoritmus FFT2(x_0, …, x_{n−1}, ω)   // komplexní čísla, primitivní n-tá odmocnina z jedné ω",
  "Předpočítáme tabulku hodnot ω^0, ω^1, …, ω^{n−1}.",
  "Pro k = 0, …, n − 1 položíme y_k ← x_{r(k)}, kde r je funkce bitového zrcadlení.",
  "b ← 1   // velikost bloku",
  "Dokud b < n, opakujeme:",
  "  Pro j = 0, …, n − 1 s krokem 2b opakujeme:   // začátek bloku",
  "    Pro k = 0, …, b − 1 opakujeme:   // pozice v bloku",
  "      α ← ω^{(nk/2b) mod n}",
  "      (y_{j+k}, y_{j+k+b}) ← (y_{j+k} + α · y_{j+k+b}, y_{j+k} − α · y_{j+k+b})",
  "  b ← 2b",
  "Výstup: y_0, …, y_{n−1}",
];

/* ------------------------------------------------------------------ struktura sítě */

export const log2 = (n: number): number => Math.round(Math.log2(n));

/** bitové zrcadlení: r(k) = k s obráceným pořadím log₂ n bitů */
export function bitReverse(n: number): number[] {
  const bits = log2(n);
  return Array.from({ length: n }, (_, k) => {
    let r = 0;
    for (let i = 0; i < bits; i++) r |= ((k >> i) & 1) << (bits - 1 - i);
    return r;
  });
}

/** jeden motýlek vrstvy: blok j, pozice k, řádky top = j+k, bot = j+k+b, α = ω^e */
export interface Gate2 {
  /** vrstva 1 … log₂ n */
  layer: number;
  b: number;
  j: number;
  k: number;
  top: number;
  bot: number;
  /** exponent α v ω_n: (nk/2b) mod n (ř. 7) */
  e: number;
}

/** Motýlky po vrstvách v pořadí algoritmu (bloky j, v bloku k). */
export function butterflies(n: number): Gate2[][] {
  const out: Gate2[][] = [];
  for (let b = 1, layer = 1; b < n; b *= 2, layer++) {
    const l: Gate2[] = [];
    for (let j = 0; j < n; j += 2 * b)
      for (let k = 0; k < b; k++)
        l.push({
          layer,
          b,
          j,
          k,
          top: j + k,
          bot: j + k + b,
          e: ((n * k) / (2 * b)) % n,
        });
    out.push(l);
  }
  return out;
}

/** Popisky kroužků obr. 17.4 po vrstvách a řádcích: „+k“ v řádku j+k, „−k“ v řádku j+k+b. */
export function gateLabels(n: number): string[][] {
  return butterflies(n).map((layer) => {
    const row = new Array<string>(n).fill("");
    for (const g of layer) {
      row[g.top] = "+" + g.k;
      row[g.bot] = "−" + g.k;
    }
    return row;
  });
}

/**
 * Dvojkové popisky nad dráty (obr. 17.4): sloupec c (0 = vstup, c = po vrstvě c) – podproblém v blocích
 * po 2^c řádcích počítá z indexů vstupu r(řádky bloku); popisky jsou tyto indexy vzestupně.
 */
export function wireLabels(n: number): string[][] {
  const bits = log2(n);
  const r = bitReverse(n);
  const bin = (v: number) => v.toString(2).padStart(bits, "0");
  return Array.from({ length: bits + 1 }, (_, col) => {
    const size = 2 ** col;
    const out: string[] = [];
    for (let start = 0; start < n; start += size)
      out.push(
        ...r
          .slice(start, start + size)
          .sort((a, b) => a - b)
          .map(bin),
      );
    return out;
  });
}

/* ------------------------------------------------------------------ čisté výpočty */

/** Hodnoty na drátech: [0] = po zrcadlení, [c] = po vrstvě c (poslední = výstup). */
export function fft2Layers(x: readonly C[], f: Field, inverse = false): C[][] {
  const n = x.length;
  const r = bitReverse(n);
  let y = r.map((k) => x[k]);
  const cols = [y];
  for (const layer of butterflies(n)) {
    y = [...y];
    for (const g of layer) {
      const al = f.mul(f.omega(n, g.e, inverse), y[g.bot]);
      const s = y[g.top];
      y[g.top] = f.add(s, al);
      y[g.bot] = f.sub(s, al);
    }
    cols.push(y);
  }
  return cols;
}

/** FFT2 – výstup sítě (n mocnina dvojky). */
export const fft2 = (x: readonly C[], f: Field, inverse = false): C[] =>
  fft2Layers(x, f, inverse).at(-1)!;

/* ------------------------------------------------------------------ kroky */

export type NetDetail = "bf" | "layer";

export interface NetState {
  field: FieldId;
  n: number;
  /** vstup x_0 … x_{n−1} (přirozené pořadí) */
  x: C[];
  /** hodnoty na drátech po sloupcích (0 = po zrcadlení, c = po vrstvě c); null = ještě nespočítané */
  cols: (C | null)[][];
  /** tabulka ω^0 … ω^{n−1} je předpočítaná (ř. 1) */
  table: boolean;
  /** aktivní vrstva 1 … log₂ n; 0 = zrcadlení vstupu; null = žádná */
  layer: number | null;
  b: number | null;
  /** začátek aktivního bloku */
  j: number | null;
  k: number | null;
  /** exponent α = ω^e */
  e: number | null;
  /** aktivní kroužky v aktivní vrstvě (řádky) */
  gates: number[];
  /** řádky, do kterých krok právě zapsal (ve sloupci `layer`) */
  wrote: number[];
  vars: Record<string, string>;
  result: C[] | null;
}

type Gen = Generator<Step<NetState>, void, unknown>;

const sub = (name: string, i: number) => name + subDigits(i);
/** ω s exponentem: ω⁰, ω² … */
const wPow = (e: number) => "ω" + supDigits(e);

/** „(0, 4, 2, …)“ */
const vec = (f: Field, v: readonly C[]) => "(" + v.map(f.fmt).join(", ") + ")";

/** hodnota v součinu / součtu: záporné a komplexní v závorce */
const par = (s: string) => (/^[^−].*[+−]|^−/.test(s) ? `(${s})` : s);

/**
 * Kroky FFT2 nad vstupem x (n mocnina dvojky). `detail`: „bf“ = každý blok a motýlek zvlášť (ř. 5, 7, 8),
 * „layer“ = celá vrstva jedním krokem ř. 8.
 */
export function* fft2Steps(
  x: readonly C[],
  field: FieldId,
  detail: NetDetail = "bf",
): Gen {
  const f = FIELDS[field];
  const n = x.length;
  const L = log2(n);
  const r = bitReverse(n);
  const omega = f.omega(n, 1, false);
  const st: NetState = {
    field,
    n,
    x: [...x],
    cols: Array.from({ length: L + 1 }, () =>
      new Array<C | null>(n).fill(null),
    ),
    table: false,
    layer: null,
    b: null,
    j: null,
    k: null,
    e: null,
    gates: [],
    wrote: [],
    vars: { n: String(n), ω: f.fmt(omega) },
    result: null,
  };
  const inField =
    field === "C"
      ? `, ω = exp(2πi/${n}) = ${f.fmt(omega)}`
      : ` v ℤ₁₇, ω = ${omega.re}`;
  yield snap(
    st,
    0,
    `FFT2 pro n = ${n}${inField}: vstup x = ${vec(f, x)}. Síť má log₂ ${n} = ${L} vrstvy motýlků.`,
  );

  st.table = true;
  const powers = Array.from({ length: n }, (_, e) => f.omega(n, e, false));
  yield snap(
    st,
    1,
    `Tabulka mocnin: ${powers
      .slice(0, Math.min(n, 8))
      .map((w, e) => `${wPow(e)} = ${f.fmt(w)}`)
      .join(", ")}${n > 8 ? ", …" : ""}.`,
  );

  st.layer = 0;
  st.cols[0] = r.map((k) => x[k]);
  st.wrote = r.map((_, i) => i);
  yield snap(
    st,
    2,
    `Bitové zrcadlení: yₖ ← xᵣ₍ₖ₎, r = (${r.join(", ")}) – např. k = 1 = ${(1).toString(2).padStart(L, "0")}₂ → r(1) = ${r[1].toString(2).padStart(L, "0")}₂ = ${r[1]}. y = ${vec(f, st.cols[0] as C[])}.`,
  );

  st.wrote = [];
  st.b = 1;
  st.vars = { n: String(n), b: "1" };
  yield snap(st, 3, "b ← 1: začínáme bloky velikosti 1.");

  const layers = butterflies(n);
  for (const layer of layers) {
    const b = layer[0].b;
    const c = layer[0].layer;
    // vrstva c počítá z hodnot po vrstvě c − 1 (y se přepisuje na místě; sloupce jsou jen pro kresbu)
    const prev = st.cols[c - 1] as C[];
    st.layer = c;
    st.b = b;
    st.j = null;
    st.k = null;
    st.e = null;
    st.gates = [];
    st.wrote = [];
    st.vars = { n: String(n), b: String(b) };
    yield snap(
      st,
      4,
      `b = ${b} < ${n}: vrstva ${c} – ${n / (2 * b)} ${n / (2 * b) === 1 ? "blok" : n / (2 * b) < 5 ? "bloky" : "bloků"} velikosti 2b = ${2 * b}, v každém ${b} ${b === 1 ? "motýlek" : b < 5 ? "motýlky" : "motýlků"}.`,
    );

    const apply = (g: Gate2): [C, C, string] => {
      const alpha = f.omega(n, g.e, false);
      const s = prev[g.top];
      const l = prev[g.bot];
      const al = f.mul(alpha, l);
      const top = f.add(s, al);
      const bot = f.sub(s, al);
      st.cols[c][g.top] = top;
      st.cols[c][g.bot] = bot;
      const sx = f.fmt(s);
      const term = `${wPow(g.e)}·${par(f.fmt(l))}`;
      return [
        top,
        bot,
        `${sub("y", g.top)} ← ${sx} + ${term} = ${f.fmt(top)}, ${sub("y", g.bot)} ← ${sx} − ${term} = ${f.fmt(bot)}`,
      ];
    };

    if (detail === "layer") {
      for (const g of layer) apply(g);
      st.gates = Array.from({ length: n }, (_, i) => i);
      st.wrote = [...st.gates];
      yield snap(
        st,
        8,
        `Vrstva ${c}: všech ${layer.length} motýlků naráz (navzájem nezávislé – v síti paralelně). y = ${vec(f, st.cols[c] as C[])}.`,
      );
    } else {
      for (let j = 0; j < n; j += 2 * b) {
        st.j = j;
        st.k = null;
        st.e = null;
        st.gates = [];
        st.wrote = [];
        st.vars = { n: String(n), b: String(b), j: String(j) };
        yield snap(
          st,
          5,
          `Blok j = ${j}: řádky ${j} až ${j + 2 * b - 1} – horní polovina s, dolní ℓ.`,
        );
        for (const g of layer.filter((x) => x.j === j)) {
          const alpha = f.omega(n, g.e, false);
          st.k = g.k;
          st.e = g.e;
          st.gates = [g.top, g.bot];
          st.wrote = [];
          st.vars = {
            n: String(n),
            b: String(b),
            j: String(j),
            k: String(g.k),
            α: `${wPow(g.e)} = ${f.fmt(alpha)}`,
          };
          yield snap(
            st,
            7,
            `k = ${g.k}: (nk/2b) mod n = (${n}·${g.k}/${2 * b}) mod ${n} = ${g.e}, α ← ${wPow(g.e)} = ${f.fmt(alpha)} – kroužky „±${g.k}“ v řádcích ${g.top} a ${g.bot}.`,
          );
          const [, , msg] = apply(g);
          st.wrote = [g.top, g.bot];
          yield snap(st, 8, msg + ".");
        }
      }
    }

    st.j = null;
    st.k = null;
    st.e = null;
    st.gates = [];
    st.wrote = [];
    st.b = 2 * b;
    st.vars = { n: String(n), b: String(2 * b) };
    yield snap(st, 9, `b ← 2b = ${2 * b}.`);
  }

  st.layer = null;
  st.b = null;
  const out = st.cols[L] as C[];
  st.result = [...out];
  st.vars = { n: String(n) };
  yield snap(
    st,
    10,
    `b = ${n} = n, cyklus skončil. Výstup y = ${vec(f, out)} – stejný jako z rekurzivní FFT; ${L} vrstvy po ${n / 2} motýlcích, čas Θ(n log n), prostor Θ(n).`,
  );
}
