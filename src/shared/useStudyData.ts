import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FIELD_URL_PARAM,
  StudyDataError,
  YEARS_FALLBACK,
  YEAR_URL_PARAM,
  fieldFromSearch,
  loadFields,
  loadStudyData,
  loadYears,
  pickField,
  pickYear,
  yearFromSearch,
} from "../lib/data";
import type { StudyData, StudyDataWithLinks } from "../lib/data";
import {
  readStoredField,
  readStoredYear,
  resolveStorage,
  writeStoredField,
  writeStoredYear,
} from "../lib/storage";
import type { KeyValueStorage } from "../lib/storage";
import type { AcademicYear, FieldId } from "../lib/types";
import { dataBaseUrl } from "./pages";

let cachedStorage: KeyValueStorage | null = null;

/**
 * `window.localStorage`, nebo úložiště v paměti, když localStorage není dostupné
 * (zakázané cookies apod.). Vrací pořád stejný objekt.
 */
export function browserStorage(): KeyValueStorage {
  cachedStorage ??= resolveStorage(() => window.localStorage);
  return cachedStorage;
}

/** Hláška pro případ, že chyba načtení nemá vlastní český text. */
export const GENERIC_LOAD_ERROR = "Chyba při načítání dat.";

/** Volby {@link useStudyData}. */
export interface StudyDataOptions {
  /** Načíst i links.json (mapa). Výchozí `false`. */
  links?: boolean;
  /**
   * Záložní seznam roků, když years.json nejde načíst. Výchozí {@link YEARS_FALLBACK}
   * (kalkulačka); mapa předává `MAP_YEARS_FALLBACK` (starý `ROKY_FALLBACK` mapy).
   */
  yearsFallback?: readonly AcademicYear[];
}

interface StudyDataStateBase {
  /** Dostupné akademické roky (prázdné, dokud se nenačte years.json). */
  years: readonly AcademicYear[];
  /** Vybraný rok; `null` jen než se načte seznam roků. */
  year: AcademicYear | null;
  /**
   * Změní akademický rok (starý `naplnSelectRoku` → change): uloží ho do
   * `mff_akademicky_rok`, zapíše `?rok=<rok>` do URL (history.replaceState, bez
   * reloadu; ostatní parametry včetně `?obor=` zůstávají) a pro nový rok znovu načte
   * fields.json a vybere obor jako po reloadu staré stránky (`pickField` s `?obor=`
   * z aktuální URL a `mff_obor`). Rok mimo `years` (nebo před načtením seznamu) se
   * ignoruje.
   */
  setYear: (year: AcademicYear) => void;
  /** Obory vybraného roku (prázdné, dokud se pro `year` nenačte fields.json). */
  fields: readonly FieldId[];
  /** Vybraný obor; `null`, dokud se pro `year` nenačte fields.json. */
  field: FieldId | null;
  /**
   * Změní obor (starý `naplnSelectOboru` → change): uloží ho do `mff_obor`, zapíše
   * `?obor=<obor>` do URL (history.replaceState) a načte data oboru. Rok zůstává.
   * Obor mimo `fields` (nebo před jejich načtením) se ignoruje.
   */
  setField: (field: FieldId) => void;
}

/**
 * Stav načtení dat. `data` je vyplněné jen ve stavu `ready` a vždy patří k `year`
 * a `field` (`data.year === year`, `data.field === field`); během načítání jiného
 * roku či oboru je stav `loading` a `data: null`. Chyba (`error`) se týká jen
 * nodes.json / links.json – years.json a fields.json mají záložní seznamy.
 */
export type StudyDataState<TData extends StudyData = StudyData> =
  StudyDataStateBase &
    (
      | { status: "loading"; data: null; error: null }
      | {
          status: "ready";
          year: AcademicYear;
          field: FieldId;
          data: TData;
          error: null;
        }
      | {
          status: "error";
          year: AcademicYear;
          field: FieldId;
          data: null;
          error: string;
        }
    );

/** Obory roku a obor pro něj vybraný. */
interface FieldChoice {
  year: AcademicYear;
  fields: readonly FieldId[];
  field: FieldId;
}

/** Výsledek dokončeného načtení – platí jen pro svůj rok, obor a rozsah. */
type Outcome = { year: AcademicYear; field: FieldId; withLinks: boolean } & (
  | { data: StudyData | StudyDataWithLinks; error: null }
  | { data: null; error: string }
);

/** Zapíše parametr do URL bez reloadu a bez nové položky historie. */
function replaceUrlParam(name: string, value: string): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(name, value);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // URL nejde přepsat (např. file://) – hodnota je i tak uložená a vybraná.
  }
}

/**
 * Sdílené načtení dat pro kalkulačku a mapu – přepis `init()` starých stránek:
 *
 * 1. years.json (`loadYears`, záloha `yearsFallback`) → rok: URL `?rok=` →
 *    `mff_akademicky_rok` → poslední rok (`pickYear`);
 * 2. `<rok>/fields.json` (`loadFields`, záloha `["informatika"]`) → obor: URL
 *    `?obor=` → `mff_obor` → informatika → první obor (`pickField`);
 * 3. `<rok>/<obor>/nodes.json` (a s `links: true` i links.json) z `dataBaseUrl()` +
 *    index.
 *
 * Samotné načtení nic neukládá ani nemění URL (jako starý kód). Změna roku či oboru
 * přes `setYear` / `setField` nenačítá stránku znovu – vše, co na roce a oboru závisí
 * (hlavně postup v localStorage), si má volající načíst znovu podle `data.year` a
 * `data.field`, nejjednodušeji vykreslením podstromu s
 * `key={`${data.year}/${data.field}`}`.
 *
 * Pozdě doběhlé odpovědi pro jiný rok/obor a odpovědi po odpojení se zahazují.
 */
export function useStudyData(
  options: StudyDataOptions & { links: true },
): StudyDataState<StudyDataWithLinks>;
export function useStudyData(
  options?: StudyDataOptions & { links?: false },
): StudyDataState<StudyData>;
export function useStudyData(
  options: StudyDataOptions = {},
): StudyDataState<StudyData> | StudyDataState<StudyDataWithLinks> {
  const withLinks = options.links === true;
  // Záložní seznam se použije jen při prvním načtení; změna mezi rendery se ignoruje.
  const yearsFallback = useRef(options.yearsFallback ?? YEARS_FALLBACK);
  const [years, setYears] = useState<readonly AcademicYear[] | null>(null);
  const [year, setYearState] = useState<AcademicYear | null>(null);
  const [fieldChoice, setFieldChoice] = useState<FieldChoice | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** Načtené fields.json podle roku – při návratu na rok se nenačítají znovu. */
  const fieldsByYear = useRef(new Map<AcademicYear, readonly FieldId[]>());
  /** Poslední úspěšně načtená data – při návratu na tentýž rok a obor se nenačítají znovu. */
  const lastLoaded = useRef<Outcome | null>(null);

  // 1) Seznam roků a výběr roku – jednou po připojení.
  useEffect(() => {
    let cancelled = false;
    void loadYears(dataBaseUrl(), yearsFallback.current).then((loaded) => {
      if (cancelled) return;
      setYears(loaded);
      setYearState(
        pickYear(
          loaded,
          yearFromSearch(window.location.search),
          readStoredYear(browserStorage()),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Obory vybraného roku a výběr oboru – po každé změně roku znovu, jako po
  //    reloadu staré stránky (?obor= z aktuální URL, pak mff_obor).
  useEffect(() => {
    if (year === null) return;
    let cancelled = false;
    const cached = fieldsByYear.current.get(year);
    const fieldsPromise = cached
      ? Promise.resolve(cached)
      : loadFields(dataBaseUrl(), year).then((loaded) => {
          fieldsByYear.current.set(year, loaded);
          return loaded;
        });
    void fieldsPromise.then((fields) => {
      if (cancelled) return;
      setFieldChoice({
        year,
        fields,
        field: pickField(
          fields,
          fieldFromSearch(window.location.search),
          readStoredField(browserStorage()),
        ),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const currentChoice =
    fieldChoice !== null && fieldChoice.year === year ? fieldChoice : null;
  const field = currentChoice?.field ?? null;

  // 3) Data vybraného roku a oboru.
  useEffect(() => {
    if (year === null || field === null) return;
    const last = lastLoaded.current;
    if (
      last !== null &&
      last.data !== null &&
      last.year === year &&
      last.field === field &&
      last.withLinks === withLinks
    ) {
      // Už načtené (uživatel přepnul tam a hned zpět, než doběhlo jiné načtení).
      return;
    }
    let cancelled = false;
    loadStudyData(dataBaseUrl(), year, field, { links: withLinks }).then(
      (data) => {
        if (cancelled) return;
        const loaded: Outcome = { year, field, withLinks, data, error: null };
        lastLoaded.current = loaded;
        setOutcome(loaded);
      },
      (cause: unknown) => {
        if (cancelled) return;
        console.error("Failed to load study plan data:", cause);
        const error =
          cause instanceof StudyDataError ? cause.message : GENERIC_LOAD_ERROR;
        lastLoaded.current = null;
        setOutcome({ year, field, withLinks, data: null, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [year, field, withLinks]);

  /** Stará chyba se po přepnutí nesmí znovu ukázat (načtení se zopakuje). */
  const dropError = useCallback(() => {
    setOutcome((current) => (current?.data === null ? null : current));
  }, []);

  const setYear = useCallback(
    (next: AcademicYear) => {
      if (years === null || !years.includes(next)) return;
      writeStoredYear(browserStorage(), next);
      replaceUrlParam(YEAR_URL_PARAM, next);
      if (next === year) return;
      dropError();
      setYearState(next);
    },
    [years, year, dropError],
  );

  const setField = useCallback(
    (next: FieldId) => {
      if (currentChoice === null || !currentChoice.fields.includes(next)) {
        return;
      }
      writeStoredField(browserStorage(), next);
      replaceUrlParam(FIELD_URL_PARAM, next);
      if (next === currentChoice.field) return;
      dropError();
      setFieldChoice({ ...currentChoice, field: next });
    },
    [currentChoice, dropError],
  );

  return useMemo(() => {
    const base = {
      years: years ?? [],
      year,
      setYear,
      fields: currentChoice?.fields ?? [],
      field,
      setField,
    };
    if (
      year === null ||
      field === null ||
      outcome === null ||
      outcome.year !== year ||
      outcome.field !== field ||
      outcome.withLinks !== withLinks
    ) {
      return { ...base, status: "loading", data: null, error: null };
    }
    if (outcome.data === null) {
      return {
        ...base,
        year,
        field,
        status: "error",
        data: null,
        error: outcome.error,
      };
    }
    return {
      ...base,
      year,
      field,
      status: "ready",
      data: outcome.data,
      error: null,
    };
  }, [
    years,
    year,
    setYear,
    currentChoice,
    field,
    setField,
    outcome,
    withLinks,
  ]);
}
