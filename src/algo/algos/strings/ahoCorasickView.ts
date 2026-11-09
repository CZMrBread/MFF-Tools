/**
 * Co se z kroku Aho–Corasickové kreslí – čisté funkce bez Reactu (stránka AhoCorasickPage i náhled
 * ahoCorasick.preview je sdílí): rozvržení stromu (obr. 13.2 z knihy, jinak automatické), třídy stavů
 * a hran, řádek sena, závorky výskytů, řádky tabulky stavů a proměnné pod kresbou.
 */
import type { FitLimits } from "../../core/canvasFit";
import { stretch } from "../../core/canvasFit";
import type { Step } from "../../core/steps";
import {
  edgeKey,
  trieAutomaton,
  type AutomatonLayout,
} from "../../views/automatonLayout";
import type { StripRow } from "../../views/TextStripView";
import type { StripBracket } from "../../views/textStripLayout";
import type { AcState } from "./ahoCorasick";
import { FIG_13_2_BENDS, FIG_13_2_COORDS, isFig132 } from "./bookStrings";

/** výchozí vzdálenost hladin stromu a meze přizpůsobení výšce plátna */
export const AC_LEVEL = 50;
const AC_LEVEL_MIN = 26;
const AC_LEVEL_MAX = 72;
/** nad tolik stavů se kreslí jen zpětné hrany, které se v kroku týkají (jinak nečitelné) */
export const AC_ALL_BACK_MAX = 16;

export const acDepth = (st: AcState) =>
  st.nodes.reduce((m, n) => Math.max(m, n.depth), 0);

export function acFitLimits(depth: number): FitLimits {
  if (!depth) return { shrink: 0, grow: 0 };
  return {
    shrink: depth * (AC_LEVEL - AC_LEVEL_MIN),
    grow: depth * (AC_LEVEL_MAX - AC_LEVEL),
  };
}

/** vzdálenost hladin pro deltu z CanvasFit (výška stromu se mění právě o deltu) */
export const acLevel = (delta: number, depth: number) =>
  depth
    ? stretch(AC_LEVEL, delta / depth, AC_LEVEL_MIN, AC_LEVEL_MAX)
    : AC_LEVEL;

/** stavy, jejichž zpětná hrana se v kroku týká (režim „jen aktuální“) */
export function acFocus(st: AcState): number[] {
  const f = [st.s, st.child, st.i, st.j, st.newBack, ...st.chain];
  if (st.edge) f.push(st.edge.from);
  return f.filter((v): v is number => v !== null);
}

export interface AcDrawOptions {
  /** jména stavů vedle kroužků */
  names: boolean;
  /** všechny zpětné hrany (jinak jen ty, které se v kroku týkají) */
  allBack: boolean;
  levelH: number;
}

/** Rozvržení stromu: obr. 13.2 podle obrázku (polohy a ohyby), jinak automatické. */
export function acLayout(
  st: AcState,
  o: AcDrawOptions,
): (width: number) => AutomatonLayout {
  const book = isFig132(st.words);
  const id = new Map(st.nodes.map((n) => [n.name, n.id]));
  const bends: Record<string, number> = {};
  if (book)
    for (const [k, v] of Object.entries(FIG_13_2_BENDS)) {
      const [kind, name] = k.split(":");
      const from = id.get(name);
      if (from === undefined) continue;
      const to = kind === "back" ? st.back[from] : st.short[from];
      if (to !== null && to !== undefined)
        bends[edgeKey(kind === "back" ? "back" : "short", from, to)] = v;
    }
  const back = st.back.map((b, i) => (st.known[i] ? b : null));
  return (width) =>
    trieAutomaton(st.nodes, {
      back,
      short: st.short,
      width,
      levelH: o.levelH,
      names: o.names,
      visible: st.shown,
      coords: book ? st.nodes.map((n) => FIG_13_2_COORDS[n.name]) : undefined,
      bends: book ? bends : undefined,
      backFrom: o.allBack ? undefined : acFocus(st),
    });
}

/** Třídy stavů a hran stromu. */
export function acMarks(st: AcState): {
  nodeCls: Record<number, string>;
  edgeCls: Record<string, string>;
} {
  const nodeCls: Record<number, string> = {};
  const build = st.phase === "build";
  const queue = new Set(st.queue);
  const chain = new Set(st.chain);
  for (const n of st.nodes) {
    if (n.id >= st.shown) continue;
    const word = n.word !== null && n.word < st.inserted;
    const cls = [
      word ? "au-word" : "",
      build && !st.known[n.id] ? "au-pending" : "",
      build && queue.has(n.id) ? "au-queue" : "",
      st.fresh.includes(n.id) || n.id === st.newBack || n.id === st.newShort
        ? "au-new"
        : "",
      chain.has(n.id) && n.id !== st.s ? "au-cmp" : "",
      build && n.id === st.i ? "au-pick" : "",
      build && n.id === st.child ? "au-child" : "",
      n.id === st.j ? "au-report" : "",
      n.id === st.s && (!build || st.child !== null) ? "au-current" : "",
    ].filter(Boolean);
    if (cls.length) nodeCls[n.id] = cls.join(" ");
  }
  const edgeCls: Record<string, string> = {};
  if (st.edge)
    edgeCls[edgeKey(st.edge.kind, st.edge.from, st.edge.to)] = "au-hot";
  if (st.newBack !== null && st.back[st.newBack] !== null)
    edgeCls[edgeKey("back", st.newBack, st.back[st.newBack] ?? 0)] = "au-new";
  if (st.newShort !== null && st.short[st.newShort] !== null)
    edgeCls[edgeKey("short", st.newShort, st.short[st.newShort] ?? 0)] =
      "au-new";
  return { nodeCls, edgeCls };
}

/** Šířka pásu ve slotech pro celou sadu kroků (mezi kroky se nemění). */
export function acSlots(steps: readonly Step<AcState>[]): number {
  let n = 1;
  for (const { state } of steps) n = Math.max(n, [...state.text].length);
  return n;
}

/** Řádek sena: čtený znak, přečtený sufix = jméno stavu, při stavbě ztlumené. */
export function acRows(st: AcState, pickable = false): StripRow[] {
  const t = [...st.text];
  const build = st.phase === "build";
  const depth = st.nodes[st.s]?.depth ?? 0;
  const k = st.k;
  return [
    {
      key: "text",
      label: "σ",
      indices: true,
      pickable: pickable && !build,
      cells: t.map((ch, i) => ({
        ch,
        cls: build
          ? "s-dim"
          : i === k
            ? "s-active"
            : k !== null && i > k - depth && i < k
              ? "s-match"
              : undefined,
      })),
    },
  ];
}

/** Závorky ohlášených výskytů pod senem (popisek = jehla); právě ohlášený zvýrazněný. */
export function acBrackets(st: AcState): StripBracket[] {
  if (st.phase !== "search") return [];
  return st.out.map((o, i) => ({
    from: o.k,
    to: o.k + [...st.words[o.word]].length,
    label: st.words[o.word],
    cls: i === st.hit ? "b-hit b-now" : "b-hit",
  }));
}

/** Pás pod stromem: fronta F (stavba) nebo ohlášené výskyty (hledání). */
export function acLine(st: AcState): {
  label: string;
  items: string[];
  now: number | null;
} {
  if (st.phase === "build")
    return {
      label: "Fronta F:",
      items: st.queue.map((v) => st.nodes[v].name),
      now: null,
    };
  return {
    label: "Ohlášeno:",
    items: st.out.map((o) => `(${o.k}, ${st.words[o.word]})`),
    now: st.hit,
  };
}

export interface AcRow {
  id: number;
  name: string;
  back: string;
  short: string;
  word: string;
  cls: string;
}

/** Tabulka stavů (reprezentace ze str. 327): #, stav, Zpět, Zkratka, Slovo; „?“ = ještě nespočteno. */
export function acTable(st: AcState): AcRow[] {
  const nm = (v: number | null) => (v === null ? "∅" : st.nodes[v].name);
  return st.nodes.slice(0, st.shown).map((n) => {
    const known = st.known[n.id];
    return {
      id: n.id,
      name: n.name,
      back: n.id === 0 ? "∅" : known ? nm(st.back[n.id]) : "?",
      short:
        n.id === 0
          ? "∅"
          : known
            ? st.short[n.id] === null
              ? "–"
              : nm(st.short[n.id])
            : "?",
      word: n.word !== null && n.word < st.inserted ? st.words[n.word] : "–",
      cls: [
        n.id === st.s && (st.phase === "search" || st.child !== null)
          ? "row-cur"
          : "",
        n.id === st.child || n.id === st.j ? "row-hot" : "",
        n.id === st.newBack || n.id === st.newShort || st.fresh.includes(n.id)
          ? "row-new"
          : "",
        !known ? "row-pending" : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
}

export function acVars(st: AcState): Record<string, string | number> {
  const nm = (v: number) => st.nodes[v].name;
  const v: Record<string, string | number> = {};
  if (st.phase === "build") {
    if (st.i !== null) v.i = nm(st.i);
    if (st.child !== null) {
      v.s = nm(st.child);
      v["písmeno"] = st.x ?? "";
      v.z = nm(st.s);
    }
    v["stavů"] = `${st.shown} / ${st.nodes.length}`;
  } else {
    v.s = nm(st.s);
    if (st.k !== null) {
      v.k = st.k;
      v.x = [...st.text][st.k];
    }
    if (st.j !== null) v.j = nm(st.j);
    v.S = [...st.text].length;
    v["dopředné / zpětné hrany"] = `${st.count.fwd} / ${st.count.back}`;
    v["výskyty"] = st.count.reports;
  }
  return v;
}

export function acAria(st: AcState): string {
  return st.phase === "build"
    ? `Seno ${st.text} čeká na hledání`
    : `Seno ${st.text}; stav ${st.nodes[st.s].name}${st.k !== null ? `, čteme znak ${st.k}` : ""}`;
}
