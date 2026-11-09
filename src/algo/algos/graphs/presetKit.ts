/**
 * Typy a stavební pomůcky předvoleb grafů (fáze 4: ve vlastním souboru, aby předvolby nových algoritmů
 * v souborech stop – bellmanFord.presets.ts, boruvka.presets.ts, bridges.presets.ts, scc.presets.ts – nemusely
 * importovat presets.ts; ten je naopak připojí do PRESETS).
 */
export interface PresetNode {
  id: string;
  label: string;
  /** 0…1 v obdélníku se středy vrcholů (y dolů) */
  x: number;
  y: number;
}

export interface PresetEdge {
  from: string;
  to: string;
  w?: number;
  /** viz GEdge.bend */
  bend?: number;
}

interface PresetBase {
  id: string;
  /** název v nabídce, u knižních „Obr. 5.5 „Prasátko““ */
  label: string;
  directed: boolean;
  weighted: boolean;
  /** text hran ve formátu parseGraphInput (u knižních odvozený z hran) */
  text: string;
  /**
   * id algoritmů, jejichž nabídka „Vytvořit“ předvolbu ukáže (bez něj všem) – příklad na zápornou hranu
   * nepatří do Dijkstry, kořen jako artikulace ne do topologického uspořádání (UX-07)
   */
  only?: readonly string[];
}

export interface BookPreset extends PresetBase {
  source: "Průvodce";
  /** strana v PDF Průvodce (= tištěné číslo) */
  page: number;
  nodes: PresetNode[];
  edges: PresetEdge[];
  /** šířka / výška obdélníku se středy vrcholů */
  aspect: number;
  /** upozornění k předvolbě (např. že popisky vrcholů v knize nejsou) */
  note?: string;
  /** počáteční vrchol v₀ jako v knize (výchozí v₀ stránky pro algoritmy se startem) */
  start?: string;
}

export interface TextPreset extends PresetBase {
  source?: undefined;
}

export type GraphPreset = BookPreset | TextPreset;

export const isBookPreset = (p: GraphPreset): p is BookPreset =>
  p.source === "Průvodce";

/** Text hran: jedna hrana na řádek v pořadí předvolby, izolované vrcholy na konci. */
export function edgesText(
  nodes: readonly PresetNode[],
  edges: readonly PresetEdge[],
  weighted: boolean,
): string {
  const lines = edges.map(
    (e) => `${e.from} ${e.to}${weighted ? ` ${e.w ?? 1}` : ""}`,
  );
  const used = new Set(edges.flatMap((e) => [e.from, e.to]));
  for (const n of nodes) if (!used.has(n.label)) lines.push(n.label);
  return lines.join("\n");
}

export type Tuple = readonly [string, string, number?];

/**
 * Knižní předvolba z mřížky (libovolné jednotky – kresba se normuje na 0…1 a poměr stran z ní plyne)
 * a seznamu hran; `bends` klíčované „u>v“.
 */
export function book(o: {
  id: string;
  label: string;
  page: number;
  directed: boolean;
  weighted: boolean;
  grid: Record<string, readonly [number, number]>;
  edges: readonly Tuple[];
  bends?: Record<string, number>;
  note?: string;
  start?: string;
}): BookPreset {
  const pts = Object.values(o.grid);
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const sx = maxX - minX || 1;
  const sy = maxY - minY || 1;
  const nodes = Object.entries(o.grid).map(([label, [x, y]]) => ({
    id: label,
    label,
    x: (x - minX) / sx,
    y: (y - minY) / sy,
  }));
  const edges = o.edges.map(([from, to, w]) => {
    const bend = o.bends?.[`${from}>${to}`];
    return {
      from,
      to,
      ...(w !== undefined ? { w } : {}),
      ...(bend !== undefined ? { bend } : {}),
    };
  });
  return {
    id: o.id,
    label: o.label,
    source: "Průvodce",
    page: o.page,
    directed: o.directed,
    weighted: o.weighted,
    nodes,
    edges,
    aspect: sx / sy,
    text: edgesText(nodes, edges, o.weighted),
    ...(o.note ? { note: o.note } : {}),
    ...(o.start !== undefined ? { start: o.start } : {}),
  };
}

/** Mřížka po řádcích: „ABC“, „DEF“ … → A = [0, 0], B = [1, 0] … */
export const rowsGrid = (rows: readonly string[]) =>
  Object.fromEntries(
    rows.flatMap((row, r) =>
      [...row].map((label, c) => [label, [c, r] as const]),
    ),
  );

/** Předvolba bez souřadnic (jen text hran, silové rozložení). */
export const text = (
  id: string,
  label: string,
  directed: boolean,
  weighted: boolean,
  t: string,
  only?: readonly string[],
): TextPreset => ({
  id,
  label,
  directed,
  weighted,
  text: t,
  ...(only ? { only } : {}),
});

/** Ukáže nabídka algoritmu `algoId` tuto předvolbu? */
export const presetOffered = (
  p: { only?: readonly string[] },
  algoId: string,
): boolean => !p.only || p.only.includes(algoId);
