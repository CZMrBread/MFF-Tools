/**
 * Model stránky sufixového pole bez Reactu: příklady z přednášky L05 (docs/L05-suffix-handout.pdf),
 * přechody stránky (co je postavené, jaká fáze běží, poznámka k úpravě vstupu) a nabídka operací
 * pro ActionMenu. SuffixPage.tsx jen drží stav, adresu a vykreslení.
 */
import { strArg, type ActionDef } from "../../core/actionModel";
import type { FitLimits } from "../../core/canvasFit";
import {
  cleanBeta,
  commitAlpha,
  MAX_ALPHA,
  phaseTitle,
  type Phase,
} from "./suffix";

/* ------------------------------------------------------------------ společné texty */

/** Počet výskytů česky (KMP, Aho-Corasicková, Rabin-Karp): žádný výskyt, 1 výskyt, 2–4 výskyty, 5+ výskytů. */
export function hitsWord(n: number): string {
  return n === 0
    ? "žádný výskyt"
    : n === 1
      ? "1 výskyt"
      : n <= 4
        ? `${n} výskyty`
        : `${n} výskytů`;
}

/** největší zvětšení pásu textu (KMP, Rabin–Karp) na velkém plátně */
const STRIP_ZOOM_MAX = 1.6;

/**
 * Zvětšení pásu z delty CanvasFit: `base` = výška kresby, která se zvětšuje, při 1 : 1. Jen zvětšuje
 * (menší plátno řeší posouvání pásu), nejvýš STRIP_ZOOM_MAX×.
 */
export function stripZoom(delta: number, base: number): number {
  return Math.max(1, Math.min(STRIP_ZOOM_MAX, 1 + delta / Math.max(1, base)));
}

/** Meze delty odpovídající stripZoom. */
export function stripZoomLimits(base: number): FitLimits {
  return { shrink: 0, grow: Math.round(base * (STRIP_ZOOM_MAX - 1)) };
}

/* ------------------------------------------------------------------ příklady */

export interface SuffixExample {
  id: string;
  /** seno α */
  alpha: string;
  /** jehla β, kterou příklad hledá */
  beta: string;
  /** „Přednáška L05, slide 7“; null = další příklad stránky */
  source: string | null;
  /** co v příkladu sledovat */
  note: string;
}

export const SUFFIX_EXAMPLES: readonly SuffixExample[] = [
  {
    id: "banana",
    alpha: "banana",
    beta: "ana",
    source: "Přednáška L05, slide 6 a 13",
    note: "tabulka X, R, L (slide 6) a sloupce R₁, R₂, R₄ zdvojování (slide 13; R₈ = R₄, tady se končí už po R₄)",
  },
  {
    id: "barokoarokoko",
    alpha: "barokoarokoko",
    beta: "oko",
    source: "Přednáška L05, slide 7",
    note: "tabulka X, R, L; jehla oko má tři výskyty",
  },
  {
    id: "bananas",
    alpha: "bananas",
    beta: "ana",
    source: "Přednáška L05, slide 2",
    note: "v seně bananas se jehla ana vyskytuje hned dvakrát",
  },
  {
    id: "anna",
    alpha: "anna",
    beta: "ana",
    source: "Přednáška L05, slide 2",
    note: "v seně anna se jehla ana nevyskytuje vůbec",
  },
  {
    id: "mississippi",
    alpha: "mississippi",
    beta: "ssi",
    source: null,
    note: "tři kola zdvojování (k = 1, 2, 4), dlouhé společné prefixy",
  },
  {
    id: "abracadabra",
    alpha: "abracadabra",
    beta: "abra",
    source: null,
    note: "vzorek na začátku i na konci slova",
  },
];

/* ------------------------------------------------------------------ přechody */

export interface SuffixRun {
  /** postavený řetězec α (bez $) */
  applied: string;
  phase: Phase;
  /** pro který řetězec už proběhl Kasai – hledání pak navazuje na stav se sloupcem L */
  lcpFor: string | null;
  /** co se se vstupem stalo (odstraněné $, zkrácení, nové postavení) */
  note: { text: string; error: boolean };
  /** roste s každou spuštěnou operací (Visualizer posune plátno do záběru) */
  runId: number;
  /** příklad, ze kterého je postavené α (název běhu uvede zdroj) */
  example: string | null;
}

export type SuffixCmd =
  /** operace nad textem z pole α: stavba, Kasai, hledání */
  | { type: "run"; text: string; next: Phase }
  /** nový řetězec (příklad, náhodný, výchozí) – rovnou se postaví */
  | { type: "load"; alpha: string; restart: boolean; example: string | null };

export function initialSuffix(
  alpha: string,
  example: string | null,
): SuffixRun {
  return {
    applied: alpha,
    phase: { kind: "build" },
    lcpFor: null,
    note: { text: "", error: false },
    runId: 0,
    example,
  };
}

/**
 * Každá operace nejdřív převezme aktuální text z pole α – Kasai ani hledání tak nikdy neběží nad dříve
 * postaveným řetězcem, zatímco pole ukazuje jiný.
 */
export function suffixReducer(st: SuffixRun, cmd: SuffixCmd): SuffixRun {
  if (cmd.type === "load")
    return {
      applied: cmd.alpha,
      phase: { kind: "build" },
      lcpFor: null,
      note: { text: "", error: false },
      runId: st.runId + (cmd.restart ? 1 : 0),
      example: cmd.example,
    };
  const { next } = cmd;
  const c = commitAlpha(cmd.text, st.applied, next.kind !== "build");
  if (c.alpha === null) return { ...st, note: { text: c.note, error: true } };
  const same = c.alpha === st.applied;
  return {
    applied: c.alpha,
    phase: next,
    lcpFor:
      next.kind === "kasai"
        ? c.alpha
        : next.kind === "build" || !same
          ? null
          : st.lcpFor,
    note: { text: c.note, error: false },
    runId: st.runId + 1,
    // ruční Postavit (i stejného slova) už není příklad z přednášky
    example: same && next.kind !== "build" ? st.example : null,
  };
}

/** Hledání navazuje na stav po Kasai (sloupec L zůstane). */
export const withLcp = (st: SuffixRun) =>
  st.phase.kind === "search" && st.lcpFor === st.applied;

/** Název běhu nad zprávou; u příkladu z přednášky i zdroj. */
export function suffixCaption(st: SuffixRun): string {
  const base = phaseTitle(st.applied, st.phase);
  const e = SUFFIX_EXAMPLES.find((x) => x.id === st.example);
  return e?.source && e.alpha === st.applied ? `${base} – ${e.source}` : base;
}

/* ------------------------------------------------------------------ nabídka operací */

export interface SuffixCtx {
  /** postavené α (výchozí text pole α) */
  applied: string;
  /** výchozí vzorek β */
  beta: string;
  /** aktuální text pole α (Kasai a hledání ho převezmou) */
  alphaText: () => string;
  run: (text: string, next: Phase) => void;
  load: (e: SuffixExample) => void;
  /** Vytvořit ▸ Náhodně: semínko a délka slova */
  random: (seed: number, length: number) => void;
  /** semínko pro Náhodně */
  now: () => number;
}

/** ⚠ k textu α / β už při psaní: co se ze vstupu vynechá nebo zkrátí. */
function cleanNotice(text: string, limit: number | null): string | null {
  const raw = String(text ?? "");
  const stripped = raw.replace(/[$\s]/g, "");
  if (stripped !== raw && stripped.length > 0)
    return "$ a mezery budou vynechány.";
  if (limit !== null && stripped.length > limit)
    return `Zkráceno na ${limit} znaků.`;
  return null;
}

/** výchozí délka náhodného slova */
export const RANDOM_ALPHA_LEN = 10;

export function suffixActions(c: SuffixCtx): ActionDef[] {
  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    title: "Nový řetězec α",
    variants: [
      {
        id: "random",
        label: "Náhodně",
        title: "Náhodné slovo nad abecedou {a, b} nebo {a, b, c}",
        args: [
          {
            kind: "int",
            name: "len",
            label: "délka |α| =",
            min: 1,
            max: MAX_ALPHA,
            default: RANDOM_ALPHA_LEN,
          },
        ],
      },
    ],
    run: (v, variant) => {
      if (variant === "random")
        c.random(c.now(), Number(v.len ?? RANDOM_ALPHA_LEN));
    },
  };
  const ops: ActionDef[] = [
    {
      id: "build",
      label: "Postavit X(α)",
      title: `Postaví sufixové pole zdvojováním; α nejvýše ${MAX_ALPHA} znaků, bez $ a mezer`,
      goLabel: "Postavit X",
      args: [
        {
          kind: "text",
          name: "alpha",
          label: "α =",
          default: c.applied,
          maxLength: MAX_ALPHA + 16,
          check: (v) =>
            String(v ?? "").replace(/[$\s]/g, "")
              ? null
              : "Zadejte neprázdný řetězec α (znak $ a mezery se nepočítají).",
          notice: (v) => cleanNotice(String(v), MAX_ALPHA),
        },
      ],
      run: (v) => c.run(strArg(v, "alpha"), { kind: "build" }),
    },
    {
      id: "kasai",
      label: "LCP pole (Kasai)",
      title: "Spočítá LCP pole Kasaiovým algoritmem nad postaveným X",
      run: () => c.run(c.alphaText(), { kind: "kasai" }),
    },
    {
      id: "search",
      label: "Hledat(β)",
      title: "Najde všechny výskyty β binárním vyhledáváním v X",
      goLabel: "Hledat β",
      args: [
        {
          kind: "text",
          name: "beta",
          label: "β =",
          default: c.beta,
          pattern: /[^$\s]/,
          patternHint:
            "aspoň jeden znak vzorku (znak $ a mezery se nepočítají)",
          maxLength: MAX_ALPHA + 16,
          notice: (v) => cleanNotice(String(v), null),
        },
      ],
      run: (v) =>
        c.run(c.alphaText(), {
          kind: "search",
          beta: cleanBeta(strArg(v, "beta")),
        }),
    },
  ];
  const examples: ActionDef = {
    id: "examples",
    label: "Příklady z knihy",
    title: "Slova z přednášky L05 a další příklady",
    variants: SUFFIX_EXAMPLES.map((e) => ({
      id: e.id,
      label: e.beta ? `${e.alpha} / ${e.beta}` : e.alpha,
      title: (e.source ? `${e.source}: ` : "") + e.note,
    })),
    run: (_v, variant) => {
      const e = SUFFIX_EXAMPLES.find((x) => x.id === variant);
      if (e) c.load(e);
    },
  };
  // jako u ostatních modulů: vstup (Vytvořit, Příklady z knihy) první, pak operace
  return [create, examples, ...ops];
}
