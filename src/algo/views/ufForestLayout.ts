/**
 * Rozvržení lesa keříků Union-Find (Kruskal, Průvodce 7.4) – čistá funkce bez Reactu (testy
 * v ufForestLayout.test.ts, kresba v UnionFindView.tsx).
 *
 * Každý keřík: kořen nahoře, synové o hladinu níž v pořadí podle id, otec nad středem svých synů (listy
 * dostávají sloupce zleva doprava). Keříky leží vedle sebe v pořadí id kořenů; když by řada přesáhla
 * `maxCols` sloupců, další keřík začne nový řádek (keřík širší než maxCols má řádek sám pro sebe).
 */
import { plural } from "../algos/graphs/graph";

/** poloměr kroužku vrcholu */
export const UF_R = 11;
/** šířka sloupce (jeden list) */
export const UF_SLOT = 27;
/** svislý rozestup hladin */
export const UF_LEVEL = 34;
/** okraj kresby vlevo a vpravo */
export const UF_PAD = 6;
/** místo nad kořenem na popisek „H = …“ */
export const UF_TOP = 15;
/**
 * výchozí nejvyšší počet sloupců (listů) v řadě: 9 samostatných vrcholů obr. 7.2 v jedné řadě a kresba
 * (≤ 255 px) se vejde do panelu výsledku vedle grafu i při 1280 × 720
 */
export const UF_MAX_COLS = 9;
/** mezera mezi řádky keříků */
const ROW_GAP = 6;

export interface UfLayoutNode {
  id: number;
  x: number;
  y: number;
  /** hladina v keříku (kořen = 0) */
  level: number;
  root: boolean;
}

export interface UfLayout {
  nodes: UfLayoutNode[];
  /** šipka P: syn → otec */
  edges: { child: number; parent: number }[];
  w: number;
  h: number;
}

/** Keříky jako stromy: kořeny (podle id) a synové každého vrcholu (podle id). Cyklus otců → vrcholy jsou kořeny. */
function forest(parent: readonly (number | null)[]) {
  const n = parent.length;
  const valid = (p: number | null): p is number =>
    p !== null && Number.isInteger(p) && p >= 0 && p < n;
  // vrchol patří do keříku, jen když z něj cesta po otcích dojde do kořene (bez cyklu)
  const reaches = parent.map((_, v) => {
    const seen = new Set<number>();
    let x = v;
    while (valid(parent[x])) {
      if (seen.has(x)) return false;
      seen.add(x);
      x = parent[x]!;
    }
    return true;
  });
  const isRoot = (v: number) => !reaches[v] || !valid(parent[v]);
  const children: number[][] = parent.map(() => []);
  parent.forEach((p, v) => {
    if (!isRoot(v)) children[p!].push(v);
  });
  const roots = parent.map((_, v) => v).filter(isRoot);
  return { roots, children, isRoot };
}

export function ufForestLayout(
  parent: readonly (number | null)[],
  maxCols = UF_MAX_COLS,
): UfLayout {
  const { roots, children } = forest(parent);
  /** keřík v jednotkách: x ve sloupcích od 0, hladina */
  const trees = roots.map((r) => {
    const pos: { id: number; x: number; level: number }[] = [];
    let next = 0;
    let depth = 0;
    const place = (v: number, level: number): number => {
      depth = Math.max(depth, level);
      const cs = children[v];
      let x: number;
      if (cs.length === 0) x = next++;
      else {
        const xs = cs.map((c) => place(c, level + 1));
        x = (xs[0] + xs[xs.length - 1]) / 2;
      }
      pos.push({ id: v, x, level });
      return x;
    };
    place(r, 0);
    return { root: r, pos, width: next, depth };
  });

  const nodes: UfLayoutNode[] = [];
  let top = 0;
  let maxUsed = 0;
  let i = 0;
  while (i < trees.length) {
    // řádek: keříky, dokud se vejdou do maxCols sloupců (aspoň jeden)
    const row = [trees[i++]];
    let used = row[0].width;
    while (i < trees.length && used + trees[i].width <= maxCols) {
      used += trees[i].width;
      row.push(trees[i++]);
    }
    maxUsed = Math.max(maxUsed, used);
    let col = 0;
    for (const t of row) {
      for (const p of t.pos)
        nodes.push({
          id: p.id,
          x: UF_PAD + (col + p.x) * UF_SLOT + UF_SLOT / 2,
          y: top + UF_TOP + UF_R + p.level * UF_LEVEL,
          level: p.level,
          root: p.id === t.root,
        });
      col += t.width;
    }
    const depth = Math.max(...row.map((t) => t.depth));
    top += UF_TOP + 2 * UF_R + depth * UF_LEVEL + ROW_GAP;
  }
  nodes.sort((a, b) => a.id - b.id);
  const edges = nodes
    .filter((nd) => !nd.root)
    .map((nd) => ({ child: nd.id, parent: parent[nd.id]! }));
  return {
    nodes,
    edges,
    w: 2 * UF_PAD + maxUsed * UF_SLOT,
    h: Math.max(0, top - ROW_GAP + 2),
  };
}

/**
 * Popis lesu pro čtečku (aria-label kresby): „Union-Find, 2 keříky: keřík a, H = 2: P(b) = a, …; keřík e, H = 0.“
 * Otcové jsou vypsaní po hladinách keříku (shora dolů), v hladině podle id.
 */
export function ufForestLabel(
  parent: readonly (number | null)[],
  depth: readonly number[],
  labels: readonly string[],
): string {
  const { roots, children } = forest(parent);
  const name = (v: number) => labels[v] ?? String(v);
  const parts = roots.map((r) => {
    const links: string[] = [];
    let level = [r];
    while (level.length) {
      const nextLevel: number[] = [];
      for (const v of level)
        for (const c of children[v]) {
          links.push(`P(${name(c)}) = ${name(v)}`);
          nextLevel.push(c);
        }
      level = nextLevel.sort((a, b) => a - b);
    }
    const head = `keřík ${name(r)}, H = ${depth[r] ?? 0}`;
    return links.length ? `${head}: ${links.join(", ")}` : head;
  });
  return `Union-Find, ${plural(roots.length, "keřík", "keříky", "keříků")}: ${parts.join("; ")}.`;
}
