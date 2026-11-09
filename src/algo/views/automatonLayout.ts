/**
 * Čistá geometrie vyhledávacího automatu (AutomatonView). Pohled kreslí obecné kroužky a hrany
 * (cesta `d` + šipka jako trojúhelník – bez SVG markerů, aby šipka měla barvu své hrany).
 *
 * - `linearAutomaton` – KMP podle obr. 13.1 (str. 321): stavy v řadě, jména nad nimi, písmena
 *   dopředných hran pod nimi; zpětné hrany do stavu > 0 (a 1 → 0) oblouky nad řadou, ostatní do ε
 *   se pod řadou slévají do jedné „sběrnice“ se šipkou do ε.
 * - `curveEdge` – obecná ohnutá hrana mezi dvěma kroužky.
 * - `trieSlots` + `trieAutomaton` – strom Aho-Corasickové podle obr. 13.2 (str. 326): kořen nahoře,
 *   dopředné hrany dolů s písmenem, zpětné hrany a (tečkované) zkratky jako oblouky; jména stavů
 *   vedle kroužku. Knižní předvolba dá vlastní polohy vrcholů a ohyby hran.
 * Testy v automatonLayout.test.ts.
 */

export interface P2 {
  x: number;
  y: number;
}

export interface AutoNode extends P2 {
  id: number;
  /** jméno stavu (prefix jehly, ε) */
  name: string;
  /** vejde se jméno nad kroužek? (jinak jen v popisku `title`) */
  showName: boolean;
  /** místo skrytých jmen „…“ (jako na obr. 13.1) – jednou uprostřed každého úseku skrytých jmen */
  ellipsis?: boolean;
  /** poloha jména (strom); bez ní jméno nad kroužkem na účaří `nameY` rozvržení */
  nameX?: number;
  nameY?: number;
  nameAnchor?: "start" | "end" | "middle";
}

export type AutoEdgeKind = "fwd" | "back" | "short";

export interface AutoEdge {
  /** klíč pro zvýraznění: `${kind}:${from}-${to}` */
  key: string;
  from: number;
  to: number;
  kind: AutoEdgeKind;
  /** kudy hrana vede (lineární automat): oblouk nad řadou / sběrnice pod ní */
  side?: "above" | "below";
  d: string;
  /** šipka: tři body „x,y x,y x,y“ (první = hrot) */
  arrow: string;
  /** písmeno na hraně a jeho poloha */
  label?: string;
  lx?: number;
  ly?: number;
}

export interface AutomatonLayout {
  W: number;
  H: number;
  /** poloměr kroužku */
  r: number;
  /** zvětšení písma a odsazení vůči základní velikosti (strom AC na vysokém plátně); chybí = 1 */
  zoom?: number;
  nodes: AutoNode[];
  edges: AutoEdge[];
  /** účaří jmen stavů (lineární automat) */
  nameY: number;
}

export const edgeKey = (kind: AutoEdgeKind, from: number, to: number) =>
  `${kind}:${from}-${to}`;

const ARROW_LEN = 7;
const ARROW_HALF = 3.6;
const r1 = (v: number) => Math.round(v * 10) / 10;
const pt = (p: P2) => `${r1(p.x)},${r1(p.y)}`;

/** šipka s hrotem v `tip`, směr z `from` */
export function arrowHead(tip: P2, from: P2): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = tip.x - ux * ARROW_LEN;
  const by = tip.y - uy * ARROW_LEN;
  return [
    tip,
    { x: bx - uy * ARROW_HALF, y: by + ux * ARROW_HALF },
    { x: bx + uy * ARROW_HALF, y: by - ux * ARROW_HALF },
  ]
    .map(pt)
    .join(" ");
}

/**
 * Ohnutá hrana z kroužku `a` do kroužku `b` (poloměr r): kvadratická Bézierova křivka, `bend` =
 * vybočení kontrolního bodu kolmo ke spojnici jako podíl délky (kladné doleva od směru a → b).
 */
export function curveEdge(
  a: P2,
  b: P2,
  bend: number,
  r: number,
): { d: string; arrow: string; mid: P2 } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const c = { x: (a.x + b.x) / 2 + dy * bend, y: (a.y + b.y) / 2 - dx * bend };
  const off = (p: P2, toward: P2) => {
    const ex = toward.x - p.x;
    const ey = toward.y - p.y;
    const l = Math.hypot(ex, ey) || 1;
    return { x: p.x + (ex / l) * r, y: p.y + (ey / l) * r };
  };
  const s =
    bend === 0
      ? { x: a.x + (dx / len) * r, y: a.y + (dy / len) * r }
      : off(a, c);
  const e =
    bend === 0
      ? { x: b.x - (dx / len) * r, y: b.y - (dy / len) * r }
      : off(b, c);
  const mid = { x: (s.x + 2 * c.x + e.x) / 4, y: (s.y + 2 * c.y + e.y) / 4 };
  return {
    d: bend === 0 ? `M${pt(s)} L${pt(e)}` : `M${pt(s)} Q${pt(c)} ${pt(e)}`,
    arrow: arrowHead(e, bend === 0 ? s : c),
    mid,
  };
}

const NAME_CHAR = 7.2;
const PAD_X = 16;

/**
 * Lineární automat KMP. `names[s]` = jméno stavu s (0 … J), `letters[s]` = ι[s] na dopředné hraně
 * s → s + 1, `Z[s]` = cíl zpětné hrany (null = nedefinováno / ještě nespočteno – nekreslí se).
 */
export function linearAutomaton(
  names: readonly string[],
  letters: readonly string[],
  Z: readonly (number | null)[],
  width: number,
): AutomatonLayout {
  const n = names.length;
  const r = 11;
  const w = Number.isFinite(width) && width > 0 ? width : 900;
  // jméno posledního stavu je vidět vždy (obr. 13.1: „barbarossa“) – smí přesahovat doprava za kroužek
  const lastW = (names[n - 1]?.length ?? 0) * NAME_CHAR;
  const extra = Math.max(0, Math.ceil(lastW / 2 - r - PAD_X + 2));
  const gap =
    n > 1
      ? Math.max(34, Math.min(110, (w - 2 * PAD_X - 2 * r - extra) / (n - 1)))
      : 0;
  const content = 2 * PAD_X + 2 * r + (n - 1) * gap + extra;
  // SVG vyplní obal (jinak by vedle kresby prosvítalo pozadí obalu), řada stavů uprostřed
  const W = Math.round(Math.max(content, w));
  const left = Math.floor((W - content) / 2);
  const x = (s: number) => left + PAD_X + r + s * gap;
  // výška oblouků podle nejdelší zpětné hrany nad řadou
  const aboveSpan = Z.reduce<number>(
    (m, z, s) =>
      z !== null && z !== undefined && (z > 0 || s === 1)
        ? Math.max(m, s - z)
        : m,
    0,
  );
  const arcH = (span: number) => Math.max(14, Math.min(58, span * gap * 0.3));
  const top = aboveSpan ? arcH(aboveSpan) + 6 : 4;
  const nameY = top + 12;
  const cy = nameY + 8 + r;
  const letterY = cy + r + 13;
  const busY = letterY + 10;
  const hasBus = Z.some((z, s) => z === 0 && s >= 2);
  const H = Math.round((hasBus ? busY + 4 : letterY + 4) + 2);
  const arcStart = nameY - 12;

  const fits = (s: number) => {
    const len = names[s].length * NAME_CHAR;
    if (len > gap - 4) return false;
    // předposlední jméno nesmí narazit do (vždy vypsaného) posledního
    return s !== n - 2 || (len + lastW) / 2 <= gap - 4;
  };
  const nodes: AutoNode[] = names.map((name, s) => ({
    id: s,
    x: x(s),
    y: cy,
    name,
    showName: s === 0 || s === n - 1 || fits(s),
  }));
  for (let s = 0; s < n; s++) {
    if (nodes[s].showName || (s > 0 && !nodes[s - 1].showName)) continue;
    let e = s;
    while (e + 1 < n && !nodes[e + 1].showName) e++;
    nodes[Math.floor((s + e) / 2)].ellipsis = true;
  }

  const edges: AutoEdge[] = [];
  for (let s = 0; s + 1 < n; s++) {
    const a = { x: x(s) + r, y: cy };
    const b = { x: x(s + 1) - r, y: cy };
    edges.push({
      key: edgeKey("fwd", s, s + 1),
      from: s,
      to: s + 1,
      kind: "fwd",
      d: `M${pt(a)} L${pt(b)}`,
      arrow: arrowHead(b, a),
      label: letters[s],
      lx: (x(s) + x(s + 1)) / 2,
      ly: letterY,
    });
  }
  Z.forEach((z, s) => {
    if (z === null || z === undefined || s === 0) return;
    if (z > 0 || s === 1) {
      // oblouk nad řadou (nad jmény stavů) jako na obr. 13.1
      const a = { x: x(s) - (s === 1 ? 4 : 0), y: arcStart };
      const b = { x: x(z) + (s === 1 ? 6 : 4), y: arcStart };
      const c = { x: (a.x + b.x) / 2, y: arcStart - 2 * arcH(s - z) };
      edges.push({
        key: edgeKey("back", s, z),
        from: s,
        to: z,
        kind: "back",
        side: "above",
        d: `M${pt(a)} Q${pt(c)} ${pt(b)}`,
        arrow: arrowHead(b, c),
      });
    } else {
      // do ε „sběrnicí“ pod řadou
      const x0 = x(0);
      const xs = x(s);
      const bend = Math.min(18, gap / 2);
      const tip = { x: x0, y: cy + r + 1 };
      edges.push({
        key: edgeKey("back", s, 0),
        from: s,
        to: 0,
        kind: "back",
        side: "below",
        d:
          `M${pt({ x: xs, y: cy + r })} Q${pt({ x: xs, y: busY })} ${pt({ x: xs - bend, y: busY })}` +
          ` L${pt({ x: x0 + 14, y: busY })} Q${pt({ x: x0, y: busY })} ${pt(tip)}`,
        arrow: arrowHead(tip, { x: x0, y: busY }),
      });
    }
  });
  return { W, H, r, nodes, edges, nameY };
}

/* ------------------------------------------------------------------ strom Aho-Corasickové */

/** Vrchol písmenkového stromu (stačí podmnožina AcNode). */
export interface TrieSpec {
  id: number;
  name: string;
  depth: number;
  parent: number | null;
  ch: string | null;
  /** synové v pořadí kreslení zleva doprava: [písmeno, id] */
  kids: readonly (readonly [string, number])[];
}

/**
 * Automatické rozvržení stromu: listy dostanou po sobě jdoucí sloty (průchod do hloubky, synové
 * zleva doprava), vnitřní vrchol leží uprostřed mezi prvním a posledním synem (jediný syn → přímo
 * nad ním, řetězy jsou svislé jako v knize). `x[id]` ve slotech, `slots` = nejvyšší slot, `depth`
 * = nejhlubší hladina.
 */
export function trieSlots(nodes: readonly TrieSpec[]): {
  x: number[];
  slots: number;
  depth: number;
} {
  const x: number[] = nodes.map(() => 0);
  let next = 0;
  const place = (id: number): number => {
    const kids = nodes[id].kids;
    if (!kids.length) {
      x[id] = next++;
      return x[id];
    }
    const xs = kids.map((k) => place(k[1]));
    x[id] = (xs[0] + xs[xs.length - 1]) / 2;
    return x[id];
  };
  if (nodes.length) place(0);
  return {
    x,
    slots: Math.max(0, next - 1),
    depth: nodes.reduce((m, n) => Math.max(m, n.depth), 0),
  };
}

export interface TrieOptions {
  /** Zpět(s) a Zkratka(s); null = ∅ / ještě nespočteno (nekreslí se) */
  back: readonly (number | null)[];
  short: readonly (number | null)[];
  /** šířka obalu (px); kresba se do ní vystředí */
  width: number;
  /** vzdálenost hladin (px) – pružný rozměr pro přizpůsobení výšce plátna */
  levelH: number;
  /** jména stavů vedle kroužků */
  names: boolean;
  /** knižní předvolba: polohy vrcholů normalizované do [0, 1] (x, y) podle id */
  coords?: readonly (readonly [number, number] | undefined)[];
  /** ruční ohyby hran podle klíče edgeKey (knižní předvolba) */
  bends?: Readonly<Record<string, number>>;
  /** kreslit jen vrcholy id < visible (vkládání slov po krocích) */
  visible?: number;
  /** kreslit zpětné hrany jen z těchto stavů (velký slovník); bez něj všechny */
  backFrom?: readonly number[];
}

const TRIE_R = 10;
/** největší poloměr kroužku stromu (vysoké plátno, velký monitor) */
const TRIE_R_MAX = 16;
const TRIE_PAD = 8;
/** px na slot (automatické rozvržení) a rozpětí knižní předvolby */
const SLOT_MIN = 52;
const SLOT_MAX = 150;
const BOOK_MIN = 230;
const BOOK_MAX = 520;
const TRIE_NAME_CHAR = 6.4;
/** rezerva šířky obalu na oblouky a jména po stranách kresby */
const TRIE_SIDE = 90;

/**
 * Automatický ohyb zpětné hrany / zkratky (curveEdge: kladný = doleva od směru from → to).
 * Do kořene z hladiny 1 oblouk nahoru ven (jako na obr. 13.2), ve stejném sloupci oblouk ven ze
 * stromu, jinak mírně prohnutá dolů (pod dopředné hrany cíle).
 */
export function trieBend(
  from: P2,
  to: P2,
  center: number,
  toRoot: boolean,
): number {
  const dx = to.x - from.x;
  if (toRoot && Math.abs(dx) > 1) return dx > 0 ? 0.6 : -0.6;
  if (Math.abs(dx) < 1) return from.x <= center ? 0.32 : -0.32;
  return dx < 0 ? 0.16 : -0.16;
}

/** body hrany (úsečka nebo kvadratická Bézierova křivka) pro obálku kresby */
function curvePoints(d: string): P2[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/gu)?.map(Number) ?? [];
  if (nums.length < 6)
    return [
      { x: nums[0] ?? 0, y: nums[1] ?? 0 },
      { x: nums[2] ?? 0, y: nums[3] ?? 0 },
    ];
  const [x0, y0, cx, cy, x1, y1] = nums;
  const out: P2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const u = 1 - t;
    out.push({
      x: u * u * x0 + 2 * u * t * cx + t * t * x1,
      y: u * u * y0 + 2 * u * t * cy + t * t * y1,
    });
  }
  return out;
}

/**
 * Strom Aho-Corasickové v px: vrcholy po hladinách (levelH), dopředné hrany rovně dolů s písmenem
 * u středu hrany, zpětné hrany a zkratky ohnuté (trieBend nebo ruční `bends`). Kresba se vystředí
 * do šířky obalu; obálka počítá i s oblouky a jmény stavů.
 */
export function trieAutomaton(
  nodes: readonly TrieSpec[],
  o: TrieOptions,
): AutomatonLayout {
  let r = TRIE_R;
  const visible = Math.max(
    1,
    Math.min(nodes.length, o.visible ?? nodes.length),
  );
  const T = trieSlots(nodes);
  const width = Number.isFinite(o.width) && o.width > 0 ? o.width : 0;
  const avail = width - 2 * TRIE_PAD - TRIE_SIDE;
  const levelH = Math.max(2 * r + 6, o.levelH);
  const coords = o.coords;
  const book = !!coords && nodes.every((n) => coords[n.id] !== undefined);
  const span = book
    ? Math.max(BOOK_MIN, Math.min(BOOK_MAX, avail))
    : T.slots
      ? T.slots * Math.max(SLOT_MIN, Math.min(SLOT_MAX, avail / T.slots))
      : 0;
  const pos: P2[] = nodes.map((n) =>
    book
      ? {
          x: (coords?.[n.id]?.[0] ?? 0) * span,
          y: (coords?.[n.id]?.[1] ?? 0) * T.depth * levelH,
        }
      : {
          x: T.slots ? (T.x[n.id] / T.slots) * span : 0,
          y: n.depth * levelH,
        },
  );
  const center = span / 2;
  // kroužky a písmo rostou s výškou hladiny (CanvasFit na velkém monitoru) – jen dokud se vrcholy
  // jedné hladiny nesrazí (aspoň 2r + 8 mezi středy) a hladiny mají mezi kroužky aspoň 6 px
  const byDepth = new Map<number, number[]>();
  nodes.forEach((n, i) =>
    byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), pos[i].x]),
  );
  let dmin = Infinity;
  for (const xs of byDepth.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++)
      dmin = Math.min(dmin, xs[i] - xs[i - 1]);
  }
  r = Math.max(
    TRIE_R,
    Math.min(
      TRIE_R_MAX,
      Math.floor(o.levelH * 0.24),
      Math.floor((levelH - 6) / 2),
      Number.isFinite(dmin) ? Math.floor((dmin - 8) / 2) : TRIE_R_MAX,
    ),
  );
  const zoom = r / TRIE_R;

  // dopředné hrany: rovně, písmeno stranou (svislá hrana: ven ze stromu; šikmá: nad hranou ven)
  const edges: AutoEdge[] = [];
  const letterSide: number[] = nodes.map(() => 0);
  for (const n of nodes) {
    if (n.parent === null || n.id >= visible) continue;
    const a = pos[n.parent];
    const b = pos[n.id];
    const e = curveEdge(a, b, 0, r);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx: number;
    let ny: number;
    if (Math.abs(dx) < 1) {
      const side = b.x <= center ? -1 : 1;
      letterSide[n.id] = side;
      nx = side;
      ny = 0;
    } else if (dx < 0) {
      nx = -dy / len;
      ny = dx / len;
    } else {
      nx = dy / len;
      ny = -dx / len;
    }
    edges.push({
      key: edgeKey("fwd", n.parent, n.id),
      from: n.parent,
      to: n.id,
      kind: "fwd",
      d: e.d,
      arrow: e.arrow,
      label: n.ch ?? "",
      lx: (a.x + b.x) / 2 + nx * 10 * zoom,
      ly: (a.y + b.y) / 2 + ny * 10 * zoom + 4 * zoom,
    });
  }
  const arc = (
    kind: "back" | "short",
    from: number,
    to: number,
    alt = false,
  ) => {
    const key = edgeKey(kind, from, to);
    const auto = trieBend(pos[from], pos[to], center, to === 0);
    // zkratka po stejné dvojici jako zpětná hrana (bara → ara) se ohne na druhou stranu
    const bend =
      o.bends?.[key] ?? (alt ? -auto - Math.sign(auto) * 0.12 : auto);
    const e = curveEdge(pos[from], pos[to], bend, r);
    edges.push({ key, from, to, kind, d: e.d, arrow: e.arrow });
  };
  const backFrom = o.backFrom ? new Set(o.backFrom) : null;
  for (const n of nodes) {
    const b = o.back[n.id];
    if (n.id >= visible || b === null || b === undefined || b >= visible)
      continue;
    if (!backFrom || backFrom.has(n.id)) arc("back", n.id, b);
  }
  for (const n of nodes) {
    const z = o.short[n.id];
    if (n.id >= visible || z === null || z === undefined || z >= visible)
      continue;
    arc("short", n.id, z, z === o.back[n.id]);
  }

  // jména: na opačnou stranu než písmeno příchozí svislé hrany (výchozí vpravo); když by tam jméno
  // leželo přes cizí kroužek (husté hladiny, úzké plátno), zkusí se druhá strana, pak pod a nad kroužkem
  const placed = nodes.slice(0, visible);
  const hitsCircle = (
    id: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
  ) =>
    placed.some((o) => {
      if (o.id === id) return false;
      const p = pos[o.id];
      const cx = Math.max(x0, Math.min(p.x, x1));
      const cy = Math.max(y0, Math.min(p.y, y1));
      return Math.hypot(p.x - cx, p.y - cy) < r + 1;
    });
  const named = placed.map((n) => {
    const pref = letterSide[n.id] === 1 ? -1 : 1;
    const w = [...n.name].length * TRIE_NAME_CHAR * zoom;
    const p = pos[n.id];
    const options: { side: -1 | 0 | 1; x: number; y: number }[] = [
      { side: pref, x: p.x + pref * (r + 3), y: p.y + 4 * zoom },
      { side: -pref as -1 | 1, x: p.x - pref * (r + 3), y: p.y + 4 * zoom },
      { side: 0, x: p.x, y: p.y + r + 11 * zoom },
      { side: 0, x: p.x, y: p.y - r - 3 },
    ];
    const box = (o: (typeof options)[number]) => {
      const x0 = o.side > 0 ? o.x : o.side < 0 ? o.x - w : o.x - w / 2;
      return [x0, x0 + w, o.y - 10 * zoom, o.y + 2] as const;
    };
    const pick =
      options.find((o) => !hitsCircle(n.id, ...box(o))) ?? options[0];
    return { n, side: pick.side, x: pick.x, y: pick.y, w };
  });

  // obálka: kroužky, hrany, písmena, jména
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  };
  for (const n of nodes.slice(0, visible)) {
    add(pos[n.id].x - r, pos[n.id].y - r);
    add(pos[n.id].x + r, pos[n.id].y + r);
  }
  // obálka ze všech vrcholů (i ještě nevložených) – kresba při vkládání slov neposkakuje
  for (const n of nodes) {
    add(pos[n.id].x - r, pos[n.id].y - r);
    add(pos[n.id].x + r, pos[n.id].y + r);
  }
  for (const e of edges) {
    for (const p of curvePoints(e.d)) add(p.x, p.y);
    if (e.lx !== undefined && e.ly !== undefined) {
      add(e.lx - 5 * zoom, e.ly - 11 * zoom);
      add(e.lx + 5 * zoom, e.ly + 2 * zoom);
    }
  }
  if (o.names)
    for (const m of named) {
      const x0 = m.side > 0 ? m.x : m.side < 0 ? m.x - m.w : m.x - m.w / 2;
      add(x0, m.y - 10 * zoom);
      add(x0 + m.w, m.y + 2);
    }
  const content = x1 - x0 + 2 * TRIE_PAD;
  const W = Math.round(Math.max(content, width));
  const dx = (W - content) / 2 + TRIE_PAD - x0;
  const dy = TRIE_PAD - y0;
  const H = Math.round(y1 - y0 + 2 * TRIE_PAD);
  const shift = (d: string) =>
    d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/gu, (_m, a, b) =>
      pt({ x: Number(a) + dx, y: Number(b) + dy }),
    );
  return {
    W,
    H,
    r,
    zoom,
    nameY: 0,
    nodes: named.map((m) => ({
      id: m.n.id,
      name: m.n.name,
      x: r1(pos[m.n.id].x + dx),
      y: r1(pos[m.n.id].y + dy),
      showName: o.names,
      nameX: r1(m.x + dx),
      nameY: r1(m.y + dy),
      nameAnchor: m.side > 0 ? "start" : m.side < 0 ? "end" : "middle",
    })),
    edges: edges.map((e) => ({
      ...e,
      d: shift(e.d),
      arrow: shift(e.arrow),
      lx: e.lx === undefined ? undefined : r1(e.lx + dx),
      ly: e.ly === undefined ? undefined : r1(e.ly + dy),
    })),
  };
}
