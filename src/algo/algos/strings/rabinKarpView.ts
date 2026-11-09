/**
 * Co se z kroku Rabin–Karp kreslí – čisté funkce (stránka i náhled): řádky pásu (seno, kódy písmen,
 * heše okének pod začátkem okénka, jehla pod okénkem), okénko, závorky výskytů a falešných shod.
 */
import type { StripRow, StripWindow } from "../../views/TextStripView";
import { stackBrackets, type StripBracket } from "../../views/textStripLayout";
import { letterCode, type RkState } from "./rabinKarp";

export function rkSlots(st: RkState): number {
  return Math.max([...st.text].length, [...st.needle].length, 1);
}

/** Heše s víc než 3 číslicemi se pod pozice nevejdou (překrývají se) – h je jen v proměnných. */
export function rkWideHashes(st: RkState): boolean {
  return String(Math.max(0, st.N - 1)).length > 3;
}

/**
 * Kam patří jehla: pod aktuální okénko; po skončení (všechny heše spočítané, žádné okénko) pod poslední
 * výskyt, jinak pod poslední okénko – jako u KMP; před začátkem na začátek.
 */
export function rkNeedleOffset(st: RkState): number {
  if (st.i !== null) return st.i;
  const done = st.hashes.length > 0 && st.hashes.every((h) => h !== null);
  if (!done) return 0;
  return st.found.at(-1) ?? st.hashes.length - 1;
}

export function rkRows(st: RkState, pickable = false): StripRow[] {
  const t = [...st.text];
  const p = [...st.needle];
  const i = rkNeedleOffset(st);
  const textCls = (k: number) => {
    if (st.roll?.out === k) return { cls: "s-out" };
    if (st.roll?.inc === k) return { cls: "s-in" };
    if (st.cmp && st.i !== null && k === st.i + st.cmp.at)
      return {
        cls: st.cmp.ok ? "s-ok" : "s-bad",
        glyph: st.cmp.ok ? "✓" : "✗",
      };
    return {};
  };
  return [
    {
      key: "text",
      label: "σ",
      indices: true,
      pickable,
      cells: t.map((ch, k) => ({ ch, ...textCls(k) })),
    },
    {
      key: "codes",
      label: "kód",
      kind: "num",
      cells: t.map((ch) => ({ ch: String(letterCode(ch)) })),
    },
    ...(rkWideHashes(st) ? [] : [hashRow(st)]),
    {
      key: "needle",
      label: "ι",
      offset: i,
      cells: p.map((ch, k) =>
        st.cmp?.at === k
          ? {
              ch,
              cls: st.cmp.ok ? "s-ok" : "s-bad",
              glyph: st.cmp.ok ? "✓" : "✗",
            }
          : { ch, cls: st.i === null ? "s-dim" : undefined },
      ),
    },
  ];
}

/** Řádek h: heš každého okénka pod jeho začátkem. */
function hashRow(st: RkState): StripRow {
  return {
    key: "hashes",
    label: "h",
    kind: "num",
    cells: st.hashes.map((h, k) =>
      h === null
        ? null
        : {
            ch: String(h),
            cls:
              st.verdicts[k] === "hit"
                ? "n-hit"
                : st.verdicts[k] === "false"
                  ? "n-false"
                  : h === st.j
                    ? "n-eq"
                    : k === st.i
                      ? "n-cur"
                      : undefined,
          },
    ),
  };
}

export function rkWindow(st: RkState): StripWindow | null {
  const J = [...st.needle].length;
  return st.i === null || J === 0
    ? null
    : { from: st.i, len: J, rows: [0, 1], cls: "w-rk" };
}

/** nad tolik pater závorek se výskyty sbalí do jedné řady značek */
const MAX_BRACKET_FLOORS = 6;

/** Sbalit závorky (rozhoduje závěrečný stav, ať se kresba během běhu nepřepíná)? */
export function rkCollapse(fin: RkState): boolean {
  const floors = stackBrackets(rkBrackets(fin)).reduce(
    (m, b) => Math.max(m, b.row + 1),
    0,
  );
  return floors > MAX_BRACKET_FLOORS;
}

/**
 * Závorky výskytů (✓) a falešných shod (≈) nad senem. `collapse` (rkCollapse): místo závorky přes celé
 * okénko jen značka nad jeho začátkem – jedna řada i u desítek překrývajících se výskytů.
 */
export function rkBrackets(st: RkState, collapse = false): StripBracket[] {
  const J = collapse ? 1 : [...st.needle].length;
  return Object.entries(st.verdicts)
    .map(([k, v]) => ({ at: Number(k), v }))
    .sort((a, b) => a.at - b.at)
    .map(({ at, v }) =>
      collapse
        ? {
            from: at,
            to: at + 1,
            label: v === "hit" ? "✓" : "≈",
            cls: v === "hit" ? "b-hit" : "b-false",
          }
        : v === "hit"
          ? { from: at, to: at + J, label: `${at} ✓`, cls: "b-hit" }
          : { from: at, to: at + J, label: `${at} ≈`, cls: "b-false" },
    );
}

export function rkVars(st: RkState): Record<string, string | number> {
  const v: Record<string, string | number> = {};
  if (st.i !== null) v.i = st.i;
  const h = st.i !== null ? st.hashes[st.i] : null;
  if (h !== null && h !== undefined) v.h = h;
  if (st.j !== null) v.j = st.j;
  v["porovnání hešů"] = st.count.hashCmp;
  v["porovnání znaků"] = st.count.charCmp;
  v["falešné shody"] = st.count.falseHits;
  return v;
}

export function rkAria(st: RkState): string {
  return (
    `Seno ${st.text}, jehla ${st.needle}${st.i !== null ? `, okénko na pozici ${st.i}` : ""}; ` +
    `heše okének: ${st.hashes.map((h) => (h === null ? "?" : h)).join(", ")}`
  );
}
