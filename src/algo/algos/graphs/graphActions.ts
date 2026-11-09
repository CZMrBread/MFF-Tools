/**
 * Nabídka operací stránky grafů (ActionMenu) – čistá funkce bez Reactu (testy v graphActions.test.ts).
 * Graf se kreslí přímo na plátně (GraphEditor); tady jsou příklady z knihy, náhodný graf, spuštění
 * algoritmu s v₀, ceny hran naráz a přepnutí na jiný algoritmus nad tímtéž grafem.
 */
import type { ActionDef, ArgValues } from "../../core/actionModel";
import { numArg, strArg } from "../../core/actionModel";
import { GRAPH_ALGOS, type GraphAlgorithm } from "./algorithms";
import { MAX_EDGES, MAX_NODES, type Graph } from "./graph";
import {
  formatWeights,
  parseWeights,
  presetMatch,
  randomEdgeNote,
  startLabels,
  weightsOrder,
} from "./graphPageModel";
import { isBookPreset, presetOffered, PRESETS, sourceText } from "./presets";

/** Co stránka udělá po provedení akce. */
export interface GraphActionHandlers {
  loadPreset: (id: string) => void;
  random: (n: number, m: number) => void;
  /** prázdný graf a režim „Upravit graf“ */
  empty: () => void;
  /** spustit algoritmus; popisek v₀ (null u algoritmů bez počátečního vrcholu) */
  run: (startLabel: string | null) => void;
  setWeights: (ws: number[]) => void;
  switchAlgo: (id: string) => void;
}

/**
 * Jak se ohodnocení hran jmenuje u algoritmu (jako v Průvodci): Dijkstra počítá s délkami ℓ(e),
 * minimální kostry s vahami w(e), ostatní obecně s cenami.
 */
export function weightTerm(algo: GraphAlgorithm): {
  action: string;
  arg: string;
  plural: string;
} {
  if (algo.id === "dijkstra" || algo.id === "bellman-ford")
    return { action: "Délky hran", arg: "délky =", plural: "Délky" };
  if (algo.id === "jarnik" || algo.id === "kruskal" || algo.id === "boruvka")
    return { action: "Váhy hran", arg: "váhy =", plural: "Váhy" };
  return { action: "Ceny hran", arg: "ceny =", plural: "Ceny" };
}

/** Výchozí velikost náhodného grafu. */
export const RANDOM_N = 8;
export const RANDOM_M = 12;

export function graphActionDefs(
  algo: GraphAlgorithm,
  g: Graph,
  startId: number,
  h: GraphActionHandlers,
): ActionDef[] {
  const empty = g.nodes.length === 0;
  // zvýrazněný příklad = knižní předvolba, kterou graf právě je (po úpravě už žádný)
  const shown = PRESETS[presetMatch(algo, g)];
  const book: ActionDef = {
    id: "book",
    label: "Příklady z knihy",
    title: "Grafy z Průvodce labyrintem algoritmů, nakreslené jako v knize",
    variants: PRESETS.filter(isBookPreset).map((p) => ({
      id: p.id,
      label: p.label,
      title: sourceText(p),
    })),
    selectedVariant: shown && isBookPreset(shown) ? shown.id : null,
    run: (_, v) => {
      if (v) h.loadPreset(v);
    },
  };

  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    title: "Náhodný graf, prázdné plátno nebo další příklady",
    variants: [
      {
        id: "random",
        label: "Náhodně",
        title: "Náhodný souvislý graf bez smyček a násobných hran",
        args: [
          {
            kind: "int",
            name: "n",
            label: "vrcholů n =",
            min: 1,
            max: MAX_NODES,
            default: RANDOM_N,
          },
          {
            kind: "int",
            name: "m",
            label: "hran m =",
            min: 0,
            max: MAX_EDGES,
            default: RANDOM_M,
          },
        ],
      },
      {
        id: "empty",
        label: "Prázdný – nakreslit",
        title: "Prázdné plátno v režimu Upravit graf",
      },
      ...PRESETS.filter(
        (p) => !isBookPreset(p) && presetOffered(p, algo.id),
      ).map((p) => ({
        id: p.id,
        label: p.label,
      })),
    ],
    notice: (v, variant) =>
      variant === "random"
        ? randomEdgeNote(algo, g, numArg(v, "n"), numArg(v, "m"))
        : null,
    run: (v, variant) => {
      if (variant === "random") h.random(numArg(v, "n"), numArg(v, "m"));
      else if (variant === "empty") h.empty();
      else if (variant) h.loadPreset(variant);
    },
  };

  const labels = startLabels(g);
  const run: ActionDef = {
    id: "run",
    label: algo.needsStart
      ? `${algo.opName}(v₀)`
      : (algo.shortOpName ?? algo.opName),
    title: algo.needsStart
      ? `${algo.opName}: připraví běh z vrcholu v₀ (v₀ vybere i klik na vrchol), ▶ ho přehraje`
      : `${algo.opName}: připraví běh na grafu z plátna, ▶ ho přehraje`,
    disabledReason: empty
      ? "Graf je prázdný – nakreslete ho (Upravit graf) nebo vyberte příklad"
      : null,
    args: algo.needsStart
      ? [
          {
            kind: "choice",
            name: "v0",
            label: "v₀ =",
            options: labels.map((l) => ({ value: l, label: l })),
            default: g.nodes[startId]?.label ?? labels[0],
          },
        ]
      : undefined,
    run: (v) => h.run(algo.needsStart ? strArg(v, "v0") : null),
  };

  const term = weightTerm(algo);
  const maxW = Math.max(1, g.edges.length);
  const weightsOf = (v: ArgValues) => parseWeights(strArg(v, "w"), maxW);
  const wText = formatWeights(g.edges.map((e) => e.w));
  const weights: ActionDef = {
    id: "weights",
    label: term.action,
    title: g.edges.length
      ? `${term.plural} v pořadí hran ${weightsOrder(g)}`
      : undefined,
    goLabel: "Nastavit",
    disabledReason: g.edges.length
      ? null
      : "Graf nemá hrany – nakreslete je (Upravit graf: tah z vrcholu na vrchol)",
    args: [
      {
        // text, ne seznam čísel: ceny s desetinnou čárkou („4 2,5 7“) – čárka v seznamu by byla oddělovač;
        // čte parseWeights (čárka i tečka). Překlep („1 x 3“) nesmí posunout ceny dalších hran – Provést
        // se zablokuje s hláškou.
        kind: "text",
        name: "w",
        label: term.arg,
        // šířka podle dnešních cen (10–36 znaků); na úzkém displeji pole zúží .am-arg (max-width 100 %)
        width: `${Math.min(36, Math.max(10, wText.length + 3))}ch`,
        default: wText,
        check: (v) => parseWeights(String(v), maxW).error,
        notice: (v) => parseWeights(String(v), maxW).note,
      },
    ],
    run: (v) => h.setWeights(weightsOf(v).values),
  };

  const other: ActionDef = {
    id: "algo",
    label: "Jiný alg.",
    title: "Jiný algoritmus na tomtéž grafu",
    variants: GRAPH_ALGOS.filter((a) => a.id !== algo.id).map((a) => ({
      id: a.id,
      label: a.title,
    })),
    selectedVariant: null,
    run: (_, v) => {
      if (v) h.switchAlgo(v);
    },
  };

  return g.weighted
    ? [create, book, run, weights, other]
    : [create, book, run, other];
}
