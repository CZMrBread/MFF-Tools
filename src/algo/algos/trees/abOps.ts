/**
 * Logika stránky (a,b)-stromu bez UI: stavba ze vstupu, výběr operace a kontrola vstupu
 * (rozsah klíče, počet klíčů). Samotné algoritmy jsou v abtree.ts.
 */
import type { StepGen } from "../../core/steps";
import {
  PC_AB_DELETE,
  PC_AB_FIND,
  PC_AB_INSERT,
  abDelete,
  abFind,
  abInsert,
  abInsertSilent,
  abKeys,
  abReject,
  emptyAB,
  type ABState,
  type AbVariant,
} from "./abtree";
import {
  PC_BOOK_DELETE,
  PC_BOOK_FIND,
  PC_BOOK_INSERT,
  bookDelete,
  bookFind,
  bookInsert,
  bookInsertSilent,
} from "./abBook";
import {
  describeSkipped,
  fmtNum,
  keyInputError,
  randomKeys,
  type KeyRange,
  type ParsedKeys,
} from "./keys";

/** Nabízené dvojice (a,b); všechny splňují a ≥ 2 a b ≥ 2a − 1. */
export const AB_PARAMS = [
  [2, 3],
  [2, 4],
  [3, 5],
  [3, 6],
  [4, 7],
] as const;

/** Klíče, které se vejdou do buňky vrcholu (nejvýše tři znaky). */
export const AB_KEYS: KeyRange = { min: -99, max: 999 };
/** Víc listů se vedle sebe na plátno nevejde. */
export const AB_MAX_KEYS = 28;
export const AB_DEFAULT_KEYS = [5, 12, 20, 33, 41, 47, 58, 63, 71];

/** Strom postavený postupným Insertem klíčů v zadaném pořadí (varianta: výchozí přednáška). */
export function buildAB(
  values: number[],
  a: number,
  b: number,
  variant: AbVariant = "prednaska",
): ABState {
  const st = emptyAB(a, b, variant);
  const insert = variant === "kniha" ? bookInsertSilent : abInsertSilent;
  for (const v of values) insert(st, v);
  return st;
}

/** Varianta z parametru adresy `?var=`: „kniha“ = Průvodce 8.3, jinak (i bez parametru) přednáška. */
export const abVariantFromParam = (param: string | null): AbVariant =>
  param === "kniha" ? "kniha" : "prednaska";

/** Varianta stromu (stav bez pole variant = přednáška). */
export const abVariantOf = (st: ABState): AbVariant =>
  st.variant ?? "prednaska";

/** „Průvodce 8.3 (klíče ve vrcholech)“ / „Přednáška (klíče v listech)“ */
export const abVariantLabel = (v: AbVariant) =>
  v === "kniha"
    ? "Průvodce 8.3 (klíče ve vrcholech)"
    : "Přednáška (klíče v listech)";

/** Přepnutí varianty: strom se znovu postaví ze stejných klíčů (vložených vzestupně), (a,b) zůstává. */
export function switchAbVariant(
  st: ABState,
  variant: AbVariant,
): { state: ABState; message: string } {
  const keys = abKeys(st);
  const what =
    variant === "kniha"
      ? "varianta z Průvodce 8.3 – klíče jsou ve vnitřních vrcholech, vnější listy se nekreslí"
      : "varianta z přednášky – klíče jsou v listech, vnitřní vrcholy nesou oddělovače";
  return {
    state: buildAB(keys, st.a, st.b, variant),
    message: `Přepnuto na: ${what}. ${keys.length ? "Strom je znovu postaven ze stejných klíčů (vložených vzestupně)." : "Strom je prázdný."}`,
  };
}

export type AbOpName = "find" | "insert" | "delete";

export interface PlannedAbOp {
  title: string;
  pseudocode: string[];
  run: (st: ABState) => StepGen<ABState>;
}

const OPS = {
  find: { title: "Find", pseudocode: PC_AB_FIND, gen: abFind },
  insert: { title: "Insert", pseudocode: PC_AB_INSERT, gen: abInsert },
  delete: { title: "Delete", pseudocode: PC_AB_DELETE, gen: abDelete },
} as const;
const BOOK_OPS = {
  find: { title: "Find", pseudocode: PC_BOOK_FIND, gen: bookFind },
  insert: { title: "Insert", pseudocode: PC_BOOK_INSERT, gen: bookInsert },
  delete: { title: "Delete", pseudocode: PC_BOOK_DELETE, gen: bookDelete },
} as const;

/**
 * Operace tak, jak ji spouští stránka: `x` je klíč přečtený z pole (null = prázdné nebo neplatné pole).
 * Neplatný vstup operaci nespustí – vznikne jediný krok s vysvětlením a strom zůstane beze změny.
 */
export function planAbOp(
  op: AbOpName,
  x: number | null,
  variant: AbVariant = "prednaska",
): PlannedAbOp {
  const { title, pseudocode, gen } = (variant === "kniha" ? BOOK_OPS : OPS)[op];
  return {
    // název i s argumentem („Insert(35)“) – zobrazuje se nad zprávou a v historii
    title: x === null ? title : `${title}(${fmtNum(x)})`,
    pseudocode,
    run: function* (st) {
      const err = keyInputError(x, AB_KEYS);
      if (err !== null || x === null) {
        yield* abReject(st, err ?? "");
        return;
      }
      if (op === "insert") {
        const keys = abKeys(st);
        if (keys.length >= AB_MAX_KEYS && !keys.includes(x)) {
          yield* abReject(
            st,
            `Strom už má ${AB_MAX_KEYS} klíčů a víc listů se vedle sebe na plátno nevejde. Nejdřív nějaký klíč smažte (Delete) nebo strom vyprázdněte.`,
          );
          return;
        }
      }
      yield* gen(st, x);
    },
  };
}

/** Zpráva po stavbě stromu ze vstupního pole včetně toho, co se ze vstupu nepoužilo. */
export function abBuildMessage(p: ParsedKeys): string {
  const skipped = describeSkipped(p, AB_KEYS, AB_MAX_KEYS);
  return `Strom postaven postupným vkládáním klíčů v zadaném pořadí.${skipped ? " " + skipped : ""}`;
}

/** Zpráva po přepnutí parametrů: strom se přestaví ze stejných klíčů. */
export function abSwitchMessage(a: number, b: number, count: number): string {
  return count === 0
    ? `Prázdný (${a},${b})-strom.`
    : `Parametry změněny na (${a},${b}) – strom je znovu postaven ze stejných klíčů (vložených vzestupně).`;
}

/* ------------------------------------------------------------------ stránka: výchozí stav, tipy, neaktivní tlačítka */

/** Výchozí x: klíč z výchozího příkladu – Delete(41) ukáže přesun syna od bratra. */
export const AB_DEFAULT_X = 41;

/** Krátký námět „💡 Zkuste: …“ k výchozímu příkladu ((a,b) = (2,3)). */
export const AB_TIP =
  "Delete(41) – podtečený vrchol si vezme syna od bratra. Insert(50) – přeplněný vrchol se rozdělí. Delete(5) – vrcholy se sloučí a výška klesne. Pak přepněte (a,b) a porovnejte výšku.";

/** Námět „💡 Zkuste: …“ pro variantu z Průvodce 8.3. */
export const AB_BOOK_TIP =
  "Insert do plného vrcholu – rozštěpí se a prostřední klíč jde do otce. Delete klíče z vyšší hladiny – nahradí ho následník. Delete z vrcholu s jediným klíčem – půjčka od bratra, nebo sloučení. Příklady z knihy ukážou obr. 8.7–8.10.";

/** Proč tlačítko operace nejde použít (null = jde); viz opDisabledReason v treeOps.ts. */
export function abDisabledReason(
  st: ABState,
  op: AbOpName,
  x: number,
): string | null {
  if (op !== "insert" && st.root === null)
    return "Strom je prázdný – nejdřív vložte klíč (Insert) nebo ho vytvořte (Vytvořit).";
  if (op === "insert") {
    const keys = abKeys(st);
    if (keys.length >= AB_MAX_KEYS && !keys.includes(x))
      return `Strom už má ${AB_MAX_KEYS} klíčů a víc listů se na plátno nevejde – nejdřív nějaký klíč smažte (Delete).`;
  }
  return null;
}

/** „(2,3)“ */
export const abLabel = (i: number) => `(${AB_PARAMS[i][0]},${AB_PARAMS[i][1]})`;

/** Index dvojice (a,b) z parametru adresy (`?ab=3,5`); neznámá hodnota → 0. */
export function abParamIndex(param: string | null): number {
  const i = AB_PARAMS.findIndex(
    ([a, b]) => param?.replace(/[()\s]/g, "") === `${a},${b}`,
  );
  return i < 0 ? 0 : i;
}

/** Index dvojice (a,b), kterou má strom. */
export const abIndexOf = (st: ABState) =>
  Math.max(
    0,
    AB_PARAMS.findIndex(([a, b]) => a === st.a && b === st.b),
  );

/** Přepnutí parametrů: strom se znovu postaví ze stejných klíčů, které v něm právě jsou (vložených vzestupně). */
export function switchAB(
  st: ABState,
  i: number,
): { state: ABState; message: string } {
  const keys = abKeys(st);
  const [a, b] = AB_PARAMS[i];
  return {
    state: buildAB(keys, a, b, abVariantOf(st)),
    message: abSwitchMessage(a, b, keys.length),
  };
}

/** Náhodný vstup: 14 různých klíčů 1…99. */
export const randomAbKeys = (seed: number) => randomKeys(14, 1, 99, seed);

/** Zpráva při otevření stránky. */
export function abInitialMessage(fromUrl: boolean): string {
  return `${fromUrl ? "Strom ze vstupu v odkazu" : "Výchozí příklad"} (klíče vložené postupně). Vyberte operaci v nabídce pod obrázkem (x vyplní i klik na klíč) – kroky se připraví a ▶ (mezerník) je přehraje.`;
}
