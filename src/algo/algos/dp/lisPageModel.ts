/**
 * Model stránky Nejdelší rostoucí podposloupnost (#/dp/lis) bez Reactu: odkaz ?a=…, knižní předvolby,
 * nabídka operací, náhodné vstupy, popisek běhu a výběr podproblému klikem na sloupec. LisPage.tsx jen
 * drží stav a kreslí. Testy v lisPageModel.test.ts.
 */
import { listArg, type ActionDef } from "../../core/actionModel";
import { formatNum } from "../../core/format";
import { listStatus, parseIntList, sameNumbers } from "../../core/input";
import { rng } from "../../core/steps";
import { FIG_12_3, FIG_12_4 } from "./dpBook.fixtures";
import { chainText, lisChain, type LisState } from "./lis";

/** nejvýš tolik prvků (tabulka i graf se vejdou na jednu obrazovku 1280 × 720) */
export const LIS_MAX_N = 16;
export const LIS_MIN = -999;
export const LIS_MAX = 999;

export interface LisExample {
  id: string;
  label: string;
  title: string;
  values: readonly number[];
}

export const LIS_EXAMPLES: readonly LisExample[] = [
  {
    id: "fig12-3",
    label: "Obr. 12.3 – 3, 14, 15, 92, …",
    title:
      "Ukázková posloupnost ze str. 302 a průběh Nrp2 z obr. 12.3 (str. 304): T[0] = 7, řešení 3, 14, 15, 35, 38, 46",
    values: FIG_12_3.x,
  },
  {
    id: "fig12-4",
    label: "Obr. 12.4 – 1, 13, 7, 15, 10",
    title:
      "Posloupnost grafu z obr. 12.4 (str. 305) – nejdelší cesta má 3 prvky; obrázek vyznačil 1, 7, 15, Nrp2 najde 1, 13, 15",
    values: FIG_12_4.x,
  },
  {
    id: "increasing",
    label: "Rostoucí 1, …, 8 (str. 303)",
    title:
      "Rostoucí vstup: rekurzivní Nrp by prošel všech 2ⁿ podposloupností (str. 303), Nrp2 stačí O(n²)",
    values: [1, 2, 3, 4, 5, 6, 7, 8],
  },
  {
    id: "duplicates",
    label: "Opakované hodnoty – 2, 2, 5, 5, 3",
    title:
      "Podposloupnost musí ostře růst (xᵢ < xⱼ): stejné hodnoty na sebe nenavazují",
    values: [2, 2, 5, 5, 3],
  },
];

export const LIS_DEFAULT = LIS_EXAMPLES[0];

export function lisExampleFor(values: readonly number[]): LisExample | null {
  return LIS_EXAMPLES.find((e) => sameNumbers(e.values, values)) ?? null;
}

const RANGE = { min: LIS_MIN, max: LIS_MAX, maxCount: LIS_MAX_N };

/** Vstup z odkazu ?a=…: platná čísla (nejvýš LIS_MAX_N), jinak výchozí příklad; hláška, co se nepoužilo. */
export function lisFromUrl(a: string | null): {
  values: number[];
  note: string | null;
} {
  if (a === null || a.trim() === "")
    return { values: [...LIS_DEFAULT.values], note: null };
  const r = parseIntList(a, RANGE);
  if (r.values.length === 0)
    return {
      values: [...LIS_DEFAULT.values],
      note: `Posloupnost z odkazu nejde použít (${listStatus(r, RANGE) ?? "prázdná"}) – použit výchozí příklad.`,
    };
  const s = listStatus(r, RANGE);
  return {
    values: r.values,
    note: s ? `Posloupnost z odkazu: ${s[0].toLowerCase()}${s.slice(1)}` : null,
  };
}

/** Do adresy: „5,-3,8“; výchozí příklad = bez parametru (null). */
export function lisToUrl(values: readonly number[]): string | null {
  return sameNumbers(values, LIS_DEFAULT.values) ? null : values.join(",");
}

/** „3, 14, 15, …“ – dlouhý vstup zkrátí */
export function shortSeq(values: readonly number[], max = 3): string {
  const shown = values.slice(0, max).map((v) => formatNum(v));
  return values.length > max ? `${shown.join(", ")}, …` : shown.join(", ");
}

/** Popisek běhu nad zprávou: „Nrp2(3, 14, 15, …) – obr. 12.3“. */
export function lisCaption(values: readonly number[]): string {
  const base = `Nrp2(${shortSeq(values)})`;
  const e = lisExampleFor(values);
  return e ? `${base} – ${e.label.split(" – ")[0].toLowerCase()}` : base;
}

export type LisRandomKind = "random" | "increasing" | "decreasing";

/** Náhodná posloupnost 12 čísel 1 až 99 (rostoucí / klesající = ostře, bez opakování). */
export function randomLis(seed: number, kind: LisRandomKind): number[] {
  const r = rng(seed);
  const n = 12;
  if (kind === "random")
    return Array.from({ length: n }, () => 1 + Math.floor(r() * 99));
  const pool = Array.from({ length: 99 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const pick = pool.slice(0, n).sort((a, b) => a - b);
  return kind === "increasing" ? pick : pick.reverse();
}

/* ------------------------------------------------------------------ výběr podproblému */

export interface LisSelection {
  /** vybraný sloupec */
  i: number;
  /** sloupce NRP začínající xᵢ (i, P[i], P[P[i]], …); prázdné, dokud T[i] není spočítané */
  cols: number[];
  text: string;
}

/** Klik na sloupec i: T[i] = délka NRP začínající xᵢ, ta sama po odkazech P. */
export function lisSelection(
  st: LisState,
  i: number | null,
): LisSelection | null {
  if (i === null || i < 0 || i >= st.x.length) return null;
  const t = st.T[i];
  const name = i === 0 ? "x_0 = −∞" : `x_${i < 10 ? i : `{${i}}`}`;
  if (t === null)
    return {
      i,
      cols: [],
      text: `T[${i}] ještě není spočítané – Nrp2 jde od konce (i = n, …, 0).`,
    };
  const chain = lisChain(st.P, i);
  const cols = [i, ...chain];
  const seq = i === 0 ? chainText(st.x, chain) : chainText(st.x, cols);
  return {
    i,
    cols,
    text:
      i === 0
        ? `T[0] = ${t}: celé řešení ${seq || "(prázdné)"} – délka T[0] − 1 = ${t - 1}.`
        : `T[${i}] = ${t}: nejdelší rostoucí podposloupnost začínající ${name}${st.i === i && !st.done ? " (zatím)" : ""}: ${seq}.`,
  };
}

/* ------------------------------------------------------------------ nabídka operací */

export interface LisCtx {
  values: readonly number[];
  /** nový běh nad posloupností; `title` do řádku Historie */
  run: (values: number[], title: string) => void;
  now: () => number;
}

const RANDOM: { id: LisRandomKind; label: string; title: string }[] = [
  { id: "random", label: "Náhodně", title: "12 náhodných čísel 1 až 99" },
  {
    id: "increasing",
    label: "Rostoucí",
    title: "12 rostoucích čísel – NRP je celá posloupnost",
  },
  {
    id: "decreasing",
    label: "Klesající",
    title: "12 klesajících čísel – NRP má jediný prvek",
  },
];

export function lisActions(c: LisCtx): ActionDef[] {
  return [
    {
      id: "create",
      label: "Vytvořit",
      title: "Nová posloupnost (vlastní zadejte v akci Nrp2)",
      variants: RANDOM.map((v) => ({
        id: v.id,
        label: v.label,
        title: v.title,
      })),
      goLabel: "Vytvořit",
      run: (_v, variant) => {
        const k = RANDOM.find((x) => x.id === variant) ?? RANDOM[0];
        c.run(randomLis(c.now(), k.id), `Vytvořit: ${k.label.toLowerCase()}`);
      },
    },
    {
      id: "book",
      label: "Příklady z knihy",
      title: "Posloupnosti z Průvodce, oddíl 12.2 (str. 302–305)",
      selectedVariant: lisExampleFor(c.values)?.id ?? null,
      variants: LIS_EXAMPLES.map((e) => ({
        id: e.id,
        label: e.label,
        title: e.title,
      })),
      run: (_v, variant) => {
        const e = LIS_EXAMPLES.find((x) => x.id === variant);
        if (e) c.run([...e.values], `Příklad: ${e.label.split(" – ")[0]}`);
      },
    },
    {
      id: "run",
      label: "Nrp2(x_1, …, x_n)",
      title:
        "Nrp2: T[i] a P[i] pro i = n, …, 0, pak výpis řešení po odkazech P",
      goLabel: "Spočítat",
      args: [
        {
          kind: "list",
          name: "x",
          label: "x =",
          min: LIS_MIN,
          max: LIS_MAX,
          maxCount: LIS_MAX_N,
          default: c.values,
          placeholder: "např. 3, 1, 4, 1, 5",
        },
      ],
      run: (v) => {
        const x = listArg(v, "x");
        c.run(x, `Nrp2(${shortSeq(x, 4)})`);
      },
    },
  ];
}
