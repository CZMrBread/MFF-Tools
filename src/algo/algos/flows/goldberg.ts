/**
 * Goldbergův algoritmus (push-relabel; Průvodce 14.5, str. 368–374) jako generátor kroků: výšky h, vlna f
 * s přebytky f^Δ, Převedení přebytku po hraně a Zvednutí vrcholu. Varianta „nejvyšší“ = vylepšení
 * z oddílu 14.6 (str. 374): ze všech vrcholů s přebytkem se pokaždé vybere ten nejvyšší.
 *
 * Kniha nechává volbu vrcholu s přebytkem i hrany volnou. Tady: základní verze bere první vrchol seznamu P
 * (seznam vrcholů s kladným přebytkem z oddílu Implementace, str. 373; nový vrchol se přidá na konec),
 * nejvyšší verze vrchol s největší výškou (při shodě první v P). Hrany z u se zkoušejí v pořadí podle
 * názvu cíle (arcsFrom), jako sousedé v ostatních grafových algoritmech. Po převedení se pokračuje tímtéž
 * vrcholem, dokud má přebytek a zůstává vybraným – krok „výběr vrcholu“ se proto ukáže jen při změně u.
 *
 * Převedení po oblouku uv sítě rezerv (flowNet.Arc) odečte nejdřív tok v protisměru (hrana vu), zbytek
 * přičte po směru – „podobně jako v předchozích algoritmech“ (str. 368), augmentArc.
 */
import { snap, type StepGen } from "../../core/steps";
import { fmtNum, plural } from "../graphs/graph";
import {
  arcsFrom,
  augmentArc,
  cutOf,
  edgeName,
  excess,
  lbl,
  matchingOf,
  netProblem,
  residual,
  residualArcs,
  type Arc,
  type FlowNet,
} from "./flowNet";
import { setText } from "./fordFulkerson";

/** Volba vrcholu s přebytkem: první v seznamu P (14.5), nebo nejvyšší (vylepšení 14.6). */
export type GoldbergVariant = "zakladni" | "nejvyssi";

/** pseudokód Goldberg (Průvodce str. 369; knižní komentáře ◁ za //, bez čísel řádků) */
export const PC_GOLDBERG = [
  "Algoritmus Goldberg",
  "  Vstup: Síť (V, E, z, s, c)",
  "  Nastavíme počáteční výšky:   // zdroj ve výšce n, ostatní ve výšce 0",
  "    h(z) ← n",
  "    h(v) ← 0 pro všechny v ≠ z",
  "  Vytvoříme počáteční vlnu:   // všechny hrany ze z na maximum",
  "    f ← všude nulová funkce",
  "    f(zv) ← c(zv), kdykoliv zv ∈ E",
  "  Dokud existuje vrchol u ≠ z, s takový, že f^{Δ}(u) > 0:",
  "    Pokud existuje hrana uv s r(uv) > 0 a h(u) > h(v), převedeme přebytek po hraně uv.",
  "    V opačném případě zvedneme u: h(u) ← h(u) + 1.",
  "  Výstup: Maximální tok f",
];

/** 14.6 (str. 374): „ze všech vrcholů s přebytkem pokaždé vybírat ten nejvyšší“ – liší se jen řádek cyklu */
export const PC_GOLDBERG_HIGHEST = PC_GOLDBERG.map((l, i) =>
  i === 8
    ? "  Dokud některý vrchol u ≠ z, s má f^{Δ}(u) > 0, vezmeme nejvyšší z nich:"
    : l,
);

export const GOLDBERG_LINES = {
  heights: 3,
  wave: 7,
  loop: 8,
  push: 9,
  lift: 10,
  output: 11,
} as const;

export const goldbergPseudocode = (v: GoldbergVariant) =>
  v === "nejvyssi" ? PC_GOLDBERG_HIGHEST : PC_GOLDBERG;

export interface GoldbergState {
  variant: GoldbergVariant;
  /** vlna (na konci tok) po hranách sítě */
  f: number[];
  /** výšky vrcholů */
  h: number[];
  /** přebytky f^Δ(v) = přítok − odtok (zdroj záporný, stok = |f|) */
  ex: number[];
  /** seznam P vrcholů (mimo z, s) s kladným přebytkem v pořadí, v jakém se do něj dostaly */
  P: number[];
  /** právě zpracovávaný vrchol u (null = žádný) */
  u: number | null;
  /** převedení v tomto kroku: oblouk sítě rezerv, δ, nasycené (r klesla na 0) */
  push: { arc: number; delta: number; saturating: boolean } | null;
  /** zvednutí v tomto kroku: vrchol a jeho výška před zvednutím */
  lift: { v: number; from: number } | null;
  /** nejvyšší hladina s přebytkem H (14.6); null mimo variantu „nejvyšší“ nebo bez přebytků */
  H: number | null;
  pushes: number;
  satPushes: number;
  lifts: number;
  /** |f| = přebytek stoku */
  value: number;
  /** konec: minimální řez E(A, B) – vrcholy A a hrany z A do B */
  cut: { A: number[]; edges: number[] } | null;
  /** konec v síti párování: hrany L → R s tokem 1 */
  matching: number[] | null;
  done: boolean;
}

export interface GoldbergOptions {
  variant?: GoldbergVariant;
}

const listText = (net: FlowNet, vs: readonly number[]) =>
  `(${vs.map((v) => lbl(net.graph, v)).join(", ")})`;

export function* goldberg(
  net: FlowNet,
  opts: GoldbergOptions = {},
): StepGen<GoldbergState> {
  const g = net.graph;
  const variant = opts.variant ?? "zakladni";
  const n = g.nodes.length;
  const st: GoldbergState = {
    variant,
    f: g.edges.map(() => 0),
    h: g.nodes.map(() => 0),
    ex: g.nodes.map(() => 0),
    P: [],
    u: null,
    push: null,
    lift: null,
    H: null,
    pushes: 0,
    satPushes: 0,
    lifts: 0,
    value: 0,
    cut: null,
    matching: null,
    done: false,
  };
  const problem = netProblem(net);
  if (problem) {
    yield { ...snap(st, null, `Síť nejde použít: ${problem}`), error: true };
    return;
  }
  const { z, s } = net;
  const L = (v: number) => lbl(g, v);
  const arcs = residualArcs(g);
  const r = (a: Arc) => residual(g, st.f, a);
  const inner = (v: number) => v !== z && v !== s;
  const highest = () =>
    variant === "nejvyssi" && st.P.length
      ? Math.max(...st.P.map((v) => st.h[v]))
      : null;

  /* ---- počáteční výšky ---- */
  st.h[z] = n;
  const others = g.nodes.map((nd) => nd.id).filter((v) => v !== z);
  yield snap(
    st,
    GOLDBERG_LINES.heights,
    `Počáteční výšky: h(z) ← n = ${n}, ostatní vrcholy ${listText(net, others)} ve výšce 0.`,
  );

  /* ---- počáteční vlna ---- */
  const fromZ = g.edges
    .filter((e) => e.u === z && e.w > 0)
    .sort((a, b) => L(a.v).localeCompare(L(b.v), "cs"));
  for (const e of fromZ) st.f[e.id] = e.w;
  for (const nd of g.nodes) st.ex[nd.id] = excess(g, st.f, nd.id);
  st.P = arcsFrom(g, arcs, z)
    .map((a) => a.v)
    .filter((v) => inner(v) && st.ex[v] > 0);
  st.value = st.ex[s];
  st.H = highest();
  const waveList = fromZ.length
    ? fromZ.map((e) => `${edgeName(g, e.u, e.v)} ${fmtNum(e.w)}`).join(", ")
    : "ze z nevede žádná hrana s kladnou kapacitou";
  const exList = st.P.length
    ? `Přebytek mají ${st.P.map((v) => `${L(v)} (${fmtNum(st.ex[v])})`).join(", ")}; seznam P = ${listText(net, st.P)}.`
    : "Žádný vnitřní vrchol nemá přebytek.";
  yield snap(
    st,
    GOLDBERG_LINES.wave,
    `Počáteční vlna: hrany ze z na maximum – ${waveList}. ${exList}`,
  );

  /* ---- hlavní cyklus ---- */
  let prev: number | null = null;
  while (st.P.length) {
    st.push = null;
    st.lift = null;
    st.H = highest();
    let u = st.P[0];
    if (variant === "nejvyssi")
      for (const v of st.P) if (st.h[v] > st.h[u]) u = v;
    st.u = u;
    if (u !== prev) {
      prev = u;
      const what = `u = ${L(u)} (přebytek ${fmtNum(st.ex[u])}, h(${L(u)}) = ${st.h[u]})`;
      yield snap(
        st,
        GOLDBERG_LINES.loop,
        variant === "nejvyssi"
          ? `Nejvyšší vrchol s přebytkem: ${what} – hladina H = ${st.H}, P = ${listText(net, st.P)}.`
          : `Vrchol s přebytkem: ${what} – první v seznamu P = ${listText(net, st.P)}.`,
      );
    }

    const out = arcsFrom(g, arcs, u);
    const arc = out.find((a) => r(a) > 0 && st.h[u] > st.h[a.v]);
    if (arc) {
      const v = arc.v;
      const ra = r(arc);
      const exU = st.ex[u];
      const delta = Math.min(exU, ra);
      const res = augmentArc(g, st.f, arc, delta);
      st.f = res.f;
      st.ex[u] -= delta;
      st.ex[v] += delta;
      const saturating = delta === ra;
      st.pushes++;
      if (saturating) st.satPushes++;
      st.push = { arc: arc.id, delta, saturating };
      if (st.ex[u] === 0) st.P = st.P.filter((x) => x !== u);
      if (inner(v) && st.ex[v] > 0 && !st.P.includes(v)) st.P.push(v);
      st.value = st.ex[s];
      st.H = highest();
      let how = "";
      if (res.delta > 0) {
        const back = edgeName(g, v, u);
        how =
          res.delta === delta
            ? ` proti směru hrany ${back}`
            : ` proti směru hrany ${back} (tok po ní klesne o ${fmtNum(res.delta)}, po ${edgeName(g, u, v)} vzroste o ${fmtNum(delta - res.delta)})`;
      }
      const kind = saturating
        ? `nasycené převedení, r(${edgeName(g, u, v)}) = 0`
        : `nenasycené převedení, přebytek v ${L(u)} klesl na 0`;
      const after = [u, v]
        .filter((x) => x !== z)
        .map((x) => `${L(x)} ${fmtNum(st.ex[x])}`)
        .join(", ");
      yield snap(
        st,
        GOLDBERG_LINES.push,
        `Převedeme přebytek po hraně ${edgeName(g, u, v)} (h ${st.h[u]} → ${st.h[v]})${how}: δ = min(${fmtNum(exU)}, ${fmtNum(ra)}) = ${fmtNum(delta)} – ${kind}. Přebytky: ${after}.`,
      );
      if (st.ex[u] === 0) prev = null;
    } else {
      const withR = out.filter((a) => r(a) > 0);
      const from = st.h[u];
      st.h[u] = from + 1;
      st.lifts++;
      st.lift = { v: u, from };
      st.H = highest();
      const one = withR.length === 1;
      const why = withR.length
        ? `(rezervu ${one ? "má" : "mají"} ${withR.map((a) => edgeName(g, a.u, a.v)).join(", ")} ve ${one ? "výšce" : "výškách"} ${withR.map((a) => st.h[a.v]).join(", ")})`
        : "(z u nevede žádná hrana s rezervou)";
      yield snap(
        st,
        GOLDBERG_LINES.lift,
        `Z ${L(u)} nevede žádná hrana s kladnou rezervou dolů ${why} → zvedneme ${L(u)}: h(${L(u)}) = ${from} → ${st.h[u]}.`,
      );
    }
  }

  /* ---- výstup ---- */
  st.u = null;
  st.push = null;
  st.lift = null;
  st.H = null;
  st.done = true;
  st.value = st.ex[s];
  const cut = cutOf(net, st.f);
  st.cut = { A: cut.A, edges: cut.edges };
  const m = matchingOf(net, st.f);
  st.matching = m ? m.edges : null;
  const ops = `${plural(st.pushes, "převedení", "převedení", "převedení")}, z toho ${st.satPushes} ${st.satPushes === 1 ? "nasycené" : "nasycených"}; ${plural(st.lifts, "zvednutí", "zvednutí", "zvednutí")}`;
  const cutList = cut.edges.map((e) => edgeName(g, g.edges[e].u, g.edges[e].v));
  const tail = m
    ? ` = největší párování (${m.pairs.length}): ${m.pairs.map(([a, b]) => `${L(a)}–${L(b)}`).join(", ") || "žádná hrana"}.`
    : `. Minimální řez E(A, B) s A = ${setText(g, cut.A)} má kapacitu ${fmtNum(cut.capacity)}${cutList.length ? ` (${cutList.join(", ")})` : ""} – certifikát maximality.`;
  yield snap(
    st,
    GOLDBERG_LINES.output,
    `Hotovo – žádný vrchol kromě z a s nemá přebytek, vlna je tok: maximální tok |f| = ${fmtNum(st.value)} (${ops})${tail}`,
  );
}
