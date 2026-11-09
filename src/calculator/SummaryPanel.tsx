import type { ReactNode } from "react";
import { planStatus, summaryItems } from "../lib/credits";
import type {
  PlanSummary,
  ProgressBar,
  SummaryContext,
  SummaryItem,
} from "../lib/credits";
import { cx } from "./plannerContext";
import ui from "./ui.module.css";

/** Nadpis „Kontrola plnění" (styl inline jako ve staré stránce). */
const PANEL_TITLE_STYLE = {
  margin: "0 0 var(--_spacing---16-px)",
  fontSize: "var(--_typography---h3--font-size)",
  fontWeight: "var(--_typography---h3--font-weight)",
} as const;

/** Jeden pruh průběhu (starý `bar(label, earned, target)`). */
function ProgressRow({ label, bar }: { label: string; bar: ProgressBar }) {
  return (
    <div className={ui.progressBox}>
      <div className={ui.progressInfo}>
        <span>{label}</span>
        <span>{bar.valueText}</span>
      </div>
      <div className={ui.progressBar}>
        <div
          className={ui.progressFill}
          style={{ width: `${bar.widthPercent}%`, background: bar.fillColor }}
        ></div>
      </div>
      {bar.remainingText && (
        <div className={ui.progressInfo} style={{ marginTop: ".2rem" }}>
          <span></span>
          <span className={ui.rem} style={{ color: bar.textColor }}>
            {bar.remainingText}
          </span>
        </div>
      )}
    </div>
  );
}

function renderItem(item: SummaryItem, index: number): ReactNode {
  switch (item.type) {
    case "section":
      // První oddíl („Povinné") je bez odsazení, další mají margin-top.
      return (
        <div
          key={index}
          className={ui.secTitle}
          style={
            index === 0 ? undefined : { marginTop: "var(--_spacing---16-px)" }
          }
        >
          {item.title}
        </div>
      );
    case "bar":
      return item.total ? (
        <div key={index} className={ui.totalLine}>
          <ProgressRow label={item.label} bar={item.bar} />
        </div>
      ) : (
        <ProgressRow key={index} label={item.label} bar={item.bar} />
      );
    case "note":
      return (
        <div
          key={index}
          className={ui.progressInfo}
          style={{
            fontSize: item.kind === "noCredit" ? ".72rem" : ".78rem",
            color: "var(--muted)",
          }}
        >
          <span>{item.label}</span>
          <span>{item.value}</span>
        </div>
      );
    case "divider":
      return <hr key={index} className={ui.divider} />;
  }
}

/**
 * Panel „Kontrola plnění" (starý `renderSummary` / `renderSchedSummary`): pruhy,
 * stavová hláška, tlačítko celkového resetu a poznámka.
 */
export function SummaryPanel({
  summary,
  context,
  className,
  resetLabel,
  onReset,
  note,
}: {
  summary: PlanSummary;
  context: SummaryContext;
  className: string;
  resetLabel: string;
  onReset: () => void;
  note: ReactNode;
}) {
  const status = planStatus(summary, context);
  return (
    <div className={className}>
      <h3 style={PANEL_TITLE_STYLE}>Kontrola plnění</h3>
      <div>{summaryItems(summary, context).map(renderItem)}</div>
      <div className={cx(ui.status, ui[status.tone])}>{status.text}</div>
      <button
        type="button"
        className={cx(ui.btn, ui.ghost, ui.small)}
        style={{ marginTop: "var(--_spacing---16-px)", width: "100%" }}
        onClick={onReset}
      >
        {resetLabel}
      </button>
      <p className={ui.note}>{note}</p>
    </div>
  );
}
