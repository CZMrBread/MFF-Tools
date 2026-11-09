/**
 * Čistá geometrie jednotkové kružnice s mocninami ω (Průvodce obr. 17.1 a 17.2, str. 428–429):
 * ω⁰ vpravo na reálné ose, mocniny proti směru hodinových ručiček (inverzní ω̄ po směru), popisky vně.
 * Testy: unitCircleLayout.test.ts.
 */

export interface CirclePoint {
  k: number;
  /** úhel v radiánech (matematicky, proti směru hodinových ručiček) */
  angle: number;
  x: number;
  y: number;
  /** střed popisku */
  lx: number;
  ly: number;
}

export interface CircleLayout {
  size: number;
  cx: number;
  cy: number;
  r: number;
  points: CirclePoint[];
}

/** Odstup popisku od kružnice (px). */
const LABEL_GAP = 15;

export function circleLayout(
  n: number,
  inverse: boolean,
  size: number,
): CircleLayout {
  const cx = size / 2;
  const cy = size / 2;
  // místo na popisky (≈ 2 znaky) a půl bodu
  const r = size / 2 - LABEL_GAP - 14;
  const sign = inverse ? -1 : 1;
  const points = Array.from({ length: n }, (_, k) => {
    const angle = (sign * 2 * Math.PI * k) / n;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      k,
      angle,
      x: cx + r * cos,
      y: cy - r * sin,
      lx: cx + (r + LABEL_GAP) * cos,
      ly: cy - (r + LABEL_GAP) * sin,
    };
  });
  return { size, cx, cy, r, points };
}
