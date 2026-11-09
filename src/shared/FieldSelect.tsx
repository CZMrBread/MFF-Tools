import { fieldLabel } from "../lib/types";
import type { FieldId } from "../lib/types";

/** Popisek (`title`) zakázaného výběru oboru – text starého `naplnSelectOboru`. */
export const SINGLE_FIELD_TITLE =
  "V tomto akademickém roce je k dispozici jen jeden obor";

export interface FieldSelectProps {
  /** Obory vybraného roku v pořadí fields.json. */
  fields: readonly FieldId[];
  /** Vybraný obor; `null`, dokud není znám. */
  value: FieldId | null;
  /** Zavolá se s nově vybraným oborem (předej `setField` z `useStudyData`). */
  onChange: (field: FieldId) => void;
  /** Třída pro `<select>` – vzhled určuje stránka, která komponentu používá. */
  className?: string;
  id?: string;
}

/**
 * Výběr oboru (starý `<select id="obor-select">` + `naplnSelectOboru`). Vykresluje
 * jen samotný `<select>`; popisek „Obor" a obal si dodá stránka. Text položky je
 * název z `FIELD_LABELS` (starý `OBORY_NAZVY`), u neznámého oboru jeho id.
 *
 * Jako ve starém kódu je výběr zakázaný (`disabled`, s vysvětlujícím `title`), když
 * rok nabízí jen jeden obor (`obory.length < 2`; načtený seznam není nikdy prázdný).
 * Před načtením fields.json (prázdný seznam) je výběr prázdný, ale povolený – jako
 * statický `<select>` staré stránky, než ho skript naplní.
 */
export function FieldSelect({
  fields,
  value,
  onChange,
  className,
  id,
}: FieldSelectProps) {
  const disabled = fields.length > 0 && fields.length < 2;
  return (
    <select
      id={id}
      className={className}
      disabled={disabled}
      title={
        fields.length === 0 ? undefined : disabled ? SINGLE_FIELD_TITLE : ""
      }
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    >
      {fields.map((field, index) => (
        <option key={`${index}-${field}`} value={field}>
          {fieldLabel(field)}
        </option>
      ))}
    </select>
  );
}
