/**
 * Společný základ grafových algoritmů stránky grafů (GraphPage): typ GraphAlgorithm, kontrola vstupu a drobné
 * pomůcky. Ve vlastním souboru (fáze 4), aby nové algoritmy ve vlastních souborech (bellmanFord.ts,
 * boruvka.ts, bridges.ts, scc.ts) nemusely importovat algorithms.ts – ten je naopak zapojuje do GRAPH_ALGOS
 * (kruhový import by v testech rozbil pořadí vyhodnocení).
 */
import { snap, type Step, type StepGen } from "../../core/steps";
import type { LegendItem } from "../../core/Visualizer";
import {
  MAX_EDGES,
  MAX_NODES,
  plural,
  type Graph,
  type GraphState,
} from "./graph";

/** Položka legendy + třídy na plátně, které vysvětluje (legenda pak ukazuje jen to, co v běhu opravdu nastane). */
export interface GraphLegendItem extends LegendItem {
  /** třídy vrcholů / hran (n-…, e-…); „n-comp*“ = všechny třídy s touto předponou */
  marks: string[];
}

/**
 * Varianta algoritmu (fáze 4: Bellman-Ford s frontou / po fázích, SCC Tarjan / přes Gᵀ…). Stránka ukáže
 * přepínač „Varianta“, běh dostane id varianty jako třetí argument `run`, odkaz nese nevýchozí variantu
 * jako v=<id>. První varianta je výchozí.
 */
export interface GraphVariant {
  id: string;
  label: string;
  /** vysvětlivka (title) u přepínače */
  title?: string;
  /** pseudokód varianty; jinak GraphAlgorithm.pseudocode */
  pseudocode?: string[];
}

export interface GraphAlgorithm {
  id: string;
  title: string;
  /** název operace nad zprávou („BFS“ → „BFS(v₀ = A)“) */
  opName: string;
  /** kratší popisek akce, když se plné jméno do lišty akcí nevejde (plné jméno je v title) */
  shortOpName?: string;
  description: string;
  complexity: string;
  pseudocode: string[];
  needsStart: boolean;
  /** vynutit typ grafu (undefined = libovolný) */
  directed?: boolean;
  weighted?: boolean;
  /** proč je typ grafu vynucený (title u neaktivního zaškrtávátka) */
  forcedWhy?: string;
  legend: GraphLegendItem[];
  /** námět „💡 Zkuste: …“ */
  tip: string;
  /** běh algoritmu; `variant` = id zvolené varianty (jen algoritmy s `variants`) */
  run: (g: Graph, start: number, variant?: string) => StepGen<GraphState>;
  /** id výchozí předvolby (presets.ts); bez něj výchozí podle id v graphPageModel.defaultPresetId */
  defaultPreset?: string;
  /** varianty algoritmu (přepínač na stránce, v= v odkazu); první = výchozí */
  variants?: readonly GraphVariant[];
  /**
   * Třídy hran s vlastní barvou šipky v orientovaném grafu (GraphView `markers`; barva v CSS
   * `.graph-arrow.<třída>`). Základní třídy (e-tree, e-active…) šipku mají vždy.
   */
  markers?: readonly string[];
  /** který krok výchozího běhu ukázat v náhledu na úvodní stránce (podíl délky běhu, výchozí 0,5) */
  previewShare?: number;
}

/** Popisek vrcholu podle id. */
export const L = (g: Graph, v: number) => g.nodes[v].label;

/** Krok, který jen oznamuje, že výpočet nejde spustit (Visualizer ho zvýrazní červeně). */
export const fail = (st: GraphState, message: string): Step<GraphState> => ({
  ...snap(st, null, message),
  error: true,
});

/* vzorky legendy: vrcholy jako výplň, hrany jako čára (čárkovaná tam, kde je čárkovaná i na plátně) */
export const LINE = "line" as const;
export const DASHED = "line-dashed" as const;

/** Počet barev komponent n-comp0 … n-comp7 (Kruskal; v index.css). */
export const COMP_COLORS = 8;

/**
 * Kontrola vstupu společná všem algoritmům: generátor nesmí spadnout ani zamrznout na žádném grafu
 * ani počátečním vrcholu (prázdný či obří graf, v₀ mimo graf, NaN…). Vrací text chyby, nebo null.
 */
export function inputProblem(
  g: Graph,
  start: number | null,
  needsWeights = false,
): string | null {
  const n = g.nodes.length;
  const m = g.edges.length;
  if (n === 0)
    return "Graf je prázdný – zadejte alespoň jeden vrchol nebo hranu.";
  if (n > MAX_NODES || m > MAX_EDGES) {
    return `Graf je na krokování příliš velký (${plural(n, "vrchol", "vrcholy", "vrcholů")}, ${plural(m, "hrana", "hrany", "hran")}) – nejvýše ${MAX_NODES} vrcholů a ${MAX_EDGES} hran.`;
  }
  const valid = (v: number) => Number.isInteger(v) && v >= 0 && v < n;
  if (
    g.nodes.some((nd, i) => nd.id !== i) ||
    g.edges.some((e, i) => e.id !== i || !valid(e.u) || !valid(e.v))
  ) {
    return "Graf je poškozený: hrana vede do neexistujícího vrcholu.";
  }
  if (needsWeights) {
    const bad = g.edges.find((e) => !Number.isFinite(e.w));
    if (bad) return `Hrana ${L(g, bad.u)}–${L(g, bad.v)} nemá číselnou cenu.`;
  }
  if (start !== null && !valid(start))
    return "Počáteční vrchol v₀ v grafu není – vyberte některý z jeho vrcholů.";
  return null;
}
