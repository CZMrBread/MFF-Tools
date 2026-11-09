/**
 * Úpravy roviny s body ukazatelem (konvexní obal, k-d strom) nad sdíleným core/usePointerDrag –
 * myš, pero i prst (Pointer Events + setPointerCapture). Výběr cíle a geometrie jsou čisté funkce
 * v planeDrag.ts.
 *
 * - klepnutí do prázdna = nový bod (`onTap`);
 * - klepnutí na bod (do 22 px od středu) = výběr (`onSelect`, fokus na bod) – bod se klikem NEmaže;
 * - tah bodu (úchop ≥ 22 px myš / 44 px prst, práh 4 px) = přesun: bod jede s ukazatelem o posun
 *   z uchopení, drží se v rovině, `live` ho během tahu ukazuje, puštění = `onMove` (souřadnice roviny);
 * - tlačítko × u vybraného bodu (`remove`) = `onRemove`;
 * - obdélník Q (`rect`): tah rohu / hrany mění velikost, tah vnitřku ho posune, `emptyDrag` = tah
 *   z prázdna natáhne nový; puštění = `onRect`.
 *
 * Rovina má pevný viewBox – nic se během tahu nepřepočítává; měřítko obrazovky (velikost úchopů) se
 * vezme při stisku. Bez `emptyDrag` se stisk v prázdnu nezachytává: prst tam dál posouvá stránku
 * (posun zruší jen stisk, který chytil bod nebo Q – attachSvg).
 *
 *   const drag = usePlaneDrag({ map, plane, points, … });
 *   <svg ref={drag.attachSvg} {...drag.handlers} className={drag.live ? "is-dragging" : ""}>
 */
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampPoint,
  pastThreshold,
  DRAG_THRESHOLD,
  type Matrix2D,
  type P2,
} from "../../core/dragMath";
import { usePointerDrag } from "../../core/usePointerDrag";
import {
  dragRect,
  type PlaneBox,
  type PlaneMapping,
} from "../../views/pointEdit";
import {
  moveBox,
  pickPlaneTarget,
  planeFrame,
  resizeBox,
  screenUnit,
  tapSelects,
  type PlaneHit,
} from "./planeDrag";

export type PlaneLive =
  /** tažený bod (souřadnice roviny, nezaokrouhlené) */
  | { kind: "point"; id: number; at: P2 }
  /** tažený obdélník Q (souřadnice roviny, celočíselné, srovnané) */
  | { kind: "rect"; box: PlaneBox };

export interface PlaneDragOptions {
  map: PlaneMapping;
  plane: PlaneBox;
  points: readonly { id: number; x: number; y: number }[];
  /** viditelný poloměr bodu (px viewBoxu) */
  pointR: number;
  /** tlačítko × u vybraného bodu (px viewBoxu) */
  remove?: { id: number; at: P2; r: number } | null;
  /** obdélník Q s úchopy (souřadnice roviny) */
  rect?: PlaneBox | null;
  /** tah z prázdna natáhne nový obdélník Q (k-d strom) */
  emptyDrag?: boolean;
  onTap: (at: P2) => void;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
  onMove: (id: number, to: P2) => void;
  onRect?: (box: PlaneBox) => void;
  /** matice obrazovky (testy); jinak getScreenCTM() roviny */
  screenMatrix?: () => Matrix2D | null;
}

interface Frozen {
  /** jednotek viewBoxu na 1 px obrazovky při stisku */
  unit: number;
  /** Q při stisku (tah úchopu) */
  box0: PlaneBox | null;
  svg: SVGSVGElement | null;
}

export function usePlaneDrag(o: PlaneDragOptions) {
  const [live, setLive] = useState<PlaneLive | null>(null);
  /** stisk v prázdnu bez zachycení (obal): klepnutí = nový bod, posun prstem = posun stránky */
  const tapPress = useRef<{ id: number; start: P2 } | null>(null);

  const frame = planeFrame(o.map, o.plane);
  const toPlane = (p: P2) => o.map.fromPx(p.x, p.y);
  const delta = (a: P2, b: P2) => {
    const pa = toPlane(a);
    const pb = toPlane(b);
    return { x: pb.x - pa.x, y: pb.y - pa.y };
  };

  const { session, begin, handlers, toLocal, attachSvg } = usePointerDrag<
    PlaneHit,
    Frozen
  >({
    screenMatrix: o.screenMatrix,
    clamp: (c, s) => (s.target.kind === "point" ? clampPoint(c, frame) : c),
    onMove: (c, s, p) => {
      const t = s.target;
      if (t.kind === "point")
        setLive({ kind: "point", id: t.id, at: toPlane(c) });
      else if (t.kind === "handle" && s.frozen.box0)
        setLive({
          kind: "rect",
          box: resizeBox(s.frozen.box0, t, delta(s.start, p), o.plane),
        });
      else if (t.kind === "inside" && s.frozen.box0)
        setLive({
          kind: "rect",
          box: moveBox(s.frozen.box0, delta(s.start, p), o.plane),
        });
      else if (t.kind === "empty")
        setLive({
          kind: "rect",
          box: dragRect(toPlane(s.start), toPlane(p), o.plane),
        });
    },
    onRelease: ({ session: s, moved, center, pointer }) => {
      setLive(null);
      const t = s.target;
      if (!moved) {
        if (t.kind === "remove") o.onRemove(t.id);
        else if (t.kind === "point" && tapSelects(t.d)) {
          o.onSelect(t.id);
          s.frozen.svg
            ?.querySelector<SVGElement>(`[data-rove-key="${t.id}"]`)
            ?.focus({ preventScroll: true });
        } else o.onTap(toPlane(s.start));
        return;
      }
      if (t.kind === "point") o.onMove(t.id, toPlane(center));
      else if (t.kind === "handle" && s.frozen.box0)
        o.onRect?.(
          resizeBox(s.frozen.box0, t, delta(s.start, pointer), o.plane),
        );
      else if (t.kind === "inside" && s.frozen.box0)
        o.onRect?.(moveBox(s.frozen.box0, delta(s.start, pointer), o.plane));
      else if (t.kind === "empty")
        o.onRect?.(dragRect(toPlane(s.start), toPlane(pointer), o.plane));
    },
    onCancel: () => setLive(null),
  });

  const onPointerDownCapture = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = toLocal(e);
    if (!p) return;
    const svg = e.currentTarget;
    const m = o.screenMatrix ? o.screenMatrix() : svg.getScreenCTM?.();
    const unit = screenUnit(m ?? null);
    const rect = o.rect ? planeFrame(o.map, o.rect) : null;
    const hit = pickPlaneTarget({
      p,
      unit,
      pointerType: e.pointerType || "mouse",
      points: o.points.map((q) => ({ id: q.id, at: o.map.toPx(q.x, q.y) })),
      pointR: o.pointR,
      remove: o.remove,
      rect,
    });
    if (hit.kind === "empty" && !o.emptyDrag) {
      tapPress.current = { id: e.pointerId, start: p };
      return;
    }
    const q =
      hit.kind === "point" ? o.points.find((x) => x.id === hit.id) : null;
    const frozen: Frozen = { unit, box0: o.rect ? [...o.rect] : null, svg };
    if (begin(e, hit, { center: q ? o.map.toPx(q.x, q.y) : p, frozen }))
      e.stopPropagation();
  };

  const svgHandlers = {
    onPointerDownCapture,
    onPointerMove: handlers.onPointerMove,
    onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => {
      const t = tapPress.current;
      if (t && t.id === e.pointerId) {
        tapPress.current = null;
        const p = toLocal(e);
        if (p && !pastThreshold(t.start, p, DRAG_THRESHOLD))
          o.onTap(toPlane(t.start));
        return;
      }
      handlers.onPointerUp(e);
    },
    onPointerCancel: (e: ReactPointerEvent<SVGSVGElement>) => {
      if (tapPress.current?.id === e.pointerId) tapPress.current = null;
      handlers.onPointerCancel(e);
    },
    onLostPointerCapture: handlers.onLostPointerCapture,
  };

  return {
    handlers: svgHandlers,
    attachSvg,
    /** právě tažený bod / obdélník (null = žádný tah za prahem) */
    live: session?.moved ? live : null,
    /** probíhá stisk na bodu či Q (i pod prahem) */
    pressing: session !== null,
  };
}
