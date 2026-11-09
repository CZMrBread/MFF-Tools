/**
 * Výška kresby grafu na desktopu na jednu obrazovku (GRAPH-03): SVG se kreslí 1 : 1 (písmo vrcholů 13 px,
 * ceny 11 px) ve výšce, která v plátně zbývá pod vším, co leží nad kresbou (hláška, lišta editoru), a nad
 * tím, co je pod ní (Import / export textem). CSS ho pak nemusí zmenšovat i s písmem.
 *
 * Plátno dává Visualizer přes CanvasFitContext jen v režimu jedné obrazovky; jinde (telefon, testy) hook
 * vrací null a stránka použije pevnou výšku.
 */
import { useContext, useEffect, useState, type RefObject } from "react";
import { CanvasFitContext } from "../core/canvasFit";

/** Výška pro kresbu: zbývající místo v mezích [min, max]; pod 2 px změny se nemění (žádné kmitání). */
export function fitGraphHeight(
  avail: number,
  min: number,
  max: number,
  old: number | null,
): number {
  const h = Math.floor(Math.max(min, Math.min(max, avail)));
  return old !== null && Math.abs(old - h) < 2 ? old : h;
}

const px = (v: string) => parseFloat(v) || 0;

/**
 * Kolik px v plátně zbývá pro prvek `el` (od jeho horního okraje dolů, bez sourozenců pod ním). Počítají
 * se jen sourozenci, kteří leží opravdu pod prvkem – panel vedle v gridu (Import / export textem vpravo
 * od kresby) výšku nebere (G-02).
 */
export function availableFor(el: HTMLElement, canvas: HTMLElement): number {
  const cs = getComputedStyle(canvas);
  const cr = canvas.getBoundingClientRect();
  const innerBottom =
    cr.top + canvas.clientTop + canvas.clientHeight - px(cs.paddingBottom);
  let below = 0;
  for (let node: HTMLElement = el; node !== canvas;) {
    const parent = node.parentElement;
    if (!parent) break;
    const ps = getComputedStyle(parent);
    const row =
      ps.display.includes("flex") && ps.flexDirection.startsWith("row");
    if (!row) {
      const bottom = node.getBoundingClientRect().bottom;
      for (
        let s = node.nextElementSibling as HTMLElement | null;
        s;
        s = s.nextElementSibling as HTMLElement | null
      ) {
        const r = s.getBoundingClientRect();
        if (r.height === 0 && r.width === 0) continue;
        // vedle (grid, absolutní překryv), ne pod
        if (r.top < bottom - 1) continue;
        const ss = getComputedStyle(s);
        below +=
          r.height + px(ss.marginTop) + px(ss.marginBottom) + px(ps.rowGap);
      }
    }
    // spodní okraj a padding obalů mezi prvkem a plátnem
    if (parent !== canvas)
      below += px(ps.paddingBottom) + px(ps.borderBottomWidth);
    node = parent;
  }
  return innerBottom - el.getBoundingClientRect().top - below;
}

/**
 * Výška kresby podle volného místa v plátně (režim jedné obrazovky), jinak null. `min`/`max` = meze
 * (knižní kresba se smí zvětšit jen o kus, viz GraphView).
 */
export function useGraphFitHeight(
  wrapRef: RefObject<HTMLElement | null>,
  min: number,
  max: number,
): number | null {
  const canvas = useContext(CanvasFitContext);
  const [h, setH] = useState<number | null>(null);

  // měří se v odezvě na změnu velikosti plátna a obalů mezi kresbou a plátnem (nová hláška nad kresbou
  // je zmenší) – setState jen v callbacku; změna < 2 px se ignoruje, takže se nekmitá
  useEffect(() => {
    const el = wrapRef.current;
    if (!canvas || !el) return;
    const measure = () =>
      setH((old) => fitGraphHeight(availableFor(el, canvas), min, max, old));
    const frame = requestAnimationFrame(measure);
    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", measure);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", measure);
      };
    }
    const ro = new ResizeObserver(measure);
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      ro.observe(n);
      // sourozenci nad kresbou (lišta editoru, hláška) – jejich změna posune kresbu
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling)
        ro.observe(s);
      if (n === canvas) break;
    }
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [canvas, wrapRef, min, max]);

  return canvas ? h : null;
}
