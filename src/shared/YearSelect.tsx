import type { AcademicYear } from "../lib/types";

export interface YearSelectProps {
  /** Dostupné roky v pořadí years.json. */
  years: readonly AcademicYear[];
  /** Vybraný rok; `null`, dokud není znám. */
  value: AcademicYear | null;
  /** Zavolá se s nově vybraným rokem (předej `setYear` z `useStudyData`). */
  onChange: (year: AcademicYear) => void;
  /** Třída pro `<select>` – vzhled určuje stránka, která komponentu používá. */
  className?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Výběr akademického roku (starý `<select id="year-select">`). Vykresluje jen samotný
 * `<select>`; popisek „Akademický rok" a obal si dodá stránka. Text položky je rok
 * s lomítkem, např. „2025/2026".
 */
export function YearSelect({
  years,
  value,
  onChange,
  className,
  id,
  disabled,
}: YearSelectProps) {
  return (
    <select
      id={id}
      className={className}
      disabled={disabled}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    >
      {years.map((year, index) => (
        <option key={`${index}-${year}`} value={year}>
          {year.replace("-", "/")}
        </option>
      ))}
    </select>
  );
}
