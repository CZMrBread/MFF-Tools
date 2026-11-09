import { useId, useState, type ReactNode } from "react";
import {
  describeRange,
  listStatus,
  parseIntStrict,
  parseNumberList,
  type NumberListResult,
} from "./input";

/* ---------- jedno celé číslo ---------- */

export interface IntFieldProps {
  /** popisek před polem, např. „x =“ */
  label: ReactNode;
  /** poslední platná hodnota (drží ji stránka) */
  value: number;
  /** volá se jen s platným celým číslem v rozsahu */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Enter v poli s platnou hodnotou – hlavní operace stránky (Insert, Push…) */
  onEnter?: (value: number) => void;
  /** šířka pole (CSS), výchozí 4.5rem */
  width?: number | string;
  disabled?: boolean;
  /** vysvětlení, např. proč je pole neaktivní */
  title?: string;
}

/**
 * Pole pro celé číslo. Text drží samo, takže jde vymazat i napsat „-“; rodič dostává jen platné hodnoty.
 * Neplatný text se označí (aria-invalid + hláška pod polem) a při opuštění pole se vrátí poslední platná hodnota –
 * tlačítko operace vedle pole tak nikdy nepracuje s jiným číslem, než jaké je v poli vidět.
 */
export function IntField({
  label,
  value,
  onChange,
  min,
  max,
  onEnter,
  width = "4.5rem",
  disabled,
  title,
}: IntFieldProps) {
  const [text, setText] = useState(() => String(value));
  const [seen, setSeen] = useState(value);
  const errorId = useId();

  // hodnotu změnil rodič (jiné tlačítko, oříznutí…) → přepsat text, pokud už neříká totéž
  if (!Object.is(seen, value)) {
    setSeen(value);
    if (parseIntStrict(text, { min, max }).value !== value)
      setText(String(value));
  }

  const parsed = parseIntStrict(text, { min, max });
  const invalid = parsed.value === null;
  const error = invalid ? `Zadejte ${describeRange({ min, max })}.` : null;

  return (
    <label
      className={"field int-field" + (invalid ? " invalid" : "")}
      title={title}
    >
      <span className="field-label">{label}</span>
      <span className="field-box">
        <input
          type="text"
          inputMode={min !== undefined && min >= 0 ? "numeric" : "text"}
          autoComplete="off"
          spellCheck={false}
          value={text}
          disabled={disabled}
          style={{ width }}
          aria-invalid={invalid || undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const v = parseIntStrict(t, { min, max }).value;
            if (v !== null && v !== value) onChange(v);
          }}
          onBlur={() => setText(String(value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && parsed.value !== null)
              onEnter?.(parsed.value);
            else if (e.key === "Escape") setText(String(value));
          }}
        />
        {error && (
          <span className="field-error" id={errorId} role="alert">
            {error}
          </span>
        )}
      </span>
    </label>
  );
}

/* ---------- seznam čísel ---------- */

export interface ListFieldProps {
  /** popisek pole, např. „Prvky“ */
  label: ReactNode;
  placeholder?: string;
  /** počáteční text (pole si pak text drží samo) */
  defaultText?: string;
  /** řízený režim: text drží stránka (např. kvůli tlačítku „Náhodný vstup“, které pole přepíše) */
  text?: string;
  onTextChange?: (text: string) => void;
  /** nejvyšší počet čísel */
  maxCount?: number;
  /** nejmenší a největší povolená hodnota */
  min?: number;
  max?: number;
  /** jen celá čísla (výchozí true) */
  integerOnly?: boolean;
  /** Enter nebo tlačítko; volá se jen s aspoň jedním platným číslem (pokud není allowEmpty) */
  onSubmit: (values: number[], result: NumberListResult) => void;
  /** text tlačítka, výchozí „Postavit“ */
  buttonLabel?: ReactNode;
  /** odeslat i prázdný seznam */
  allowEmpty?: boolean;
  /** text v poli se liší od toho, co je vykresleno → tlačítko se zvýrazní */
  dirty?: boolean;
  disabled?: boolean;
  /** další tlačítka hned za tlačítkem odeslání (Náhodný vstup…) */
  children?: ReactNode;
}

interface Status {
  /** text pole, ke kterému hláška patří */
  forText: string;
  message: string;
  error: boolean;
}

/**
 * Textové pole pro seznam čísel + tlačítko. Enter odešle. Pod polem je stavový řádek, který říká, co se
 * použilo a co ne („Použito prvních 31 z 40 čísel; ignorováno: a, 7.5 …“). Po odeslání se text přepíše na
 * skutečně použitá čísla.
 */
export function ListField({
  label,
  placeholder = "čísla oddělená mezerou nebo čárkou",
  defaultText = "",
  text: controlled,
  onTextChange,
  maxCount,
  min,
  max,
  integerOnly = true,
  onSubmit,
  buttonLabel = "Postavit",
  allowEmpty = false,
  dirty = false,
  disabled,
  children,
}: ListFieldProps) {
  const [own, setOwn] = useState(defaultText);
  const [status, setStatus] = useState<Status | null>(null);
  const statusId = useId();
  const text = controlled ?? own;
  const opts = { min, max, maxCount, integerOnly };

  const setText = (t: string) => {
    setOwn(t);
    onTextChange?.(t);
  };

  const submit = () => {
    const result = parseNumberList(text, opts);
    const message = listStatus(result, opts);
    if (result.values.length === 0 && !allowEmpty) {
      setStatus({ forText: text, message: message ?? "", error: true });
      return;
    }
    // v poli zůstane přesně to, co se použilo
    const used = result.values.join(" ");
    setText(used);
    setStatus(message ? { forText: used, message, error: false } : null);
    onSubmit(result.values, result);
  };

  // hláška platí jen pro text, ze kterého vznikla
  const shown = status && status.forText === text ? status : null;
  const limits = [
    maxCount !== undefined ? `nejvýše ${maxCount}` : "",
    min !== undefined || max !== undefined
      ? describeRange({ min, max, integerOnly }, true)
      : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="field list-field">
      <label className="list-field-label">
        <span className="field-label">
          {label}
          {limits && <span className="field-limits"> ({limits})</span>}
        </span>
        <input
          type="text"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={shown?.error || undefined}
          aria-describedby={statusId}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </label>
      <div className="list-field-buttons">
        <button
          type="button"
          className={dirty ? "primary" : undefined}
          onClick={submit}
          disabled={disabled}
        >
          {buttonLabel}
        </button>
        {children}
      </div>
      <div
        className={"field-status" + (shown?.error ? " error" : "")}
        id={statusId}
        role="status"
      >
        {shown?.message ??
          (dirty ? "Změny se projeví po stisku Enter nebo tlačítka." : "")}
      </div>
    </div>
  );
}
