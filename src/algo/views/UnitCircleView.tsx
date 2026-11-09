/**
 * Jednotková kružnice s body ω^k (Průvodce obr. 17.1 a 17.2): osy čárkovaně s popisky 1, −1, i, −i, body
 * jako prázdné kroužky, šipka úhlu 2π/n od ω⁰ k ω¹. Aktivní body (kde právě volání vyhodnocuje) jsou
 * plné, spárovaná dvojice ±ω^j motýlku spojená úsečkou přes střed. V ℤ₁₇ jsou body jen schematicky
 * rozmístěné po kružnici a popisky nesou hodnoty mocnin.
 */
import { useId } from "react";
import { circleLayout } from "./unitCircleLayout";

export interface UnitCircleProps {
  /** počet bodů (velikost transformace) */
  n: number;
  inverse: boolean;
  /** body, ve kterých aktivní volání vyhodnocuje */
  active: readonly number[];
  /** dvojice ω^j a −ω^j */
  pair: readonly [number, number] | null;
  /** zvýrazněný bod (bodový součin) */
  hot: number | null;
  /** popisek bodu k („ω³“, v ℤ₁₇ hodnota) */
  label: (k: number) => string;
  /** osy ℂ s popisky 1, −1, i, −i (v ℤ₁₇ ne) */
  axes: boolean;
  /** text úhlu („2π/8“; prázdný = jen šipka), null = bez šipky */
  angleText: string | null;
  size?: number;
  ariaLabel: string;
}

/** bod na oblouku poloměru r pod úhlem a (SVG: osa y dolů) */
const arcPt = (cx: number, cy: number, r: number, a: number) =>
  `${cx + r * Math.cos(a)} ${cy - r * Math.sin(a)}`;

export function UnitCircleView({
  n,
  inverse,
  active,
  pair,
  hot,
  label,
  axes,
  angleText,
  size = 200,
  ariaLabel,
}: UnitCircleProps) {
  // id značky šipky jen z písmen a číslic (url(#…) by se s dvojtečkami z useId nemusel trefit)
  const arrowId = "uc-arrow-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const L = circleLayout(n, inverse, size);
  const on = new Set(active);
  const pairSet = new Set(pair ?? []);
  const P = L.points;
  // šipka úhlu 2π/n od ω⁰ k ω¹ (obr. 17.2), poloměr třetina kružnice
  const ar = L.r * 0.36;
  const a1 = P[1]?.angle ?? 0;
  return (
    <svg
      className="uc-svg"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L8 4 L0 8 z" className="uc-arrow-head" />
        </marker>
      </defs>
      <line
        className="uc-axis"
        x1={L.cx - L.r - 10}
        y1={L.cy}
        x2={L.cx + L.r + 10}
        y2={L.cy}
      />
      <line
        className="uc-axis"
        x1={L.cx}
        y1={L.cy - L.r - 10}
        x2={L.cx}
        y2={L.cy + L.r + 10}
      />
      <circle className="uc-circle" cx={L.cx} cy={L.cy} r={L.r} />
      {axes && (
        <g className="uc-axis-label" aria-hidden="true">
          <text x={L.cx + 4} y={L.cy - L.r + 12}>
            i
          </text>
          <text x={L.cx + 4} y={L.cy + L.r - 4}>
            −i
          </text>
          <text x={L.cx - L.r + 4} y={L.cy + 13}>
            −1
          </text>
          <text x={L.cx + L.r - 10} y={L.cy + 13}>
            1
          </text>
        </g>
      )}
      {angleText !== null && n > 1 && (
        <g className="uc-angle">
          {/* průvodič k ω¹ jako na obr. 17.2 */}
          <line x1={L.cx} y1={L.cy} x2={P[1].x} y2={P[1].y} />
          <path
            d={`M ${arcPt(L.cx, L.cy, ar, 0)} A ${ar} ${ar} 0 0 ${inverse ? 1 : 0} ${arcPt(L.cx, L.cy, ar, a1)}`}
            markerEnd={`url(#${arrowId})`}
          />
          <text
            x={L.cx + (ar + 6) * Math.cos(a1 / 2) + 2}
            y={L.cy - (ar + 6) * Math.sin(a1 / 2) + 4}
          >
            {angleText}
          </text>
        </g>
      )}
      {pair && P[pair[0]] && P[pair[1]] && (
        <line
          className="uc-pair-line"
          x1={P[pair[0]].x}
          y1={P[pair[0]].y}
          x2={P[pair[1]].x}
          y2={P[pair[1]].y}
        />
      )}
      {P.map((p) => {
        const cls = [
          "uc-point",
          on.has(p.k) ? "uc-on" : "uc-off",
          pairSet.has(p.k) ? "uc-pair" : "",
          hot === p.k ? "uc-hot" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <g key={p.k} className={cls}>
            <circle cx={p.x} cy={p.y} r={pairSet.has(p.k) ? 6.5 : 5} />
            <text
              x={p.lx}
              y={p.ly}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {label(p.k)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
