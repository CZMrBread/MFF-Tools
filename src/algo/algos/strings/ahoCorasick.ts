/**
 * Aho–Corasicková podle Průvodce 13.3 (str. 324–330): vyhledávací automat pro více jehel najednou –
 * písmenkový strom (dopředné hrany), zpětné hrany Zpět, zkratkové hrany Zkratka a pole Slovo.
 * Konstrukce po hladinách (AcKonstrukce), spuštění na seno (AcHledej). Čisté funkce a generátor
 * kroků; stránka (AhoCorasickPage.tsx) jen přehrává. Testy v ahoCorasick.test.ts.
 *
 * Stavy číslujeme podle vzniku při vkládání slov (str. 327), syny bereme v abecedním pořadí písmen
 * (kniha říká jen „pro všechny syny“ – pořadí volíme kvůli determinismu a shodě s obr. 13.2).
 * Výskyt hlásíme dvojicí (k, i): k = začátek výskytu v seně, i = index jehly.
 */
import { snap, type StepGen } from "../../core/steps";
import { hitsWord } from "./pageModel";

/** nejvýš tolik jehel */
export const MAX_WORDS = 8;
/** součet délek jehel (strom má nejvýš o 1 víc stavů) */
export const MAX_WORDS_TOTAL = 40;
/** nejdelší jehla */
export const MAX_WORD = 16;
/** nejdelší seno */
export const MAX_AC_HAYSTACK = 40;

/* ------------------------------------------------------------------ pseudokód (str. 327–328) */

export const PC_AC_SEARCH = [
  "Algoritmus AcHledej (spuštění automatu na daný řetězec)",
  "  Vstup: Seno σ, zkonstruovaný automat",
  "  s ← kořen",
  "  Pro znaky x ∈ σ postupně provádíme:",
  "    s ← AcKrok(s, x)",
  "    j ← s",
  "    Dokud j ≠ ∅:",
  "      Je-li Slovo(j) ≠ ∅:",
  "        Ohlásíme Slovo(j).",
  "      j ← Zkratka(j)",
  "Procedura AcKrok (jeden krok automatu)",
  "  Vstup: Jsme ve stavu s, přečetli jsme znak x",
  "  Dokud Dopředu(s, x) = ∅ ∧ s ≠ kořen: s ← Zpět(s).",
  "  Pokud Dopředu(s, x) ≠ ∅: s ← Dopředu(s, x).",
  "  Výstup: Nový stav s",
];

export const PC_AC_BUILD = [
  "Algoritmus AcKonstrukce",
  "  Vstup: Slova ι₁, …, ιₙ",
  "  Založíme strom, který obsahuje pouze kořen r.",
  "  Vložíme do stromu slova ι₁ … ιₙ, nastavíme Slovo ve všech stavech.",
  "  Zpět(r) ← ∅, Zkratka(r) ← ∅",
  "  Založíme frontu F a vložíme do ní syny kořene.",
  "  Pro všechny syny s kořene: Zpět(s) ← r, Zkratka(s) ← ∅.",
  "  Dokud F ≠ ∅:",
  "    Vybereme i z fronty F.",
  "    Pro všechny syny s vrcholu i:",
  "      z ← AcKrok(Zpět(i), písmeno na hraně is)",
  "      Zpět(s) ← z",
  "      Pokud Slovo(z) ≠ ∅: Zkratka(s) ← z.",
  "      Jinak Zkratka(s) ← Zkratka(z).",
  "      Vložíme s do fronty F.",
  "  Výstup: Strom, pole Slovo, Zpět a Zkratka",
  "Procedura AcKrok (jeden krok automatu)",
  "  Vstup: Jsme ve stavu s, přečetli jsme znak x",
  "  Dokud Dopředu(s, x) = ∅ ∧ s ≠ kořen: s ← Zpět(s).",
  "  Pokud Dopředu(s, x) ≠ ∅: s ← Dopředu(s, x).",
  "  Výstup: Nový stav s",
];

export type AcPhase = "build" | "search";

export const pseudocodeForAcPhase = (phase: AcPhase): string[] =>
  phase === "build" ? PC_AC_BUILD : PC_AC_SEARCH;

/** řádky pseudokódu, na které kroky ukazují */
const LINES = {
  build: {
    root: 2,
    insert: 3,
    init: 4,
    queue: 5,
    rootKids: 6,
    pick: 8,
    krok: 10,
    setBack: 11,
    shortWord: 12,
    shortCopy: 13,
    done: 15,
    loop: 18,
    fwd: 19,
  },
  search: { start: 2, read: 3, report: 8, loop: 12, fwd: 13 },
} as const;

/* ------------------------------------------------------------------ automat */

export interface AcNode {
  id: number;
  /** jméno stavu = prefix některé jehly (kořen „ε“) */
  name: string;
  depth: number;
  parent: number | null;
  /** písmeno na dopředné hraně z rodiče */
  ch: string | null;
  /** synové v abecedním pořadí písmen: [písmeno, id] = Dopředu(s, písmeno) */
  kids: [string, number][];
  /** Slovo(s): index jehly, která tu končí; null = ∅ */
  word: number | null;
}

export interface AcAutomaton {
  words: string[];
  nodes: AcNode[];
  /** Zpět(s); null = ∅ (kořen) */
  back: (number | null)[];
  /** Zkratka(s); null = ∅ */
  short: (number | null)[];
  /** pořadí vrcholů ve frontě F (po hladinách) */
  order: number[];
}

const chars = (s: string): string[] => [...s];

/** Dopředu(s, x); null = ∅ */
export function forward(
  nodes: readonly AcNode[],
  s: number,
  x: string,
): number | null {
  const k = nodes[s].kids.find((e) => e[0] === x);
  return k ? k[1] : null;
}

/** Písmenkový strom slov (řádky 1–2 AcKonstrukce): stavy podle vzniku, synové podle abecedy. */
export function acTrie(words: readonly string[]): AcNode[] {
  const nodes: AcNode[] = [
    {
      id: 0,
      name: "ε",
      depth: 0,
      parent: null,
      ch: null,
      kids: [],
      word: null,
    },
  ];
  words.forEach((w, wi) => {
    let s = 0;
    for (const c of chars(w)) {
      let t = forward(nodes, s, c);
      if (t === null) {
        t = nodes.length;
        nodes.push({
          id: t,
          name: (s === 0 ? "" : nodes[s].name) + c,
          depth: nodes[s].depth + 1,
          parent: s,
          ch: c,
          kids: [],
          word: null,
        });
        nodes[s].kids.push([c, t]);
        nodes[s].kids.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      }
      s = t;
    }
    if (nodes[s].word === null) nodes[s].word = wi;
  });
  return nodes;
}

/** AcKrok (bez kroků): nový stav a stavy prošlé zpětnými hranami. */
export function acStep(
  nodes: readonly AcNode[],
  back: readonly (number | null)[],
  s: number,
  x: string,
): { s: number; chain: number[]; fwd: boolean } {
  const chain: number[] = [];
  while (forward(nodes, s, x) === null && s !== 0) {
    s = back[s] ?? 0;
    chain.push(s);
  }
  const f = forward(nodes, s, x);
  return f === null ? { s, chain, fwd: false } : { s: f, chain, fwd: true };
}

/** AcKonstrukce bez kroků. */
export function acBuild(words: readonly string[]): AcAutomaton {
  const nodes = acTrie(words);
  const back: (number | null)[] = nodes.map(() => null);
  const short: (number | null)[] = nodes.map(() => null);
  const order: number[] = [];
  const F: number[] = [];
  for (const [, s] of nodes[0].kids) {
    back[s] = 0;
    F.push(s);
    order.push(s);
  }
  while (F.length) {
    const i = F.shift()!;
    for (const [x, s] of nodes[i].kids) {
      const z = acStep(nodes, back, back[i] ?? 0, x).s;
      back[s] = z;
      short[s] = nodes[z].word !== null ? z : short[z];
      F.push(s);
      order.push(s);
    }
  }
  return { words: [...words], nodes, back, short, order };
}

export interface AcCount {
  /** dopředné hrany */
  fwd: number;
  /** zpětné hrany */
  back: number;
  /** skoky po zkratkách při hlášení */
  short: number;
  /** ohlášené výskyty */
  reports: number;
}

export interface AcHitOut {
  /** začátek výskytu v seně */
  k: number;
  /** index jehly */
  word: number;
}

/** AcHledej bez kroků: stav po každém znaku, výskyty v pořadí hlášení a počítadla. */
export function acSearch(
  A: AcAutomaton,
  text: string,
): { states: number[]; out: AcHitOut[]; count: AcCount } {
  const count: AcCount = { fwd: 0, back: 0, short: 0, reports: 0 };
  const states: number[] = [];
  const out: AcHitOut[] = [];
  let s = 0;
  chars(text).forEach((x, k) => {
    const r = acStep(A.nodes, A.back, s, x);
    s = r.s;
    count.back += r.chain.length;
    if (r.fwd) count.fwd++;
    states.push(s);
    // j ← s; dokud j ≠ ∅: ohlásit Slovo(j), j ← Zkratka(j)
    for (let j: number | null = s; j !== null; j = A.short[j]) {
      const w = A.nodes[j].word;
      if (w !== null) {
        out.push({ k: k - chars(A.words[w]).length + 1, word: w });
        count.reports++;
      }
      if (A.short[j] !== null) count.short++;
    }
  });
  return { states, out, count };
}

/** Výskyty všech jehel hrubou silou (kontrola v testech). */
export function naiveFindAll(
  words: readonly string[],
  text: string,
): AcHitOut[] {
  const t = chars(text);
  const out: AcHitOut[] = [];
  words.forEach((w, wi) => {
    const p = chars(w);
    if (!p.length) return;
    for (let i = 0; i + p.length <= t.length; i++)
      if (p.every((c, j) => t[i + j] === c)) out.push({ k: i, word: wi });
  });
  return out;
}

/* ------------------------------------------------------------------ vstup */

/**
 * Slovník z textu: jehly oddělené čárkami nebo mezerami, bez duplicit a prázdných tokenů, nejvýš
 * MAX_WORDS slov po MAX_WORD znacích a MAX_WORDS_TOTAL znaků celkem. `note` říká, co se zahodilo.
 */
export function cleanWords(text: string): { words: string[]; note: string } {
  const tokens = String(text ?? "")
    .split(/[\s,;]+/u)
    .filter(Boolean);
  const words: string[] = [];
  const notes: string[] = [];
  let dup = false;
  let cut = false;
  let over = false;
  let total = 0;
  for (const tok of tokens) {
    let w = tok;
    if (chars(w).length > MAX_WORD) {
      w = chars(w).slice(0, MAX_WORD).join("");
      cut = true;
    }
    if (words.includes(w)) {
      dup = true;
      continue;
    }
    if (
      words.length >= MAX_WORDS ||
      total + chars(w).length > MAX_WORDS_TOTAL
    ) {
      over = true;
      continue;
    }
    words.push(w);
    total += chars(w).length;
  }
  if (dup) notes.push("Duplicitní jehly vynechány.");
  if (cut) notes.push(`Jehly zkráceny na ${MAX_WORD} znaků.`);
  if (over)
    notes.push(
      `Slovník má nejvýše ${MAX_WORDS} jehel a ${MAX_WORDS_TOTAL} znaků – zbytek vynechán.`,
    );
  return { words, note: notes.join(" ") };
}

/** Seno σ: bez bílých znaků, nejvýše MAX_AC_HAYSTACK znaků. */
export function cleanAcHaystack(text: string): { value: string; note: string } {
  const raw = String(text ?? "");
  const noSpace = raw.replace(/\s+/gu, "");
  const cs = chars(noSpace);
  const notes: string[] = [];
  if (noSpace !== "" && /\s/u.test(raw))
    notes.push("Mezery ze sena vynechány.");
  if (cs.length > MAX_AC_HAYSTACK)
    notes.push(`Seno zkráceno na ${MAX_AC_HAYSTACK} znaků.`);
  return {
    value: cs.slice(0, MAX_AC_HAYSTACK).join(""),
    note: notes.join(" "),
  };
}

/* ------------------------------------------------------------------ kroky */

export type AcEdgeKind = "fwd" | "back" | "short";

export interface AcState {
  phase: AcPhase;
  words: string[];
  /** celý strom (kreslí se jen stavy id < shown – poloha vrcholů se mezi kroky nemění) */
  nodes: AcNode[];
  /** kolik stavů už je ve stromu (vkládání slov) */
  shown: number;
  /** kolik slov je vloženo (Slovo nastaveno) */
  inserted: number;
  /** právě vložené stavy (řádek 3) */
  fresh: number[];
  back: (number | null)[];
  short: (number | null)[];
  /** má už stav spočtenou zpětnou hranu (kořen vždy) */
  known: boolean[];
  /** fronta F */
  queue: number[];
  /** vrchol vybraný z fronty */
  i: number | null;
  /** syn s, jehož zpětnou hranu počítáme */
  child: number | null;
  /** stav automatu (hledání) / z v AcKroku konstrukce */
  s: number;
  /** čtený znak (hledání) / písmeno na hraně is (konstrukce) */
  x: string | null;
  /** stavy prošlé zpětnými hranami v tomto AcKroku */
  chain: number[];
  /** právě procházená hrana */
  edge: { from: number; to: number; kind: AcEdgeKind } | null;
  /** hlášený stav j (řádky 5–9) */
  j: number | null;
  /** právě nastavená zpětná hrana / zkratka (stav s) */
  newBack: number | null;
  newShort: number | null;
  /** seno a index čteného znaku */
  text: string;
  k: number | null;
  /** ohlášené výskyty v pořadí hlášení */
  out: AcHitOut[];
  /** výskyt ohlášený v tomto kroku (index do out) */
  hit: number | null;
  count: AcCount;
}

export type AcMode = "all" | "build" | "search";

const q = (c: string) => `„${c}“`;

/** Hlášení počtu výskytů česky (společné pro řetězcové moduly v pageModel.ts). */
export { hitsWord };

/**
 * Kroky Aho–Corasickové. `mode`: "all" = příklad z knihy – stavba automatu a hned hledání v jedné
 * sadě kroků; "build" = jen AcKonstrukce; "search" = jen AcHledej (automat se postaví bez kroků).
 * `from` (jen "search"): seno do pozice `from` se přečte bez kroků – navazující čtení znaku.
 */
export function* acSteps(
  words: readonly string[],
  text: string,
  mode: AcMode = "all",
  from = 0,
): StepGen<AcState> {
  const A = acBuild(words);
  const nodes = A.nodes;
  const n = nodes.length;
  const nm = (s: number | null) => (s === null ? "∅" : nodes[s].name);
  const searchOnly = mode === "search";
  const st: AcState = {
    phase: searchOnly ? "search" : "build",
    words: [...words],
    nodes,
    shown: searchOnly ? n : 1,
    inserted: searchOnly ? words.length : 0,
    fresh: [],
    back: searchOnly ? [...A.back] : nodes.map(() => null),
    short: searchOnly ? [...A.short] : nodes.map(() => null),
    known: nodes.map((_, i) => searchOnly || i === 0),
    queue: [],
    i: null,
    child: null,
    s: 0,
    x: null,
    chain: [],
    edge: null,
    j: null,
    newBack: null,
    newShort: null,
    text,
    k: null,
    out: [],
    hit: null,
    count: { fwd: 0, back: 0, short: 0, reports: 0 },
  };
  const clear = () => {
    st.fresh = [];
    st.edge = null;
    st.newBack = null;
    st.newShort = null;
    st.hit = null;
    st.j = null;
  };

  /* ---- AcKonstrukce ---- */
  if (!searchOnly) {
    const B = LINES.build;
    if (words.length === 0) return;
    yield snap(st, B.root, "Založíme strom, který obsahuje pouze kořen r = ε.");
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      const before = st.shown;
      // stavy slova vznikly souvisle (číslování podle vzniku)
      let s = 0;
      let last = 0;
      for (const c of chars(w)) {
        s = forward(nodes, s, c)!;
        last = Math.max(last, s);
      }
      st.shown = Math.max(st.shown, last + 1);
      st.inserted = wi + 1;
      st.fresh = Array.from(
        { length: st.shown - before },
        (_, i) => before + i,
      );
      const shared = chars(w).length - st.fresh.length;
      const sharedName = shared > 0 ? chars(w).slice(0, shared).join("") : "";
      yield snap(
        st,
        B.insert,
        `Vložíme ι${sub(wi + 1)} = ${q(w)}: ` +
          (st.fresh.length
            ? `nové stavy ${st.fresh.map((f) => nodes[f].name).join(", ")}` +
              (shared ? ` (sdílí prefix ${sharedName})` : "")
            : `žádný nový stav – ${w} je prefixem jiné jehly`) +
          `; Slovo(${w}) ← ${w}.`,
      );
    }
    clear();
    yield snap(
      st,
      B.init,
      "Zpět(r) ← ∅, Zkratka(r) ← ∅ – kořen je nejkratší stav, kratší vlastní sufix nemá.",
    );
    const rootKids = nodes[0].kids.map((e) => e[1]);
    st.queue = [...rootKids];
    yield snap(
      st,
      B.queue,
      `Do fronty F vložíme syny kořene: ${rootKids.map(nm).join(", ")}.`,
    );
    for (const s of rootKids) {
      st.back[s] = 0;
      st.short[s] = null;
      st.known[s] = true;
    }
    yield snap(
      st,
      B.rootKids,
      `Synové kořene dostanou Zpět = r (ε) a Zkratka = ∅ – stav délky 1 nemá vlastní neprázdný sufix.`,
    );
    while (st.queue.length) {
      clear();
      st.child = null;
      st.chain = [];
      st.x = null;
      const i = st.queue.shift()!;
      st.i = i;
      st.s = i;
      const kids = nodes[i].kids;
      yield snap(
        st,
        B.pick,
        `Vybereme i = ${nm(i)} z fronty F` +
          (kids.length
            ? ` – synové ${kids.map((e) => nm(e[1])).join(", ")}; Zpět(${nm(i)}) = ${nm(st.back[i])}.`
            : " – nemá syny, nic nepočítáme."),
      );
      for (const [x, s] of kids) {
        clear();
        st.child = s;
        st.x = x;
        st.chain = [];
        let z = st.back[i] ?? 0;
        st.s = z;
        // AcKrok(Zpět(i), x): zpětné hrany (řádek 18), dopředná (19)
        while (forward(nodes, z, x) === null && z !== 0) {
          const to = st.back[z] ?? 0;
          st.edge = { from: z, to, kind: "back" };
          st.chain.push(to);
          yield snap(
            st,
            B.loop,
            (st.chain.length === 1
              ? `Syn s = ${nm(s)} (písmeno ${q(x)}): AcKrok začne v Zpět(${nm(i)}) = ${nm(z)}; `
              : `z = ${nm(z)}: `) +
              `Dopředu(${nm(z)}, ${x}) = ∅ → zpětná hrana do ${nm(to)}.`,
          );
          z = to;
          st.s = z;
        }
        const f = forward(nodes, z, x);
        const was = z;
        if (f !== null) {
          z = f;
          st.edge = { from: was, to: z, kind: "fwd" };
        } else st.edge = null;
        st.s = z;
        st.back[s] = z;
        st.known[s] = true;
        st.newBack = s;
        const how =
          f !== null
            ? `Dopředu(${nm(was)}, ${x}) = ${nm(z)}`
            : `Dopředu(ε, ${x}) = ∅ a jsme v kořeni`;
        const sc = nodes[z].word !== null ? z : st.short[z];
        yield snap(
          st,
          B.setBack,
          `z ← AcKrok(Zpět(${nm(i)}), ${x}): ${how} → Zpět(${nm(s)}) ← ${nm(z)}.`,
        );
        st.edge = null;
        st.newBack = null;
        st.queue.push(s);
        if (sc === null) {
          // ř. 13 i bez zkratky: Zkratka(s) ← Zkratka(z) = ∅ (vlastní krok, ať zpráva sedí na řádek)
          st.short[s] = null;
          yield snap(
            st,
            B.shortCopy,
            `Slovo(${nm(z)}) = ∅ → Zkratka(${nm(s)}) ← Zkratka(${nm(z)}) = ∅; ${nm(s)} jde do fronty.`,
          );
        } else {
          st.short[s] = sc;
          st.newShort = s;
          const word = nodes[z].word !== null;
          yield snap(
            st,
            word ? B.shortWord : B.shortCopy,
            word
              ? `Slovo(${nm(z)}) = ${nm(z)} ≠ ∅ → Zkratka(${nm(s)}) ← ${nm(z)}; ${nm(s)} jde do fronty.`
              : `Slovo(${nm(z)}) = ∅ → Zkratka(${nm(s)}) ← Zkratka(${nm(z)}) = ${nm(sc)}; ${nm(s)} jde do fronty.`,
          );
        }
      }
    }
    clear();
    st.i = null;
    st.child = null;
    st.chain = [];
    st.x = null;
    st.s = 0;
    const nBack = n - 1;
    const nShort = st.short.filter((v) => v !== null).length;
    yield snap(
      st,
      B.done,
      `Automat je postavený: ${n} ${statesWord(n)}, ${nBack} zpětných a ${nShort} ${nShort === 1 ? "zkratková hrana" : nShort >= 2 && nShort <= 4 ? "zkratkové hrany" : "zkratkových hran"}.`,
    );
    if (mode === "build") return;
    st.phase = "search";
    st.text = text;
  }

  /* ---- AcHledej ---- */
  const S = LINES.search;
  const t = chars(text);
  clear();
  st.i = null;
  st.child = null;
  st.chain = [];
  st.x = null;
  st.s = 0;
  st.k = null;
  st.queue = [];
  if (from > 0) {
    const pre = acSearch(A, t.slice(0, from).join(""));
    st.s = pre.states[pre.states.length - 1] ?? 0;
    st.out = pre.out;
    st.count = { ...pre.count };
    yield snap(
      st,
      S.read,
      `Seno σ[0 : ${from}] je přečtené, automat je ve stavu ${nm(st.s)}. Čteme další znak.`,
    );
  } else
    yield snap(
      st,
      S.start,
      mode === "all"
        ? `Automat je postavený. AcHledej v seně σ = ${q(text)} (S = ${t.length}): s ← kořen.`
        : `AcHledej: automat pro jehly ${words.join(", ")}, seno σ = ${q(text)} (S = ${t.length}); s ← kořen.`,
    );
  for (let k = from; k < t.length; k++) {
    const x = t[k];
    clear();
    st.k = k;
    st.x = x;
    st.chain = [];
    const readMsg = `Čteme x = σ[${k}] = ${q(x)} ve stavu ${nm(st.s)}`;
    // samostatný krok „čteme“ jen když AcKrok půjde po zpětných hranách; jinak je čtení
    // sloučené s dopřednou hranou (nebo se zahozením znaku v kořeni)
    const direct = forward(nodes, st.s, x) !== null || st.s === 0;
    if (!direct)
      yield snap(st, S.read, `${readMsg}: Dopředu(${nm(st.s)}, ${x}) = ∅.`);
    while (forward(nodes, st.s, x) === null && st.s !== 0) {
      const from = st.s;
      const to = st.back[from] ?? 0;
      st.s = to;
      st.edge = { from, to, kind: "back" };
      st.chain.push(to);
      st.count.back++;
      const f = forward(nodes, to, x);
      yield snap(
        st,
        S.loop,
        `Zpětná hrana ${nm(from)} → Zpět(${nm(from)}) = ${nm(to)}; ` +
          (f !== null
            ? `Dopředu(${nm(to)}, ${x}) = ${nm(f)}.`
            : to === 0
              ? `Dopředu(ε, ${x}) = ∅ a jsme v kořeni.`
              : `Dopředu(${nm(to)}, ${x}) = ∅.`),
      );
    }
    const f = forward(nodes, st.s, x);
    if (f !== null) {
      const was = st.s;
      st.s = f;
      st.edge = { from: was, to: f, kind: "fwd" };
      st.count.fwd++;
      yield snap(
        st,
        S.fwd,
        (direct ? `${readMsg}: dopředná` : "Dopředná") +
          ` hrana ${nm(was)} → ${nm(f)}, jsme ve stavu ${nm(f)}.`,
      );
    } else {
      st.edge = null;
      yield snap(
        st,
        S.fwd,
        (direct ? `${readMsg}: ` : "") +
          `Dopředu(ε, ${x}) = ∅ – znak se nehodí ani v kořeni, zahodíme ho a zůstáváme v ε (str. 325).`,
      );
    }
    // hlášení: j ← s; Dokud j ≠ ∅: Je-li Slovo(j) ≠ ∅ ohlásíme, j ← Zkratka(j)
    let j: number | null = st.s;
    let prev: number | null = null;
    while (j !== null) {
      const w = nodes[j].word;
      // cíl zkratky je vždy koncový stav
      if (w !== null) {
        st.edge = prev === null ? null : { from: prev, to: j, kind: "short" };
        if (prev !== null) st.count.short++;
        st.j = j;
        st.chain = [];
        {
          const at = k - chars(words[w]).length + 1;
          st.out.push({ k: at, word: w });
          st.hit = st.out.length - 1;
          st.count.reports++;
          yield snap(
            st,
            S.report,
            (prev === null
              ? `Slovo(${nm(j)}) = ${nm(j)}`
              : `Zkratka(${nm(prev)}) = ${nm(j)}, Slovo(${nm(j)}) = ${nm(j)}`) +
              ` → ohlásíme (${at}, ${words[w]}): σ[${at} : ${k + 1}] = ${words[w]}.`,
          );
        }
      }
      prev = j;
      j = st.short[j];
    }
    st.j = null;
    st.hit = null;
  }
  clear();
  st.k = null;
  st.x = null;
  st.chain = [];
  const V = st.out.length;
  yield snap(
    st,
    null,
    t.length === 0
      ? "Seno je prázdné – žádný výskyt."
      : `Hotovo: ${hitsWord(V)}. Dopředných hran ${st.count.fwd}, zpětných ${st.count.back} ≤ ${st.count.fwd}, skoků po zkratkách ${st.count.short} – čas Θ(S + V) (str. 329).`,
  );
}

const SUBS = "₀₁₂₃₄₅₆₇₈₉";
/** číslo dolním indexem (ι₁) */
export const sub = (n: number) =>
  String(n)
    .split("")
    .map((d) => SUBS[Number(d)])
    .join("");

/** „stav“ ve správném tvaru */
export function statesWord(n: number): string {
  return n === 1 ? "stav" : n >= 2 && n <= 4 ? "stavy" : "stavů";
}
