/**
 * Nabídka operací stránky třídění (ActionMenu) – čisté definice akcí bez Reactu (testy v actions.test.ts).
 *
 *   Vytvořit ▸ Vlastní (P = …) · Náhodné · Setříděné · Sestupné · Téměř setříděné · Mnoho duplicit ·
 *              Náhodné, n prvků (n = …)
 *   P[i] ← x   (x a i vyplní klik na sloupec)
 *   Quicksort(P)   (aktuální vstup znovu od začátku)
 *
 * Každá akce připraví nový běh nad vstupem – krok 1, ▶ ho přehraje (jako dřív tlačítka předvoleb a „Použít“).
 * „Výchozí příklad“ a „↶ Vrátit operaci“ jsou v řádku Historie pod akcemi (Visualizer, inputHistory).
 */
import { numArg, listArg, type ActionDef } from "../../core/actionModel";
import { presetArray, type PresetKind } from "../../core/presets";
import { MAX_INPUT_N, MIN_VALUE, maxValueOf } from "./input";
import type { Item, SortAlgorithm } from "./types";

/** Pořadí variant „Vytvořit“; první (Vlastní) je výchozí – pole P je po otevření hned vidět. */
export const CREATE_VARIANTS = [
  "custom",
  "random",
  "sorted",
  "reversed",
  "nearly",
  "dupes",
  "randomN",
];

const GENERATORS: { id: PresetKind; label: string; what: string }[] = [
  { id: "random", label: "Náhodné", what: "náhodná čísla" },
  { id: "sorted", label: "Setříděné", what: "vzestupně setříděný vstup" },
  { id: "reversed", label: "Sestupné", what: "sestupně setříděný vstup" },
  {
    id: "nearly",
    label: "Téměř setříděné",
    what: "setříděný vstup s několika prohozenými sousedy",
  },
  { id: "dupes", label: "Mnoho duplicit", what: "jen několik různých hodnot" },
];

/** „5, 3, 9“; dlouhý vstup zkrátí na „5, 3, 9, 1, 7, … (20 prvků)“ – do řádku Historie */
export const shortList = (v: readonly number[]) =>
  v.length > 6
    ? `${v.slice(0, 5).join(", ")}, … (${v.length} prvků)`
    : v.join(", ");

/** Výchozí délka generovaného vstupu: délka aktuálního (u 0–1 prvku 12, jinak by nebylo co třídit). */
export function generatorLength(values: readonly number[]): number {
  return values.length >= 2 ? Math.min(values.length, MAX_INPUT_N) : 12;
}

/** P[i] ← x s 1-based i; mimo rozsah vrací původní pole. */
export function setValueAt(values: number[], i: number, x: number): number[] {
  if (!Number.isInteger(i) || i < 1 || i > values.length) return values;
  const next = values.slice();
  next[i - 1] = x;
  return next;
}

/**
 * Pozice (1-based) ve vstupu pro klik na sloupec `index` aktuálního kroku. Prvky si nesou identitu
 * (id = pozice ve vstupu), takže i uprostřed třídění se upraví ten prvek, na který uživatel klikl.
 */
export function inputPosition(
  items: readonly (Item | null)[],
  index: number,
  values: readonly number[],
): number {
  const it = items[index];
  if (it && it.id >= 0 && it.id < values.length && values[it.id] === it.v)
    return it.id + 1;
  return index + 1;
}

export interface SortingHandlers {
  /**
   * použít vstup; `restart` = nový běh i pro stejný obsah (kroky od 1, pozastaveno – přehraje až ▶);
   * `title` = název do řádku Historie („Vytvořit(5, 3, 9)“, „P[2] ← 7“)
   */
  apply: (values: number[], restart: boolean, title: string) => void;
  /** semínko náhodných vstupů (UI Date.now(), testy pevné) */
  seed?: () => number;
}

export function sortingActions(
  algo: SortAlgorithm,
  values: number[],
  { apply, seed = Date.now }: SortingHandlers,
): ActionDef[] {
  const lo = MIN_VALUE;
  const hi = maxValueOf(algo);
  const n = generatorLength(values);
  const gen = (kind: PresetKind, len: number) =>
    presetArray(kind, Math.min(len, MAX_INPUT_N), lo, hi, seed());

  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    title: `Nový vstup P (celá čísla ${lo} až ${hi}, nejvýš ${MAX_INPUT_N} prvků) – rovnou se setřídí`,
    variants: [
      {
        id: "custom",
        label: "Vlastní",
        title: "Vlastní čísla oddělená mezerou nebo čárkou",
        args: [
          {
            kind: "list",
            name: "P",
            label: "P =",
            min: lo,
            max: hi,
            maxCount: MAX_INPUT_N,
            default: values,
            placeholder: "např. 5, 3, 9",
          },
        ],
      },
      ...GENERATORS.map((g) => ({
        id: g.id,
        label: g.label,
        title: `${g.what[0].toUpperCase()}${g.what.slice(1)}, n = ${n}`,
      })),
      {
        id: "randomN",
        label: "Náhodné, n prvků",
        title: "Náhodná čísla, počet prvků zadáte",
        args: [
          {
            kind: "int",
            name: "n",
            label: "n =",
            min: 1,
            max: MAX_INPUT_N,
            default: values.length || 12,
          },
        ],
      },
    ],
    run: (v, variant) => {
      if (variant === "custom") {
        const P = listArg(v, "P");
        apply(P, true, `Vytvořit(${shortList(P)})`);
      } else if (variant === "randomN") {
        const k = numArg(v, "n");
        apply(gen("random", k), true, `Vytvořit: náhodné, n = ${k}`);
      } else {
        const g = GENERATORS.find((x) => x.id === variant);
        if (g) apply(gen(g.id, n), true, `Vytvořit: ${g.label.toLowerCase()}`);
      }
    },
  };

  const set: ActionDef = {
    id: "set",
    label: "P[i] ← x",
    title: "Přepíše jeden prvek vstupu; x a i vyplní i klik na sloupec",
    args: [
      { kind: "int", name: "x", label: "x =", min: lo, max: hi, default: lo },
      {
        kind: "int",
        name: "i",
        label: "na pozici i =",
        min: 1,
        max: Math.max(1, values.length),
        default: 1,
      },
    ],
    disabledReason: values.length ? null : "Vstup je prázdný",
    run: (v) => {
      const i = numArg(v, "i");
      const x = numArg(v, "x");
      apply(setValueAt(values, i, x), true, `P[${i}] ← ${x}`);
    },
  };

  const sort: ActionDef = {
    id: "sort",
    label: `${algo.name}(P)`,
    title: "Setřídí aktuální vstup znovu od začátku",
    run: () => apply(values.slice(), true, `${algo.name}(P)`),
  };

  return [create, set, sort];
}
