import { useCallback, useMemo, useRef, useState } from "react";
import type { Step, StepGen } from "./steps";
import {
  DEFAULT_MESSAGE,
  initStructure,
  resetTo,
  restoreInitial,
  runOp,
  undoOp,
  type StructureState,
} from "./structure";

/**
 * Stav pro datové struktury: uživatel postupně spouští operace (Insert, Delete…),
 * každá operace vyrobí kroky od koncového stavu té předchozí.
 */
export interface Structure<S> {
  steps: Step<S>[];
  pseudocode: string[];
  /** název právě zobrazené operace (první argument run), '' v klidu */
  opTitle: string;
  /** stav po dokončení poslední operace */
  last: S;
  /**
   * Spustí operaci. `title` pište i s argumentem („Insert(35)“) – zobrazuje se nad zprávou a v historii.
   * Výjimka v generátoru ani překročení limitu kroků strukturu nezmění, jen se zobrazí chybová zpráva.
   * Stejně operace, jejíž kroky jsou všechny chybové (Pop z prázdného…): bez změny, bez historie.
   */
  run: (title: string, pseudocode: string[], op: (s: S) => StepGen<S>) => void;
  /** Nastaví strukturu na daný stav. `title` je popisek do historie (např. „Vyprázdnit“). */
  reset: (s: S, message?: string, title?: string) => void;
  /** roste s každou provedenou operací (Visualizer podle něj posune plátno do záběru) */
  opId: number;
  /** roste s každou změnou (operace, přestavba, vrácení) – Visualizer pak posune plátno do záběru */
  version: number;
  /** názvy provedených operací od nejstarší po nejnovější */
  history: string[];
  canUndo: boolean;
  /** vrátí poslední operaci nebo reset (i „Vyprázdnit“) */
  undo: () => void;
  /** vrátí strukturu do stavu, ve kterém se stránka otevřela */
  restoreInitial: () => void;
}

/**
 * @param initial počáteční stav, nebo funkce, která ho vyrobí (zavolá se jen jednou – vhodné pro drahé stavby)
 */
export function useStructure<S>(
  initial: S | (() => S),
  initialMessage = DEFAULT_MESSAGE,
): Structure<S> {
  const [st, setSt] = useState<StructureState<S>>(() =>
    initStructure(
      typeof initial === "function" ? (initial as () => S)() : initial,
      initialMessage,
    ),
  );
  // Aktuální stav i mimo render: generátor operace běží v obsluze události (ne v updateru setState),
  // a víc volání run() za sebou na sebe musí navázat.
  const ref = useRef(st);

  const apply = useCallback(
    (f: (prev: StructureState<S>) => StructureState<S>) => {
      const next = f(ref.current);
      if (next === ref.current) return;
      ref.current = next;
      setSt(next);
    },
    [],
  );

  const run = useCallback(
    (title: string, code: string[], op: (s: S) => StepGen<S>) =>
      apply((prev) => runOp(prev, title, code, op)),
    [apply],
  );
  const reset = useCallback(
    (s: S, message?: string, title?: string) =>
      apply((prev) => resetTo(prev, s, message, title)),
    [apply],
  );
  const undo = useCallback(() => apply(undoOp), [apply]);
  const restore = useCallback(() => apply(restoreInitial), [apply]);

  return useMemo(
    () => ({
      steps: st.steps,
      pseudocode: st.pseudocode,
      opTitle: st.opTitle,
      last: st.last,
      run,
      reset,
      opId: st.opId,
      version: st.version,
      history: st.history.map((h) => h.title),
      canUndo: st.history.length > 0,
      undo,
      restoreInitial: restore,
    }),
    [st, run, reset, undo, restore],
  );
}
