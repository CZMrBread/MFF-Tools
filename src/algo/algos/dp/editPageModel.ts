/**
 * Model stránky Editační vzdálenost (#/dp/edit) bez Reactu: odkaz ?x=…&y=…, knižní předvolby, čištění
 * slov, nabídka operací, náhodná slova, popisek běhu a výběr podproblému klikem na buňku T[i, j].
 * EditDistancePage.tsx jen drží stav a kreslí. Testy v editPageModel.test.ts.
 */
import { strArg, type ActionDef } from "../../core/actionModel";
import { rng } from "../../core/steps";
import { FIG_12_5 } from "./dpBook.fixtures";
import {
  editMoves,
  moveText,
  splitChars,
  type EditState,
} from "./editDistance";

/** nejvýš tolik znaků slova (tabulka 13 × 13 se vejde na jednu obrazovku i do šířky telefonu s posunem) */
export const EDIT_MAX = 12;

export interface EditExample {
  id: string;
  label: string;
  title: string;
  x: string;
  y: string;
}

export const EDIT_EXAMPLES: readonly EditExample[] = [
  {
    id: "fig12-5",
    label: "Obr. 12.5 – poutník → potemník",
    title:
      "Tabulka T z obr. 12.5 (str. 308), L = 3; graf obr. 12.6 vyznačil jinou ze stejně krátkých cest",
    x: FIG_12_5.x,
    y: FIG_12_5.y,
  },
  {
    id: "koule-boule",
    label: "Str. 306 – koule → boule",
    title: "Překlep z úvodu oddílu 12.3: jedna změna znaku",
    x: "koule",
    y: "boule",
  },
  {
    id: "koule-kdoule",
    label: "Str. 306 – koule → kdoule",
    title: "Překlep z úvodu oddílu 12.3: jedno vložení",
    x: "koule",
    y: "kdoule",
  },
  {
    id: "same",
    label: "Str. 308 – aaaaa → aaaaa",
    title:
      "x = y = aaa…a: rekurzivní Edit bez pamatování by běžel exponenciálně, Edit2 vyplní tabulku v Θ(nm)",
    x: "aaaaa",
    y: "aaaaa",
  },
];

export const EDIT_DEFAULT = EDIT_EXAMPLES[0];

export function editExampleFor(x: string, y: string): EditExample | null {
  return EDIT_EXAMPLES.find((e) => e.x === x && e.y === y) ?? null;
}

/** Slovo ze vstupu: okraje pryč, diakritika složená (NFC); mezera uvnitř, prázdné a dlouhé = chyba. */
export function cleanWord(raw: string): {
  value: string;
  error: string | null;
} {
  const v = raw.normalize("NFC").trim();
  if (v === "") return { value: v, error: "Zadejte aspoň jeden znak." };
  if (/\s/u.test(v))
    return {
      value: v,
      error: "Jedno slovo bez mezer (mezera by v tabulce nebyla vidět).",
    };
  if (splitChars(v).length > EDIT_MAX)
    return { value: v, error: `Nejvýše ${EDIT_MAX} znaků.` };
  return { value: v, error: null };
}

/** Slova z odkazu ?x=…&y=…; chybějící slovo z výchozího příkladu, vadné = celý výchozí příklad s hláškou. */
export function editFromUrl(
  x: string | null,
  y: string | null,
): { x: string; y: string; note: string | null } {
  if (x === null && y === null)
    return { x: EDIT_DEFAULT.x, y: EDIT_DEFAULT.y, note: null };
  const cx = cleanWord(x ?? EDIT_DEFAULT.x);
  const cy = cleanWord(y ?? EDIT_DEFAULT.y);
  const err = cx.error ? `x: ${cx.error}` : cy.error ? `y: ${cy.error}` : null;
  if (err)
    return {
      x: EDIT_DEFAULT.x,
      y: EDIT_DEFAULT.y,
      note: `Slovo z odkazu nejde použít (${err}) – použit výchozí příklad.`,
    };
  return { x: cx.value, y: cy.value, note: null };
}

/** Do adresy; výchozí příklad = bez parametrů (null). */
export function editToUrl(
  x: string,
  y: string,
): { x: string; y: string } | null {
  return x === EDIT_DEFAULT.x && y === EDIT_DEFAULT.y ? null : { x, y };
}

/** Popisek běhu nad zprávou: „Edit2(poutník, potemník) – obr. 12.5“. */
export function editCaption(x: string, y: string): string {
  const base = `Edit2(${x}, ${y})`;
  const e = editExampleFor(x, y);
  return e ? `${base} – ${e.label.split(" – ")[0].toLowerCase()}` : base;
}

export type EditRandomKind = "typo" | "words";

const CONS = "bcdhklmnprstvz";
const VOWELS = "aeiouy";

/** Náhodné slovo ze slabik souhláska + samohláska (4–8 znaků). */
function word(r: () => number): string {
  const syl = 2 + Math.floor(r() * 3);
  let w = "";
  for (let k = 0; k < syl; k++)
    w +=
      CONS[Math.floor(r() * CONS.length)] +
      VOWELS[Math.floor(r() * VOWELS.length)];
  return w;
}

/** Náhodná dvojice: slovo a jeho překlep (1–3 změny, smazání, vložení), nebo dvě různá slova. */
export function randomEdit(
  seed: number,
  kind: EditRandomKind,
): { x: string; y: string } {
  const r = rng(seed);
  const x = word(r);
  if (kind === "words") return { x, y: word(r) };
  const y = [...x];
  const edits = 1 + Math.floor(r() * 3);
  const letters = CONS + VOWELS;
  for (let k = 0; k < edits; k++) {
    const at = Math.floor(r() * y.length);
    const op = Math.floor(r() * 3);
    const ch = letters[Math.floor(r() * letters.length)];
    if (op === 0) y[at] = ch;
    else if (op === 1 && y.length > 2) y.splice(at, 1);
    else if (y.length < EDIT_MAX) y.splice(at, 0, ch);
  }
  return { x, y: y.join("") };
}

/* ------------------------------------------------------------------ výběr podproblému */

export interface EditSelection {
  r: number;
  c: number;
  /** buňky nejkratší cesty z (r, c) do pravého dolního rohu; prázdné, dokud T[r][c] není spočítané */
  cells: [number, number][];
  text: string;
}

/** Klik na buňku T[i, j]: editační vzdálenost přípon xᵢ… a yⱼ… a její úpravy. */
export function editSelection(
  st: EditState,
  r: number | null,
  c: number | null,
): EditSelection | null {
  if (r === null || c === null) return null;
  const v = st.T[r]?.[c];
  if (v === undefined) return null;
  const name = `T[${r + 1}, ${c + 1}]`;
  if (v === null)
    return {
      r,
      c,
      cells: [],
      text: `${name} ještě není spočítané – Edit2 plní tabulku zdola nahoru, zprava doleva.`,
    };
  const xs = st.x.join("");
  const ys = st.y.join("");
  const moves = editMoves(xs, ys, st.T, [r, c]);
  const cells: [number, number][] = moves.map((m) => [m.r, m.c]);
  cells.push([st.x.length, st.y.length]);
  const ops = moves.filter((m) => m.cost === 1).map(moveText);
  const sx = st.x.slice(r).join("");
  const sy = st.y.slice(c).join("");
  return {
    r,
    c,
    cells,
    text: `${name} = ${v} = L(„${sx}“, „${sy}“)${ops.length ? `: ${ops.join(", ")}` : " – přípony jsou stejné"}.`,
  };
}

/* ------------------------------------------------------------------ nabídka operací */

export interface EditCtx {
  x: string;
  y: string;
  /** nový běh nad slovy; `title` do řádku Historie */
  run: (x: string, y: string, title: string) => void;
  now: () => number;
}

const RANDOM: { id: EditRandomKind; label: string; title: string }[] = [
  {
    id: "typo",
    label: "Překlepy",
    title: "Náhodné slovo a jeho kopie s 1 až 3 překlepy",
  },
  { id: "words", label: "Různá slova", title: "Dvě náhodná slova (4–8 znaků)" },
];

const WORD_RE = /^\s*\S+\s*$/u;

export function editActions(c: EditCtx): ActionDef[] {
  const wordArg = (name: "x" | "y", def: string) => ({
    kind: "text" as const,
    name,
    label: `${name} =`,
    default: def,
    maxLength: EDIT_MAX,
    pattern: WORD_RE,
    patternHint: `jedno slovo bez mezer, nejvýše ${EDIT_MAX} znaků`,
    width: "9rem",
  });
  return [
    {
      id: "create",
      label: "Vytvořit",
      title: "Nová dvojice slov (vlastní zadejte v akci Edit2)",
      variants: RANDOM.map((v) => ({
        id: v.id,
        label: v.label,
        title: v.title,
      })),
      goLabel: "Vytvořit",
      run: (_v, variant) => {
        const k = RANDOM.find((x) => x.id === variant) ?? RANDOM[0];
        const p = randomEdit(c.now(), k.id);
        c.run(p.x, p.y, `Vytvořit: ${k.label.toLowerCase()}`);
      },
    },
    {
      id: "book",
      label: "Příklady z knihy",
      title: "Slova z Průvodce, oddíl 12.3 (str. 306–309)",
      selectedVariant: editExampleFor(c.x, c.y)?.id ?? null,
      variants: EDIT_EXAMPLES.map((e) => ({
        id: e.id,
        label: e.label,
        title: e.title,
      })),
      run: (_v, variant) => {
        const e = EDIT_EXAMPLES.find((x) => x.id === variant);
        if (e) c.run(e.x, e.y, `Příklad: ${e.label.split(" – ")[0]}`);
      },
    },
    {
      id: "run",
      label: "Edit2(x, y)",
      title:
        "Edit2: tabulka T zdola nahoru, zprava doleva, pak nejkratší úpravy z T[1, 1]",
      goLabel: "Spočítat",
      args: [wordArg("x", c.x), wordArg("y", c.y)],
      run: (v) => {
        const x = cleanWord(strArg(v, "x"));
        const y = cleanWord(strArg(v, "y"));
        if (x.error || y.error) return;
        c.run(x.value, y.value, `Edit2(${x.value}, ${y.value})`);
      },
    },
  ];
}
