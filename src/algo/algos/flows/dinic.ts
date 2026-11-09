/**
 * Dinicův algoritmus (Průvodce 14.4, str. 363–365) jako generátor kroků: po fázích síť rezerv R,
 * ℓ = vzdálenost stoku, ČištěníSítě (vrstvy, hrany dozadu a uvnitř vrstev, slepé uličky frontou F),
 * BlokujícíTok (cesty ze z vždy po první zbylé hraně, nasycené hrany pryč, dočištění) a zlepšení f o g.
 *
 * Kniha řádky Dinica ani procedur nečísluje – kroky ukazují na řádky pseudokódů PC_DINIC, PC_CLEAN
 * a PC_BLOCK podle `state.proc`. Vrcholy s nulovým vstupním stupněm se nemažou (cv. 14.4.1: algoritmus
 * se do nich nikdy nedostane), slepé uličky = vrcholy s deg_out = 0 jako v ČištěníSítě.
 */
import { snap, type Step, type StepGen } from "../../core/steps";
import { cmpLabel, fmtNum, type Graph } from "../graphs/graph";
import {
  arcsFrom,
  augmentArc,
  edgeName,
  flowValue,
  lbl,
  netProblem,
  residual,
  residualArcs,
  type Arc,
  type FlowNet,
} from "./flowNet";
import { initialFlowState, type FlowState } from "./flowState";
import { finishFlow, pathArrows, setText } from "./fordFulkerson";

/** pseudokód Dinic (Průvodce str. 363–364) */
export const PC_DINIC = [
  "Algoritmus Dinic",
  "  Vstup: Síť (V, E, z, s, c)",
  "  f ← nulový tok",
  "  Opakujeme:",
  "    Sestrojíme síť rezerv R a smažeme hrany s nulovou rezervou.",
  "    ℓ ← délka nejkratší cesty ze z do s v R",
  "    Pokud žádná taková cesta neexistuje, zastavíme se a vrátíme tok f.",
  "    Pročistíme síť R.   // procedura ČištěníSítě",
  "    g ← blokující tok v R   // procedura BlokujícíTok",
  "    Zlepšíme tok f pomocí g.",
  "  Výstup: Maximální tok f",
];

/** procedura ČištěníSítě (str. 364) */
export const PC_CLEAN = [
  "Procedura ČištěníSítě",
  "  Rozdělíme vrcholy do vrstev podle vzdálenosti od z.",
  "  Odstraníme vrstvy za s (tedy vrcholy ve vzdálenosti větší než ℓ).",
  "  Odstraníme hrany do předchozích vrstev a hrany uvnitř vrstev.",
  "  Odstraníme „slepé uličky“, tedy vrcholy s deg_{out}(v) = 0:",
  "    F ← {v ≠ z, s | deg_{out}(v) = 0}   // fronta vrcholů ke smazání",
  "    Dokud F ≠ ∅, opakujeme:",
  "      Odebereme vrchol v z F.",
  "      Smažeme ze sítě vrchol v i všechny hrany, které do něj vedou.",
  "      Pokud nějakému vrcholu klesl deg_{out} na 0, přidáme ho do F.",
];

/** procedura BlokujícíTok (str. 365) */
export const PC_BLOCK = [
  "Procedura BlokujícíTok",
  "  Vstup: Vrstevnatá síť R s rezervami r",
  "  g ← nulový tok",
  "  Dokud v R existuje orientovaná cesta P ze z do s, opakujeme:",
  "    ε ← min_{e∈P} (r(e) − g(e))",
  "    Pro všechny e ∈ P: g(e) ← g(e) + ε.",
  "    Pokud pro kteroukoliv e nastalo g(e) = r(e), smažeme e z R.",
  "    Dočistíme síť pomocí fronty.",
  "  Výstup: Blokující tok g",
];

export const DINIC_LINES = {
  init: 2,
  residual: 4,
  ell: 5,
  stop: 6,
  clean: 7,
  block: 8,
  improve: 9,
  output: 10,
} as const;
export const CLEAN_LINES = {
  layers: 1,
  beyond: 2,
  back: 3,
  queue: 5,
  loop: 6,
  remove: 8,
  push: 9,
} as const;
export const BLOCK_LINES = {
  init: 2,
  path: 3,
  eps: 4,
  add: 5,
  sat: 6,
  clean: 7,
  output: 8,
} as const;

/** pseudokód procedury, která v kroku běží */
export function dinicPseudocode(proc: FlowState["proc"]): string[] {
  return proc === "clean" ? PC_CLEAN : proc === "block" ? PC_BLOCK : PC_DINIC;
}

/** BFS vzdálenosti ze z po obloucích s kladnou rezervou */
function distances(
  g: Graph,
  arcs: readonly Arc[],
  r: readonly number[],
  z: number,
): (number | null)[] {
  const dist: (number | null)[] = g.nodes.map(() => null);
  dist[z] = 0;
  const q = [z];
  while (q.length) {
    const u = q.shift()!;
    for (const a of arcsFrom(g, arcs, u))
      if (r[a.id] > 0 && dist[a.v] === null) {
        dist[a.v] = dist[u]! + 1;
        q.push(a.v);
      }
  }
  return dist;
}

/** „vrstva 0: {z} · 1: {a, b} · …“ */
function layersText(g: Graph, dist: readonly (number | null)[]): string {
  const layers: number[][] = [];
  dist.forEach((d, v) => {
    if (d !== null) (layers[d] ??= []).push(v);
  });
  return layers
    .map(
      (l, i) =>
        `${i}: ${setText(
          g,
          [...l].sort((a, b) => cmpLabel(lbl(g, a), lbl(g, b))),
        )}`,
    )
    .join(" · ");
}

const arcList = (g: Graph, arcs: readonly Arc[], ids: readonly number[]) =>
  ids.map((a) => edgeName(g, arcs[a].u, arcs[a].v)).join(", ");

export function* dinic(net: FlowNet): StepGen<FlowState> {
  const g = net.graph;
  const st = initialFlowState(
    "dinic",
    g.edges.map(() => 0),
    0,
  );
  const problem = netProblem(net);
  if (problem) {
    yield { ...snap(st, null, `Síť nejde použít: ${problem}`), error: true };
    return;
  }
  const arcs = residualArcs(g);
  const { z, s } = net;
  yield snap(st, DINIC_LINES.init, "f ← nulový tok, |f| = 0.");

  const ells: number[] = [];
  for (;;) {
    st.phase += 1;
    st.proc = "dinic";
    const r = arcs.map((a) => residual(g, st.f, a));
    st.r = r;
    st.fate = {};
    for (const a of arcs) if (r[a.id] > 0) st.fate[a.id] = "live";
    st.gone = [];
    st.layered = false;
    st.g = null;
    st.queue = null;
    st.path = [];
    st.bottleneck = [];
    st.eps = null;
    st.changed = [];
    st.dist = distances(g, arcs, r, z);
    st.ell = null;
    const live = () =>
      arcs.filter((a) => st.fate[a.id] === "live").map((a) => a.id);
    yield snap(
      st,
      DINIC_LINES.residual,
      `Fáze ${st.phase}: síť rezerv R k toku f (|f| = ${fmtNum(st.value)}) – hrany s nulovou rezervou smažeme, zbude ${live().length}.`,
    );

    const ell = st.dist[s];
    if (ell === null) {
      st.seen = g.nodes.filter((n) => st.dist![n.id] !== null).map((n) => n.id);
      yield snap(
        st,
        DINIC_LINES.stop,
        `Stok s není ze z v R dosažitelný – zastavíme se a vrátíme tok f.`,
      );
      break;
    }
    st.ell = ell;
    ells.push(ell);
    yield snap(
      st,
      DINIC_LINES.ell,
      `ℓ = ${ell}: nejkratší cesta ze z do s v R má ${ell} ${ell === 1 ? "hranu" : ell <= 4 ? "hrany" : "hran"} (BFS ze z).`,
    );
    yield snap(
      st,
      DINIC_LINES.clean,
      "Pročistíme síť R – procedura ČištěníSítě.",
    );

    /* ---------------- ČištěníSítě ---------------- */
    st.proc = "clean";
    st.layered = true;
    const dist = st.dist;
    yield snap(
      st,
      CLEAN_LINES.layers,
      `Vrstvy podle vzdálenosti od z: ${layersText(g, dist)}.`,
    );

    const beyond = g.nodes
      .map((n) => n.id)
      .filter((v) => dist[v] === null || dist[v]! > ell);
    const gone = new Set<number>(beyond);
    for (const id of live())
      if (gone.has(arcs[id].u) || gone.has(arcs[id].v)) st.fate[id] = "gray";
    st.gone = [...beyond];
    yield snap(
      st,
      CLEAN_LINES.beyond,
      beyond.length
        ? `Odstraníme vrcholy za s (vzdálenost větší než ℓ = ${ell}) a nedosažitelné: ${setText(g, beyond)}.`
        : `Za s žádná vrstva není (ani nedosažitelný vrchol) – nic neodstraníme.`,
    );

    const back = live().filter(
      (id) => dist[arcs[id].v] !== dist[arcs[id].u]! + 1,
    );
    for (const id of back) st.fate[id] = "gray";
    yield snap(
      st,
      CLEAN_LINES.back,
      back.length
        ? `Odstraníme hrany do předchozích vrstev a uvnitř vrstev (na obr. 14.7 šedivé): ${arcList(g, arcs, back)}.`
        : "Žádná hrana nevede dozadu ani uvnitř vrstvy.",
    );

    const outDeg = (v: number) =>
      arcs.filter((a) => a.u === v && st.fate[a.id] === "live").length;
    const byLayer = (a: number, b: number) =>
      (dist[a] ?? 0) - (dist[b] ?? 0) || cmpLabel(lbl(g, a), lbl(g, b));
    const deadEnds = () =>
      g.nodes
        .map((n) => n.id)
        .filter((v) => v !== z && v !== s && !gone.has(v) && outDeg(v) === 0)
        .sort(byLayer);
    /** fronta F slepých uliček: smaže vrcholy i hrany do nich; kroky jen pro ČištěníSítě */
    function* drain(
      F: number[],
      verbose: boolean,
    ): Generator<Step<FlowState>, number[], unknown> {
      const removed: number[] = [];
      while (F.length) {
        const v = F.shift()!;
        gone.add(v);
        st.gone.push(v);
        removed.push(v);
        const into = arcs
          .filter((a) => a.v === v && st.fate[a.id] === "live")
          .map((a) => a.id);
        for (const id of into) st.fate[id] = "dead";
        st.queue = [...F];
        if (verbose)
          yield snap(
            st,
            CLEAN_LINES.remove,
            `Odebereme ${lbl(g, v)} z F a smažeme ho i hrany, které do něj vedou${into.length ? `: ${arcList(g, arcs, into)}` : " (žádné)"}.`,
          );
        const fresh = deadEnds().filter((u) => !F.includes(u));
        if (fresh.length) {
          F.push(...fresh);
          st.queue = [...F];
          if (verbose)
            yield snap(
              st,
              CLEAN_LINES.push,
              `deg_out klesl na 0 u ${setText(g, fresh)} → F = ${setText(g, F)}.`,
            );
        }
      }
      return removed;
    }

    const F = deadEnds();
    st.queue = [...F];
    yield snap(
      st,
      CLEAN_LINES.queue,
      F.length
        ? `Slepé uličky (deg_out = 0, mimo z a s): F = ${setText(g, F)}.`
        : "Žádná slepá ulička: F = ∅.",
    );
    yield* drain(F, true);
    st.queue = [];
    yield snap(
      st,
      CLEAN_LINES.loop,
      `F = ∅ – síť R je pročištěná: ${live().length} hran leží na nejkratších cestách ze z do s.`,
    );

    /* ---------------- BlokujícíTok ---------------- */
    st.proc = "dinic";
    st.queue = null;
    yield snap(
      st,
      DINIC_LINES.block,
      "g ← blokující tok ve vrstevnaté síti R – procedura BlokujícíTok.",
    );
    st.proc = "block";
    const gf = arcs.map(() => 0);
    st.g = gf;
    yield snap(st, BLOCK_LINES.init, "g ← nulový tok.");

    let total = 0;
    for (;;) {
      // ve vrstevnaté síti stačí vyrazit ze z a vždy jít po libovolné (první) zbylé hraně
      const path: number[] = [];
      for (let u = z; u !== s;) {
        const next = arcsFrom(g, arcs, u).find((a) => st.fate[a.id] === "live");
        if (!next) break;
        path.push(next.id);
        u = next.v;
      }
      const reached = path.length && arcs[path[path.length - 1]].v === s;
      st.changed = [];
      st.bottleneck = [];
      st.eps = null;
      if (!reached) {
        st.path = [];
        yield snap(
          st,
          BLOCK_LINES.path,
          "V R už žádná cesta ze z do s nevede – tok g je blokující.",
        );
        break;
      }
      st.path = path;
      yield snap(
        st,
        BLOCK_LINES.path,
        `P = ${pathArrows(g, arcs, path)} (ze z vždy po první zbylé hraně).`,
      );
      const rest = path.map((a) => r[a] - gf[a]);
      const eps = Math.min(...rest);
      st.eps = eps;
      st.bottleneck = path.filter((_, i) => rest[i] === eps);
      yield snap(
        st,
        BLOCK_LINES.eps,
        `ε = min{${rest.map(fmtNum).join(", ")}} = ${fmtNum(eps)} (r(e) − g(e) po hranách cesty).`,
      );
      for (const a of path) gf[a] += eps;
      total += eps;
      st.g = gf;
      yield snap(
        st,
        BLOCK_LINES.add,
        `g(e) ← g(e) + ${fmtNum(eps)} na hranách cesty: |g| = ${fmtNum(total)}.`,
      );
      const sat = path.filter((a) => gf[a] === r[a]);
      for (const a of sat) st.fate[a] = "sat";
      st.path = [];
      yield snap(
        st,
        BLOCK_LINES.sat,
        `Nasycené hrany (g = r) smažeme z R: ${arcList(g, arcs, sat)}.`,
      );
      const removed = yield* drain(deadEnds(), false);
      st.queue = null;
      if (removed.length)
        yield snap(
          st,
          BLOCK_LINES.clean,
          `Dočistíme síť: slepé uličky ${setText(g, removed)} smažeme i s hranami, které do nich vedou.`,
        );
    }
    yield snap(
      st,
      BLOCK_LINES.output,
      `Výstup: blokující tok g, |g| = ${fmtNum(total)}.`,
    );

    /* ---------------- zlepšení ---------------- */
    st.proc = "dinic";
    const before = st.value;
    const changed = new Set<number>();
    for (const a of arcs)
      if (gf[a.id] > 0) {
        st.f = augmentArc(g, st.f, a, gf[a.id]).f;
        if (a.fwd !== null) changed.add(a.fwd);
        if (a.back !== null) changed.add(a.back);
      }
    st.changed = [...changed].filter((e) => st.f[e] !== undefined);
    st.value = flowValue(net, st.f);
    yield snap(
      st,
      DINIC_LINES.improve,
      `Zlepšíme f pomocí g (průtoky se sečtou, lemma Z): |f| = ${fmtNum(before)} + ${fmtNum(total)} = ${fmtNum(st.value)}.`,
    );
  }

  st.proc = "dinic";
  st.path = [];
  st.changed = [];
  const phases = ells.length;
  yield finishFlow(
    net,
    st,
    DINIC_LINES.output,
    `Hotovo – maximální tok |f| = ${fmtNum(st.value)} po ${phases} ${phases === 1 ? "fázi" : "fázích"}${phases ? ` (ℓ = ${ells.join(", ")})` : ""}`,
  );
}
