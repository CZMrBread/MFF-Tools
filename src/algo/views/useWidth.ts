import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Šířka, se kterou se kreslí, dokud není změřeno (SSR, testy, první render před layout efektem). */
export const FALLBACK_WIDTH = 900;

/**
 * Šířka plátna v CSS px: nejméně `min` (pod ní se plátno vodorovně posouvá), nejvýše `max`.
 * Nekonečná, záporná nebo nulová naměřená šířka (skrytý prvek) znamená „nevím“ → `min`.
 */
export function fitWidth(
  measured: number,
  min: number,
  max = Infinity,
): number {
  const m = Number.isFinite(measured) && measured > 0 ? measured : min;
  return Math.round(Math.max(min, Math.min(max, m)));
}

/** Šířka obsahu prvku bez paddingu a posuvníku. */
function contentWidth(el: HTMLElement): number {
  const cs =
    typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
  const pad = cs
    ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
    : 0;
  return Math.floor(el.clientWidth - pad);
}

/**
 * Změří šířku obalového prvku (ResizeObserver; bez něj aspoň při změně velikosti okna).
 * Pohledy pak kreslí 1 jednotku viewBoxu = 1 CSS px, takže písmo má skutečnou velikost i na telefonu.
 * Obal musí mít šířku danou rodičem (blok), ne obsahem – jinak by se měření zacyklilo na obsahu.
 */
export function useWidth<T extends HTMLElement = HTMLDivElement>(
  fallback = FALLBACK_WIDTH,
): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = contentWidth(el);
      // skrytý prvek (display: none) má 0 → nechat poslední známou šířku
      if (w > 0) setWidth((old) => (Math.abs(old - w) < 1 ? old : w));
    };
    measure();
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => measure());
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return [ref, width];
}
