/**
 * Plátno NRP (stránka i náhled): graf posloupnosti jako obr. 12.4 nad tabulkou jako obr. 12.3 – vrchol i
 * leží přesně nad sloupcem i. Tabulka je jedna zastávka Tabu (roving tabindex), šipky chodí po sloupcích,
 * klik / Enter vybere podproblém „NRP začínající xᵢ“. Bez `onPick` (náhled) nic interaktivního.
 */
import { formatMinus } from "../../core/format";
import { useRovingFocus } from "../../core/useRovingFocus";
import { pickProps } from "../../views/pick";
import type { LisState } from "./lis";
import type { LisSelection } from "./lisPageModel";
import { lisCellMarks, lisChart, lisColumnLabel } from "./lisView";

export function LisChart({
  st,
  sel,
  head,
  col,
  height,
}: {
  st: LisState;
  sel: LisSelection | null;
  head: number;
  col: number;
  height: number;
}) {
  const n = st.x.length - 1;
  const w = head + (n + 1) * col;
  const g = lisChart(st, w, height, sel, {
    l: head + col / 2,
    r: col / 2,
  });
  const r = Math.min(11, Math.max(8, col / 4));
  const done = new Set(st.done ? [0, ...st.chain] : st.chain);
  return (
    <svg
      className="dp-chart"
      width={w}
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      role="img"
      aria-label={`Graf posloupnosti (obr. 12.4): vrchol i je výš podle hodnoty xᵢ, hrany vedou doprava nahoru; ${g.edges.filter((e) => e.cls.includes("dp-e-p")).length} odkazů P`}
    >
      {g.levels.map((l, k) => (
        <g key={k} className="dp-level">
          <line x1={head - 4} x2={w} y1={l.y} y2={l.y} />
          <text
            x={head - 8}
            y={l.y}
            dominantBaseline="central"
            textAnchor="end"
          >
            {l.label}
          </text>
        </g>
      ))}
      {g.edges.map((e, k) => {
        const a = g.points[e.from];
        const b = g.points[e.to];
        return (
          <line
            key={k}
            className={"dp-edge " + e.cls}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
          />
        );
      })}
      {g.points.map((p) => (
        <g
          key={p.i}
          className={
            "dp-pt" +
            (p.i === st.i || p.i === st.k ? " dp-cur" : "") +
            (p.i === st.j ? " dp-read" : "") +
            (done.has(p.i) ? " dp-path" : "") +
            (sel?.cols.includes(p.i) ? " dp-sel" : "")
          }
        >
          <circle cx={p.x} cy={p.y} r={r} />
          <text x={p.x} y={p.y} dominantBaseline="central" textAnchor="middle">
            {p.i}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function LisTable({
  st,
  sel,
  head,
  col,
  onPick,
}: {
  st: LisState;
  sel: LisSelection | null;
  head: number;
  col: number;
  onPick?: (i: number) => void;
}) {
  const n = st.x.length - 1;
  const cols = Array.from({ length: n + 1 }, (_, i) => i);
  const rove = useRovingFocus(onPick ? cols : []);
  const m = lisCellMarks(st, sel);
  const v = (a: number | null) => (a === null ? "" : String(a));
  return (
    // obal: jedna zastávka Tabu (roving tabindex); vodorovný posun dělá stránka společně s grafem
    <div
      className="dp-rove"
      {...(onPick
        ? {
            role: "group",
            "aria-label":
              "Tabulka T a P (obr. 12.3) – šipkami po sloupcích, Enter vybere NRP začínající xᵢ",
            ...rove.group,
          }
        : {})}
    >
      <table
        className="dp-table dp-lis-table"
        style={{ width: head + (n + 1) * col }}
      >
        <colgroup>
          <col style={{ width: head }} />
          {cols.map((i) => (
            <col key={i} style={{ width: col }} />
          ))}
        </colgroup>
        <tbody>
          <tr className="dp-idx">
            <th scope="row">i</th>
            {cols.map((i) => (
              <td key={i} className={m.x[i].includes("dp-cur") ? "dp-cur" : ""}>
                {i}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">xᵢ</th>
            {cols.map((i) => (
              <td
                key={i}
                className={"dp-x " + m.x[i]}
                {...(onPick
                  ? {
                      ...pickProps(
                        () => onPick(i),
                        `sloupec ${i}: ${lisColumnLabel(st, i)}`,
                      ),
                      ...rove.item(i),
                    }
                  : {})}
              >
                {formatMinus(st.x[i])}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">T[i]</th>
            {cols.map((i) => (
              <td key={i} className={m.T[i]}>
                {v(st.T[i])}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">P[i]</th>
            {cols.map((i) => (
              <td key={i} className={m.P[i]}>
                {v(st.P[i])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
