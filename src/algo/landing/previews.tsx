/**
 * Registr náhledů pro karty úvodní stránky: cesta modulu → funkce, která vrátí statickou mini-kresbu
 * výchozího příkladu (skutečný pohled modulu – stejné views, výchozí struktura nebo první krok výchozí
 * operace; bez animace, bez ovládání). Kreslí se líně (ModuleThumb), funkce se volá až u viditelné karty.
 *
 * Nový modul: přidej sem `"/cesta": () => <Pohled … width={W} />`. Modul bez náhledu dostane neutrálního
 * zástupce své skupiny (placeholderKind / placeholderArt). Pohledy s HTML místo SVG (tabulky, řetězce)
 * se zmenší zoomem – `{ render, html: true }`.
 *
 * Moduly fáze 2 (kap. 13, 15, 17) mají náhled ve vlastním souboru vedle stránky (`algos/…/*.preview.tsx`,
 * typ `Preview` z `previewTypes.ts`) – stopa ho upravuje sama a tento registr jen importuje. Soubor
 * náhledu nesmí importovat líně načítanou stránku (`*Page.tsx`), jinak by se chunk stránky slil s přehledem.
 */
import type { ReactElement } from "react";
import { materialize, type Step } from "../core/steps";
import { ArrayView } from "../views/ArrayView";
import { BoxListView } from "../views/BoxListView";
import { GraphView } from "../views/GraphView";
import { MultiTreeView } from "../views/MultiTreeView";
import { TreeView, type TEdge, type TNode } from "../views/TreeView";
import { completeLayout } from "../views/treeLayout";
import { MODULES } from "../registry";
import { THUMB_H, THUMB_W, type Preview } from "./previewTypes";
import { kmpPreview } from "../algos/strings/kmp.preview";
import { ahoCorasickPreview } from "../algos/strings/ahoCorasick.preview";
import { rabinKarpPreview } from "../algos/strings/rabinKarp.preview";
import { gatesPreview } from "../algos/parallel/gates.preview";
import { adderPreview } from "../algos/parallel/adder.preview";
import { sortNetPreview } from "../algos/parallel/sortNet.preview";
import { fftPreview } from "../algos/fourier/fft.preview";
import { fftNetPreview } from "../algos/fourier/fftNet.preview";
import { fordFulkersonPreview } from "../algos/flows/fordFulkerson.preview";
import { dinicPreview } from "../algos/flows/dinic.preview";
import { goldbergPreview } from "../algos/flows/goldberg.preview";
import { editDistancePreview } from "../algos/dp/editDistance.preview";
import { lisPreview } from "../algos/dp/lis.preview";
import { hullPreview } from "../algos/geometry/hull.preview";
import { llrbPreview } from "../algos/trees/llrb.preview";
import { SORTING } from "../algos/sorting/algorithms";
import { defaultInput } from "../algos/sorting/input";
import type { SortState } from "../algos/sorting/types";
import {
  LIST_INITIAL,
  makeList,
  type ListKind,
} from "../algos/structures/list";
import { heapOf } from "../algos/structures/heap";
import { bookExampleById } from "../algos/structures/bookExample";
import {
  DEFAULT_HEAP_EXAMPLE,
  DEFAULT_SEGTREE_EXAMPLE,
  HEAP_BOOK_EXAMPLES,
  SEGTREE_BOOK_EXAMPLES,
} from "../algos/structures/bookExamples";
import { build as segBuild } from "../algos/structures/segtree";
import { ArrayCells, Bits } from "../algos/amortized/AmortizedViews";
import {
  ARR_DEFAULT,
  CNT_DEFAULT,
  mkArr,
  mkCounter,
} from "../algos/amortized/amortized";
import { CacheTable } from "../algos/cache/PagingPage";
import { DEFAULT_P, DEFAULT_SEQ, paging } from "../algos/cache/paging";
import { buildTree, DEFAULT_KEYS, type Kind } from "../algos/trees/treeOps";
import { layout as bstLayout } from "../algos/trees/bst";
import { sizes } from "../algos/trees/trees2";
import {
  AB_DEFAULT_KEYS,
  AB_PARAMS,
  abParamIndex,
  buildAB,
} from "../algos/trees/abOps";
import { layoutAB } from "../algos/trees/abtree";
import { ChainView, ProbeView } from "../algos/hashing/HashViews";
import { BloomView, CuckooView } from "../algos/hashing/CuckooBloomViews";
import { buildTable } from "../algos/hashing/tables";
import { ckBuild } from "../algos/hashing/cuckoo";
import { blBuild } from "../algos/hashing/bloom";
import {
  BLOOM_DEFAULT,
  CHAIN_DEFAULT,
  CUCKOO_DEFAULT,
  PROBE_DEFAULT,
} from "../algos/hashing/ui";
import { GRAPH_ALGOS, type GraphAlgorithm } from "../algos/graphs/algorithms";
import { emptyState, type GraphState } from "../algos/graphs/graph";
import {
  buildGraph,
  defaultSpec,
  layoutPreset,
  pageStartLabel,
  startIndex,
} from "../algos/graphs/graphPageModel";
import { SATable } from "../algos/strings/SuffixViews";
import { initialSuffix, SUFFIX_EXAMPLES } from "../algos/strings/pageModel";
import { suffixSteps } from "../algos/strings/suffix";
import { StackView } from "../algos/parallel/LockFreeViews";
import { initial as lockFreeInitial } from "../algos/parallel/lockfree";
import { Plane } from "../algos/geometry/KdTreeViews";
import {
  build as kdBuild,
  DEFAULT_N,
  DEFAULT_SEED,
  randomPoints,
} from "../algos/geometry/kdtree";

/**
 * Charakteristický mezistav běhu výchozího vstupu (karty jedné skupiny se pak liší, i když mají stejný
 * vstup): `nth`-tý krok na řádku pseudokódu `line` (0-based), jinak krok v podílu `share` délky běhu.
 */
export interface PreviewPick {
  line?: number;
  nth?: number;
  share?: number;
}

export function pickStep<S>(
  steps: readonly Step<S>[],
  { line, nth = 1, share = 0.5 }: PreviewPick,
): Step<S> | undefined {
  if (steps.length === 0) return undefined;
  if (line !== undefined) {
    let seen = 0;
    for (const st of steps)
      if (st.line === line && ++seen === nth && !st.error) return st;
  }
  const at = Math.round((steps.length - 1) * Math.min(1, Math.max(0, share)));
  return steps[at];
}

/* ------------------------------------------------------------------ třídění: mezistav výchozího běhu */

/** Který krok třídění ukázat (řádky podle pseudokódu v algos/sorting). */
const SORT_PICK: Record<string, PreviewPick> = {
  // po 1. průchodu: maximum je na konci (začátek 2. průchodu)
  bubble: { line: 1, nth: 2 },
  // po 3 kolech: tři nejmenší na začátku (začátek 4. kola, m ← i)
  select: { line: 1, nth: 4 },
  // setříděný začátek 6 prvků (zatřiďuje se 7., x ← P[i])
  insert: { line: 1, nth: 6 },
  // běhy délky 4 (druhé b ← 2b)
  merge: { line: 7, nth: 2 },
  // po prvním rozdělení podle pivota (první QuickSort(l, j))
  quick: { line: 9, nth: 1 },
  // po stavbě haldy (začátek cyklu Pro i = n, …, 2)
  heap: { line: 2, nth: 1 },
  // počítadla spočítaná a výstup napůl zapsaný (6. zápis v_j ← i)
  counting: { line: 6, nth: 6 },
};

function sortingPreview(id: string): Preview | null {
  const algo = SORTING.find((a) => a.id === id);
  if (!algo) return null;
  return {
    render: () => {
      const values = defaultInput(algo);
      const steps = materialize(algo.run(values));
      const st: SortState | undefined = pickStep(
        steps,
        SORT_PICK[id] ?? { share: 0.5 },
      )?.state;
      const items = st?.items ?? values.map((v, i) => ({ id: i, v }));
      const aux = st?.aux;
      const counters = aux && algo.id === "counting";
      const mainH = aux ? Math.round((THUMB_H - 30) * 0.58) : THUMB_H - 30;
      return (
        <>
          <ArrayView
            items={items}
            marks={st?.marks ?? {}}
            sorted={st?.sorted}
            ranges={st?.ranges}
            max={Math.max(...values)}
            min={Math.min(0, ...values)}
            height={mainH}
            showIndex={false}
            glyphs={false}
            width={THUMB_W}
          />
          {aux && (
            <ArrayView
              items={aux.items}
              marks={aux.marks}
              max={
                counters
                  ? Math.max(1, ...aux.items.map((x) => x?.v ?? 0))
                  : Math.max(...values)
              }
              min={0}
              height={THUMB_H - 30 - mainH}
              showIndex={false}
              glyphs={false}
              width={THUMB_W}
              slotCount={counters ? undefined : items.length}
              offset={aux.offset ?? 0}
            />
          )}
        </>
      );
    },
  };
}

/* ------------------------------------------------------------------ datové struktury */

const listPreview = (kind: ListKind): Preview => ({
  render: () => {
    const st = makeList(kind, LIST_INITIAL);
    return (
      <BoxListView
        boxes={st.boxes}
        pointers={st.pointers}
        arrows={kind === "list"}
        nullEnd={kind === "list"}
        vertical={kind === "stack"}
      />
    );
  },
});

const heapPreview: Preview = {
  render: () => {
    const values = [
      ...(bookExampleById(HEAP_BOOK_EXAMPLES, DEFAULT_HEAP_EXAMPLE)?.values ??
        []),
    ];
    const st = heapOf(values);
    const nodes: TNode[] = st.a.map((it, i) => ({
      id: it.id,
      label: String(it.v),
      ...completeLayout(i),
    }));
    const edges: TEdge[] = st.a.slice(1).map((it, k) => ({
      from: st.a[Math.floor(k / 2)]?.id ?? 0,
      to: it.id,
    }));
    return (
      <TreeView nodes={nodes} edges={edges} levelHeight={56} width={THUMB_W} />
    );
  },
};

const segTreePreview: Preview = {
  render: () => {
    const st = segBuild([
      ...(bookExampleById(SEGTREE_BOOK_EXAMPLES, DEFAULT_SEGTREE_EXAMPLE)
        ?.values ?? []),
    ]);
    const nodes: TNode[] = [];
    const edges: TEdge[] = [];
    for (let v = 1; v < 2 * st.n; v++) {
      const s = st.S[v];
      nodes.push({
        id: v,
        label: s === undefined || !Number.isFinite(s) ? "∞" : String(s),
        ...completeLayout(v - 1),
      });
      if (v > 1) edges.push({ from: Math.floor(v / 2), to: v });
    }
    return (
      <TreeView
        nodes={nodes}
        edges={edges}
        levelHeight={52}
        radius={18}
        width={THUMB_W}
      />
    );
  },
};

/* ------------------------------------------------------------------ vyhledávací stromy */

const treePreview = (kind: Kind): Preview => ({
  render: () => {
    const st = buildTree(DEFAULT_KEYS[kind], kind);
    const lay = bstLayout(st);
    // jako stránka: BB[α] a splay ukazují velikosti podstromů (AVL znaménka vyvážení má layout sám)
    if (kind === "splay" || kind === "bb") {
      const sz = sizes(st);
      for (const n of lay.nodes) n.sub = `s=${sz.get(n.id)}`;
    }
    return (
      <TreeView
        nodes={lay.nodes}
        edges={lay.edges}
        levelHeight={56}
        width={THUMB_W}
      />
    );
  },
});

const abPreview: Preview = {
  render: () => {
    const [a, b] = AB_PARAMS[abParamIndex(null)] ?? [2, 4];
    const lay = layoutAB(buildAB(AB_DEFAULT_KEYS, a, b));
    return (
      <MultiTreeView
        nodes={lay.nodes}
        edges={lay.edges}
        levelHeight={64}
        width={THUMB_W}
      />
    );
  },
};

/* ------------------------------------------------------------------ grafy: výchozí příklad, mezistav */

/** Který krok grafového algoritmu ukázat: BFS s vrstvami, DFS a topologické uspořádání hotové, kostry a Dijkstra v půlce. */
const GRAPH_SHARE: Record<string, number> = {
  bfs: 1,
  dfs: 1,
  topo: 1,
  dijkstra: 0.5,
  jarnik: 0.5,
  kruskal: 0.5,
};

function graphPreview(algo: GraphAlgorithm): Preview {
  return {
    render: () => {
      const spec = defaultSpec(algo);
      const graph = buildGraph(spec).graph;
      const lay = graph.aspect ? layoutPreset(spec)?.id : undefined;
      const start = startIndex(graph, pageStartLabel(algo, graph, lay, null));
      const st: GraphState | null = graph.nodes.length
        ? (pickStep(materialize(algo.run(graph, start)), {
            share: algo.previewShare ?? GRAPH_SHARE[algo.id] ?? 0.5,
          })?.state ?? null)
        : null;
      return (
        <GraphView
          graph={graph}
          state={st ?? emptyState()}
          width={THUMB_W}
          height={THUMB_H + 20}
        />
      );
    },
  };
}

/* ------------------------------------------------------------------ registr */

export const PREVIEWS: Record<string, Preview> = {
  ...Object.fromEntries(
    SORTING.flatMap((a) => {
      const p = sortingPreview(a.id);
      return p ? [[`/sort/${a.id}`, p] as const] : [];
    }),
  ),
  "/ds/stack": listPreview("stack"),
  "/ds/queue": listPreview("queue"),
  "/ds/list": listPreview("list"),
  "/ds/heap": heapPreview,
  "/ds/segtree": segTreePreview,
  "/ds2/array": {
    // výchozí příklad stránky: plné pole kapacity 4
    render: () => <ArrayCells st={mkArr(ARR_DEFAULT.length, ARR_DEFAULT)} />,
  },
  "/ds2/counter": {
    // výchozí příklad stránky 7 = 000111
    render: () => <Bits st={mkCounter(CNT_DEFAULT)} />,
  },
  "/cache/paging": {
    html: true,
    render: () => {
      // tabulka po několika požadavcích výchozí posloupnosti (na začátku jsou sloty prázdné)
      const steps = materialize(paging(DEFAULT_SEQ, DEFAULT_P));
      const st = steps[Math.min(steps.length - 1, 7)]?.state;
      return st ? <CacheTable st={st} /> : <></>;
    },
  },
  "/tree/bst": treePreview("bst"),
  "/tree/avl": treePreview("avl"),
  "/tree/bb": treePreview("bb"),
  "/tree/splay": treePreview("splay"),
  "/tree/ab": abPreview,
  "/hash/chaining": {
    html: true,
    render: () => {
      const d = CHAIN_DEFAULT;
      return (
        <ChainView st={buildTable(d.m, d.fnId, d.seed, d.keys, false).state} />
      );
    },
  },
  "/hash/probing": {
    render: () => {
      const d = PROBE_DEFAULT;
      return (
        <ProbeView st={buildTable(d.m, d.fnId, d.seed, d.keys, true).state} />
      );
    },
  },
  "/hash/cuckoo": {
    render: () => {
      const d = CUCKOO_DEFAULT;
      return <CuckooView st={ckBuild(d.m, d.seed, d.keys).state} />;
    },
  },
  "/hash/bloom": {
    render: () => {
      const d = BLOOM_DEFAULT;
      return <BloomView st={blBuild(d.m, d.k, d.keys).state} />;
    },
  },
  ...Object.fromEntries(
    GRAPH_ALGOS.map((a) => [`/graph/${a.id}`, graphPreview(a)] as const),
  ),
  "/string/suffix": {
    html: true,
    render: () => {
      // hotové sufixové pole výchozího řetězce (poslední krok stavby)
      const ex = SUFFIX_EXAMPLES[0];
      const run = initialSuffix(ex.alpha, ex.id);
      const steps = suffixSteps(run.applied, run.phase, false);
      const st = steps[steps.length - 1]?.state;
      return st ? <SATable st={st} /> : <></>;
    },
  },
  "/parallel/lockfree": {
    html: true,
    render: () => <StackView st={lockFreeInitial()} />,
  },
  // fáze 2: náhledy ve vlastních souborech stop
  "/string/kmp": kmpPreview,
  "/string/aho-corasick": ahoCorasickPreview,
  "/string/rabin-karp": rabinKarpPreview,
  "/parallel/gates": gatesPreview,
  "/parallel/adder": adderPreview,
  "/parallel/sortnet": sortNetPreview,
  "/fft/fft": fftPreview,
  "/fft/net": fftNetPreview,
  // fáze 4: náhledy ve vlastních souborech stop (grafové algoritmy výše přes GRAPH_ALGOS)
  "/flow/ford-fulkerson": fordFulkersonPreview,
  "/flow/dinic": dinicPreview,
  "/flow/goldberg": goldbergPreview,
  "/dp/edit": editDistancePreview,
  "/dp/lis": lisPreview,
  "/geom/hull": hullPreview,
  "/tree/llrb": llrbPreview,
  "/geom/kdtree": {
    render: () => {
      // rovina s body a dělicími přímkami hotového stromu (poslední krok stavby)
      const steps = materialize(kdBuild(randomPoints(DEFAULT_N, DEFAULT_SEED)));
      const st = steps[steps.length - 1]?.state;
      return st ? <Plane st={st} /> : <></>;
    },
  },
};

/* ------------------------------------------------------------------ zástupci skupin */

export type PlaceholderKind =
  | "bars"
  | "boxes"
  | "tree"
  | "table"
  | "graph"
  | "text"
  | "parallel"
  | "points"
  | "butterfly"
  | "generic";

const GROUP_PLACEHOLDER: Record<string, PlaceholderKind> = {
  Třídění: "bars",
  "Datové struktury": "boxes",
  "Vyhledávací stromy": "tree",
  Hešování: "table",
  Grafy: "graph",
  "Dynamické programování": "table",
  "Textové algoritmy": "text",
  "Toky v sítích": "graph",
  "Paralelní algoritmy": "parallel",
  Geometrie: "points",
  "Fourierova transformace": "butterfly",
};

/** Zástupce skupiny (nová skupina bez vlastního = obecný). */
export const placeholderKind = (group: string): PlaceholderKind =>
  GROUP_PLACEHOLDER[group] ?? "generic";

const MODULE_PATHS = new Set(MODULES.map((m) => m.path));

/** Co karta ukáže: skutečný náhled, nebo zástupce skupiny. */
export const thumbKind = (path: string): "preview" | "placeholder" =>
  MODULE_PATHS.has(path) && PREVIEWS[path] ? "preview" : "placeholder";

/** Neutrální obrázek skupiny (tlumené tvary v barvách tématu). */
export function placeholderArt(kind: PlaceholderKind): ReactElement {
  const shapes: ReactElement[] = [];
  switch (kind) {
    case "bars":
      [60, 110, 40, 140, 90, 120, 70].forEach((h, i) =>
        shapes.push(
          <rect
            key={i}
            x={40 + i * 42}
            y={170 - h}
            width={30}
            height={h}
            rx={3}
          />,
        ),
      );
      break;
    case "boxes":
      [0, 1, 2, 3].forEach((i) =>
        shapes.push(
          <rect key={i} x={50 + i * 70} y={80} width={52} height={40} rx={6} />,
        ),
      );
      break;
    case "tree":
    case "graph": {
      const pts =
        kind === "tree"
          ? [
              [180, 40],
              [110, 100],
              [250, 100],
              [70, 160],
              [150, 160],
              [290, 160],
            ]
          : [
              [80, 60],
              [200, 40],
              [300, 90],
              [120, 150],
              [240, 160],
            ];
      const links =
        kind === "tree"
          ? [
              [0, 1],
              [0, 2],
              [1, 3],
              [1, 4],
              [2, 5],
            ]
          : [
              [0, 1],
              [1, 2],
              [0, 3],
              [3, 4],
              [1, 4],
              [2, 4],
            ];
      links.forEach(([a, b], i) =>
        shapes.push(
          <line
            key={"l" + i}
            x1={pts[a][0]}
            y1={pts[a][1]}
            x2={pts[b][0]}
            y2={pts[b][1]}
            className="ph-line"
          />,
        ),
      );
      pts.forEach(([x, y], i) =>
        shapes.push(<circle key={"c" + i} cx={x} cy={y} r={16} />),
      );
      break;
    }
    case "table":
      for (let i = 0; i < 8; i++)
        shapes.push(
          <rect key={i} x={30 + i * 38} y={80} width={32} height={36} rx={4} />,
        );
      break;
    case "text":
      "abracadabra"
        .split("")
        .forEach((_, i) =>
          shapes.push(
            <rect
              key={i}
              x={30 + i * 28}
              y={86}
              width={24}
              height={30}
              rx={3}
            />,
          ),
        );
      break;
    case "parallel":
      [60, 130].forEach((y, r) =>
        [0, 1, 2].forEach((i) =>
          shapes.push(
            <rect
              key={r + "-" + i}
              x={60 + i * 90}
              y={y}
              width={64}
              height={36}
              rx={6}
            />,
          ),
        ),
      );
      break;
    case "points":
      [
        [60, 50],
        [120, 140],
        [200, 70],
        [260, 160],
        [300, 60],
        [170, 120],
      ].forEach(([x, y], i) =>
        shapes.push(<circle key={i} cx={x} cy={y} r={7} />),
      );
      shapes.push(
        <line key="v" x1={180} y1={20} x2={180} y2={190} className="ph-line" />,
      );
      break;
    case "butterfly":
      // motýlek FFT: dva vstupy, dva výstupy, křížem propojené
      [
        [80, 60, 280, 60],
        [80, 150, 280, 150],
        [80, 60, 280, 150],
        [80, 150, 280, 60],
      ].forEach(([x1, y1, x2, y2], i) =>
        shapes.push(
          <line
            key={"b" + i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className="ph-line"
          />,
        ),
      );
      [
        [80, 60],
        [80, 150],
        [280, 60],
        [280, 150],
      ].forEach(([x, y], i) =>
        shapes.push(<circle key={"p" + i} cx={x} cy={y} r={14} />),
      );
      break;
    default:
      shapes.push(
        <rect key="r" x={110} y={60} width={140} height={90} rx={10} />,
      );
  }
  return (
    <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H + 10}`} className="ph-svg">
      {shapes}
    </svg>
  );
}
