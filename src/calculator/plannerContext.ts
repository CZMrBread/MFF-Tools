import { createContext, useContext } from "react";
import type { CalculatorState } from "../lib/schedule";
import type { PlacementSemester, SubjectNode } from "../lib/types";

/** Akce nad postupem – každá stav změní, uloží jako stará stránka a překreslí. */
export interface PlannerActions {
  /** Zaškrtnutí / odškrtnutí v Kalkulačce (starý `toggleDone`). */
  toggleDone: (id: string) => void;
  /** Přepínač „bez kreditů" (starý `toggleNoCredit`). */
  toggleNoCredit: (id: string) => void;
  /** Štítek „splnit vše" u povinných (starý `completeAllMandatory`). */
  completeAllMandatory: () => void;
  /** „Reset kategorie" v Kalkulačce (starý `resetCategory`). */
  resetCategory: (ids: readonly string[]) => void;
  /** „Reset kategorie" v Rozvrhu (starý `resetSchedCategory`). */
  resetScheduleCategory: (ids: readonly string[]) => void;
  /** Zařazení předmětu podle id z celých dat roku (starý `placeSubject`). */
  place: (id: string, year: number, semester: PlacementSemester) => void;
  /** Rychlé zařazení zaškrtávátkem v Rozvrhu – 1. ročník, pevný semestr nebo zimní. */
  quickPlace: (subject: SubjectNode) => void;
  /** Odebrání z rozvrhu (starý `unplaceFromSchedule`). */
  unplace: (id: string) => void;
  /** Otevře výběr ročníku a semestru (starý `openYearPicker`). */
  openPicker: (id: string) => void;
  /** Začátek a konec přetahování (starý `dragSubjectId`). */
  dragStart: (id: string) => void;
  dragEnd: () => void;
  /** Id právě přetahovaného předmětu, nebo `null`. */
  draggedId: () => string | null;
  /** Předmět z celých dat roku podle id (starý `byId[id]`). */
  subjectById: (id: string | null) => SubjectNode | undefined;
}

export interface PlannerContextValue {
  state: CalculatorState;
  actions: PlannerActions;
}

export const PlannerContext = createContext<PlannerContextValue | null>(null);

/** Stav a akce plánovače; jen uvnitř `<Planner>`. */
export function usePlanner(): PlannerContextValue {
  const value = useContext(PlannerContext);
  if (!value) throw new Error("usePlanner() mimo <Planner>");
  return value;
}

/** Spojí názvy tříd, prázdné a nepravdivé hodnoty vynechá. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
