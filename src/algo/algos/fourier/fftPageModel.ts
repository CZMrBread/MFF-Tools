/**
 * Model stránky #/fft/fft bez Reactu: běh (operace + vstup), odkaz za # (parametry tam a zpět), nabídka
 * operací pro ActionMenu, název běhu a výpočet kroků. FftPage.tsx jen drží stav a kreslí.
 *
 * Odkaz: `?p=0,1,…` (FFT), `op=ifft` (+ `y=fft` = y je FFT(p)), `op=mul&p=…&q=…&d=alg|bf` (+ `b=10`
 * násobení čísel), `f=z17` = těleso ℤ₁₇. Prázdná adresa = výchozí příklad. Testy fftPageModel.test.ts.
 */
import type { ActionDef, ChoiceArgDef } from "../../core/actionModel";
import { parseNumberList } from "../../core/input";
import { materialize, rng, type Step } from "../../core/steps";
import { FFT_EXAMPLES, type FftExample, type FftInput } from "./bookExamples";
import {
  fft,
  fftSteps,
  ifftSteps,
  MAX_N,
  toField,
  transformSize,
  type FftState,
} from "./fft";
import { FIELDS, z17Notice, type FieldId } from "./field";
import { MAX_FACTOR, mulSteps } from "./polyMul";

export type { FftOp } from "./bookExamples";

export interface FftRun extends FftInput {
  /** příklad, ze kterého vstup pochází (název běhu uvede zdroj) */
  example: string | null;
  /** roste s každým spuštěním (nová sada kroků, posun plátna do záběru) */
  runId: number;
}

/** hodnoty koeficientů v nabídce i v odkazu */
export const VALUE_MIN = -99;
export const VALUE_MAX = 99;

export const DEFAULT_RUN: FftRun = {
  op: "fft",
  field: "C",
  p: [0, 1, 2, 3, 4, 5, 6, 7],
  q: [4, 5, 6],
  detail: "alg",
  yFromFft: false,
  base: null,
  example: null,
  runId: 0,
};

/* ------------------------------------------------------------------ kroky */

const padTo = (xs: readonly number[], n: number) => [
  ...xs,
  ...new Array<number>(n - xs.length).fill(0),
];

/** číslo z číslic od nejnižšího řádu */
const fromDigits = (d: readonly number[], base: number) =>
  d.reduce((s, x, i) => s + x * base ** i, 0);

/** Kroky běhu (nová sada kroků = nové pole – přehrávač stojí na kroku 1). */
export function runSteps(run: FftInput): Step<FftState>[] {
  const f = FIELDS[run.field];
  if (run.op === "mul")
    return materialize(
      mulSteps(
        run.p,
        run.q,
        run.field,
        run.detail,
        run.base
          ? {
              a: fromDigits(run.p, run.base),
              b: fromDigits(run.q, run.base),
              base: run.base,
            }
          : undefined,
      ),
    );
  const n = transformSize(run.p.length);
  const x = toField(padTo(run.p, n), run.field);
  const steps =
    run.op === "ifft"
      ? materialize(ifftSteps(run.yFromFft ? fft(x, f) : x, run.field))
      : materialize(fftSteps(x, run.field));
  // doplněný vstup: úvodní hláška ukáže, s jakým vektorem se opravdu počítá
  if (
    n !== run.p.length &&
    steps.length &&
    !(run.op === "ifft" && run.yFromFft)
  )
    steps[0] = {
      ...steps[0],
      message: `${padNotice(run.p.length)} Počítáme s ${list(padTo(run.p, n))}. ${steps[0].message}`,
    };
  return steps;
}

/** Poznámka k doplnění nulami na mocninu dvou (n ≥ 4); null = délka už je 2ᵏ. */
export function padNotice(len: number): string | null {
  if (len < 1 || len > MAX_N) return null;
  const n = transformSize(len);
  return n === len
    ? null
    : `Doplněno nulami na n = ${n} (FFT potřebuje n = 2ᵏ).`;
}

/** Spojí poznámky k vstupu (doplnění nulami, mod 17); null = žádná. */
const notes = (...xs: (string | null)[]) =>
  xs.filter((x): x is string => !!x).join(" ") || null;

/** Knižní (nebo vlastní) příklad, kterému vstup přesně odpovídá – odkaz pak má v nadpisu zdroj. */
export function exampleFor(run: FftInput): FftExample | undefined {
  const same = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  return FFT_EXAMPLES.find(
    (e) =>
      e.op === run.op &&
      e.field === run.field &&
      same(e.p, run.p) &&
      (run.op !== "mul" ||
        (same(e.q, run.q) && e.detail === run.detail && e.base === run.base)) &&
      (run.op !== "ifft" || e.yFromFft === run.yFromFft),
  );
}

/* ------------------------------------------------------------------ název */

const list = (xs: readonly number[]) =>
  "(" + xs.map((x) => String(x).replace("-", "−")).join(", ") + ")";

/** Název běhu nad zprávou; u knižního příkladu i zdroj. */
export function fftCaption(run: FftRun): string {
  const inZ = run.field === "Z17" ? " v ℤ₁₇" : "";
  const name =
    run.op === "mul"
      ? `Násobení ${list(run.p)} · ${list(run.q)}`
      : run.op === "ifft"
        ? `Inverzní FFT(${run.yFromFft ? `F${list(run.p)}` : list(run.p).slice(1, -1)})`
        : `FFT${list(run.p)}`;
  const e = FFT_EXAMPLES.find((x) => x.id === run.example);
  return name + inZ + (e?.source ? ` – ${e.source}` : "");
}

/* ------------------------------------------------------------------ odkaz */

function readList(
  text: string | null,
  maxCount: number,
): { values: number[] | null; bad: boolean } {
  if (text === null) return { values: null, bad: false };
  const r = parseNumberList(text, {
    min: VALUE_MIN,
    max: VALUE_MAX,
    integerOnly: true,
  });
  if (r.values.length === 0 || r.ignored.length > 0 || r.valid > maxCount)
    return { values: null, bad: true };
  return { values: r.values, bad: false };
}

/** Parametry odkazu → běh. Vadný odkaz = výchozí příklad s hláškou; odkaz se při otevření nepřepisuje. */
export function parseFftUrl(params: URLSearchParams): {
  run: FftRun;
  notice: string | null;
} {
  if (!params.has("p")) return { run: DEFAULT_RUN, notice: null };
  const opText = params.get("op");
  const op = opText === "ifft" || opText === "mul" ? opText : "fft";
  const field: FieldId = params.get("f") === "z17" ? "Z17" : "C";
  const max = op === "mul" ? MAX_FACTOR : MAX_N;
  const p = readList(params.get("p"), max);
  const q = op === "mul" ? readList(params.get("q") ?? "", MAX_FACTOR) : null;
  if (!p.values || (q && !q.values))
    return {
      run: DEFAULT_RUN,
      notice: `Vstup z odkazu nešel použít (celá čísla ${VALUE_MIN.toString().replace("-", "−")} až ${VALUE_MAX}, nejvýš ${max} hodnot) – zobrazen výchozí příklad.`,
    };
  // základ soustavy (násobení čísel): celé 2–16 a všechny číslice obou činitelů menší než základ
  const bText = params.get("b");
  const b = Number(bText);
  const digits = [...p.values, ...(q?.values ?? [])];
  const baseOk =
    op === "mul" &&
    bText !== null &&
    Number.isInteger(b) &&
    b >= 2 &&
    b <= 16 &&
    digits.every((d) => d >= 0 && d < b);
  const baseNotice =
    op === "mul" && bText !== null && !baseOk
      ? `Základ b = ${bText} z odkazu nešel použít (celé číslo 2–16 a číslice 0 až b − 1) – násobí se jen polynomy.`
      : null;
  const input: FftInput = {
    op,
    field,
    p: p.values,
    q: q?.values ?? DEFAULT_RUN.q,
    detail: params.get("d") === "bf" ? "bf" : "alg",
    yFromFft: op === "ifft" && params.get("y") === "fft",
    base: baseOk ? b : null,
  };
  return {
    // odkaz na knižní příklad: nadpis uvede zdroj jako po načtení z nabídky
    run: { ...DEFAULT_RUN, ...input, example: exampleFor(input)?.id ?? null },
    notice: baseNotice,
  };
}

/** Běh → parametry odkazu (jen to, co se od výchozích hodnot liší). */
export function fftUrlParams(run: FftInput): Record<string, string> {
  const out: Record<string, string> = {};
  if (run.op !== "fft") out.op = run.op;
  out.p = run.p.join(",");
  if (run.op === "mul") {
    out.q = run.q.join(",");
    out.d = run.detail;
    if (run.base) out.b = String(run.base);
  }
  if (run.op === "ifft" && run.yFromFft) out.y = "fft";
  if (run.field === "Z17") out.f = "z17";
  return out;
}

/* ------------------------------------------------------------------ náhodný vstup */

/** Náhodná FFT: n celých čísel 0–9 v ℂ (výchozí n = 8). */
export function randomInput(seed: number, n = 8): FftInput {
  const r = rng(seed);
  return {
    ...DEFAULT_RUN,
    op: "fft",
    p: Array.from({ length: n }, () => Math.floor(r() * 10)),
  };
}

/** počty prvků náhodného vstupu */
export const RANDOM_SIZES = [4, 8, 16] as const;

/* ------------------------------------------------------------------ nabídka */

export interface FftCtx {
  /** aktuální běh (výchozí hodnoty polí) */
  run: FftRun;
  start: (input: Partial<FftInput> & Pick<FftInput, "op">) => void;
  load: (e: FftExample) => void;
  /** Vytvořit ▸ Náhodně: semínko a počet prvků */
  random: (seed: number, n: number) => void;
  /** semínko pro Náhodně */
  now: () => number;
}

const fieldArg = (def: FieldId): ChoiceArgDef => ({
  kind: "choice",
  name: "f",
  label: "těleso",
  options: [
    { value: "C", label: "ℂ (ω = exp(2πi/n))" },
    { value: "Z17", label: "ℤ₁₇ (ω = 2 pro n = 8)" },
  ],
  default: def,
});

const listArg = (name: string, label: string, def: number[], max: number) =>
  ({
    kind: "list",
    name,
    label,
    min: VALUE_MIN,
    max: VALUE_MAX,
    maxCount: max,
    default: def,
  }) as const;

export function fftActions(c: FftCtx): ActionDef[] {
  const { run } = c;
  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    title: "Nový vstup FFT",
    variants: [
      {
        id: "random",
        label: "Náhodně",
        title: "FFT n náhodných čísel 0–9",
        args: [
          {
            kind: "choice",
            name: "n",
            label: "n =",
            options: RANDOM_SIZES.map((s) => ({
              value: String(s),
              label: String(s),
            })),
            default: "8",
          },
        ],
      },
    ],
    run: (v, variant) => {
      if (variant === "random") c.random(c.now(), Number(v.n ?? 8));
    },
  };
  const ops: ActionDef[] = [
    {
      id: "fft",
      label: "FFT(p)",
      title: `Rychlá Fourierova transformace koeficientů p (nejvýš ${MAX_N} celých čísel; doplní se nulami na n = 4, 8 nebo 16)`,
      goLabel: "Spočítat FFT",
      args: [
        listArg("p", "p =", run.op === "fft" ? run.p : DEFAULT_RUN.p, MAX_N),
        fieldArg(run.field),
      ],
      notice: (v) =>
        notes(
          padNotice((v.p as number[]).length),
          v.f === "Z17" ? z17Notice(v.p as number[]) : null,
        ),
      run: (v) =>
        c.start({
          op: "fft",
          p: v.p as number[],
          field: v.f as FieldId,
        }),
    },
    {
      id: "ifft",
      label: "Inverzní FFT(y)",
      title: "Z hodnot y = P(ωʲ) zpět na koeficienty: FFT s ω̄ a vydělení n",
      goLabel: "Spočítat inverzní FFT",
      variants: [
        {
          id: "own",
          label: "Zadat y",
          title: `Vlastní hodnoty y (nejvýš ${MAX_N} celých čísel)`,
          args: [
            listArg(
              "y",
              "y =",
              run.op === "ifft" && !run.yFromFft
                ? run.p
                : [8, 0, 0, 0, 0, 0, 0, 0],
              MAX_N,
            ),
            fieldArg(run.field),
          ],
        },
        {
          id: "result",
          label: "y = FFT(p)",
          title:
            "Inverzní FFT výsledku FFT aktuálního p – vrátí p (inverze po transformaci je identita)",
        },
      ],
      notice: (v, variant) =>
        variant !== "result" && v.f === "Z17"
          ? z17Notice(v.y as number[])
          : null,
      run: (v, variant) =>
        variant === "result"
          ? c.start({
              op: "ifft",
              p: run.p,
              field: run.field,
              yFromFft: true,
            })
          : c.start({
              op: "ifft",
              p: v.y as number[],
              field: v.f as FieldId,
              yFromFft: false,
            }),
    },
    {
      id: "mul",
      label: "Násobení P · Q",
      title: `Násobení polynomů přes FFT: FFT obou, součin po složkách, inverzní FFT (nejvýš ${MAX_FACTOR} koeficientů v každém)`,
      goLabel: "Vynásobit",
      args: [
        listArg("P", "P =", run.op === "mul" ? run.p : [1, 2, 3], MAX_FACTOR),
        listArg("Q", "Q =", run.op === "mul" ? run.q : [4, 5, 6], MAX_FACTOR),
        fieldArg(run.field),
        {
          kind: "choice",
          name: "d",
          label: "kroky",
          options: [
            { value: "alg", label: "jen kroky algoritmu" },
            { value: "bf", label: "i všechny kroky FFT" },
          ],
          default: run.detail,
        },
      ],
      notice: (v) =>
        v.f === "Z17"
          ? z17Notice([...(v.P as number[]), ...(v.Q as number[])])
          : null,
      run: (v) =>
        c.start({
          op: "mul",
          p: v.P as number[],
          q: v.Q as number[],
          field: v.f as FieldId,
          detail: v.d === "bf" ? "bf" : "alg",
        }),
    },
  ];
  const examples: ActionDef = {
    id: "examples",
    label: "Příklady z knihy",
    title:
      "Vektory ze cvičení 17.3.2, násobení čísel (cv. 17.5.2), těleso ℤ₁₇ (str. 439)",
    variants: FFT_EXAMPLES.map((e) => ({
      id: e.id,
      label: e.label,
      title: (e.source ? `${e.source}: ` : "Vlastní příklad: ") + e.note,
    })),
    run: (_v, variant) => {
      const e = FFT_EXAMPLES.find((x) => x.id === variant);
      if (e) c.load(e);
    },
  };
  // jako u ostatních modulů: vstup (Vytvořit, Příklady z knihy) první, pak operace
  return [create, examples, ...ops];
}
