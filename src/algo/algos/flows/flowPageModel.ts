/**
 * Model stránek toků (#/flow/ford-fulkerson, #/flow/dinic) bez Reactu: vstup z odkazu a do odkazu,
 * náhodná síť, síť párování z bipartitního grafu, nabídka akcí. Stránka (flowPage.tsx) jen drží stav.
 * Testy ve flowPageModel.test.ts.
 *
 * Odkaz: `ex=<id>` příklad z knihy (výchozí příklad modulu = prázdná adresa), jinak `g=` text hran „u v c“
 * a `xy=` kresba (formát jako u grafů, encodeXY); `xy=` i u příkladu s posunutým vrcholem. `z=`, `s=` zdroj
 * a stok, když nejsou výchozí; `cesta=bfs|dfs` hledání cesty, když se liší od výchozího pro příklad;
 * `v=po-smeru` varianta zlepšování jen po směru hran (jen FordFulkerson).
 */
import type { ActionDef } from "../../core/actionModel";
import { strArg, numArg } from "../../core/actionModel";
import { rng } from "../../core/steps";
import {
  cmpLabel,
  layoutGraph,
  parseGraphInput,
  plural,
  type GEdge,
  type GNode,
  type Graph,
} from "../graphs/graph";
import {
  decodeXY,
  encodeXY,
  formatWeights,
  graphStructureKey,
  parseWeights,
  weightsOrder,
} from "../graphs/graphPageModel";
import { graphEditText } from "../../views/graphEdit";
import {
  defaultEnds,
  FLOW_MAX_CAP,
  FLOW_MAX_EDGES,
  FLOW_MAX_NODES,
  netProblem,
  type FlowNet,
} from "./flowNet";
import {
  flowPresetById,
  matchingAspect,
  presetNet,
  presetView,
  presetsFor,
  type FlowModule,
  type FlowPreset,
} from "./flowPresets";
import type { PathSearch } from "./fordFulkerson";

export type FlowKind = FlowModule;
/** FordFulkerson s rezervami (str. 355), nebo chybné zlepšování jen po směru hran (str. 354) */
export type FlowVariant = "rezervy" | "po-smeru";

export interface FlowInput {
  /** síť na plátně (orientovaná, w = kapacita) */
  graph: Graph;
  /** popisek zdroje / stoku; null = výchozí (vrchol „z“ / „s“, jinak první / poslední) */
  z: string | null;
  s: string | null;
  /** příklad z knihy, jehož síť graf drží (po úpravě null) */
  example: string | null;
}

export interface FlowSettings {
  search: PathSearch;
  variant: FlowVariant;
}

/** výchozí příklad modulu: FordFulkerson obr. 14.2, Dinic obr. 14.7 */
export function defaultExample(kind: FlowKind): FlowPreset {
  return flowPresetById(kind === "ff" ? "obr-14-2" : "obr-14-7")!;
}

export function exampleInput(p: FlowPreset): FlowInput {
  return { graph: presetView(p), z: null, s: null, example: p.id };
}

export const defaultSettings = (
  p: FlowPreset | null | undefined,
): FlowSettings => ({ search: p?.search ?? "bfs", variant: "rezervy" });

/** Síť pro algoritmus: zdroj a stok podle popisků, jinak výchozí. */
export function netOf(input: FlowInput): FlowNet {
  const g = input.graph;
  const ends = defaultEnds(g);
  const by = (l: string | null) =>
    l === null ? undefined : g.nodes.find((n) => n.label === l)?.id;
  return { graph: g, z: by(input.z) ?? ends.z, s: by(input.s) ?? ends.s };
}

/** klíč struktury sítě příkladu (počítá se jednou – stránka se ptá při každém vykreslení) */
const presetKeys = new Map<string, string>();
function presetKey(p: FlowPreset): string {
  let k = presetKeys.get(p.id);
  if (k === undefined) {
    k = graphStructureKey(presetNet(p).graph);
    presetKeys.set(p.id, k);
  }
  return k;
}

/**
 * Poznámka k náhradnímu zdroji / stoku (F-09): zvolený vrchol (výchozí „z“ / „s“) v síti není a netOf vzal
 * náhradní (defaultEnds – první / poslední vrchol). null = oba jsou v síti, nebo síť nejde použít vůbec
 * (méně než 2 vrcholy, z = s – to hlásí netProblem).
 */
export function endsNote(input: FlowInput): string | null {
  const g = input.graph;
  const net = netOf(input);
  if (g.nodes.length < 2 || net.z === net.s) return null;
  const has = (l: string) => g.nodes.some((n) => n.label === l);
  const out: string[] = [];
  const zWant = input.z ?? "z";
  const sWant = input.s ?? "s";
  if (!has(zWant))
    out.push(
      `Zdroj ${zWant} v síti chybí – použije se ${g.nodes[net.z]?.label}.`,
    );
  if (!has(sWant))
    out.push(
      `Stok ${sWant} v síti chybí – použije se ${g.nodes[net.s]?.label}.`,
    );
  return out.length ? out.join(" ") : null;
}

/** Příklad, jehož síť (bez souřadnic) graf je – přednost má `prefer` (obr. 14.2 a 14.4 mají stejnou síť). */
export function exampleOf(
  kind: FlowKind,
  g: Graph,
  prefer: string | null,
): string | null {
  const key = graphStructureKey(g);
  const same = (p: FlowPreset) => presetKey(p) === key;
  const pref = flowPresetById(prefer);
  if (pref && pref.modules.includes(kind) && same(pref)) return pref.id;
  return presetsFor(kind).find(same)?.id ?? null;
}

/** Počáteční tok: jen u nezměněné sítě příkladu, který ho má (obr. 14.4 – tok z obr. 14.2 vpravo). */
export function initFlowFor(input: FlowInput): {
  init: number[] | null;
  label?: string;
} {
  const p = flowPresetById(input.example);
  if (!p?.init) return { init: null };
  const { graph, init } = presetNet(p);
  if (graphStructureKey(graph) !== graphStructureKey(input.graph))
    return { init: null };
  return { init, label: p.initLabel };
}

/* ------------------------------------------------------------------ odkaz */

const posKey = (g: Graph) =>
  g.nodes.map((n) => `${Math.round(n.x * 1e4)},${Math.round(n.y * 1e4)}`);

/** xy= pro graf: souřadnice v pořadí vrcholů, jak je přečte parseGraphInput z textu `text` */
function xyFor(g: Graph, text: string): string {
  const order = parseGraphInput(text, true, true, { layout: false }).graph
    .nodes;
  const byLabel = new Map(g.nodes.map((n) => [n.label, n]));
  const pts = order.map((o) => {
    const n = byLabel.get(o.label);
    return [n?.x ?? 0, n?.y ?? 0] as const;
  });
  return encodeXY(pts, g.aspect ?? null);
}

/** Souřadnice z xy= na graf (mutuje); false = xy nešlo použít. */
function applyXY(g: Graph, xy: string): boolean {
  const d = decodeXY(xy);
  if (!d || d.pts.length !== g.nodes.length) return false;
  g.nodes.forEach((n, i) => {
    [n.x, n.y] = d.pts[i];
  });
  if (d.aspect === null) delete g.aspect;
  else if (d.aspect !== undefined) g.aspect = d.aspect;
  for (const e of g.edges) delete e.bend;
  return true;
}

/** Vstup a nastavení z odkazu; vadné části → výchozí s hláškou (`problem`). */
export function flowFromParams(
  kind: FlowKind,
  params: URLSearchParams,
): { input: FlowInput; settings: FlowSettings; problem: string | null } {
  const problems: string[] = [];
  const def = defaultExample(kind);
  let input = exampleInput(def);
  const ex = params.get("ex");
  const gText = params.get("g");
  const xy = params.get("xy");
  if (gText !== null) {
    const parsed = parseGraphInput(gText, true, true, { layout: false });
    if (parsed.errors.length || !parsed.graph.nodes.length)
      problems.push(
        `Síť z odkazu nešla použít (${parsed.errors[0]?.message ?? "je prázdná"}) – zobrazen výchozí příklad.`,
      );
    else {
      const g = parsed.graph;
      if (!(xy && applyXY(g, xy))) {
        layoutGraph(g);
        if (xy)
          problems.push(
            "Souřadnice vrcholů z odkazu nešly použít – síť je rozložena automaticky.",
          );
      }
      input = {
        graph: g,
        z: null,
        s: null,
        example: exampleOf(kind, g, ex),
      };
    }
  } else if (ex !== null) {
    const p = flowPresetById(ex);
    if (!p || !p.modules.includes(kind))
      problems.push(
        `Příklad „${ex}“ z odkazu neznám – zobrazen výchozí příklad.`,
      );
    else input = exampleInput(p);
  }
  if (gText === null && xy !== null) {
    const g = {
      ...input.graph,
      nodes: input.graph.nodes.map((n) => ({ ...n })),
    };
    g.edges = g.edges.map((e) => ({ ...e }));
    if (applyXY(g, xy)) input = { ...input, graph: g };
    else
      problems.push(
        "Souřadnice vrcholů z odkazu nešly použít – síť je nakreslená jako v knize.",
      );
  }
  const has = (l: string) => input.graph.nodes.some((n) => n.label === l);
  for (const [k, what] of [
    ["z", "Zdroj"],
    ["s", "Stok"],
  ] as const) {
    const l = params.get(k);
    if (l === null) continue;
    if (has(l)) input = { ...input, [k]: l };
    else problems.push(`${what} „${l}“ z odkazu v síti není – použit výchozí.`);
  }
  const bad = netProblem(netOf(input));
  if (bad) {
    problems.push(
      `Síť z odkazu nešla použít: ${bad} Zobrazen výchozí příklad.`,
    );
    input = exampleInput(def);
  }
  const settings = defaultSettings(flowPresetById(input.example));
  const cesta = kind === "ff" ? params.get("cesta") : null;
  if (cesta === "bfs" || cesta === "dfs") settings.search = cesta;
  else if (cesta !== null)
    problems.push(
      `Hledání cesty „${cesta}“ neznám (bfs nebo dfs) – použito ${settings.search.toUpperCase()}.`,
    );
  const v = params.get("v");
  if (kind === "ff" && v !== null) {
    if (v === "po-smeru" || v === "rezervy") settings.variant = v;
    else
      problems.push(
        `Varianta „${v}“ z odkazu neexistuje – použita výchozí (s rezervami).`,
      );
  }
  return {
    input,
    settings,
    problem: problems.length ? problems.join(" ") : null,
  };
}

/** Parametry odkazu pro aktuální vstup a nastavení (výchozí příklad = prázdná adresa). */
export function flowParams(
  kind: FlowKind,
  input: FlowInput,
  settings: FlowSettings,
): Record<string, string> {
  const out: Record<string, string> = {};
  const g = input.graph;
  const id = exampleOf(kind, g, input.example);
  const p = flowPresetById(id);
  if (p) {
    const book = presetView(p);
    const moved =
      posKey(book).join(";") !== posKey(g).join(";") ||
      Math.round((book.aspect ?? 0) * 1e4) !==
        Math.round((g.aspect ?? 0) * 1e4);
    if (p.id !== defaultExample(kind).id || moved) out.ex = p.id;
    if (moved) out.xy = xyFor(g, p.preset.text);
  } else {
    const text = graphEditText(g);
    out.g = text;
    out.xy = xyFor(g, text);
  }
  const ends = defaultEnds(g);
  const lab = (v: number) => g.nodes[v]?.label;
  if (input.z !== null && input.z !== lab(ends.z)) out.z = input.z;
  if (input.s !== null && input.s !== lab(ends.s)) out.s = input.s;
  if (kind === "ff" && settings.search !== (p?.search ?? "bfs"))
    out.cesta = settings.search;
  if (kind === "ff" && settings.variant !== "rezervy") out.v = settings.variant;
  return out;
}

/* ------------------------------------------------------------------ náhodná síť */

/** na 4 desetinná místa – kresba se přes xy= v odkazu obnoví přesně */
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** popisky vnitřních vrcholů (bez z a s) */
const INNER = [..."abcdefghijklmnopqrtuvwxy"];
export const RANDOM_N = 8;
/** semínko náhodné sítě (čas) – mimo komponentu, ať se v renderu nevolá nečistá funkce */
export const randomSeed = () => Date.now() % 1_000_000;
export const RANDOM_M = 12;
export const RANDOM_MAX_N = 20;

/** Nejmenší a největší počet hran náhodné sítě s n vrcholy (kostra cest ze z do s / bez protisměrných hran). */
export function randomEdgeBounds(n: number): { min: number; max: number } {
  const inner = Math.max(1, Math.min(RANDOM_MAX_N, n) - 2);
  const cols = Math.max(1, Math.ceil(inner / 3));
  const first = Math.ceil(inner / cols);
  const max = Math.min(FLOW_MAX_EDGES, ((inner + 2) * (inner + 1)) / 2);
  return { min: first + inner, max };
}

/**
 * Náhodná síť: z vlevo, s vpravo, vnitřní vrcholy ve sloupcích po třech. Kostra hran zaručí cestu ze z do s
 * přes každý vrchol, zbytek do m jsou náhodné hrany převážně dopředu; kapacity 1–9, bez protisměrných hran.
 */
export function randomNet(n: number, m: number, seed: number): Graph {
  const r = rng(seed);
  const inner = Math.max(1, Math.min(RANDOM_MAX_N, n) - 2);
  const cols = Math.max(1, Math.ceil(inner / 3));
  const col: number[][] = Array.from({ length: cols }, () => []);
  for (let k = 0; k < inner; k++)
    col[Math.floor((k * cols) / inner)].push(k + 1);
  const rows = Math.max(2, ...col.map((c) => c.length));
  const nodes: GNode[] = [{ id: 0, label: "z", x: 0, y: 0.5 }];
  col.forEach((c, ci) =>
    c.forEach((v, i) => {
      // sloupce se střídavě posunou o půl řádku, ať hrany přes dva sloupce nevedou přes vrcholy
      const shift = c.length < rows ? 0 : ci % 2 ? 0.25 : -0.25;
      nodes[v] = {
        id: v,
        label: INNER[v - 1],
        x: r4((ci + 1) / (cols + 1)),
        y: r4(
          Math.max(
            0,
            Math.min(
              1,
              ((rows - c.length) / 2 + i + shift + 0.25) / (rows - 0.5),
            ),
          ),
        ),
      };
    }),
  );
  const s = inner + 1;
  nodes.push({ id: s, label: "s", x: 1, y: 0.5 });
  const colOf = (v: number) =>
    v === 0 ? -1 : v === s ? cols : col.findIndex((c) => c.includes(v));
  const edges: GEdge[] = [];
  const have = new Set<string>();
  const cap = () => 1 + Math.floor(r() * 9);
  const add = (u: number, v: number) => {
    if (u === v || have.has(`${u}>${v}`) || have.has(`${v}>${u}`)) return false;
    have.add(`${u}>${v}`);
    edges.push({ id: edges.length, u, v, w: cap() });
    return true;
  };
  for (const v of col[0]) add(0, v);
  for (let ci = 0; ci < cols; ci++)
    for (const v of col[ci]) {
      const next = ci + 1 < cols ? col[ci + 1] : [s];
      add(v, next[Math.floor(r() * next.length)]);
    }
  const target = Math.min(m, randomEdgeBounds(n).max);
  for (let tries = 0; edges.length < target && tries < 400; tries++) {
    const u = Math.floor(r() * (s + 1));
    const v = Math.floor(r() * (s + 1));
    if (u === s || v === 0) continue;
    // převážně dopředu (do dalšího sloupce nebo ob jeden), občas uvnitř sloupce nebo zpět
    const d = colOf(v) - colOf(u);
    if ((d < 1 || d > 2) && r() < 0.8) continue;
    add(u, v);
  }
  const aspect = r4(Math.max(1.4, Math.min(2.6, ((cols + 1) * 1.6) / rows)));
  return { directed: true, weighted: true, nodes, edges, aspect };
}

/* ------------------------------------------------------------------ párování */

/**
 * Síť pro největší párování z bipartitního grafu (14.3): dvojice „L R“ oddělené čárkou (středníkem, řádkem).
 * Hrany zleva doprava, zdroj z do levé partity, z pravé do stoku s, všude kapacita 1; kresba jako obr. 14.6.
 */
export function bipartiteNet(text: string): {
  graph: Graph | null;
  error: string | null;
  note: string | null;
} {
  const fail = (error: string) => ({ graph: null, error, note: null });
  const pairs = text
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(/[\s–-]+/).filter(Boolean));
  if (!pairs.length)
    return fail("Zadejte aspoň jednu dvojici „L R“ (např. L1 R2, L1 R3).");
  const bad = pairs.find((p) => p.length !== 2);
  if (bad)
    return fail(
      `„${bad.join(" ")}“ není dvojice – pište dvojice vrcholů „L R“ oddělené čárkou.`,
    );
  const left: string[] = [];
  const right: string[] = [];
  const seen = new Set<string>();
  const kept: [string, string][] = [];
  let dup = 0;
  for (const [a, b] of pairs as [string, string][]) {
    if ([a, b].some((x) => x === "z" || x === "s"))
      return fail(
        "Jména z a s patří zdroji a stoku – vrcholy pojmenujte jinak.",
      );
    if (right.includes(a) || left.includes(b) || a === b)
      return fail(
        `Vrchol ${right.includes(a) || a === b ? a : b} je na obou stranách – graf musí být bipartitní (levá a pravá partita).`,
      );
    if (!left.includes(a)) left.push(a);
    if (!right.includes(b)) right.push(b);
    if (seen.has(`${a}>${b}`)) {
      dup++;
      continue;
    }
    seen.add(`${a}>${b}`);
    kept.push([a, b]);
  }
  left.sort(cmpLabel);
  right.sort(cmpLabel);
  const n = left.length + right.length + 2;
  const m = kept.length + left.length + right.length;
  if (n > FLOW_MAX_NODES || m > FLOW_MAX_EDGES)
    return fail(
      `Síť by měla ${plural(n, "vrchol", "vrcholy", "vrcholů")} a ${plural(m, "hranu", "hrany", "hran")} – nejvýše ${FLOW_MAX_NODES} a ${FLOW_MAX_EDGES}.`,
    );
  const rows = Math.max(left.length, right.length);
  const y = (i: number, k: number) =>
    rows === 1 ? 0.5 : r4(((rows - k) / 2 + i) / (rows - 1));
  const nodes: GNode[] = [];
  const id = new Map<string, number>();
  const node = (label: string, x: number, yy: number) => {
    id.set(label, nodes.length);
    nodes.push({ id: nodes.length, label, x, y: yy });
  };
  node("z", 0, 0.5);
  left.forEach((l, i) => node(l, r4(1 / 3), y(i, left.length)));
  right.forEach((l, i) => node(l, r4(2 / 3), y(i, right.length)));
  node("s", 1, 0.5);
  const edges: GEdge[] = [];
  const add = (a: string, b: string) =>
    edges.push({ id: edges.length, u: id.get(a)!, v: id.get(b)!, w: 1 });
  for (const l of left) add("z", l);
  for (const [a, b] of kept) add(a, b);
  for (const r of right) add(r, "s");
  const aspect = matchingAspect(rows);
  return {
    graph: { directed: true, weighted: true, nodes, edges, aspect },
    error: null,
    note: dup ? `Opakované dvojice vynechány (${dup}).` : null,
  };
}

/** výchozí text akce Párování (malý bipartitní graf) */
export const BIPARTITE_DEFAULT = "L1 R1, L1 R2, L2 R1, L3 R2, L3 R3, L4 R3";

/* ------------------------------------------------------------------ akce */

export interface FlowHandlers {
  random: (n: number, m: number) => void;
  /** prázdná síť (jen z a s) a režim Upravit síť */
  empty: () => void;
  bipartite: (text: string) => void;
  loadExample: (id: string) => void;
  /** spustit algoritmus se zdrojem a stokem (popisky) */
  run: (z: string, s: string) => void;
  setCapacities: (cs: number[]) => void;
  /** tatáž síť v druhém algoritmu */
  /** tatáž síť v jiném algoritmu na maximální tok (druhý z FF / Dinic, nebo Goldberg) */
  switchAlgo: (target: FlowKind | "goldberg") => void;
}

export const OP_NAME: Record<FlowKind, string> = {
  ff: "FordFulkerson",
  dinic: "Dinic",
};

/** Kapacity z pole: celá čísla 0…FLOW_MAX_CAP v pořadí hran (jinak text chyby). */
export function parseCapacities(
  text: string,
  count: number,
): { values: number[]; error: string | null; note: string | null } {
  const r = parseWeights(text, Math.max(1, count));
  if (r.error) return r;
  if (r.values.some((v) => !Number.isInteger(v) || v < 0 || v > FLOW_MAX_CAP))
    return {
      values: [],
      error: `Kapacity musí být celá čísla 0 až ${FLOW_MAX_CAP}.`,
      note: null,
    };
  return r;
}

export function flowActionDefs(
  kind: FlowKind,
  input: FlowInput,
  h: FlowHandlers,
): ActionDef[] {
  const g = input.graph;
  const net = netOf(input);
  const labels = g.nodes.map((n) => n.label).sort(cmpLabel);
  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    title: "Náhodná síť, prázdné plátno nebo síť pro párování",
    variants: [
      {
        id: "random",
        label: "Náhodně",
        title: "Náhodná síť se zdrojem z a stokem s, kapacity 1–9",
        args: [
          {
            kind: "int",
            name: "n",
            label: "vrcholů n =",
            min: 3,
            max: RANDOM_MAX_N,
            default: RANDOM_N,
          },
          {
            kind: "int",
            name: "m",
            label: "hran m =",
            min: 1,
            max: FLOW_MAX_EDGES,
            default: RANDOM_M,
          },
        ],
      },
      {
        id: "empty",
        label: "Prázdná – nakreslit",
        title: "Jen zdroj z a stok s, zbytek nakreslíte v režimu Upravit síť",
      },
      {
        id: "bipartite",
        label: "Párování",
        title:
          "Bipartitní graf jako dvojice „L R“ – síť se zdrojem a stokem vznikne jako na obr. 14.6",
        args: [
          {
            kind: "text",
            name: "pairs",
            label: "hrany =",
            width: "24ch",
            default: BIPARTITE_DEFAULT,
            check: (v) => bipartiteNet(String(v)).error,
            notice: (v) => bipartiteNet(String(v)).note,
          },
        ],
      },
    ],
    notice: (v, variant) => {
      if (variant !== "random") return null;
      const n = numArg(v, "n");
      const m = numArg(v, "m");
      const b = randomEdgeBounds(n);
      if (m < b.min)
        return `m zvýšeno na ${b.min} (každý vrchol leží na cestě ze z do s).`;
      if (m > b.max) return `m omezeno na ${b.max}.`;
      return null;
    },
    run: (v, variant) => {
      if (variant === "random") h.random(numArg(v, "n"), numArg(v, "m"));
      else if (variant === "empty") h.empty();
      else if (variant === "bipartite") h.bipartite(strArg(v, "pairs"));
    },
  };
  const book: ActionDef = {
    id: "book",
    label: "Příklady z knihy",
    title: "Sítě z Průvodce labyrintem algoritmů, nakreslené jako v knize",
    variants: presetsFor(kind).map((p) => ({
      id: p.id,
      label: p.label,
      title: `Průvodce labyrintem algoritmů, s. ${p.page}`,
    })),
    selectedVariant: exampleOf(kind, g, input.example),
    run: (_, v) => {
      if (v) h.loadExample(v);
    },
  };
  const zLabel = g.nodes[net.z]?.label ?? labels[0] ?? "";
  const sLabel = g.nodes[net.s]?.label ?? labels[labels.length - 1] ?? "";
  const run: ActionDef = {
    id: "run",
    label: `${OP_NAME[kind]}(z, s)`,
    title: `${OP_NAME[kind]}: připraví běh ze zdroje z do stoku s, ▶ ho přehraje`,
    disabledReason:
      g.nodes.length === 0
        ? "Síť je prázdná – nakreslete ji (Upravit síť) nebo vyberte příklad"
        : g.nodes.length < 2
          ? "Síť potřebuje aspoň zdroj a stok"
          : null,
    args: [
      {
        kind: "choice",
        name: "z",
        label: "z =",
        options: labels.map((l) => ({ value: l, label: l })),
        default: zLabel,
      },
      {
        kind: "choice",
        name: "s",
        label: "s =",
        options: labels.map((l) => ({ value: l, label: l })),
        default: sLabel,
      },
    ],
    check: (v) =>
      strArg(v, "z") === strArg(v, "s")
        ? "Zdroj z a stok s musí být různé vrcholy."
        : null,
    run: (v) => h.run(strArg(v, "z"), strArg(v, "s")),
  };
  const capsText = formatWeights(g.edges.map((e) => e.w));
  const caps: ActionDef = {
    id: "caps",
    label: "Kapacity hran",
    title: g.edges.length
      ? `Kapacity v pořadí hran ${weightsOrder(g)}`
      : undefined,
    goLabel: "Nastavit",
    disabledReason: g.edges.length
      ? null
      : "Síť nemá hrany – nakreslete je (Upravit síť: tah z vrcholu na vrchol)",
    args: [
      {
        kind: "text",
        name: "c",
        label: "c =",
        width: `${Math.min(36, Math.max(10, capsText.length + 3))}ch`,
        default: capsText,
        check: (v) => parseCapacities(String(v), g.edges.length).error,
        notice: (v) => parseCapacities(String(v), g.edges.length).note,
      },
    ],
    run: (v) =>
      h.setCapacities(parseCapacities(strArg(v, "c"), g.edges.length).values),
  };
  const other: ActionDef = {
    id: "algo",
    label: "Jiný alg.",
    title: "Tatáž síť v jiném algoritmu na maximální tok",
    variants: [
      kind === "ff"
        ? { id: "dinic", label: "Dinicův algoritmus" }
        : { id: "ff", label: "Fordův–Fulkersonův algoritmus" },
      { id: "goldberg", label: "Goldbergův algoritmus" },
    ],
    selectedVariant: null,
    run: (_, v) =>
      h.switchAlgo(
        v === "goldberg" ? "goldberg" : kind === "ff" ? "dinic" : "ff",
      ),
  };
  return [create, book, run, caps, other];
}

/** Název operace nad zprávou: „FordFulkerson(z, s) · BFS“, „Dinic(z, s)“. */
export function flowOpTitle(
  kind: FlowKind,
  net: FlowNet,
  settings: FlowSettings,
): string {
  const l = (v: number) => net.graph.nodes[v]?.label ?? "?";
  const base = `${OP_NAME[kind]}(${l(net.z)}, ${l(net.s)})`;
  if (kind === "dinic") return base;
  return `${base} · ${settings.search.toUpperCase()}${settings.variant === "po-smeru" ? " · jen po směru" : ""}`;
}
