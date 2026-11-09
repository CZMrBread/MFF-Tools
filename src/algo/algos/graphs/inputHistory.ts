/**
 * Historie vstupu pro stránky bez useStructure (grafy, Aho-Corasicková, hradlové sítě): každá akce, která
 * mění vstup (Vytvořit, Příklady z knihy, ceny hran, úprava v editoru…), si zapamatuje stav před sebou;
 * „↶ Vrátit operaci“ ve Visualizeru (prop `inputHistory`) ho vrátí. Čisté funkce + malý hook.
 */
import { useCallback, useState } from "react";
import type { InputHistory } from "../../core/Visualizer";

/** kolik operací jde vrátit */
export const INPUT_HISTORY_LIMIT = 50;

export interface InputEntry<T> {
  /** název operace do řádku Historie */
  title: string;
  /** stav vstupu před operací */
  before: T;
  /** skupina navazujících drobných změn (přesun vrcholu) – pushInputGrouped */
  group?: string;
  /** čas poslední změny skupiny (ms) */
  t?: number;
}

/** Shift+šipky na tomtéž vrcholu do takové pauzy (ms) jsou jedna operace „Přesun vrcholu“ */
export const MOVE_GROUP_MS = 1500;

export function pushInput<T>(
  h: readonly InputEntry<T>[],
  title: string,
  before: T,
): InputEntry<T>[] {
  return [...h, { title, before }].slice(-INPUT_HISTORY_LIMIT);
}

/**
 * Jako pushInput, ale navazující změna téže skupiny (`group`) se nepřidá – poslední položka si ponechá stav
 * před první změnou. Tah myší či prstem = skupina gesta (`windowMs` = Infinity), Shift+šipky = skupina
 * vrcholu s oknem MOVE_GROUP_MS od posledního stisku. Jiná operace mezi nimi skupinu přeruší (nemá `group`).
 */
export function pushInputGrouped<T>(
  h: readonly InputEntry<T>[],
  title: string,
  before: T,
  group: string,
  now: number,
  windowMs = MOVE_GROUP_MS,
): InputEntry<T>[] {
  const last = h[h.length - 1];
  if (last && last.group === group && now - (last.t ?? -Infinity) < windowMs)
    return [...h.slice(0, -1), { ...last, t: now }];
  return [...h, { title, before, group, t: now }].slice(-INPUT_HISTORY_LIMIT);
}

export function popInput<T>(
  h: readonly InputEntry<T>[],
): { before: T; rest: InputEntry<T>[] } | null {
  const last = h[h.length - 1];
  return last ? { before: last.before, rest: h.slice(0, -1) } : null;
}

export function inputHistoryControl<T>(
  h: readonly InputEntry<T>[],
  undo: () => void,
): InputHistory {
  return { history: h.map((e) => e.title), canUndo: h.length > 0, undo };
}

/**
 * Stav historie: `record(title, before)` před změnou vstupu, `pop()` vrátí stav před poslední operací
 * (a odebere ji), `control(undo)` = tvar pro Visualizer (undo = pop + obnovení vstupu stránkou).
 */
export function useInputHistory<T>(): {
  record: (title: string, before: T) => void;
  /** pushInputGrouped – přesun vrcholu (celý tah či série Shift+šipek = jedna položka) */
  recordGrouped: (
    title: string,
    before: T,
    group: string,
    windowMs?: number,
  ) => void;
  pop: () => T | null;
  control: (undo: () => void) => InputHistory;
} {
  const [entries, setEntries] = useState<InputEntry<T>[]>([]);
  const record = useCallback(
    (title: string, before: T) =>
      setEntries((h) => pushInput(h, title, before)),
    [],
  );
  const recordGrouped = useCallback(
    (title: string, before: T, group: string, windowMs?: number) => {
      const now = Date.now();
      setEntries((h) =>
        pushInputGrouped(h, title, before, group, now, windowMs),
      );
    },
    [],
  );
  const pop = () => {
    const r = popInput(entries);
    if (!r) return null;
    setEntries(r.rest);
    return r.before;
  };
  const control = (undo: () => void) => inputHistoryControl(entries, undo);
  return { record, recordGrouped, pop, control };
}
