import { useContext, useLayoutEffect, useState, type RefObject } from "react";
import { CanvasFitContext } from "../../core/canvasFit";

/**
 * Kolik px výšky plátna (.viz-canvas) zbývá pro prvek `ref` po odečtení jeho sourozenců (proměnné, popis
 * funkce) a paddingu – jen v režimu jedné obrazovky (CanvasFitContext), jinak null (stránka teče).
 */
export function useCanvasRoom(
  ref: RefObject<HTMLElement | null>,
): number | null {
  const canvas = useContext(CanvasFitContext);
  const [room, setRoom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!canvas || !el) {
      setRoom(null);
      return;
    }
    const measure = () => {
      const cs = getComputedStyle(canvas);
      const pad =
        (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      let others = 0;
      for (const c of canvas.children) {
        if (c === el || c.contains(el)) continue;
        const s = getComputedStyle(c);
        others +=
          c.getBoundingClientRect().height +
          (parseFloat(s.marginTop) || 0) +
          (parseFloat(s.marginBottom) || 0);
      }
      // rezerva na zaokrouhlení, mezery mezi potomky plátna a okraj kresby
      setRoom(Math.max(0, Math.floor(canvas.clientHeight - pad - others - 16)));
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    for (const c of canvas.children) if (c !== el) ro.observe(c);
    return () => ro.disconnect();
  }, [canvas, ref]);
  return room;
}
