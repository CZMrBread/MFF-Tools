/**
 * Příklady z knihy pro toky (Průvodce kap. 14) – sítě nakreslené jako obrázky (souřadnice z PDF,
 * flow.fixtures.ts) a jejich výchozí nastavení. Testy proti obrázkům a textu jsou ve flowBook.test.ts.
 */
import { book, type BookPreset, type Tuple } from "../graphs/presetKit";
import { presetGraph } from "../graphs/presets";
import type { Graph } from "../graphs/graph";
import { NET_14_2, NET_14_3, NET_14_6, NET_14_7 } from "./flow.fixtures";
import { flowByKey } from "./flowNet";
import type { PathSearch } from "./fordFulkerson";

export type FlowModule = "ff" | "dinic";

export interface FlowPreset {
  /** id v odkazu (ex=…) */
  id: string;
  /** název v nabídce „Příklady z knihy“ */
  label: string;
  /** strana Průvodce */
  page: number;
  /** kresba a hrany (BookPreset z presetKit – souřadnice jako v knize) */
  preset: BookPreset;
  /** počáteční tok podle klíčů „u>v“ (obr. 14.2 vpravo) */
  init?: Readonly<Record<string, number>>;
  /** odkud počáteční tok je – do hlášky kroku 1 */
  initLabel?: string;
  /** hledání cesty, se kterým příklad vypadá jako v knize */
  search?: PathSearch;
  /** ve kterých modulech je příklad v nabídce */
  modules: readonly FlowModule[];
  /** poznámka pod obrázkem (do nápovědy) */
  note: string;
  /**
   * Poměr stran kresby na plátně, když se liší od obrázku (síť párování: řádky L/R musí mít místo,
   * matchingAspect). Souřadnice vrcholů zůstávají jako v knize.
   */
  displayAspect?: number;
}

/**
 * Zobrazovaný poměr stran sítě párování z | L | R | s s `rows` řádky (F-05): v panelu vedle druhé kresby
 * (~290 × 260 px při 1280 × 720) mají řádky stejné partity co nejvíc místa a sloupce L a R jsou od sebe
 * aspoň tři poloměry kroužku. Čím víc řádků, tím vyšší kresba; meze 0,8 až 2,5.
 */
export const matchingAspect = (rows: number): number =>
  Math.round(Math.max(0.8, Math.min(2.5, 4.6 / Math.max(1, rows - 1))) * 1e4) /
  1e4;

const key = (k: string) => k.split(">") as [string, string];

const NET_14_2_EDGES: Tuple[] = Object.entries(NET_14_2.capacities).map(
  ([k, c]) => [...key(k), c] as const,
);

const P_14_2 = book({
  id: "obr-14-2",
  label: "Obr. 14.2 Síť",
  page: NET_14_2.page,
  directed: true,
  weighted: true,
  grid: NET_14_2.grid,
  edges: NET_14_2_EDGES,
});

const P_14_3 = book({
  id: "obr-14-3",
  label: "Obr. 14.3 Algoritmus v úzkých",
  page: NET_14_3.page,
  directed: true,
  weighted: true,
  grid: NET_14_3.grid,
  edges: NET_14_3.edges.map((k) => [...key(k), 1] as const),
});

const LEFT = ["L1", "L2", "L3", "L4", "L5"];
const RIGHT = ["R1", "R2", "R3", "R4", "R5"];
const P_14_6 = book({
  id: "obr-14-6",
  label: "Obr. 14.6 Párování",
  page: NET_14_6.page,
  directed: true,
  weighted: true,
  grid: NET_14_6.grid,
  edges: [
    ...LEFT.map((l) => ["z", l, 1] as const),
    ...NET_14_6.edges.map(([a, b]) => [a, b, 1] as const),
    ...RIGHT.map((r) => [r, "s", 1] as const),
  ],
});

/**
 * Kapacity sítě z obr. 14.7 – obrázek je nemá, doplnili jsme je tak, aby Dinic potřeboval tři fáze
 * (ℓ = 5, 6, 7 – lemma C) a v dalších fázích využil hrany, které ve fázi 1 zmizely jako šedivé:
 * ve fázi 2 hranu k→l (uvnitř vrstvy), ve fázi 3 hranu e→b (dozadu). Maximální tok 6.
 */
export const CAPS_14_7: Readonly<Record<string, number>> = {
  "z>a": 2,
  "z>b": 1,
  "z>c": 4,
  "a>e": 2,
  "b>f": 2,
  "c>e": 3,
  "c>f": 1,
  "e>h": 3,
  "f>j": 3,
  "h>k": 3,
  "j>l": 4,
  "k>s": 2,
  "l>s": 4,
  "a>d": 1,
  "b>d": 1,
  "d>g": 1,
  "e>i": 1,
  "k>m": 1,
  "l>n": 1,
  "e>b": 2,
  "k>g": 1,
  "k>l": 2,
  "i>c": 1,
  "j>i": 1,
};

const P_14_7 = book({
  id: "obr-14-7",
  label: "Obr. 14.7 Vrstvy (kapacity doplněné)",
  page: NET_14_7.page,
  directed: true,
  weighted: true,
  grid: NET_14_7.grid,
  edges: [...NET_14_7.solid, ...NET_14_7.dotted, ...NET_14_7.gray].map(
    (k) => [...key(k), CAPS_14_7[k] ?? 1] as const,
  ),
});

export const FLOW_PRESETS: readonly FlowPreset[] = [
  {
    id: "obr-14-2",
    label: "Obr. 14.2 Síť",
    page: NET_14_2.page,
    preset: P_14_2,
    modules: ["ff", "dinic"],
    note: "Obr. 14.2 vlevo (Průvodce, s. 352). FordFulkerson s BFS skončí přesně tokem z obr. 14.5 (|f| = 18, řez A = {z, a, b, c}).",
  },
  {
    id: "obr-14-4",
    label: "Obr. 14.4 Z toku 16",
    page: 355,
    preset: { ...P_14_2, id: "obr-14-4" },
    init: NET_14_2.flow16,
    initLabel: "tok z obr. 14.2 vpravo",
    search: "dfs",
    modules: ["ff"],
    note: "Síť z obr. 14.2, začíná se tokem velikosti 16 z obr. 14.2 vpravo (s. 352). DFS najde nenasycenou cestu zbcads z obr. 14.4 (s. 355, ε = 1), BFS cestu zbcs z textu na s. 354.",
  },
  {
    id: "obr-14-3",
    label: "Obr. 14.3 Algoritmus v úzkých",
    page: NET_14_3.page,
    preset: P_14_3,
    search: "dfs",
    modules: ["ff", "dinic"],
    note: "Obr. 14.3 (Průvodce, s. 354), všude c = 1. Varianta „jen po směru“ s DFS najde cestu zabs a uvízne na toku 1; FordFulkerson s rezervami pošle tok proti směru hrany ab (cesta zbas) a dojde k 2.",
  },
  {
    id: "obr-14-6",
    label: "Obr. 14.6 Párování",
    page: NET_14_6.page,
    preset: P_14_6,
    modules: ["ff", "dinic"],
    displayAspect: matchingAspect(LEFT.length),
    note: "Obr. 14.6 (Průvodce, s. 360): bipartitní graf L1…L5, R1…R5 převedený na síť se zdrojem z a stokem s, všechny kapacity 1. Hrany L→R s tokem 1 tvoří největší párování (velikost 4; v knize je tučně jedno z nich).",
  },
  {
    id: "obr-14-7",
    label: "Obr. 14.7 Vrstvy",
    page: NET_14_7.page,
    preset: P_14_7,
    modules: ["dinic", "ff"],
    note: "Obr. 14.7 (Průvodce, s. 364): síť rozdělená na vrstvy; vrcholy a…n a kapacity kniha nemá, doplnili jsme je. Při čištění ve fázi 1 zmizí šedivé hrany (dozadu a uvnitř vrstvy) i tečkované (do slepých uliček) – přesně jako na obrázku.",
  },
];

export const flowPresetById = (id: string | null | undefined) =>
  FLOW_PRESETS.find((p) => p.id === id);

/** Příklady modulu v pořadí nabídky. */
export const presetsFor = (m: FlowModule) =>
  FLOW_PRESETS.filter((p) => p.modules.includes(m));

/**
 * Síť příkladu tak, jak se kreslí na plátně: souřadnice z knihy, poměr stran `displayAspect` (síť párování),
 * jinak jako obrázek. Na ni se načítá příklad a s ní se porovnává posunutá kresba (xy= v odkazu).
 */
export function presetView(p: FlowPreset): Graph {
  const graph = presetGraph(p.preset);
  return p.displayAspect !== undefined
    ? { ...graph, aspect: p.displayAspect }
    : graph;
}

/** Síť příkladu (kresba jako v knize) a počáteční tok (null = nulový). */
export function presetNet(p: FlowPreset): {
  graph: Graph;
  init: number[] | null;
} {
  const graph = presetGraph(p.preset);
  return { graph, init: p.init ? flowByKey(graph, p.init) : null };
}
