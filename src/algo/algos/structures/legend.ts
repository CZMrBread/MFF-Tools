/**
 * Legendy stránek datových struktur (čisté funkce bez UI, testy v legend.test.ts).
 * Každá položka má `key` = třídu / značku, kterou generátory skutečně kreslí. Stránka ukáže jen položky,
 * které se v právě zobrazené operaci vyskytnou; v klidu (bez zvýraznění) celou legendu stránky.
 */
import type { LegendItem } from "../../core/Visualizer";
import type { Step } from "../../core/steps";
import { MARK_GLYPH } from "../../views/arrayLayout";
import type { HeapState } from "./heap";
import type { ListKind, ListState } from "./list";
import type { SegState } from "./segtree";

export interface LegendEntry {
  /** třída krabičky / uzlu nebo značka pole, ke které položka patří */
  key: string;
  item: LegendItem;
}

/** Položky, jejichž klíč se vyskytl; když se nevyskytl žádný, celá legenda. */
export function pickLegend(
  entries: readonly LegendEntry[],
  used: ReadonlySet<string>,
): LegendItem[] {
  const hit = entries.filter((e) => used.has(e.key));
  return (hit.length ? hit : entries).map((e) => e.item);
}

/* ---------- zásobník, fronta, seznam ---------- */

const BOX_NEW: LegendEntry = {
  key: "box-new",
  item: { cls: "sw-new", label: "nový prvek" },
};
const BOX_REMOVED: LegendEntry = {
  key: "box-removed",
  item: { cls: "sw-removed-dashed", label: "odebíraný prvek (čárkovaně)" },
};

export const LIST_LEGEND: Record<ListKind, LegendEntry[]> = {
  stack: [BOX_NEW, BOX_REMOVED],
  queue: [BOX_NEW, BOX_REMOVED],
  list: [
    BOX_NEW,
    {
      key: "box-active",
      item: { cls: "sw-active", label: "prvek, na který ukazuje p" },
    },
    {
      key: "box-compare",
      item: { cls: "sw-compare", label: "porovnávaný prvek" },
    },
    { key: "box-found", item: { cls: "sw-found", label: "nalezený prvek" } },
    {
      key: "box-removed",
      item: { cls: "sw-removed-dashed", label: "mazaný prvek (čárkovaně)" },
    },
    {
      key: "ptr-p",
      item: {
        cls: "sw-removed",
        label: "ukazatel p (červený popisek)",
        shape: "line",
      },
    },
  ],
};

/** Třídy krabiček a ukazatelů, které se v krocích vyskytnou. */
export function listClasses(steps: readonly Step<ListState>[]): Set<string> {
  const used = new Set<string>();
  for (const s of steps) {
    for (const b of s.state.boxes) if (b.cls) used.add(b.cls);
    for (const p of s.state.pointers) if (p.cls) used.add(p.cls);
  }
  return used;
}

/* ---------- binární halda (strom i pole mají stejné značky) ---------- */

export const HEAP_LEGEND: LegendEntry[] = [
  {
    key: "active",
    item: {
      cls: "bar-active",
      label: "aktuální vrchol i",
      glyph: MARK_GLYPH.active,
    },
  },
  {
    key: "compare",
    item: {
      cls: "bar-compare",
      label: "porovnávaný otec / synové",
      glyph: MARK_GLYPH.compare,
    },
  },
  {
    key: "min",
    item: {
      cls: "bar-min",
      label: "menší syn s / minimum",
      glyph: MARK_GLYPH.min,
    },
  },
  {
    key: "swap",
    item: { cls: "bar-swap", label: "právě prohozené", glyph: MARK_GLYPH.swap },
  },
];

export function heapClasses(steps: readonly Step<HeapState>[]): Set<string> {
  const used = new Set<string>();
  for (const s of steps)
    for (const m of Object.values(s.state.marks)) used.add(m);
  return used;
}

/* ---------- intervalový strom (uzly se kreslí barevným obrysem) ---------- */

export const SEG_LEGEND: LegendEntry[] = [
  {
    key: "n-active",
    item: {
      cls: "bar-active",
      label: "právě zpracovávaný vrchol",
      shape: "ring",
    },
  },
  {
    key: "n-compare",
    item: {
      cls: "bar-compare",
      label: "synové, ze kterých se počítá minimum",
      shape: "ring",
    },
  },
  {
    key: "n-swap",
    item: {
      cls: "bar-swap",
      label: "zapsaná / přepočítaná hodnota",
      shape: "ring",
    },
  },
  {
    key: "n-min",
    item: {
      cls: "bar-min",
      label: "kanonický interval (nahlášený vrchol)",
      shape: "ring",
    },
  },
  {
    key: "n-visited",
    item: { cls: "sw-visited", label: "už prošlý vrchol (čárkovaně)" },
  },
  {
    key: "n-queried",
    item: {
      cls: "sw-queried",
      label: "list v dotazovaném intervalu (tlustý obrys)",
      shape: "ring",
    },
  },
];

export function segClasses(steps: readonly Step<SegState>[]): Set<string> {
  const used = new Set<string>();
  for (const s of steps) {
    for (const c of Object.values(s.state.marks))
      for (const part of c.split(/\s+/)) if (part) used.add(part);
    if (s.state.queried) used.add("n-queried");
  }
  return used;
}
