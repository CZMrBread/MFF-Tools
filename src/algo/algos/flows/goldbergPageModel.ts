/**
 * Model stránky Goldbergova algoritmu (#/flow/goldberg) bez Reactu: vstup z odkazu a do odkazu, příklady
 * z knihy a nabídka akcí. Testy v goldbergPageModel.test.ts. Síť, náhodná síť, párování a kapacity sdílí
 * s ostatními toky (flowPageModel.ts, flowNet.ts) – formát odkazu je stejný jako u nich:
 *
 * `ex=<id>` příklad z knihy (výchozí obr. 14.2 = prázdná adresa), jinak `g=` text hran „u v c“ a `xy=`
 * kresba (encodeXY); `xy=` i u příkladu s posunutým vrcholem. `z=`, `s=` zdroj a stok, když nejsou výchozí;
 * `v=nejvyssi` volba nejvyššího vrcholu (vylepšení 14.6).
 *
 * Kniha k Goldbergovi obrázek s příkladem nemá – nabídka bere sítě z obrázků 14.2, 14.3, 14.6 a 14.7
 * (stejné jako FordFulkerson a Dinic), obr. 14.4 ne (začíná tokem, Goldberg začíná vlnou).
 */
import type { ActionDef } from "../../core/actionModel";
import { numArg, strArg } from "../../core/actionModel";
import {
  cmpLabel,
  layoutGraph,
  parseGraphInput,
  type Graph,
} from "../graphs/graph";
import {
  decodeXY,
  encodeXY,
  formatWeights,
  graphStructureKey,
  weightsOrder,
} from "../graphs/graphPageModel";
import { graphEditText } from "../../views/graphEdit";
import { defaultEnds, netProblem, type FlowNet } from "./flowNet";
import {
  bipartiteNet,
  BIPARTITE_DEFAULT,
  netOf,
  parseCapacities,
  RANDOM_M,
  RANDOM_MAX_N,
  RANDOM_N,
  randomEdgeBounds,
  type FlowInput,
} from "./flowPageModel";
import { FLOW_MAX_EDGES } from "./flowNet";
import {
  flowPresetById,
  presetNet,
  presetView,
  type FlowPreset,
} from "./flowPresets";
import type { GoldbergVariant } from "./goldberg";

/** příklady z knihy v nabídce (pořadí nabídky) */
export const GOLDBERG_PRESET_IDS = [
  "obr-14-2",
  "obr-14-3",
  "obr-14-6",
  "obr-14-7",
] as const;
export const GOLDBERG_DEFAULT_EXAMPLE = "obr-14-2";

/** Poznámka pod příkladem: kniha Goldbergův příklad nemá, sítě jsou z FordFulkersona a Dinica. */
export const GOLDBERG_PRESET_NOTE =
  "Kniha k Goldbergovu algoritmu příklad nemá (obr. 14.8 jen ilustruje důkaz) – nabídka používá sítě z obrázků 14.2, 14.3, 14.6 a 14.7 jako Fordův–Fulkersonův a Dinicův algoritmus.";

const presets = (): FlowPreset[] =>
  GOLDBERG_PRESET_IDS.map((id) => flowPresetById(id)).filter(
    (p): p is FlowPreset => !!p,
  );
const presetById = (id: string | null | undefined) =>
  id && (GOLDBERG_PRESET_IDS as readonly string[]).includes(id)
    ? flowPresetById(id)
    : undefined;

export function goldbergExampleInput(p: FlowPreset): FlowInput {
  return { graph: presetView(p), z: null, s: null, example: p.id };
}

export const goldbergDefaultInput = () =>
  goldbergExampleInput(flowPresetById(GOLDBERG_DEFAULT_EXAMPLE)!);

const presetKeys = new Map<string, string>();
function presetKey(p: FlowPreset): string {
  let k = presetKeys.get(p.id);
  if (k === undefined) {
    k = graphStructureKey(presetNet(p).graph);
    presetKeys.set(p.id, k);
  }
  return k;
}

/** Příklad, jehož síť (bez souřadnic) graf je; přednost má `prefer`. */
export function goldbergExampleOf(
  g: Graph,
  prefer: string | null,
): string | null {
  const key = graphStructureKey(g);
  const same = (p: FlowPreset) => presetKey(p) === key;
  const pref = presetById(prefer);
  if (pref && same(pref)) return pref.id;
  return presets().find(same)?.id ?? null;
}

/* ------------------------------------------------------------------ odkaz */

const posKey = (g: Graph) =>
  g.nodes
    .map((n) => `${Math.round(n.x * 1e4)},${Math.round(n.y * 1e4)}`)
    .join(";");

/** xy= v pořadí vrcholů, jak je přečte parseGraphInput z textu `text` */
function xyFor(g: Graph, text: string): string {
  const order = parseGraphInput(text, true, true, { layout: false }).graph
    .nodes;
  const byLabel = new Map(g.nodes.map((n) => [n.label, n]));
  return encodeXY(
    order.map((o) => {
      const n = byLabel.get(o.label);
      return [n?.x ?? 0, n?.y ?? 0] as const;
    }),
    g.aspect ?? null,
  );
}

/** Souřadnice z xy= na kopii grafu; null = xy nešlo použít. */
function withXY(g: Graph, xy: string): Graph | null {
  const d = decodeXY(xy);
  if (!d || d.pts.length !== g.nodes.length) return null;
  const out: Graph = {
    ...g,
    nodes: g.nodes.map((n, i) => ({ ...n, x: d.pts[i][0], y: d.pts[i][1] })),
    edges: g.edges.map((e) => {
      const c = { ...e };
      delete c.bend;
      return c;
    }),
  };
  if (d.aspect === null) delete out.aspect;
  else if (d.aspect !== undefined) out.aspect = d.aspect;
  return out;
}

const VARIANTS: readonly GoldbergVariant[] = ["zakladni", "nejvyssi"];

/** Vstup a varianta z odkazu; vadné části → výchozí s hláškou (`problem`). */
export function goldbergFromParams(params: URLSearchParams): {
  input: FlowInput;
  variant: GoldbergVariant;
  problem: string | null;
} {
  const problems: string[] = [];
  let input = goldbergDefaultInput();
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
      let g: Graph | null = xy ? withXY(parsed.graph, xy) : null;
      if (!g) {
        g = parsed.graph;
        layoutGraph(g);
        if (xy)
          problems.push(
            "Souřadnice vrcholů z odkazu nešly použít – síť je rozložena automaticky.",
          );
      }
      input = { graph: g, z: null, s: null, example: goldbergExampleOf(g, ex) };
    }
  } else if (ex !== null) {
    const p = presetById(ex);
    if (!p)
      problems.push(
        `Příklad „${ex}“ z odkazu neznám – zobrazen výchozí příklad.`,
      );
    else input = goldbergExampleInput(p);
    if (p && xy !== null) {
      const g = withXY(input.graph, xy);
      if (g) input = { ...input, graph: g };
      else
        problems.push(
          "Souřadnice vrcholů z odkazu nešly použít – síť je nakreslená jako v knize.",
        );
    }
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
    input = goldbergDefaultInput();
  }
  let variant: GoldbergVariant = "zakladni";
  const v = params.get("v");
  if (v !== null) {
    if ((VARIANTS as readonly string[]).includes(v))
      variant = v as GoldbergVariant;
    else
      problems.push(
        `Varianta „${v}“ z odkazu neexistuje (nejvyssi) – použita základní.`,
      );
  }
  return {
    input,
    variant,
    problem: problems.length ? problems.join(" ") : null,
  };
}

/** Parametry odkazu (výchozí příklad v základní variantě = prázdná adresa). */
export function goldbergParams(
  input: FlowInput,
  variant: GoldbergVariant,
): Record<string, string> {
  const out: Record<string, string> = {};
  const g = input.graph;
  const p = presetById(goldbergExampleOf(g, input.example));
  if (p) {
    const book = presetView(p);
    const moved =
      posKey(book) !== posKey(g) ||
      Math.round((book.aspect ?? 0) * 1e4) !==
        Math.round((g.aspect ?? 0) * 1e4);
    if (p.id !== GOLDBERG_DEFAULT_EXAMPLE || moved) out.ex = p.id;
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
  if (variant !== "zakladni") out.v = variant;
  return out;
}

/* ------------------------------------------------------------------ akce */

export interface GoldbergHandlers {
  random: (n: number, m: number) => void;
  /** prázdná síť (jen z a s) a režim Upravit síť */
  empty: () => void;
  bipartite: (text: string) => void;
  loadExample: (id: string) => void;
  /** spustit algoritmus se zdrojem a stokem (popisky) */
  run: (z: string, s: string) => void;
  setCapacities: (cs: number[]) => void;
  /** tatáž síť v jiném algoritmu na maximální tok */
  switchAlgo: (kind: "ff" | "dinic") => void;
}

export function goldbergActionDefs(
  input: FlowInput,
  h: GoldbergHandlers,
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
    title:
      "Sítě z Průvodce labyrintem algoritmů (kniha má u Goldberga jen obrázky sítí z 14.2–14.4)",
    variants: presets().map((p) => ({
      id: p.id,
      label: p.label,
      title: `Průvodce labyrintem algoritmů, s. ${p.page}`,
    })),
    selectedVariant: goldbergExampleOf(g, input.example),
    run: (_, v) => {
      if (v) h.loadExample(v);
    },
  };
  const zLabel = g.nodes[net.z]?.label ?? labels[0] ?? "";
  const sLabel = g.nodes[net.s]?.label ?? labels[labels.length - 1] ?? "";
  const run: ActionDef = {
    id: "run",
    label: "Goldberg(z, s)",
    title: "Goldberg: připraví běh ze zdroje z do stoku s, ▶ ho přehraje",
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
      { id: "ff", label: "Fordův–Fulkersonův algoritmus" },
      { id: "dinic", label: "Dinicův algoritmus" },
    ],
    selectedVariant: null,
    run: (_, v) => h.switchAlgo(v === "dinic" ? "dinic" : "ff"),
  };
  return [create, book, run, caps, other];
}

/** Název operace nad zprávou: „Goldberg(z, s)“, „Goldberg(z, s) · nejvyšší vrchol“. */
export function goldbergOpTitle(
  net: FlowNet,
  variant: GoldbergVariant,
): string {
  const l = (v: number) => net.graph.nodes[v]?.label ?? "?";
  const base = `Goldberg(${l(net.z)}, ${l(net.s)})`;
  return variant === "nejvyssi" ? `${base} · nejvyšší vrchol` : base;
}
