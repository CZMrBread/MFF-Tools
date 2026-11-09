/**
 * Tabulka sufixového pole s LCP – sdílí ji stránka (SuffixPage.tsx, líně načítaná) a náhled na úvodní stránce (landing/previews.tsx).
 */
import { useContext, useLayoutEffect, useRef } from "react";
import { CanvasFitContext } from "../../core/canvasFit";
import { type SAState } from "./suffix";
import { saKeepRowsVisible, saWidthCap } from "./suffixView";

/** Výška obsahu plátna minus jeho vnitřní výška (> 0 = obsah přetéká) – stejně jako měří CanvasFit. */
function canvasOverflow(canvas: HTMLElement): number | null {
  const cs = getComputedStyle(canvas);
  const inner =
    canvas.clientHeight -
    (parseFloat(cs.paddingTop) || 0) -
    (parseFloat(cs.paddingBottom) || 0);
  let top = Infinity;
  let bottom = -Infinity;
  for (const k of canvas.children) {
    const r = k.getBoundingClientRect();
    if (r.height === 0 && r.width === 0) continue;
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  return inner > 0 && Number.isFinite(top) ? bottom - top - inner : null;
}

/** zvýrazněné řádky kroku (Kasai: i a následník, hledání: mid / nalezené), jinak úsek kandidátů */
const HOT_ROWS = "tr.row-active, tr.row-compare, tr.row-found";

export function SATable({
  st,
  zoom = 1,
  onFit,
  maxHeight = null,
  onMeasure,
}: {
  st: SAState;
  /** zvětšení písma na velkém plátně (CanvasFit); tabulka se pak vystředí */
  zoom?: number;
  /**
   * po vykreslení: šířka obalu, nejvyšší zvětšení, při kterém se tabulka vejde do šířky (saWidthCap),
   * a výška tabulky při 1 : 1 (převod delty CanvasFit na zvětšení, saZoom)
   */
  onFit?: (avail: number, cap: number, baseH: number) => void;
  /** omezená výška (px): tabulka se posouvá uvnitř, zvýrazněné řádky drží v záběru (saClamp) */
  maxHeight?: number | null;
  /**
   * režim jedné obrazovky: výška tabulky bez omezení a výška, při které se obsah plátna právě vejde
   * (podklad pro saClamp)
   */
  onMeasure?: (natural: number, avail: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const canvas = useContext(CanvasFitContext);
  // záměrně bez závislostí: šířka tabulky se mění s krokem (nové sloupce Rₖ, dvojice, L)
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const table = tableRef.current;
    if (!onFit || !wrap || !table) return;
    onFit(
      wrap.clientWidth,
      saWidthCap(wrap.clientWidth, table.offsetWidth, zoom),
      table.offsetHeight / zoom,
    );
    if (!onMeasure || !canvas) return;
    const over = canvasOverflow(canvas);
    if (over === null) return;
    // výška vodorovného posuvníku obalu patří k tabulce
    const bar = wrap.offsetHeight - wrap.clientHeight;
    onMeasure(table.offsetHeight + bar, wrap.offsetHeight - over);
  });
  // omezená tabulka: po každém kroku posunout zvýrazněné řádky do záběru (ruční posun mezi kroky zůstane)
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const table = tableRef.current;
    if (maxHeight === null || !wrap || !table) return;
    let rows = [...table.querySelectorAll(HOT_ROWS)];
    if (!rows.length) rows = [...table.querySelectorAll("tr.row-range")];
    const box = wrap.getBoundingClientRect();
    wrap.scrollTop = saKeepRowsVisible(
      {
        top: box.top + wrap.clientTop,
        bottom: box.top + wrap.clientTop + wrap.clientHeight,
      },
      rows.map((r) => r.getBoundingClientRect()),
      wrap.scrollTop,
      table.tHead?.offsetHeight ?? 0,
    );
  }, [st, maxHeight]);
  const n = st.s.length;
  const order =
    st.sortedView && st.X ? st.X : Array.from({ length: n }, (_, i) => i);
  const Rinv = st.X ? Object.fromEntries(st.X.map((i, j) => [i, j])) : null;
  const pairs = st.pairs;
  const betaLen = st.vars["β"] ? String(st.vars["β"]).length : 0;
  return (
    // delší řetězec (hlavně po Kasai) se na úzkém plátně posouvá, místo aby se ořízl
    // (omezená výška: lepící záhlaví a posouvání uvnitř – plátno samo nepřeteče)
    <div
      className={"table-scroll" + (maxHeight !== null ? " sa-clamped" : "")}
      ref={wrapRef}
      style={maxHeight !== null ? { maxHeight, overflowY: "auto" } : undefined}
    >
      <table
        ref={tableRef}
        className="sa-table"
        style={
          zoom !== 1
            ? { fontSize: `${zoom}em`, marginInline: "auto" }
            : undefined
        }
      >
        <thead>
          <tr>
            {st.sortedView && <th scope="col">j</th>}
            <th scope="col">i</th>
            <th scope="col">sufix α[i:]</th>
            {st.rounds.map((r) => (
              <th
                key={r.k}
                scope="col"
                className={st.colMark === r.k ? "col-hot" : ""}
              >
                R<sub>{r.k}</sub>
              </th>
            ))}
            {pairs && (
              <th scope="col">
                (R<sub>{pairs.k}</sub>[i], R<sub>{pairs.k}</sub>[i+{pairs.k}])
              </th>
            )}
            {st.L && <th scope="col">L[j]</th>}
          </tr>
        </thead>
        <tbody>
          {order.map((i) => {
            const j = Rinv ? Rinv[i] : null;
            const suf = st.s.slice(i);
            // zvýrazněný začátek sufixu: společný prefix (Kasai) nebo porovnávaných |β| znaků (hledání), nikdy koncový $
            const want =
              st.cmp && (st.cmp.i === i || (st.X && st.X[st.cmp.j + 1] === i))
                ? st.cmp.len
                : st.rowMarks[i] === "row-found" ||
                    st.rowMarks[i] === "row-active"
                  ? betaLen
                  : 0;
            const hl = Math.min(want, suf.length - 1);
            return (
              <tr key={i} className={st.rowMarks[i] ?? ""}>
                {st.sortedView && <td className="num">{j}</td>}
                <td className="num">{i}</td>
                <td className="mono">
                  {hl > 0 ? (
                    <>
                      <mark>{suf.slice(0, hl)}</mark>
                      {suf.slice(hl)}
                    </>
                  ) : (
                    suf || "ε"
                  )}
                </td>
                {st.rounds.map((r) => (
                  <td
                    key={r.k}
                    className={"num" + (st.colMark === r.k ? " col-hot" : "")}
                  >
                    {r.R[i]}
                  </td>
                ))}
                {pairs && (
                  <td className="num">
                    ({pairs.list[i][0]},{" "}
                    {pairs.list[i][1] < 0 ? "–" : pairs.list[i][1]})
                  </td>
                )}
                {st.L && (
                  <td className="num">
                    {j !== null && j < n - 1 && st.L[j] >= 0 ? st.L[j] : ""}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
