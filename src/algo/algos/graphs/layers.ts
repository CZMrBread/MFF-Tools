/**
 * Kresba „vrstvy BFS“ podle obr. 5.8 Průvodce: vrstva V_k = sloupec, ve sloupci shora dolů v pořadí objevení,
 * vrchol bez sourozenců leží v řádku svého rodiče. Zpětné hrany přes víc vrstev (6→0) jsou oblouky pod celou
 * kresbou, ostatní dlouhé hrany (i uvnitř vrstvy a k nedosažitelným) mírné oblouky. Testy v book.test.ts.
 */
import { neighbors, type Graph } from "./graph";

export interface NodeGroup {
  /** popisek nad skupinou („V₀“) */
  label: string;
  /** id vrcholů skupiny v pořadí shora dolů */
  nodes: number[];
  /** obtažení přes celou výšku kresby (sloupce vrstev jako v knize), jinak jen kolem vlastních vrcholů */
  fullHeight?: boolean;
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const subscript = (k: number) =>
  String(k)
    .split("")
    .map((d) => SUB[Number(d)])
    .join("");

/** rozestup sloupců / rozestup řádků (v knize 2 : 1) */
const COL_GAP = 2;
/** největší ohnutí oblouku; delší hrany se ohnou méně, aby oblouk vybočil nejvýš o půl řádku */
const BEND = 0.35;

/**
 * Vrstvy BFS z `start` jako nový graf (původní se nemění) a skupiny pro obtažení. Nedosažitelné vrcholy
 * tvoří poslední skupinu „nedosažitelné“ ve vlastním sloupci vpravo.
 */
export function bfsLayers(
  g: Graph,
  start: number,
): { graph: Graph; groups: NodeGroup[] } {
  const dist = new Map<number, number>();
  const parent = new Map<number, number>();
  const order: number[] = [];
  if (g.nodes[start]) {
    dist.set(start, 0);
    order.push(start);
    for (let i = 0; i < order.length; i++) {
      const v = order[i];
      for (const { v: w } of neighbors(g, v)) {
        if (dist.has(w)) continue;
        dist.set(w, dist.get(v)! + 1);
        parent.set(w, v);
        order.push(w);
      }
    }
  }
  const layers: number[][] = [];
  for (const v of order) (layers[dist.get(v)!] ??= []).push(v);
  const groups: NodeGroup[] = layers.map((nodes, k) => ({
    label: `V${subscript(k)}`,
    nodes,
    fullHeight: true,
  }));
  const unreached = g.nodes.filter((n) => !dist.has(n.id)).map((n) => n.id);
  if (unreached.length)
    groups.push({ label: "nedosažitelné", nodes: unreached, fullHeight: true });

  // řádky: plná vrstva 0…R−1; jinak řádek rodiče (kořen uprostřed), bez kolizí a v mezích
  const R = Math.max(1, ...groups.map((gr) => gr.nodes.length));
  const row = new Map<number, number>();
  for (const gr of groups) {
    const k = gr.nodes.length;
    const want = gr.nodes.map((v) => {
      if (k === R) return -1;
      const p = parent.get(v);
      return p !== undefined ? (row.get(p) ?? 0) : (R - 1) / 2;
    });
    const rows: number[] = [];
    gr.nodes.forEach((_, i) => {
      if (k === R) rows.push(i);
      else rows.push(Math.max(want[i], i ? rows[i - 1] + 1 : 0));
    });
    for (let i = k - 1; i >= 0; i--)
      rows[i] = Math.min(rows[i], i === k - 1 ? R - 1 : rows[i + 1] - 1);
    gr.nodes.forEach((v, i) => row.set(v, rows[i]));
  }

  const cols = groups.length;
  const col = new Map<number, number>();
  groups.forEach((gr, c) => gr.nodes.forEach((v) => col.set(v, c)));
  const nodes = g.nodes.map((n) => ({
    ...n,
    x: cols > 1 ? col.get(n.id)! / (cols - 1) : 0.5,
    y: R > 1 ? row.get(n.id)! / (R - 1) : 0.5,
  }));
  const aspect = (COL_GAP * Math.max(1, cols - 1)) / Math.max(1, R - 1);
  const rowGap = R > 1 ? 1 / (R - 1) : 0.5;
  const edges = g.edges.map((e) => {
    const plain = { id: e.id, u: e.u, v: e.v, w: e.w };
    if (e.u === e.v)
      return e.bend === undefined ? plain : { ...plain, bend: e.bend };
    const dc = col.get(e.v)! - col.get(e.u)!;
    const dr = row.get(e.v)! - row.get(e.u)!;
    const straight = Math.abs(dc) === 1 || (dc === 0 && Math.abs(dr) === 1);
    if (straight) return plain;
    // normála „doprava ve směru jízdy“ je (−dy, dx): oblouk dolů (+y) = znaménko dx; svislá hrana ve
    // sloupci se ohne doprava (+x) = znaménko −dy
    const a = nodes[e.u];
    const b = nodes[e.v];
    // zpětná hrana přes víc vrstev (obr. 5.8: 6→0) vede obloukem pod celou kresbou: vrchol oblouku
    // (y = střed + dx·aspect·bend/2, viz drawingExtent) půl řádku pod spodní řadou
    if (Math.abs(dc) >= 2 && dist.has(e.u) && dist.has(e.v)) {
      const below = 1 + rowGap / 2;
      return {
        ...plain,
        bend: (2 * (below - (a.y + b.y) / 2)) / ((b.x - a.x) * aspect),
      };
    }
    const len = Math.hypot((b.x - a.x) * aspect, b.y - a.y);
    // vybočení oblouku = |bend| / 2 × délka ≤ půl řádku
    const size = Math.min(BEND, len > 0 ? rowGap / len : BEND);
    const bend = dc !== 0 ? Math.sign(dc) * size : -Math.sign(dr) * size;
    return { ...plain, bend };
  });
  return { graph: { ...g, nodes, edges, aspect }, groups };
}
