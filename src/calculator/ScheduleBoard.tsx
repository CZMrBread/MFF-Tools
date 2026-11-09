import { useState } from "react";
import type { DragEvent } from "react";
import { creditsBadgeText } from "../lib/credits";
import type { StudyPlan } from "../lib/credits";
import {
  isDropAllowed,
  semesterSlotLabel,
  yearBlocks,
  yearsStepper,
} from "../lib/schedule";
import type { PlacementSemester, SubjectNode } from "../lib/types";
import cat from "./Category.module.css";
import { cx, usePlanner } from "./plannerContext";
import sch from "./Schedule.module.css";
import ui from "./ui.module.css";
import { useDragSource } from "./useDragSource";

/** Přepínač počtu ročníků (−, počet, +). */
export function YearsStepper({
  yearsCount,
  onChange,
}: {
  yearsCount: number;
  onChange: (delta: number) => void;
}) {
  const { canDecrease, canIncrease } = yearsStepper(yearsCount);
  return (
    <div className={sch.yearsStepper}>
      <span className={ui.secTitle}>Počet</span>
      <button
        type="button"
        onClick={() => onChange(-1)}
        id="years-minus"
        disabled={!canDecrease}
      >
        −
      </button>
      <span className={sch.count} id="years-count">
        {yearsCount}
      </span>
      <button
        type="button"
        onClick={() => onChange(1)}
        id="years-plus"
        disabled={!canIncrease}
      >
        +
      </button>
    </div>
  );
}

/** Ročníky se semestry (starý `renderYearBlocks`). */
export function YearBlocks({
  plan,
  yearsCount,
  onResetYear,
}: {
  plan: StudyPlan;
  yearsCount: number;
  onResetYear: (year: number) => void;
}) {
  const { state } = usePlanner();
  return (
    <div>
      {yearBlocks(plan, state.placements, yearsCount).map((block) => (
        <div key={block.year} className={sch.yearBlock}>
          <h3>
            <span className={sch.yearBlockTitle}>
              {block.title}{" "}
              <span className={sch.yearCredits}>{block.creditsText}</span>
            </span>
            {block.canReset && (
              <button
                type="button"
                className={sch.yearResetBtn}
                title={`Vyprázdnit ${block.year}. ročník`}
                onClick={() => onResetYear(block.year)}
              >
                Reset
              </button>
            )}
          </h3>
          <div className={sch.semestersRow}>
            <SemesterSlot
              year={block.year}
              semester="zimní"
              items={block.winter}
            />
            <SemesterSlot
              year={block.year}
              semester="letní"
              items={block.summer}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

type Highlight = "over" | "denied" | null;

/** Semestr v ročníku – cíl přetahování (starý `semesterSlot` + `attachSlotDropTarget`). */
function SemesterSlot({
  year,
  semester,
  items,
}: {
  year: number;
  semester: PlacementSemester;
  items: readonly SubjectNode[];
}) {
  const { actions } = usePlanner();
  const [highlight, setHighlight] = useState<Highlight>(null);

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const allowed = isDropAllowed(
      actions.subjectById(actions.draggedId()),
      semester,
    );
    setHighlight(allowed ? "over" : "denied");
    event.dataTransfer.dropEffect = allowed ? "move" : "none";
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setHighlight(null);
    const id = event.dataTransfer.getData("text/plain") || actions.draggedId();
    if (id) actions.place(id, year, semester);
  };

  return (
    <div
      className={cx(
        sch.semesterSlot,
        highlight === "over" && sch.dragOver,
        highlight === "denied" && sch.dragDenied,
      )}
      data-year={year}
      data-semester={semester}
      onDragOver={onDragOver}
      onDragLeave={() => setHighlight(null)}
      onDrop={onDrop}
    >
      <span className={sch.slotLabel}>{semesterSlotLabel(semester)}</span>
      <div className={sch.slotItems}>
        {items.length === 0 ? (
          <div className={sch.emptyMsg}>Přetáhni sem předmět</div>
        ) : (
          items.map((subject) => (
            <ScheduledItem key={subject.id} subject={subject} />
          ))
        )}
      </div>
    </div>
  );
}

/** Zařazený předmět v semestru (starý `scheduledItem`). */
function ScheduledItem({ subject }: { subject: SubjectNode }) {
  const { actions } = usePlanner();
  const dragSource = useDragSource(subject.id, sch.dragging);
  return (
    <div
      className={sch.schedItem}
      data-subject-id={subject.id}
      {...dragSource}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button"))
          return;
        actions.openPicker(subject.id);
      }}
    >
      <span className={sch.name}>{subject.label}</span>
      <span className={cx(cat.creditsBadge, sch.badge)}>
        {creditsBadgeText(subject)}
      </span>
      <button
        type="button"
        className={sch.removeBtn}
        title="Odebrat z rozvrhu"
        onClick={(event) => {
          event.stopPropagation();
          actions.unplace(subject.id);
        }}
      >
        ✕
      </button>
    </div>
  );
}
