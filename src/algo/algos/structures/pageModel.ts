/**
 * Čistý model nabídky operací stránek haldy a intervalového stromu (bez Reactu, testy v pageModel.test.ts):
 * položky „Příklady z knihy“, co se po výběru příkladu předvyplní do nabídky, a co vyplní klik na vrchol.
 */
import { numArg, type ActionDef, type IntArgDef } from "../../core/actionModel";
import type { BookExample } from "./bookExample";
import type { HeapBookExample, SegBookExample } from "./bookExamples";

/** Položky výběru obrázku: „Obr. 4.2 – vkládání do haldy, Insert(1)“ (bez opakovaného „Příklad z knihy:“). */
export function bookOptions(
  list: readonly BookExample<unknown, unknown>[],
): { value: string; label: string }[] {
  return list.map((e) => ({
    value: e.id,
    label: e.label.replace(/^Příklad z (knihy|přednášky): /, ""),
  }));
}

/** Čísla do pole „A =“ ve stejném tvaru, jaký píše nabídka (čárky, typografické minus). */
export const listText = (values: readonly number[]) =>
  values.map((v) => String(v).replace("-", "−")).join(", ");

/** Co stránka udělá po výběru příkladu z knihy. */
export interface BookPlan {
  /** struktura podle obrázku (hodnoty pro adresu) */
  values: number[];
  /** položka historie */
  title: string;
  /** hláška pod plátnem */
  message: string;
  /** akce, kterou otevřít s předvyplněným argumentem z obrázku (null = žádná) */
  open: string | null;
  /** texty polí nabídky podle jména argumentu */
  texts: Record<string, string>;
}

const where = (e: BookExample<unknown, unknown>) =>
  `obr. ${e.figure} Průvodce (s. ${e.page})`;
const withNote = (msg: string, note: string | null) =>
  note ? `${msg} ${note}` : msg;

export function heapBookPlan(ex: HeapBookExample): BookPlan {
  const values = [...ex.values];
  const texts: Record<string, string> = { A: listText(values) };
  const op = ex.ops[0];
  let open: string | null = null;
  let hint: string;
  if (op?.op === "insert") {
    open = "insert";
    texts.x = String(op.x).replace("-", "−");
    hint = `Vyzkoušejte Insert(${op.x}) jako v knize – stačí Provést.`;
  } else if (op?.op === "extractMin") {
    hint = "Vyzkoušejte ExtractMin jako v knize.";
  } else {
    hint = "Vyzkoušejte Insert(x) nebo ExtractMin.";
  }
  return {
    values,
    title: `Vytvořit(obr. ${ex.figure})`,
    message: withNote(
      `Halda z ${where(ex)}: minimum ${values[0]} je v kořeni. ${hint}`,
      ex.note,
    ),
    open,
    texts,
  };
}

export function segBookPlan(ex: SegBookExample): BookPlan {
  const values = [...ex.values];
  return {
    values,
    title: `Vytvořit(obr. ${ex.figure})`,
    message: withNote(
      `Strom z ${where(ex)} nad posloupností ${values.join(" ")}. Vyzkoušejte dotaz Min⟨i, j⟩ nebo změnu prvku IntUpdate(i, x) – klik na vrchol vyplní jeho interval.`,
      ex.note,
    ),
    open: null,
    texts: { A: listText(values) },
  };
}

/* ------------------------------------------------------------------ klik na vrchol intervalového stromu */

export type SegAction = "query" | "update";

/** Kam patří klik na vrchol: otevřená změna prvku, jinak naposledy provedená změna (když nic není otevřené), jinak dotaz. */
export function segPickTarget(
  open: string | null,
  lastRun: string | null,
): SegAction {
  if (open === "update") return "update";
  if (open === null && lastRun === "update") return "update";
  return "query";
}

/**
 * Klik na vrchol v (1 … 2n−1, n = počet listů): vnitřní vrchol i list u dotazu vyplní jeho kanonický
 * interval ⟨i, j⟩, list u změny prvku index (argument „u“ s popiskem „i =“).
 */
export function segPick(
  v: number,
  n: number,
  target: SegAction,
): { open: SegAction; texts: Record<string, string> } {
  const depth = Math.floor(Math.log2(v));
  const size = n / 2 ** depth;
  const from = (v - 2 ** depth) * size;
  if (target === "update" && v >= n)
    return { open: "update", texts: { u: String(v - n) } };
  return {
    open: "query",
    texts: { i: String(from), j: String(from + size) },
  };
}

/* ------------------------------------------------------------------ akce s mezemi podle aktuální struktury */

/**
 * InsertAfter(k, x) seznamu o n prvcích: k od 1 do n (neplatné k akci zablokuje s důvodem u pole,
 * operace ani záznam historie nevznikne). `x` je společný argument hodnoty stránky.
 */
export function insertAfterDef(
  n: number,
  x: IntArgDef,
  disabledReason: string | null,
  run: (k: number, x: number) => void,
): ActionDef {
  return {
    id: "insertAfter",
    label: "InsertAfter(k, x)",
    title: `vloží x za k-tý prvek (k od 1 do ${n}); k vyplní i klik na krabičku`,
    args: [
      {
        kind: "int",
        name: "k",
        label: "k =",
        min: 1,
        max: Math.max(1, n),
        default: 1,
      },
      x,
    ],
    disabledReason,
    run: (v) => run(numArg(v, "k"), numArg(v, "x")),
  };
}

/**
 * Min⟨i, j⟩ a IntUpdate(i, x) intervalového stromu s n listy: i ∈ 0…n−1, j ∈ 1…n, u dotazu i < j.
 * Argument indexu změny se jmenuje „u“ (popisek „i =“), aby nesdílel text s mezí dotazu.
 */
export function segOpDefs(
  n: number,
  values: { min: number; max: number },
  run: {
    query: (i: number, j: number) => void;
    update: (i: number, x: number) => void;
  },
): [ActionDef, ActionDef] {
  const last = Math.max(0, n - 1);
  return [
    {
      id: "query",
      label: "Min⟨i, j⟩",
      title: `minimum z x_i … x_{j−1} (0 ≤ i < j ≤ ${n}); meze vyplní i klik na vrchol`,
      args: [
        { kind: "int", name: "i", label: "i =", min: 0, max: last, default: 2 },
        {
          kind: "int",
          name: "j",
          label: "j =",
          min: 1,
          max: Math.max(1, n),
          default: Math.min(6, Math.max(1, n)),
        },
      ],
      check: (v) =>
        numArg(v, "i") < numArg(v, "j") ? null : "musí platit i < j",
      run: (v) => run.query(numArg(v, "i"), numArg(v, "j")),
    },
    {
      id: "update",
      label: "IntUpdate(i, x)",
      title: `změna prvku x_i ← x (i od 0 do ${last}); i vyplní i klik na list`,
      args: [
        {
          kind: "int",
          name: "u",
          label: "i =",
          min: 0,
          max: last,
          default: Math.min(3, last),
        },
        { kind: "int", name: "x", label: "x =", ...values, default: 0 },
      ],
      run: (v) => run.update(numArg(v, "u"), numArg(v, "x")),
    },
  ];
}

/* ------------------------------------------------------------------ pseudokód před první operací */

/**
 * Co ukázat v panelu pseudokódu: pseudokód poslední operace, a dokud žádná neproběhla (i po Vytvořit),
 * pseudokód otevřené akce, jinak hlavní akce stránky – bez zvýrazněného řádku (klidový krok ho nemá).
 */
export function idleCode(
  current: readonly string[],
  open: string | null,
  byAction: Readonly<Record<string, readonly string[]>>,
  main: string,
): string[] {
  if (current.length) return [...current];
  const code =
    (open !== null && Object.hasOwn(byAction, open)
      ? byAction[open]
      : byAction[main]) ?? [];
  return [...code];
}
