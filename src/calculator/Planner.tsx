import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  NO_PDF_PLAN_NOTE,
  degreeHeading,
  doneIn,
  planCategories,
  planFor,
  planSummary,
  specsForDegree,
} from "../lib/credits";
import type { StudyPlan } from "../lib/credits";
import type { StudyData } from "../lib/data";
import * as transitions from "../lib/schedule";
import type { CalculatorState } from "../lib/schedule";
import {
  clearSelection,
  loadProgress,
  loadSchedule,
  saveProgress,
  saveSchedule,
} from "../lib/storage";
import type { KeyValueStorage } from "../lib/storage";
import type { PlacementSemester, StudyType, SubjectNode } from "../lib/types";
import cat from "./Category.module.css";
import { CategoryBlock } from "./CategoryBlock";
import page from "./CalculatorPage.module.css";
import { PlannerContext, cx, usePlanner } from "./plannerContext";
import type { PlannerActions, PlannerContextValue } from "./plannerContext";
import { YearBlocks, YearsStepper } from "./ScheduleBoard";
import sch from "./Schedule.module.css";
import { SummaryPanel } from "./SummaryPanel";
import { CHANGE_SPEC_CONFIRM } from "./texts";
import ui from "./ui.module.css";
import { YearPicker } from "./YearPicker";

/** Záložka po výběru specializace. */
export type Tab = "calc" | "sched";

/** Krok průvodce: 1 = stupeň studia, 2 = specializace, jinak dashboard. */
type Step = 1 | 2 | "dashboard";

interface Selection {
  step: Step;
  /** Starý `currentDegree`. */
  degree: StudyType | null;
  /** Starý `currentSpec`. */
  spec: string | null;
}

interface PlannerModel extends Selection {
  calc: CalculatorState;
}

/**
 * Stav po načtení stránky (starý `init` po načtení dat): postup roku a oboru se
 * načte vždy; je-li uložená specializace, ke které existují požadavky, otevře se
 * rovnou dashboard s jejím rozvrhem, jinak krok 1.
 */
function initialModel(data: StudyData, storage: KeyValueStorage): PlannerModel {
  const progress = loadProgress(storage, data.year, data.field);
  const calc: CalculatorState = {
    completed: new Set(progress.completed),
    noCredit: new Set(progress.noCredit),
    placements: {},
    yearsCount: null,
  };
  const plan = progress.spec ? planFor(data.index, progress.spec) : null;
  if (progress.spec && plan) {
    const degree = transitions.effectiveDegree(
      progress.degree,
      data.index.specById.get(progress.spec),
    );
    const schedule = loadSchedule(
      storage,
      data.year,
      data.field,
      progress.spec,
    );
    return {
      step: "dashboard",
      degree,
      spec: progress.spec,
      calc: transitions.normalizeState({ ...calc, ...schedule }, plan, degree),
    };
  }
  return { step: 1, degree: progress.degree, spec: null, calc };
}

/** Krok 1 průvodce – výběr stupně studia. */
export function DegreeStep({
  onSelect,
}: {
  onSelect: (degree: StudyType) => void;
}) {
  return (
    <div className={cx(page.step, page.active)}>
      <h2>Zvol stupeň studia</h2>
      <p>
        Bakalářské a magisterské studium mají odlišné specializace i požadavky
        na kredity.
      </p>
      <div className={page.btnGrid}>
        <button className={ui.btn} onClick={() => onSelect("bakalarske")}>
          Bakalářské studium
        </button>
        <button
          className={cx(ui.btn, ui.alt)}
          onClick={() => onSelect("magisterske")}
        >
          Magisterské studium
        </button>
      </div>
    </div>
  );
}

/**
 * Kalkulačka a Rozvrh pro jeden akademický rok a obor (`data`). Stav se při
 * připojení načte z úložiště a každá změna se hned uloží pod klíči staré stránky.
 * Při změně roku či oboru se komponenta připojí znovu (`key`), takže se stav jiné
 * kombinace nikdy nepromíchá.
 */
export function Planner({
  data,
  storage,
  onTabSwitch,
}: {
  data: StudyData;
  storage: KeyValueStorage;
  /** Zavolá se při každém přepnutí záložky (stará stránka mění text návodu). */
  onTabSwitch: (tab: Tab) => void;
}) {
  const [initial] = useState(() => initialModel(data, storage));
  const [selection, setSelection] = useState<Selection>(() => ({
    step: initial.step,
    degree: initial.degree,
    spec: initial.spec,
  }));
  const [calc, setCalc] = useState<CalculatorState>(initial.calc);
  const [tab, setTab] = useState<Tab>("calc");
  const [pickerId, setPickerId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const { year, field, index } = data;
  const { spec, degree, step } = selection;
  const plan = useMemo(
    () => (spec ? planFor(index, spec) : null),
    [index, spec],
  );

  /**
   * Provede přechod stavu a uloží, co by uložila stará stránka: `mff_sched_*` když
   * se změnil rozvrh, `mff_spec`/`mff_degree`/`mff_completed`/`mff_nocredit` když se
   * změnilo splněné či „bez kreditů". Vykresluje se stav po `normalizeState`
   * (úklid starého `renderSchedule`), který se sám neukládá.
   */
  const commit = (transition: (state: CalculatorState) => CalculatorState) => {
    const next = transition(calc);
    if (next === calc) return;
    const changes = transitions.stateChanges(calc, next);
    if (changes.schedule) {
      saveSchedule(storage, year, field, spec, {
        placements: next.placements,
        yearsCount: next.yearsCount,
      });
    }
    if (changes.progress) {
      saveProgress(storage, year, field, {
        spec,
        degree,
        completed: next.completed,
        noCredit: next.noCredit,
      });
    }
    setCalc(plan ? transitions.normalizeState(next, plan, degree) : next);
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    onTabSwitch(next);
  };

  const selectDegree = (next: StudyType) => {
    setSelection({ ...selection, degree: next, step: 2 });
  };

  /** Starý `selectSpec`: uloží výběr, načte rozvrh specializace, otevře Kalkulačku. */
  const selectSpec = (id: string) => {
    saveProgress(storage, year, field, {
      spec: id,
      degree,
      completed: calc.completed,
      noCredit: calc.noCredit,
    });
    const schedule = loadSchedule(storage, year, field, id);
    const nextPlan = planFor(index, id);
    const nextDegree = transitions.effectiveDegree(
      degree,
      index.specById.get(id),
    );
    const loaded = { ...calc, ...schedule };
    setSelection({ step: "dashboard", degree: nextDegree, spec: id });
    setCalc(
      nextPlan
        ? transitions.normalizeState(loaded, nextPlan, nextDegree)
        : loaded,
    );
    switchTab("calc");
  };

  /** „Změnit obor" (starý `resetProgress`). */
  const resetProgress = () => {
    if (!window.confirm(CHANGE_SPEC_CONFIRM)) return;
    clearSelection(storage, year, field, spec);
    setSelection({ step: 1, degree: null, spec: null });
    setCalc(transitions.emptyState());
    setPickerId(null);
  };

  const subjectById = (id: string | null): SubjectNode | undefined =>
    id === null ? undefined : index.subjectById.get(id);

  const place = (id: string, placeYear: number, semester: PlacementSemester) =>
    commit((state) =>
      transitions.placeSubject(state, subjectById(id), placeYear, semester),
    );

  const actions: PlannerActions = {
    toggleDone: (id) => commit((state) => transitions.toggleDone(state, id)),
    toggleNoCredit: (id) =>
      commit((state) => transitions.toggleNoCredit(state, id)),
    completeAllMandatory: () => {
      if (plan) {
        commit((state) => transitions.completeAllMandatory(state, plan));
      }
    },
    resetCategory: (ids) =>
      commit((state) => transitions.resetCategory(state, ids)),
    resetScheduleCategory: (ids) =>
      commit((state) => transitions.resetScheduleCategory(state, ids)),
    place,
    quickPlace: (subject) =>
      place(subject.id, 1, transitions.quickPlacementSemester(subject)),
    unplace: (id) =>
      commit((state) => transitions.unplaceFromSchedule(state, id)),
    openPicker: (id) => {
      if (subjectById(id)) setPickerId(id);
    },
    dragStart: (id) => {
      dragId.current = id;
    },
    dragEnd: () => {
      dragId.current = null;
    },
    draggedId: () => dragId.current,
    subjectById,
  };
  const context: PlannerContextValue = { state: calc, actions };

  const pickerSubject = subjectById(pickerId);
  const yearsCount = transitions.resolveYearsCount(calc.yearsCount, degree);

  return (
    <PlannerContext.Provider value={context}>
      <div className={page.container}>
        {step === 1 && <DegreeStep onSelect={selectDegree} />}
        {step === 2 && (
          <div className={cx(page.step, page.active)}>
            <h2>Jakou máš specializaci?</h2>
            <div className={page.btnGrid}>
              {specsForDegree(index.specs, degree ?? "").map((item) => (
                <button
                  key={item.id}
                  className={cx(ui.btn, degree === "magisterske" && ui.alt)}
                  onClick={() => selectSpec(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              className={cx(ui.btn, ui.ghost, ui.small)}
              style={{ marginTop: "var(--_spacing---40-px)" }}
              onClick={() => setSelection({ ...selection, step: 1 })}
            >
              ← Zpět na výběr studia
            </button>
          </div>
        )}
      </div>

      {step === "dashboard" && plan && spec && (
        <div className={page.appTabsWrap}>
          <div className={page.container}>
            <div className={page.tabbar}>
              <button
                className={cx(page.tabBtn, tab === "calc" && page.active)}
                onClick={() => switchTab("calc")}
              >
                Kalkulačka
              </button>
              <button
                className={cx(page.tabBtn, tab === "sched" && page.active)}
                onClick={() => switchTab("sched")}
              >
                Rozvrh
              </button>
            </div>
          </div>

          <div className={page.container}>
            {tab === "calc" && (
              <CalculatorDashboard
                plan={plan}
                heading={degreeHeading(plan, field)}
                title={index.specById.get(spec)?.label ?? spec}
                onChangeSpec={resetProgress}
                onResetAll={() => commit(transitions.resetAllProgress)}
              />
            )}
          </div>

          {tab === "sched" && (
            <ScheduleDashboard
              plan={plan}
              heading={degreeHeading(plan, field)}
              title={index.specById.get(spec)?.label ?? spec}
              yearsCount={yearsCount}
              onChangeSpec={resetProgress}
              onChangeYears={(delta) =>
                commit((state) => transitions.changeYears(state, delta))
              }
              onResetYear={(resetYear) =>
                commit((state) => transitions.resetYear(state, resetYear))
              }
              onResetAll={() => commit(transitions.resetAllSchedule)}
            />
          )}
        </div>
      )}

      {pickerSubject && (
        <YearPicker
          subject={pickerSubject}
          yearsCount={yearsCount}
          onClose={() => setPickerId(null)}
        />
      )}
    </PlannerContext.Provider>
  );
}

/** Hlavička panelu se stupněm studia, názvem specializace a „Změnit obor". */
function PanelHeader({
  heading,
  title,
  onChangeSpec,
  style,
}: {
  heading: string;
  title: string;
  onChangeSpec: () => void;
  style?: { marginBottom: string };
}) {
  return (
    <div className={ui.header} style={style}>
      <div>
        <div className={ui.secTitle}>{heading}</div>
        <h2>{title}</h2>
      </div>
      <button className={cx(ui.btn, ui.alt, ui.small)} onClick={onChangeSpec}>
        Změnit obor
      </button>
    </div>
  );
}

interface DashboardProps {
  plan: StudyPlan;
  heading: string;
  title: string;
  onChangeSpec: () => void;
  onResetAll: () => void;
}

/** Záložka Kalkulačka (starý `#dashboard`: `renderDashboard` + `renderSummary`). */
function CalculatorDashboard({
  plan,
  heading,
  title,
  onChangeSpec,
  onResetAll,
}: DashboardProps) {
  const { completed, noCredit } = usePlanner().state;
  const summary = planSummary(plan, doneIn(completed), noCredit);
  return (
    <div className={page.dashboard} style={{ display: "grid" }}>
      <div className={ui.panel}>
        <PanelHeader
          heading={heading}
          title={title}
          onChangeSpec={onChangeSpec}
        />
        <div>
          {planCategories(plan, completed, noCredit).map((view) => (
            <CategoryBlock key={view.key} view={view} mode="calculator" />
          ))}
          {plan.req.no_pdf_plan && (
            <p className={cat.sub} style={{ color: "#b08900" }}>
              {NO_PDF_PLAN_NOTE}
            </p>
          )}
        </div>
      </div>

      <SummaryPanel
        summary={summary}
        context="calculator"
        className={cx(ui.panel, ui.summary)}
        resetLabel="Reset celkový (zrušit vše splněné)"
        onReset={onResetAll}
        note={CALCULATOR_NOTE}
      />
    </div>
  );
}

const CALCULATOR_NOTE: ReactNode = (
  <>
    Limity vycházejí ze studijních plánů (Karolinka). „Volitelné“ doplníš
    libovolnými předměty do celkového počtu kreditů. U magisterských povinně
    volitelných můžeš předmět označit <b>„bez kreditů“</b> — sníží požadované
    minimum kategorie, ale nepočítá se do získaných kreditů. Postup se ukládá do
    prohlížeče.
  </>
);

/** Záložka Rozvrh (starý `#sched-dashboard`: `renderSchedule`). */
function ScheduleDashboard({
  plan,
  heading,
  title,
  yearsCount,
  onChangeSpec,
  onChangeYears,
  onResetYear,
  onResetAll,
}: DashboardProps & {
  yearsCount: number;
  onChangeYears: (delta: number) => void;
  onResetYear: (year: number) => void;
}) {
  const { completed, noCredit, placements } = usePlanner().state;
  const summary = transitions.scheduleSummary(plan, placements, noCredit);
  return (
    <div className={page.containerFluid} style={{ display: "block" }}>
      <PanelHeader
        heading={heading}
        title={title}
        onChangeSpec={onChangeSpec}
        style={{ marginBottom: "var(--_spacing---20-px)" }}
      />

      <p className={page.schedNote}>
        Přetáhni (na počítači) nebo klepni (na mobilu) na předmět a zařaď ho do
        ročníku a semestru. Zařazení předmětu ho zároveň označí jako splněný v
        Kalkulačce. Předmět „oba“ (celoroční) se počítá jen jednou, i když je
        vidět v obou semestrech.
      </p>

      <div className={sch.schedColumns}>
        <div className={cx(sch.schedColCategories, ui.panel)}>
          <div className={sch.schedColTitle}>Předměty dle kategorií</div>
          <div>
            {planCategories(plan, completed, noCredit).map((view) => (
              <CategoryBlock key={view.key} view={view} mode="schedule" />
            ))}
          </div>
        </div>
        <div className={cx(sch.schedColYears, ui.panel)}>
          <div className={sch.schedColYearsHead}>
            <div className={sch.schedColTitle} style={{ marginBottom: 0 }}>
              Ročníky
            </div>
            <YearsStepper yearsCount={yearsCount} onChange={onChangeYears} />
          </div>
          <YearBlocks
            plan={plan}
            yearsCount={yearsCount}
            onResetYear={onResetYear}
          />
        </div>
        <SummaryPanel
          summary={summary}
          context="schedule"
          className={cx(sch.schedColSummary, ui.panel, ui.summary)}
          resetLabel="Reset celkový (vyprázdnit celý rozvrh)"
          onReset={onResetAll}
          note={SCHEDULE_NOTE}
        />
      </div>
    </div>
  );
}

const SCHEDULE_NOTE =
  "Zařazení předmětu do ročníku a semestru ho zároveň označí jako splněný v Kalkulačce. Postup se ukládá do prohlížeče.";
