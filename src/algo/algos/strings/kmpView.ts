/**
 * Co se z kroku KMP kreslí – čisté funkce bez Reactu (stránka KmpPage i náhled kmp.preview je sdílí):
 * řádky pásu textu (čtený řetězec a jehla s posunem), závorky výskytů, třídy stavů a hran automatu,
 * proměnné pod kresbou.
 */
import type { Step } from "../../core/steps";
import type { StripRow } from "../../views/TextStripView";
import type { StripBracket } from "../../views/textStripLayout";
import {
  edgeKey,
  linearAutomaton,
  type AutomatonLayout,
} from "../../views/automatonLayout";
import { ENDMARK, stateName, type KmpState } from "./kmp";

/** Šířka pásu ve slotech pro celou sadu kroků (jehla smí přečnívat za konec sena) – mezi kroky se nemění. */
export function kmpSlots(steps: readonly Step<KmpState>[]): number {
  let n = 1;
  for (const { state: st } of steps) {
    const J = [...st.needle].length;
    const tail = st.phase === "search" ? J + 1 : J;
    n = Math.max(n, [...st.text].length, st.shift + tail);
  }
  return n;
}

/** Řádky pásu: čtený řetězec (při stavbě jehla, ι[0] se nečte) a jehla s posunem pod ním. */
export function kmpRows(st: KmpState, pickable = false): StripRow[] {
  const t = [...st.text];
  const p = [...st.needle];
  const build = st.phase === "build";
  const matchFrom = st.shift;
  const matchTo = st.shift + st.s;
  const top: StripRow = {
    key: "text",
    label: build ? "ι" : "σ",
    indices: true,
    pickable: pickable && !build,
    cells: t.map((ch, i) => ({
      ch,
      cls:
        i === st.k
          ? "s-active"
          : st.k !== null && i >= matchFrom && i < matchTo
            ? "s-match"
            : build && i === 0
              ? "s-dim"
              : undefined,
    })),
  };
  const cells = p.map((ch, i) => {
    if (st.cmp && st.cmp.i === i)
      return {
        ch,
        cls: st.cmp.ok ? "s-ok" : "s-bad",
        glyph: st.cmp.ok ? "✓" : "✗",
      };
    return { ch, cls: i < st.s && st.k !== null ? "s-match" : undefined };
  });
  if (!build) {
    const J = p.length;
    const atEnd = st.cmp?.i === J;
    cells.push({
      ch: ENDMARK,
      cls: atEnd ? "s-bad" : "s-end",
      glyph: atEnd ? "✗" : undefined,
    });
  }
  return [
    top,
    {
      key: "needle",
      label: "ι",
      offset: st.shift,
      cells: cells.map((c, i) => (i === p.length ? { ...c, dashed: true } : c)),
    },
  ];
}

/** Závorky ohlášených výskytů pod senem. */
export function kmpBrackets(st: KmpState): StripBracket[] {
  const J = [...st.needle].length;
  return st.phase === "search"
    ? st.found.map((f) => ({
        from: f,
        to: f + J,
        label: String(f),
        cls: "b-hit",
      }))
    : [];
}

export function kmpLayout(st: KmpState): (width: number) => AutomatonLayout {
  const p = [...st.needle];
  const names = Array.from({ length: p.length + 1 }, (_, s) =>
    stateName(st.needle, s),
  );
  return (w) => linearAutomaton(names, p, st.Z, w);
}

/** Třídy stavů a hran automatu: aktuální stav, nehotové zpětné hrany (stavba), procházená hrana. */
export function kmpMarks(st: KmpState): {
  nodeCls: Record<number, string>;
  edgeCls: Record<string, string>;
} {
  const J = [...st.needle].length;
  const nodeCls: Record<number, string> = {};
  for (let s = 0; s <= J; s++) {
    const cls = [
      s === st.s ? "au-current" : "",
      st.phase === "build" && s > st.known ? "au-pending" : "",
      s === J ? "au-final" : "",
      st.zCol === s ? "au-new" : "",
    ].filter(Boolean);
    if (cls.length) nodeCls[s] = cls.join(" ");
  }
  const edgeCls: Record<string, string> = {};
  if (st.edge)
    edgeCls[edgeKey(st.edge.kind, st.edge.from, st.edge.to)] = "au-hot";
  if (st.zCol !== null && st.Z[st.zCol] !== null)
    edgeCls[edgeKey("back", st.zCol, st.Z[st.zCol] ?? 0)] = "au-new";
  return { nodeCls, edgeCls };
}

export function kmpVars(st: KmpState): Record<string, string | number> {
  const v: Record<string, string | number> = {
    s: `${st.s} (${stateName(st.needle, st.s)})`,
  };
  if (st.k !== null) {
    if (st.phase === "build") v.i = st.k + 1;
    else v.k = st.k;
    v.x = [...st.text][st.k];
  }
  v.J = [...st.needle].length;
  if (st.phase === "search") v.S = [...st.text].length;
  v["dopředné / zpětné hrany"] = `${st.count.fwd} / ${st.count.back}`;
  v["porovnání"] = st.count.cmp;
  return v;
}

export function kmpAria(st: KmpState): string {
  const what =
    st.phase === "build"
      ? `Jehla ${st.needle} čtená sama sebou`
      : `Seno ${st.text}`;
  return `${what}; jehla posunutá o ${st.shift}, stav ${st.s}${st.k !== null ? `, čteme znak ${st.k}` : ""}`;
}
