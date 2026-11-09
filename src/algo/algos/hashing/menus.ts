/**
 * Nabídky operací (ActionMenu) stránek hešování – čisté funkce bez Reactu (testy v menus.test.ts).
 *
 * Každá funkce vrátí seznam akcí pro aktuální verzi tabulky (zakázané akce s důvodem, výchozí hodnoty
 * polí = parametry tabulky). Akce samy nic nepočítají: předají stránce příkaz `HashCmd` a ta ho provede
 * (s.run / s.reset s hláškou). Parametry tabulky (m, h, k) jsou pole podformuláře „Vytvořit ▸ Vlastní“;
 * změnu parametrů se zachováním klíčů dělá „Přehešovat“.
 */
import type {
  ActionDef,
  ActionVariant,
  ArgDef,
  ArgValues,
  ChoiceArgDef,
  IntArgDef,
  ListArgDef,
} from "../../core/actionModel";
import { listArg, numArg, strArg } from "../../core/actionModel";
import { plural } from "../../views/text";
import type { BloomState } from "./bloom";
import type { CuckooState } from "./cuckoo";
import { HASH_FNS, isPow2, KEY_MAX } from "./hashfn";
import { multiplesOf, storedKeys, type HashState } from "./tables";
import {
  BLOOM_KS,
  BLOOM_SIZES,
  CUCKOO_SIZES,
  HASH_BOOK_EXAMPLES,
  HASH_SIZES,
  maxKeys,
} from "./ui";

/* ------------------------------------------------------------------ příkazy pro stránku */

export type HashCmd =
  | { kind: "op"; op: "insert" | "find" | "delete" | "lookup"; x: number }
  /** nová tabulka; u „random“ vylosuje klíče stránka (keys = []) */
  | {
      kind: "build";
      how: "custom" | "random" | "empty";
      keys: number[];
      m: number;
      fn?: string;
      k?: number;
    }
  /** nové parametry se zachováním klíčů */
  | { kind: "rehash"; m: number; fn?: string; k?: number }
  /** stejná funkce, nové náhodné parametry */
  | { kind: "reseed" }
  /** příklad z knihy (HASH_BOOK_EXAMPLES): prázdná tabulka a operace jedna po druhé */
  | { kind: "book"; id: string }
  | {
      kind: "bulk";
      what: "random" | "multiples" | "fill" | "cycle" | "foreign";
      count: number;
    };

type Exec = (cmd: HashCmd) => void;

/* ------------------------------------------------------------------ společné kousky */

/** výchozí klíč x podle stránky (je ve výchozím příkladu, takže Find/Delete hned něco najdou) */
export const DEFAULT_X = { chain: 20, probe: 35, cuckoo: 57, bloom: 17 };

/**
 * Výchozí klíč pro Insert(x): ve výchozím příkladu není a ukáže kolizi – řetězce 36 (přihrádka 4 s 12 → 20
 * → 28), otevřená adresace 51 (h = 3, shluk 3–7), kukačka 20 (f(20) = 14 i g(20) = 7 obsazené → vyhazování),
 * Bloom 55. Insert má vlastní pole (INSERT_ARG), aby Find/Delete dál nabízely existující klíč.
 */
export const INSERT_X = { chain: 36, probe: 51, cuckoo: 20, bloom: 55 };
/** jméno pole Insert(x) v nabídce (stránka ho předvyplňuje u příkladů z knihy) */
export const INSERT_ARG = "xi";

const xArg = (def: number, name = "x"): IntArgDef => ({
  kind: "int",
  name,
  label: "x =",
  min: 0,
  max: KEY_MAX,
  default: def,
});

const keysArg = (
  keys: readonly number[],
  maxCount: number,
  placeholder: string,
): ListArgDef => ({
  kind: "list",
  name: "A",
  label: "A =",
  min: 0,
  max: KEY_MAX,
  maxCount,
  allowEmpty: true,
  default: keys,
  placeholder,
});

const sizeArg = (
  name: string,
  sizes: readonly number[],
  current: number,
): ChoiceArgDef => ({
  kind: "choice",
  name,
  label: `${name} =`,
  options: sizes.map((v) => ({ value: String(v), label: String(v) })),
  default: String(current),
});

const fnArg = (current: string): ChoiceArgDef => ({
  kind: "choice",
  name: "h",
  label: "h =",
  options: HASH_FNS.map((f) => ({ value: f.id, label: f.name })),
  default: current,
});

const withX = (
  id: "insert" | "find" | "delete" | "lookup",
  label: string,
  x: number,
  exec: Exec,
  disabledReason: string | null = null,
): ActionDef => {
  const name = id === "insert" ? INSERT_ARG : "x";
  return {
    id,
    label: `${label}(x)`,
    args: [xArg(x, name)],
    disabledReason,
    run: (v) => exec({ kind: "op", op: id, x: numArg(v, name) }),
  };
};

/** multiply-shift potřebuje m = 2^k (m = 10 z obr. 11.2 jen s ostatními funkcemi) */
const fnSizeError = (v: ArgValues): string | null =>
  strArg(v, "h") === "mulshift" && !isPow2(Number(strArg(v, "m")))
    ? "Funkce multiply-shift potřebuje m mocninu 2 – zvolte m = 4, 8, 16 nebo 32, nebo jinou funkci h."
    : null;

/** Vytvořit ▸ Příklady z knihy (jen otevřená adresace: obr. 11.2) */
const bookVariant = (): ActionVariant => ({
  id: "book",
  label: "Příklady z knihy",
  title:
    "Tabulka a operace z obrázku v Průvodci; každou operaci spustíte Provést",
  args: [
    {
      kind: "choice",
      name: "fig",
      label: "Obrázek",
      options: HASH_BOOK_EXAMPLES.map((e) => ({ value: e.id, label: e.label })),
    },
  ],
});

type CreateHow = "custom" | "random" | "empty" | "book";

function createAction(
  custom: readonly ArgDef[],
  emptyLabel: string,
  what: string,
  run: (how: CreateHow, v: ArgValues) => void,
  extra: { book?: boolean; check?: (v: ArgValues) => string | null } = {},
): ActionDef {
  const check = extra.check;
  return {
    id: "create",
    label: "Vytvořit",
    title: `${what}: z vlastních klíčů, náhodně nebo ${emptyLabel.toLowerCase()}`,
    variants: [
      {
        id: "custom",
        label: "Vlastní",
        args: custom,
        title: "Klíče a parametry – Enter postaví novou tabulku",
      },
      { id: "random", label: "Náhodně", title: "Náhodné klíče 1 až 999" },
      { id: "empty", label: emptyLabel },
      ...(extra.book ? [bookVariant()] : []),
    ],
    check: check
      ? (v, variant) => (variant === "custom" ? check(v) : null)
      : undefined,
    run: (v, variant) =>
      run(
        variant === "random" || variant === "empty" || variant === "book"
          ? variant
          : "custom",
        v,
      ),
  };
}

/** „Vložit 4 náhodné“, „Vložit 5 náhodných“ */
const randomLabel = (n: number) =>
  `Vložit ${n} ${plural(n, "náhodný", "náhodné", "náhodných")}`;

/** Krátký název funkce do historie („tabulační“). */
export const shortFnName = (id: string): string =>
  (HASH_FNS.find((h) => h.id === id)?.name ?? id).split(" (")[0];

/** Název přehešování do historie: co se změnilo (m = 16 / h: tabulační / obojí). */
export function rehashTitle(
  prev: { m: number; fnId: string },
  m: number,
  fnId: string,
): string {
  const parts = [
    ...(m !== prev.m ? [`m = ${m}`] : []),
    ...(fnId !== prev.fnId ? [`h: ${shortFnName(fnId)}`] : []),
  ];
  return parts.length ? parts.join(", ") : "Přehešovat";
}

/** Řetězení pojme v poli „Vytvořit“ nejvýše 2m klíčů (otevřená adresace a kukačka přebytek přeskočí samy). */
export function clampKeys(
  keys: readonly number[],
  m: number,
  kind: "chain" | "probe" | "cuckoo" | "bloom",
): { keys: number[]; extra: number[] } {
  const max = maxKeys(m, kind);
  return { keys: keys.slice(0, max), extra: keys.slice(max) };
}

/* ------------------------------------------------------------------ řetězení / otevřená adresace */

export function hashMenu({
  table,
  probing,
  exec,
}: {
  table: HashState;
  probing: boolean;
  exec: Exec;
}): ActionDef[] {
  const { m, n, fnId } = table;
  const full = probing && n >= m;
  const free = probing ? m - n : Infinity;
  const randomCount = Math.min(Math.floor(m / 2), free);
  const mult = multiplesOf(m);
  const kind = probing ? "probe" : "chain";
  const sizes = probing ? HASH_SIZES.filter((v) => v >= n) : HASH_SIZES;
  const x = probing ? DEFAULT_X.probe : DEFAULT_X.chain;
  const xi = probing ? INSERT_X.probe : INSERT_X.chain;
  return [
    createAction(
      [
        keysArg(
          storedKeys(table, probing),
          maxKeys(Math.max(...HASH_SIZES), kind),
          "např. 12, 20, 28, 7",
        ),
        sizeArg("m", HASH_SIZES, m),
        fnArg(fnId),
      ],
      "Prázdná",
      "Tabulka",
      (how, v) =>
        exec(
          how === "book"
            ? { kind: "book", id: strArg(v, "fig") }
            : how === "custom"
              ? {
                  kind: "build",
                  how,
                  keys: listArg(v, "A"),
                  m: Number(strArg(v, "m")),
                  fn: strArg(v, "h"),
                }
              : { kind: "build", how, keys: [], m, fn: fnId },
        ),
      { book: probing, check: fnSizeError },
    ),
    withX(
      "insert",
      "Insert",
      xi,
      exec,
      full
        ? `Tabulka je plná (n = m = ${m}) – nejdřív některý klíč smažte, nebo zvětšete m.`
        : null,
    ),
    withX("find", "Find", x, exec),
    withX("delete", "Delete", x, exec, n === 0 ? "Tabulka je prázdná." : null),
    {
      id: "rehash",
      label: "Přehešovat(m, h)",
      title:
        "Klíče tabulky s novou velikostí m nebo funkcí h" +
        (probing ? " (menší m než počet klíčů nelze zvolit)" : ""),
      args: [sizeArg("m", sizes, m), fnArg(fnId)],
      check: fnSizeError,
      run: (v) =>
        exec({
          kind: "rehash",
          m: Number(strArg(v, "m")),
          fn: strArg(v, "h"),
        }),
    },
    {
      id: "reseed",
      label: "Nová náhodná h",
      title: "Vylosuje nové parametry funkce a klíče přehešuje.",
      disabledReason:
        fnId === "mod"
          ? "Funkce x mod m nemá náhodné parametry – zvolte jinou funkci h (Přehešovat)."
          : null,
      run: () => exec({ kind: "reseed" }),
    },
    {
      id: "random",
      label: randomLabel(randomCount),
      title: "Vloží s animací náhodné klíče 1 až 999.",
      disabledReason: randomCount === 0 ? "Tabulka je plná." : null,
      run: () => exec({ kind: "bulk", what: "random", count: randomCount }),
    },
    {
      id: "multiples",
      label: "Vložit násobky m",
      title: `Vloží ${mult.join(", ")} – pro x mod m všechny padnou do přihrádky 0 (zlý vstup pro mod).`,
      disabledReason:
        probing && free < mult.length
          ? `Násobků je ${mult.length}, volných buněk jen ${free}.`
          : null,
      run: () => exec({ kind: "bulk", what: "multiples", count: 0 }),
    },
  ];
}

/* ------------------------------------------------------------------ kukaččí hešování */

export function cuckooMenu({
  table,
  exec,
}: {
  table: CuckooState;
  exec: Exec;
}): ActionDef[] {
  const { m, n } = table;
  const target = Math.floor(m * 0.6);
  const randomCount = Math.max(0, Math.min(Math.floor(m / 3), m - n));
  const keys = table.cells.filter((c): c is number => c !== null);
  const x = DEFAULT_X.cuckoo;
  return [
    createAction(
      [
        keysArg(
          keys,
          maxKeys(Math.max(...CUCKOO_SIZES), "cuckoo"),
          "např. 57, 12, 33",
        ),
        sizeArg("m", CUCKOO_SIZES, m),
      ],
      "Prázdná",
      "Tabulka",
      (how, v) =>
        exec(
          how === "custom"
            ? {
                kind: "build",
                how,
                keys: listArg(v, "A"),
                m: Number(strArg(v, "m")),
              }
            : {
                kind: "build",
                how: how === "book" ? "empty" : how,
                keys: [],
                m,
              },
        ),
    ),
    withX("insert", "Insert", INSERT_X.cuckoo, exec),
    withX("find", "Find", x, exec),
    withX("delete", "Delete", x, exec, n === 0 ? "Tabulka je prázdná." : null),
    {
      id: "rehash",
      label: "Přehešovat(m)",
      title: "Klíče tabulky vloží znovu do tabulky velikosti m",
      args: [sizeArg("m", CUCKOO_SIZES, m)],
      run: (v) => exec({ kind: "rehash", m: Number(strArg(v, "m")) }),
    },
    {
      id: "random",
      label: randomLabel(randomCount),
      title: "Vloží s animací náhodné klíče 1 až 999.",
      disabledReason: randomCount === 0 ? "Tabulka je plná." : null,
      run: () => exec({ kind: "bulk", what: "random", count: randomCount }),
    },
    {
      id: "fill",
      label: `Doplnit na 60 % (n = ${target})`,
      title:
        "Nad α = 1/2 se klíče často vyhazují a občas je potřeba přehešovat.",
      disabledReason:
        n >= target
          ? `Tabulka už má ${n} klíčů – na 60 % (n = ${target}) není co doplňovat.`
          : null,
      run: () => exec({ kind: "bulk", what: "fill", count: target }),
    },
    {
      id: "cycle",
      label: "Vynutit cyklus",
      title:
        "Tři klíče se stejnými f(x), g(x) se do dvou buněk nevejdou – třetí vložení skončí cyklem a přehešováním.",
      disabledReason: n + 3 > m ? "V tabulce už nejsou 3 volná místa." : null,
      run: () => exec({ kind: "bulk", what: "cycle", count: 3 }),
    },
  ];
}

/* ------------------------------------------------------------------ Bloomův filtr */

export function bloomMenu({
  table,
  exec,
}: {
  table: BloomState;
  exec: Exec;
}): ActionDef[] {
  const { m, k } = table;
  const x = DEFAULT_X.bloom;
  return [
    createAction(
      [
        keysArg(table.inserted, maxKeys(m, "bloom"), "např. 17, 42, 99"),
        sizeArg("m", BLOOM_SIZES, m),
        sizeArg("k", BLOOM_KS, k),
      ],
      "Prázdný",
      "Filtr",
      (how, v) =>
        exec(
          how === "custom"
            ? {
                kind: "build",
                how,
                keys: listArg(v, "A"),
                m: Number(strArg(v, "m")),
                k: Number(strArg(v, "k")),
              }
            : {
                kind: "build",
                how: how === "book" ? "empty" : how,
                keys: [],
                m,
                k,
              },
        ),
    ),
    withX("insert", "Insert", INSERT_X.bloom, exec),
    withX("lookup", "Lookup", x, exec),
    {
      id: "resize",
      label: "Přestavit(m, k)",
      title:
        "Postaví filtr znovu z vložených klíčů s jiným m nebo k (skutečný filtr své klíče nezná).",
      args: [sizeArg("m", BLOOM_SIZES, m), sizeArg("k", BLOOM_KS, k)],
      run: (v) =>
        exec({
          kind: "rehash",
          m: Number(strArg(v, "m")),
          k: Number(strArg(v, "k")),
        }),
    },
    {
      id: "random",
      label: randomLabel(6),
      title: "Vloží s animací 6 náhodných klíčů 1 až 999.",
      run: () => exec({ kind: "bulk", what: "random", count: 6 }),
    },
    {
      id: "foreign",
      label: "Otestovat 10 nevložených",
      title:
        "Lookup deseti náhodných klíčů, které vloženy nebyly – kolikrát filtr odpoví ANO?",
      run: () => exec({ kind: "bulk", what: "foreign", count: 10 }),
    },
  ];
}
