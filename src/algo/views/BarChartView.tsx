/**
 * Sloupcový graf s křivkou – skutečná cena operací a potenciál jako Průvodce obr. 9.2 (sloupce = cena
 * každé operace, křivka = potenciál před první operací a po každé další). Geometrie je v
 * barChartLayout.ts. Sloupce jdou projít z klávesnice (roving tabindex: jedna zastávka Tabu, šipky po
 * sloupcích); popis sloupce čte čtečka. Výšku dává stránka (canvasFit), šířku obal. Barvy mřížky,
 * křivky a bodů nesou sdílené třídy .viz-barchart (bc-axis, bc-grid, bc-line, bc-dot v index.css).
 */
import { useRef } from "react";
import { formatNum } from "../core/format";
import { useRovingFocus } from "../core/useRovingFocus";
import { barChartLayout } from "./barChartLayout";
import { useRelayoutFreeze } from "./useFlip";
import { useWidth } from "./useWidth";

export interface BarChartProps {
  /** hodnota (výška sloupce) každé operace */
  bars: readonly number[];
  /** křivka: před první operací a po každé z nich (délka bars + 1), nebo prázdné */
  line: readonly number[];
  /** pořadové číslo první operace */
  first: number;
  /** celková výška kresby (px) */
  height: number;
  /** index zvýrazněného sloupce (poslední operace), null = žádný */
  current?: number | null;
  ariaLabel: string;
  /** popis i-tého sloupce pro čtečku */
  barLabel: (i: number) => string;
  /** text místo grafu, dokud není žádná operace */
  emptyText: string;
}

const fmt = (v: number) => formatNum(Math.round(v * 100) / 100);

export function BarChartView({
  bars,
  line,
  first,
  height,
  current = null,
  ariaLabel,
  barLabel,
  emptyText,
}: BarChartProps) {
  const [wrapRef, width] = useWidth();
  const L = barChartLayout({ bars, line, first, width, height });
  const svgRef = useRef<SVGSVGElement>(null);
  // změna rozměrů (canvasFit, šířka okna) není krok – sloupce se nepřechází
  useRelayoutFreeze(svgRef, `${L.W}|${L.H}`);
  const rove = useRovingFocus(L.bars.map((b) => b.no));
  const empty = L.bars.length === 0;
  const points = L.line.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="view-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${L.W} ${L.H}`}
        width={L.W}
        height={L.H}
        className="array-svg viz-barchart"
        role={empty ? "img" : "group"}
        aria-label={empty ? `${ariaLabel}: ${emptyText}` : ariaLabel}
        {...(empty ? {} : rove.group)}
      >
        {L.yTicks.map((t) => (
          <g key={t.value} aria-hidden="true">
            <line
              x1={L.plot.left}
              x2={L.plot.right}
              y1={t.y}
              y2={t.y}
              className={t.value ? "bc-axis bc-grid" : "bc-axis"}
            />
            <text
              x={L.plot.left - 6}
              y={t.y + 4}
              textAnchor="end"
              className="bar-index"
            >
              {fmt(t.value)}
            </text>
          </g>
        ))}
        <line
          className="bar-axis"
          x1={L.plot.left}
          x2={L.plot.right}
          y1={L.plot.bottom}
          y2={L.plot.bottom}
        />
        {L.bars.map((b, i) => (
          <g
            key={b.no}
            className={"bar " + (i === current ? "bar-bound" : "bar-plain")}
            role="img"
            aria-label={barLabel(i)}
            {...rove.item(b.no)}
          >
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} />
            {L.showValues && (
              <text
                x={b.x + b.w / 2}
                y={b.y - 4}
                textAnchor="middle"
                className="bar-value"
              >
                {fmt(b.value)}
              </text>
            )}
          </g>
        ))}
        {L.xTicks.map((t) => (
          <text
            key={t.no}
            x={t.x}
            y={L.plot.bottom + 15}
            textAnchor="middle"
            className="bar-index"
            aria-hidden="true"
          >
            {t.no}
          </text>
        ))}
        {L.line.length > 1 && (
          <polyline points={points} aria-hidden="true" className="bc-line" />
        )}
        {L.line.map((p, k) => (
          <circle
            key={k}
            // bod potenciálu po zvýrazněné operaci (index křivky = index sloupce + 1)
            className={
              "bc-dot" +
              (current !== null && k === current + 1 ? " is-hot" : "")
            }
            cx={p.x}
            cy={p.y}
            r={3}
            aria-hidden="true"
          />
        ))}
        {empty && (
          <text
            x={(L.plot.left + L.plot.right) / 2}
            y={(L.plot.top + L.plot.bottom) / 2}
            textAnchor="middle"
            className="bar-value"
          >
            {emptyText}
          </text>
        )}
      </svg>
    </div>
  );
}
