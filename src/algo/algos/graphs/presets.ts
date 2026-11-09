/**
 * Předvolby grafů. Knižní předvolby (Průvodce labyrintem algoritmů) nesou souřadnice vrcholů, poměr stran
 * a ohnutí hran přesně podle obrázku – neprocházejí silovým rozložením. Ostatní předvolby jsou jen text hran.
 * Testy v book.test.ts (proti book.fixtures.ts).
 */
import { rng } from "../../core/steps";
import { layoutGraph, parseGraphInput, type Graph } from "./graph";
import { bellmanFordPresets } from "./bellmanFord.presets";
import { boruvkaPresets } from "./boruvka.presets";
import { bridgesPresets } from "./bridges.presets";
import { sccPresets } from "./scc.presets";
import {
  book,
  isBookPreset,
  rowsGrid,
  text,
  type BookPreset,
  type GraphPreset,
} from "./presetKit";

export {
  isBookPreset,
  presetOffered,
  type BookPreset,
  type GraphPreset,
  type PresetEdge,
  type PresetNode,
  type TextPreset,
} from "./presetKit";

/** Obr. 5.5 „Prasátko“ – mřížka 0,5 cm z knihy. */
const PIG = book({
  id: "pig",
  label: "Obr. 5.5 „Prasátko“",
  page: 113,
  start: "0", // obr. 5.8 a 5.9: prohledávání z vrcholu 0
  directed: true,
  weighted: false,
  grid: {
    "0": [8, 1],
    "1": [2, 1],
    "2": [0, 0],
    "3": [2, 5],
    "4": [1, 7],
    "5": [3, 7],
    "6": [8, 5],
    "7": [7, 7],
    "8": [9, 7],
    "9": [11, 3],
  },
  edges: [
    ["0", "1"],
    ["0", "3"],
    ["0", "9"],
    ["1", "2"],
    ["1", "3"],
    ["3", "4"],
    ["5", "3"],
    ["6", "0"],
    ["6", "3"],
    ["6", "7"],
    ["8", "6"],
    ["9", "6"],
  ],
});

/** Obr. 5.4 graf zbytků pro k = 7: x → (10x + b) mod 7 s cenou b. */
const RESIDUES = book({
  id: "residues",
  label: "Obr. 5.4 Graf zbytků (k = 7)",
  page: 109,
  directed: true,
  weighted: true,
  // body v pt z PDF (šířka 2 × výška)
  grid: {
    "0": [0, 1],
    "1": [1, 0],
    "2": [1, 2],
    "3": [1.3, 1],
    "4": [4, 0],
    "5": [3.504, 1],
    "6": [4, 2],
  },
  edges: [
    ["0", "0", 0],
    ["0", "1", 1],
    ["1", "3", 0],
    ["1", "4", 1],
    ["2", "6", 0],
    ["2", "0", 1],
    ["3", "2", 0],
    ["3", "3", 1],
    ["4", "5", 0],
    ["4", "6", 1],
    ["5", "1", 0],
    ["5", "2", 1],
    ["6", "4", 0],
    ["6", "5", 1],
  ],
  bends: {
    "0>0": 180,
    "3>3": 0,
    "0>1": -0.35,
    "2>0": -0.35,
    "4>6": -0.5,
    "6>4": 1.4,
  },
  note: "Cena hrany je připsaná číslice (v knize tenká čára = 0, tučná = 1). Cestu z 1 do 0 najde BFS z vrcholu 1.",
});

const BRIDGES = book({
  id: "bridges",
  label: "Obr. 5.10 Mosty a artikulace",
  page: 123,
  directed: false,
  weighted: false,
  // normované souřadnice × poměr stran 2,731
  grid: {
    a: [0, 0.212],
    b: [0, 0.788],
    c: [0.5, 0.5],
    d: [1.076, 0.5],
    e: [1.3655, 0],
    f: [1.942, 0],
    g: [2.231, 0.5],
    h: [1.942, 1],
    i: [1.3655, 1],
    j: [2.731, 0.212],
    k: [2.731, 0.788],
  },
  edges: [
    ["a", "b"],
    ["a", "c"],
    ["b", "c"],
    ["c", "d"],
    ["d", "e"],
    ["e", "f"],
    ["f", "g"],
    ["g", "h"],
    ["h", "i"],
    ["i", "d"],
    ["g", "j"],
    ["g", "k"],
  ],
  note: "Kniha vrcholy nepojmenovává – popisky a–k jsou doplněné. Mosty jsou c–d, g–j a g–k, artikulace c, d a g.",
});

const SCC = book({
  id: "scc",
  label: "Obr. 5.13 Silně souvislé komponenty",
  page: 131,
  directed: true,
  weighted: false,
  // normované souřadnice × poměr stran 0,867
  grid: {
    a: [0, 0.25],
    b: [0, 0.75],
    c: [0.4335, 1],
    d: [0.4335, 0],
    e: [0.867, 0.25],
    f: [0.867, 0.75],
  },
  edges: [
    ["a", "b"],
    ["b", "a"],
    ["a", "c"],
    ["a", "d"],
    ["a", "f"],
    ["c", "f"],
    ["d", "f"],
    ["e", "d"],
    ["f", "e"],
  ],
  bends: { "a>b": 0.35, "b>a": 0.35, "a>c": -0.3 },
  note: "Kniha vrcholy nepojmenovává – popisky a–f jsou doplněné. Komponenty: {a, b}, {c}, {d, e, f}.",
});

const CONDENSATION = book({
  id: "condensation",
  label: "Obr. 5.13 Graf komponent (DAG)",
  page: 131,
  directed: true,
  weighted: false,
  // středy kružnic v pt z PDF
  grid: {
    "C₁": [338.8, 409.66],
    "C₂": [366.13, 442.23],
    "C₃": [382.23, 373.21],
  },
  edges: [
    ["C₁", "C₂"],
    ["C₁", "C₃"],
    ["C₂", "C₃"],
  ],
  note: "Graf komponent je vždy acyklický – jediný DAG nakreslený v kapitole 5.",
});

const MST4 = book({
  id: "mst4",
  label: "Obr. 7.1 Mřížka 4 × 4 (dvě minimální kostry)",
  page: 168,
  directed: false,
  weighted: true,
  grid: rowsGrid(["ABCD", "EFGH", "IJKL", "MNOP"]),
  edges: [
    ["A", "B", 2],
    ["B", "C", 2],
    ["C", "D", 1],
    ["A", "E", 4],
    ["B", "F", 2],
    ["C", "G", 1],
    ["D", "H", 7],
    ["E", "F", 2],
    ["F", "G", 1],
    ["G", "H", 3],
    ["E", "I", 0],
    ["F", "J", 4],
    ["G", "K", 2],
    ["H", "L", 8],
    ["I", "J", 0],
    ["J", "K", 2],
    ["K", "L", 1],
    ["I", "M", 6],
    ["J", "N", 7],
    ["K", "O", 5],
    ["L", "P", 9],
    ["M", "N", 1],
    ["N", "O", 7],
    ["O", "P", 4],
  ],
  note: "Váhy nejsou unikátní – kniha ukazuje dvě různé minimální kostry o ceně 31. Popisky A–P (po řádcích) jsou doplněné.",
});

const MST3 = book({
  id: "mst3",
  label: "Obr. 7.2 Mřížka 3 × 3 (Jarník, Borůvka, Kruskal)",
  page: 169,
  start: "E", // kniha začíná Jarníka ve středu mřížky
  directed: false,
  weighted: true,
  grid: rowsGrid(["ABC", "DEF", "GHI"]),
  edges: [
    ["A", "B", 10],
    ["B", "C", 6],
    ["A", "D", 7],
    ["B", "E", 8],
    ["C", "F", 2],
    ["D", "E", 5],
    ["E", "F", 4],
    ["D", "G", 0],
    ["E", "H", 3],
    ["F", "I", 9],
    ["G", "H", 1],
    ["H", "I", 11],
  ],
  note: "Týž graf je na obr. 7.5 (Borůvka, s. 173) a 7.6 (Kruskal, s. 175); kniha začíná Jarníka ve středu E. Popisky A–I (po řádcích) jsou doplněné.",
});

/**
 * Všechny předvolby. Pořadí prvních šesti je historické (indexy používají testy a dřívější odkazy
 * se na ně neodvolávají – odkaz nese text hran).
 */
export const PRESETS: GraphPreset[] = [
  PIG,
  text(
    "undirected10",
    "Neorientovaný graf (10 vrcholů)",
    false,
    false,
    "1 2\n1 3\n2 4\n3 4\n3 5\n4 6\n5 6\n5 7\n6 8\n7 8\n7 9\n8 10\n9 10\n2 5",
  ),
  text(
    "weighted",
    "Ohodnocený graf pro Dijkstru / kostry",
    false,
    true,
    "A B 4\nA C 2\nB C 5\nB D 10\nC E 3\nE D 4\nD F 11\nE F 8\nB E 7\nF G 3\nE G 9",
  ),
  text(
    "dag",
    "DAG (plánování činností)",
    true,
    false,
    "vstát sprcha\nvstát káva\nsprcha obléct\nkáva snídaně\nobléct odejít\nsnídaně odejít\nvstát zprávy\nzprávy odejít",
  ),
  text(
    "cycle",
    "Orientovaný graf s cyklem",
    true,
    false,
    "a b\nb c\nc a\nc d\nd e\ne f\nf d\nb e",
  ),
  text(
    "grid34",
    "Mřížka 3×4",
    false,
    false,
    "1 2\n2 3\n3 4\n5 6\n6 7\n7 8\n9 10\n10 11\n11 12\n1 5\n5 9\n2 6\n6 10\n3 7\n7 11\n4 8\n8 12",
  ),
  RESIDUES,
  BRIDGES,
  SCC,
  CONDENSATION,
  MST4,
  MST3,
  // fáze 4: předvolby nových algoritmů ze souborů stop (jen připojené na konec – indexy výše se nemění)
  ...bellmanFordPresets,
  ...boruvkaPresets,
  ...bridgesPresets,
  ...sccPresets,
];

export const presetById = (id: string): GraphPreset | undefined =>
  PRESETS.find((p) => p.id === id);

/** Zdroj knižní předvolby pro popisek pod obrázkem. */
export const sourceText = (p: BookPreset) =>
  `Průvodce labyrintem algoritmů, s. ${p.page}`;

/** Graf předvolby: knižní přesně podle obrázku (bez silového rozložení), ostatní silově rozložený. */
export function presetGraph(p: GraphPreset): Graph {
  const g = parseGraphInput(p.text, p.directed, p.weighted, {
    layout: false,
  }).graph;
  if (!isBookPreset(p)) {
    layoutGraph(g);
    return g;
  }
  const pos = new Map(p.nodes.map((n) => [n.label, n]));
  for (const n of g.nodes) {
    const q = pos.get(n.label);
    if (q) {
      n.x = q.x;
      n.y = q.y;
    }
  }
  // text vzniká z hran ve stejném pořadí, takže i-tá hrana grafu = i-tá hrana předvolby
  g.edges.forEach((e, i) => {
    const bend = p.edges[i]?.bend;
    if (bend !== undefined) e.bend = bend;
  });
  g.aspect = p.aspect;
  return g;
}

/* ------------------------------------------------------------------ souřadnice po úpravě */

/**
 * Rozmístí graf (mutuje a vrací `g`). Má-li předloha `ref` pevné souřadnice (`aspect`, typicky knižní
 * předvolba nebo už upravený knižní graf), vrcholy se stejným jménem si je nechají, hrany mezi nimi i ohnutí
 * a nové vrcholy se rozmístí silově kolem nich. Jinak (bez předlohy nebo bez společného vrcholu) obyčejné
 * silové rozložení jako dřív.
 */
export function placeGraph(g: Graph, ref: Graph | null | undefined): Graph {
  const byLabel = new Map(
    (ref?.aspect ? ref.nodes : []).map((n) => [n.label, n]),
  );
  const pinned = new Set(
    g.nodes.filter((n) => byLabel.has(n.label)).map((n) => n.id),
  );
  if (!ref?.aspect || pinned.size === 0) {
    delete g.aspect;
    for (const e of g.edges) delete e.bend;
    layoutGraph(g);
    return g;
  }
  for (const n of g.nodes) {
    const q = byLabel.get(n.label);
    if (q) {
      n.x = q.x;
      n.y = q.y;
    }
  }
  g.aspect = ref.aspect;
  copyBends(g, ref);
  layoutFree(g, pinned, ref.aspect);
  return g;
}

/** Ohnutí hran z předlohy pro hrany mezi stejně pojmenovanými vrcholy (k-tá hrana u→v ↔ k-tá hrana u→v). */
function copyBends(g: Graph, ref: Graph) {
  const key = (gr: Graph, u: number, v: number) =>
    `${gr.nodes[u].label}\u0000${gr.nodes[v].label}`;
  const bends = new Map<string, (number | undefined)[]>();
  for (const e of ref.edges) {
    const k = key(ref, e.u, e.v);
    bends.set(k, [...(bends.get(k) ?? []), e.bend]);
  }
  const seen = new Map<string, number>();
  for (const e of g.edges) {
    const k = key(g, e.u, e.v);
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    let b = bends.get(k)?.[i];
    // neorientovaně zapsaná obráceně: ohnutí na opačnou stranu (smyčka je stejná)
    if (b === undefined && !g.directed && e.u !== e.v) {
      const r = bends.get(key(g, e.v, e.u))?.[i];
      if (r !== undefined) b = -r;
    }
    if (b === undefined) delete e.bend;
    else e.bend = b;
  }
}

/**
 * Silové rozložení jen volných vrcholů (připnuté stojí). Počítá se ve skutečném poměru stran, nové vrcholy
 * začínají u svých připnutých sousedů a zůstanou v obdélníku kresby.
 */
function layoutFree(g: Graph, pinned: ReadonlySet<number>, aspect: number) {
  const n = g.nodes.length;
  const free = g.nodes.filter((nd) => !pinned.has(nd.id)).map((nd) => nd.id);
  if (!free.length) return;
  const r = rng(7);
  const x = g.nodes.map((nd) => nd.x * aspect);
  const y = g.nodes.map((nd) => nd.y);
  const adj: number[][] = g.nodes.map(() => []);
  for (const e of g.edges) {
    if (e.u === e.v) continue;
    adj[e.u].push(e.v);
    adj[e.v].push(e.u);
  }
  free.forEach((v, i) => {
    const anchors = adj[v].filter((w) => pinned.has(w));
    if (anchors.length) {
      x[v] = anchors.reduce((s, w) => s + x[w], 0) / anchors.length;
      y[v] = anchors.reduce((s, w) => s + y[w], 0) / anchors.length;
    } else {
      const a = (2 * Math.PI * i) / free.length;
      x[v] = aspect / 2 + 0.4 * aspect * Math.cos(a);
      y[v] = 0.5 + 0.4 * Math.sin(a);
    }
    x[v] += (r() - 0.5) * 0.2;
    y[v] += (r() - 0.5) * 0.2;
  });
  const k = (0.9 * Math.sqrt(aspect)) / Math.sqrt(n);
  let temp = 0.15;
  for (let it = 0; it < 250; it++) {
    for (const v of free) {
      let fx = 0;
      let fy = 0;
      for (let w = 0; w < n; w++) {
        if (w === v) continue;
        let dx = x[v] - x[w];
        let dy = y[v] - y[w];
        let d = Math.hypot(dx, dy);
        if (d < 1e-4) {
          dx = r() - 0.5;
          dy = r() - 0.5;
          d = Math.hypot(dx, dy) || 1e-4;
        }
        const f = (k * k) / d / d;
        fx += dx * f;
        fy += dy * f;
      }
      for (const w of adj[v]) {
        const dx = x[v] - x[w];
        const dy = y[v] - y[w];
        const d = Math.hypot(dx, dy) || 1e-4;
        fx -= (dx * d) / k;
        fy -= (dy * d) / k;
      }
      const d = Math.hypot(fx, fy) || 1;
      const s = Math.min(d, temp) / d;
      x[v] = Math.max(0, Math.min(aspect, x[v] + fx * s));
      y[v] = Math.max(0, Math.min(1, y[v] + fy * s));
    }
    temp *= 0.985;
  }
  for (const v of free) {
    g.nodes[v].x = x[v] / aspect;
    g.nodes[v].y = y[v];
  }
}
