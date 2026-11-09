import { useRef } from "react";
import { useStepMs } from "../core/stepTransition";
import { useRovingFocus } from "../core/useRovingFocus";
import { pickProps } from "./pick";
import {
  BRACKET_H,
  stackBrackets,
  stripNaturalWidth,
  stripLayout,
  STRIP_LABEL_W,
  type StripBracket,
} from "./textStripLayout";
import { useFlip } from "./useFlip";
import { useWidth } from "./useWidth";

export interface StripCell {
  ch: string;
  /** třída buňky (s-active, s-ok, s-bad, s-match, s-dim, s-out, s-in…; u čísel n-eq, n-hit, n-false) */
  cls?: string;
  /** druhý kanál vedle barvy: ✓, ✗, ≈, ? v rohu buňky */
  glyph?: string;
  /** čárkovaný rámeček (zarážka ⊥) */
  dashed?: boolean;
}

export interface StripRow {
  key: string;
  /** popisek vlevo („σ“, „ι“, „h“) */
  label?: string;
  /** "cell" = znaky v rámečcích, "num" = čísla bez rámečku */
  kind?: "cell" | "num";
  /** buňky od pozice `offset`; null = prázdné místo */
  cells: readonly (StripCell | null)[];
  /** posun řádku o tolik slotů doprava (jehla pod senem) – změna se plynule přesune */
  offset?: number;
  /** čísla pozic pod řádkem (index buňky v řádku) */
  indices?: boolean;
  /** klik (Enter) na buňku vybere pozici – stránka vyplní argument akce */
  pickable?: boolean;
}

export interface StripWindow {
  from: number;
  len: number;
  /** řádky (indexy), přes které okénko vede; výchozí všechny */
  rows?: readonly [number, number];
  cls?: string;
}

interface Props {
  /** počet slotů (šířka pásu v buňkách) */
  slots: number;
  rows: readonly StripRow[];
  /** okénko (Rabin–Karp) – při posunu klouže */
  window?: StripWindow | null;
  /** závorky pod pásem (výskyty) */
  brackets?: readonly StripBracket[];
  /** kolik pater závorek držet i bez nich (plátno mezi kroky neposkakuje) */
  reserveBrackets?: number;
  ariaLabel: string;
  /** pevná šířka (náhled) místo změřené */
  width?: number;
  onPick?: (row: string, index: number) => void;
  /**
   * Zvětšení celé kresby (buňky i písmo; na velkém plátně, CanvasFit): pás se rozvrhne do šířky
   * obalu / zoom a SVG se vykreslí zoom× větší. Výchozí 1.
   */
  zoom?: number;
}

const WINDOW_FLIP = 1;
const rowFlip = (i: number) => 10 + i;

/**
 * Pás textu v SVG: řádky znaků (seno, jehla) a čísel (kódy písmen, heše) s indexy, okénko a závorky
 * výskytů. Posun jehly a okénka je plynulý (useFlip, délka z Visualizeru – při skoku nebo „omezit
 * pohyb“ okamžitě). Kreslí 1 px = 1 jednotka; užší obal se posouvá vodorovně. Geometrie
 * v textStripLayout.ts.
 */
export function TextStripView({
  slots,
  rows,
  window: win,
  brackets = [],
  reserveBrackets = 0,
  ariaLabel,
  width,
  onPick,
  zoom = 1,
}: Props) {
  const [ref, measured] = useWidth();
  // zvětšit jen tolik, kolik dovolí šířka: pás s buňkami STRIP_MAX_CELL se musí vejít do obalu
  const avail = width ?? measured;
  const fitZoom =
    Number.isFinite(avail) && avail > 0 ? avail / stripNaturalWidth(slots) : 1;
  const z =
    Number.isFinite(zoom) && zoom > 1
      ? Math.max(1, Math.min(zoom, fitZoom))
      : 1;
  const stacked = stackBrackets(brackets);
  const floors = Math.max(reserveBrackets, ...stacked.map((b) => b.row + 1), 0);
  const L = stripLayout(
    slots,
    avail / z,
    rows.map((r) => ({ kind: r.kind ?? "cell", indices: r.indices })),
    floors,
  );
  const ms = useStepMs(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const base = L.x(0);
  const targets = new Map<number, { x: number; y: number }>();
  rows.forEach((r, i) =>
    targets.set(rowFlip(i), { x: L.x(r.offset ?? 0) - base, y: 0 }),
  );
  if (win) targets.set(WINDOW_FLIP, { x: L.x(win.from) - base, y: 0 });
  useFlip(svgRef, targets, ms, `${L.W}|${L.cell}`);

  // vybírat jde jen s onPick: pak je kresba jedna zastávka Tabu, šipky chodí po buňkách (D3)
  const rove = useRovingFocus(
    onPick
      ? rows.flatMap((r) =>
          r.pickable
            ? r.cells.flatMap((c, t) => (c ? [`${r.key}:${t}`] : []))
            : [],
        )
      : [],
  );

  const winRows = win?.rows ?? [0, rows.length - 1];
  const wTop = L.rows[winRows[0]]?.y ?? 0;
  const wLast = L.rows[winRows[1]];
  const wBottom = wLast ? wLast.y + wLast.h : 0;

  return (
    <div className="strip-view view-wrap" ref={ref}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${L.W} ${L.H}`}
        width={Math.round(L.W * z)}
        height={Math.round(L.H * z)}
        className="strip-svg"
        role={onPick ? "group" : "img"}
        aria-label={ariaLabel}
        {...(onPick ? rove.group : {})}
      >
        {win && win.len > 0 && (
          <rect
            data-flip={WINDOW_FLIP}
            className={"strip-window " + (win.cls ?? "")}
            x={base - 3}
            y={wTop - 4}
            width={win.len * L.cell + 6}
            height={wBottom - wTop + 8}
            rx={5}
            style={{ transform: `translate(${L.x(win.from) - base}px, 0px)` }}
          />
        )}
        {rows.map((r, ri) => {
          const g = L.rows[ri];
          const kind = r.kind ?? "cell";
          return (
            <g key={r.key} className={"strip-row strip-row-" + kind}>
              {r.label && (
                <text
                  x={L.left + STRIP_LABEL_W - 2}
                  y={g.y + g.h / 2 + 4}
                  textAnchor="end"
                  className="strip-label"
                >
                  {r.label}
                </text>
              )}
              <g
                data-flip={rowFlip(ri)}
                style={{
                  transform: `translate(${L.x(r.offset ?? 0) - base}px, 0px)`,
                }}
              >
                {r.cells.map((c, t) => {
                  if (!c) return null;
                  const x = base + t * L.cell;
                  const pick =
                    onPick && r.pickable ? () => onPick(r.key, t) : undefined;
                  return (
                    <g
                      key={t}
                      className={
                        "strip-cell " +
                        (c.cls ?? "") +
                        (c.dashed ? " dashed" : "") +
                        (pick ? " pickable" : "")
                      }
                      {...pickProps(
                        pick,
                        `${r.label ?? r.key}[${t}] = ${c.ch}`,
                      )}
                      {...(pick ? rove.item(`${r.key}:${t}`) : {})}
                    >
                      {kind === "cell" ? (
                        <rect
                          x={x + 1}
                          y={g.y}
                          width={L.cell - 2}
                          height={g.h}
                          rx={3}
                        />
                      ) : (
                        c.cls && (
                          <rect
                            x={x + 1}
                            y={g.y}
                            width={L.cell - 2}
                            height={g.h}
                            rx={3}
                            className="strip-num-bg"
                          />
                        )
                      )}
                      <text
                        x={x + L.cell / 2}
                        y={g.y + g.h / 2 + (kind === "cell" ? 5 : 4)}
                        textAnchor="middle"
                        className={kind === "cell" ? "strip-ch" : "strip-num"}
                        style={
                          kind === "num" && c.ch.length * 6.4 > L.cell - 2
                            ? {
                                fontSize: Math.max(
                                  8,
                                  Math.floor(
                                    ((L.cell - 2) / c.ch.length) * 1.55,
                                  ),
                                ),
                              }
                            : undefined
                        }
                      >
                        {c.ch}
                      </text>
                      {c.glyph && (
                        <text
                          x={x + L.cell - 3}
                          y={g.y + 9}
                          textAnchor="end"
                          className="strip-glyph"
                          aria-hidden="true"
                        >
                          {c.glyph}
                        </text>
                      )}
                    </g>
                  );
                })}
                {g.indexY !== null &&
                  r.cells.map((c, t) =>
                    c ? (
                      <text
                        key={"i" + t}
                        x={base + t * L.cell + L.cell / 2}
                        y={g.indexY!}
                        textAnchor="middle"
                        className="strip-index"
                      >
                        {t}
                      </text>
                    ) : null,
                  )}
              </g>
            </g>
          );
        })}
        {stacked.map((b, k) => {
          const x1 = L.x(b.from) + 3;
          const x2 = L.x(b.to) - 3;
          const y = L.bracketY + b.row * BRACKET_H;
          return (
            <g key={k} className={"strip-bracket " + (b.cls ?? "")}>
              <path d={`M${x1},${y} V${y + 5} H${x2} V${y}`} />
              <text x={(x1 + x2) / 2} y={y + 15} textAnchor="middle">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
