/**
 * Stopa operace pod řadou buněk (E6) – čisté pomocné funkce: řádky stopy z `trail` ve stavu a jejich výška.
 * Kreslí je TrailView.tsx (sdílená kresba .viz-trail); testy v trail.test.ts a trail.dom.test.ts.
 */
import type { CuckooTrailItem } from "./cuckoo";
import type { ProbeTrailItem } from "./tables";
import { trailRows } from "./ui";

/** stav buňky stopy = modifikátor .viz-trail .tr-cell (index.css, „sdílené kresby“); "" = obyčejná buňka */
export type TrailState = "" | "is-done" | "is-ok" | "is-fail";

export interface TrailStep {
  cell: number;
  label: string;
  state: TrailState;
}

/**
 * Obsazená buňka (sonda pokračuje) je obyčejná, náhrobek is-done („†“), prázdná buňka obyčejná s „∅“,
 * nalezený / uložený klíč is-ok, mazaný is-fail (jako mazaný klíč v tabulce).
 */
const PROBE_STATE: Record<ProbeTrailItem["kind"], TrailState> = {
  other: "",
  tomb: "is-done",
  empty: "",
  found: "is-ok",
  removed: "is-fail",
  placed: "is-ok",
};
const PROBE_GLYPH: Partial<Record<ProbeTrailItem["kind"], string>> = {
  tomb: " †",
  empty: " ∅",
};

/**
 * Řádky stopy sond: v řádku je pořadí sondy; uložení do dřív prošlého náhrobku je řádek navíc (ne další
 * sonda) a nese vkládaný klíč.
 */
export function probeTrailSteps(trail: readonly ProbeTrailItem[]): TrailStep[] {
  let probes = 0;
  return trail.map((t, i) => {
    const extra =
      t.kind === "placed" && trail.slice(0, i).some((p) => p.cell === t.cell);
    if (!extra) probes++;
    return {
      cell: t.cell,
      label: extra ? String(t.key) : `${probes}${PROBE_GLYPH[t.kind] ?? ""}`,
      state: PROBE_STATE[t.kind],
    };
  });
}

/** Řádky stopy vyhazování: klíč, který se do buňky stěhuje; poslední (usazený) je is-ok. */
export const cuckooTrailSteps = (
  trail: readonly CuckooTrailItem[],
): TrailStep[] =>
  trail.map((t) => ({
    cell: t.cell,
    label: String(t.key),
    state: t.evicted === null ? "is-ok" : "",
  }));

/** výška obdélníku buňky v řádku stopy (zbytek řádku je místo na šipku) */
export const trailBoxH = (rowH: number) => Math.max(12, rowH - 8);
/** písmo buňky stopy podle výšky obdélníku (11–16 px) */
export const trailFont = (boxH: number) => Math.max(11, Math.min(16, boxH - 6));

/**
 * Nejmenší kapacita stopy pro výšku řádku: řádky jako pro aspoň 6 sond / přesunů. Běžná stopa (výchozí
 * Insert(51) má 6 sond) se během operace nezmenšuje a na nízkém plátně (1280 × 720) zůstane čitelná;
 * delší stopa řádky zmenší (nejméně 16 px), pak se ukáže její konec.
 */
export const TRAIL_CAP_MIN = 6;

/** Mezera mezi indexy pod buňkami a první řádkem stopy (px). */
export const TRAIL_GAP = 6;

/**
 * Výška stopy (px) a řádky, které se vejdou do `avail` px (null = bez omezení: telefon, náhled na úvodní
 * stránce). Výška řádku se počítá z kapacity `cap` (nejdelší možná stopa), takže se během operace nemění.
 * S `reserve` zabere stopa na desktopu celé zbylé místo plátna už před první operací (kresba vyplní
 * plátno, v místě je nápověda); bez známé výšky jen místo pro skutečné řádky.
 */
export function trailBox(
  count: number,
  avail: number | null,
  cap = count,
  reserve = false,
): { rowH: number; shown: number; height: number } {
  const { rowH, shown } = trailRows(
    count,
    avail === null ? null : avail - TRAIL_GAP,
    cap,
  );
  const content = shown > 0 ? TRAIL_GAP + shown * rowH : 0;
  if (!reserve || avail === null) return { rowH, shown, height: content };
  return { rowH, shown, height: Math.max(content, Math.floor(avail), 0) };
}
