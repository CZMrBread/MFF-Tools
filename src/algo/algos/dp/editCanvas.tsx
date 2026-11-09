/**
 * Plátno editační vzdálenosti (stránka i náhled): tabulka T jako obr. 12.5 (řádky x, sloupce y, poslední
 * řádek a sloupec okraje) se šipkami tahů a pod ní zarovnání slov podle úprav. Tabulka je jedna zastávka
 * Tabu (roving tabindex), šipky chodí po buňkách, klik / Enter vybere podproblém T[i, j]. Bez `onPick`
 * (náhled) nic interaktivního.
 */
import type { CSSProperties } from "react";
import { useRovingFocus } from "../../core/useRovingFocus";
import { pickProps } from "../../views/pick";
import type { EditState } from "./editDistance";
import type { EditSelection } from "./editPageModel";
import {
  editAlignment,
  editCellLabel,
  editCellMarks,
  editHeadMarks,
  KIND_GLYPH,
} from "./editView";

const KIND_LABEL = {
  keep: "ponecháme",
  change: "změna",
  delete: "smazání",
  insert: "vložení",
} as const;

export function EditTable({
  st,
  sel,
  cell = 30,
  onPick,
}: {
  st: EditState;
  sel: EditSelection | null;
  /** strana buňky v px (CanvasFit ji přizpůsobí výšce plátna) */
  cell?: number;
  onPick?: (r: number, c: number) => void;
}) {
  const n = st.x.length;
  const m = st.y.length;
  const keys: string[] = [];
  if (onPick)
    for (let r = 0; r <= n; r++)
      for (let c = 0; c <= m; c++) keys.push(`${r}-${c}`);
  const rove = useRovingFocus(keys);
  const marks = editCellMarks(st, sel);
  const head = editHeadMarks(st);
  const style = { "--algo-dp-cell": `${cell}px` } as CSSProperties;
  return (
    <div
      className="table-scroll dp-scroll"
      {...(onPick
        ? {
            role: "group",
            "aria-label":
              "Tabulka T (obr. 12.5) – šipkami po buňkách, Enter vybere podproblém T[i, j]",
            ...rove.group,
          }
        : {})}
    >
      <table className="dp-table dp-edit-table" style={style}>
        <thead>
          <tr>
            <th className="dp-corner" />
            {st.y.map((ch, c) => (
              <th key={c} scope="col" className={head.y[c]}>
                {ch}
              </th>
            ))}
            <th className="dp-border-head" aria-label="konec y" />
          </tr>
        </thead>
        <tbody>
          {st.T.map((row, r) => (
            <tr key={r}>
              <th
                scope="row"
                className={r < n ? head.x[r] : "dp-border-head"}
                aria-label={r < n ? undefined : "konec x"}
              >
                {r < n ? st.x[r] : ""}
              </th>
              {row.map((v, c) => {
                const mk = marks[r][c];
                return (
                  <td
                    key={c}
                    className={
                      mk.cls + (r === n || c === m ? " dp-border" : "")
                    }
                    {...(onPick
                      ? {
                          ...pickProps(
                            () => onPick(r, c),
                            editCellLabel(st, r, c),
                          ),
                          ...rove.item(`${r}-${c}`),
                        }
                      : {})}
                  >
                    <span className="dp-v">{v === null ? "" : v}</span>
                    {mk.glyph && (
                      <span className="dp-dir" aria-hidden="true">
                        {mk.glyph}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Zarovnání slov podle rekonstruovaných úprav (x nahoře, y dole, značka úpravy pod nimi). */
export function EditAlign({ st }: { st: EditState }) {
  const cols = editAlignment(st.path);
  if (!cols.length)
    return (
      <p className="dp-align dp-align-empty">
        Úpravy se ukážou po vyplnění tabulky (zpětný průchod z T[1, 1]).
      </p>
    );
  return (
    <div
      className="dp-align"
      role="group"
      aria-label="Zarovnání slov podle úprav"
    >
      <span className="dp-align-row">
        <b>x</b>
        {cols.map((k, i) => (
          <span key={i} className={"dp-al dp-al-" + k.kind}>
            {k.top}
          </span>
        ))}
      </span>
      <span className="dp-align-row">
        <b>y</b>
        {cols.map((k, i) => (
          <span key={i} className={"dp-al dp-al-" + k.kind}>
            {k.bottom}
          </span>
        ))}
      </span>
      <span className="dp-align-row dp-align-ops">
        <b />
        {cols.map((k, i) => (
          <span
            key={i}
            className={"dp-al dp-al-" + k.kind}
            title={KIND_LABEL[k.kind]}
          >
            {KIND_GLYPH[k.kind]}
          </span>
        ))}
      </span>
    </div>
  );
}
