/**
 * Model stránek amortizace bez Reactu: příklady z přednášky L01 (docs/L01-intro-handout.pdf, slide 13 –
 * body, kterými je určený potenciál nafukovacího pole) a nabídky operací pro ActionMenu.
 */
import { formatNum } from "../../core/format";
import {
  listArg,
  numArg,
  strArg,
  type ActionDef,
} from "../../core/actionModel";
import { parseIntStrict } from "../../core/input";
import {
  ARR_MAX_N,
  ARR_MAX_VALUE,
  BUILD_MAX,
  CNT_MAX_START,
} from "./amortized";

/** velikost dávky „8× Insert“ / „8× Delete“ / „8× Increment“ */
export const BATCH = 8;

/* ------------------------------------------------------------------ příklady */

export interface ArrayExample {
  id: string;
  label: string;
  source: string;
  /** co příklad ukazuje */
  note: string;
  /** kapacita p */
  p: number;
  values: number[];
}

const L01 = "Přednáška L01, slide 13";

export const ARRAY_EXAMPLES: readonly ArrayExample[] = [
  {
    id: "l01-full",
    label: "p = n (plné, Φ = n)",
    source: L01,
    note: "plné pole: další Insert pole zdvojí a kopírování zaplatí potenciál Φ = n",
    p: 4,
    values: [1, 2, 3, 4],
  },
  {
    id: "l01-half",
    label: "p = 2n (Φ = 0)",
    source: L01,
    note: "pole zaplněné napůl má nulový potenciál – Insert i Delete ho zvednou",
    p: 8,
    values: [1, 2, 3, 4],
  },
  {
    id: "l01-sparse",
    label: "před zmenšením (p = 8, n = 3)",
    source: L01,
    note: "po Delete bude p = 4n (Φ = n) a pole se zmenší na polovinu",
    p: 8,
    values: [1, 2, 3],
  },
];

/* ------------------------------------------------------------------ pomůcky */

/** Kapacita z adresy (`?p=8`): mocnina dvojky ≥ n a nejvýše 2·ARR_MAX_N; jinak null (spočítá se z n). */
export function capFromUrl(param: string | null, n: number): number | null {
  if (!param) return null;
  const p = parseIntStrict(param, { min: 1, max: 2 * ARR_MAX_N }).value;
  if (p === null || p < n || (p & (p - 1)) !== 0) return null;
  return p;
}

/** Navržené x po Insert(x): o jedna víc, v rozsahu hodnot pole. */
export const nextX = (x: number) => Math.min(ARR_MAX_VALUE, x + 1);

/** Text pole x → číslo (neplatný nebo chybějící text → fallback). */
export function xFromText(text: string | undefined, fallback: number) {
  if (text === undefined) return fallback;
  return (
    parseIntStrict(text, { min: -ARR_MAX_VALUE, max: ARR_MAX_VALUE }).value ??
    fallback
  );
}

/* ------------------------------------------------------------------ nafukovací pole */

export interface ArrayCtx {
  /** počet prvků */
  n: number;
  /** pole má ARR_MAX_N prvků – Insert by se nevešel */
  full: boolean;
  /** prvky (výchozí text pole A) */
  values: readonly number[];
  /** výchozí x */
  xDefault: number;
  /** aktuální text pole x (dávka „8× Insert“ začíná od něj) */
  xText: () => string | undefined;
  insert: (x: number) => void;
  remove: () => void;
  insertMany: (x: number) => void;
  removeMany: () => void;
  build: (values: number[]) => void;
  random: () => void;
  empty: () => void;
  example: (e: ArrayExample) => void;
}

export function arrayActions(c: ArrayCtx): ActionDef[] {
  const fullReason = c.full
    ? `Vizualizace je omezená na ${ARR_MAX_N} prvků`
    : null;
  const emptyReason = c.n ? null : "Pole je prázdné – není co odebrat";
  return [
    {
      id: "create",
      label: "Vytvořit",
      title: `Nové pole: z vlastních čísel (nejvýše ${BUILD_MAX} čísel, −${ARR_MAX_VALUE} až ${ARR_MAX_VALUE}), stav z přednášky, náhodně nebo prázdné`,
      variants: [
        {
          id: "custom",
          label: "Vlastní",
          title: "Kapacita p = nejbližší mocnina dvojky ≥ n",
          args: [
            {
              kind: "list",
              name: "A",
              label: "A =",
              min: -ARR_MAX_VALUE,
              max: ARR_MAX_VALUE,
              maxCount: BUILD_MAX,
              default: c.values,
              placeholder: "např. 5, 8, 13",
            },
          ],
        },
        {
          id: "lecture",
          label: "Z přednášky",
          title: `${L01}: stavy, kterými je určený potenciál Φ`,
          args: [
            {
              kind: "choice",
              name: "ex",
              label: "stav",
              options: ARRAY_EXAMPLES.map((e) => ({
                value: e.id,
                label: e.label,
              })),
            },
          ],
        },
        { id: "random", label: "Náhodně", title: "10 náhodných čísel 0–99" },
        { id: "empty", label: "Prázdné", title: "Prázdné pole kapacity 1" },
      ],
      run: (v, variant) => {
        if (variant === "lecture") {
          const e = ARRAY_EXAMPLES.find((x) => x.id === strArg(v, "ex"));
          if (e) c.example(e);
        } else if (variant === "random") c.random();
        else if (variant === "empty") c.empty();
        else c.build(listArg(v, "A"));
      },
    },
    {
      id: "insert",
      label: "Insert(x)",
      title: "Vloží x na konec pole",
      disabledReason: fullReason,
      args: [
        {
          kind: "int",
          name: "x",
          label: "x =",
          min: -ARR_MAX_VALUE,
          max: ARR_MAX_VALUE,
          default: c.xDefault,
        },
      ],
      run: (v) => c.insert(numArg(v, "x")),
    },
    {
      id: "delete",
      label: "Delete",
      title: "Odebere poslední prvek",
      disabledReason: emptyReason,
      run: () => c.remove(),
    },
    {
      id: "insertMany",
      label: `${BATCH}× Insert`,
      title: `Vloží ${BATCH} hodnot x, x+1, … za sebou (x z pole u Insert(x))`,
      disabledReason: fullReason,
      run: () => c.insertMany(xFromText(c.xText(), c.xDefault)),
    },
    {
      id: "deleteMany",
      label: `${BATCH}× Delete`,
      title: `Odebere až ${BATCH} posledních prvků`,
      disabledReason: emptyReason,
      run: () => c.removeMany(),
    },
  ];
}

/* ------------------------------------------------------------------ binární počítadlo */

/** Příklad z knihy pro binární počítadlo: počáteční hodnota a kolik incrementů obrázek ukazuje. */
export interface CounterExample {
  id: string;
  figure: string;
  page: number;
  label: string;
  start: number;
  increments: number;
}

/** Průvodce, kap. 9.2: obr. 9.1 (prvních 8 kroků) a obr. 9.2 (potenciál a cena, 0 → 64). */
export const COUNTER_EXAMPLES: readonly CounterExample[] = [
  {
    id: "obr-9-1",
    figure: "9.1",
    page: 222,
    label: "Obr. 9.1 – prvních 8 kroků počítadla (0 → 8)",
    start: 0,
    increments: 8,
  },
  {
    id: "obr-9-2",
    figure: "9.2",
    page: 226,
    label: "Obr. 9.2 – potenciál a skutečná cena (0 → 64)",
    start: 0,
    increments: 64,
  },
];

/**
 * Řádek součtů potenciálové metody: „Σ skutečná = 33 ≤ 45 = Σ amortizovaná + Φ₀ − Φ“
 * (u rovnosti „=“ – binární počítadlo má amortizovanou cenu přesně 2).
 */
export function sumsText(real: number, bound: number): string {
  const fmt = (v: number) =>
    formatNum(Math.round(v * 100) / 100).replace("-", "−");
  return `Σ skutečná = ${fmt(real)} ${real === bound ? "=" : "≤"} ${fmt(bound)} = Σ amortizovaná + Φ₀ − Φ`;
}

export interface CounterCtx {
  /** výchozí hodnota pole „hodnota =“ */
  value: number;
  set: (v: number) => void;
  zero: () => void;
  increment: () => void;
  incrementMany: () => void;
  /** Vytvořit ▸ Příklady z knihy */
  example: (e: CounterExample) => void;
}

export function counterActions(c: CounterCtx): ActionDef[] {
  return [
    {
      id: "create",
      label: "Vytvořit",
      title: "Nastaví počítadlo; účtování začíná od Φ₀ = počet jedniček",
      variants: [
        {
          id: "value",
          label: "Hodnota",
          title: `Počáteční hodnota 0–${CNT_MAX_START}`,
          args: [
            {
              kind: "int",
              name: "v",
              label: "hodnota =",
              min: 0,
              max: CNT_MAX_START,
              default: c.value,
              width: "5rem",
            },
          ],
        },
        { id: "zero", label: "Nula", title: "Vynuluje počítadlo" },
        {
          id: "book",
          label: "Příklady z knihy",
          title:
            "Počítadlo od nuly jako na obrázku v Průvodci; Increment je připravený, každý se přehraje až ▶",
          args: [
            {
              kind: "choice",
              name: "fig",
              label: "Obrázek",
              options: COUNTER_EXAMPLES.map((e) => ({
                value: e.id,
                label: e.label,
              })),
              width: "min(100%, 22rem)",
            },
          ],
        },
      ],
      run: (v, variant) => {
        if (variant === "zero") c.zero();
        else if (variant === "book") {
          const e = COUNTER_EXAMPLES.find((x) => x.id === strArg(v, "fig"));
          if (e) c.example(e);
        } else c.set(numArg(v, "v"));
      },
    },
    {
      id: "increment",
      label: "Increment",
      title: "Přičte 1",
      run: () => c.increment(),
    },
    {
      id: "incrementMany",
      label: `${BATCH}× Increment`,
      title: `${BATCH} incrementů za sebou`,
      run: () => c.incrementMany(),
    },
  ];
}
