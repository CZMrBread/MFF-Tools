import { formatNum } from "../../core/format";
import { rng } from "../../core/steps";

export interface GNode {
  id: number;
  label: string;
  x: number; // 0..1
  y: number; // 0..1
}
export interface GEdge {
  id: number;
  u: number;
  v: number;
  w: number;
  /**
   * Ohnutí hrany jako v knize (jen kresba). Obyčejná hrana: posun řídicího bodu kvadratické křivky kolmo
   * k hraně v násobcích její délky, kladný = doprava ve směru u → v (na obrazovce s osou y dolů).
   * Smyčka: směr kapky ve stupních (0 = doprava, 90 = dolů, 180 = doleva, −90 = nahoru).
   */
  bend?: number;
}
export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  directed: boolean;
  weighted: boolean;
  /**
   * Poměr stran kresby (šířka / výška obdélníku se středy vrcholů v 0…1). Je-li zadaný, souřadnice jsou
   * pevné (předvolba z knihy) a GraphView je kreslí bez deformace; jinak se osy natáhnou na plátno zvlášť.
   */
  aspect?: number;
}

/** Stav vizualizace nad (neměnným) grafem. */
export interface GraphState {
  nodeMarks: Record<number, string>;
  edgeMarks: Record<number, string>;
  /** text pod vrcholem (vzdálenost, in/out…) */
  nodeSub: Record<number, string>;
  vars: Record<string, string | number>;
  /** pomocná tabulka (fronta, zásobník, halda, seřazené hrany…) */
  table?: {
    title: string;
    header: string[];
    rows: string[][];
    highlight?: number;
    /** třídy jednotlivých buněk: klíč cellKey(řádek, sloupec) z views/tableCells → např. „cell-hot“ */
    cellMarks?: Readonly<Record<string, string>>;
    /** po změně ukázat konec (zásobník: aktuální vrchol je poslední) */
    tail?: boolean;
  };
  /** les keříků Union-Find (Kruskal) – kreslí ho UnionFindView v panelu výsledku */
  uf?: UnionFindState;
  /**
   * Popisek hrany místo ceny (fáze 4: tok „f/c“, rezerva…) podle id hrany; hrany bez popisku ukážou cenu
   * (ohodnocený graf) nebo nic. Kreslí GraphView.
   */
  edgeText?: Record<number, string>; // "" = hrana bez popisku (ani ceny)
  /**
   * Šipka na hraně i v neorientovaném grafu: „v“ = šipka do vrcholu v, „u“ = do u, „both“ = oboustranná
   * (Borůvka: kdo si hranu vybral, jako obr. 7.5). V orientovaném grafu se nepoužívá.
   */
  edgeArrow?: Record<number, "u" | "v" | "both">;
}

/** Union-Find s keříky podle Průvodce 7.4: otcové P(v), hloubky H v kořenech a co právě zvýraznit. */
export interface UnionFindState {
  /** otec P(v) podle id vrcholu; null = kořen keříku (∅ v knize) */
  parent: (number | null)[];
  /** H(v) – hloubka keříku, platná v kořeni (vrchol mimo kořen si nechává hodnotu z doby, kdy kořenem byl) */
  depth: number[];
  /** vrcholy, kterými právě prošel Find (cesty od obou konců hrany až do kořenů) */
  path: number[];
  /** kořen, který Union právě připojil pod jiný kořen (jeho nová šipka P se zvýrazní); null = nic */
  linked: number | null;
}

export const emptyState = (): GraphState => ({
  nodeMarks: {},
  edgeMarks: {},
  nodeSub: {},
  vars: {},
});

/** Největší graf, který stránka přijme a algoritmy krokují (větší se na plátno nevejde a krokování by zamrzalo). */
export const MAX_NODES = 60;
export const MAX_EDGES = 200;

/* ------------------------------------------------------------------ čísla */

/** Zaokrouhlení součtů cen na 9 desetinných míst – schová artefakty typu 0.1 + 0.2 = 0.30000000000000004. */
export function roundNum(x: number): number {
  return Number.isFinite(x) ? Number(x.toFixed(9)) : x;
}

/**
 * Číslo pro výpis (vzdálenosti, ceny – hlášky, tabulky, štítky hran): celá čísla beze změny, desetinná bez
 * artefaktů plovoucí čárky, s českou desetinnou čárkou a typografickým minus („−2,5“). Textový zápis grafu
 * a odkaz (graphToText, g=…) drží tečku – tam se čísla píší přes String(x).
 */
export function fmtNum(x: number): string {
  if (Number.isNaN(x)) return "?";
  return formatNum(roundNum(x)).replace(/^-/, "−");
}

/** Česká množná čísla: plural(3, 'hranu', 'hrany', 'hran') = „3 hrany“. */
export function plural(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

/* ------------------------------------------------------------------ parsování */

export interface GraphIssue {
  /** číslo řádku vstupu (od 1); 0 = týká se celého vstupu */
  line: number;
  message: string;
}

export interface ParsedGraph {
  graph: Graph;
  /** řádky, které nejdou použít (v grafu nejsou), a překročené limity – stránka takový vstup nepřijme */
  errors: GraphIssue[];
  /** podezřelé, ale použitelné řádky (smyčky, násobné hrany) */
  warnings: GraphIssue[];
}

/** Desítkové číslo (s volitelným znaménkem a exponentem); 0x10, prázdný řetězec apod. cenou nejsou. */
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

const splitTokens = (s: string) => s.split(/[\s,;]+/).filter(Boolean);

/**
 * Rozdělí řádek na údaje. Oddělovačem je mezera, čárka i středník („b,c;7“). Jediná výjimka: je-li cena
 * třetím údajem odděleným mezerou, smí v ní být desetinná čárka („u v 2,5“ = cena 2.5).
 */
function tokenize(line: string): string[] {
  const m = /^(.*\s)([+\-−]?\d+),(\d+)$/.exec(line);
  if (m) {
    const head = splitTokens(m[1]);
    if (head.length === 2) return [...head, `${m[2]}.${m[3]}`];
  }
  return splitTokens(line);
}

/** Cena hrany z textu, null = není to (konečné) desítkové číslo. Typografické minus (−) bereme jako minus. */
function parseWeight(token: string): number | null {
  const t = token.replace(/^−/, "-");
  if (!DECIMAL.test(t)) return null;
  const w = Number(t);
  return Number.isFinite(w) ? w : null;
}

/**
 * Formát: každý řádek "u v" nebo "u v cena". Vrcholy jsou libovolné tokeny bez mezer, čárek a středníků.
 * Řádek s jediným tokenem přidá izolovaný vrchol, text za # je komentář.
 * Vadné řádky (neplatná cena, údaje navíc) se do grafu nedostanou a vrátí se v `errors`.
 */
export function parseGraphInput(
  text: string,
  directed: boolean,
  weighted: boolean,
  opts: { layout?: boolean } = {},
): ParsedGraph {
  const labels = new Map<string, number>();
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const errors: GraphIssue[] = [];
  const warnings: GraphIssue[] = [];
  const firstLine = new Map<string, number>(); // dvojice vrcholů → řádek prvního výskytu
  const node = (lab: string) => {
    let id = labels.get(lab);
    if (id === undefined) {
      id = nodes.length;
      labels.set(lab, id);
      nodes.push({ id, label: lab, x: 0, y: 0 });
    }
    return id;
  };
  const lines = String(text ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const t = tokenize(lines[i].replace(/#.*$/, "").trim());
    if (!t.length) continue; // prázdný řádek, komentář nebo jen oddělovače
    if (t.length === 1) {
      node(t[0]);
      continue;
    }
    if (t.length > 3) {
      errors.push({
        line: ln,
        message: `Řádek ${ln}: příliš mnoho údajů – čekám „u v“ nebo „u v cena“ (desetinnou cenu pište s tečkou: 2.5).`,
      });
      continue;
    }
    let w = 1;
    if (t.length === 3) {
      const parsed = parseWeight(t[2]);
      if (parsed === null) {
        errors.push({
          line: ln,
          message: `Řádek ${ln}: cena „${t[2]}“ není číslo.`,
        });
        continue;
      }
      w = parsed;
    }
    const u = node(t[0]);
    const v = node(t[1]);
    const sep = directed ? "→" : "–";
    if (u === v) {
      warnings.push({
        line: ln,
        message: `Řádek ${ln}: smyčka ${t[0]}${sep}${t[0]} (hrana z vrcholu do něj samého).`,
      });
    } else {
      const key = directed || u < v ? `${u}:${v}` : `${v}:${u}`;
      const seen = firstLine.get(key);
      if (seen !== undefined)
        warnings.push({
          line: ln,
          message: `Řádek ${ln}: hrana ${t[0]}${sep}${t[1]} už je na řádku ${seen} (násobná hrana).`,
        });
      else firstLine.set(key, ln);
    }
    edges.push({ id: edges.length, u, v, w });
  }
  if (nodes.length > MAX_NODES)
    errors.push({
      line: 0,
      message: `Graf má ${plural(nodes.length, "vrchol", "vrcholy", "vrcholů")} – vizualizace zvládne nejvýše ${MAX_NODES}.`,
    });
  if (edges.length > MAX_EDGES)
    errors.push({
      line: 0,
      message: `Graf má ${plural(edges.length, "hranu", "hrany", "hran")} – vizualizace zvládne nejvýše ${MAX_EDGES}.`,
    });
  const g: Graph = { nodes, edges, directed, weighted };
  // kontrola během psaní rozložení nepotřebuje (souřadnice zůstanou 0)
  if (opts.layout !== false) layoutGraph(g);
  return { graph: g, errors, warnings };
}

/** Jen graf (bez hlášení chyb) – pro předvolby a testy. Vadné řádky vynechá, viz parseGraphInput. */
export function parseGraph(
  text: string,
  directed: boolean,
  weighted: boolean,
): Graph {
  return parseGraphInput(text, directed, weighted).graph;
}

export function graphToText(g: Graph): string {
  return g.edges
    .map(
      (e) =>
        `${g.nodes[e.u].label} ${g.nodes[e.v].label}${g.weighted ? " " + e.w : ""}`,
    )
    .join("\n");
}

/** Sousedé vrcholu v pořadí podle popisku (jako v knize: od nejmenšího). */
export function neighbors(g: Graph, u: number): { v: number; e: GEdge }[] {
  const out: { v: number; e: GEdge }[] = [];
  for (const e of g.edges) {
    if (e.u === u) out.push({ v: e.v, e });
    else if (!g.directed && e.v === u) out.push({ v: e.u, e });
  }
  return out.sort((a, b) => cmpLabel(g.nodes[a.v].label, g.nodes[b.v].label));
}

/**
 * Počáteční vrchol po změně grafu: id vrcholu se stejným názvem v novém grafu (id jsou poziční a po úpravě
 * textu se mohou posunout), jinak první vrchol vstupu.
 */
export function remapStart(prev: Graph, start: number, next: Graph): number {
  const label = prev.nodes[start]?.label;
  if (label === undefined) return 0;
  return next.nodes.find((n) => n.label === label)?.id ?? 0;
}

/** Popisek, který je celý desítkovým číslem (bez exponentu) – takové řadíme podle hodnoty. */
const NUMERIC_LABEL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Úplné uspořádání popisků „podle názvu“: nejdřív číselné popisky podle hodnoty (2 < 10), pak ostatní
 * přirozeně česky (v2 < v10, c < č). Stejně velké či stejně řazené popisky („1“ a „01“) rozliší jejich text,
 * takže výsledek nikdy nezávisí na pořadí řádků vstupu.
 */
export function cmpLabel(a: string, b: string): number {
  const na = NUMERIC_LABEL.test(a);
  const nb = NUMERIC_LABEL.test(b);
  if (na !== nb) return na ? -1 : 1;
  if (na) {
    const d = Number(a) - Number(b);
    if (d) return d < 0 ? -1 : 1; // d = 0 (stejná hodnota) i NaN (∞ − ∞ u obřích čísel) rozhodne text
  }
  return (
    a.localeCompare(b, "cs", { numeric: true }) || (a < b ? -1 : a > b ? 1 : 0)
  );
}

/* ------------------------------------------------------------------ rozložení */

/** Kolik dvojic vrcholů × iterací si silové rozložení smí dovolit (100 vrcholů × 300 iterací). */
const LAYOUT_BUDGET = 300 * 4950;

/**
 * Jednoduché silové rozložení (deterministické). Do 100 vrcholů 300 iterací; u větších grafů iterací
 * úměrně ubývá (u obřích zůstane jen kruh), takže výpočet nikdy nezablokuje stránku.
 */
export function layoutGraph(g: Graph, seed = 42) {
  const n = g.nodes.length;
  if (n === 0) return;
  const r = rng(seed);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  // start: kruh s malým šumem
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    x[i] = 0.5 + 0.4 * Math.cos(a) + (r() - 0.5) * 0.05;
    y[i] = 0.5 + 0.4 * Math.sin(a) + (r() - 0.5) * 0.05;
  }
  if (n === 1) {
    g.nodes[0].x = 0.5;
    g.nodes[0].y = 0.5;
    return;
  }
  const pairs = (n * (n - 1)) / 2;
  const iters = n <= 100 ? 300 : Math.floor(LAYOUT_BUDGET / pairs);
  if (iters > 0) {
    // sousednost jako matice bajtů (žádné skládání řetězců ve vnitřní smyčce)
    const adj = new Uint8Array(n * n);
    for (const e of g.edges) {
      if (
        e.u >= 0 &&
        e.u < n &&
        e.v >= 0 &&
        e.v < n &&
        Number.isInteger(e.u) &&
        Number.isInteger(e.v)
      ) {
        adj[e.u * n + e.v] = 1;
        adj[e.v * n + e.u] = 1;
      }
    }
    const k = 0.9 / Math.sqrt(n);
    // u zkráceného běhu chladneme rychleji, aby teplota skončila stejně nízko jako po 300 iteracích
    const cool = iters === 300 ? 0.985 : Math.pow(0.985, 300 / iters);
    let temp = 0.1;
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);
    for (let it = 0; it < iters; it++) {
      dx.fill(0);
      dy.fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let ex = x[i] - x[j];
          let ey = y[i] - y[j];
          let d = Math.hypot(ex, ey);
          if (d < 1e-4) {
            ex = r() - 0.5;
            ey = r() - 0.5;
            d = Math.hypot(ex, ey) || 1e-4;
          }
          const rep = (k * k) / d;
          const att = adj[i * n + j] ? (d * d) / k : 0;
          const f = (rep - att) / d;
          dx[i] += ex * f;
          dy[i] += ey * f;
          dx[j] -= ex * f;
          dy[j] -= ey * f;
        }
      }
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(dx[i], dy[i]) || 1;
        const s = Math.min(d, temp) / d;
        x[i] += dx[i] * s;
        y[i] += dy[i] * s;
        // gravitace ke středu
        x[i] += (0.5 - x[i]) * 0.01;
        y[i] += (0.5 - y[i]) * 0.01;
      }
      temp *= cool;
    }
  }
  // normalizace do [0.06, 0.94] × [0.08, 0.92]
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]);
    maxX = Math.max(maxX, x[i]);
    minY = Math.min(minY, y[i]);
    maxY = Math.max(maxY, y[i]);
  }
  // (podmínka je psaná tak, aby i nekonečné či NaN rozpětí skončilo uprostřed plátna)
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  for (let i = 0; i < n; i++) {
    g.nodes[i].x =
      spanX >= 1e-6 && Number.isFinite(spanX)
        ? 0.06 + (0.88 * (x[i] - minX)) / spanX
        : 0.5;
    g.nodes[i].y =
      spanY >= 1e-6 && Number.isFinite(spanY)
        ? 0.08 + (0.84 * (y[i] - minY)) / spanY
        : 0.5;
  }
}

/* ------------------------------------------------------------------ náhodný graf */

export interface RandomGraphOptions {
  /** jen pro orientované grafy: výsledek je DAG (pro topologické uspořádání) */
  acyclic?: boolean;
}

/** Celé číslo z [lo, hi]; nečíselný vstup (NaN, ±∞) nahradí `fallback`. */
function clampInt(x: number, lo: number, hi: number, fallback: number): number {
  const v = Number.isFinite(x) ? Math.floor(x) : fallback;
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Povolený počet hran náhodného grafu s n vrcholy: nejméně n − 1 (souvislost), nejvýše kolik se jich vejde
 * bez smyček a násobných hran (a MAX_EDGES).
 */
export function randomEdgeRange(
  n: number,
  directed: boolean,
  acyclic = false,
): { min: number; max: number } {
  n = clampInt(n, 1, MAX_NODES, 8);
  const full = directed && !acyclic ? n * (n - 1) : (n * (n - 1)) / 2;
  return { min: n - 1, max: Math.max(n - 1, Math.min(MAX_EDGES, full)) };
}

/**
 * Náhodný souvislý graf jako text: n vrcholů 1…n (ořízne se na 1…MAX_NODES) a m hran bez smyček a násobných
 * hran (nejméně n − 1 kvůli souvislosti, nejvýše kolik se jich do grafu vejde a MAX_EDGES).
 *
 * Orientovaný graf: hrany kostry vedou od kořene k listům, takže z prvního vrcholu vstupu (výchozí v₀)
 * je dosažitelný celý graf; ostatní hrany míří náhodně a mohou tvořit cykly.
 * S volbou `acyclic` vedou všechny hrany po směru náhodně zvoleného pořadí vrcholů – vznikne DAG, jehož
 * topologické uspořádání není triviálně 1, 2, …, n.
 */
export function randomGraph(
  n: number,
  m: number,
  directed: boolean,
  weighted: boolean,
  seed = Date.now(),
  opts: RandomGraphOptions = {},
): string {
  n = clampInt(n, 1, MAX_NODES, 8);
  const acyclic = directed && !!opts.acyclic;
  const range = randomEdgeRange(n, directed, acyclic);
  m = clampInt(m, range.min, range.max, range.min);
  const r = rng(Number.isFinite(seed) ? seed : 1);
  // name[i] = název vrcholu na i-té pozici; u DAGu pozice náhodně promícháme
  const name = Array.from({ length: n + 1 }, (_, i) => i);
  if (acyclic) {
    for (let i = n; i > 1; i--) {
      const j = 1 + Math.floor(r() * i);
      [name[i], name[j]] = [name[j], name[i]];
    }
  }
  if (n === 1) return String(name[1]);
  const lines: string[] = [];
  const seen = new Set<number>();
  const key = (a: number, b: number) =>
    directed ? a * (n + 1) + b : Math.min(a, b) * (n + 1) + Math.max(a, b);
  const add = (a: number, b: number) => {
    seen.add(key(a, b));
    lines.push(
      `${name[a]} ${name[b]}${weighted ? " " + (1 + Math.floor(r() * 20)) : ""}`,
    );
  };
  // nejdřív náhodný strom s kořenem 1 (hrany od rodiče k dítěti), aby byl graf souvislý
  for (let v = 2; v <= n; v++) add(1 + Math.floor(r() * (v - 1)), v);
  let tries = 0;
  while (lines.length < m && tries++ < 5000) {
    let a = 1 + Math.floor(r() * n);
    let b = 1 + Math.floor(r() * n);
    if (a === b) continue;
    if (acyclic && a > b) [a, b] = [b, a]; // klíč až ze zorientované dvojice, jinak by vznikly násobné hrany
    if (seen.has(key(a, b))) continue;
    add(a, b);
  }
  return lines.join("\n");
}
