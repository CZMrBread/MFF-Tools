/**
 * Výpočty záložky Rozvrh a přechody stavu Kalkulačky – čisté funkce bez Reactu, bez
 * DOM a bez globálního stavu. Přepis ze staré kalkulačky (kalkulačka/index.html ve
 * stavu e0a6ccf:
 * defaultYearsFor, changeYears, placeSubject, unplaceFromSchedule, resetYear,
 * resetAllSchedule, resetSchedCategory, renderSchedule, semesterTagText,
 * renderYearBlocks, renderSchedSummary, openYearPicker, toggleDone, toggleNoCredit,
 * completeAllMandatory, resetCategory, resetAllProgress).
 *
 * Popis je v docs/algo.md; shodu se starým kódem hlídá src/lib/schedule.test.ts nad
 * src/lib/__fixtures__/credits-legacy.json.
 */
import { planSubjectsById, planSummary, sumCredits } from "./credits";
import type { IsDone, PlanSummary, StudyPlan } from "./credits";
import type { Placement, Placements } from "./storage";
import type {
  PlacementSemester,
  SpecNode,
  StudyType,
  SubjectNode,
} from "./types";

// ---------------------------------------------------------------------------
// Počet ročníků
// ---------------------------------------------------------------------------

/** Výchozí počet ročníků podle stupně studia. */
export const DEFAULT_YEARS: Readonly<Record<StudyType, number>> = {
  bakalarske: 3,
  magisterske: 2,
};

/** Výchozí počet ročníků, když stupeň není známý. */
export const FALLBACK_YEARS = 3;

/** Nejmenší a největší počet ročníků, který jde v Rozvrhu nastavit. */
export const MIN_YEARS = 1;
export const MAX_YEARS = 8;

/** Semestry rozvrhu v pořadí zobrazení. */
export const PLACEMENT_SEMESTERS: readonly PlacementSemester[] = [
  "zimní",
  "letní",
];

/** Výchozí počet ročníků: 3 bakalářské, 2 magisterské, jinak 3. */
export function defaultYearsFor(degree: string | null | undefined): number {
  if (degree === "bakalarske" || degree === "magisterske") {
    return DEFAULT_YEARS[degree];
  }
  return FALLBACK_YEARS;
}

/**
 * Stupeň studia pro Rozvrh: uložený stupeň, a když chybí, `study_type` zvolené
 * specializace (starý `if(currentDegree == null) currentDegree = spec.study_type`).
 */
export function effectiveDegree(
  storedDegree: StudyType | null | undefined,
  spec: Pick<SpecNode, "study_type"> | null | undefined,
): StudyType | null {
  return storedDegree ?? spec?.study_type ?? null;
}

/** Počet ročníků k zobrazení: uložený, a když chybí (nebo je NaN), výchozí podle stupně. */
export function resolveYearsCount(
  yearsCount: number | null | undefined,
  degree: string | null | undefined,
): number {
  return yearsCount == null || Number.isNaN(yearsCount)
    ? defaultYearsFor(degree)
    : yearsCount;
}

/** Která tlačítka přepínače počtu ročníků jsou aktivní. */
export function yearsStepper(yearsCount: number): {
  canDecrease: boolean;
  canIncrease: boolean;
} {
  return {
    canDecrease: !(yearsCount <= MIN_YEARS),
    canIncrease: !(yearsCount >= MAX_YEARS),
  };
}

// ---------------------------------------------------------------------------
// Semestry
// ---------------------------------------------------------------------------

/** Má předmět pevný semestr (zimní / letní)? Ostatní („oba", neznámý text) lze dát kamkoli. */
export function isFixedSemester(
  semester: string,
): semester is PlacementSemester {
  return semester === "zimní" || semester === "letní";
}

/** Zkratka semestru: „ZS", „LS", „ZS nebo LS" (oba), jinak „—". */
export function semesterTagText(semester: string): string {
  if (semester === "zimní") return "ZS";
  if (semester === "letní") return "LS";
  if (semester === "oba") return "ZS nebo LS";
  return "—";
}

/** Nadpis sloupce semestru v ročníku. */
export function semesterSlotLabel(semester: PlacementSemester): string {
  return semester === "zimní" ? "Zimní semestr" : "Letní semestr";
}

/**
 * Lze předmět zařadit do daného semestru? Předmět s pevným semestrem jen do svého;
 * „oba" i neznámý semestr do kteréhokoli (pravidlo starého `placeSubject`).
 */
export function canPlace(
  subject: Pick<SubjectNode, "semester">,
  semester: PlacementSemester,
): boolean {
  return !(isFixedSemester(subject.semester) && subject.semester !== semester);
}

/**
 * Zvýraznění cíle při přetahování (starý `ondragover`): povoleno, když se neví, co se
 * táhne, nebo je předmět „oba", nebo jeho semestr odpovídá. U předmětu s neznámým
 * textem semestru se tedy liší od {@link canPlace} – cíl se ukáže jako zakázaný, ale
 * puštění předmět zařadí (tak se chová stará stránka).
 */
export function isDropAllowed(
  subject: Pick<SubjectNode, "semester"> | null | undefined,
  semester: PlacementSemester,
): boolean {
  return (
    !subject || subject.semester === "oba" || subject.semester === semester
  );
}

/** Semestr pro rychlé zařazení zaškrtávátkem (vždy do 1. ročníku): pevný, jinak zimní. */
export function quickPlacementSemester(
  subject: Pick<SubjectNode, "semester">,
): PlacementSemester {
  return isFixedSemester(subject.semester) ? subject.semester : "zimní";
}

/** Jedna volba ve výběru ročníku a semestru. */
export interface PlacementOption {
  year: number;
  semester: PlacementSemester;
  /** Např. „2. ročník — letní semestr". */
  label: string;
}

/**
 * Volby výběru ročníku/semestru pro předmět (starý `openYearPicker`): pro každý
 * ročník 1..`yearsCount` jedna volba u předmětu s pevným semestrem, jinak dvě
 * (zimní, letní).
 */
export function placementOptions(
  subject: Pick<SubjectNode, "semester">,
  yearsCount: number,
): PlacementOption[] {
  const semesters = isFixedSemester(subject.semester)
    ? [subject.semester]
    : PLACEMENT_SEMESTERS;
  const options: PlacementOption[] = [];
  for (let year = 1; year <= yearsCount; year++) {
    for (const semester of semesters) {
      const name = semester === "zimní" ? "zimní semestr" : "letní semestr";
      options.push({ year, semester, label: `${year}. ročník — ${name}` });
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Zařazení
// ---------------------------------------------------------------------------

/** Zařazení předmětu, nebo `undefined` (starý test `placements[id]`). */
export function placementOf(
  placements: Placements,
  subjectId: string,
): Placement | undefined {
  return Object.hasOwn(placements, subjectId)
    ? placements[subjectId]
    : undefined;
}

/** `IsDone` pro Rozvrh: předmět je „hotový", když je zařazený. */
export function placedIn(placements: Placements): IsDone {
  return (subjectId) => Boolean(placementOf(placements, subjectId));
}

/** Text u zařazeného předmětu, např. „2. r. / LS". */
export function placedAtText(placement: Placement): string {
  return `${placement.year}. r. / ${semesterTagText(placement.semester)}`;
}

/**
 * Odebere zařazení předmětů, které v plánu nejsou (starý úklid v `renderSchedule`).
 * Když není co odebrat, vrací tentýž objekt.
 */
export function prunePlacements(
  placements: Placements,
  plan: StudyPlan,
): Placements {
  const valid = planSubjectsById(plan);
  const entries = Object.entries(placements);
  const kept = entries.filter(([id]) => valid.has(id));
  return kept.length === entries.length ? placements : Object.fromEntries(kept);
}

/** Jeden ročník v pravém sloupci Rozvrhu. */
export interface YearBlock {
  /** Ročník, 1 = první. */
  year: number;
  /** Nadpis ročníku, např. „1. ročník". */
  title: string;
  /** Předměty zařazené do ročníku, v pořadí zařazení. */
  subjects: readonly SubjectNode[];
  /** Součet kreditů ročníku (každý zařazený předmět jednou, i celoroční). */
  credits: number;
  /** Text v nadpisu ročníku, např. „23 kr.". */
  creditsText: string;
  /** Předměty zařazené do zimního semestru. */
  winter: readonly SubjectNode[];
  /** Předměty zařazené do letního semestru. */
  summer: readonly SubjectNode[];
  /** Zobrazit tlačítko „Reset" ročníku (ročník není prázdný). */
  canReset: boolean;
}

/**
 * Ročníky 1..`yearsCount` s předměty podle semestru, do kterého byly skutečně
 * zařazeny (`placements[id].semester`, ne `subj.semester`). Počítají se jen předměty
 * plánu; zařazení do ročníku nad `yearsCount` se nezobrazí (v souhrnu se ale počítá).
 */
export function yearBlocks(
  plan: StudyPlan,
  placements: Placements,
  yearsCount: number,
): YearBlock[] {
  const planSubjects = planSubjectsById(plan);
  const entries = Object.entries(placements);
  const blocks: YearBlock[] = [];

  for (let year = 1; year <= yearsCount; year++) {
    const placed: { subject: SubjectNode; placement: Placement }[] = [];
    for (const [id, placement] of entries) {
      const subject = planSubjects.get(id);
      if (placement.year === year && subject) {
        placed.push({ subject, placement });
      }
    }
    const subjects = placed.map((item) => item.subject);
    const inSemester = (semester: PlacementSemester) =>
      placed
        .filter((item) => item.placement.semester === semester)
        .map((item) => item.subject);
    const credits = sumCredits(subjects);
    blocks.push({
      year,
      title: `${year}. ročník`,
      subjects,
      credits,
      creditsText: `${credits} kr.`,
      winter: inSemester("zimní"),
      summer: inSemester("letní"),
      canReset: subjects.length > 0,
    });
  }

  return blocks;
}

/**
 * Souhrn plnění v Rozvrhu: stejný výpočet jako v Kalkulačce ({@link planSummary}), ale
 * „získané" jsou kredity ZAŘAZENÝCH předmětů. „Bez kreditů" se bere z `noCredit`.
 */
export function scheduleSummary(
  plan: StudyPlan,
  placements: Placements,
  noCredit: ReadonlySet<string>,
): PlanSummary {
  return planSummary(plan, placedIn(placements), noCredit);
}

// ---------------------------------------------------------------------------
// Stav a jeho přechody
// ---------------------------------------------------------------------------

/**
 * Postup uživatele v jedné specializaci a roce. Přechody stav nemění, vracejí nový.
 *
 * Co stará stránka po přechodu zapisovala do localStorage, říká {@link stateChanges}:
 * přechod, po kterém starý kód volal `saveState`, vrací nové množiny `completed` a
 * `noCredit`; přechod, po kterém volal `saveSchedState`, vrací nový objekt `placements`.
 */
export interface CalculatorState {
  /** Id splněných předmětů. */
  completed: ReadonlySet<string>;
  /** Id předmětů „bez kreditů". */
  noCredit: ReadonlySet<string>;
  /** Zařazení do rozvrhu. */
  placements: Placements;
  /** Počet ročníků; `null` = ještě neurčen (doplní {@link normalizeState}). */
  yearsCount: number | null;
}

/** Prázdný postup (po výběru specializace bez uloženého rozvrhu). */
export function emptyState(): CalculatorState {
  return {
    completed: new Set(),
    noCredit: new Set(),
    placements: {},
    yearsCount: null,
  };
}

/**
 * Co se přechodem změnilo z pohledu ukládání: `progress` = starý kód volal
 * `saveState` (klíče `mff_completed`, `mff_nocredit`, …), `schedule` = volal
 * `saveSchedState` (klíče `mff_sched_*`). Porovnává identitu objektů, proto ho volej
 * se stavem před přechodem a s jeho výsledkem (před {@link normalizeState}).
 */
export function stateChanges(
  previous: CalculatorState,
  next: CalculatorState,
): { progress: boolean; schedule: boolean } {
  return {
    progress:
      previous.completed !== next.completed ||
      previous.noCredit !== next.noCredit,
    schedule:
      previous.placements !== next.placements ||
      previous.yearsCount !== next.yearsCount,
  };
}

/**
 * Úprava stavu, kterou stará stránka dělala při každém vykreslení Rozvrhu: doplní
 * počet ročníků podle stupně studia a zahodí zařazení předmětů mimo plán. Sama nic
 * neukládá – upravený stav se zapíše až s příštím uložením rozvrhu. Když není co
 * upravit, vrací tentýž objekt.
 */
export function normalizeState(
  state: CalculatorState,
  plan: StudyPlan,
  degree: string | null | undefined,
): CalculatorState {
  const yearsCount = resolveYearsCount(state.yearsCount, degree);
  const placements = prunePlacements(state.placements, plan);
  if (yearsCount === state.yearsCount && placements === state.placements) {
    return state;
  }
  return { ...state, yearsCount, placements };
}

function withAdded(ids: ReadonlySet<string>, id: string): Set<string> {
  return new Set(ids).add(id);
}

function withoutIds(
  ids: ReadonlySet<string>,
  removed: Iterable<string>,
): Set<string> {
  const copy = new Set(ids);
  for (const id of removed) copy.delete(id);
  return copy;
}

/** Zařazení bez daných předmětů; když žádný zařazený nebyl, vrací tentýž objekt. */
function withoutPlacements(
  placements: Placements,
  removed: readonly string[],
): Placements {
  if (!removed.some((id) => placementOf(placements, id))) return placements;
  const drop = new Set(removed);
  return Object.fromEntries(
    Object.entries(placements).filter(([id]) => !drop.has(id)),
  );
}

/**
 * Zaškrtnutí / odškrtnutí předmětu v Kalkulačce (starý `toggleDone`): odškrtnutí ho
 * zároveň odebere z rozvrhu, zaškrtnutí zruší „bez kreditů".
 */
export function toggleDone(
  state: CalculatorState,
  id: string,
): CalculatorState {
  if (state.completed.has(id)) {
    return {
      ...state,
      completed: withoutIds(state.completed, [id]),
      placements: withoutPlacements(state.placements, [id]),
    };
  }
  return {
    ...state,
    completed: withAdded(state.completed, id),
    noCredit: withoutIds(state.noCredit, [id]),
  };
}

/**
 * Přepnutí „bez kreditů" (starý `toggleNoCredit`): zapnutí zruší „splněno" a odebere
 * předmět z rozvrhu.
 */
export function toggleNoCredit(
  state: CalculatorState,
  id: string,
): CalculatorState {
  if (state.noCredit.has(id)) {
    return { ...state, noCredit: withoutIds(state.noCredit, [id]) };
  }
  return {
    ...state,
    noCredit: withAdded(state.noCredit, id),
    completed: withoutIds(state.completed, [id]),
    placements: withoutPlacements(state.placements, [id]),
  };
}

/** „splnit vše": označí všechny povinné předměty jako splněné a zruší u nich „bez kreditů". */
export function completeAllMandatory(
  state: CalculatorState,
  plan: StudyPlan,
): CalculatorState {
  const ids = plan.mandatory.map((subject) => subject.id);
  const completed = new Set(state.completed);
  for (const id of ids) completed.add(id);
  return { ...state, completed, noCredit: withoutIds(state.noCredit, ids) };
}

/**
 * „Reset kategorie" v Kalkulačce (starý `resetCategory`): u předmětů kategorie zruší
 * „splněno" i „bez kreditů" a odebere je z rozvrhu.
 */
export function resetCategory(
  state: CalculatorState,
  ids: readonly string[],
): CalculatorState {
  return {
    ...state,
    completed: withoutIds(state.completed, ids),
    noCredit: withoutIds(state.noCredit, ids),
    placements: withoutPlacements(state.placements, ids),
  };
}

/**
 * „Reset celkový (zrušit vše splněné)" (starý `resetAllProgress`): vyprázdní splněné,
 * „bez kreditů" i rozvrh; počet ročníků zůstává.
 */
export function resetAllProgress(state: CalculatorState): CalculatorState {
  return {
    completed: new Set(),
    noCredit: new Set(),
    placements: {},
    yearsCount: state.yearsCount,
  };
}

/**
 * Změna počtu ročníků o `delta` (starý `changeYears`): výsledek se ořízne do
 * 1–8 a zařazení do ročníků nad novým počtem se zahodí (předměty zůstávají splněné).
 */
export function changeYears(
  state: CalculatorState,
  delta: number,
): CalculatorState {
  const yearsCount = Math.max(
    MIN_YEARS,
    Math.min(MAX_YEARS, (state.yearsCount || 1) + delta),
  );
  const placements = Object.fromEntries(
    Object.entries(state.placements).filter(
      ([, placement]) => !(placement.year > yearsCount),
    ),
  );
  return { ...state, yearsCount, placements };
}

/**
 * Zařazení předmětu do ročníku a semestru (starý `placeSubject`). Neznámý předmět
 * (`undefined`) nebo předmět s jiným pevným semestrem se ignoruje (vrací tentýž
 * stav). Jinak se předmět zařadí (případně přesune), označí jako splněný a zruší se
 * u něj „bez kreditů".
 *
 * `subject` je předmět z celých dat roku (starý `byId[id]`), ne jen z plánu – předmět
 * mimo plán se zařadí a hned ho zase odebere {@link normalizeState}, splněný ale zůstane.
 */
export function placeSubject(
  state: CalculatorState,
  subject: Pick<SubjectNode, "id" | "semester"> | null | undefined,
  year: number,
  semester: PlacementSemester,
): CalculatorState {
  if (!subject || !canPlace(subject, semester)) return state;
  return {
    ...state,
    placements: { ...state.placements, [subject.id]: { year, semester } },
    completed: withAdded(state.completed, subject.id),
    noCredit: withoutIds(state.noCredit, [subject.id]),
  };
}

/**
 * Odebrání předmětu z rozvrhu (starý `unplaceFromSchedule`): zruší zařazení i
 * „splněno"; „bez kreditů" nemění.
 */
export function unplaceFromSchedule(
  state: CalculatorState,
  id: string,
): CalculatorState {
  return resetScheduleCategory(state, [id]);
}

/**
 * „Reset" ročníku (starý `resetYear`): odebere z rozvrhu všechny předměty daného
 * ročníku a zruší u nich „splněno". Prázdný ročník = žádná změna (tentýž stav).
 */
export function resetYear(
  state: CalculatorState,
  year: number,
): CalculatorState {
  const ids = Object.entries(state.placements)
    .filter(([, placement]) => placement.year === year)
    .map(([id]) => id);
  return ids.length === 0 ? state : resetScheduleCategory(state, ids);
}

/**
 * „Reset celkový (vyprázdnit celý rozvrh)" (starý `resetAllSchedule`): odebere vše
 * z rozvrhu a zruší u těch předmětů „splněno". Prázdný rozvrh = žádná změna.
 */
export function resetAllSchedule(state: CalculatorState): CalculatorState {
  const ids = Object.keys(state.placements);
  return ids.length === 0 ? state : resetScheduleCategory(state, ids);
}

/**
 * „Reset kategorie" v Rozvrhu (starý `resetSchedCategory`): u předmětů kategorie
 * zruší zařazení i „splněno" – i u těch, které zařazené nebyly; „bez kreditů" nemění.
 */
export function resetScheduleCategory(
  state: CalculatorState,
  ids: readonly string[],
): CalculatorState {
  const drop = new Set(ids);
  return {
    ...state,
    placements: Object.fromEntries(
      Object.entries(state.placements).filter(([id]) => !drop.has(id)),
    ),
    completed: withoutIds(state.completed, ids),
    noCredit: new Set(state.noCredit),
  };
}
