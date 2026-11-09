import { useState } from "react";
import { MAP_YEARS_FALLBACK } from "../lib/data";
import {
  DEFAULT_DEGREE_FILTER,
  DEGREE_FILTERS,
  MAP_COLORS,
  SUBJECT_CATEGORIES,
  SUBJECT_CATEGORY_LABELS,
} from "../lib/map";
import type { AcademicYear, FieldId } from "../lib/types";
import { FieldSelect } from "../shared/FieldSelect";
import { SiteFooter } from "../shared/SiteFooter";
import { useStudyData } from "../shared/useStudyData";
import { YearSelect } from "../shared/YearSelect";
import { MapGraph } from "./MapGraph";
import type { FilterRequest } from "./MapGraph";
import styles from "./MapPage.module.css";
import "./map.css";

/**
 * Mapa předmětů (stará stránka specializace/index.html): nadpis, návod, výběr roku
 * a oboru s přepínačem stupně studia, legenda a silový graf předmětů a specializací.
 */
export function MapPage() {
  const study = useStudyData({
    links: true,
    yearsFallback: MAP_YEARS_FALLBACK,
  });
  const [filter, setFilter] = useState<FilterRequest>({
    value: DEFAULT_DEGREE_FILTER,
  });

  // Stará stránka se při změně roku i oboru celá načetla znovu, takže se filtr vrátil
  // na výchozí; výběr, zvýraznění a pohled grafu se vracejí přes `key` u <MapGraph>.
  const changeYear = (year: AcademicYear) => {
    if (year !== study.year) setFilter({ value: DEFAULT_DEGREE_FILTER });
    study.setYear(year);
  };
  const changeField = (field: FieldId) => {
    if (field !== study.field) setFilter({ value: DEFAULT_DEGREE_FILTER });
    study.setField(field);
  };

  return (
    <>
      <div className={styles.pageContent}>
        <header>
          <h1 className={styles.title}>
            Kompletní průniky <span>předmětů</span>
          </h1>
        </header>
        <div className={styles.instructions}>
          Klikněte na <strong>jednu nebo více specializací</strong>. Mapa
          rozsvítí předměty, které jsou v nich sdílené.
        </div>

        <div className={styles.controls}>
          <div className={styles.studyPicker}>
            <label>
              Akademický rok{" "}
              <YearSelect
                id="year-select"
                years={study.years}
                value={study.year}
                onChange={changeYear}
              />
            </label>
            <label>
              Obor{" "}
              <FieldSelect
                id="obor-select"
                fields={study.fields}
                value={study.field}
                onChange={changeField}
              />
            </label>
          </div>
          <div className={styles.filters}>
            {DEGREE_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={
                  filter.value === value
                    ? `${styles.filterButton} ${styles.active}`
                    : styles.filterButton
                }
                data-filter={value}
                // Nový objekt i pro už aktivní filtr – graf se znovu rozhýbe jako dřív.
                onClick={() => setFilter({ value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.legend}>
          {SUBJECT_CATEGORIES.map((category) => (
            <div key={category} className={styles.legendItem}>
              <div
                className={styles.legendDot}
                style={{ background: MAP_COLORS[category] }}
              ></div>
              <span>{SUBJECT_CATEGORY_LABELS[category]}</span>
            </div>
          ))}
        </div>

        <MapGraph
          key={
            study.data ? `${study.data.year}/${study.data.field}` : "loading"
          }
          data={study.data}
          filter={filter}
          error={study.error}
        />
      </div>
      <SiteFooter />
    </>
  );
}
