/**
 * „Naposledy otevřené“ moduly na úvodní stránce. Nový klíč localStorage `algo-recent` = JSON pole cest
 * (nejnovější první, nejvýš RECENT_MAX). Stávající klíče (algo-theme, algo-speed, kalkulačka) se nemění.
 * Úložiště může chybět nebo při přístupu vyhodit výjimku (zakázané cookies) a data mohou být poškozená –
 * nic z toho stránku neshodí, jen se řada neukáže.
 */
import { safeLocalStorage } from "../core/storage";
import { isKnownPath, normalizePath } from "../registry";

export const RECENT_KEY = "algo-recent";
export const RECENT_MAX = 4;

/** Část rozhraní Storage, kterou potřebujeme (testy podstrčí vlastní). */
export type RecentStorage = Pick<Storage, "getItem" | "setItem">;

/** Cesta modulu (ne přehled „/“, ne neznámá adresa). */
const isModulePath = (p: string) => p !== "/" && isKnownPath(p);

/** Uložená hodnota → platné cesty známých modulů, bez duplicit, nejvýš RECENT_MAX. */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: string[] = [];
  for (const item of data) {
    if (typeof item !== "string") continue;
    const p = normalizePath(item);
    if (isModulePath(p) && !out.includes(p)) out.push(p);
    if (out.length === RECENT_MAX) break;
  }
  return out;
}

/** Nový seznam: `path` na začátek, bez duplicit, nejvýš RECENT_MAX. */
export function pushRecent(list: readonly string[], path: string): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, RECENT_MAX);
}

/** localStorage, nebo null (není, nebo už přístup k němu vyhodí výjimku). */
const defaultStorage: () => RecentStorage | null = safeLocalStorage;

export function readRecent(
  storage: RecentStorage | null = defaultStorage(),
): string[] {
  if (!storage) return [];
  try {
    return parseRecent(storage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

/** Zapíše otevřený modul (volá Shell při každé změně cesty); přehled ani neznámé cesty nezapisuje. */
export function rememberModule(
  path: string,
  storage: RecentStorage | null = defaultStorage(),
): void {
  const p = normalizePath(path);
  if (!storage || !isModulePath(p)) return;
  try {
    const next = pushRecent(readRecent(storage), p);
    storage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // plné nebo zakázané úložiště – historie se prostě nezapamatuje
  }
}
