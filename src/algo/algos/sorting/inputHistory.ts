/**
 * Historie vstupů stránek bez datové struktury (třídění: pole P, stránkování: σ a P) – čisté funkce.
 * Každé použití nového vstupu se zapíše s názvem (jako operace u struktur), „↶ Vrátit operaci“ vrátí
 * předchozí vstup. Visualizer ji ukazuje přes prop `inputHistory`.
 */

/** nejvýš tolik vstupů zpět (starší odpadnou) */
export const MAX_PAST = 50;

export interface InputsState<T> {
  current: T;
  /** předchozí vstupy od nejstaršího; `title` = co vstup změnilo */
  past: readonly { title: string; before: T }[];
}

export const initInputs = <T>(current: T): InputsState<T> => ({
  current,
  past: [],
});

/** Použije nový vstup; stejný vstup (podle `same`) historii nemění. */
export function pushInput<T>(
  h: InputsState<T>,
  next: T,
  title: string,
  same: (a: T, b: T) => boolean,
): InputsState<T> {
  if (same(h.current, next)) return h;
  const past = [...h.past, { title, before: h.current }];
  return { current: next, past: past.slice(-MAX_PAST) };
}

/** Vrátí předchozí vstup (bez historie nic). */
export function undoInput<T>(h: InputsState<T>): InputsState<T> {
  const last = h.past[h.past.length - 1];
  if (!last) return h;
  return { current: last.before, past: h.past.slice(0, -1) };
}

/** Názvy záznamů pro řádek Historie (od nejstaršího). */
export const titlesOf = <T>(h: InputsState<T>) => h.past.map((p) => p.title);
