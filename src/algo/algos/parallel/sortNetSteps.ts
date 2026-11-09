/**
 * Kroky simulace komparátorové sítě (kap. 15.3): krok 0 = vstup na vodičích, pak jedna vrstva za krok
 * („skutečný průběh“, obr. 15.7) – nebo u bublinky „jak je zapsaná“ jeden komparátor za krok (obr. 15.6) –
 * a závěrečné shrnutí. Pseudokód je přepis konstrukcí z knihy (s. 392–398).
 */
import { snap, type StepGen } from "../../core/steps";
import {
  asapLayers,
  isBitonic,
  isSorted,
  netSizes,
  runNet,
  separatorSplit,
  sub,
  type NetKind,
  type SortNet,
} from "./sortNet";

export interface SortNetRun {
  net: SortNet;
  input: readonly number[];
  /** indexy vynechaných komparátorů (rozbitá síť) */
  removed: readonly number[];
}

export interface SortNetState {
  /** poslední vyplněná mezera: 0 = vstup, l + 1 = za vrstvou l */
  t: number;
  /** hodnoty na vodičích v mezerách 0 … t */
  gaps: number[][];
  /** identity žetonů (index vstupu) v mezerách 0 … t */
  ids: number[][];
  /** vrstva, která v tomto kroku proběhla; null = vstup nebo shrnutí */
  layer: number | null;
  /** výsledek už vyhodnocených komparátorů (index v net.comps) */
  done: Record<number, "swap" | "keep">;
  /** komparátory právě vyhodnocené vrstvy */
  active: number[];
  swaps: number;
  compares: number;
  final: boolean;
  /** výstup je setříděný (jen v závěrečném kroku) */
  sorted: boolean;
  /** separátor na bitonickém vstupu: hora (podle indexu vstupu = identity žetonu), jinak null */
  mountain: boolean[] | null;
  vars: Record<string, string | number>;
}

/** Vodiče bublinkové sítě se v knize číslují od 1 (obr. 15.6 / 15.7), ostatní od 0. */
export const labelBase = (kind: NetKind) => (kind === "bubble" ? 1 : 0);

export function netTitle(kind: NetKind, n: number): string {
  switch (kind) {
    case "bubble":
      return `Bublinková síť (n = ${n})`;
    case "sep":
      return `Separátor S${sub(n)}`;
    case "bitonic":
      return `Bitonická třídička B${sub(n)}`;
    case "t":
      return `Třídička T${sub(n)}`;
    case "batcher":
      return `Batcherovo třídění (n = ${n})`;
  }
}

/* ------------------------------------------------------------------ pseudokód */

interface Code {
  lines: string[];
  /** řádek úvodního kroku */
  start: number;
  /** řádek pro vrstvu (podle jejích komparátorů) */
  layer: (net: SortNet, layer: number) => number;
  /** řádek shrnutí */
  end: number;
}

const CODE: Record<NetKind, Code> = {
  bubble: {
    lines: [
      "Bublinková síť pro n vodičů (obr. 15.6):",
      "Pro průchod p = n − 1, …, 1:",
      "  Pro i = 1, …, p: komparátor (x_i, x_{i+1})",
      "Komparátor: menší hodnota odchází na vodič vlevo, větší ve směru šipky",
      "Komparátor počítá, jakmile zná oba vstupy // obr. 15.7",
      "  // současně běží komparátory z více průchodů",
      "Výstup y_1 … y_n // hloubka 2n − 3, n(n − 1)/2 komparátorů",
    ],
    start: 0,
    layer: (net) => (net.seq ? 2 : 4),
    end: 6,
  },
  sep: {
    lines: [
      "Separátor S_n (n sudé):",
      "Současně pro i = 0, …, n/2 − 1:",
      "  komparátor (x_i, x_{i+n/2}): min → y_i, max → y_{i+n/2}",
      "Vstup bitonický → y_0 … y_{n/2−1} a y_{n/2} … y_{n−1} jsou bitonické",
      "  a každý prvek první poloviny < každý prvek druhé",
    ],
    start: 0,
    layer: () => 2,
    end: 3,
  },
  bitonic: {
    lines: [
      "Bitonická třídička B_n (vstup bitonický, n = 2^k):",
      "Separátorem S_n rozdělíme posloupnost na dvě bitonické poloviny",
      "  // každý prvek první poloviny < každý prvek druhé",
      "Každou polovinu separátorem S_{n/2} na dvě čtvrtiny, … až S_2",
      "  // log n hladin, na každé n/2 komparátorů",
      "Výstup: setříděná posloupnost",
    ],
    start: 0,
    layer: (_net, l) => (l === 0 ? 1 : 3),
    end: 5,
  },
  t: {
    lines: [
      "Třídicí síť T_n (n = 2^k):",
      "Vstup rozdělíme na n jednoprvkových posloupností",
      "Pro m = 1, 2, 4, …, n/2: slévačkami M_m slijeme sousední dvojice",
      "  Slévačka M_m: druhou posloupnost obrátíme a přilepíme za první",
      "    // obrácení = zrcadlové komparátory (i, 2m − 1 − i)",
      "  Vzniklou bitonickou posloupnost setřídíme třídičkou B_{2m}",
      "    // B₂ₘ: separátory Sₘ, …, S₂",
      "Výstup: setříděná posloupnost // hloubka 1 + 2 + … + log n",
    ],
    start: 1,
    layer: (net, l) =>
      net.comps[net.layers[l][0]].part?.startsWith("obrácení") ? 3 : 5,
    end: 7,
  },
  batcher: {
    lines: [
      "Procedura BMerge // cvičení 15.3.7",
      "Vstup: setříděné (x_0, …, x_{n−1}) a (y_0, …, y_{n−1})",
      "Je-li n ≤ 1, vyřešíme triviálně.",
      "(a_0, …, a_{n−1}) ← BMerge((x_0, x_2, …, x_{n−2}), (y_0, y_2, …, y_{n−2}))",
      "(b_0, …, b_{n−1}) ← BMerge((x_1, x_3, …, x_{n−1}), (y_1, y_3, …, y_{n−1}))",
      "Výstup: (a_0, min(a_1, b_0), max(a_1, b_0), …, b_{n−1})",
      "Třídění: rekurzivně setřídíme obě poloviny, pak BMerge",
    ],
    start: 6,
    layer: (net, l) => (net.layers[l].every((c) => net.comps[c].base) ? 2 : 5),
    end: 5,
  },
};

export const sortNetPseudocode = (kind: NetKind) => CODE[kind].lines;

/* ------------------------------------------------------------------ zprávy */

const join = (xs: readonly number[]) => xs.join(", ");

/** „komparátory 1–3“ / „komparátor 0“ / „komparátory 0, 2“ */
function compList(idx: readonly number[]): string {
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (idx.length === 1) return `komparátor ${idx[0]}`;
  return `komparátory ${
    contiguous && idx.length > 2
      ? `${idx[0]}–${idx[idx.length - 1]}`
      : idx.join(", ")
  }`;
}

/** „x₁ … x₄“ (cyklicky: „x₆ … x₇, x₀ … x₁“) */
function cyclicRange(from: number, len: number, n: number): string {
  const to = from + len - 1;
  const part = (a: number, b: number) =>
    a === b ? `x${sub(a)}` : `x${sub(a)} … x${sub(b)}`;
  return to < n ? part(from, to) : `${part(from, n - 1)}, ${part(0, to - n)}`;
}

function layerLabel(net: SortNet, l: number): string {
  const comps = net.layers[l].map((c) => net.comps[c]);
  if (net.kind === "bubble") {
    const passes = [...new Set(comps.map((c) => c.pass ?? 0))].sort(
      (a, b) => a - b,
    );
    if (passes.length === 1) return `průchod ${passes[0]}`;
    return `průchody ${passes.slice(0, -1).join(", ")} a ${passes[passes.length - 1]}`;
  }
  const parts = [
    ...new Set(
      comps.map((c) =>
        c.block && c.part && c.block.label !== c.part.split(" ")[0]
          ? `${c.block.label}: ${c.part}`
          : (c.part ?? ""),
      ),
    ),
  ];
  return parts.join(", ");
}

/* ------------------------------------------------------------------ generátor */

export function* sortNetSteps(run: SortNetRun): StepGen<SortNetState> {
  const { net, input, removed } = run;
  const n = net.n;
  const code = CODE[net.kind];
  const base = labelBase(net.kind);
  const removedSet = new Set(removed);
  const trace = runNet(net, input, removed);
  const { size } = netSizes(net);
  const w = (i: number) => i + base;
  const pairText = (c: number) => `(${w(net.comps[c].a)},${w(net.comps[c].b)})`;
  const title = netTitle(net.kind, n);
  const zeroOne = input.every((v) => v === 0 || v === 1);
  const split = net.kind === "sep" ? separatorSplit(input) : null;
  // u zápisu „jak je zapsaná“ takt komparátoru podle skutečného průběhu (obr. 15.7)
  const takt = new Array<number>(net.comps.length).fill(0);
  if (net.seq)
    asapLayers(net.comps, n).forEach((l, li) =>
      l.forEach((c) => (takt[c] = li + 1)),
    );
  // hloubka = počet taktů skutečného průběhu (i když krokujeme zápis po jednom komparátoru)
  const depth = net.seq ? Math.max(0, ...takt) : net.layers.length;

  const st: SortNetState = {
    t: 0,
    gaps: [trace.gaps[0]],
    ids: [trace.ids[0]],
    layer: null,
    done: {},
    active: [],
    swaps: 0,
    compares: 0,
    final: false,
    sorted: false,
    mountain: split?.mountain ?? null,
    // stejné položky ve všech krocích – řádek proměnných pod kresbou nemění výšku plátna (canvasFit)
    vars: net.seq
      ? { porovnání: `0 / ${size}`, takt: 0, prohození: 0 }
      : { vrstva: `0 / ${depth}`, porovnání: 0, prohození: 0 },
  };

  let intro = `Vstup x${sub(base)} … x${sub(n - 1 + base)} = ${join(input)}. ${title}: hloubka ${depth}, komparátorů ${size}.`;
  if (net.seq)
    intro += " Krokujeme jak je zapsaná (obr. 15.6): po jednom komparátoru.";
  if (zeroOne)
    intro +=
      " Vstup z nul a jedniček – podle 0-1 principu stačí ověřit takové.";
  if (net.kind === "sep" || net.kind === "bitonic") {
    if (!isBitonic(input))
      intro +=
        net.kind === "sep"
          ? ` Vstup není bitonický – ${title.split(" ")[1]} ho rozdělit nemusí.`
          : ` Vstup není bitonický – B${sub(n)} ho setřídit nemusí (obecný vstup třídí T${sub(n)}).`;
    else if (split)
      intro += ` Hora (${n / 2} největší): ${cyclicRange(split.k, n / 2, n)}, k = ${split.k}.`;
  }
  if (removed.length)
    intro += ` Vynechan${removed.length === 1 ? "ý komparátor" : "é komparátory"}: ${join(
      [...removed].sort((a, b) => a - b).map((c) => c + 1),
    )}. Síť už nemusí třídit.`;
  yield snap(st, code.start, intro);

  for (let l = 0; l < net.layers.length; l++) {
    const layer = net.layers[l];
    const before = trace.gaps[l];
    st.t = l + 1;
    st.gaps.push(trace.gaps[l + 1]);
    st.ids.push(trace.ids[l + 1]);
    st.layer = l;
    st.active = layer.slice();
    const parts: string[] = [];
    for (const c of layer) {
      if (removedSet.has(c)) {
        parts.push(`${pairText(c)} vynechán`);
        continue;
      }
      const { a, b } = net.comps[c];
      const sw = trace.swapped[c];
      st.done[c] = sw ? "swap" : "keep";
      st.compares++;
      if (sw) st.swaps++;
      parts.push(
        `${pairText(c)} ${before[a]}|${before[b]} ${sw ? "prohodí" : "ponechá"}`,
      );
    }
    let msg: string;
    if (net.seq) {
      const c = layer[0];
      msg = `Porovnání ${c + 1} (průchod ${net.comps[c].pass}): ${parts[0]}. Ve skutečném průběhu (obr. 15.7) počítá v taktu ${takt[c]}.`;
      st.vars = {
        porovnání: `${c + 1} / ${size}`,
        takt: takt[c],
        prohození: st.swaps,
      };
    } else {
      const label = layerLabel(net, l);
      msg = `Vrstva ${l + 1}${label ? ` (${label})` : ""}: ${parts.join(", ")}.`;
      if (split) {
        const keep = layer
          .filter((c) => !trace.swapped[c])
          .map((c) => net.comps[c].a);
        const swap = layer
          .filter((c) => trace.swapped[c])
          .map((c) => net.comps[c].a);
        const said: string[] = [];
        if (keep.length)
          said.push(
            `${compList(keep)} ${keep.length === 1 ? "neprohazuje" : "neprohazují"} (vlevo údolí, vpravo hora)`,
          );
        if (swap.length)
          said.push(
            `${compList(swap)} ${swap.length === 1 ? "prohazuje" : "prohazují"} (vlevo hora, vpravo údolí)`,
          );
        msg += ` Podle důkazu: ${said.join(", ")}.`;
      }
      st.vars = {
        vrstva: `${l + 1} / ${depth}`,
        porovnání: st.compares,
        prohození: st.swaps,
      };
    }
    yield snap(st, code.layer(net, l), msg);
  }

  const out = trace.gaps[trace.gaps.length - 1];
  st.layer = null;
  st.active = [];
  st.final = true;
  st.sorted = isSorted(out);
  if (!net.seq)
    st.vars = {
      vrstva: `${depth} / ${depth}`,
      porovnání: st.compares,
      prohození: st.swaps,
    };
  const outText = `výstup y${sub(base)} … y${sub(n - 1 + base)} = ${join(out)}`;
  const stats = `Hloubka ${depth}, komparátorů ${size}, prohození ${st.swaps}.`;
  let end: string;
  if (net.kind === "sep") {
    const L = out.slice(0, n / 2);
    const R = out.slice(n / 2);
    const less = Math.max(...L) < Math.min(...R);
    const bit = isBitonic(L) && isBitonic(R);
    end =
      less && bit
        ? `Hotovo: separátor rozdělil vstup – levá polovina ${join(L)} < pravá ${join(R)} a obě jsou bitonické. ${stats}`
        : `Hotovo: ${outText}. Levá polovina ${less ? "je" : "není"} menší než pravá, ${bit ? "obě poloviny jsou bitonické" : "poloviny nejsou obě bitonické"} – separátor to slibuje jen pro bitonický vstup. ${stats}`;
  } else if (st.sorted) end = `Hotovo: ${outText} je setříděný. ${stats}`;
  else
    end = `Hotovo: ${outText} není setříděný${
      removed.length
        ? ` – síť s vynechaným${removed.length > 1 ? "i komparátory" : " komparátorem"} ${removed
            .map((c) => c + 1)
            .join(", ")} už netřídí`
        : net.kind === "bitonic"
          ? " – bitonická třídička třídí jen bitonické vstupy"
          : ""
    }. ${stats}`;
  yield snap(st, code.end, end);
}
