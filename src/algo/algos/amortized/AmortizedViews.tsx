/**
 * Kresby amortizovaných struktur (nafukovací pole, binární počítadlo) a řádek součtů – sdílí je stránka (AmortizedPage.tsx, líně načítaná) a náhledy na úvodní stránce (landing/previews.tsx), které tak nemusí importovat celou stránku.
 */
import { useRef } from "react";
import { useStepMs } from "../../core/stepTransition";
import { VarsView } from "../../views/ArrayView";
import { useFlip } from "../../views/useFlip";
import { useWidth } from "../../views/useWidth";
import {
  arrayLayout,
  CELL_H,
  CELL_W,
  CELLS_PER_ROW,
  cntValue,
  VAR_BOUND,
  VAR_REAL,
  type ArrState,
  type CntState,
} from "./amortized";
import { sumsText } from "./pageModel";
import { fmtMath } from "../../core/format";

/**
 * Proměnné kroku a pod nimi řádek součtů „Σ skutečná = 33 ≤ 45 = Σ amortizovaná + Φ₀ − Φ“
 * (oba součty jsou v řádku, mezi proměnnými se neopakují). Čísla jdou ze stavu, ne z textu proměnných –
 * ten má desetinnou čárku (Φ₀ = 0,5 u pole kapacity 1) a zpět by se nepřečetl.
 */
export function SumsView({
  vars,
  real,
  bound,
}: {
  vars: Record<string, string | number>;
  real: number;
  bound: number;
}) {
  const rest = Object.fromEntries(
    Object.entries(vars).filter(([k]) => k !== VAR_REAL && k !== VAR_BOUND),
  );
  return (
    <>
      <VarsView vars={rest} />
      {Number.isFinite(real) && Number.isFinite(bound) && (
        <p className="hint amort-sums">{fmtMath(sumsText(real, bound))}</p>
      )}
    </>
  );
}

/* ================================================================== nafukovací pole */

export function ArrayCells({
  st,
  fitWidth = false,
}: {
  st: ArrState;
  /** zalomit řádky podle šířky obalu (telefon: 16 buněk ve 2 řádcích), jinak nejvýš 16 v řádku */
  fitWidth?: boolean;
}) {
  const [wrapRef, wrapW] = useWidth();
  // nevejde-li se řádek do šířky, rozdělit buňky rovnoměrně (16 → 2 × 8, ne 14 + 2)
  const room = Math.max(1, Math.floor((wrapW - 10) / CELL_W));
  const want = Math.min(Math.max(1, st.p), CELLS_PER_ROW);
  const lay = arrayLayout(
    st.p,
    fitWidth && room < want
      ? Math.ceil(want / Math.ceil(want / room))
      : undefined,
  );
  const cells = Array.from({ length: lay.cells }, (_, i) => i);
  // buňky se po realokaci přesunou (zalomení do řádků) plynule – délka z Visualizeru
  const ref = useRef<SVGSVGElement>(null);
  useFlip(
    ref,
    new Map(cells.map((i) => [i, { x: lay.x(i), y: lay.y(i) }])),
    useStepMs(0),
  );
  return (
    // stejná šířka pro viewBox i max-width: buňky mají vždy skutečnou velikost, dlouhé pole se zalamuje do řádků
    <div ref={wrapRef} className="amort-array">
      <svg
        ref={ref}
        viewBox={`0 0 ${lay.width} ${lay.height}`}
        className="array-svg"
        style={{ maxWidth: lay.width }}
        role="img"
        aria-label={`Pole kapacity ${st.p}, prvků ${st.items.length}: ${st.items.map((it) => it.v).join(", ") || "prázdné"}`}
      >
        {cells.map((i) => {
          const it = st.items[i];
          const label = it ? String(it.v).replace("-", "−") : "";
          return (
            <g
              key={i}
              data-flip={i}
              className={"box " + (it ? (st.marks[i] ?? "") : "box-free")}
              style={{ transform: `translate(${lay.x(i)}px, ${lay.y(i)}px)` }}
            >
              <rect width={lay.cellW} height={CELL_H} rx={4} />
              {it && (
                <text
                  x={lay.cellW / 2}
                  y={23}
                  textAnchor="middle"
                  style={{ fontSize: label.length > 3 ? 11 : 14 }}
                >
                  {label}
                </text>
              )}
              <text
                x={lay.cellW / 2}
                y={52}
                textAnchor="middle"
                className="bar-index"
              >
                {i}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** výchozí příklad: plné pole – první Insert hned ukáže realokaci */
/* ================================================================== binární počítadlo */

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** horní index v SVG textu: 2³, 2¹¹ */
const sup = (k: number) => String(k).replace(/\d/g, (d) => SUP[Number(d)]);

export function Bits({ st }: { st: CntState }) {
  const n = Math.max(st.bits.length, 6);
  // nový nejvyšší bit odsune ostatní doprava plynule
  const ref = useRef<SVGSVGElement>(null);
  useFlip(
    ref,
    new Map(
      Array.from({ length: n }, (_, k) => [
        n - 1 - k,
        { x: 5 + k * 46, y: 10 },
      ]),
    ),
    useStepMs(0),
  );
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${n * 46 + 10} 70`}
      className="array-svg"
      style={{ maxWidth: n * 46 + 10 }}
      role="img"
      aria-label={`Počítadlo: ${cntValue(st)}, dvojkově ${[...st.bits].reverse().join("")}`}
    >
      {Array.from({ length: n }, (_, k) => {
        const i = n - 1 - k; // nejvyšší bit vlevo
        const b = st.bits[i] ?? 0;
        return (
          <g
            key={i}
            data-flip={i}
            className={"box " + (st.marks[i] ?? (b ? "box-one" : ""))}
            style={{ transform: `translate(${5 + k * 46}px, 10px)` }}
          >
            <rect width={42} height={36} rx={4} />
            <text x={21} y={24} textAnchor="middle">
              {b}
            </text>
            <text x={21} y={52} textAnchor="middle" className="bar-index">
              {"2" + sup(i)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** výchozí příklad 000111: první Increment shodí tři jedničky najednou */
