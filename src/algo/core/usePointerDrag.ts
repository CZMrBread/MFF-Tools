/**
 * Tah prvku kresby ukazatelem – myš, pero i prst (Pointer Events + setPointerCapture). Sdílený model pro
 * všechny kresby s přetahovanými body (grafy, toky; konvexní obal a k-d strom ho mají převzít):
 *
 * - stisk na prvku: `drag.begin(e, target, { center, frozen })` – `center` = střed prvku v px SVG (prvek
 *   pak jede s ukazatelem o posun z uchopení, nepřeskočí), `frozen` = cokoli, co kresba během tahu nesmí
 *   přepočítat (měřítko, viewBox, šířka). Vrátí false, když tah nezačal (pravé tlačítko, druhý prst).
 * - práh DRAG_THRESHOLD (4 px): menší posun je klik / ťuknutí (`onRelease` s `moved: false`);
 * - během tahu `onMove(center, session, pointer)` se středem v mezích `clamp`;
 * - `session` (stav pro render): kdo se táhne, `moved`, `frozen` ze stisku – kresba ho použije místo
 *   nového přepočtu, dokud se nepustí; po puštění / zrušení je null;
 * - `handlers` patří na <svg> (pointermove / up / cancel / lostpointercapture po zachycení), `attachSvg` také:
 *   prst, který chytil prvek, nesmí posouvat stránku – Chrome nebere `touch-action` vnitřních prvků SVG
 *   (rozhoduje to celého <svg>), proto nativní touchstart (passive: false) posun zruší, jen když stisk
 *   (pointerdown, přijde dřív) začal tah. Jinde prst stránku posouvá dál.
 *
 *   // výsledek rozložit: lint React Compileru jinak bere celý objekt s callback refem jako ref
 *   const { session, begin, handlers, attachSvg } = usePointerDrag<number, Frozen>({ clamp, onMove, onRelease });
 *   const frozen = session?.frozen;            // během tahu kreslit z něj, ne z nového přepočtu
 *   <svg ref={attachSvg} {...handlers} className={session?.moved ? "is-dragging" : ""}>
 *     <circle onPointerDown={(e) => begin(e, id, { center: px(id), frozen: { vp, vb, box } })} />
 *
 * Výběr prvku s větším úchopem: na <svg> `onPointerDownCapture`, `toLocal(e)` → `pickNearest(body,
 * (i) => hitRadius(r(i), e.pointerType), p)` → `e.stopPropagation()` a `begin(...)` (viz GraphView).
 * Výpočty jsou čisté funkce v dragMath.ts.
 */
import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clientToLocal,
  DRAG_THRESHOLD,
  followPointer,
  grabOffset,
  pastThreshold,
  type Matrix2D,
  type P2,
} from "./dragMath";

export interface DragSession<T, F> {
  target: T;
  pointerId: number;
  /** "mouse" | "pen" | "touch" */
  pointerType: string;
  /** ukazatel při stisku (px SVG) */
  start: P2;
  /** střed prvku − ukazatel při stisku */
  offset: P2;
  /** hodnota zmrazená při stisku (kresba ji během tahu používá místo přepočtu) */
  frozen: F;
  /** tah překročil práh (už to není klik) */
  moved: boolean;
  /** čas stisku (ms, timeStamp události) – dlouhý stisk */
  t0: number;
  /** pořadové číslo stisku – id gesta (historie úprav seskupí přesuny jednoho tahu) */
  gesture: number;
}

export interface DragRelease<T, F> {
  session: DragSession<T, F>;
  /** ukazatel při puštění (px SVG, bez mezí) */
  pointer: P2;
  /** střed prvku při puštění (posun z uchopení, v mezích) */
  center: P2;
  moved: boolean;
  /** délka stisku (ms) */
  ms: number;
}

export interface PointerDragOptions<T, F> {
  /** matice obrazovky (testy); jinak getScreenCTM() kořenového <svg> prvku, na kterém tah začal */
  screenMatrix?: () => Matrix2D | null;
  threshold?: number;
  /** meze středu taženého prvku (px SVG) */
  clamp?: (center: P2, session: DragSession<T, F>) => P2;
  /** tah za prahem: nový střed prvku */
  onMove?: (center: P2, session: DragSession<T, F>, pointer: P2) => void;
  /** puštění (i klik pod prahem – moved: false) */
  onRelease?: (r: DragRelease<T, F>) => void;
  /** pointercancel / ztráta zachycení – tah se zahodí */
  onCancel?: (session: DragSession<T, F>) => void;
}

type AnyPointerEvent = ReactPointerEvent<Element>;

/** kořenové <svg> prvku (souřadnice kresby = jeho uživatelský prostor, ne posunutá skupina vrcholu) */
function rootSvg(t: EventTarget | null): SVGSVGElement | null {
  if (typeof SVGSVGElement !== "undefined" && t instanceof SVGSVGElement)
    return t;
  if (typeof SVGElement !== "undefined" && t instanceof SVGElement)
    return t.ownerSVGElement;
  return null;
}

export function usePointerDrag<T, F = undefined>(
  opts: PointerDragOptions<T, F>,
) {
  const ref = useRef<DragSession<T, F> | null>(null);
  const gestures = useRef(0);
  const [session, setSession] = useState<DragSession<T, F> | null>(null);

  const toLocal = (e: {
    clientX: number;
    clientY: number;
    currentTarget: EventTarget | null;
  }): P2 | null => {
    const m = opts.screenMatrix
      ? opts.screenMatrix()
      : (rootSvg(e.currentTarget)?.getScreenCTM?.() ?? null);
    return clientToLocal(e.clientX, e.clientY, m);
  };
  const centerFor = (s: DragSession<T, F>, p: P2) => {
    const c = followPointer(p, s.offset);
    return opts.clamp ? opts.clamp(c, s) : c;
  };
  // stisk prstem, který začal tah: touchstart (po pointerdown) nesmí rozjet posun stránky
  const attachSvg = useCallback((el: SVGSVGElement | null) => {
    if (!el) return;
    const onTouch = (e: TouchEvent) => {
      if (ref.current && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", onTouch, { passive: false });
    return () => el.removeEventListener("touchstart", onTouch);
  }, []);
  const clear = () => {
    ref.current = null;
    setSession(null);
  };

  /** Začátek tahu na prvku `target`; false = nezačal (pravé tlačítko, už se táhne jiným ukazatelem). */
  const begin = (
    e: AnyPointerEvent,
    target: T,
    init: { center?: P2; frozen: F },
  ): boolean => {
    if (e.pointerType === "mouse" && e.button !== 0) return false;
    if (ref.current) return false;
    const start = toLocal(e);
    if (!start) return false;
    gestures.current += 1;
    const s: DragSession<T, F> = {
      target,
      pointerId: e.pointerId,
      pointerType: e.pointerType || "mouse",
      start,
      offset: init.center ? grabOffset(start, init.center) : { x: 0, y: 0 },
      frozen: init.frozen,
      moved: false,
      t0: e.timeStamp,
      gesture: gestures.current,
    };
    ref.current = s;
    setSession(s);
    // zachytí prvek, na kterém tah začal – pohyb pak dorazí i mimo něj a probublá k <svg> s handlers
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // ukazatel už není aktivní (syntetická událost) – tah jde i bez zachycení
    }
    return true;
  };

  const handlers = {
    onPointerMove: (e: AnyPointerEvent) => {
      const s = ref.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const p = toLocal(e);
      if (!p) return;
      if (!s.moved) {
        if (!pastThreshold(s.start, p, opts.threshold ?? DRAG_THRESHOLD))
          return;
        const next = { ...s, moved: true };
        ref.current = next;
        setSession(next);
        opts.onMove?.(centerFor(next, p), next, p);
        return;
      }
      opts.onMove?.(centerFor(s, p), s, p);
    },
    onPointerUp: (e: AnyPointerEvent) => {
      const s = ref.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const p = toLocal(e) ?? s.start;
      const moved =
        s.moved || pastThreshold(s.start, p, opts.threshold ?? DRAG_THRESHOLD);
      clear();
      opts.onRelease?.({
        session: s,
        pointer: p,
        center: moved ? centerFor(s, p) : centerFor(s, s.start),
        moved,
        ms: e.timeStamp - s.t0,
      });
    },
    onPointerCancel: (e: AnyPointerEvent) => {
      const s = ref.current;
      if (!s || s.pointerId !== e.pointerId) return;
      clear();
      opts.onCancel?.(s);
    },
    onLostPointerCapture: (e: AnyPointerEvent) => {
      // po pointerup už je tah ukončený; jinak (prohlížeč zachycení zrušil) = zrušení
      const s = ref.current;
      if (!s || s.pointerId !== e.pointerId) return;
      clear();
      opts.onCancel?.(s);
    },
  };

  return { session, begin, handlers, toLocal, attachSvg };
}
