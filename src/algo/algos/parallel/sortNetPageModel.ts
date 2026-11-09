/**
 * Model stránky třídicích sítí (#/parallel/sortnet) bez Reactu: konfigurace (síť, vstup, zápis, vynechané
 * komparátory, orientace), odkaz `?net=t&a=5,2,7,1,8,3,6,4&lay=seq&x=3&o=h`, příklady z knihy
 * (obr. 15.6–15.10, cv. 15.3.6–7), generátory vstupu, nabídka operací pro ActionMenu a legenda.
 * SortNetPage.tsx jen drží stav, adresu a vykreslení.
 */
import {
  listArg,
  numArg,
  strArg,
  type ActionDef,
} from "../../core/actionModel";
import { parseNumberList } from "../../core/input";
import { rng } from "../../core/steps";
import type { LegendItem } from "../../core/Visualizer";
import type { Orient } from "../../views/comparatorLayout";
import {
  buildNet,
  isBitonic,
  isSorted,
  NET_KINDS,
  separatorSplit,
  sub,
  validSizes,
  type NetKind,
  type SortNet,
} from "./sortNet";

export interface SortNetConfig {
  kind: NetKind;
  /** vstup x₀ … xₙ₋₁ (n = délka) */
  input: number[];
  /** bublinka „jak je zapsaná“ (obr. 15.6) – jen do n = 8 */
  seq: boolean;
  /** indexy vynechaných komparátorů (rozbitá síť pro 0-1 princip) */
  removed: number[];
  /** kresba: svisle jako v knize / vodorovně; null = podle n */
  orient: Orient | null;
}

export const MIN_VALUE = 0;
export const MAX_VALUE = 99;
export const MAX_N = 16;
/** „jak je zapsaná“ nejvýš pro tolik vodičů (n = 16 by mělo 120 řádků) */
export const MAX_SEQ_N = 8;

const T8_INPUT = [5, 2, 7, 1, 8, 3, 6, 4];
/** bitonický vstup ve tvaru obr. 15.11 (k = 1 < n/2), circuits.md § 2 */
const BITONIC8 = [4, 5, 7, 8, 6, 3, 1, 2];
const BUBBLE5 = [5, 2, 4, 1, 3];

export const DEFAULT_CONFIG: SortNetConfig = {
  kind: "t",
  input: T8_INPUT,
  seq: false,
  removed: [],
  orient: null,
};

export const KIND_LABEL: Record<NetKind, string> = {
  bubble: "Bublinková",
  sep: "Separátor Sₙ",
  bitonic: "Bitonická Bₙ",
  t: "Třídička Tₙ",
  batcher: "Batcher",
};

/** krátký název sítě do názvu operace: T₈(P), B₈(P), S₈(P), Bublinka(P), Batcher(P) */
export function netShort(kind: NetKind, n: number): string {
  switch (kind) {
    case "bubble":
      return "Bublinka";
    case "batcher":
      return "Batcher";
    case "sep":
      return "S" + sub(n);
    case "bitonic":
      return "B" + sub(n);
    case "t":
      return "T" + sub(n);
  }
}

/** Síť pro konfiguraci (zápis „jak je zapsaná“ jen u bublinky do n = 8). */
export function netOf(c: SortNetConfig): SortNet {
  const n = c.input.length;
  return buildNet(c.kind, n, { seq: c.seq && n <= MAX_SEQ_N });
}

export const autoOrient = (n: number): Orient => (n <= 8 ? "v" : "h");

/** Proč vstup nejde na síť pustit (špatná délka), nebo null. */
export function inputProblem(
  kind: NetKind,
  input: readonly number[],
): string | null {
  if (validSizes(kind).includes(input.length)) return null;
  return kind === "bubble"
    ? `Bublinková síť potřebuje 2 až ${MAX_N} čísel (zadáno ${input.length}).`
    : `${KIND_LABEL[kind]} potřebuje 2, 4, 8 nebo 16 čísel – kniha předpokládá n = 2ᵏ (zadáno ${input.length}).`;
}

/** Volby n v nabídce (2 vodiče jsou jen jeden komparátor). */
export function sizeOptions(kind: NetKind): number[] {
  return kind === "bubble" ? [4, 5, 8, 16] : [4, 8, 16];
}

/* ------------------------------------------------------------------ generátory vstupu */

export type InputKind = "random" | "bitonic" | "reversed" | "zeroOne";

function shuffle<T>(xs: T[], r: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** n různých čísel 1 … max(2n, 20) */
function distinct(n: number, r: () => number): number[] {
  const pool = Array.from({ length: Math.max(2 * n, 20) }, (_, i) => i + 1);
  return shuffle(pool, r).slice(0, n);
}

export function generateInput(
  kind: InputKind,
  n: number,
  seed: number,
): number[] {
  const r = rng(seed);
  switch (kind) {
    case "random":
      return distinct(n, r);
    case "reversed":
      return Array.from({ length: n }, (_, i) => n - i);
    case "bitonic": {
      // čistě bitonická (každý prvek kromě maxima vlevo, nebo vpravo), pak náhodná rotace
      const v = distinct(n, r).sort((a, b) => a - b);
      const max = v.pop()!;
      const left: number[] = [];
      const right: number[] = [];
      for (const x of v) (r() < 0.5 ? left : right).push(x);
      const pure = [...left, max, ...right.reverse()];
      const k = Math.floor(r() * n);
      return [...pure.slice(k), ...pure.slice(0, k)];
    }
    case "zeroOne": {
      for (let t = 0; t < 64; t++) {
        const z = Array.from({ length: n }, () => (r() < 0.5 ? 0 : 1));
        if (!isSorted(z)) return z;
      }
      return Array.from({ length: n }, (_, i) => (i % 2 ? 0 : 1));
    }
  }
}

const wantsBitonic = (kind: NetKind) => kind === "sep" || kind === "bitonic";

/** Výchozí vstup sítě s n vodiči (knižní, kde kniha nějaký má; jinak deterministický náhodný). */
export function defaultInput(kind: NetKind, n: number): number[] {
  if (wantsBitonic(kind) && n === 8) return BITONIC8.slice();
  if (kind === "bubble" && n === 5) return BUBBLE5.slice();
  if (!wantsBitonic(kind) && n === 8) return T8_INPUT.slice();
  return generateInput(
    wantsBitonic(kind) ? "bitonic" : "random",
    n,
    1000 + 31 * n + NET_KINDS.indexOf(kind),
  );
}

/**
 * Přepnutí druhu sítě: vstup zůstane, když na novou síť sedí (Sₙ/Bₙ navíc potřebují bitonický – jinak
 * dostanou bitonický stejné délky); jinak vstup nejbližší platné délky. Vynechané komparátory patří
 * ke staré síti, zápis „jak je zapsaná“ zůstává.
 */
export function adaptToKind(
  c: SortNetConfig,
  kind: NetKind,
  seed: number,
): SortNetConfig {
  const sizes = validSizes(kind);
  const n = c.input.length;
  // nejmenší platná délka ≥ n (5 vodičů bublinky → T₈), jinak největší
  const target = sizes.includes(n)
    ? n
    : (sizes.find((s) => s >= n) ?? sizes[sizes.length - 1]);
  const zeroOne = c.input.every((v) => v === 0 || v === 1);
  let input = c.input;
  if (target !== n)
    input = zeroOne
      ? generateInput("zeroOne", target, seed)
      : generateInput(wantsBitonic(kind) ? "bitonic" : "random", target, seed);
  else if (wantsBitonic(kind) && !isBitonic(input))
    input = zeroOne
      ? Array.from({ length: n }, (_, i) =>
          i >= n / 4 && i < (3 * n) / 4 ? 1 : 0,
        )
      : generateInput("bitonic", n, seed);
  return { ...c, kind, input: input.slice(), removed: [] };
}

/** Vynechat komparátor, nebo ho vrátit. */
export function toggleRemoved(removed: readonly number[], c: number): number[] {
  return removed.includes(c)
    ? removed.filter((x) => x !== c)
    : [...removed, c].sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ odkaz */

interface ParamReader {
  get(name: string): string | null;
}

export function configFromUrl(p: ParamReader): {
  config: SortNetConfig;
  notice: string | null;
} {
  const notices: string[] = [];
  const rawKind = p.get("net");
  let kind = DEFAULT_CONFIG.kind;
  if (rawKind !== null) {
    if ((NET_KINDS as readonly string[]).includes(rawKind))
      kind = rawKind as NetKind;
    else notices.push(`neznámá síť „${rawKind}“`);
  }

  let input: number[] | null = null;
  const rawA = p.get("a");
  if (rawA !== null) {
    const r = parseNumberList(rawA, {
      min: MIN_VALUE,
      max: MAX_VALUE,
      maxCount: MAX_N,
    });
    const problem = r.values.length
      ? inputProblem(kind, r.values)
      : "žádné platné číslo";
    if (problem) notices.push(problem.replace(/\.$/, ""));
    else {
      input = r.values;
      if (r.ignored.length)
        notices.push(`ignorováno ${r.ignored.slice(0, 4).join(", ")}`);
    }
  }
  const fromUrl = input !== null;
  if (!input) {
    const n = Number(p.get("n"));
    input =
      rawA === null && validSizes(kind).includes(n)
        ? defaultInput(kind, n)
        : kind === DEFAULT_CONFIG.kind
          ? DEFAULT_CONFIG.input.slice()
          : defaultInput(kind, wantsBitonic(kind) || kind !== "bubble" ? 8 : 5);
  }
  const n = input.length;
  const size = buildNet(kind, n).comps.length;
  const removed = [
    ...new Set(
      (p.get("x") ?? "")
        .split(/[\s,;]+/)
        .map(Number)
        .filter((v) => Number.isInteger(v) && v >= 1 && v <= size)
        .map((v) => v - 1),
    ),
  ].sort((a, b) => a - b);
  const o = p.get("o");
  const config: SortNetConfig = {
    kind,
    input,
    seq: p.get("lay") === "seq" && kind === "bubble" && n <= MAX_SEQ_N,
    removed,
    orient: o === "v" || o === "h" ? o : null,
  };
  return {
    config,
    notice: notices.length
      ? `Odkaz nešel použít celý (${notices.join("; ")}) – ${fromUrl ? "použita platná čísla" : "zobrazen výchozí příklad"}.`
      : null,
  };
}

export function configToUrl(c: SortNetConfig): Record<string, string> {
  const out: Record<string, string> = { net: c.kind, a: c.input.join(",") };
  if (c.seq) out.lay = "seq";
  if (c.removed.length) out.x = c.removed.map((x) => x + 1).join(",");
  if (c.orient) out.o = c.orient;
  return out;
}

/* ------------------------------------------------------------------ příklady z knihy */

export interface SortNetExample {
  id: string;
  label: string;
  /** co v příkladu sledovat; kniha čísla na vstupu nedává – vstup je zvolený */
  title: string;
  config: SortNetConfig;
}

const ex = (
  id: string,
  label: string,
  title: string,
  kind: NetKind,
  input: number[],
  seq = false,
): SortNetExample => ({
  id,
  label,
  title,
  config: { kind, input, seq, removed: [], orient: null },
});

export const BOOK_EXAMPLES: readonly SortNetExample[] = [
  ex(
    "fig15.6",
    "Obr. 15.6 Bublinkové třídění",
    "Síť podle obr. 15.6 (s. 393) jak je zapsaná: 10 komparátorů po jednom, průchody oddělené tečkovaně; vstup zvolený",
    "bubble",
    BUBBLE5,
    true,
  ),
  ex(
    "fig15.7",
    "Obr. 15.7 Skutečný průběh",
    "Tytéž komparátory po vrstvách (obr. 15.7, s. 393): 2n − 3 = 7 taktů; vstup zvolený",
    "bubble",
    BUBBLE5,
  ),
  ex(
    "fig15.8",
    "Obr. 15.8 Bitonická třídička B₈",
    "S₈, pak S₄ < S₄, pak 4 × S₂ (obr. 15.8, s. 394); bitonický vstup ve tvaru obr. 15.11",
    "bitonic",
    BITONIC8,
  ),
  ex(
    "fig15.9",
    "Obr. 15.9 Třídička T₈",
    "Slévačky M₁ × 4, M₂ × 2, M₄ (obr. 15.9, s. 395); vstup zvolený",
    "t",
    T8_INPUT,
  ),
  ex(
    "fig15.10",
    "Obr. 15.10 Separátor S₈",
    "Komparátory (xᵢ, xᵢ₊₄) a hora / údolí z důkazu (obr. 15.10 a 15.11, s. 396–397): k = 1",
    "sep",
    BITONIC8,
  ),
  ex(
    "ex15.3.6",
    "Cv. 15.3.6 0-1 princip",
    "Třídička T₈ na nulách a jedničkách; „Ověřit 0-1 principem“ projde všech 2⁸ vstupů (cv. 15.3.6, s. 397)",
    "t",
    [1, 0, 1, 1, 0, 0, 1, 0],
  ),
  ex(
    "ex15.3.7",
    "Cv. 15.3.7 Batcherovo třídění",
    "Procedura BMerge jako síť: 19 komparátorů, hloubka 6 (cv. 15.3.7, s. 398); vstup zvolený",
    "batcher",
    T8_INPUT,
  ),
];

/* ------------------------------------------------------------------ nabídka operací */

export interface SortNetCtx {
  config: SortNetConfig;
  /** použít konfiguraci = nový běh (krok 1, pozastaveno) */
  apply: (c: SortNetConfig) => void;
  /** hláška pod akcemi (vstup nešel použít) */
  note: (text: string) => void;
  /** 0-1 princip nad aktuální sítí */
  verify: () => void;
  /** semínko náhodných vstupů */
  seed: () => number;
}

const GENERATORS: { id: InputKind; label: string; title: string }[] = [
  { id: "random", label: "Náhodně", title: "n různých náhodných čísel" },
  {
    id: "bitonic",
    label: "Bitonická",
    title: "náhodná bitonická posloupnost (rotace rostoucí a pak klesající)",
  },
  {
    id: "reversed",
    label: "Obráceně",
    title: "n, n − 1, …, 1 – každé porovnání prohodí",
  },
  {
    id: "zeroOne",
    label: "Nuly a jedničky",
    title: "náhodný vstup z 0 a 1 (0-1 princip); klik na vstup ho přepne",
  },
];

export function sortNetActions(ctx: SortNetCtx): ActionDef[] {
  const c = ctx.config;
  const n = c.input.length;
  const net = netOf(c);
  const sizes = sizeOptions(c.kind);
  const nArg = {
    kind: "choice" as const,
    name: "n",
    label: "n =",
    options: sizes.map((s) => ({ value: String(s), label: String(s) })),
    default: String(sizes.includes(n) ? n : 8),
  };
  const tryApply = (next: SortNetConfig) => {
    const problem = inputProblem(next.kind, next.input);
    if (problem) ctx.note(problem);
    else ctx.apply(next);
  };

  return [
    {
      id: "create",
      label: "Vytvořit",
      title: `Nový vstup (celá čísla ${MIN_VALUE} až ${MAX_VALUE}) – síť se na něm rovnou připraví`,
      variants: [
        {
          id: "custom",
          label: "Vlastní",
          title: "Vlastní čísla; n = jejich počet",
          args: [
            {
              kind: "list",
              name: "P",
              label: "P =",
              min: MIN_VALUE,
              max: MAX_VALUE,
              maxCount: MAX_N,
              default: c.input,
              placeholder: "např. 5, 2, 7, 1",
              // počet čísel podle sítě (2ᵏ) hlásí pole hned, ne až po odeslání
              check: (v) => inputProblem(c.kind, v as number[]),
            },
          ],
        },
        ...GENERATORS.map((g) => ({
          id: g.id,
          label: g.label,
          title: g.title[0].toUpperCase() + g.title.slice(1),
          args: [nArg],
        })),
      ],
      run: (v, variant) => {
        if (variant === "custom")
          tryApply({ ...c, input: listArg(v, "P"), removed: [] });
        else {
          const g = GENERATORS.find((x) => x.id === variant);
          if (!g) return;
          const size = Number(strArg(v, "n"));
          tryApply({
            ...c,
            input: generateInput(g.id, size, ctx.seed()),
            removed: size === n ? c.removed : [],
          });
        }
      },
    },
    {
      id: "book",
      label: "Příklady z knihy",
      title:
        "Sítě z obrázků 15.6–15.10 a cvičení 15.3.6–7 (vstupní čísla kniha nedává – jsou zvolená)",
      variants: BOOK_EXAMPLES.map((e) => ({
        id: e.id,
        label: e.label,
        title: e.title,
      })),
      run: (_v, variant) => {
        const e = BOOK_EXAMPLES.find((x) => x.id === variant);
        if (e)
          ctx.apply({
            ...e.config,
            input: e.config.input.slice(),
            orient: c.orient,
          });
      },
    },
    {
      id: "run",
      label: `${netShort(c.kind, n)}(P)`,
      title: "Pustí síť znovu na aktuální vstup P (od kroku 1)",
      run: () => ctx.apply({ ...c, input: c.input.slice() }),
    },
    {
      id: "net",
      label: "Síť",
      title: "Jiná síť z kapitoly 15.3 na stejný vstup (když délka sedí)",
      variants: NET_KINDS.map((k) => ({
        id: k,
        label: KIND_LABEL[k],
        title:
          k === "bubble"
            ? "Paralelní bublinkové třídění (obr. 15.6 / 15.7), libovolné n"
            : k === "sep"
              ? "Separátor (obr. 15.10) – rozdělí bitonický vstup na menší a větší polovinu"
              : k === "bitonic"
                ? "Bitonická třídička (obr. 15.8) – setřídí bitonický vstup"
                : k === "t"
                  ? "Třídicí síť sléváním (obr. 15.9), hloubka Θ(log² n)"
                  : "Batcherovo sudo-liché třídění (cv. 15.3.7)",
      })),
      run: (_v, variant) => {
        const k = NET_KINDS.find((x) => x === variant);
        if (k) ctx.apply(adaptToKind(c, k, ctx.seed()));
      },
    },
    {
      id: "zeroOne",
      label: "Ověřit 0-1 principem",
      title: `Projde všech 2ⁿ = ${2 ** n} vstupů z nul a jedniček (cv. 15.3.6); protipříklad načte jako vstup`,
      run: ctx.verify,
    },
    {
      id: "remove",
      label: "Vynechat(c)",
      title:
        "Vynechá komparátor číslo c (nebo vynechaný vrátí); c vyplní i klik na šipku. Rozbitou síť odhalí 0-1 princip",
      goLabel: "Vynechat / vrátit",
      args: [
        {
          kind: "int",
          name: "c",
          label: "c =",
          min: 1,
          max: net.comps.length,
          default: Math.min(net.comps.length, 1),
        },
      ],
      run: (v) =>
        ctx.apply({
          ...c,
          removed: toggleRemoved(c.removed, numArg(v, "c") - 1),
        }),
    },
  ];
}

/* ------------------------------------------------------------------ legenda */

/** Legenda jen se značkami, které se pro konfiguraci kreslí. */
export function sortNetLegend(c: SortNetConfig): LegendItem[] {
  const out: LegendItem[] = [
    {
      cls: "sw-compare",
      shape: "line",
      label: "komparátor právě počítané vrstvy – ponechal",
    },
    {
      cls: "sw-removed",
      shape: "line",
      label: "komparátor právě počítané vrstvy – prohodil",
      glyph: "⇄",
    },
  ];
  if (c.kind !== "sep") out.push({ cls: "sw-new", label: "setříděný výstup" });
  if (c.input.every((v) => v === 0 || v === 1))
    out.push(
      { cls: "sw-wire0", label: "0 na vodiči" },
      { cls: "sw-wire1", label: "1 na vodiči" },
    );
  if (c.kind === "sep" && separatorSplit(c.input))
    out.push(
      { cls: "sw-orange", shape: "ring", label: "hora (n/2 největších)" },
      { cls: "sw-teal", shape: "ring", label: "údolí" },
    );
  if (c.removed.length)
    out.push({
      cls: "sw-seen",
      shape: "line-dashed",
      label: "vynechaný komparátor",
    });
  return out;
}
