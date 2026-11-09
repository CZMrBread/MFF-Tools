/**
 * Plátno KMP (stránka KmpPage i náhled na úvodní stránce): automat podle obr. 13.1, pás textu
 * s jehlou pod čteným znakem a tabulka zpětných hran Z. Co se kreslí, počítá kmpView.ts.
 */
import { AutomatonView } from "../../views/AutomatonView";
import { TextStripView } from "../../views/TextStripView";
import { ENDMARK, type KmpState } from "./kmp";
import { kmpAria, kmpBrackets, kmpLayout, kmpMarks, kmpRows } from "./kmpView";

/** Tabulka s / ι[s] / Z[s] (reprezentace automatu, str. 321–322). */
export function KmpTable({
  st,
  zoom = 1,
}: {
  st: KmpState;
  /** zvětšení písma (CanvasFit na velkém plátně) */
  zoom?: number;
}) {
  const p = [...st.needle];
  const J = p.length;
  const cols = Array.from({ length: J + 1 }, (_, s) => s);
  const cls = (s: number) =>
    [
      s === st.s ? "col-cur" : "",
      s === st.zCol ? "col-new" : "",
      st.phase === "build" && s > st.known ? "col-pending" : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="table-scroll">
      <table
        className="kmp-table"
        style={zoom !== 1 ? { fontSize: `${zoom}em` } : undefined}
      >
        <tbody>
          <tr>
            <th scope="row">s</th>
            {cols.map((s) => (
              <td key={s} className={cls(s)}>
                {s}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">ι[s]</th>
            {cols.map((s) => (
              <td key={s} className={cls(s)}>
                {s < J ? p[s] : ENDMARK}
              </td>
            ))}
          </tr>
          <tr className="kmp-z">
            <th scope="row">Z[s]</th>
            {cols.map((s) => (
              <td key={s} className={cls(s)}>
                {s === 0
                  ? "–"
                  : st.Z[s] === null || st.Z[s] === undefined
                    ? "?"
                    : st.Z[s]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function KmpCanvas({
  st,
  slots,
  reserveBrackets = 0,
  width,
  onPickText,
  table = true,
  zoom = 1,
}: {
  st: KmpState;
  /** zvětšení pásu a tabulky na velkém plátně (CanvasFit, stripZoom) */
  zoom?: number;
  slots: number;
  reserveBrackets?: number;
  /** pevná šířka (náhled) */
  width?: number;
  /** klik na znak sena */
  onPickText?: (index: number) => void;
  table?: boolean;
}) {
  const marks = kmpMarks(st);
  return (
    <>
      <AutomatonView
        layout={kmpLayout(st)}
        nodeCls={marks.nodeCls}
        edgeCls={marks.edgeCls}
        width={width}
        ariaLabel={`Vyhledávací automat pro ${st.needle}: ${[...st.needle].length + 1} stavů, aktuální stav ${st.s}`}
      />
      <TextStripView
        slots={slots}
        rows={kmpRows(st, !!onPickText)}
        brackets={kmpBrackets(st)}
        reserveBrackets={reserveBrackets}
        width={width}
        ariaLabel={kmpAria(st)}
        onPick={onPickText && ((_row, i) => onPickText(i))}
        zoom={zoom}
      />
      {table && <KmpTable st={st} zoom={zoom} />}
    </>
  );
}
