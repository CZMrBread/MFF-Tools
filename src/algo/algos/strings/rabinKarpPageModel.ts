/**
 * Model stránky Rabin–Karp bez Reactu: odkaz ?j=…&s=…&p=…&n=…, přechody běhů a nabídka operací.
 * RabinKarpPage.tsx jen drží stav, adresu a kreslí. Testy v rabinKarpPageModel.test.ts.
 */
import { numArg, strArg, type ActionDef } from "../../core/actionModel";
import { parseIntStrict } from "../../core/input";
import { rng } from "../../core/steps";
import { RK_EXAMPLES, rkExampleFor, type RkExample } from "./bookStrings";
import {
  cleanRkText,
  gcd,
  MAX_RK_HAYSTACK,
  MAX_RK_NEEDLE,
  N_MAX,
  N_MIN,
  P_MAX,
  P_MIN,
  rkValidate,
} from "./rabinKarp";

/* ------------------------------------------------------------------ zvětšení pásu */

/** výška pásu (seno, kódy, heše, jehla) při 1 : 1 (px) – převod delty CanvasFit na zvětšení */
export const RK_ZOOM_BASE = 170;
/**
 * Největší zvětšení pásu. KMP má 1,6× (pod pásem je automat), Rabin–Karp pod pásem nic nemá – s 1,6×
 * zabíral pás jen polovinu plátna 1920 × 1080. Šířku hlídá TextStripView (pás se do obalu vždy vejde).
 */
export const RK_ZOOM_MAX = 2.4;

/** Zvětšení pásu z delty CanvasFit: jen zvětšuje (menší plátno řeší posouvání pásu), nejvýš RK_ZOOM_MAX. */
export function rkZoom(delta: number): number {
  return Math.max(1, Math.min(RK_ZOOM_MAX, 1 + delta / RK_ZOOM_BASE));
}

/** Meze delty odpovídající rkZoom. */
export function rkZoomLimits(): { shrink: number; grow: number } {
  return { shrink: 0, grow: Math.round(RK_ZOOM_BASE * (RK_ZOOM_MAX - 1)) };
}

export interface RkRun {
  needle: string;
  text: string;
  P: number;
  N: number;
  example: string | null;
  note: { text: string; error: boolean };
  runId: number;
}

export const RK_DEFAULT: RkExample = RK_EXAMPLES[0];

function intFrom(
  raw: string | null | undefined,
  min: number,
  max: number,
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  return parseIntStrict(raw, { min, max }).value;
}

/** Stav po otevření: odkaz (neplatné hodnoty → výchozí s poznámkou), jinak výchozí příklad. */
export function initialRk(params: {
  j?: string | null;
  s?: string | null;
  p?: string | null;
  n?: string | null;
}): RkRun {
  const notes: string[] = [];
  const pick = (
    raw: string | null | undefined,
    max: number,
    def: string,
    what: string,
  ) => {
    if (!raw) return def;
    const c = cleanRkText(raw, max);
    if (c.error) {
      notes.push(
        `${what} z odkazu nejde použít (${c.error}) – použit výchozí příklad.`,
      );
      return null;
    }
    if (c.note) notes.push(c.note);
    return c.value;
  };
  let needle = pick(params.j, MAX_RK_NEEDLE, RK_DEFAULT.needle, "Jehla");
  let text = pick(params.s, MAX_RK_HAYSTACK, RK_DEFAULT.text, "Seno");
  if (needle === null || text === null) {
    needle = RK_DEFAULT.needle;
    text = RK_DEFAULT.text;
  }
  const P = intFrom(params.p, P_MIN, P_MAX);
  const N = intFrom(params.n, N_MIN, N_MAX);
  if (params.p && P === null)
    notes.push(
      `P z odkazu není celé číslo ${P_MIN} až ${P_MAX} – použito ${RK_DEFAULT.P}.`,
    );
  if (params.n && N === null)
    notes.push(
      `N z odkazu není celé číslo ${N_MIN} až ${N_MAX} – použito ${RK_DEFAULT.N}.`,
    );
  const run = {
    needle,
    text,
    P: P ?? RK_DEFAULT.P,
    N: N ?? RK_DEFAULT.N,
  };
  return {
    ...run,
    example: rkExampleFor(run.needle, run.text, run.P, run.N)?.id ?? null,
    note: { text: notes.join(" "), error: false },
    runId: 0,
  };
}

export type RkCmd =
  | { type: "search"; needle: string; text: string; P: number; N: number }
  | { type: "load"; e: RkExample };

export function rkReducer(st: RkRun, cmd: RkCmd): RkRun {
  const src = cmd.type === "load" ? cmd.e : cmd;
  const j = cleanRkText(src.needle, MAX_RK_NEEDLE);
  const s = cleanRkText(src.text, MAX_RK_HAYSTACK);
  const err = j.error
    ? `Jehla ι: ${j.error}`
    : s.error
      ? `Seno σ: ${s.error}`
      : null;
  if (err) return { ...st, note: { text: err, error: true } };
  const v = rkValidate(src.P, src.N, j.value.length, s.value.length);
  // úpravu jehly a sena ohlásil formulář akce (notice) – tady jen P, N
  const notes = [v.error ?? "", ...v.notes];
  return {
    needle: j.value,
    text: s.value,
    P: src.P,
    N: src.N,
    example: rkExampleFor(j.value, s.value, src.P, src.N)?.id ?? null,
    note: { text: notes.filter(Boolean).join(" "), error: v.error !== null },
    runId: st.runId + 1,
  };
}

export function rkCaption(st: RkRun): string {
  const base = `RabinKarp: ι = „${st.needle}“, σ = „${st.text}“, P = ${st.P}, N = ${st.N}`;
  const e = RK_EXAMPLES.find((x) => x.id === st.example);
  const tag = e?.label.split(" – ")[1];
  return tag ? `${base} – ${tag}` : base;
}

export const rkUrl = (st: RkRun) => ({
  j: st.needle,
  s: st.text,
  p: String(st.P),
  n: String(st.N),
});

/** Náhodný vstup: ι délky 3 a σ délky 24 nad {a, b, c} (jehla vložená), N ∈ {7, 11, 13} – kolize jsou vidět. */
export function randomRk(seed: number): {
  needle: string;
  text: string;
  P: number;
  N: number;
} {
  const r = rng(seed);
  const word = (n: number) =>
    Array.from({ length: n }, () => "abc"[Math.floor(r() * 3)]).join("");
  const needle = word(3);
  const base = [...word(24)];
  const at = Math.floor(r() * 22);
  base.splice(at, 3, ...needle);
  return {
    needle,
    text: base.join(""),
    P: 31,
    N: [7, 11, 13][Math.floor(r() * 3)],
  };
}

/* ------------------------------------------------------------------ nabídka operací */

export interface RkCtx {
  needle: string;
  text: string;
  P: number;
  N: number;
  search: (needle: string, text: string, P: number, N: number) => void;
  load: (e: RkExample) => void;
  random: (seed: number) => void;
  now: () => number;
}

export function rkActions(c: RkCtx): ActionDef[] {
  return [
    {
      id: "create",
      label: "Vytvořit",
      title: "Náhodný vstup (vlastní vstup zadejte v akci Hledat)",
      variants: [
        {
          id: "random",
          label: "Náhodně",
          title:
            "ι délky 3 a σ délky 24 nad {a, b, c}, malé N ∈ {7, 11, 13} – kolize jsou vidět",
        },
      ],
      goLabel: "Vytvořit",
      run: () => c.random(c.now()),
    },
    {
      id: "book",
      label: "Příklady z knihy",
      title:
        "Sena z Průvodce (str. 319–320); kniha číselný příklad nemá, P a N volíme my",
      variants: RK_EXAMPLES.map((e) => ({
        id: e.id,
        label: e.label,
        title: e.title,
      })),
      run: (_v, variant) => {
        const e = RK_EXAMPLES.find((x) => x.id === variant);
        if (e) c.load(e);
      },
    },
    {
      id: "search",
      label: "Hledat(ι, σ)",
      title:
        "RabinKarp: heš jehly, heše okének sena a porovnání znaků jen při shodě hešů; P a N nesoudělná",
      goLabel: "Hledat",
      args: [
        {
          kind: "text",
          name: "needle",
          label: "ι =",
          default: c.needle,
          pattern: /^\s*[a-zA-Z][a-zA-Z\s]*$/u,
          patternHint: `písmena a–z (a = 1, …, z = 26), nejvýše ${MAX_RK_NEEDLE}`,
          // úpravu (mezery, velká písmena, zkrácení) hlásí formulář – stránka ji po provedení neopakuje
          notice: (v) => cleanRkText(String(v), MAX_RK_NEEDLE).note || null,
        },
        {
          kind: "text",
          name: "text",
          label: "σ =",
          default: c.text,
          pattern: /^\s*[a-zA-Z][a-zA-Z\s]*$/u,
          patternHint: `písmena a–z, nejvýše ${MAX_RK_HAYSTACK}`,
          notice: (v) => cleanRkText(String(v), MAX_RK_HAYSTACK).note || null,
        },
        {
          kind: "int",
          name: "P",
          label: "P =",
          min: P_MIN,
          max: P_MAX,
          default: c.P,
          width: "4.5rem",
        },
        {
          kind: "int",
          name: "N",
          label: "N =",
          min: N_MIN,
          max: N_MAX,
          default: c.N,
          width: "6rem",
        },
      ],
      // soudělná P a N ohlásí formulář (zůstane otevřený, běh se nezmění) – kniha, str. 330
      check: (v) => {
        const g = gcd(numArg(v, "P"), numArg(v, "N"));
        return g > 1
          ? `P a N musí být nesoudělná (kniha, str. 330): gcd(${numArg(v, "P")}, ${numArg(v, "N")}) = ${g}.`
          : null;
      },
      run: (v) =>
        c.search(
          strArg(v, "needle"),
          strArg(v, "text"),
          numArg(v, "P"),
          numArg(v, "N"),
        ),
    },
  ];
}
