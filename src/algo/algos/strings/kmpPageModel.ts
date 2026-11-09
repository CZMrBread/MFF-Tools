/**
 * Model stránky KMP bez Reactu: výchozí příklad a odkaz (?j=…&s=…), přechody běhů (stavba, hledání,
 * příklad, navazující čtení znaku) a nabídka operací pro ActionMenu. KmpPage.tsx jen drží stav,
 * adresu a kreslí. Testy v kmpPageModel.test.ts.
 */
import { strArg, type ActionDef, type ArgValue } from "../../core/actionModel";
import { rng } from "../../core/steps";
import { KMP_EXAMPLES, kmpExampleFor, type KmpExample } from "./bookStrings";
import {
  cleanHaystack,
  cleanNeedle,
  MAX_HAYSTACK,
  MAX_NEEDLE,
  type KmpMode,
} from "./kmp";

export interface KmpRun {
  needle: string;
  text: string;
  mode: KmpMode;
  /** navazující čtení: seno do této pozice je přečtené bez kroků */
  from: number;
  /** id příkladu z knihy (titul běhu uvede stranu) */
  example: string | null;
  note: { text: string; error: boolean };
  /** roste s každým spuštěním (Visualizer posune plátno do záběru) */
  runId: number;
}

export const KMP_DEFAULT: KmpExample = KMP_EXAMPLES[0];

const NO_NOTE = { text: "", error: false };

/** Stav po otevření stránky: odkaz ?j=…&s=…, jinak výchozí příklad z knihy (stavba + hledání). */
export function initialKmp(params: {
  j?: string | null;
  s?: string | null;
}): KmpRun {
  const j = cleanNeedle(params.j ?? "");
  const s = cleanHaystack(params.s ?? "");
  const needle = j.value || KMP_DEFAULT.needle;
  const text = params.j && j.value ? s.value : s.value || KMP_DEFAULT.text;
  const note = [j.value ? j.note : "", s.note].filter(Boolean).join(" ");
  return {
    needle,
    text,
    mode: "all",
    from: 0,
    example: kmpExampleFor(needle, text)?.id ?? null,
    note: { text: note, error: false },
    runId: 0,
  };
}

export type KmpCmd =
  | { type: "build"; needle: string }
  | { type: "search"; needle: string; text: string }
  /** navazující čtení jednoho znaku (inkrementální algoritmus, str. 320) */
  | { type: "read"; x: string }
  /** příklad, náhodný nebo vlastní vstup: stavba i hledání v jedné sadě kroků */
  | { type: "load"; needle: string; text: string; example: string | null };

export function kmpReducer(st: KmpRun, cmd: KmpCmd): KmpRun {
  const fail = (text: string): KmpRun => ({
    ...st,
    note: { text, error: true },
  });
  if (cmd.type === "read") {
    if ([...st.text].length >= MAX_HAYSTACK)
      return fail(`Seno má už ${MAX_HAYSTACK} znaků – další se nevejde.`);
    const x = [...cmd.x.replace(/\s+/gu, "")][0];
    if (!x) return fail("Zadejte jeden znak.");
    return {
      ...st,
      text: st.text + x,
      mode: "search",
      from: [...st.text].length,
      example: null,
      note: NO_NOTE,
      runId: st.runId + 1,
    };
  }
  const j = cleanNeedle(cmd.needle);
  if (!j.value) return fail("Jehla musí mít aspoň jeden znak.");
  if (cmd.type === "build")
    return {
      ...st,
      needle: j.value,
      mode: "build",
      from: 0,
      example: null,
      // úpravu vstupu (mezery, zkrácení) už ohlásil formulář akce (notice argumentu)
      note: NO_NOTE,
      runId: st.runId + 1,
    };
  const s = cleanHaystack(cmd.text);
  const notes: string[] = [];
  if (cmd.type === "search" && j.value !== st.needle)
    notes.push(
      `Automat pro jehlu „${j.value}“ postaven bez kroků (krokovat ho jde akcí Postavit automat).`,
    );
  return {
    ...st,
    needle: j.value,
    text: s.value,
    mode: cmd.type === "load" ? "all" : "search",
    from: 0,
    example: cmd.type === "load" ? cmd.example : null,
    note: { text: notes.filter(Boolean).join(" "), error: false },
    runId: st.runId + 1,
  };
}

/** Název běhu nad zprávou; u příkladu z knihy i strana. */
export function kmpCaption(st: KmpRun): string {
  const base =
    st.mode === "build"
      ? `KmpKonstrukce: ι = „${st.needle}“`
      : st.mode === "search" && st.from > 0
        ? `KmpKrok: čteme „${[...st.text][st.from]}“ (σ = „${st.text}“)`
        : `${st.mode === "all" ? "KMP" : "KmpHledej"}: ι = „${st.needle}“, σ = „${st.text}“`;
  const e = KMP_EXAMPLES.find((x) => x.id === st.example);
  return e && e.needle === st.needle && e.text === st.text
    ? `${base} – ${e.source}`
    : base;
}

export const kmpUrl = (st: KmpRun) => ({ j: st.needle, s: st.text });

/** Tip „Zkuste…“ k načtenému vstupu (u příkladu z knihy podle něj, jinak obecně). */
export function kmpTip(st: KmpRun): string {
  const more =
    "V Příkladech z knihy je automat z obr. 13.1 (barbarossa) a nejhorší vstup naivního algoritmu (aaab).";
  if (st.example === "kokos")
    return (
      "kokos v clanekokokosu: po „clanekoko“ je automat ve stavu koko (4); další k se nehodí, zpětná " +
      "hrana 4 → 2 posune jehlu o dvě místa a hledání pokračuje bez návratu v seně. " +
      more
    );
  const e = KMP_EXAMPLES.find((x) => x.id === st.example);
  if (e)
    return `${e.label} (${e.source}): ${e.note}. Krokujte nejdřív stavbu automatu, pak hledání; Přečti znak(x) přidá k senu další znak.`;
  return (
    `Krokujte stavbu automatu pro „${st.needle}“ a pak hledání: kde se dopředná hrana nehodí, zpětná ` +
    "posune jehlu, a seno se přitom nečte znovu. " +
    more
  );
}

/** Náhodný vstup: jehla 3–5 znaků a seno 16–24 znaků nad {a, b}, jehla do sena aspoň jednou vložená. */
export function randomKmp(seed: number): { needle: string; text: string } {
  const r = rng(seed);
  const word = (n: number) =>
    Array.from({ length: n }, () => (r() < 0.5 ? "a" : "b")).join("");
  const needle = word(3 + Math.floor(r() * 3));
  const len = 16 + Math.floor(r() * 9);
  const base = [...word(len)];
  const at = Math.floor(r() * (len - needle.length + 1));
  base.splice(at, needle.length, ...needle);
  return { needle, text: base.join("") };
}

/* ------------------------------------------------------------------ nabídka operací */

export interface KmpCtx {
  /** postavená jehla a seno (výchozí texty polí) */
  needle: string;
  text: string;
  /** aktuální text pole jehly (Hledat ho převezme) */
  needleText: () => string;
  build: (needle: string) => void;
  search: (needle: string, text: string) => void;
  read: (x: string) => void;
  /** vlastní / knižní vstup: stavba i hledání */
  load: (needle: string, text: string, example: string | null) => void;
  random: (seed: number) => void;
  now: () => number;
}

const NEEDLE_ARG = (def: string) =>
  ({
    kind: "text",
    name: "needle",
    label: "ι =",
    default: def,
    pattern: /\S/u,
    patternHint: `aspoň jeden znak jehly (nejvýše ${MAX_NEEDLE})`,
    // vynechané mezery / zkrácení hlásí formulář (⚠) – stránka je po provedení neopakuje
    notice: (v: ArgValue) => cleanNeedle(String(v)).note || null,
  }) as const;
const TEXT_ARG = (def: string) =>
  ({
    kind: "text",
    name: "text",
    label: "σ =",
    default: def,
    pattern: /\S/u,
    patternHint: `aspoň jeden znak sena (nejvýše ${MAX_HAYSTACK})`,
    notice: (v: ArgValue) => cleanHaystack(String(v)).note || null,
  }) as const;

export function kmpActions(c: KmpCtx): ActionDef[] {
  return [
    {
      id: "create",
      label: "Vytvořit",
      title:
        "Vlastní jehla a seno nebo náhodný vstup – postaví automat a hledá",
      variants: [
        {
          id: "custom",
          label: "Vlastní",
          title: `Jehla ι (nejvýše ${MAX_NEEDLE} znaků) a seno σ (nejvýše ${MAX_HAYSTACK}); mezery se vynechají`,
          args: [NEEDLE_ARG(c.needle), TEXT_ARG(c.text)],
        },
        {
          id: "random",
          label: "Náhodně",
          title: "Jehla a seno nad abecedou {a, b} s aspoň jedním výskytem",
        },
      ],
      goLabel: "Vytvořit",
      run: (v, variant) => {
        if (variant === "random") c.random(c.now());
        else c.load(strArg(v, "needle"), strArg(v, "text"), null);
      },
    },
    {
      id: "book",
      label: "Příklady z knihy",
      title:
        "Příklady z Průvodce, kap. 13.2 – nejdřív se postaví automat, pak se hledá v seně",
      variants: KMP_EXAMPLES.map((e) => ({
        id: e.id,
        label: e.label,
        title: `${e.source}: ${e.note}`,
      })),
      run: (_v, variant) => {
        const e = KMP_EXAMPLES.find((x) => x.id === variant);
        if (e) c.load(e.needle, e.text, e.id);
      },
    },
    {
      id: "build",
      label: "Postavit automat(ι)",
      title:
        "KmpKonstrukce: spočítá zpětné hrany Z krok po kroku (automat hledá jehlu v ní samé)",
      goLabel: "Postavit",
      args: [NEEDLE_ARG(c.needle)],
      run: (v) => c.build(strArg(v, "needle")),
    },
    {
      id: "search",
      label: "Hledat(σ)",
      title: "KmpHledej: projde seno σ automatem pro jehlu z pole ι",
      goLabel: "Hledat",
      args: [TEXT_ARG(c.text)],
      run: (v) => c.search(c.needleText(), strArg(v, "text")),
    },
    {
      id: "read",
      label: "Přečti znak(x)",
      title:
        "Připojí znak x k senu a provede jen jeden KmpKrok – automat je online (str. 320); znak vybere i klik na seno",
      goLabel: "Přečíst",
      args: [
        {
          kind: "text",
          name: "x",
          label: "x =",
          default: "a",
          maxLength: 1,
          pattern: /^\S$/u,
          patternHint: "jeden znak",
        },
      ],
      run: (v) => c.read(strArg(v, "x")),
    },
  ];
}
