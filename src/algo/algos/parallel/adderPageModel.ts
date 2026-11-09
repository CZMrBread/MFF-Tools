/**
 * Stránka Sčítačka (#/parallel/adder) – čistá logika bez Reactu (testy v adderPageModel.test.ts):
 * vstup (doplnění zleva nulami na mocninu dvou), odkaz ↔ konfigurace, přepnutí bitu, Vytvořit,
 * příklady z knihy, nabídka akcí a legenda.
 *
 * Odkaz: `x=01110100&y=00111011` (nejvyšší řád vlevo), `m=par | school` (bez m = obě souběžně),
 * `pq=1` (kódování bloků (p, q)). Výchozí příklad (obr. 15.4, obě sčítačky) dá prázdnou adresu.
 */
import type { ActionDef } from "../../core/actionModel";
import type { LegendItem } from "../../core/Visualizer";
import { parallelDepth, schoolDepth, type AdderMode } from "./adder";
import { plural } from "./circuit";
import { FIG_15_4 } from "./adderBook.fixtures";

export const MAX_BITS = 16;
export const MIN_BITS = 4;
export const SIZES = [4, 8, 16] as const;
export const MODES: readonly AdderMode[] = ["both", "par", "school"];

export interface AdderConfig {
  /** sčítance od nejvyššího řádu, stejně dlouhé, délka n = 2ᵏ ≥ 4 */
  x: string;
  y: string;
  mode: AdderMode;
  /** u bloků ukázat i kódování (p, q) */
  pq: boolean;
}

export const DEFAULT_CONFIG: AdderConfig = {
  x: FIG_15_4.x,
  y: FIG_15_4.y,
  mode: "both",
  pq: false,
};

export type Pair = { x: string; y: string; n: number; padded: boolean };

const BITS_RE = /^[01]{1,16}$/;
const nextPow2 = (v: number) => 2 ** Math.ceil(Math.log2(Math.max(1, v)));

/** Ořízne mezery a doplní oba sčítance zleva nulami na společnou délku n = 2ᵏ ≥ 4 (s. 389). */
export function normalizePair(
  rawX: string,
  rawY: string,
): Pair | { error: string } {
  const x = rawX.trim();
  const y = rawY.trim();
  for (const [name, v] of [
    ["x", x],
    ["y", y],
  ] as const)
    if (!BITS_RE.test(v))
      return {
        error: `${name} musí být 1 až ${MAX_BITS} číslic 0 a 1 (nejvyšší řád vlevo)`,
      };
  const n = Math.max(MIN_BITS, nextPow2(Math.max(x.length, y.length)));
  return {
    x: x.padStart(n, "0"),
    y: y.padStart(n, "0"),
    n,
    padded: x.length !== n || y.length !== n,
  };
}

const isPair = (p: Pair | { error: string }): p is Pair => !("error" in p);

export function configFromUrl(p: URLSearchParams): {
  config: AdderConfig;
  notice: string | null;
} {
  const problems: string[] = [];
  let { x, y } = DEFAULT_CONFIG;
  const px = p.get("x");
  const py = p.get("y");
  if (px !== null || py !== null) {
    const r = normalizePair(px ?? "0", py ?? "0");
    if (isPair(r)) ({ x, y } = r);
    else problems.push(r.error);
  }
  let mode = DEFAULT_CONFIG.mode;
  const pm = p.get("m");
  if (pm !== null) {
    if ((MODES as readonly string[]).includes(pm)) mode = pm as AdderMode;
    else problems.push(`neznámý režim „${pm}“ (par, school)`);
  }
  return {
    config: { x, y, mode, pq: p.get("pq") === "1" },
    notice: problems.length
      ? `Vstup z odkazu nešel použít (${problems.join("; ")}) – zobrazen výchozí příklad.`
      : null,
  };
}

export function configToUrl(c: AdderConfig): Record<string, string> {
  const out: Record<string, string> = {};
  if (c.x !== DEFAULT_CONFIG.x || c.y !== DEFAULT_CONFIG.y) {
    out.x = c.x;
    out.y = c.y;
  }
  if (c.mode !== DEFAULT_CONFIG.mode) out.m = c.mode;
  if (c.pq) out.pq = "1";
  return out;
}

/** přepne bit řádu i (i = 0 je vpravo) */
export function toggleBit(
  c: AdderConfig,
  which: "x" | "y",
  i: number,
): AdderConfig {
  const s = c[which];
  const at = s.length - 1 - i;
  if (at < 0 || at >= s.length) return c;
  const next = s.slice(0, at) + (s[at] === "1" ? "0" : "1") + s.slice(at + 1);
  return { ...c, [which]: next };
}

export function randomPair(n: number, rnd: () => number = Math.random) {
  const bits = () =>
    Array.from({ length: n }, () => (rnd() < 0.5 ? "0" : "1")).join("");
  return { x: bits(), y: bits() };
}

/** desítková čísla 0 … 65535 → binárně, n podle většího */
export function decimalPair(a: number, b: number): Pair {
  const r = normalizePair(a.toString(2), b.toString(2));
  if (!isPair(r)) throw new Error(r.error);
  return r;
}

/** přenos projde celým číslem: 0111…1 + 0…01 */
export const worstCarry = (n: number) => ({
  x: "0" + "1".repeat(n - 1),
  y: "0".repeat(n - 1) + "1",
});

export interface BookExample {
  id: string;
  label: string;
  caption: string;
  x: string;
  y: string;
  mode?: AdderMode;
}

export const BOOK_EXAMPLES: readonly BookExample[] = [
  {
    id: "fig15-4",
    label: "Obr. 15.4 Průběh paralelního sčítání (n = 8)",
    caption:
      "Obr. 15.4 Průvodce (s. 390): průběh paralelního sčítání pro n = 8, x = 116, y = 59.",
    x: FIG_15_4.x,
    y: FIG_15_4.y,
  },
  {
    id: "fig15-3",
    label: "Obr. 15.3 Školní sčítání (vstup z obr. 15.4)",
    caption:
      "Obr. 15.3 Průvodce (s. 387): sčítání školním algoritmem – řetěz krabiček Σ (vstup z obr. 15.4).",
    x: FIG_15_4.x,
    y: FIG_15_4.y,
    mode: "school",
  },
  {
    id: "one-bit",
    label: "Jednobitové bloky (s. 388): 0011 + 0101",
    caption:
      "Jednobitové bloky (s. 388): sloupce 00, 01, 10, 11 se chovají jako 0, <, <, 1.",
    x: "0011",
    y: "0101",
  },
];

/** příklad z knihy, kterému konfigurace odpovídá (režim „obě“ se počítá k paralelnímu) */
export function exampleOf(c: AdderConfig): BookExample | undefined {
  return BOOK_EXAMPLES.find(
    (e) =>
      e.x === c.x &&
      e.y === c.y &&
      (e.mode === "school") === (c.mode === "school"),
  );
}

const hladin = (n: number) => plural(n, "hladina", "hladiny", "hladin");

/** „školní 8 hladin (Θ(n)) · paralelní 2·log₂ 8 + 3 = 9 hladin (Θ(log n))“ */
export const depthText = (n: number) =>
  `školní ${hladin(schoolDepth(n))} (Θ(n)) · paralelní 2·log₂ ${n} + 3 = ${hladin(parallelDepth(n))} (Θ(log n))`;

export const MODE_LABEL: Record<AdderMode, string> = {
  both: "Obě souběžně",
  par: "Paralelní (obr. 15.4)",
  school: "Školní (obr. 15.3)",
};

export interface AdderHandlers {
  add: (x: string, y: string) => void;
  random: (n: number) => void;
  decimal: (a: number, b: number) => void;
  worst: (n: number) => void;
  example: (id: string) => void;
  mode: (m: AdderMode) => void;
}

const BITS_ARG_RE = /^\s*[01]{1,16}\s*$/;
const sizeOptions = SIZES.map((s) => ({ value: String(s), label: String(s) }));

export function adderActions(c: AdderConfig, h: AdderHandlers): ActionDef[] {
  const n = String(c.x.length);
  const bitsArg = (name: "x" | "y") => ({
    kind: "text" as const,
    name,
    label: `${name} =`,
    default: c[name],
    pattern: BITS_ARG_RE,
    patternHint: `0 a 1, nejvyšší řád vlevo, nejvýš ${MAX_BITS} bitů`,
    maxLength: MAX_BITS + 4,
    width: "19ch",
  });
  const add: ActionDef = {
    id: "add",
    label: "Sečíst(x, y)",
    title:
      "Připraví sčítání zadaných čísel (kratší se doplní zleva nulami na 4, 8 nebo 16 bitů; ▶ ho přehraje)",
    goLabel: "Sečíst",
    args: [bitsArg("x"), bitsArg("y")],
    run: (v) => h.add(String(v.x).trim(), String(v.y).trim()),
  };
  const create: ActionDef = {
    id: "create",
    label: "Vytvořit",
    variants: [
      {
        id: "random",
        label: "Náhodně",
        title: "Dvě náhodná n-bitová čísla",
        args: [
          {
            kind: "choice",
            name: "n",
            label: "n =",
            options: sizeOptions,
            default: n,
          },
        ],
      },
      {
        id: "decimal",
        label: "Desítkově",
        title: "Čísla 0 … 65535 zapsaná desítkově se převedou na binární",
        args: [
          {
            kind: "int",
            name: "a",
            label: "x =",
            min: 0,
            max: 65535,
            default: 116,
          },
          {
            kind: "int",
            name: "b",
            label: "y =",
            min: 0,
            max: 65535,
            default: 59,
          },
        ],
      },
      {
        id: "worst",
        label: "Nejhorší přenos",
        title:
          "0111…1 + 0…01: přenos projde celým číslem – školní sčítačka musí počkat na všech n krabiček",
        args: [
          {
            kind: "choice",
            name: "nw",
            label: "n =",
            options: sizeOptions,
            default: "16",
          },
        ],
      },
    ],
    run: (v, variant) => {
      if (variant === "random") h.random(Number(v.n));
      else if (variant === "decimal") h.decimal(Number(v.a), Number(v.b));
      else if (variant === "worst") h.worst(Number(v.nw));
    },
  };
  const book: ActionDef = {
    id: "book",
    label: "Příklady z knihy",
    variants: BOOK_EXAMPLES.map((e) => ({
      id: e.id,
      label: e.label,
      title: e.caption,
    })),
    run: (_, variant) => {
      if (variant) h.example(variant);
    },
  };
  const mode: ActionDef = {
    id: "mode",
    label: "Režim",
    title: "Která sčítačka se počítá",
    variants: MODES.map((m) => ({
      id: m,
      label: MODE_LABEL[m],
      title:
        m === "both"
          ? "Obě sčítačky současně, v každém kroku jedna hladina – porovnání hloubky"
          : m === "par"
            ? "Bloky, zahušťování přenosů a součet – tabulka jako obr. 15.4"
            : "Řetěz krabiček Σ – přenos postupuje řád po řádu",
    })),
    run: (_, variant) => {
      if (variant) h.mode(variant as AdderMode);
    },
  };
  // jako u ostatních modulů: vstup (Vytvořit, Příklady z knihy) první, pak operace a zobrazení
  return [create, book, add, mode];
}

export const ADDER_LEGEND: LegendItem[] = [
  { cls: "sw-compare", label: "právě spočtená hladina" },
  {
    cls: "sw-current",
    label: "použitý blok / přenos, krabička Σ, která počítá",
    shape: "dashed",
  },
  { cls: "sw-active", label: "přenos 1", glyph: "1" },
  { cls: "sw-range", label: "blok kopíruje přenos", glyph: "<" },
  { cls: "sw-new", label: "výstup – součet" },
];

const SCHOOL_LEGEND: LegendItem[] = [
  {
    cls: "sw-current",
    label: "krabička Σ, která právě počítá",
    shape: "dashed",
  },
  { cls: "sw-active", label: "přenos 1 (silně)", glyph: "1" },
  { cls: "sw-seen", label: "přenos zatím neznámý", shape: "line-dashed" },
  { cls: "sw-new", label: "hotová krabička / výstup" },
];

/** legenda podle režimu: školní řetěz nemá tabulku bloků */
export const adderLegend = (mode: AdderMode): LegendItem[] =>
  mode === "school" ? SCHOOL_LEGEND : ADDER_LEGEND;
