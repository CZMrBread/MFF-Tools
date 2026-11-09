import type { MouseEvent } from "react";
import { creditsBadgeText } from "../lib/credits";
import type { CategoryView } from "../lib/credits";
import { placedAtText, placementOf, semesterTagText } from "../lib/schedule";
import type { SubjectNode } from "../lib/types";
import cat from "./Category.module.css";
import { useDragSource } from "./useDragSource";
import { cx, usePlanner } from "./plannerContext";
import { NO_CREDIT_TITLE } from "./texts";
import ui from "./ui.module.css";

/** Kde se blok kategorie vykresluje: Kalkulačka, nebo levý sloupec Rozvrhu. */
export type CategoryMode = "calculator" | "schedule";

/**
 * Blok kategorie (starý `catBlock` / `schedCatBlock`): nadpis se štítkem, „Reset
 * kategorie", podtitulek a seznam předmětů.
 */
export function CategoryBlock({
  view,
  mode,
}: {
  view: CategoryView;
  mode: CategoryMode;
}) {
  const { actions } = usePlanner();
  const ids = view.subjects.map((subject) => subject.id);
  const badgeClass = cx(ui.pill, ui[view.badge.tone]);
  // Štítek „splnit vše" je klikací jen v Kalkulačce.
  const badge =
    mode === "calculator" && view.canCompleteAll ? (
      <span
        className={cx(badgeClass, ui.pillBtn)}
        onClick={actions.completeAllMandatory}
      >
        {view.badge.text}
      </span>
    ) : (
      <span className={badgeClass}>{view.badge.text}</span>
    );

  return (
    <div className={cat.cat}>
      <div className={cat.catHead}>
        <h3>
          {view.title} {badge}
        </h3>
        <button
          type="button"
          className={cx(ui.btn, ui.ghost, ui.small, cat.catReset)}
          onClick={() =>
            mode === "calculator"
              ? actions.resetCategory(ids)
              : actions.resetScheduleCategory(ids)
          }
        >
          Reset kategorie
        </button>
      </div>
      <div className={cat.sub}>{view.subtitle}</div>
      <div className={cat.subjectList}>
        {view.subjects.length === 0 ? (
          <p style={{ color: "#999" }}>Žádné předměty.</p>
        ) : (
          view.subjects.map((subject) =>
            mode === "calculator" ? (
              <CalculatorSubjectRow
                key={subject.id}
                subject={subject}
                allowNoCredit={view.allowNoCredit}
              />
            ) : (
              <ScheduleSubjectRow
                key={subject.id}
                subject={subject}
                allowNoCredit={view.allowNoCredit}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}

/**
 * Přepínač „bez kreditů" (starý `ncWrap`). Klik na obal ani na text nesmí přepnout
 * hlavní zaškrtávátko řádku (preventDefault zruší aktivaci `<label>`).
 */
function NoCreditToggle({ subject }: { subject: SubjectNode }) {
  const { state, actions } = usePlanner();
  const toggle = () => actions.toggleNoCredit(subject.id);
  return (
    <span
      className={cat.ncToggle}
      title={NO_CREDIT_TITLE}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!(event.target instanceof HTMLInputElement)) toggle();
      }}
    >
      <input
        type="checkbox"
        checked={state.noCredit.has(subject.id)}
        onClick={(event) => event.stopPropagation()}
        onChange={toggle}
      />
      <span>bez kreditů</span>
    </span>
  );
}

/** Řádek předmětu v Kalkulačce (starý `subjectRow`). */
function CalculatorSubjectRow({
  subject,
  allowNoCredit,
}: {
  subject: SubjectNode;
  allowNoCredit: boolean;
}) {
  const { state, actions } = usePlanner();
  const done = state.completed.has(subject.id);
  const noCredit = state.noCredit.has(subject.id);
  return (
    <label
      className={cx(
        cat.subjectItem,
        done && cat.done,
        noCredit && cat.nocredit,
      )}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={() => actions.toggleDone(subject.id)}
      />
      <span className={cat.name}>{subject.label}</span>
      {allowNoCredit && <NoCreditToggle subject={subject} />}
      <span className={cat.creditsBadge}>{creditsBadgeText(subject)}</span>
    </label>
  );
}

/**
 * Řádek předmětu v Rozvrhu (starý `schedSubjectRow`): vzhled jako v Kalkulačce, ale
 * „hotový" = zařazený; zaškrtávátko předmět rychle zařadí (1. ročník) nebo odebere,
 * řádek jde přetáhnout a štítek semestru / zařazení otevře výběr ročníku.
 */
function ScheduleSubjectRow({
  subject,
  allowNoCredit,
}: {
  subject: SubjectNode;
  allowNoCredit: boolean;
}) {
  const { state, actions } = usePlanner();
  const dragSource = useDragSource(subject.id, cat.dragging);
  const placement = placementOf(state.placements, subject.id);
  const noCredit = state.noCredit.has(subject.id);
  const openPicker = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    actions.openPicker(subject.id);
  };

  return (
    <label
      className={cx(
        cat.subjectItem,
        placement && cat.done,
        noCredit && cat.nocredit,
      )}
      data-subject-id={subject.id}
      {...dragSource}
    >
      <input
        type="checkbox"
        checked={Boolean(placement)}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          if (event.target.checked) actions.quickPlace(subject);
          else actions.unplace(subject.id);
        }}
      />
      <span className={cat.name}>{subject.label}</span>
      {allowNoCredit && <NoCreditToggle subject={subject} />}
      {placement ? (
        <span
          className={cat.placedAt}
          title="Klikni pro změnu ročníku/semestru"
          onClick={openPicker}
        >
          {placedAtText(placement)}
        </span>
      ) : (
        <span
          className={cat.semTag}
          title="Klikni pro zařazení do ročníku/semestru"
          onClick={openPicker}
        >
          {semesterTagText(subject.semester)}
        </span>
      )}
      <span className={cat.creditsBadge}>{creditsBadgeText(subject)}</span>
    </label>
  );
}
