/**
 * Geometrie časové osy prokládání pod zásobníkem: dvě dráhy (P1, P2), v každém sloupci jeden atomický
 * krok v dráze procesu, který ho provedl; čas jde zleva doprava. Co se nevejde do šířky, odpadne
 * zleva (poslední krok je vždy vidět). Testy v lockfreeTimeline.test.ts.
 */
import type { LFState, LFTraceItem } from "./lockfree";

export const TL_CHIP_H = 30;
/** místo na popisek dráhy („P1“) */
const LABEL_W = 34;
/** řádek s nadpisem „průběh (čas →)“ */
const TITLE_H = 20;
const LANE_GAP = 8;
const GAP = 6;
const PAD = 6;
/** místo na „… +k“ vlevo, když starší kroky odpadly */
const MORE_W = 46;
/** odhad šířky znaku (16 px, tučně) */
const CHAR_W = 9.6;

export interface TimelineChip extends LFTraceItem {
  lane: 0 | 1;
  x: number;
  y: number;
  w: number;
  h: number;
  /** poslední (právě provedený) krok */
  last: boolean;
}

export interface TimelineLayout {
  W: number;
  H: number;
  lanes: { label: string; y: number }[];
  chips: TimelineChip[];
  /** kolik starších kroků není vidět (vypadly ze stavu nebo se nevešly) */
  hidden: number;
  /** x popisku „…“ pro skryté kroky */
  moreX: number;
  titleY: number;
}

const chipW = (text: string) => Math.round(text.length * CHAR_W + 18);

export function lfTimeline(
  trace: readonly LFTraceItem[],
  skipped: number,
  width: number,
): TimelineLayout {
  const W = Math.max(
    LABEL_W + 2 * PAD + 120,
    Number.isFinite(width) && width > 0 ? Math.floor(width) : 600,
  );
  const top = PAD + TITLE_H;
  const lanes = [
    { label: "P1", y: top },
    { label: "P2", y: top + TL_CHIP_H + LANE_GAP },
  ];
  const H = top + 2 * TL_CHIP_H + LANE_GAP + PAD;
  // od konce: kolik posledních kroků se vejde (s místem na „…“, pokud něco odpadne)
  const widths = trace.map((t) => chipW(t.text));
  const room = W - LABEL_W - 2 * PAD;
  let used = 0;
  let from = trace.length;
  while (from > 0) {
    const w = widths[from - 1] + (from < trace.length ? GAP : 0);
    const more = from - 1 > 0 || skipped > 0 ? MORE_W : 0;
    if (used + w + more > room && from < trace.length) break;
    used += w;
    from--;
  }
  const hidden = skipped + from;
  let x = LABEL_W + PAD + (hidden ? MORE_W : 0);
  const chips: TimelineChip[] = [];
  for (let i = from; i < trace.length; i++) {
    const t = trace[i];
    chips.push({
      ...t,
      lane: t.p,
      x,
      y: lanes[t.p].y,
      w: widths[i],
      h: TL_CHIP_H,
      last: i === trace.length - 1,
    });
    x += widths[i] + GAP;
  }
  return {
    W,
    H,
    lanes,
    chips,
    hidden,
    moreX: LABEL_W + PAD,
    titleY: PAD + 13,
  };
}

/** Celý průběh pro čtečku (aria-label kresby): „Průběh prokládání: P2: Pop, P2: h = A, …“. */
export function timelineLabel(st: LFState): string {
  if (!st.trace.length) return "Průběh prokládání: zatím žádný krok";
  const older = st.traceSkipped ? `(${st.traceSkipped} starších kroků) ` : "";
  return `Průběh prokládání: ${older}${st.trace
    .map((t) => `P${t.p + 1}: ${t.text}`)
    .join(", ")}`;
}
