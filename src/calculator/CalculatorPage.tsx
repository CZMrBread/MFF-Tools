import { useState } from "react";
import { FieldSelect } from "../shared/FieldSelect";
import { SiteFooter } from "../shared/SiteFooter";
import { browserStorage, useStudyData } from "../shared/useStudyData";
import type { StudyDataState } from "../shared/useStudyData";
import { YearSelect } from "../shared/YearSelect";
import "./calculator.css";
import page from "./CalculatorPage.module.css";
import { DegreeStep, Planner } from "./Planner";
import type { Tab } from "./Planner";
import {
  INSTRUCTIONS_CALC,
  INSTRUCTIONS_INITIAL,
  INSTRUCTIONS_SCHEDULE,
  LOAD_ERROR_MESSAGE,
} from "./texts";

/**
 * Kalkulačka kreditů (stará stránka kalkulačka/index.html): výběr roku a oboru,
 * krokový průvodce (stupeň → specializace) a dashboard se záložkami Kalkulačka a
 * Rozvrh. Postup se ukládá do localStorage pod klíči staré stránky.
 */
export function CalculatorPage() {
  const study = useStudyData();

  // Stará stránka při chybě načtení nahradila celý obsah <body> jednou hláškou.
  if (study.status === "error") {
    return <h2>{LOAD_ERROR_MESSAGE}</h2>;
  }

  return (
    <>
      {/* Stará stránka se při změně roku i oboru načetla znovu – `key` vrátí vše
          (návod, krok průvodce, záložku i postup) do stavu po načtení. */}
      <CalculatorView key={`${study.year}/${study.field}`} study={study} />
      <SiteFooter />
    </>
  );
}

function CalculatorView({ study }: { study: StudyDataState }) {
  const [instructions, setInstructions] = useState(INSTRUCTIONS_INITIAL);

  return (
    <div className={page.pageContent}>
      <h1 className={page.title}>
        Kalkulačka kreditů <span>MFF UK</span>
      </h1>
      <div className={page.instructions} id="app-instructions">
        {instructions}
      </div>

      <div className={page.disclaimer} role="note">
        <i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
        <div>
          <strong>Kalkulačka je pouze orientační.</strong> Vždy si vše ověř v{" "}
          <a
            href="https://www.mff.cuni.cz/cs/studenti/bc-a-mgr-studium/studijni-plany"
            target="_blank"
            rel="noopener noreferrer"
          >
            Karolince pro svůj ročník
          </a>
          .
        </div>
      </div>

      <div className={page.studyPickerWrap}>
        <div className={page.studyPicker}>
          <label>
            Akademický rok{" "}
            <YearSelect
              id="year-select"
              years={study.years}
              value={study.year}
              onChange={study.setYear}
            />
          </label>
          <label>
            Obor{" "}
            <FieldSelect
              id="obor-select"
              fields={study.fields}
              value={study.field}
              onChange={study.setField}
            />
          </label>
        </div>
      </div>

      {study.status === "ready" ? (
        <Planner
          data={study.data}
          storage={browserStorage()}
          onTabSwitch={(tab: Tab) =>
            setInstructions(
              tab === "calc" ? INSTRUCTIONS_CALC : INSTRUCTIONS_SCHEDULE,
            )
          }
        />
      ) : (
        // Než se načtou data, je vidět krok 1 ze statického HTML staré stránky.
        <div className={page.container}>
          <DegreeStep onSelect={() => {}} />
        </div>
      )}
    </div>
  );
}
