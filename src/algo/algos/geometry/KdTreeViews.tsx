/**
 * Rovina k-d stromu (body, dělicí přímky, dotaz) – sdílí ji stránka (KdTreePage.tsx, líně načítaná) a náhled na úvodní stránce (landing/previews.tsx).
 *
 * Se `svgProps` (handlery usePlaneDrag) se do ní dá klepat a táhnout: body jdou chytit i kousek vedle
 * kroužku, obdélník Q má úchopy v rozích (a na hranách / uvnitř), vybraný bod má × ke smazání. Rovina je
 * pak jedna zastávka Tabu (roving tabindex): šipky po bodech, Enter = vybrat, Delete = smazat,
 * Shift+šipky = posun. viewBox je pevný – tah kresbu nepřeměřuje.
 */
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type SVGProps,
} from "react";
import { useRovingFocus } from "../../core/useRovingFocus";
import {
  clipBox,
  normalizeQuery,
  sameBox,
  type Box,
  type KdState,
  type Pt,
} from "./kdtree";
import {
  KD_FRAME,
  KD_MAP,
  KD_PLANE_PAD,
  KD_PLANE_S,
  KD_PT_R,
} from "./kdPlaneMap";
import { HANDLE_R, removeButtonAt } from "./planeDrag";
import { DragLabel, RemoveButton } from "./PlaneMarks";
import type { PlaneLive } from "./usePlaneDrag";

/** popisek bodu v rovině: písmo ve viewBoxu a lem (paint-order), aby šel číst přes čáry */
const LABEL_STYLE = {
  fontSize: 13,
  paintOrder: "stroke",
  stroke: "var(--algo-panel)",
  strokeWidth: 3,
  strokeLinejoin: "round",
} as const;

const S = KD_PLANE_S;
const PAD = KD_PLANE_PAD;
const MAP = KD_MAP;
const sx = (x: number) => MAP.toPx(x, 0).x;
const sy = (y: number) => MAP.toPx(0, y).y;
/** popisek „x,y“ vpravo od bodu by přesáhl rovinu (odhad šířky ~7,5 jednotky na znak při písmu 13) */
const labelFlips = (p: Pt) =>
  sx(p.x) + 7 + `${p.x},${p.y}`.length * 7.5 > S - 2;

const SHIFT_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/** Úchopy obdélníku Q: čtverečky v rozích, neviditelné hrany a vnitřek (ukazatel podle druhu úchopu). */
function QHandles({ box }: { box: Box }) {
  const b = clipBox(box);
  if (!b) return null;
  const x1 = sx(b[0]);
  const x2 = sx(b[2]);
  const top = sy(b[3]);
  const bottom = sy(b[1]);
  const h = HANDLE_R;
  const corners: [number, number, string][] = [
    [x1, top, "nw"],
    [x2, top, "ne"],
    [x1, bottom, "sw"],
    [x2, bottom, "se"],
  ];
  return (
    <g className="kd-q-handles">
      <rect
        x={x1}
        y={top}
        width={x2 - x1}
        height={bottom - top}
        className="kd-q-body"
      />
      <line x1={x1} x2={x2} y1={top} y2={top} className="kd-q-edge is-ns" />
      <line
        x1={x1}
        x2={x2}
        y1={bottom}
        y2={bottom}
        className="kd-q-edge is-ns"
      />
      <line x1={x1} x2={x1} y1={top} y2={bottom} className="kd-q-edge is-ew" />
      <line x1={x2} x2={x2} y1={top} y2={bottom} className="kd-q-edge is-ew" />
      {corners.map(([x, y, c]) => (
        <rect
          key={c}
          x={x - h}
          y={y - h}
          width={2 * h}
          height={2 * h}
          className={"kd-q-handle is-" + c}
        />
      ))}
    </g>
  );
}

/**
 * Rovina s body, dělicími přímkami, oblastí aktuálního vrcholu, použitým dotazem (st.query) a náhledem
 * rozepsaného Q. S `svgProps` (handlery usePlaneDrag) se do ní dá klepat a táhnout; `live` = náhled tahu
 * obdélníku, `dragged` = bod, který se právě táhne (st je pak náhled s bodem na novém místě).
 */
export function Plane({
  st,
  preview = null,
  svgProps,
  attachSvg,
  live = null,
  dragged = null,
  handles = null,
  selected = null,
  onSelect,
  onRemove,
  onNudge,
}: {
  st: KdState;
  preview?: Box | null;
  svgProps?: SVGProps<SVGSVGElement>;
  /** ref z usePlaneDrag (prst, který chytil bod či Q, neposouvá stránku) */
  attachSvg?: (el: SVGSVGElement | null) => void | (() => void);
  live?: PlaneLive | null;
  dragged?: number | null;
  /** obdélník Q s úchopy (jde táhnout za rohy, hrany i vnitřek) */
  handles?: Box | null;
  selected?: number | null;
  /** Enter na bodu (jako klik) */
  onSelect?: (id: number) => void;
  /** Delete na bodu (jako × u vybraného bodu) */
  onRemove?: (id: number) => void;
  /** Shift+šipky na bodu */
  onNudge?: (id: number, dx: number, dy: number) => void;
}) {
  const interactive = !!onRemove;
  // jednotky viewBoxu na 1 px – neviditelný úchop bodu má 22 px obrazovky (CSS --algo-plane-k)
  const svgRef = useRef<SVGSVGElement | null>(null);
  const setSvg = useCallback(
    (el: SVGSVGElement | null) => {
      svgRef.current = el;
      return attachSvg?.(el) ?? undefined;
    },
    [attachSvg],
  );
  const [unitK, setUnitK] = useState(1);
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el || !interactive) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      const k = w > 0 ? S / w : 1;
      setUnitK((old) => (Math.abs(old - k) < 0.01 ? old : k));
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [interactive]);
  const rove = useRovingFocus(interactive ? st.points.map((p) => p.id) : []);

  const onKey = (e: KeyboardEvent, id: number) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const own = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "Enter") {
      own();
      onSelect?.(id);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      own();
      onRemove?.(id);
    } else if (e.shiftKey && onNudge && SHIFT_KEYS[e.key]) {
      own();
      onNudge(id, ...SHIFT_KEYS[e.key]);
    }
  };

  // Q kreslíme jen uvnitř roviny; degenerovaný dotaz (úsečka, bod) dostane aspoň 2 px, aby byl vidět
  const qRect = (box: Box, cls: string) => {
    const b = clipBox(box);
    if (!b) return null;
    const w = Math.max(sx(b[2]) - sx(b[0]), 2);
    const h = Math.max(sy(b[1]) - sy(b[3]), 2);
    return (
      <rect
        x={(sx(b[0]) + sx(b[2]) - w) / 2}
        y={(sy(b[1]) + sy(b[3]) - h) / 2}
        width={w}
        height={h}
        className={cls}
      />
    );
  };
  const draftBox = live?.kind === "rect" ? normalizeQuery(live.box) : null;
  const showPreview =
    preview && !draftBox && !(st.query && sameBox(preview, st.query));
  const handleBox = draftBox ?? handles;
  const sel =
    interactive && dragged === null && !draftBox
      ? st.points.find((p) => p.id === selected)
      : undefined;
  const del = sel ? removeButtonAt(MAP.toPx(sel.x, sel.y), KD_FRAME) : null;
  const drag =
    dragged !== null ? st.points.find((p) => p.id === dragged) : undefined;
  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      className={
        "kd-plane" +
        (svgProps ? " is-editable" : "") +
        (live ? " is-dragging" : "")
      }
      role={interactive ? "group" : "img"}
      aria-label={
        svgProps
          ? `Body v rovině a jejich rozdělení k-d stromem. Klepnutím do prázdna přidáte bod, klepnutím bod vyberete (× u něj ho smaže), tažením bod přesunete; obdélník Q táhněte za rohy, hrany nebo vnitřek, tažením z prázdného místa zadáte nový. Šipky = po bodech, Enter = vybrat, Delete = smazat, Shift+šipky = posun.`
          : "Body v rovině a jejich rozdělení k-d stromem"
      }
      ref={setSvg}
      style={
        interactive && unitK !== 1
          ? ({ "--algo-plane-k": unitK.toFixed(3) } as CSSProperties)
          : undefined
      }
      {...(interactive ? rove.group : {})}
      {...svgProps}
    >
      <rect
        x={PAD}
        y={PAD}
        width={S - 2 * PAD}
        height={S - 2 * PAD}
        className="kd-frame"
      />
      {st.region && (
        <rect
          x={sx(st.region[0])}
          y={sy(st.region[3])}
          width={sx(st.region[2]) - sx(st.region[0])}
          height={sy(st.region[1]) - sy(st.region[3])}
          className="kd-region"
        />
      )}
      {Object.values(st.nodes).map((n) =>
        n.axis === 0 ? (
          <line
            key={n.id}
            x1={sx(n.pt.x)}
            x2={sx(n.pt.x)}
            y1={sy(n.box[3])}
            y2={sy(n.box[1])}
            className={"kd-split " + (st.marks[n.id] ?? "")}
          />
        ) : (
          <line
            key={n.id}
            y1={sy(n.pt.y)}
            y2={sy(n.pt.y)}
            x1={sx(n.box[0])}
            x2={sx(n.box[2])}
            className={"kd-split " + (st.marks[n.id] ?? "")}
          />
        ),
      )}
      {st.query && !draftBox && qRect(st.query, "kd-query")}
      {showPreview && qRect(preview, "kd-query kd-query-preview")}
      {draftBox && qRect(draftBox, "kd-query kd-query-preview kd-query-draft")}
      {svgProps && handleBox && <QHandles box={handleBox} />}
      {st.points.map((p) => (
        <g
          key={p.id}
          className={
            "kd-pt " +
            (st.ptMarks[p.id] ?? "") +
            (interactive && p.id === selected ? " is-selected" : "") +
            (p.id === dragged ? " is-dragged" : "")
          }
          {...(interactive
            ? {
                role: "button",
                "aria-label": `Bod (${p.x}, ${p.y}) – Enter = vybrat, Delete = smazat, Shift+šipky = posun`,
                "aria-pressed": p.id === selected,
                onKeyDown: (e: KeyboardEvent) => onKey(e, p.id),
                ...rove.item(p.id),
              }
            : {})}
        >
          <circle cx={sx(p.x)} cy={sy(p.y)} r={KD_PT_R} />
          {/* neviditelný úchop (ukazatel „grab“); vybírá se podle vzdálenosti (planeDrag) */}
          {svgProps && (
            <circle cx={sx(p.x)} cy={sy(p.y)} r={11} className="plane-hit" />
          )}
          {/* popisek čitelný i přes dělicí přímky: 13 jednotek viewBoxu s lemem barvy plátna */}
          {/* u pravého okraje se popisek překlopí doleva, ať nepřeteče přes rovinu do sloupce stromu */}
          {labelFlips(p) ? (
            <text
              x={sx(p.x) - 7}
              y={sy(p.y) - 6}
              textAnchor="end"
              style={LABEL_STYLE}
            >
              {p.x},{p.y}
            </text>
          ) : (
            <text x={sx(p.x) + 7} y={sy(p.y) - 6} style={LABEL_STYLE}>
              {p.x},{p.y}
            </text>
          )}
        </g>
      ))}
      {drag && (
        <DragLabel at={MAP.toPx(drag.x, drag.y)} x={drag.x} y={drag.y} />
      )}
      {del && <RemoveButton at={del} />}
    </svg>
  );
}
