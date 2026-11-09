/**
 * Logika pro datové struktury s operacemi – čisté funkce bez Reactu (testy v structure.test.ts).
 * Hook useStructure je jen tenká obálka, která drží stav.
 */
import {
  isTruncated,
  materialize,
  MAX_STEPS,
  type Step,
  type StepGen,
} from "./steps";

export const DEFAULT_MESSAGE =
  "Zvolte operaci v panelu nahoře (např. Insert). Její průběh pak můžete přehrát nebo krokovat tlačítky pod obrázkem.";

/** Kolik posledních operací jde vrátit zpět. */
export const HISTORY_LIMIT = 30;

export interface HistoryEntry<S> {
  /** název operace včetně argumentu, např. „Insert(35)“ */
  title: string;
  /** stav struktury před operací */
  before: S;
}

export interface StructureState<S> {
  /** kroky právě zobrazené operace (nebo jediný krok s klidovým stavem) */
  steps: Step<S>[];
  pseudocode: string[];
  opTitle: string;
  /** roste s každou úspěšně provedenou operací (Visualizer podle něj posune plátno do záběru) */
  opId: number;
  /**
   * roste s každou změnou struktury – operací, přestavbou (resetTo) i vrácením; přestavba opId nemění
   * (nic se samo nepřehrává), ale plátno se po ní má posunout do záběru
   */
  version: number;
  /** stav po dokončení poslední operace; z něj startuje další */
  last: S;
  /** provedené operace od nejstarší po nejnovější (nejvýše HISTORY_LIMIT) */
  history: HistoryEntry<S>[];
  initial: S;
  initialMessage: string;
}

function rest<S>(state: S, message: string, error = false): Step<S>[] {
  return [
    error
      ? { state, line: null, message, error: true }
      : { state, line: null, message },
  ];
}

function pushHistory<S>(
  history: HistoryEntry<S>[],
  entry: HistoryEntry<S>,
): HistoryEntry<S>[] {
  return [...history, entry].slice(-HISTORY_LIMIT);
}

export function initStructure<S>(
  initial: S,
  initialMessage = DEFAULT_MESSAGE,
): StructureState<S> {
  const state = structuredClone(initial);
  return {
    steps: rest(state, initialMessage),
    pseudocode: [],
    opTitle: "",
    opId: 0,
    version: 0,
    last: state,
    history: [],
    initial: structuredClone(initial),
    initialMessage,
  };
}

/** Operace se neprovedla: struktura zůstává, zobrazí se jediný krok s vysvětlením. */
function failed<S>(
  st: StructureState<S>,
  title: string,
  code: string[],
  message: string,
): StructureState<S> {
  return {
    ...st,
    steps: rest(st.last, message, true),
    pseudocode: code,
    opTitle: title,
  };
}

/**
 * Provede operaci nad kopií posledního stavu. Výjimka v generátoru ani překročení limitu kroků strukturu
 * nezmění (zobrazí se chybový krok); operace bez jediného kroku nezmění vůbec nic. Operace, jejíž kroky jsou
 * všechny chybové (Pop z prázdného zásobníku, odmítnutý vstup…), se jen zobrazí: struktura, opId ani historie
 * se nemění – není co vracet a nic se samo nepřehrává.
 */
export function runOp<S>(
  st: StructureState<S>,
  title: string,
  code: string[],
  op: (s: S) => StepGen<S>,
  limit = MAX_STEPS,
): StructureState<S> {
  let out: Step<S>[];
  try {
    out = materialize(op(structuredClone(st.last)), limit);
  } catch (e) {
    console.error(`Operace ${title} selhala:`, e);
    const detail = e instanceof Error ? e.message : String(e);
    return failed(
      st,
      title,
      code,
      `Operaci ${title} se nepodařilo provést (${detail}). Struktura zůstala beze změny – zkuste jiný vstup.`,
    );
  }
  if (out.length === 0) return st;
  if (isTruncated(out)) {
    return failed(
      st,
      title,
      code,
      `Operace ${title} překročila limit ${limit} kroků a byla zrušena. Struktura zůstala ve stavu před ní – zkuste menší vstup.`,
    );
  }
  if (out.every((step) => step.error))
    return { ...st, steps: out, pseudocode: code, opTitle: title };
  return {
    ...st,
    steps: out,
    pseudocode: code,
    opTitle: title,
    opId: st.opId + 1,
    version: st.version + 1,
    last: out[out.length - 1].state,
    history: pushHistory(st.history, { title, before: st.last }),
  };
}

/** Nastaví strukturu na daný stav (Vyprázdnit, Postavit…). I tohle jde vrátit přes undoOp. */
export function resetTo<S>(
  st: StructureState<S>,
  s: S,
  message = "Struktura nastavena.",
  title = "Nový stav",
): StructureState<S> {
  const state = structuredClone(s);
  return {
    ...st,
    steps: rest(state, message),
    pseudocode: [],
    opTitle: "",
    version: st.version + 1,
    last: state,
    history: pushHistory(st.history, { title, before: st.last }),
  };
}

/** Vrátí poslední operaci (nebo reset): struktura je zpět ve stavu před ní. */
export function undoOp<S>(st: StructureState<S>): StructureState<S> {
  const entry = st.history[st.history.length - 1];
  if (!entry) return st;
  return {
    ...st,
    steps: rest(
      entry.before,
      `Vráceno: ${entry.title}. Struktura je ve stavu před tímto krokem.`,
    ),
    pseudocode: [],
    opTitle: "",
    version: st.version + 1,
    last: entry.before,
    history: st.history.slice(0, -1),
  };
}

/** Návrat k výchozímu příkladu (stav z prvního vykreslení stránky). */
export function restoreInitial<S>(st: StructureState<S>): StructureState<S> {
  return resetTo(st, st.initial, st.initialMessage, "Výchozí příklad");
}
