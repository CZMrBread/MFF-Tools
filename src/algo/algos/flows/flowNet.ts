/**
 * Síť pro toky (Průvodce kap. 14): orientovaný graf s kapacitami c(e) = cena hrany, zdroj z a stok s.
 * Čisté funkce bez Reactu – rezervy, velikost toku, kontrola toku, minimální řez a párování (testy
 * ve flowNet.test.ts). Tok je pole f[id hrany].
 *
 * Kniha předpokládá symetrickou síť (chybějící protihrana má kapacitu 0, str. 352). Tady se protihrany
 * nepřidávají – síť rezerv má pro každou dvojici sousedů dva oblouky (Arc) a rezerva oblouku uv je
 * r(uv) = c(uv) − f(uv) + f(vu), kde chybějící hrana má c = f = 0 (str. 355).
 */
import {
  cmpLabel,
  fmtNum,
  parseGraphInput,
  plural,
  type Graph,
} from "../graphs/graph";

/** největší kapacita hrany (celá čísla – algoritmus se zastaví, str. 356) */
export const FLOW_MAX_CAP = 999;
/** největší síť, kterou stránka přijme (vejde se na plátno a krokování nezamrzne) */
export const FLOW_MAX_NODES = 30;
export const FLOW_MAX_EDGES = 80;

export interface FlowNet {
  /** orientovaný ohodnocený graf, w = kapacita c(e) */
  graph: Graph;
  /** zdroj */
  z: number;
  /** stok (spotřebič) */
  s: number;
}

/** Oblouk sítě rezerv u→v: hrana sítě po směru (`fwd`) a v protisměru (`back`), každá může chybět. */
export interface Arc {
  id: number;
  u: number;
  v: number;
  /** id hrany u→v sítě, nebo null */
  fwd: number | null;
  /** id hrany v→u sítě, nebo null */
  back: number | null;
}

/** popisek vrcholu */
export const lbl = (g: Graph, v: number) => g.nodes[v]?.label ?? "?";
/** „a→d“ */
export const edgeName = (g: Graph, u: number, v: number) =>
  `${lbl(g, u)}→${lbl(g, v)}`;

/** Zdroj a stok podle popisků „z“ a „s“ (jako v knize), jinak první a poslední vrchol. */
export function defaultEnds(g: Graph): { z: number; s: number } {
  const by = (l: string) => g.nodes.find((n) => n.label === l)?.id;
  return {
    z: by("z") ?? 0,
    s: by("s") ?? Math.max(0, g.nodes.length - 1),
  };
}

/** Síť z textu hran „u v c“ (testy, předvolby): orientovaná, ohodnocená, z a s podle defaultEnds. */
export function netFromText(text: string): FlowNet {
  const graph = parseGraphInput(text, true, true).graph;
  return { graph, ...defaultEnds(graph) };
}

/**
 * Proč síť nejde použít (text chyby), nebo null. Kapacity jen celá čísla 0…FLOW_MAX_CAP, bez smyček
 * a dvou hran stejným směrem (sečtěte je do jedné).
 */
export function netProblem(net: FlowNet): string | null {
  const g = net.graph;
  const n = g.nodes.length;
  const m = g.edges.length;
  if (n === 0)
    return "Síť je prázdná – nakreslete ji (Upravit síť) nebo vyberte příklad.";
  if (!g.directed) return "Síť musí být orientovaný graf.";
  if (n > FLOW_MAX_NODES || m > FLOW_MAX_EDGES)
    return `Síť je na krokování příliš velká (${plural(n, "vrchol", "vrcholy", "vrcholů")}, ${plural(m, "hrana", "hrany", "hran")}) – nejvýše ${FLOW_MAX_NODES} vrcholů a ${FLOW_MAX_EDGES} hran.`;
  const valid = (v: number) => Number.isInteger(v) && v >= 0 && v < n;
  if (!valid(net.z) || !valid(net.s))
    return "Zdroj nebo stok v síti není – vyberte je z jejích vrcholů.";
  if (net.z === net.s) return "Zdroj z a stok s musí být různé vrcholy.";
  const seen = new Set<string>();
  for (const e of g.edges) {
    if (e.u === e.v)
      return `Smyčka ${edgeName(g, e.u, e.v)} v síti nemá smysl – smažte ji.`;
    const k = `${e.u}>${e.v}`;
    if (seen.has(k))
      return `Dvě hrany ${edgeName(g, e.u, e.v)} – sloučte je do jedné (kapacity sečtěte).`;
    seen.add(k);
    if (!Number.isInteger(e.w) || e.w < 0 || e.w > FLOW_MAX_CAP)
      return `Kapacita hrany ${edgeName(g, e.u, e.v)} musí být celé číslo 0 až ${FLOW_MAX_CAP} (je ${fmtNum(e.w)}).`;
  }
  return null;
}

/**
 * Oblouky sítě rezerv: pro každou hranu uv sítě oblouk uv a za ním vu (každý jen jednou), v pořadí hran.
 * id oblouku = index v poli.
 */
export function residualArcs(g: Graph): Arc[] {
  const edgeOf = new Map<string, number>();
  for (const e of g.edges)
    if (!edgeOf.has(`${e.u}>${e.v}`)) edgeOf.set(`${e.u}>${e.v}`, e.id);
  const arcs: Arc[] = [];
  const have = new Set<string>();
  const add = (u: number, v: number) => {
    const k = `${u}>${v}`;
    if (u === v || have.has(k)) return;
    have.add(k);
    arcs.push({
      id: arcs.length,
      u,
      v,
      fwd: edgeOf.get(k) ?? null,
      back: edgeOf.get(`${v}>${u}`) ?? null,
    });
  };
  for (const e of g.edges) {
    add(e.u, e.v);
    add(e.v, e.u);
  }
  return arcs;
}

/** r(uv) = c(uv) − f(uv) + f(vu) */
export function residual(
  g: Graph,
  f: readonly number[],
  a: Pick<Arc, "fwd" | "back">,
): number {
  const c = a.fwd === null ? 0 : (g.edges[a.fwd]?.w ?? 0);
  const fu = a.fwd === null ? 0 : (f[a.fwd] ?? 0);
  const fb = a.back === null ? 0 : (f[a.back] ?? 0);
  return c - fu + fb;
}

/** Oblouky z vrcholu u v pořadí podle popisku cíle (jako sousedé v ostatních grafových algoritmech). */
export function arcsFrom(g: Graph, arcs: readonly Arc[], u: number): Arc[] {
  return arcs
    .filter((a) => a.u === u)
    .sort((a, b) => cmpLabel(lbl(g, a.v), lbl(g, b.v)));
}

/** f⁺(v) − f⁻(v): přebytek ve vrcholu */
export function excess(g: Graph, f: readonly number[], v: number): number {
  let x = 0;
  for (const e of g.edges) {
    if (e.v === v) x += f[e.id] ?? 0;
    if (e.u === v) x -= f[e.id] ?? 0;
  }
  return x;
}

/** |f| = přebytek stoku */
export function flowValue(net: FlowNet, f: readonly number[]): number {
  return excess(net.graph, f, net.s);
}

/** Je f tok? Kapacity 0 ≤ f ≤ c a Kirchhoffův zákon mimo z, s; jinak text porušení. */
export function checkFlow(net: FlowNet, f: readonly number[]): string | null {
  const g = net.graph;
  for (const e of g.edges) {
    const x = f[e.id] ?? 0;
    if (x < 0 || x > e.w)
      return `Tok ${fmtNum(x)} po hraně ${edgeName(g, e.u, e.v)} překračuje kapacitu ${fmtNum(e.w)}.`;
  }
  for (const nd of g.nodes) {
    if (nd.id === net.z || nd.id === net.s) continue;
    const x = excess(g, f, nd.id);
    if (x !== 0)
      return `Ve vrcholu ${nd.label} neplatí Kirchhoffův zákon (přebytek ${fmtNum(x)}).`;
  }
  return null;
}

/** Tok podle klíčů „u>v“ (popisky) – předvolby a testy. Chybějící hrany mají tok 0. */
export function flowByKey(
  g: Graph,
  byKey: Readonly<Record<string, number>>,
): number[] {
  return g.edges.map((e) => byKey[`${lbl(g, e.u)}>${lbl(g, e.v)}`] ?? 0);
}

/**
 * Zlepšení toku po oblouku uv o ε (FordFulkerson ř. 5–7): δ = min{f(vu), ε} odečteme v protisměru,
 * zbytek ε − δ přičteme po směru. Vrací nový tok (vstup se nemění) a δ.
 */
export function augmentArc(
  g: Graph,
  f: readonly number[],
  a: Pick<Arc, "fwd" | "back">,
  eps: number,
): { f: number[]; delta: number } {
  const out = f.slice(0, g.edges.length);
  while (out.length < g.edges.length) out.push(0);
  const fb = a.back === null ? 0 : out[a.back];
  const delta = Math.min(fb, eps);
  if (a.back !== null) out[a.back] = fb - delta;
  if (a.fwd !== null) out[a.fwd] += eps - delta;
  return { f: out, delta };
}

/** Vrcholy dosažitelné ze z po obloucích s kladnou rezervou (levá množina řezu A, str. 357). */
export function reachable(
  net: FlowNet,
  f: readonly number[],
  arcs: readonly Arc[] = residualArcs(net.graph),
): boolean[] {
  const seen = net.graph.nodes.map(() => false);
  if (!net.graph.nodes[net.z]) return seen;
  seen[net.z] = true;
  const queue = [net.z];
  while (queue.length) {
    const u = queue.shift()!;
    for (const a of arcs)
      if (a.u === u && !seen[a.v] && residual(net.graph, f, a) > 0) {
        seen[a.v] = true;
        queue.push(a.v);
      }
  }
  return seen;
}

/** Řez E(A, B) k toku f: A = dosažitelné po nenasycených obloucích, hrany z A do B a kapacita c(A, B). */
export function cutOf(
  net: FlowNet,
  f: readonly number[],
): { A: number[]; edges: number[]; capacity: number } {
  const inA = reachable(net, f);
  const A = net.graph.nodes.filter((n) => inA[n.id]).map((n) => n.id);
  const edges = net.graph.edges
    .filter((e) => inA[e.u] && !inA[e.v])
    .map((e) => e.id);
  const capacity = edges.reduce((s, e) => s + net.graph.edges[e].w, 0);
  return { A, edges, capacity };
}

/**
 * Síť pro párování (14.3): hrany jen z → L, L → R a R → s, všechny s kapacitou 1, L a R disjunktní.
 * Pak hrany L → R s tokem 1 tvoří párování (dvojice vrcholů a id hran, v pořadí hran); jinak null.
 */
export function matchingOf(
  net: FlowNet,
  f: readonly number[],
): { pairs: [number, number][]; edges: number[] } | null {
  const g = net.graph;
  const left = new Set<number>();
  const right = new Set<number>();
  for (const e of g.edges) {
    if (e.w !== 1) return null;
    if (e.u === net.z) left.add(e.v);
    if (e.v === net.s) right.add(e.u);
  }
  if (!left.size || !right.size) return null;
  for (const v of left) if (right.has(v)) return null;
  const pairs: [number, number][] = [];
  const edges: number[] = [];
  for (const e of g.edges) {
    if (e.u === net.z && left.has(e.v)) continue;
    if (e.v === net.s && right.has(e.u)) continue;
    if (!left.has(e.u) || !right.has(e.v)) return null;
    if ((f[e.id] ?? 0) === 1) {
      pairs.push([e.u, e.v]);
      edges.push(e.id);
    }
  }
  return { pairs, edges };
}
