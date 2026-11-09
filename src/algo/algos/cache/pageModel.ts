/**
 * Model stránky stránkování bez Reactu: příklady z přednášky L04 (docs/L04-cache-handout.pdf) a nabídka
 * operací pro ActionMenu. Stránka (PagingPage.tsx) jen dodá kontext – aktuální P, posloupnost a start.
 */
import { listArg, type ActionDef } from "../../core/actionModel";
import {
  badSequence,
  DEFAULT_P,
  DEFAULT_SEQ,
  MAX_REQUESTS,
  PAGE_MAX,
  PAGE_MIN,
  randomSequence,
  runTitle,
} from "./paging";

/* ------------------------------------------------------------------ přednáška L04 */

/**
 * Blok (stránka, číslovaná od 1), ve kterém leží prvek A_ij matice k × k uložené po řádcích v blocích
 * velikosti B – jako na slidu 10: 11 12 13 14 | 15 21 22 23 | 24 25 31 32 | …
 */
export function matrixBlock(i: number, j: number, k: number, B: number) {
  return Math.floor((k * (i - 1) + (j - 1)) / B) + 1;
}

/** Čtení matice po sloupcích (A₁₁, A₂₁, …, A_k1, A₁₂, …) jako posloupnost požadavků na bloky. */
export function columnReadRequests(k: number, B: number): number[] {
  const out: number[] = [];
  for (let j = 1; j <= k; j++)
    for (let i = 1; i <= k; i++) out.push(matrixBlock(i, j, k, B));
  return out;
}

/** Triviální transpozice (slide 9): pro i < j Swap(A_ij, A_ji) – přístup k bloku A_ij, pak k bloku A_ji. */
export function transposeRequests(k: number, B: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= k; i++)
    for (let j = i + 1; j <= k; j++)
      out.push(matrixBlock(i, j, k, B), matrixBlock(j, i, k, B));
  return out;
}

export interface PagingExample {
  id: string;
  /** krátký popisek varianty v nabídce */
  label: string;
  /** odkud příklad je („Přednáška L04, slide 10“); null = vlastní příklad stránky */
  source: string | null;
  /** co příklad ukazuje (vysvětlivka varianty) */
  note: string;
  seq: number[];
  P: number;
}

const MATRIX = "matice 5 × 5 uložená po řádcích, blok B = 4 prvky, P = 3";

export const PAGING_EXAMPLES: readonly PagingExample[] = [
  {
    id: "belady",
    label: "Béládyho anomálie",
    source: null,
    note: "Béládyho posloupnost 1 2 3 4 1 2 5 1 2 3 4 5 s P = 3 – s P = 4 má FIFO víc výpadků (9 → 10)",
    seq: DEFAULT_SEQ,
    P: DEFAULT_P,
  },
  {
    id: "l04-columns",
    label: "Matice po sloupcích",
    source: "Přednáška L04, slide 10",
    note: `Čtení ${MATRIX}: při čtení A₃,₂ už blok s A₃,₁ v cache LRU ani FIFO není`,
    seq: columnReadRequests(5, 4),
    P: 3,
  },
  {
    id: "l04-transpose",
    label: "Triviální transpozice",
    source: "Přednáška L04, slide 9–10",
    note: `Swap(A_ij, A_ji) pro i < j, ${MATRIX}`,
    seq: transposeRequests(5, 4),
    P: 3,
  },
];

/* ------------------------------------------------------------------ nabídka operací */

export interface PagingCtx {
  /** aktuální počet slotů */
  P: number;
  /** naposledy simulovaná posloupnost (výchozí text pole) */
  seq: readonly number[];
  /**
   * spustí simulaci (kroky od 1, přehraje až ▶); P vynechané = aktuální, example = id příkladu,
   * title = název do řádku Historie
   */
  start: (seq: number[], P?: number, example?: string, title?: string) => void;
  /** semínko náhodné posloupnosti */
  now: () => number;
}

/** „1, 2, 3“; dlouhá posloupnost zkráceně „1, 2, 3, 4, 1, … (25)“ – do řádku Historie */
const shortSeq = (v: readonly number[]) =>
  v.length > 8 ? `${v.slice(0, 5).join(", ")}, … (${v.length})` : v.join(", ");

/**
 * Vytvořit ▸ Vlastní σ / Náhodně / Zlá posloupnost pro LRU (potvrzení „Simulovat“) a Příklady
 * (L04, Béládyho anomálie – nejsou z knihy). „Výchozí příklad“ a „↶ Vrátit operaci“ jsou v řádku
 * Historie pod akcemi (Visualizer).
 */
export function pagingActions(c: PagingCtx): ActionDef[] {
  return [
    {
      id: "create",
      label: "Vytvořit",
      title:
        "Nová posloupnost požadavků σ – simulují ji všechny tři strategie najednou",
      goLabel: "Simulovat",
      variants: [
        {
          id: "custom",
          label: "Vlastní",
          title: `Zadaná posloupnost požadavků σ (nejvýše ${MAX_REQUESTS} požadavků, stránky ${PAGE_MIN}–${PAGE_MAX})`,
          args: [
            {
              kind: "list",
              name: "q",
              label: "Požadavky σ =",
              min: PAGE_MIN,
              max: PAGE_MAX,
              maxCount: MAX_REQUESTS,
              default: c.seq,
              placeholder: "např. 1 2 3 4 1 2 5",
            },
          ],
        },
        {
          id: "random",
          label: "Náhodně",
          title: `20 náhodných požadavků nad ${c.P + 3} stránkami`,
        },
        {
          id: "bad",
          label: "Zlá posloupnost pro LRU",
          title: `Cyklus ${c.P + 1} stránek – LRU i FIFO mají samé výpadky`,
        },
      ],
      run: (v, variant) => {
        if (variant === "random")
          c.start(
            randomSequence(c.P, c.now()),
            undefined,
            undefined,
            "Náhodně",
          );
        else if (variant === "bad")
          c.start(
            badSequence(c.P),
            undefined,
            undefined,
            "Zlá posloupnost pro LRU",
          );
        else {
          const q = listArg(v, "q");
          c.start(q, undefined, undefined, `σ = ${shortSeq(q)}`);
        }
      },
    },
    {
      id: "examples",
      label: "Příklady",
      title: "Posloupnosti z přednášky L04 a Béládyho anomálie",
      variants: PAGING_EXAMPLES.map((e) => ({
        id: e.id,
        label: e.label,
        title: (e.source ? `${e.source}: ` : "") + e.note,
      })),
      run: (_v, variant) => {
        const e = PAGING_EXAMPLES.find((x) => x.id === variant);
        if (e) c.start([...e.seq], e.P, e.id, `Příklad: ${e.label}`);
      },
    },
  ];
}

/** Název běhu nad zprávou; u příkladu i jeho popisek a zdroj. */
export function runCaption(P: number, n: number, exampleId: string | null) {
  const base = runTitle(P, n);
  const e = PAGING_EXAMPLES.find((x) => x.id === exampleId);
  if (!e) return base;
  return `${base} – ${e.label}${e.source ? ` (${e.source})` : ""}`;
}
