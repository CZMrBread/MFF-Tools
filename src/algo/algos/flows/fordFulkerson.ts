/**
 * Fordův–Fulkersonův algoritmus (Průvodce 14.2, str. 355) jako generátor kroků: nenasycená cesta v síti
 * rezerv (BFS = nejkratší, cv. 14.2.9; DFS = do hloubky), ε = rezerva cesty a zlepšení po obloucích
 * (ř. 5–7: δ odečteme v protisměru, zbytek přičteme po směru). Na konci minimální řez (str. 357) a v síti
 * párování (14.3) největší párování.
 *
 * Varianta `forwardOnly` je chybné zlepšování jen po směru hran z úvodu oddílu (str. 354, obr. 14.3).
 */
import { snap, type Step, type StepGen } from "../../core/steps";
import { fmtNum, type Graph } from "../graphs/graph";
import {
  arcsFrom,
  augmentArc,
  cutOf,
  edgeName,
  flowValue,
  lbl,
  matchingOf,
  netProblem,
  residual,
  residualArcs,
  type Arc,
  type FlowNet,
} from "./flowNet";
import { initialFlowState, type FlowState } from "./flowState";

/** pseudokód FordFulkerson (Průvodce str. 355) */
export const PC_FF = [
  "Algoritmus FordFulkerson",
  "  Vstup: Síť (V, E, z, s, c)",
  "  f ← libovolný tok, např. všude nulový",
  "  Dokud existuje nenasycená cesta P ze z do s, opakujeme:",
  "    ε ← min{r(e) | e ∈ P}   // spočítáme rezervu celé cesty",
  "    Pro všechny hrany uv ∈ P:",
  "      δ ← min{f(vu), ε}   // kolik můžeme odečíst v protisměru",
  "      f(vu) ← f(vu) − δ",
  "      f(uv) ← f(uv) + ε − δ   // zbytek přičteme po směru",
  "  Výstup: Maximální tok f",
];

/** zlepšování jen po směru hran (text str. 354 – „algoritmus v úzkých“, obr. 14.3) */
export const PC_FF_FORWARD = [
  "Zlepšující cesty jen po směru hran   // str. 354 – nefunguje vždy",
  "  Vstup: Síť (V, E, z, s, c)",
  "  f ← všude nulový tok",
  "  Dokud existuje cesta P ze z do s, kde f(e) < c(e) pro všechna e ∈ P:",
  "    ε ← min_{e∈P} (c(e) − f(e))",
  "    Pro všechny e ∈ P: f(e) ← f(e) + ε",
  "  Výstup: Tok f – nemusí být maximální!",
];

/** řádky pseudokódu, na které kroky ukazují (PC_FF; PC_FF_FORWARD má init, search a eps stejně) */
export const FF_LINES = {
  init: 2,
  search: 3,
  eps: 4,
  delta: 6,
  sub: 7,
  add: 8,
  output: 9,
} as const;
const FWD_LINES = { add: 5, output: 6 } as const;

export type PathSearch = "bfs" | "dfs";

export interface FfOptions {
  /** hledání nenasycené cesty: BFS (nejkratší, výchozí) nebo DFS */
  search?: PathSearch;
  /** počáteční tok (obr. 14.2 vpravo); jinak nulový */
  init?: readonly number[];
  /** odkud počáteční tok je („tok z obr. 14.2 vpravo“) – do hlášky */
  initLabel?: string;
  /** chybná varianta: jen po směru hran (str. 354) */
  forwardOnly?: boolean;
}

/** Cesta jako v knize („zbcads“), u víceznakových popisků s pomlčkami („z–L1–R2–s“). */
export function pathText(
  g: Graph,
  arcs: readonly Arc[],
  path: readonly number[],
): string {
  if (!path.length) return "";
  const labels = [
    lbl(g, arcs[path[0]].u),
    ...path.map((a) => lbl(g, arcs[a].v)),
  ];
  return labels.every((l) => [...l].length === 1)
    ? labels.join("")
    : labels.join("–");
}

/** „z → b → c → s“ */
export function pathArrows(
  g: Graph,
  arcs: readonly Arc[],
  path: readonly number[],
): string {
  if (!path.length) return "";
  return [lbl(g, arcs[path[0]].u), ...path.map((a) => lbl(g, arcs[a].v))].join(
    " → ",
  );
}

/** f(uv) jako v knize („f(ac)“), u víceznakových popisků „f(L1, R2)“ */
export function fOf(g: Graph, u: number, v: number): string {
  const a = lbl(g, u);
  const b = lbl(g, v);
  return [...a].length === 1 && [...b].length === 1
    ? `f(${a}${b})`
    : `f(${a}, ${b})`;
}

/** „{z, a, b}“ */
export const setText = (g: Graph, vs: readonly number[]) =>
  `{${vs.map((v) => lbl(g, v)).join(", ")}}`;

/**
 * Cesta ze z do s po použitelných obloucích (BFS nebo DFS v pořadí popisků) a vrcholy, kam hledání došlo.
 * `usable(a)` = oblouk smí být na cestě (r > 0, u varianty po směru f < c).
 */
export function findPath(
  g: Graph,
  arcs: readonly Arc[],
  z: number,
  s: number,
  search: PathSearch,
  usable: (a: Arc) => boolean,
): { path: number[] | null; seen: number[] } {
  const parent = new Map<number, Arc>();
  const seen = new Set<number>([z]);
  const order = [z];
  const out = (u: number) => arcsFrom(g, arcs, u).filter(usable);
  let found = z === s;
  if (search === "bfs") {
    const queue = [z];
    while (queue.length && !found) {
      const u = queue.shift()!;
      for (const a of out(u)) {
        if (seen.has(a.v)) continue;
        seen.add(a.v);
        order.push(a.v);
        parent.set(a.v, a);
        if (a.v === s) {
          found = true;
          break;
        }
        queue.push(a.v);
      }
    }
  } else {
    const visit = (u: number): boolean => {
      for (const a of out(u)) {
        if (seen.has(a.v)) continue;
        seen.add(a.v);
        order.push(a.v);
        parent.set(a.v, a);
        if (a.v === s || visit(a.v)) return true;
      }
      return false;
    };
    found = visit(z);
  }
  if (!found) return { path: null, seen: order };
  const path: number[] = [];
  for (let v = s; v !== z;) {
    const a = parent.get(v)!;
    path.unshift(a.id);
    v = a.u;
  }
  return { path, seen: order };
}

/** Kapacita hrany sítě (0 u chybějící). */
const cap = (g: Graph, e: number | null) =>
  e === null ? 0 : (g.edges[e]?.w ?? 0);

/** Konec běhu: minimální řez (a párování) do stavu a závěrečná hláška (i Dinic). */
export function finishFlow(
  net: FlowNet,
  st: FlowState,
  line: number,
  head: string,
): Step<FlowState> {
  const g = net.graph;
  const cut = cutOf(net, st.f);
  st.cut = { A: cut.A, edges: cut.edges };
  const m = matchingOf(net, st.f);
  st.matching = m ? m.edges : null;
  const cutList = cut.edges.map((e) => edgeName(g, g.edges[e].u, g.edges[e].v));
  const tail = m
    ? ` = největší párování (${m.pairs.length}): ${m.pairs.map(([a, b]) => `${lbl(g, a)}–${lbl(g, b)}`).join(", ") || "žádná hrana"}.`
    : `. Minimální řez E(A, B) s A = ${setText(g, cut.A)} má kapacitu ${fmtNum(cut.capacity)}${cutList.length ? ` (${cutList.join(", ")})` : ""} – certifikát maximality.`;
  return snap(st, line, `${head}${tail}`);
}

/**
 * Kroky FordFulkersona. Každý krok nese tok f; řádky podle FF_LINES (u forwardOnly podle PC_FF_FORWARD).
 */
export function* fordFulkerson(
  net: FlowNet,
  opts: FfOptions = {},
): StepGen<FlowState> {
  const g = net.graph;
  const forward = opts.forwardOnly === true;
  const search = opts.search ?? "bfs";
  const f0 = g.edges.map((_, i) => opts.init?.[i] ?? 0);
  const st = initialFlowState(forward ? "forward" : "ff", f0, 0);
  const problem = netProblem(net);
  if (problem) {
    yield { ...snap(st, null, `Síť nejde použít: ${problem}`), error: true };
    return;
  }
  st.value = flowValue(net, st.f);
  const arcs = residualArcs(g);
  const r = (a: Arc) =>
    forward
      ? a.fwd === null
        ? 0
        : cap(g, a.fwd) - st.f[a.fwd]
      : residual(g, st.f, a);
  const how =
    search === "bfs" ? "BFS – nejkratší cesta" : "DFS – první cesta do hloubky";

  yield snap(
    st,
    FF_LINES.init,
    opts.init
      ? `f ← ${opts.initLabel ?? "počáteční tok"}, |f| = ${fmtNum(st.value)}.`
      : "f ← všude nulový tok, |f| = 0.",
  );

  for (;;) {
    const { path, seen } = findPath(
      g,
      arcs,
      net.z,
      net.s,
      search,
      (a) => r(a) > 0,
    );
    st.changed = [];
    st.cur = null;
    st.delta = null;
    st.eps = null;
    st.bottleneck = [];
    st.seen = seen;
    if (!path) {
      st.path = [];
      yield snap(
        st,
        FF_LINES.search,
        forward
          ? `Cesta ze z do s, na které by všude f(e) < c(e), neexistuje (hledání došlo do ${setText(g, seen)}).`
          : `Nenasycená cesta ze z do s neexistuje – po hranách s kladnou rezervou dojdeme jen do A = ${setText(g, seen)}.`,
      );
      break;
    }
    st.iteration += 1;
    st.path = path;
    yield snap(
      st,
      FF_LINES.search,
      `${forward ? "Zlepšující cesta po směru hran" : "Nenasycená cesta"} P = ${pathArrows(g, arcs, path)} (${how}).`,
    );

    const rs = path.map((a) => r(arcs[a]));
    const eps = Math.min(...rs);
    st.eps = eps;
    st.bottleneck = path.filter((_, i) => rs[i] === eps);
    yield snap(
      st,
      FF_LINES.eps,
      `ε = min{${rs.map(fmtNum).join(", ")}} = ${fmtNum(eps)}${forward ? " (c(e) − f(e) po hranách cesty)" : ""}.`,
    );

    if (forward) {
      const before = st.value;
      for (const id of path) {
        const a = arcs[id];
        if (a.fwd !== null) st.f[a.fwd] += eps;
      }
      st.changed = path.map((id) => arcs[id].fwd!);
      st.value = flowValue(net, st.f);
      yield snap(
        st,
        FWD_LINES.add,
        `Tok po všech hranách cesty zvýšíme o ε = ${fmtNum(eps)}: |f| = ${fmtNum(before)} + ${fmtNum(eps)} = ${fmtNum(st.value)}.`,
      );
      continue;
    }

    for (const id of path) {
      const a = arcs[id];
      const fvu = a.back === null ? 0 : st.f[a.back];
      const delta = Math.min(fvu, eps);
      st.cur = id;
      st.delta = delta;
      st.changed = [];
      const uv = edgeName(g, a.u, a.v);
      const fvuName = fOf(g, a.v, a.u);
      const fuvName = fOf(g, a.u, a.v);
      yield snap(
        st,
        FF_LINES.delta,
        `uv = ${uv}: δ = min{${fvuName}, ε} = min{${fmtNum(fvu)}, ${fmtNum(eps)}} = ${fmtNum(delta)}${delta > 0 ? " – část toku vrátíme proti směru" : ""}.`,
      );
      const next = augmentArc(g, st.f, a, eps).f;
      if (delta > 0 && a.back !== null) {
        st.f[a.back] = next[a.back];
        st.changed = [a.back];
        yield snap(
          st,
          FF_LINES.sub,
          `${fvuName} ← ${fmtNum(fvu)} − ${fmtNum(delta)} = ${fmtNum(next[a.back])}${eps - delta === 0 ? "; zbytek ε − δ = 0, po směru nic nepřičteme." : "."}`,
        );
      }
      if (eps - delta > 0 && a.fwd !== null) {
        const old = st.f[a.fwd];
        st.f[a.fwd] = next[a.fwd];
        st.changed = [a.fwd];
        yield snap(
          st,
          FF_LINES.add,
          `${fuvName} ← ${fmtNum(old)} + ${fmtNum(eps)} − ${fmtNum(delta)} = ${fmtNum(next[a.fwd])}${next[a.fwd] === cap(g, a.fwd) ? " – hrana je nasycená" : ""}.`,
        );
      }
    }
    st.value = flowValue(net, st.f);
  }

  st.path = [];
  if (forward) {
    const best = maxFlowValue(net);
    const step = finishFlow(
      net,
      st,
      FWD_LINES.output,
      `Hotovo – po směru hran už zlepšující cesta nevede, tok |f| = ${fmtNum(st.value)}`,
    );
    if (best > st.value) {
      yield {
        ...step,
        message: `Hotovo – po směru hran už zlepšující cesta nevede, tok |f| = ${fmtNum(st.value)}, ale maximální tok má velikost ${fmtNum(best)}: je potřeba posílat i proti směru hran (FordFulkerson s rezervami).`,
        outcome: "warn",
      };
    } else yield step;
    return;
  }
  yield finishFlow(
    net,
    st,
    FF_LINES.output,
    `Hotovo – maximální tok |f| = ${fmtNum(st.value)}`,
  );
}

/** Velikost maximálního toku (FordFulkerson s BFS bez kroků) – pro srovnání u varianty po směru. */
export function maxFlowValue(net: FlowNet): number {
  if (netProblem(net)) return 0;
  const g = net.graph;
  const arcs = residualArcs(g);
  let f = g.edges.map(() => 0);
  for (;;) {
    const { path } = findPath(
      g,
      arcs,
      net.z,
      net.s,
      "bfs",
      (a) => residual(g, f, a) > 0,
    );
    if (!path) break;
    const eps = Math.min(...path.map((a) => residual(g, f, arcs[a])));
    for (const id of path) f = augmentArc(g, f, arcs[id], eps).f;
  }
  return flowValue(net, f);
}
