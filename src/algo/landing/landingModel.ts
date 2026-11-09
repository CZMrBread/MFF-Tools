/** Čistá logika úvodní stránky: filtr úrovně (Vše / Bc. / Mgr.) nad hledáním z levé lišty, kotvy skupin. */
import {
  CATEGORIES,
  filterCategories,
  normalizeSearch,
  type Category,
  type Level,
} from "../registry";

export type LevelFilter = "all" | Level;

export const LEVEL_FILTERS: readonly {
  id: LevelFilter;
  label: string;
  title: string;
}[] = [
  { id: "all", label: "Vše", title: "Všechny moduly" },
  {
    id: "bc",
    label: "Bc.",
    title: "Bakalářská látka (Průvodce labyrintem algoritmů)",
  },
  {
    id: "mgr",
    label: "Mgr.",
    title: "Magisterská přednáška Datové struktury I",
  },
];

/** Skupiny s moduly odpovídajícími dotazu (stejně jako levá lišta) a zvolené úrovni; prázdné vynechá. */
export function landingCategories(
  query: string,
  level: LevelFilter,
  categories: Category[] = CATEGORIES,
): Category[] {
  return filterCategories(query, categories)
    .map((c) => ({
      ...c,
      modules:
        level === "all"
          ? c.modules
          : c.modules.filter((m) => m.level === level),
    }))
    .filter((c) => c.modules.length > 0);
}

export const countModules = (cats: readonly Category[]) =>
  cats.reduce((s, c) => s + c.modules.length, 0);

/** „1 modul“, „3 moduly“, „7 modulů“. */
export const modulesWord = (n: number) =>
  `${n} ${n === 1 ? "modul" : n >= 2 && n <= 4 ? "moduly" : "modulů"}`;

/**
 * Id sekce skupiny (cíl čipu). Nekoliduje s cestou HashRouteru – na sekci se neposouvá změnou adresy
 * (#skupina by byla cesta), ale scrollIntoView.
 */
export function groupAnchorId(title: string): string {
  return (
    "skupina-" +
    normalizeSearch(title)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

export const APP_TITLE = "Algoritmy a datové struktury";

/** Stav předaný přesměrováním z neznámé adresy (úvodní stránka ho ohlásí). */
export interface UnknownState {
  unknown?: string;
}
