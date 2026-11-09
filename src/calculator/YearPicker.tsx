import { createPortal } from "react-dom";
import { placementOf, placementOptions } from "../lib/schedule";
import type { SubjectNode } from "../lib/types";
import { cx, usePlanner } from "./plannerContext";
import sch from "./Schedule.module.css";
import ui from "./ui.module.css";

/**
 * Výběr ročníku a semestru klepnutím (starý `openYearPicker`) – vysouvací panel
 * vložený do `<body>`. Klik mimo panel, „Zrušit" i výběr ho zavřou.
 */
export function YearPicker({
  subject,
  yearsCount,
  onClose,
}: {
  subject: SubjectNode;
  yearsCount: number;
  onClose: () => void;
}) {
  const { state, actions } = usePlanner();
  const placed = Boolean(placementOf(state.placements, subject.id));

  return createPortal(
    <div
      className={sch.yearPickerBackdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={sch.yearPicker}>
        <h4>{subject.label}</h4>
        <div className={sch.optList}>
          {placementOptions(subject, yearsCount).map((option) => (
            <button
              key={`${option.year}-${option.semester}`}
              type="button"
              className={sch.optBtn}
              onClick={() => {
                actions.place(subject.id, option.year, option.semester);
                onClose();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        {placed && (
          <button
            type="button"
            className={cx(ui.btn, ui.ghost, ui.small, sch.cancelBtn)}
            onClick={() => {
              actions.unplace(subject.id);
              onClose();
            }}
          >
            Odebrat z rozvrhu
          </button>
        )}
        <button
          type="button"
          className={cx(ui.btn, ui.ghost, ui.small, sch.cancelBtn)}
          onClick={onClose}
        >
          Zrušit
        </button>
      </div>
    </div>,
    document.body,
  );
}
