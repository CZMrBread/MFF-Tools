import type { Item, Mark } from "../algos/sorting/types";
import {
  arrayLayout,
  describeArray,
  MARK_GLYPH,
  TOP,
  type BarMark,
  type Range,
} from "./arrayLayout";
import { useRef } from "react";
import { formatNum } from "../core/format";
import { useLeaving, useStepMs } from "../core/stepTransition";
import { useRovingFocus } from "../core/useRovingFocus";
import { pickProps } from "./pick";
import { useFlip, useRelayoutFreeze } from "./useFlip";
import { useWidth } from "./useWidth";

interface Props {
  items: (Item | null)[];
  marks: Record<number, Mark>;
  sorted?: number[];
  ranges?: Range[];
  /** maximální hodnota pro škálování výšky (sdílená mezi hlavním a pomocným polem) */
  max: number;
  /** minimální hodnota škály (sdílená s hlavním polem, výchozí 0); záporné sloupce míří dolů od nulové osy */
  min?: number;
  /** výška oblasti sloupců v px */
  height?: number;
  label?: string;
  /** zobrazit indexy 1-based pod sloupci */
  showIndex?: boolean;
  /** počet slotů pro šířku (sdílení měřítka s hlavním polem) */
  slotCount?: number;
  /** posun o tolik slotů doprava */
  offset?: number;
  /** rezervovat místo pro svorky úseků, i když je tento krok nemá (plátno mezi kroky neposkakuje) */
  reserveRanges?: boolean;
  /** kreslit znak značky pod sloupcem (MARK_GLYPH), výchozí ano */
  glyphs?: boolean;
  /** přístupný název SVG; výchozí „Pole: 38, 27, …“ */
  ariaLabel?: string;
  /** pevná šířka v px místo změřené šířky obalu */
  width?: number;
  /** klik (Enter) na sloupec: index v `items` a hodnota – stránka vyplní argument akce */
  onPick?: (index: number, value: number) => void;
}

/**
 * Pole jako sloupcový graf v SVG. Sloupce jsou klíčované identitou prvku,
 * takže prohození se animuje posunem (useFlip – Web Animations, délka z Visualizeru – viz
 * core/stepTransition.ts); nové sloupce se objeví, odebrané (ExtractMin, přesun do pomocného pole) doznívají.
 * Kreslí se ve skutečných px podle šířky obalu; užší obal než MIN_SLOT na prvek se posouvá vodorovně.
 */
export function ArrayView({
  items,
  marks,
  sorted = [],
  ranges = [],
  max,
  min,
  height = 220,
  label,
  showIndex = true,
  slotCount,
  offset = 0,
  reserveRanges,
  glyphs = true,
  ariaLabel,
  width,
  onPick,
}: Props) {
  const [ref, measured] = useWidth();
  const values = items.flatMap((it) => (it === null ? [] : [it.v]));
  const L = arrayLayout(values, width ?? measured, {
    max,
    min,
    height,
    showIndex,
    slotCount,
    offset,
    ranges: ranges.length,
    reserveRanges,
    glyphs,
  });
  const sortedSet = new Set(sorted);
  const markOf = (idx: number): BarMark | undefined =>
    marks[idx] ?? (sortedSet.has(idx) ? "sorted" : undefined);

  // odebrané sloupce doznívají na poslední poloze (mimo Visualizer ms = 0 → zmizí hned)
  const leaveMs = useStepMs(0);
  const drawn = new Map<number, { x: number; v: number; mark?: BarMark }>();
  let sig = `${L.W}|${L.barW}|${L.H}`;
  items.forEach((it, idx) => {
    if (it === null) return;
    const d = { x: L.sx(idx), v: it.v, mark: markOf(idx) };
    drawn.set(it.id, d);
    sig += `;${it.id}:${d.x}`;
  });
  const leaving = useLeaving(drawn, leaveMs, sig);
  // přesun sloupců (prohození, vložení): z předchozí polohy do nové; změna šířky plátna se neanimuje
  const svgRef = useRef<SVGSVGElement>(null);
  useFlip(
    svgRef,
    new Map([...drawn].map(([id, d]) => [id, { x: d.x, y: 0 }])),
    leaveMs,
    `${L.W}|${L.barW}`,
  );
  // změna výšky / šířky kresby (canvasFit, okno) není krok – výška sloupců se nepřechází
  useRelayoutFreeze(svgRef, `${L.W}|${L.barW}|${L.H}`);
  // vybírat jde jen s onPick: pak je kresba jedna zastávka Tabu, šipky chodí po sloupcích (D3)
  const rove = useRovingFocus(
    onPick ? items.flatMap((it) => (it === null ? [] : [it.id])) : [],
  );

  return (
    <div className="array-view view-wrap" ref={ref}>
      {label && <div className="array-label">{label}</div>}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${L.W} ${L.H}`}
        width={L.W}
        height={L.H}
        className={"array-svg" + (onPick ? " pickable" : "")}
        role={onPick ? "group" : "img"}
        aria-label={ariaLabel ?? describeArray(items, marks, label ?? "Pole")}
        {...(onPick ? rove.group : {})}
      >
        {L.lo < 0 && (
          <line
            className="bar-axis"
            x1={0}
            x2={L.W}
            y1={L.zeroY}
            y2={L.zeroY}
          />
        )}
        {items.length === 0 && (
          <text
            x={L.W / 2}
            y={L.plotBottom / 2 + 10}
            textAnchor="middle"
            className="box-empty-text"
          >
            prázdné pole
          </text>
        )}
        {items.map((it, idx) => {
          if (it === null) {
            return (
              <rect
                key={"empty-" + idx}
                x={L.sx(idx)}
                y={TOP}
                width={L.barW}
                height={L.plotBottom - TOP}
                className="bar-empty"
              />
            );
          }
          const g = L.bar(it.v);
          const mark = markOf(idx);
          return (
            <g
              key={it.id}
              data-flip={it.id}
              className={
                "bar bar-" + (mark ?? "plain") + (onPick ? " pickable" : "")
              }
              style={{ transform: `translateX(${L.sx(idx)}px)` }}
              {...pickProps(
                onPick && (() => onPick(idx, it.v)),
                `Prvek ${idx + 1}: ${it.v}`,
              )}
              {...(onPick ? rove.item(it.id) : {})}
            >
              <rect
                x={0}
                y={g.y}
                width={L.barW}
                height={g.h}
                rx={L.slot > 16 ? 2 : 0}
              />
              {L.showValues && (
                <text
                  x={L.barW / 2}
                  y={g.labelY}
                  textAnchor="middle"
                  className="bar-value"
                  style={
                    L.valueFont < 13 ? { fontSize: L.valueFont } : undefined
                  }
                >
                  {it.v}
                </text>
              )}
              {L.glyphY !== null && mark && (
                <text
                  x={L.barW / 2}
                  y={L.glyphY}
                  textAnchor="middle"
                  className="bar-glyph"
                  aria-hidden="true"
                >
                  {MARK_GLYPH[mark]}
                </text>
              )}
            </g>
          );
        })}
        {leaving.map(([id, d]) => {
          const g = L.bar(d.v);
          return (
            <g
              key={"leaving-" + id}
              className={"bar leaving bar-" + (d.mark ?? "plain")}
              style={{ transform: `translateX(${d.x}px)` }}
              aria-hidden="true"
            >
              <rect x={0} y={g.y} width={L.barW} height={g.h} />
              {L.showValues && (
                <text
                  x={L.barW / 2}
                  y={g.labelY}
                  textAnchor="middle"
                  className="bar-value"
                  style={
                    L.valueFont < 13 ? { fontSize: L.valueFont } : undefined
                  }
                >
                  {d.v}
                </text>
              )}
            </g>
          );
        })}
        {L.indexY !== null &&
          items.map((_, idx) => (
            <text
              key={"i" + idx}
              x={L.sx(idx) + L.barW / 2}
              y={L.indexY!}
              textAnchor="middle"
              className="bar-index"
            >
              {idx + 1}
            </text>
          ))}
        {ranges.map((r, k) => {
          // obranně: prázdný nebo obrácený úsek (to < from) nekreslíme
          const from = Math.max(0, r.from);
          const to = Math.min(L.n - 1 - offset, r.to);
          if (!(to >= from)) return null;
          const x1 = L.sx(from);
          const x2 = Math.max(x1 + 2, L.sx(to + 1) - L.gap);
          const y = L.rangeY;
          // popisek (text-anchor middle, 11px) celý uvnitř plátna: střed nejméně půl odhadnuté šířky od kraje
          const half = Math.min(L.W / 2, 8 + (r.label?.length ?? 0) * 3.4);
          const tx = Math.max(half, Math.min(L.W - half, (x1 + x2) / 2));
          return (
            <g key={k} className="range">
              <path d={`M${x1},${y - 5} V${y} H${x2} V${y - 5}`} />
              {r.label && (
                <text x={tx} y={y + 13} textAnchor="middle">
                  {r.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Řádek proměnných pod kresbou. `reserve`: když má nějaký krok operace proměnné, řádek drží místo
 * i v krocích bez nich (prázdný, `aria-hidden`) – jinak by na posledním kroku zmizel, plátno
 * (CanvasFit) by kresbu přepočítalo a ta by poskočila. Čísla s českou desetinnou čárkou (formatNum).
 */
export function VarsView({
  vars,
  reserve = false,
  point = false,
}: {
  vars: Record<string, string | number>;
  reserve?: boolean;
  /** desetinná tečka místo české čárky – jen FFT (rozhodnutí vlastníka E3) */
  point?: boolean;
}) {
  const entries = Object.entries(vars);
  if (!entries.length)
    return reserve ? (
      <div className="vars" aria-hidden="true">
        <span className="var">{" "}</span>
      </div>
    ) : null;
  return (
    <div className="vars">
      {entries.map(([k, v]) => (
        <span key={k} className="var">
          <span className="var-name">{k}</span> ={" "}
          <span className="var-value">
            {typeof v === "number" ? formatNum(v, undefined, { point }) : v}
          </span>
        </span>
      ))}
    </div>
  );
}
