/**
 * Čistá logika stránky grafů (bez Reactu): výchozí vstup, sdílení odkazem, aktivní předvolba, název operace,
 * stavba grafu se souřadnicemi (knižní předvolby). Testy v graphPageModel.test.ts.
 */
import type { LegendItem } from "../../core/Visualizer";
import { graphEditText, topologyKey } from "../../views/graphEdit";
import type { GraphAlgorithm } from "./algorithms";
import {
  cmpLabel,
  fmtNum,
  parseGraphInput,
  randomEdgeRange,
  randomGraph,
  type Graph,
  type ParsedGraph,
} from "./graph";
import {
  isBookPreset,
  placeGraph,
  presetById,
  presetGraph,
  PRESETS,
  sourceText,
  type GraphPreset,
} from "./presets";

/** Vstup stránky: text hran a typ grafu (vynucený typ algoritmu má přednost, viz effectiveSpec). */
export interface Spec {
  text: string;
  directed: boolean;
  weighted: boolean;
  /**
   * id knižní předvolby, z níž se berou souřadnice vrcholů se stejným jménem (po úpravě textu); přesná
   * knižní předvolba se pozná i bez něj
   */
  layout?: string;
}

/** Výchozí předvolba každého algoritmu (ta, na které je vidět to podstatné – u knižních jako v knize). */
export function defaultPresetId(algo: GraphAlgorithm): string {
  if (algo.defaultPreset !== undefined) return algo.defaultPreset;
  switch (algo.id) {
    case "dfs":
    case "bfs":
      return "pig"; // obr. 5.5, výsledky na obr. 5.8 a 5.9
    case "jarnik":
    case "kruskal":
      return "mst3"; // obr. 7.2 / 7.6
    case "dijkstra":
      return "weighted";
    case "topo":
      return "condensation"; // jediný DAG v kapitole 5 (obr. 5.13 vpravo)
    default:
      return "undirected10";
  }
}

/** Výchozí příklad algoritmu. */
export function defaultSpec(algo: GraphAlgorithm): Spec {
  const p = presetById(defaultPresetId(algo)) ?? PRESETS[1];
  return effectiveSpec(algo, {
    text: p.text,
    directed: p.directed,
    weighted: p.weighted,
  });
}

/** Typ grafu, se kterým algoritmus opravdu pracuje (topologické uspořádání vždy orientovaný graf…). */
export function effectiveSpec(algo: GraphAlgorithm, s: Spec): Spec {
  return {
    text: s.text,
    directed: algo.directed ?? s.directed,
    weighted: algo.weighted ?? s.weighted,
    ...(s.layout !== undefined ? { layout: s.layout } : {}),
  };
}

/** Index předvolby, která přesně odpovídá vstupu (i s vynuceným typem grafu), jinak −1 („vlastní graf“). */
export function presetIndex(algo: GraphAlgorithm, s: Spec): number {
  const e = effectiveSpec(algo, s);
  return PRESETS.findIndex((p) => {
    const q = effectiveSpec(algo, p);
    return (
      q.text === e.text &&
      q.directed === e.directed &&
      q.weighted === e.weighted
    );
  });
}

/** Knižní předvolba, jejíž souřadnice graf zdědí: zadaná v `layout`, jinak ta se stejným textem hran. */
export function layoutPreset(s: Spec): GraphPreset | undefined {
  const named = s.layout !== undefined ? presetById(s.layout) : undefined;
  if (named && isBookPreset(named)) return named;
  return PRESETS.find((p) => isBookPreset(p) && p.text === s.text);
}

/**
 * Graf ze vstupu i se souřadnicemi. `prev` = dosud zobrazený graf: má-li pevné souřadnice (knižní, i po
 * přetažení), vrcholy se stejným jménem zůstanou na místě. Jinak rozhodne knižní předloha (layoutPreset),
 * a bez ní silové rozložení jako dřív.
 */
export function buildGraph(s: Spec, prev?: Graph | null): ParsedGraph {
  const parsed = parseGraphInput(s.text, s.directed, s.weighted, {
    layout: false,
  });
  const book = layoutPreset(s);
  const ref = prev?.aspect
    ? prev
    : book
      ? presetGraph({ ...book, directed: s.directed, weighted: s.weighted })
      : null;
  placeGraph(parsed.graph, ref);
  return parsed;
}

/* ------------------------------------------------------------------ varianty (fáze 4) */

/** Výchozí varianta algoritmu (první z `variants`), bez variant null. */
export function defaultVariant(algo: GraphAlgorithm): string | null {
  return algo.variants?.[0]?.id ?? null;
}

/**
 * Varianta z odkazu (v=). Algoritmus bez variant v= ignoruje (null); neznámá varianta → výchozí a hláška
 * nad plátnem (adresa se nepřepisuje).
 */
export function variantFromParams(
  algo: GraphAlgorithm,
  params: URLSearchParams,
): { variant: string | null; problem: string | null } {
  const def = defaultVariant(algo);
  if (def === null) return { variant: null, problem: null };
  const v = params.get("v");
  if (v === null || v === "") return { variant: def, problem: null };
  if (algo.variants!.some((x) => x.id === v))
    return { variant: v, problem: null };
  const label = algo.variants![0].label;
  return {
    variant: def,
    problem: `Varianta „${v}“ neexistuje – zobrazena varianta ${label}.`,
  };
}

/** Parametry odkazu s variantou: výchozí varianta se nepíše, jiná jako v=; null (prázdný graf) zůstane null. */
export function withVariantParam(
  algo: GraphAlgorithm,
  out: Record<string, string> | null,
  variant: string | null,
): Record<string, string> | null {
  if (out === null) return null;
  if (variant === null || variant === defaultVariant(algo)) return out;
  return { ...out, v: variant };
}

/** Pseudokód zvolené varianty (má-li vlastní), jinak pseudokód algoritmu. */
export function variantPseudocode(
  algo: GraphAlgorithm,
  variant: string | null,
): string[] {
  return (
    algo.variants?.find((x) => x.id === variant)?.pseudocode ?? algo.pseudocode
  );
}

/* ------------------------------------------------------------------ odkaz */

/**
 * Parametry adresy: g = text hran, d / w = orientovaný / ohodnocený (0/1), s = název počátečního vrcholu,
 * xy = souřadnice vrcholů (nový, volitelný – jen ručně kreslené či přesunuté vrcholy, viz LinkPositions),
 * p = id knižní předvolby, jejíž souřadnice upravený graf dědí (nový, volitelný – starší odkazy ho nemají).
 */
export interface UrlState {
  spec: Spec;
  /** název v₀ (null = první vrchol vstupu) */
  startLabel: string | null;
  /** proč se graf z odkazu nepoužil (pak je spec výchozí příklad) */
  problem: string | null;
  /** souřadnice vrcholů z xy= (jen u platného odkazu s xy; pořadí vrcholů jako vstup) */
  xy?: LinkPositions;
}

/* ------------------------------------------------------------------ xy= (souřadnice v odkazu) */

/**
 * Souřadnice vrcholů v odkazu (xy=): ručně kreslený nebo přesunutý graf se otevře se stejnou kresbou.
 * Formát: celá čísla v desetitisícinách oddělená „_“ (adresa je nekóduje), x₀_y₀_x₁_y₁… v pořadí vrcholů vstupu
 * g= (tak, jak je přečte parseGraphInput). Volitelný první údaj a<desetitisíciny> = poměr stran kresby, jen když
 * se liší od toho, co dá odkaz bez xy; „a0“ = volná kresba bez poměru stran (a bez knižních ohnutí hran).
 */
export interface LinkPositions {
  /** chybí = poměr stran jako bez xy; null = volná kresba (bez aspect); číslo = pevný poměr stran */
  aspect?: number | null;
  pts: [number, number][];
}

/** souřadnice v odkazu: celé desetitisíciny (editor sám zaokrouhluje na 4 místa – kresba se obnoví přesně) */
const XY_SCALE = 10000;
const unit = (v: number) => Math.round(v * XY_SCALE);
const INT_TOKEN = /^-?\d+$/;

/** Hodnota xy= pro souřadnice `pts` (a poměr stran, je-li zadaný; null = a0). */
export function encodeXY(
  pts: readonly (readonly [number, number])[],
  aspect?: number | null,
): string {
  const head =
    aspect === undefined
      ? []
      : [`a${aspect === null ? 0 : Math.max(1, unit(aspect))}`];
  return [...head, ...pts.flatMap(([x, y]) => [unit(x), unit(y)])]
    .map(String)
    .join("_");
}

/** největší |souřadnice| i poměr stran z odkazu – nesmyslně vzdálený vrchol by kresbu zmenšil na tečku */
const XY_LIMIT = 10;

/** Souřadnice z xy=; vadný zápis (lichý počet čísel, nečíselné údaje, mimo ±XY_LIMIT) → null. */
export function decodeXY(s: string): LinkPositions | null {
  const tokens = s.split("_");
  let aspect: number | null | undefined;
  if (tokens[0]?.startsWith("a")) {
    const a = tokens.shift()!.slice(1);
    if (!/^\d+$/.test(a)) return null;
    aspect = Number(a) === 0 ? null : Number(a) / XY_SCALE;
    if (aspect !== null && aspect > XY_LIMIT) return null;
  }
  if (tokens.length === 0 || tokens.length % 2 !== 0) return null;
  if (!tokens.every((t) => INT_TOKEN.test(t))) return null;
  const nums = tokens.map((t) => Number(t) / XY_SCALE);
  if (nums.some((v) => Math.abs(v) > XY_LIMIT)) return null;
  const pts: [number, number][] = [];
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return aspect === undefined ? { pts } : { aspect, pts };
}

const XY_PROBLEM =
  "Souřadnice vrcholů z odkazu nešly použít – graf je rozložen automaticky.";

/** Graf z odkazu: vstup (buildGraph – knižní souřadnice, jinak silové rozložení) a na něm souřadnice z xy=. */
export function graphFromUrl(url: UrlState): Graph {
  const g = buildGraph(url.spec).graph;
  const xy = url.xy;
  if (!xy || xy.pts.length !== g.nodes.length) return g;
  g.nodes.forEach((n, i) => {
    [n.x, n.y] = xy.pts[i];
  });
  if (xy.aspect === null) {
    delete g.aspect;
    for (const e of g.edges) delete e.bend;
  } else if (xy.aspect !== undefined) g.aspect = xy.aspect;
  return g;
}

/**
 * xy= pro graf `g`, jehož odkaz bez xy otevře `rebuilt`: null, když se kresby v desetitisícinách shodují (nezměněná
 * předvolba, náhodný graf – odkaz zůstane krátký), jinak souřadnice v pořadí vrcholů `rebuilt`.
 */
function positionsParam(g: Graph, rebuilt: Graph): string | null {
  const byLabel = new Map(g.nodes.map((n) => [n.label, n]));
  const pts: [number, number][] = [];
  let same = true;
  for (const r of rebuilt.nodes) {
    const n = byLabel.get(r.label);
    if (!n) return null; // jiná struktura – nemělo by nastat
    pts.push([n.x, n.y]);
    if (unit(n.x) !== unit(r.x) || unit(n.y) !== unit(r.y)) same = false;
  }
  const aspectKey = (x: Graph) =>
    x.aspect === undefined ? 0 : Math.max(1, unit(x.aspect));
  const aspectSame = aspectKey(g) === aspectKey(rebuilt);
  if (same && aspectSame) return null;
  return encodeXY(pts, aspectSame ? undefined : (g.aspect ?? null));
}

/** Klíč kresby v desetitisícinách (stránka podle něj pozná přesun vrcholu, který patří do odkazu). */
export function positionsKey(g: Graph): string {
  return encodeXY(
    g.nodes.map((n) => [n.x, n.y] as const),
    g.aspect ?? null,
  );
}

/**
 * Typ grafu pro odkaz s g= bez d= / w= (ručně psaný nebo zkrácený): výchozí typy staré verze (projekt
 * algo/ před sloučením), ne dnešního výchozího příkladu – dřívější BFS byl neorientovaný, dnes je výchozí
 * orientované prasátko. Odkazy z aplikace d / w nesou vždy, tohle je jen pojistka.
 */
const LEGACY_LINK_TYPE: Record<
  string,
  { directed: boolean; weighted: boolean }
> = {
  bfs: { directed: false, weighted: false },
  dfs: { directed: true, weighted: false },
  topo: { directed: true, weighted: false },
  dijkstra: { directed: false, weighted: true },
  jarnik: { directed: false, weighted: true },
  kruskal: { directed: false, weighted: true },
};

/** Vstup z adresy; vadný nebo chybějící graf → výchozí příklad (a u vadného důvod v `problem`). */
export function specFromParams(
  algo: GraphAlgorithm,
  params: URLSearchParams,
): UrlState {
  const def = defaultSpec(algo);
  const text = params.get("g");
  const startLabel = params.get("s");
  const xyText = params.get("xy");
  /** xy= k platnému vstupu s `count` vrcholy: shodný počet → souřadnice, jinak hláška */
  const positions = (count: number) => {
    if (xyText === null) return {};
    const xy = decodeXY(xyText);
    return xy && xy.pts.length === count ? { xy } : { problem: XY_PROBLEM };
  };
  if (text === null || text.trim() === "") {
    const pos = positions(
      parseGraphInput(def.text, def.directed, def.weighted, { layout: false })
        .graph.nodes.length,
    );
    return withXY(
      withStartCheck(algo, def, startLabel, pos.problem ?? null),
      pos.xy,
    );
  }
  const flag = (name: string, fallback: boolean) => {
    const v = params.get(name);
    return v === "1" ? true : v === "0" ? false : fallback;
  };
  const layoutId = params.get("p");
  const named = layoutId !== null ? presetById(layoutId) : undefined;
  const layout = named && isBookPreset(named) ? named.id : undefined;
  const legacy = LEGACY_LINK_TYPE[algo.id] ?? def;
  const spec = effectiveSpec(algo, {
    text,
    directed: flag("d", legacy.directed),
    weighted: flag("w", legacy.weighted),
    ...(layout !== undefined ? { layout } : {}),
  });
  const parsed = parseGraphInput(spec.text, spec.directed, spec.weighted, {
    layout: false,
  });
  if (parsed.errors.length) {
    return {
      spec: def,
      startLabel: null,
      problem: `Graf z odkazu nešel použít (${parsed.errors[0].message}) – zobrazen výchozí příklad.`,
    };
  }
  if (parsed.graph.nodes.length === 0)
    return { spec: def, startLabel: null, problem: null };
  const pos = positions(parsed.graph.nodes.length);
  return withXY(
    withStartCheck(algo, spec, startLabel, pos.problem ?? null),
    pos.xy,
  );
}

const withXY = (st: UrlState, xy: LinkPositions | undefined): UrlState =>
  xy ? { ...st, xy } : st;

/** v₀ z odkazu, který v grafu není: hláška nad plátnem a začátek jako bez s= (adresa se nepřepisuje). */
function withStartCheck(
  algo: GraphAlgorithm,
  spec: Spec,
  startLabel: string | null,
  problem: string | null,
): UrlState {
  if (!algo.needsStart || startLabel === null)
    return { spec, startLabel, problem };
  const g = buildGraph(spec).graph;
  if (g.nodes.some((n) => n.label === startLabel))
    return { spec, startLabel, problem };
  const layout = g.aspect ? (spec.layout ?? layoutPreset(spec)?.id) : undefined;
  const first =
    pageStartLabel(algo, g, layout, null) ?? g.nodes[0]?.label ?? "";
  const missing = `Vrchol ${startLabel} v grafu není – začínáme z ${first}.`;
  return {
    spec,
    startLabel: null,
    problem: problem ? `${problem} ${missing}` : missing,
  };
}

/**
 * Parametry adresy pro sdílení. Výchozí příklad s prvním vrcholem jako v₀ adresu vyčistí (prázdný objekt).
 * Vynucený typ grafu se do adresy nepíše.
 */
export function specToParams(
  algo: GraphAlgorithm,
  s: Spec,
  startLabel: string | null,
): Record<string, string> {
  const def = defaultSpec(algo);
  const e = effectiveSpec(algo, s);
  const nodes = parseGraphInput(e.text, e.directed, e.weighted, {
    layout: false,
  }).graph.nodes;
  // výchozí v₀: start knižní předlohy (obr. 7.2 → E), jinak první vrchol vstupu
  const book = layoutPreset(e);
  const bookStart = book && isBookPreset(book) ? book.start : undefined;
  const defaultStart =
    bookStart !== undefined && nodes.some((n) => n.label === bookStart)
      ? bookStart
      : (nodes[0]?.label ?? null);
  const startIsDefault =
    !algo.needsStart || startLabel === null || startLabel === defaultStart;
  if (
    e.text === def.text &&
    e.directed === def.directed &&
    e.weighted === def.weighted &&
    startIsDefault
  )
    return {};
  const out: Record<string, string> = { g: e.text };
  if (algo.directed === undefined) out.d = e.directed ? "1" : "0";
  if (algo.weighted === undefined) out.w = e.weighted ? "1" : "0";
  if (algo.needsStart && startLabel !== null && !startIsDefault)
    out.s = startLabel;
  // souřadnice z knihy po úpravě textu (přesná předvolba se pozná podle textu sama)
  const layout = e.layout !== undefined ? presetById(e.layout) : undefined;
  if (layout && isBookPreset(layout) && layout.text !== e.text)
    out.p = layout.id;
  return out;
}

/**
 * v₀ stránky: výslovně zvolený (`chosen` – odkaz s=, klik, akce), jinak start knižní předlohy `layout`
 * (BookPreset.start, je-li v grafu), jinak null = první vrchol. Algoritmy bez v₀ vrací null.
 */
export function pageStartLabel(
  algo: GraphAlgorithm,
  g: Graph,
  layout: string | undefined,
  chosen: string | null,
): string | null {
  if (!algo.needsStart) return null;
  if (chosen !== null) return chosen;
  const p = layout !== undefined ? presetById(layout) : undefined;
  const start = p && isBookPreset(p) ? p.start : undefined;
  return start !== undefined && g.nodes.some((n) => n.label === start)
    ? start
    : null;
}

/** Id vrcholu s daným názvem, jinak první vrchol vstupu (0). */
export function startByLabel(g: Graph, label: string | null): number {
  if (label === null) return 0;
  return g.nodes.find((n) => n.label === label)?.id ?? 0;
}

/* ------------------------------------------------------------------ popisky */

const NON_TREE_SWATCHES = new Set(["sw-back", "sw-forward", "sw-cross"]);

/**
 * Legenda podle stylu kresby. Ve stylu knihy (obr. 5.9) jsou všechny nestromové hrany stejně tečkované,
 * takže se zpětná, dopředná a příčná hrana sloučí do jedné položky na místě první z nich.
 */
export function legendForStyle(
  items: readonly LegendItem[],
  style: "color" | "book",
): LegendItem[] {
  if (style === "color") return [...items];
  const out: LegendItem[] = [];
  let merged = false;
  for (const l of items) {
    if (!NON_TREE_SWATCHES.has(l.cls)) out.push(l);
    else if (!merged) {
      merged = true;
      out.push({
        cls: "sw-seen",
        label:
          "nestromová hrana (tečkovaně; typ – zpětná, dopředná, příčná – je v popisku)",
        shape: "line-dashed",
      });
    }
  }
  return out;
}

/** Název operace nad zprávou, např. „BFS(v₀ = A)“, „Kruskal“. */
export function opTitleFor(
  algo: GraphAlgorithm,
  g: Graph,
  start: number,
): string {
  const label = g.nodes[start]?.label;
  return algo.needsStart && label !== undefined
    ? `${algo.opName}(v₀ = ${label})`
    : algo.opName;
}

/** Text o rozsahu limitů pro popisek pole hran. */
export const limitsText = (maxNodes: number, maxEdges: number) =>
  `nejvýše ${maxNodes} vrcholů a ${maxEdges} hran`;

/* ------------------------------------------------------------------ editor na plátně (GraphEditor) */

/** Struktura grafu bez souřadnic; u neohodnoceného grafu ceny nehrají roli (zůstanou po vypnutí „ohodnocený“). */
function structureOf(g: Graph): string {
  return topologyKey(
    g.weighted ? g : { ...g, edges: g.edges.map((e) => ({ ...e, w: 1 })) },
  );
}

/** Klíč, podle kterého stránka přepočítá kroky: struktura grafu (přesun vrcholu běh nerestartuje). */
export const graphStructureKey = structureOf;

/**
 * Struktura i souřadnice vrcholů: sezení v „Upravit graf“, které jen přesouvalo, je taky změna vstupu
 * (↶ Vrátit operaci, V-4).
 */
export const graphDrawingKey = (g: Graph): string =>
  `${structureOf(g)}|${g.nodes.map((n) => `${n.x},${n.y}`).join(";")}`;

/**
 * Index předvolby se stejnou strukturou jako graf (vrcholy, hrany v pořadí, ceny, orientace – s vynuceným
 * typem algoritmu), jinak −1 („vlastní graf“). Souřadnice se neporovnávají.
 */
export function presetMatch(algo: GraphAlgorithm, g: Graph): number {
  const key = structureOf(g);
  return PRESETS.findIndex((p) => {
    const e = effectiveSpec(algo, p);
    return (
      structureOf(
        parseGraphInput(e.text, e.directed, e.weighted, { layout: false })
          .graph,
      ) === key
    );
  });
}

/**
 * Graf předvolby pro editor: knižní přesně podle obrázku (s předlohou `layout` = id pro odkaz), ostatní
 * silově rozložené. Typ grafu podle algoritmu (effectiveSpec). Neznámé id je chyba programu.
 */
export function loadPresetGraph(
  algo: GraphAlgorithm,
  id: string,
): { graph: Graph; layout: string | undefined } {
  const p = presetById(id);
  if (!p) throw new Error(`neznámá předvolba ${id}`);
  const spec = effectiveSpec(algo, {
    text: p.text,
    directed: p.directed,
    weighted: p.weighted,
    ...(isBookPreset(p) ? { layout: p.id } : {}),
  });
  return {
    graph: buildGraph(spec).graph,
    layout: isBookPreset(p) ? p.id : undefined,
  };
}

/**
 * Parametry adresy pro graf z editoru. Předvolba se zapíše svým textem (stejný tvar jako dřívější odkazy,
 * výchozí příklad adresu vyčistí), upravený graf textem z kresby a s knižní předlohou p, má-li knižní
 * souřadnice. Prázdný graf adresu nemá (null – otevřel by se výchozí příklad).
 */
export function pageParams(
  algo: GraphAlgorithm,
  g: Graph,
  startLabel: string | null,
  layout: string | undefined,
): Record<string, string> | null {
  if (g.nodes.length === 0) return null;
  const i = presetMatch(algo, g);
  const text = i >= 0 ? PRESETS[i].text : graphEditText(g);
  const out = specToParams(
    algo,
    {
      text,
      directed: g.directed,
      weighted: g.weighted,
      ...(i < 0 && g.aspect !== undefined && layout !== undefined
        ? { layout }
        : {}),
    },
    startLabel,
  );
  // souřadnice jen když se kresba liší od té, kterou by odkaz bez xy otevřel (přesun, ruční kreslení)
  const rebuilt = buildGraph(
    specFromParams(algo, new URLSearchParams(out)).spec,
  ).graph;
  const xy = positionsParam(g, rebuilt);
  return xy === null ? out : { ...out, xy };
}

/**
 * Popisek zdroje pod obrázkem: knižní předvolba („Obr. 5.5 „Prasátko“ – Průvodce …, s. 113“), upravený
 * knižní graf s dovětkem „(upraveno)“, k tomu poznámka předvolby. Bez knižní kresby null.
 */
export function sourceCaption(
  algo: GraphAlgorithm,
  g: Graph,
  layout: string | undefined,
): string | null {
  const p = layout !== undefined ? presetById(layout) : undefined;
  if (!p || !isBookPreset(p) || g.aspect === undefined) return null;
  const exact = PRESETS[presetMatch(algo, g)]?.id === p.id;
  return (
    `${p.label} – ${sourceText(p)}${exact ? "" : " (upraveno)"}` +
    (p.note ? `. ${p.note}` : "")
  );
}

/** Popisky vrcholů v pořadí, v jakém je algoritmy procházejí (čísla podle velikosti) – nabídka v₀. */
export function startLabels(g: Graph): string[] {
  return g.nodes.map((n) => n.label).sort(cmpLabel);
}

/** Id vrcholu s daným popiskem, jinak první vrchol (0). */
export function startIndex(g: Graph, label: string | null): number {
  return startByLabel(g, label);
}

/** Nový graf s cenami `ws` v pořadí hran (chybějící ceny zůstanou); vstupní graf se nemění. */
export function withWeights(g: Graph, ws: readonly number[]): Graph {
  return {
    ...g,
    weighted: true,
    edges: g.edges.map((e, i) => (i < ws.length ? { ...e, w: ws[i] } : e)),
  };
}

/** rozsah cen v poli „Ceny hran“ (jako dřív; větší ceny jdou zadat na plátně nebo textem) */
export const WEIGHT_LIMIT = 9999;

/**
 * Text pole „Ceny hran“: ceny v pořadí hran oddělené mezerou, s českou desetinnou čárkou a typografickým
 * minus („4 2,5 −1“). Odkaz a textový zápis grafu drží tečku (graphToText) – tady jde jen o pole.
 */
export function formatWeights(ws: readonly number[]): string {
  return ws.map(fmtNum).join(" ");
}

export interface WeightsParse {
  /** ceny v pořadí hran (nejvýše maxCount) */
  values: number[];
  /** proč vstup nejde použít (Provést zablokované); null = jde */
  error: string | null;
  /** co se ze vstupu nepoužilo (přebytečná čísla); null = nic */
  note: string | null;
}

/** jméno a rovnítko na začátku („váhy = 4 2,5“), jak ho pole ukazuje v popisku */
const WEIGHTS_ASSIGN = /^\s*\p{L}[\p{L}\p{N}_]*\s*=/u;
/** jedno číslo: desetinná čárka i tečka, nejvýš jedna */
const WEIGHT_TOKEN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/**
 * Ceny z pole „Ceny hran“. Desetinná čárka i tečka („2,5“ = „2.5“); čísla odděluje mezera, středník nebo
 * čárka, která neleží mezi dvěma číslicemi („4, 2, 7“ – dřívější zápis pole). „4,2,7“ tedy není tři čísla,
 * ale nečitelné číslo – přísně jako dřív: každé číslo patří konkrétní hraně, vynechání by posunulo ostatní,
 * takže neplatné slovo nebo číslo mimo ±WEIGHT_LIMIT je chyba. Přebytečná čísla se nepoužijí (poznámka).
 */
export function parseWeights(text: string, maxCount: number): WeightsParse {
  const cleaned = text
    .replace(WEIGHTS_ASSIGN, "")
    .replaceAll("−", "-")
    .replace(/,(?!\d)|(?<!\d),/g, " ");
  const tokens = cleaned.split(/[\s;]+/).filter(Boolean);
  const range = `od −${WEIGHT_LIMIT} do ${WEIGHT_LIMIT}`;
  if (tokens.length === 0)
    return {
      values: [],
      error: `Zadejte aspoň jedno číslo ${range}; čísla oddělte mezerou.`,
      note: null,
    };
  const all: number[] = [];
  for (const tok of tokens) {
    const shown = tok.replace(/^-/, "−");
    if (!WEIGHT_TOKEN.test(tok))
      return {
        values: [],
        error: `‚${shown}‘ není číslo – čísla oddělte mezerou, desetinná čárka patří dovnitř čísla (2,5).`,
        note: null,
      };
    const v = Number(tok.replace(",", "."));
    if (!Number.isFinite(v) || Math.abs(v) > WEIGHT_LIMIT)
      return {
        values: [],
        error: `‚${shown}‘ je mimo rozsah – zadejte čísla ${range}.`,
        note: null,
      };
    all.push(v === 0 ? 0 : v);
  }
  const values = all.slice(0, Math.max(1, maxCount));
  return {
    values,
    error: null,
    note:
      all.length > values.length
        ? `Použito prvních ${values.length} z ${all.length} čísel (jedno na hranu).`
        : null,
  };
}

/** Pořadí hran pro pole cen: „A–B, B–C“ (orientovaný „A→B“). */
export function weightsOrder(g: Graph): string {
  const arrow = g.directed ? "→" : "–";
  return g.edges
    .map((e) => `${g.nodes[e.u].label}${arrow}${g.nodes[e.v].label}`)
    .join(", ");
}

/**
 * Náhodný graf pro editor: n vrcholů, m hran oříznutých do povoleného rozsahu, typ podle dosavadního
 * grafu a algoritmu (topologické uspořádání dostane DAG), silově rozložený. Bez `seed` pokaždé jiný.
 */
/**
 * Poznámka k Vytvořit ▸ Náhodně, když se m nevejde do rozsahu (souvislý graf bez násobných hran):
 * na kolik se m upravilo; null = m platí.
 */
export function randomEdgeNote(
  algo: GraphAlgorithm,
  type: { directed: boolean; weighted: boolean },
  n: number,
  m: number,
): string | null {
  const e = effectiveSpec(algo, { text: "", ...type });
  const r = randomEdgeRange(n, e.directed, algo.id === "topo");
  if (m > r.max)
    return `m omezeno na největší možný počet hran pro n = ${n}: m = ${r.max}.`;
  if (m < r.min)
    return `m zvýšeno na n − 1 = ${r.min} (náhodný graf je souvislý).`;
  return null;
}

export function randomPageGraph(
  algo: GraphAlgorithm,
  type: { directed: boolean; weighted: boolean },
  n: number,
  m: number,
  seed = Date.now(),
): Graph {
  const e = effectiveSpec(algo, { text: "", ...type });
  const acyclic = algo.id === "topo";
  const r = randomEdgeRange(n, e.directed, acyclic);
  const text = randomGraph(
    n,
    Math.max(r.min, Math.min(r.max, m)),
    e.directed,
    e.weighted,
    seed,
    { acyclic },
  );
  return buildGraph({ ...e, text }).graph;
}

/**
 * Nový scrollTop panelu výsledku, aby byl zvýrazněný řádek tabulky vidět (posun o co nejméně). `stickyTop` =
 * výška obsahu, který v panelu lepí nahoře (les Union-Find s position: sticky) a řádek by zakryl.
 * Obdélníky jsou v souřadnicích okna (getBoundingClientRect).
 */
export function keepRowVisible(
  panel: { top: number; bottom: number },
  row: { top: number; bottom: number },
  scrollTop: number,
  stickyTop = 0,
): number {
  const top = panel.top + stickyTop;
  if (row.top < top) return Math.max(0, scrollTop - (top - row.top));
  if (row.bottom > panel.bottom)
    return Math.max(0, scrollTop + (row.bottom - panel.bottom));
  return scrollTop;
}
