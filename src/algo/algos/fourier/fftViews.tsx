/**
 * Kresby modulu FFT nad stavem kroku (FftState): strom volání (indexy koeficientů ve vrcholu, sudé / liché
 * po rozdělení barvou a podtržením), jednotková kružnice s ω^k a tabulka koeficienty → hodnoty (u násobení
 * tabulka P, Q, P̂, Q̂, R̂, R po řádcích j). Stránka FftPage.tsx je jen skládá.
 */
import { useEffect, useId, useRef } from "react";
import { fmtMath } from "../../core/format";
import { useRovingFocus } from "../../core/useRovingFocus";
import { UnitCircleView } from "../../views/UnitCircleView";
import { supDigits } from "./complex";
import { pickProps } from "../../views/pick";
import {
  circleMarks,
  integerInput,
  pList,
  type CallNode,
  type FftState,
  type TableModel,
} from "./fft";
import { callTreeLayout } from "./fftTreeLayout";
import { FIELDS } from "./field";

/* ------------------------------------------------------------------ strom volání */

const STATUS_CLS = {
  pending: "fft-pending",
  active: "n-active",
  waiting: "fft-waiting",
  done: "n-found",
} as const;

/**
 * Strom rekurzivních volání (styly vrcholů jako (a,b)-strom: .mtree-node). Vrcholy se nehýbou – mění se jen
 * stav (barva přechází podle rychlosti přehrávače).
 */
export function CallTree({
  st,
  levelHeight,
  zoom = 1,
  onPick,
}: {
  st: FftState;
  levelHeight: number;
  /** přiblížení celé kresby (velký monitor) */
  zoom?: number;
  /** klik / Enter na volání (jen s celočíselným vstupem) – stránka vyplní FFT(p) jeho koeficienty */
  onPick?: (v: CallNode) => void;
}) {
  const L = callTreeLayout(st.calls, levelHeight);
  const f = FIELDS[st.field];
  // vybrat jde jen volání s celočíselným vstupem: pak je strom jedna zastávka Tabu (D3), zastávkou je
  // nejdřív kořen (klíče v pořadí čtení – po hladinách zleva)
  const pickable = (v: CallNode) => !!onPick && integerInput(v);
  const rove = useRovingFocus(
    st.calls
      .filter(pickable)
      .sort((a, b) => {
        const p = L.boxes[a.id];
        const q = L.boxes[b.id];
        return p.y - q.y || p.x - q.x;
      })
      .map((v) => v.id),
  );
  return (
    <div className="view-wrap fft-calltree">
      <svg
        viewBox={`0 0 ${L.W} ${L.H}`}
        width={Math.round(L.W * zoom)}
        height={Math.round(L.H * zoom)}
        className="tree-svg"
        role={onPick ? "group" : "img"}
        aria-label={`Strom volání FFT pro n = ${st.N} (${st.calls.length} volání; ve vrcholu indexy koeficientů)${st.inverse ? `, s ${f.sym(true)}` : ""}`}
        {...(onPick ? rove.group : {})}
      >
        {L.edges.map((e) => (
          <line
            key={e.from + "-" + e.to}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            className={
              "mtree-edge" +
              (st.calls[e.to].status === "pending" ? " fft-edge-pending" : "")
            }
          />
        ))}
        {st.calls.map((v) => {
          const b = L.boxes[v.id];
          return (
            <g
              key={v.id}
              className={
                "mtree-node " +
                STATUS_CLS[v.status] +
                (onPick && integerInput(v) ? " pickable" : "")
              }
              transform={`translate(${b.x - b.w / 2} ${b.y})`}
              {...pickProps(
                onPick && integerInput(v) ? () => onPick(v) : undefined,
                `Volání FFT${pList(v.idx, st.inverse ? "y" : "p")}`,
              )}
              {...(pickable(v) ? rove.item(v.id) : {})}
            >
              <rect width={b.w} height={L.nodeH} rx={5} />
              {v.idx.map((k, i) => (
                <g
                  key={i}
                  className={
                    v.split ? (i % 2 === 0 ? "key-even" : "key-odd") : undefined
                  }
                >
                  {i > 0 && (
                    <line
                      x1={i * L.cell}
                      y1={4}
                      x2={i * L.cell}
                      y2={L.nodeH - 4}
                      className="mtree-sep"
                    />
                  )}
                  <text
                    x={i * L.cell + L.cell / 2}
                    y={L.nodeH / 2 + 4}
                    textAnchor="middle"
                  >
                    {k}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ kružnice */

export function FftCircle({ st, size = 190 }: { st: FftState; size?: number }) {
  const m = circleMarks(st);
  const f = FIELDS[st.field];
  const sym = f.sym(m.inverse);
  const label =
    st.field === "Z17"
      ? (k: number) => f.fmt(f.omega(m.n, k, m.inverse))
      : (k: number) =>
          // ω̄ jako ω s pruhem: kombinující znak + mocnina
          sym + supDigits(k);
  return (
    <UnitCircleView
      n={m.n}
      inverse={m.inverse}
      active={m.active}
      pair={m.pair}
      hot={m.hot}
      label={label}
      axes={st.field === "C"}
      // u 16 bodů by se popisek úhlu srazil s ω⁸ – zůstane jen šipka
      angleText={st.field === "C" ? (m.n > 8 ? "" : `2π/${m.n}`) : null}
      size={size}
      ariaLabel={
        st.field === "C"
          ? `Jednotková kružnice s ${m.n} mocninami ${sym}; aktivní volání vyhodnocuje v ${m.active.length} z nich`
          : `Mocniny ω = ${f.fmt(f.omega(m.n, 1, m.inverse))} v ℤ₁₇ rozmístěné po kružnici`
      }
    />
  );
}

/* ------------------------------------------------------------------ tabulka */

/** Posune `box` (jen jeho scrollLeft/Top, okno ne), aby byla `cell` celá vidět; okraj 8 px. */
function scrollIntoBox(box: HTMLElement, cell: HTMLElement) {
  const b = box.getBoundingClientRect();
  const c = cell.getBoundingClientRect();
  const pad = 8;
  if (c.left < b.left) box.scrollLeft -= b.left - c.left + pad;
  else if (c.right > b.right) box.scrollLeft += c.right - b.right + pad;
  if (c.top < b.top) box.scrollTop -= b.top - c.top + pad;
  else if (c.bottom > b.bottom) box.scrollTop += c.bottom - b.bottom + pad;
}

export function FftTable({
  model,
  mul = false,
  vertical = false,
  caption,
}: {
  model: TableModel;
  mul?: boolean;
  /** řádky = j, sloupce = řádky modelu (násobení: P, Q, P̂, Q̂, R̂, R vedle sebe) */
  vertical?: boolean;
  caption: string;
}) {
  const cls = "fft-table" + (mul ? " mul" : "") + (vertical ? " vertical" : "");
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  // po změně kroku posunout jen kontejner (ne okno) k počítané buňce – široká tabulka n = 16
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const cell =
      el.querySelector<HTMLElement>("td.cell-hot") ??
      el.querySelector<HTMLElement>("td.cell-active");
    if (cell) scrollIntoBox(el, cell);
  }, [model]);
  return (
    <div className="gtable fft-table-wrap">
      {/* nadpis mimo <caption>: dlouhý titulek by jinak rozšířil úzkou tabulku */}
      <p className="gtable-title fft-table-title" id={titleId}>
        {caption}
      </p>
      <div
        className="table-scroll"
        ref={box}
        tabIndex={0}
        aria-label="Tabulka hodnot FFT"
      >
        {vertical ? (
          <table className={cls} aria-labelledby={titleId}>
            <thead>
              <tr>
                <th scope="col">j</th>
                {model.rows.map((r) => (
                  <th key={r.key} scope="col">
                    {fmtMath(r.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.heads.map((h, i) => (
                <tr key={h} data-j={h}>
                  <th scope="row" className="num">
                    {h}
                  </th>
                  {model.rows.map((r) => {
                    const c = r.cells[i];
                    return (
                      <td
                        key={r.key}
                        data-col={r.key}
                        className={c?.cls}
                        title={c?.title}
                      >
                        {c?.text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className={cls} aria-labelledby={titleId}>
            <thead>
              <tr>
                <th scope="col">j</th>
                {model.heads.map((h) => (
                  <th key={h} scope="col" className="num">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((r) => (
                <tr key={r.key} data-row={r.key}>
                  <th scope="row">{fmtMath(r.label)}</th>
                  {r.cells.map((c, i) => (
                    <td key={i} className={c.cls} title={c.title}>
                      {c.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
