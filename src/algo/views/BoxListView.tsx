/**
 * Řada krabiček (zásobník, fronta, spojový seznam, pole).
 * Krabičky jsou klíčované id, takže posuny se animují (useFlip – Web Animations, délka z Visualizeru);
 * nové krabičky se objeví (CSS animace), odebrané ještě chvíli doznívají (`useLeaving`, třída `leaving`).
 * Kreslí se v přirozené velikosti (px); delší řada se v obalu posouvá vodorovně.
 */
import {
  ARROW_GAP,
  BOX_H,
  boxGrid,
  boxWidth,
  lineMetrics,
  pointerRanks,
  PTR_ROW,
  type Box,
  type Pointer,
} from "./boxLayout";

import { useContext, useLayoutEffect, useRef, useState } from "react";
import { CanvasFitContext } from "../core/canvasFit";
import { useRovingFocus } from "../core/useRovingFocus";
import { useLeaving, useStepMs } from "../core/stepTransition";
import { pickProps } from "./pick";
import { useFlip } from "./useFlip";
import { useWidth } from "./useWidth";

export type { Box, Pointer } from "./boxLayout";

interface Props {
  boxes: Box[];
  pointers?: Pointer[];
  /** kreslit šipky mezi krabičkami (spojový seznam) */
  arrows?: boolean;
  /** na konec přidat „∅“ (spojový seznam) */
  nullEnd?: boolean;
  /** vodorovně (default) nebo svisle (zásobník) */
  vertical?: boolean;
  emptyLabel?: string;
  /**
   * kolik řádků popisků ukazatelů rezervovat (vodorovný režim; 2. řádek je pod krabičkami); výchozí 2, když stránka
   * předá ukazatele – dva ukazatele na téže krabičce (hlava + p, začátek + konec) se tak vejdou a plátno neposkakuje
   */
  pointerRows?: number;
  /** přístupný název SVG; výchozí vyjmenuje krabičky */
  ariaLabel?: string;
  /** klik (Enter) na krabičku: její index a krabička – stránka vyplní argument akce */
  onPick?: (index: number, box: Box) => void;
  /**
   * přizpůsobit kresbu volnému místu: měřítko podle šířky obalu a (na desktopu na jednu obrazovku)
   * volné výšky plátna, nejvýš 1,6×; dlouhou řadu zalomit do řádků (zásobník do sloupců), aby písmo
   * nekleslo. Bez něj přirozená velikost v jedné řadě (náhledy na úvodní stránce).
   */
  fit?: boolean;
}

const GAP = ARROW_GAP;

export function BoxListView({
  boxes,
  pointers = [],
  arrows = false,
  nullEnd = false,
  vertical = false,
  emptyLabel = "prázdné",
  pointerRows,
  ariaLabel,
  onPick,
  fit = false,
}: Props) {
  const BOX = boxWidth(boxes);
  const n = boxes.length + (nullEnd ? 1 : 0);
  const stride = (vertical ? BOX_H : BOX) + (arrows ? GAP : 8);
  const ranks = pointerRanks(pointers, boxes.length);
  // volné místo: šířka obalu, výška plátna bez ostatního obsahu (jen na desktopu na jednu obrazovku)
  const canvas = useContext(CanvasFitContext);
  const [wrapRef, wrapW] = useWidth();
  const [availH, setAvailH] = useState(Infinity);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!fit || !canvas || !wrap) {
      setAvailH(Infinity);
      return;
    }
    const measure = () => {
      const cs = getComputedStyle(canvas);
      const inner =
        canvas.clientHeight -
        (parseFloat(cs.paddingTop) || 0) -
        (parseFloat(cs.paddingBottom) || 0);
      let top = Infinity;
      let bottom = -Infinity;
      for (const k of canvas.children) {
        const r = k.getBoundingClientRect();
        if (!r.height && !r.width) continue;
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }
      const own = wrap.getBoundingClientRect().height;
      const others = Number.isFinite(top) ? bottom - top - own : 0;
      const next = Math.max(80, Math.floor(inner - others - 2));
      setAvailH((old) => (Math.abs(old - next) < 2 ? old : next));
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    // plátno (okno, dok s akcemi) i ostatní obsah plátna (proměnné, hlášky) mění volnou výšku
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    for (const k of canvas.children) if (!k.contains(wrap)) ro.observe(k);
    return () => ro.disconnect();
  }, [fit, canvas, wrapRef]);
  const maxRank = ranks.reduce((m, r) => Math.max(m, r.row + 1), 0);
  // svisle (zásobník): více ukazatelů na téže krabičce pod sebou
  const vRank = ranks.map(
    (r, k) => ranks.slice(0, k).filter((q) => q.slot === r.slot).length,
  );
  const rows = vertical
    ? 1
    : Math.max(pointerRows ?? (pointers.length ? 2 : 1), maxRank, 1);
  // řádek 1 je pod krabičkami, ostatní nad nimi – čárky ukazatelů tak nekříží cizí popisky
  const { top, lineH } = lineMetrics(rows);
  const maxPtrLen = pointers.reduce((m, p) => Math.max(m, p.label.length), 0);
  const ptrRoom = maxPtrLen * 8 * Math.max(1, maxRank);
  const grid = fit
    ? boxGrid({
        count: boxes.length,
        boxW: BOX,
        vertical,
        arrows,
        nullEnd,
        ptrRoom,
        rows,
        availW: wrapW,
        availH,
        // bez měřené výšky (telefon, běžný tok stránky) se nezvětšuje
        maxScale: canvas ? 1.6 : 1,
      })
    : null;
  const per = grid?.perLine ?? Math.max(1, n);
  const lines = grid?.lines ?? 1;
  const scale = grid?.scale ?? 1;
  const colStride = BOX + 24 + ptrRoom + 16;
  const W = vertical
    ? Math.max(220, 80 + (lines - 1) * colStride + BOX + 24 + ptrRoom)
    : Math.max(300, per * stride + 40);
  const H = vertical ? Math.max(120, per * stride + 40) : lines * lineH;

  // řádky (u zásobníku sloupce zleva, každý odspodu) po `per` krabičkách
  const pos = (i: number) => {
    const line = Math.floor(i / per);
    const k = i % per;
    return vertical
      ? { x: 80 + line * colStride, y: 20 + (per - 1 - k) * stride }
      : { x: 20 + k * stride, y: line * lineH + top };
  };
  /** konec řádku seznamu: šipka k další krabičce vede dolů a zpět na začátek dalšího řádku */
  const wrapsAfter = (i: number) =>
    !vertical && lines > 1 && i % per === per - 1 && i < n - 1;
  // odebrané krabičky doznívají na své poslední poloze (mimo Visualizer ms = 0 → hned zmizí)
  const stepMs = useStepMs(0);
  const drawn = new Map(
    boxes.map((b, i) => [b.id, { ...pos(i), label: b.label, cls: b.cls }]),
  );
  let sig = `${BOX}`;
  for (const [id, d] of drawn) sig += `;${id}:${d.x},${d.y},${d.label}`;
  const leaving = useLeaving(drawn, stepMs, sig);
  const svgRef = useRef<SVGSVGElement>(null);
  useFlip(svgRef, drawn, stepMs, vertical ? "v" : "h");
  // vybírat jde jen s onPick: pak je kresba jedna zastávka Tabu, šipky chodí po krabičkách (D3)
  const rove = useRovingFocus(onPick ? boxes.map((b) => b.id) : []);
  const describe =
    ariaLabel ??
    (boxes.length
      ? `Prvky: ${boxes.map((b) => b.label).join(", ")}`
      : emptyLabel);

  return (
    <div className="boxlist-wrap view-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={Math.round(W * scale)}
        height={Math.round(H * scale)}
        className={"boxlist-svg" + (onPick ? " pickable" : "")}
        role={onPick ? "group" : "img"}
        aria-label={describe}
        {...(onPick ? rove.group : {})}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="arrow-head" />
          </marker>
        </defs>
        {boxes.length === 0 && (
          // u seznamu stojí na místě první krabičky „∅“ → popisek až za ním, jinak by se překrývaly
          <text
            x={vertical ? 108 : nullEnd ? pos(0).x + BOX + 8 : 40}
            y={vertical ? 60 : top + BOX_H / 2 + 5}
            className="box-empty-text"
          >
            {emptyLabel}
          </text>
        )}
        {boxes.map((b, i) => {
          const p = pos(i);
          return (
            <g
              key={b.id}
              data-flip={b.id}
              className={"box " + (b.cls ?? "") + (onPick ? " pickable" : "")}
              style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
              {...pickProps(
                onPick && (() => onPick(i, b)),
                `Prvek ${i + 1}: ${b.label}`,
              )}
              {...(onPick ? rove.item(b.id) : {})}
            >
              <rect width={BOX} height={BOX_H} rx={6} />
              <text x={BOX / 2} y={BOX_H / 2 + 6} textAnchor="middle">
                {b.label}
              </text>
              {arrows &&
                !vertical &&
                !wrapsAfter(i) &&
                (i < boxes.length - 1 || nullEnd) && (
                  <line
                    x1={BOX}
                    y1={BOX_H / 2}
                    x2={BOX + GAP - 2}
                    y2={BOX_H / 2}
                    className="box-arrow"
                    markerEnd="url(#arrow)"
                  />
                )}
            </g>
          );
        })}
        {arrows &&
          boxes.map((b, i) => {
            if (!wrapsAfter(i)) return null;
            const a = pos(i);
            const z = pos(i + 1);
            const route = a.y - top + lineH + 6;
            return (
              <path
                key={"wrap-" + b.id}
                d={`M${a.x + BOX},${a.y + BOX_H / 2} h10 V${route} H8 V${z.y + BOX_H / 2} H${z.x - 2}`}
                className="box-arrow"
                fill="none"
                markerEnd="url(#arrow)"
              />
            );
          })}
        {leaving.map(([id, d]) => (
          <g
            key={"leaving-" + id}
            className={"box leaving " + (d.cls ?? "")}
            style={{ transform: `translate(${d.x}px, ${d.y}px)` }}
            aria-hidden="true"
          >
            <rect width={BOX} height={BOX_H} rx={6} />
            <text x={BOX / 2} y={BOX_H / 2 + 6} textAnchor="middle">
              {d.label}
            </text>
          </g>
        ))}
        {nullEnd && !vertical && (
          <text
            x={pos(boxes.length).x + BOX_H / 2}
            y={pos(boxes.length).y + BOX_H / 2 + 6}
            textAnchor="middle"
            className="box-null"
          >
            ∅
          </text>
        )}
        {pointers.map((pt, k) => {
          const { slot, row } = ranks[k];
          const p = pos(slot);
          // klíč podle popisku: při zkrácení seznamu ukazatelů se animuje správný popisek
          const key = pt.label + "|" + (pt.cls ?? "");
          if (vertical) {
            // <g class="pointer">: barvu a písmo dá .pointer text jako ostatním ukazatelům
            return (
              <g key={key} className={"pointer " + (pt.cls ?? "")}>
                <text
                  x={p.x + BOX + 12}
                  y={p.y + BOX_H / 2 + 5 + vRank[k] * PTR_ROW}
                >
                  ◀ {pt.label}
                </text>
              </g>
            );
          }
          // ∅ za koncem je úzký znak, ne krabička – ukazatel míří na jeho střed
          const cx = slot >= boxes.length ? p.x + BOX_H / 2 : p.x + BOX / 2;
          const cls = "pointer " + (pt.cls ?? "");
          if (row === 1) {
            return (
              <g
                key={key}
                className={cls + " pointer-below"}
                style={{
                  transform: `translate(${cx}px, ${p.y + BOX_H + 6}px)`,
                }}
              >
                <text x={0} y={18} textAnchor="middle">
                  {pt.label}
                </text>
                <path
                  d="M0,7 L0,-4"
                  className="pointer-line"
                  markerEnd="url(#arrow)"
                />
              </g>
            );
          }
          const lift = Math.max(0, row - 1) * PTR_ROW;
          return (
            <g
              key={key}
              className={cls}
              style={{ transform: `translate(${cx}px, ${p.y - 6 - lift}px)` }}
            >
              <text x={0} y={-6} textAnchor="middle">
                {pt.label}
              </text>
              <path
                d={`M0,-3 L0,${4 + lift}`}
                className="pointer-line"
                markerEnd="url(#arrow)"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
