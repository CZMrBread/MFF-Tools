/**
 * Model stránky #/fft/net (FFT2 / motýlková síť obr. 17.4) bez Reactu: běh (vstup, těleso, podrobnost),
 * příklady z knihy, odkaz za # (`?x=0,1,…&f=z17&d=layer`), nabídka operací pro ActionMenu a kroky.
 * FftNetPage.tsx jen drží stav a kreslí. Testy fft2PageModel.test.ts.
 */
import type { ActionDef } from "../../core/actionModel";
import { parseNumberList } from "../../core/input";
import { materialize, rng, type Step } from "../../core/steps";
import { MAX_N, toField, transformSize } from "./fft";
import { padNotice } from "./fftPageModel";
import { fft2Steps, type NetDetail, type NetState } from "./fft2";
import { z17Notice, type FieldId } from "./field";

export interface NetInput {
  field: FieldId;
  /** vstup x_0 … (doplní se nulami na n = 4, 8 nebo 16) */
  x: number[];
  detail: NetDetail;
}

export interface NetRun extends NetInput {
  /** příklad, ze kterého vstup pochází (název běhu uvede zdroj) */
  example: string | null;
  /** roste s každým spuštěním (nová sada kroků) */
  runId: number;
}

export interface NetExample extends NetInput {
  id: string;
  label: string;
  /** „Cvičení 17.3.2, str. 432“; null = vlastní příklad */
  source: string | null;
  note: string;
}

export const VALUE_MIN = -99;
export const VALUE_MAX = 99;

const RANGE8 = [0, 1, 2, 3, 4, 5, 6, 7];
const base = { field: "C" as FieldId, detail: "bf" as NetDetail };

/**
 * Kniha nemá číselně propočtenou síť – obr. 17.4 je schéma s obecnými x₀ … x₇. Vektory jsou ze cvičení
 * 17.3.2 (str. 432) a z tělesa ℤ₁₇ (str. 439); výsledky hlídají fft2PageModel.test.ts.
 */
export const NET_EXAMPLES: readonly NetExample[] = [
  {
    ...base,
    id: "fig",
    label: "Obr. 17.4: x = (0, 1, …, 7)",
    x: RANGE8,
    source: "Obr. 17.4, str. 438",
    note: "síť pro vstup velikosti 8 jako na obrázku (kniha má obecné x₀ … x₇, hodnoty rovné indexům jsou doplněk stránky); výstup je stejný jako z rekurzivní FFT",
  },
  {
    ...base,
    id: "layers",
    label: "Obr. 17.4 po vrstvách",
    x: RANGE8,
    detail: "layer",
    source: "Hradlová síť, str. 439",
    note: "všechny operace v jedné vrstvě jsou na sobě nezávislé – síť je počítá paralelně, takže pracuje v čase Θ(log n)",
  },
  {
    ...base,
    id: "ones",
    label: "(1, 1, …, 1)",
    x: [1, 1, 1, 1, 1, 1, 1, 1],
    source: "Cvičení 17.3.2, str. 432",
    note: "konstantní vektor (x, …, x) má obraz (n·x, 0, …, 0)",
  },
  {
    ...base,
    id: "alternating",
    label: "(1, −1, 1, −1, …)",
    x: [1, -1, 1, -1, 1, -1, 1, -1],
    source: "Cvičení 17.3.2, str. 432",
    note: "střídavý vektor má obraz s jedinou nenulovou složkou n na pozici n/2",
  },
  {
    ...base,
    id: "every-other",
    label: "(1, 0, 1, 0, …)",
    x: [1, 0, 1, 0, 1, 0, 1, 0],
    source: "Cvičení 17.3.2, str. 432",
    note: "obraz (4, 0, 0, 0, 4, 0, 0, 0) – po zrcadlení jsou jedničky v horní polovině sítě",
  },
  {
    ...base,
    id: "z17",
    label: "ℤ₁₇: x = (0, 1, …, 7)",
    x: RANGE8,
    field: "Z17",
    source: "FFT v konečných tělesech, str. 439",
    note: "p = 2⁴ + 1 = 17, ω = 2 je primitivní 8. odmocnina z jedné; obraz (11, 8, 14, 6, 13, 3, 12, 1) bez zaokrouhlovacích chyb",
  },
  {
    ...base,
    id: "n4",
    label: "n = 4: (1, 2, 3, 4)",
    x: [1, 2, 3, 4],
    source: null,
    note: "2 vrstvy, ω = i; obraz (10, −2−2i, −2, −2+2i)",
  },
  {
    ...base,
    id: "n16",
    label: "n = 16: (0, 1, …, 15)",
    x: Array.from({ length: 16 }, (_, i) => i),
    source: null,
    note: "4 vrstvy po 8 motýlcích; vstupy v pořadí bitového zrcadlení 0, 8, 4, 12, 2, 10, …",
  },
];

export const NET_DEFAULT: NetRun = {
  ...base,
  x: RANGE8,
  example: "fig",
  runId: 0,
};

/* ------------------------------------------------------------------ kroky */

/** Kroky běhu (nová sada = nové pole – přehrávač stojí na kroku 1). */
export function netRunSteps(run: NetInput): Step<NetState>[] {
  const n = transformSize(run.x.length);
  const xs = [...run.x, ...new Array<number>(n - run.x.length).fill(0)];
  return materialize(fft2Steps(toField(xs, run.field), run.field, run.detail));
}

/**
 * Krok, ve kterém se počítá kroužek (vrstva, řádek) – ř. 8 jeho motýlku, resp. celé vrstvy. Klik na
 * kroužek přeskočí sem. Nenalezeno = −1.
 */
export function stepOfGate(
  steps: readonly Step<NetState>[],
  layer: number,
  row: number,
): number {
  return steps.findIndex(
    (s) =>
      s.line === 8 && s.state.layer === layer && s.state.gates.includes(row),
  );
}

/** Náhodný vstup: n celých čísel 0–9 v ℂ. */
export function netRandom(seed: number, n: number): NetInput {
  const r = rng(seed);
  return {
    ...base,
    x: Array.from({ length: n }, () => Math.floor(r() * 10)),
  };
}

/* ------------------------------------------------------------------ název */

const list = (xs: readonly number[]) =>
  "(" + xs.map((x) => String(x).replace("-", "−")).join(", ") + ")";

export function netCaption(run: NetRun): string {
  const e = NET_EXAMPLES.find((x) => x.id === run.example);
  return (
    `FFT2${list(run.x)}` +
    (run.field === "Z17" ? " v ℤ₁₇" : "") +
    (e?.source ? ` – ${e.source}` : "")
  );
}

/* ------------------------------------------------------------------ odkaz */

/** Parametry odkazu → běh. Vadný odkaz = výchozí příklad s hláškou; odkaz se při otevření nepřepisuje. */
export function parseNetUrl(params: URLSearchParams): {
  run: NetRun;
  notice: string | null;
} {
  if (!params.has("x")) return { run: NET_DEFAULT, notice: null };
  const r = parseNumberList(params.get("x") ?? "", {
    min: VALUE_MIN,
    max: VALUE_MAX,
    integerOnly: true,
  });
  if (r.values.length === 0 || r.ignored.length > 0 || r.valid > MAX_N)
    return {
      run: NET_DEFAULT,
      notice: `Vstup z odkazu nešel použít (celá čísla −${-VALUE_MIN} až ${VALUE_MAX}, nejvýš ${MAX_N} hodnot) – zobrazen výchozí příklad.`,
    };
  const input: NetInput = {
    x: r.values,
    field: params.get("f") === "z17" ? "Z17" : "C",
    detail: params.get("d") === "layer" ? "layer" : "bf",
  };
  return {
    // odkaz na knižní příklad: nadpis uvede zdroj jako po načtení z nabídky
    run: {
      ...NET_DEFAULT,
      ...input,
      example: netExampleFor(input)?.id ?? null,
    },
    notice: null,
  };
}

/** Příklad, kterému vstup přesně odpovídá (vstup, těleso i podrobnost kroků). */
export function netExampleFor(input: NetInput): NetExample | undefined {
  return NET_EXAMPLES.find(
    (e) =>
      e.field === input.field &&
      e.detail === input.detail &&
      e.x.length === input.x.length &&
      e.x.every((v, i) => v === input.x[i]),
  );
}

/** Běh → parametry odkazu (jen to, co se od výchozích hodnot liší). */
export function netUrlParams(run: NetInput): Record<string, string> {
  const out: Record<string, string> = { x: run.x.join(",") };
  if (run.field === "Z17") out.f = "z17";
  if (run.detail === "layer") out.d = "layer";
  return out;
}

/* ------------------------------------------------------------------ nabídka */

export interface NetCtx {
  run: NetRun;
  start: (input: NetInput) => void;
  load: (e: NetExample) => void;
  /** Vytvořit ▸ Náhodně: semínko a počet prvků */
  random: (seed: number, n: number) => void;
  now: () => number;
}

export function netActions(c: NetCtx): ActionDef[] {
  const { run } = c;
  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    title: "Nový vstup sítě",
    variants: [
      {
        id: "random",
        label: "Náhodně",
        title: "FFT2 n náhodných čísel 0–9",
        args: [
          {
            kind: "choice",
            name: "n",
            label: "n =",
            options: [4, 8, 16].map((n) => ({
              value: String(n),
              label: String(n),
            })),
            default: "8",
          },
        ],
      },
    ],
    run: (v, variant) => {
      if (variant === "random") c.random(c.now(), Number(v.n ?? 8) || 8);
    },
  };
  const fft2: ActionDef = {
    id: "fft2",
    label: "FFT2(x)",
    title: `Nerekurzivní FFT po vrstvách sítě (nejvýš ${MAX_N} celých čísel; doplní se nulami na n = 4, 8 nebo 16)`,
    goLabel: "Spočítat FFT2",
    args: [
      {
        kind: "list",
        name: "x",
        label: "x =",
        min: VALUE_MIN,
        max: VALUE_MAX,
        maxCount: MAX_N,
        default: run.x,
      },
      {
        kind: "choice",
        name: "f",
        label: "těleso",
        options: [
          { value: "C", label: "ℂ (ω = exp(2πi/n))" },
          { value: "Z17", label: "ℤ₁₇ (ω = 2 pro n = 8)" },
        ],
        default: run.field,
      },
      {
        kind: "choice",
        name: "d",
        label: "kroky",
        options: [
          { value: "bf", label: "každý motýlek" },
          { value: "layer", label: "po vrstvách" },
        ],
        default: run.detail,
      },
    ],
    // v ℤ₁₇ se hodnoty mimo 0–16 vezmou mod 17 – formulář to řekne předem
    notice: (v) =>
      [
        padNotice((v.x as number[]).length),
        v.f === "Z17" ? z17Notice(v.x as number[]) : null,
      ]
        .filter(Boolean)
        .join(" ") || null,
    run: (v) =>
      c.start({
        x: v.x as number[],
        field: v.f === "Z17" ? "Z17" : "C",
        detail: v.d === "layer" ? "layer" : "bf",
      }),
  };
  const examples: ActionDef = {
    id: "examples",
    label: "Příklady z knihy",
    title: "Síť obr. 17.4, vektory ze cvičení 17.3.2 a těleso ℤ₁₇ (str. 439)",
    variants: NET_EXAMPLES.map((e) => ({
      id: e.id,
      label: e.label,
      title: (e.source ? `${e.source}: ` : "Vlastní příklad: ") + e.note,
    })),
    run: (_v, variant) => {
      const e = NET_EXAMPLES.find((x) => x.id === variant);
      if (e) c.load(e);
    },
  };
  // jako u ostatních modulů: vstup (Vytvořit, Příklady z knihy) první, pak výpočet
  return [create, examples, fft2];
}
