/**
 * Plátno Rabin–Karp (stránka i náhled): parametry P, N, P^J mod N a j, pás sena s kódy písmen
 * a heši okének, okénko klouže po seně, jehla pod ním; rozepsaný výpočet aktuálního kroku.
 */
import { fmtMath } from "../../core/format";
import { TextStripView } from "../../views/TextStripView";
import type { RkState } from "./rabinKarp";
import { rkAria, rkBrackets, rkRows, rkSlots, rkWindow } from "./rabinKarpView";

export function RkParams({ st }: { st: RkState }) {
  const q = (v: number | null) => (v === null ? "?" : String(v));
  return (
    <p className="rk-params">
      <span>P = {st.P}</span>
      <span>N = {st.N}</span>
      <span>{fmtMath(`P^J mod N = ${q(st.PJ)}`)}</span>
      <span>j = H(ι) = {q(st.j)}</span>
    </p>
  );
}

export function RabinKarpCanvas({
  st,
  reserveBrackets = 0,
  width,
  onPickText,
  details = true,
  collapse = false,
  zoom = 1,
}: {
  st: RkState;
  /** zvětšení pásu na velkém plátně (CanvasFit, stripZoom) */
  zoom?: number;
  /** výskyty jako jedna řada značek místo závorek (rkCollapse) */
  collapse?: boolean;
  reserveBrackets?: number;
  width?: number;
  onPickText?: (index: number) => void;
  /** parametry a rozepsaný výpočet (HTML) – náhled je vynechá */
  details?: boolean;
}) {
  return (
    <>
      {details && <RkParams st={st} />}
      <TextStripView
        slots={rkSlots(st)}
        rows={rkRows(st, !!onPickText)}
        window={rkWindow(st)}
        brackets={rkBrackets(st, collapse)}
        reserveBrackets={reserveBrackets}
        width={width}
        ariaLabel={rkAria(st)}
        zoom={zoom}
        onPick={onPickText && ((_row, i) => onPickText(i))}
      />
      {details && (
        <p className="rk-calc" aria-live="off">
          {st.calc ? fmtMath(st.calc) : " "}
        </p>
      )}
    </>
  );
}
