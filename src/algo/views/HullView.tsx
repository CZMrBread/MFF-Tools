/**
 * Kresby konvexního obalu (Průvodce 16.1): rovina s body, obálkami H a D, zametací přímkou, testovaným
 * úhlem a hotovým obalem (`HullPlane`) a panel se zásobníky obálek a determinantem (`HullPanel`).
 *
 * Rovina je jedna zastávka Tabu (roving tabindex): šipky přesouvají fokus po bodech, Enter bod vybere
 * (jako klik), Delete ho smaže (jako × u vybraného bodu), Shift+šipky ho posunou o 1. Tah myší či prstem
 * obsluhuje algos/geometry/usePlaneDrag (handlery přijdou v `svgProps` a `attachSvg`); během tahu `live`
 * posune bod i čáry, které na něm visí. Bez `onRemove` / `onNudge` je to jen obrázek (náhled).
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
import { formatNum } from "../core/format";
import { useRovingFocus } from "../core/useRovingFocus";
import { bLabel, type HullPt, type HullState } from "../algos/geometry/hull";
import { removeButtonAt } from "../algos/geometry/planeDrag";
import { DragLabel, RemoveButton } from "../algos/geometry/PlaneMarks";
import type { PlaneLive } from "../algos/geometry/usePlaneDrag";
import {
  cropBox,
  HULL_FRAME,
  HULL_MAP,
  HULL_PAD,
  HULL_PLANE,
  HULL_PT_R,
  HULL_S,
  hullLabelK,
} from "./hullPlaneMap";

const PAD = HULL_PAD;

const px = (p: { x: number; y: number }) => HULL_MAP.toPx(p.x, p.y);
const num = (v: number) => formatNum(v).replace("-", "−");

/** popisky bodů b₁ … podle setříděného pořadí (před tříděním žádné) */
function labels(st: HullState): Map<number, string> {
  return new Map(st.order.map((id, i) => [id, bLabel(i)]));
}

/** třídy bodu podle stavu kroku */
function ptClass(st: HullState, p: HullPt, rank: Map<number, number>): string {
  const c = ["hull-pt"];
  const cur = st.cur;
  if (st.hull?.includes(p.id)) c.push("on-hull");
  if (st.alg === "sweep" && cur !== null && st.order.length) {
    const r = rank.get(p.id) ?? 0;
    if (r > (rank.get(cur) ?? 0)) c.push("is-todo");
  }
  if (p.id === cur) c.push("is-cur");
  if (st.popped === p.id) c.push("is-popped");
  else if (st.dropped.includes(p.id)) c.push("is-dropped");
  if (st.cand === p.id) c.push("is-cand");
  if (st.probe === p.id) c.push("is-probe");
  if (st.H.includes(p.id) || st.D.includes(p.id) || st.chain.includes(p.id))
    c.push("in-env");
  return c.join(" ");
}

const poly = (ids: readonly number[], at: Map<number, HullPt>) =>
  ids
    .map((id) => {
      const q = px(at.get(id)!);
      return `${q.x},${q.y}`;
    })
    .join(" ");

export function HullPlane({
  st,
  svgProps,
  attachSvg,
  live = null,
  selected = null,
  onSelect,
  onRemove,
  onNudge,
  className = "",
  fitAspect,
}: {
  st: HullState;
  /** obsluha myši a dotyku (usePlaneDrag) – bez ní rovina jen ukazuje */
  svgProps?: SVGProps<SVGSVGElement>;
  /** ref z usePlaneDrag (prst, který chytil bod, neposouvá stránku) */
  attachSvg?: (el: SVGSVGElement | null) => void | (() => void);
  /** právě tažený bod (souřadnice roviny) */
  live?: PlaneLive | null;
  /** vybraný bod (× u něj ho smaže) */
  selected?: number | null;
  /** Enter na bodu (jako klik) */
  onSelect?: (id: number) => void;
  /** Delete na bodu */
  onRemove?: (id: number) => void;
  /** Shift+šipky na bodu */
  onNudge?: (id: number, dx: number, dy: number) => void;
  className?: string;
  /** náhled: výřez kolem bodů s tímto poměrem šířka : výška místo celé roviny */
  fitAspect?: number;
}) {
  const interactive = !!onRemove;
  // měřítko roviny pro popisky bodů (≥ 11 px, UX-18); náhled (fitAspect) ho nepotřebuje
  const svgRef = useRef<SVGSVGElement | null>(null);
  const setSvg = useCallback(
    (el: SVGSVGElement | null) => {
      svgRef.current = el;
      return attachSvg?.(el) ?? undefined;
    },
    [attachSvg],
  );
  const [labelK, setLabelK] = useState(1);
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el || fitAspect) return;
    const measure = () => {
      const k = hullLabelK(el.getBoundingClientRect().width);
      setLabelK((old) => (Math.abs(old - k) < 0.01 ? old : k));
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitAspect]);
  // tažený bod (live) kreslíme pod ukazatelem – čáry obálek a obalu, které na něm visí, jdou s ním
  const dragged = live?.kind === "point" ? live : null;
  const at = new Map(
    st.points.map((p) => [
      p.id,
      dragged?.id === p.id ? { ...p, x: dragged.at.x, y: dragged.at.y } : p,
    ]),
  );
  const lab = labels(st);
  const rank = new Map(st.order.map((id, i) => [id, i]));
  // výchozí zastávka Tabu je b₁ (nejlevější bod); před setříděním první zadaný
  const ordered = st.order.length
    ? st.order.map((id) => at.get(id)!)
    : st.points;
  const rove = useRovingFocus(interactive ? ordered.map((p) => p.id) : []);

  const onKey = (e: KeyboardEvent, id: number) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const own = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "Enter") {
      own();
      onSelect?.(id);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      own();
      onRemove?.(id);
      return;
    }
    if (!e.shiftKey || !onNudge) return;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const m = d[e.key];
    if (!m) return;
    own();
    onNudge(id, m[0], m[1]);
  };

  const test = st.test;
  const sel =
    interactive && !dragged && selected !== null ? at.get(selected) : undefined;
  const del = sel ? removeButtonAt(px(sel), HULL_FRAME) : null;
  const top = HULL_MAP.toPx(0, HULL_PLANE[3]).y;
  const bottom = HULL_MAP.toPx(0, HULL_PLANE[1]).y;
  const sweepPx = st.sweepX !== null ? HULL_MAP.toPx(st.sweepX, 0).x : null;
  const hull = st.hull;
  const name = `Rovina s ${st.points.length} ${st.points.length === 1 ? "bodem" : "body"}${hull ? `, konvexní obal má ${hull.length} ${hull.length === 1 ? "vrchol" : hull.length < 5 ? "vrcholy" : "vrcholů"}` : ""}`;

  return (
    <svg
      viewBox={
        fitAspect ? cropBox(st.points, fitAspect) : `0 0 ${HULL_S} ${HULL_S}`
      }
      className={
        "hull-plane " +
        className +
        (svgProps ? " is-editable" : "") +
        (dragged ? " is-dragging" : "")
      }
      role={interactive ? "group" : "img"}
      aria-label={
        interactive
          ? `${name}. Klepnutím do prázdna přidáte bod, tažením bod přesunete, klepnutím bod vyberete (× u něj ho smaže); šipky = po bodech, Enter = vybrat, Delete = smazat, Shift+šipky = posun.`
          : name
      }
      ref={setSvg}
      style={
        labelK !== 1
          ? ({
              "--algo-hull-k": labelK.toFixed(3),
              "--algo-plane-k": labelK.toFixed(3),
            } as CSSProperties)
          : undefined
      }
      {...(interactive ? rove.group : {})}
      {...svgProps}
    >
      <rect
        x={PAD}
        y={PAD}
        width={HULL_S - 2 * PAD}
        height={HULL_S - 2 * PAD}
        className="hull-frame"
      />
      {hull && hull.length >= 3 && (
        <polygon points={poly(hull, at)} className="hull-final" />
      )}
      {hull && hull.length === 2 && (
        <polyline
          points={poly(hull, at)}
          className="hull-final hull-final-seg"
        />
      )}
      {sweepPx !== null && !hull && (
        <line
          x1={sweepPx}
          x2={sweepPx}
          y1={top}
          y2={bottom}
          className="hull-sweep"
        />
      )}
      {st.alg === "sweep" && !hull && (
        <>
          {st.D.length > 1 && (
            <polyline points={poly(st.D, at)} className="hull-env hull-D" />
          )}
          {st.H.length > 1 && (
            <polyline points={poly(st.H, at)} className="hull-env hull-H" />
          )}
        </>
      )}
      {st.alg === "wrap" && !hull && st.chain.length > 1 && (
        <polyline points={poly(st.chain, at)} className="hull-env hull-H" />
      )}
      {test && st.alg === "sweep" && (
        <polyline
          points={poly([test.a, test.m, test.b], at)}
          className={"hull-test" + (test.pop ? " is-bad" : "")}
        />
      )}
      {st.alg === "wrap" && st.cur !== null && st.cand !== null && (
        <line
          {...seg(at.get(st.cur)!, at.get(st.cand)!)}
          className="hull-cand"
        />
      )}
      {st.alg === "wrap" && st.cur !== null && st.probe !== null && (
        <line
          {...seg(at.get(st.cur)!, at.get(st.probe)!)}
          className="hull-probe"
        />
      )}
      {/* pořadí v DOM = pořadí zadání (stabilní): posun bodu Shift+šipkou ho v DOM nepřesune a fokus zůstane */}
      {st.points.map((p) => {
        const c = px(at.get(p.id)!);
        const label = lab.get(p.id);
        const isDragged = dragged?.id === p.id;
        const flip = c.x > HULL_S - PAD - 34;
        const desc = `${label ? label + " " : "Bod "}(${num(p.x)}, ${num(p.y)})`;
        return (
          <g
            key={p.id}
            className={
              ptClass(st, p, rank) +
              (p.id === selected && interactive ? " is-selected" : "") +
              (isDragged ? " is-dragged" : "")
            }
            {...(interactive
              ? {
                  role: "button",
                  "aria-label": `${desc} – Enter = vybrat, Delete = smazat, Shift+šipky = posun`,
                  "aria-pressed": p.id === selected,
                  onKeyDown: (e: KeyboardEvent) => onKey(e, p.id),
                  ...rove.item(p.id),
                }
              : {})}
          >
            <circle cx={c.x} cy={c.y} r={HULL_PT_R} />
            {/* neviditelný úchop (ukazatel „grab“); vybírá se podle vzdálenosti (planeDrag) */}
            {svgProps && (
              <circle cx={c.x} cy={c.y} r={11} className="plane-hit" />
            )}
            {st.popped === p.id && (
              <text x={c.x} y={c.y + 4} className="hull-x" textAnchor="middle">
                ×
              </text>
            )}
            {/* tažený bod má místo popisku bᵢ souřadnice (DragLabel) – nepřekrývají se */}
            {label && !isDragged && (
              <text
                x={flip ? c.x - 8 : c.x + 8}
                y={c.y - 7}
                textAnchor={flip ? "end" : "start"}
                className="hull-label"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
      {dragged && (
        <DragLabel
          at={px(dragged.at)}
          x={Math.round(dragged.at.x)}
          y={Math.round(dragged.at.y)}
        />
      )}
      {del && <RemoveButton at={del} />}
    </svg>
  );
}

const seg = (a: HullPt, b: HullPt) => {
  const p = px(a);
  const q = px(b);
  return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
};

/** Zásobník obálky jako řada štítků; poslední (vrchol zásobníku) vpravo. */
function Stack({
  name,
  ids,
  lab,
  hot,
  popped,
  cls,
}: {
  name: string;
  ids: readonly number[];
  lab: Map<number, string>;
  hot: readonly number[];
  popped: number | null;
  cls: string;
}) {
  return (
    <div className={"hull-stack " + cls}>
      <span className="hull-stack-name">{name} =</span>
      <span className="hull-stack-items">
        {ids.length === 0 && <span className="hull-chip is-empty">∅</span>}
        {ids.map((id) => (
          <span
            key={id}
            className={"hull-chip" + (hot.includes(id) ? " is-hot" : "")}
          >
            {lab.get(id)}
          </span>
        ))}
        {popped !== null && (
          <span className="hull-chip is-popped" title="právě odebraný bod">
            {lab.get(popped)}
          </span>
        )}
      </span>
    </div>
  );
}

/** Panel vedle roviny: obálky (zásobníky) a výpočet determinantu M z testovaného úhlu (str. 404). */
export function HullPanel({ st }: { st: HullState }) {
  const lab = labels(st);
  const t = st.test;
  const sweep = st.alg === "sweep";
  const hot = t ? [t.a, t.m] : [];
  const verdict = !t
    ? null
    : sweep
      ? t.det >= 0
        ? "≥ 0 → doleva"
        : "< 0 → doprava"
      : t.det > 0
        ? "> 0 → p nalevo od cq"
        : t.det < 0
          ? "< 0 → p napravo od cq"
          : "= 0 → p na přímce cq";
  return (
    <div className="hull-panel" aria-live="off">
      {sweep ? (
        <>
          <Stack
            name="H"
            ids={st.H}
            lab={lab}
            hot={st.env === "H" ? hot : []}
            popped={st.env === "H" ? st.popped : null}
            cls="is-H"
          />
          <Stack
            name="D"
            ids={st.D}
            lab={lab}
            hot={st.env === "D" ? hot : []}
            popped={st.env === "D" ? st.popped : null}
            cls="is-D"
          />
        </>
      ) : (
        <Stack
          name="O"
          ids={st.chain}
          lab={lab}
          hot={st.cur !== null ? [st.cur] : []}
          popped={null}
          cls="is-H"
        />
      )}
      {t ? (
        <div className={"hull-det" + (t.pop ? " is-pop" : "")}>
          <div className="hull-det-head">
            {sweep
              ? `úhel ${lab.get(t.a)}${lab.get(t.m)}${lab.get(t.b)}`
              : `c = ${lab.get(t.a)}, q = ${lab.get(t.m)}, p = ${lab.get(t.b)}`}
          </div>
          <table
            className="hull-matrix"
            aria-label="matice M a její determinant"
          >
            <tbody>
              <tr>
                <th scope="row">{sweep ? "u = hₖ − hₖ₋₁" : "u = q − c"}</th>
                <td>{num(t.u[0])}</td>
                <td>{num(t.u[1])}</td>
              </tr>
              <tr>
                <th scope="row">{sweep ? "v = b − hₖ" : "v = p − c"}</th>
                <td>{num(t.v[0])}</td>
                <td>{num(t.v[1])}</td>
              </tr>
            </tbody>
          </table>
          <div className="hull-det-value">
            det M = x₁y₂ − x₂y₁ = <b>{num(t.det)}</b> {verdict}
          </div>
        </div>
      ) : (
        <div className="hull-det is-idle">
          {st.hull
            ? `Obal: ${st.hull.map((id) => lab.get(id)).join(" → ")}`
            : "det M = x₁y₂ − x₂y₁ ≥ 0 ⇔ úhel doleva (str. 404)"}
        </div>
      )}
    </div>
  );
}
