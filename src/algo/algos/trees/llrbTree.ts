/**
 * Červeno-černý strom LLRB – reprezentace a čtení stromu bez kroků (testy v llrb.test.ts): typy, zápis do
 * odkazu, axiomy, překlad na (2,4)-strom (ostrůvky, obr. 8.11) a rozložení kresby. Odděleno od generátorů
 * kroků v llrb.ts, aby náhled na úvodní stránce (llrb.preview.tsx) nenesl do hlavního chunku celé operace.
 * Barva hrany je uložená v jejím spodním vrcholu (`red`), vnější vrcholy ∅ (null) jsou černé a barva kořene
 * nemá význam (kresba ji neukazuje).
 */
import type { MEdge, MNode, TEdge, TNode } from "../../views/treeLayout";
import { fmtKey } from "./bst";

export type LlrbVariant = "23" | "24";

export interface LNode {
  id: number;
  key: number;
  left: number | null;
  right: number | null;
  /** hrana z otce do tohoto vrcholu je červená */
  red: boolean;
}

export interface LlrbState {
  nodes: Record<number, LNode>;
  root: number | null;
  /** třídy vrcholů v kroku (n-active, n-new, n-flip…) */
  marks: Record<number, string>;
  /** třídy hran „otec-syn“ v kroku (e-active, e-rotate) */
  edgeMarks: Record<string, string>;
  vars: Record<string, string | number>;
  nextId: number;
  variant: LlrbVariant;
}

export const emptyLlrb = (variant: LlrbVariant = "23"): LlrbState => ({
  nodes: {},
  root: null,
  marks: {},
  edgeMarks: {},
  vars: {},
  nextId: 1,
  variant,
});

export const isRed = (st: LlrbState, id: number | null) =>
  id !== null && st.nodes[id].red;
const k = (st: LlrbState, id: number) => fmtKey(st.nodes[id].key);

/* ================================================================== čtení stromu */

/** Klíče v symetrickém pořadí. */
export function llrbKeys(st: LlrbState): number[] {
  const out: number[] = [];
  const walk = (id: number | null) => {
    if (id === null) return;
    walk(st.nodes[id].left);
    out.push(st.nodes[id].key);
    walk(st.nodes[id].right);
  };
  walk(st.root);
  return out;
}

export const llrbSize = (st: LlrbState) => Object.keys(st.nodes).length;

/** Vrcholy po hladinách (kořen, pak zleva doprava). */
function levelOrder(st: LlrbState): number[] {
  const q: number[] = st.root === null ? [] : [st.root];
  for (let i = 0; i < q.length; i++) {
    const n = st.nodes[q[i]];
    if (n.left !== null) q.push(n.left);
    if (n.right !== null) q.push(n.right);
  }
  return q;
}

/** Klíče po hladinách – vložením v tomto pořadí do obyčejného BVS vznikne přesně tento tvar. */
export const llrbLevelKeys = (st: LlrbState) =>
  levelOrder(st).map((id) => st.nodes[id].key);

/**
 * Zápis stromu do odkazu (`t=`): klíče po hladinách, „r“ = červená hrana shora – „4,1r,6r,0,3,…“.
 * Kořen je vždy černý.
 */
export function llrbSpec(st: LlrbState): string {
  return levelOrder(st)
    .map(
      (id) =>
        String(st.nodes[id].key) +
        (id !== st.root && st.nodes[id].red ? "r" : ""),
    )
    .join(",");
}

/**
 * Strom ze zápisu llrbSpec: klíče se vloží do obyčejného BVS v daném pořadí a dostanou barvy ze zápisu.
 * Neplatný token, opakovaný klíč nebo prázdný zápis → null. Axiomy LLRB nekontroluje (llrbProblems).
 */
export function llrbFromSpec(
  spec: string,
  variant: LlrbVariant,
  limit = Infinity,
): LlrbState | null {
  const tokens = spec.split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length || tokens.length > limit) return null;
  const st = emptyLlrb(variant);
  for (const t of tokens) {
    const m = /^([+-−]?\d+)(r?)$/i.exec(t);
    if (!m) return null;
    const key = Number(m[1].replace("−", "-")) + 0;
    if (!Number.isSafeInteger(key)) return null;
    const id = st.nextId++;
    const node: LNode = {
      id,
      key,
      left: null,
      right: null,
      red: m[2] !== "",
    };
    let p: number | null = null;
    let v = st.root;
    while (v !== null) {
      if (st.nodes[v].key === key) return null;
      p = v;
      v = key < st.nodes[v].key ? st.nodes[v].left : st.nodes[v].right;
    }
    st.nodes[id] = node;
    if (p === null) st.root = id;
    else if (key < st.nodes[p].key) st.nodes[p].left = id;
    else st.nodes[p].right = id;
  }
  if (st.root !== null) st.nodes[st.root].red = false;
  return st;
}

/** Tvar pro testy a hlášky: „4(1r(0,3),6r)“; list je jen klíč, chybějící syn „-“. */
export function llrbShape(st: LlrbState): string {
  const walk = (id: number | null): string => {
    if (id === null) return "-";
    const n = st.nodes[id];
    const me = fmtKey(n.key) + (id !== st.root && n.red ? "r" : "");
    if (n.left === null && n.right === null) return me;
    return `${me}(${walk(n.left)},${walk(n.right)})`;
  };
  return st.root === null ? "∅" : walk(st.root);
}

/** Počet černých hran z kořene do listu (vnější hrany se počítají); −1 = cesty se liší. */
export function blackHeight(st: LlrbState): number {
  const walk = (id: number | null): number => {
    if (id === null) return 1;
    const n = st.nodes[id];
    const a = walk(n.left);
    const b = walk(n.right);
    if (a < 0 || b < 0 || a !== b) return -1;
    return a + (id !== st.root && !n.red ? 1 : 0);
  };
  return st.root === null ? 0 : walk(st.root);
}

/** Hloubka = počet hran na nejdelší cestě z kořene (prázdný strom −1). */
export function llrbDepth(st: LlrbState): number {
  const walk = (id: number | null): number =>
    id === null
      ? -1
      : 1 + Math.max(walk(st.nodes[id].left), walk(st.nodes[id].right));
  return walk(st.root);
}

/**
 * Porušení axiomů LLRB stromu (str. 206) – prázdné pole = platný strom. Varianta (2,3) navíc nepřipouští
 * 4-vrcholy (pravou červenou hranu vůbec, str. 211).
 */
export function llrbProblems(st: LlrbState): string[] {
  const out: string[] = [];
  for (const id of levelOrder(st)) {
    const n = st.nodes[id];
    const meRed = id !== st.root && n.red;
    const l = isRed(st, n.left);
    const r = isRed(st, n.right);
    if (meRed && (l || r))
      out.push(
        `Axiom 1: pod červenou hranou do ${k(st, id)} vede další červená hrana.`,
      );
    if (r && !l)
      out.push(
        `Axiom 2: z vrcholu ${k(st, id)} vede jediná červená hrana a ta vede doprava.`,
      );
    else if (r && l && st.variant === "23")
      out.push(
        `Varianta (2,3): vrchol ${k(st, id)} má dvě červené hrany (4-vrchol).`,
      );
  }
  if (blackHeight(st) < 0)
    out.push("Axiom 4: cesty z kořene do listů mají různý počet černých hran.");
  return out;
}

/* ------------------------------------------------------------------ ostrůvky = (2,4)-strom (obr. 8.11) */

export interface Island {
  /** id horního (černého) vrcholu ostrůvku */
  id: number;
  /** id vrcholů ostrůvku v symetrickém pořadí */
  members: number[];
  keys: number[];
  /** ostrůvky pod ním zleva doprava (id jejich horních vrcholů) */
  children: number[];
  /** počet černých hran od kořene */
  depth: number;
}

/**
 * Překlad na (2,4)-strom (str. 206, obr. 8.11): vrcholy spojené červenými hranami tvoří jeden vrchol
 * (a,b)-stromu, černé hrany vedou mezi nimi.
 */
export function islands(st: LlrbState): Island[] {
  const out: Island[] = [];
  const visit = (top: number, depth: number) => {
    const members: number[] = [];
    const children: number[] = [];
    const walk = (id: number | null) => {
      if (id === null) return;
      const n = st.nodes[id];
      const inside = id === top || n.red;
      if (!inside) {
        children.push(id);
        return;
      }
      walk(n.left);
      members.push(id);
      walk(n.right);
    };
    walk(top);
    out.push({
      id: top,
      members,
      keys: members.map((m) => st.nodes[m].key),
      children,
      depth,
    });
    for (const c of children) visit(c, depth + 1);
  };
  if (st.root !== null) visit(st.root, 0);
  return out;
}

/** Pořadí vrcholů v symetrickém průchodu (pro x kresby). */
function inorderIndex(st: LlrbState): Map<number, number> {
  const m = new Map<number, number>();
  const walk = (id: number | null) => {
    if (id === null) return;
    walk(st.nodes[id].left);
    m.set(id, m.size);
    walk(st.nodes[id].right);
  };
  walk(st.root);
  return m;
}

const pos = (i: number, total: number) => (total <= 1 ? 0.5 : i / (total - 1));

/** Kresba (2,4)-stromu z ostrůvků: x = průměr poloh jeho klíčů v kresbě LLRB, y = černá hloubka. */
export function islandsLayout(st: LlrbState): {
  nodes: MNode[];
  edges: MEdge[];
} {
  const idx = inorderIndex(st);
  const total = idx.size;
  const nodes: MNode[] = [];
  const edges: MEdge[] = [];
  for (const isl of islands(st)) {
    const xs = isl.members.map((m) => pos(idx.get(m)!, total));
    const cls = isl.members
      .map((m) => st.marks[m])
      .filter((c): c is string => !!c)
      .map((c) => c.split(" ")[0]);
    const bad = isl.keys.length > 3;
    nodes.push({
      id: isl.id,
      keys: isl.keys.map(fmtKey),
      x: (xs[0] + xs[xs.length - 1]) / 2,
      y: isl.depth,
      cls: bad ? "n-bad" : (cls[0] ?? undefined),
    });
    for (const c of isl.children) edges.push({ from: isl.id, to: c });
  }
  return { nodes, edges };
}

/* ------------------------------------------------------------------ kresba LLRB */

/**
 * Rozložení pro TreeView: x podle symetrického pořadí, y = hloubka. Vrchol s červenou hranou shora má
 * třídu n-red, hrana e-red (kořen nikdy – jeho barva nemá význam). Značky kroku se přidají za barvu.
 */
export function llrbLayout(st: LlrbState): { nodes: TNode[]; edges: TEdge[] } {
  const idx = inorderIndex(st);
  const total = idx.size;
  const depth = new Map<number, number>();
  const nodes: TNode[] = [];
  const edges: TEdge[] = [];
  const walk = (id: number | null, d: number) => {
    if (id === null) return;
    depth.set(id, d);
    const n = st.nodes[id];
    walk(n.left, d + 1);
    walk(n.right, d + 1);
  };
  walk(st.root, 0);
  for (const [id, i] of idx) {
    const n = st.nodes[id];
    const red = id !== st.root && n.red;
    const cls = [red ? "n-red" : "", st.marks[id] ?? ""]
      .filter(Boolean)
      .join(" ");
    nodes.push({
      id,
      label: fmtKey(n.key),
      x: pos(i, total),
      y: depth.get(id)!,
      cls: cls || undefined,
      aria: `Vrchol ${fmtKey(n.key)}${red ? " (červená hrana shora)" : id === st.root ? " (kořen)" : ""}`,
    });
    for (const c of [n.left, n.right])
      if (c !== null) {
        const ecls = [
          st.nodes[c].red ? "e-red" : "",
          st.edgeMarks[id + "-" + c] ?? "",
        ]
          .filter(Boolean)
          .join(" ");
        edges.push({ from: id, to: c, cls: ecls || undefined });
      }
  }
  return { nodes, edges };
}
