/**
 * Model stránky Aho–Corasickové bez Reactu: výchozí příklad a odkaz (?j=ara,bar,…&s=…), přechody
 * běhů (stavba, hledání, příklad, navazující čtení znaku, přidání a odebrání slova) a nabídka
 * operací pro ActionMenu. AhoCorasickPage.tsx jen drží stav, adresu a kreslí. Testy
 * v ahoCorasickPageModel.test.ts.
 */
import { strArg, type ActionDef, type ArgValue } from "../../core/actionModel";
import { rng } from "../../core/steps";
import {
  cleanAcHaystack,
  cleanWords,
  MAX_AC_HAYSTACK,
  MAX_WORD,
  MAX_WORDS,
  MAX_WORDS_TOTAL,
  type AcMode,
} from "./ahoCorasick";
import { AC_EXAMPLES, acExampleFor, type AcExample } from "./bookStrings";
import { readableSearch } from "../../core/linkParams";

export interface AcRun {
  words: string[];
  text: string;
  mode: AcMode;
  /** navazující čtení: seno do této pozice je přečtené bez kroků */
  from: number;
  /** id příkladu z knihy (titul běhu uvede stranu) */
  example: string | null;
  note: { text: string; error: boolean };
  /** roste s každým spuštěním (Visualizer posune plátno do záběru) */
  runId: number;
}

export const AC_DEFAULT: AcExample = AC_EXAMPLES[0];

const sameWords = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((w, i) => w === b[i]);
const joinNotes = (...n: string[]) => n.filter(Boolean).join(" ");

/** Stav po otevření stránky: odkaz ?j=…&s=…, jinak obr. 13.2 se senem barbara (stavba + hledání). */
export function initialAc(params: {
  j?: string | null;
  s?: string | null;
}): AcRun {
  const j = cleanWords(params.j ?? "");
  const s = cleanAcHaystack(params.s ?? "");
  const own = j.words.length > 0;
  const words = own ? j.words : [...AC_DEFAULT.words];
  const text = own ? s.value : s.value || AC_DEFAULT.text;
  return {
    words,
    text,
    mode: "all",
    from: 0,
    example: acExampleFor(words, text)?.id ?? null,
    note: { text: joinNotes(own ? j.note : "", s.note), error: false },
    runId: 0,
  };
}

export type AcCmd =
  | { type: "build"; words: string }
  | { type: "search"; words: string; text: string }
  /** navazující čtení jednoho znaku (automat je online) */
  | { type: "read"; x: string }
  | { type: "add"; word: string }
  | { type: "remove"; word: string }
  /** příklad, náhodný nebo vlastní vstup: stavba i hledání v jedné sadě kroků */
  | {
      type: "load";
      words: readonly string[] | string;
      text: string;
      example: string | null;
    };

export function acReducer(st: AcRun, cmd: AcCmd): AcRun {
  const fail = (text: string): AcRun => ({
    ...st,
    note: { text, error: true },
  });
  const start = (
    words: string[],
    text: string,
    mode: AcMode,
    note: string,
    example: string | null = null,
    from = 0,
  ): AcRun => ({
    words,
    text,
    mode,
    from,
    example,
    note: { text: note, error: false },
    runId: st.runId + 1,
  });

  switch (cmd.type) {
    case "read": {
      if ([...st.text].length >= MAX_AC_HAYSTACK)
        return fail(`Seno má už ${MAX_AC_HAYSTACK} znaků – další se nevejde.`);
      const x = [...cmd.x.replace(/\s+/gu, "")][0];
      if (!x) return fail("Zadejte jeden znak.");
      return start(
        st.words,
        st.text + x,
        "search",
        "",
        null,
        [...st.text].length,
      );
    }
    case "add": {
      const w = cmd.word.trim();
      if (!w || /[\s,;]/u.test(w))
        return fail("Slovo zadejte bez mezer a čárek.");
      if (st.words.includes(w)) return fail(`Jehla „${w}“ už ve slovníku je.`);
      if (st.words.length >= MAX_WORDS)
        return fail(
          `Slovník má už ${MAX_WORDS} jehel – nejdřív nějakou odeberte.`,
        );
      const c = cleanWords([...st.words, w].join(","));
      if (!c.words.includes(w.slice(0, MAX_WORD)))
        return fail(
          `Jehly mají dohromady nejvýše ${MAX_WORDS_TOTAL} znaků – „${w}“ se nevejde.`,
        );
      return start(
        c.words,
        st.text,
        "all",
        `Přidána jehla „${w}“ – nový automat a hledání v témže seně.`,
      );
    }
    case "remove": {
      const w = cmd.word.trim();
      if (!st.words.includes(w)) return fail(`Jehla „${w}“ ve slovníku není.`);
      if (st.words.length === 1)
        return fail("Slovník musí mít aspoň jednu jehlu.");
      return start(
        st.words.filter((x) => x !== w),
        st.text,
        "all",
        `Odebrána jehla „${w}“ – nový automat a hledání v témže seně.`,
      );
    }
    default:
      break;
  }

  const c =
    typeof cmd.words === "string"
      ? cleanWords(cmd.words)
      : { words: [...cmd.words], note: "" };
  if (!c.words.length) return fail("Slovník musí mít aspoň jednu jehlu.");
  // úpravu vstupu (duplicity, mezery, zkrácení) už ohlásil formulář akce (notice argumentu)
  if (cmd.type === "build") return start(c.words, st.text, "build", "");
  const s = cleanAcHaystack(cmd.text);
  if (cmd.type === "search") {
    if (!s.value) return fail("Seno musí mít aspoň jeden znak.");
    return start(
      c.words,
      s.value,
      "search",
      joinNotes(
        sameWords(c.words, st.words)
          ? ""
          : "Automat pro nový slovník postaven bez kroků (krokovat ho jde akcí Postavit automat).",
      ),
    );
  }
  return start(c.words, s.value, "all", "", cmd.example);
}

/** Název běhu nad zprávou; u příkladu z knihy i zdroj. */
export function acCaption(st: AcRun): string {
  const ws = st.words.join(", ");
  const base =
    st.mode === "build"
      ? `AcKonstrukce: ${ws}`
      : st.mode === "search" && st.from > 0
        ? `AcKrok: čteme „${[...st.text][st.from]}“ (σ = „${st.text}“)`
        : `${st.mode === "all" ? "Aho–Corasicková" : "AcHledej"}: ${ws}; σ = „${st.text}“`;
  const e = AC_EXAMPLES.find((x) => x.id === st.example);
  return e && sameWords(e.words, st.words) && e.text === st.text
    ? `${base} – ${e.source}`
    : base;
}

export const acUrl = (st: AcRun) => ({ j: st.words.join(","), s: st.text });

/** S jedinou jehlou je to přesně automat KMP – odkaz na stejný vstup v modulu KMP. */
export function acKmpLink(st: AcRun): string | null {
  if (st.words.length !== 1) return null;
  return `/string/kmp${readableSearch({ j: st.words[0], s: st.text })}`;
}

/** Náhodný vstup: 3–5 různých jehel délky 2–4 nad {a, b}, seno 20 znaků s aspoň jedním výskytem. */
export function randomAc(seed: number): { words: string[]; text: string } {
  const r = rng(seed);
  const word = (n: number) =>
    Array.from({ length: n }, () => (r() < 0.5 ? "a" : "b")).join("");
  const count = 3 + Math.floor(r() * 3);
  const words: string[] = [];
  while (words.length < count) {
    const w = word(2 + Math.floor(r() * 3));
    if (!words.includes(w)) words.push(w);
  }
  const base = [...word(20)];
  const w = words[Math.floor(r() * words.length)];
  const at = Math.floor(r() * (20 - w.length + 1));
  base.splice(at, w.length, ...w);
  return { words, text: base.join("") };
}

/* ------------------------------------------------------------------ nabídka operací */

export interface AcCtx {
  /** postavený slovník a seno (výchozí texty polí) */
  words: readonly string[];
  text: string;
  /** aktuální text pole slovníku (Hledat ho převezme) */
  wordsText: () => string;
  build: (words: string) => void;
  search: (words: string, text: string) => void;
  read: (x: string) => void;
  add: (word: string) => void;
  remove: (word: string) => void;
  load: (words: string, text: string, example: string | null) => void;
  random: (seed: number) => void;
  now: () => number;
}

const WORDS_ARG = (def: readonly string[]) =>
  ({
    kind: "text",
    name: "words",
    label: "slova =",
    default: def.join(", "),
    pattern: /[^\s,;]/u,
    patternHint: `jehly oddělené čárkou (nejvýše ${MAX_WORDS}, dohromady ${MAX_WORDS_TOTAL} znaků)`,
    // vynechané duplicity / zkrácení hlásí formulář (⚠) – stránka je po provedení neopakuje
    notice: (v: ArgValue) => cleanWords(String(v)).note || null,
  }) as const;
const TEXT_ARG = (def: string) =>
  ({
    kind: "text",
    name: "text",
    label: "σ =",
    default: def,
    pattern: /\S/u,
    patternHint: `aspoň jeden znak sena (nejvýše ${MAX_AC_HAYSTACK})`,
    notice: (v: ArgValue) => cleanAcHaystack(String(v)).note || null,
  }) as const;
const WORD_ARG = {
  kind: "text",
  name: "word",
  label: "ι =",
  default: "",
  maxLength: MAX_WORD,
  pattern: /^[^\s,;]+$/u,
  patternHint: "jedna jehla bez mezer a čárek",
} as const;

export function acActions(c: AcCtx): ActionDef[] {
  return [
    {
      id: "create",
      label: "Vytvořit",
      title:
        "Vlastní slovník a seno nebo náhodný vstup – postaví automat a hledá",
      variants: [
        {
          id: "custom",
          label: "Vlastní",
          title: `Jehly oddělené čárkou (nejvýše ${MAX_WORDS}, dohromady ${MAX_WORDS_TOTAL} znaků) a seno σ (nejvýše ${MAX_AC_HAYSTACK})`,
          args: [WORDS_ARG(c.words), TEXT_ARG(c.text)],
        },
        {
          id: "random",
          label: "Náhodně",
          title:
            "3–5 jehel nad abecedou {a, b} (sdílené prefixy i sufixy) a seno s aspoň jedním výskytem",
        },
      ],
      goLabel: "Vytvořit",
      run: (v, variant) => {
        if (variant === "random") c.random(c.now());
        else c.load(strArg(v, "words"), strArg(v, "text"), null);
      },
    },
    {
      id: "book",
      label: "Příklady z knihy",
      title:
        "Příklady z Průvodce, kap. 13.3 – nejdřív se postaví automat, pak se hledá v seně",
      variants: AC_EXAMPLES.map((e) => ({
        id: e.id,
        label: e.label,
        title: `${e.source}: ${e.note}`,
      })),
      run: (_v, variant) => {
        const e = AC_EXAMPLES.find((x) => x.id === variant);
        if (e) c.load(e.words.join(","), e.text, e.id);
      },
    },
    {
      id: "build",
      label: "Postavit automat(slovník)",
      title:
        "AcKonstrukce: vloží slova do stromu a po hladinách spočítá zpětné hrany a zkratky",
      goLabel: "Postavit",
      args: [WORDS_ARG(c.words)],
      run: (v) => c.build(strArg(v, "words")),
    },
    {
      id: "search",
      label: "Hledat(S)",
      title: "AcHledej: projde seno σ automatem pro slovník z pole slova",
      goLabel: "Hledat",
      args: [TEXT_ARG(c.text)],
      run: (v) => c.search(c.wordsText(), strArg(v, "text")),
    },
    {
      id: "read",
      label: "Přečti znak(x)",
      title:
        "Připojí znak x k senu a provede jen jeden AcKrok a hlášení – automat je online; znak vybere i klik na seno",
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
    {
      id: "add",
      label: "Přidat slovo(ι)",
      title:
        "Přidá jehlu do slovníku, postaví nový automat a hledá ve stejném seně; klik na stav vyplní jeho jméno",
      goLabel: "Přidat",
      args: [WORD_ARG],
      run: (v) => c.add(strArg(v, "word")),
    },
    {
      id: "remove",
      label: "Odebrat slovo(ι)",
      title:
        "Odebere jehlu ze slovníku a postaví nový automat; klik na koncový stav vyplní jeho jehlu",
      goLabel: "Odebrat",
      args: [{ ...WORD_ARG, name: "rmword" }],
      run: (v) => c.remove(strArg(v, "rmword")),
    },
  ];
}
