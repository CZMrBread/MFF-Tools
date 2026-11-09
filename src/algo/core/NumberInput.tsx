import { useState, type ReactNode } from "react";
import { IntField, ListField } from "./Fields";
import { parseNumberList, sameNumbers } from "./input";
import { presetArray, type PresetKind } from "./presets";

interface Props {
  values: number[];
  onChange: (values: number[]) => void;
  /** nejvyšší počet prvků */
  maxN?: number;
  /** nejmenší povolená hodnota (ručně zadaná i generovaná), výchozí 1 */
  minValue?: number;
  /** největší povolená hodnota (ručně zadaná i generovaná), výchozí 99 */
  maxValue?: number;
  label?: string;
  /** další ovládací prvky na konec řádku s předvolbami (např. vlastní tlačítko stránky) */
  children?: ReactNode;
}

const PRESETS: { kind: PresetKind; label: string; title: string }[] = [
  {
    kind: "random",
    label: "Náhodný vstup",
    title: "Náhodná čísla z povoleného rozsahu",
  },
  { kind: "sorted", label: "Setříděné", title: "Vzestupně setříděný vstup" },
  { kind: "reversed", label: "Sestupné", title: "Sestupně setříděný vstup" },
  {
    kind: "nearly",
    label: "Téměř setříděné",
    title: "Setříděný vstup s několika prohozenými sousedy",
  },
  {
    kind: "dupes",
    label: "Mnoho duplicit",
    title: "Jen několik různých hodnot",
  },
];

/**
 * Vstupní pole pro třídění: seznam čísel + předvolby. Text se řídí podle `values` (změní-li je stránka, pole
 * to ukáže), použije se Enterem nebo tlačítkem „Použít“ – pouhé opuštění pole nic nemění. Čísla mimo rozsah
 * a neplatné tokeny se vypíšou pod polem.
 */
export function NumberInput({
  values,
  onChange,
  maxN = 60,
  minValue = 1,
  maxValue = 99,
  label = "Vstupní pole",
  children,
}: Props) {
  const [text, setText] = useState(() => values.join(" "));
  const [seen, setSeen] = useState(values);
  const [n, setN] = useState(() =>
    Math.max(1, Math.min(maxN, values.length || 12)),
  );
  const opts = { min: minValue, max: maxValue, maxCount: maxN };

  // hodnoty změnil rodič (jiný algoritmus, předvolba…) → pole ukáže přesně to, co se třídí
  if (seen !== values) {
    setSeen(values);
    if (
      !sameNumbers(parseNumberList(text, opts).values, values) ||
      parseNumberList(text, opts).ignored.length > 0
    )
      setText(values.join(" "));
  }

  const apply = (next: number[]) => {
    // stejné hodnoty neposíláme znovu – jinak by se přehrávání zbytečně vrátilo na začátek
    if (!sameNumbers(next, values)) onChange(next);
  };
  const preset = (kind: PresetKind) => {
    // předvolby kreslí sloupce → nezáporné, ale vždy uvnitř povoleného rozsahu ⟨minValue, maxValue⟩
    const lo = Math.min(maxValue, Math.max(1, minValue));
    const next = presetArray(kind, Math.min(n, maxN), lo, maxValue, Date.now());
    setText(next.join(" "));
    apply(next);
  };
  const dirty = !sameNumbers(parseNumberList(text, opts).values, values);

  return (
    <div className="number-input">
      <ListField
        label={label}
        text={text}
        onTextChange={setText}
        maxCount={maxN}
        min={minValue}
        max={maxValue}
        onSubmit={apply}
        buttonLabel="Použít"
        dirty={dirty}
      />
      <div className="input-buttons">
        <IntField
          label="počet prvků n ="
          value={n}
          onChange={setN}
          min={1}
          max={maxN}
          onEnter={() => preset("random")}
        />
        {PRESETS.map((p) => (
          <button
            key={p.kind}
            type="button"
            title={p.title}
            onClick={() => preset(p.kind)}
          >
            {p.label}
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}
