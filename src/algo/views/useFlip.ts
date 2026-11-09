import { useLayoutEffect, useRef, type RefObject } from "react";
import { posKey, type Positions } from "./useTween";

const FLIP_ID = "algo-flip";

/**
 * Přesun prvků kresby (sloupce pole, krabičky) technikou FLIP přes Web Animations API.
 *
 * Prvky nesou `data-flip={id}` a výslednou polohu v inline `transform` (`translate(x px, y px)` nebo
 * `translateX`). Po každém vykreslení se prvek, jehož cíl se změnil, rozjede z předchozí polohy
 * (nebo z okamžité, když ještě jede) do nové – `el.animate`, běží v kompozitoru, žádný setState po
 * snímcích ani u n = 50. CSS přechod transformace by nestačil: React při prohození přesune uzel
 * v DOM a prohlížeč pak přechod zruší (druhý z prohozených sloupců by skočil). Pořadí v DOM (a tím
 * tabulátoru) tak smí zůstat podle indexu.
 *
 * `ms` = délka z Visualizeru (core/stepTransition.ts): 0 = skok posuvníkem, Home/End, omezit pohyb,
 * mimo Visualizer → bez animace (a běžící přesun se ukončí v cíli). Změna `resetKey` (šířka plátna)
 * se neanimuje. Bez `Element.animate` (jsdom, staré prohlížeče) prvky stojí rovnou v cíli.
 */
export function useFlip(
  root: RefObject<Element | null>,
  targets: Positions,
  ms: number,
  resetKey?: string | number,
): void {
  const key = posKey(targets);
  const targetsRef = useRef(targets);
  const prev = useRef<Positions | null>(null);
  const seenReset = useRef(resetKey);
  useLayoutEffect(() => {
    targetsRef.current = targets;
  });

  useLayoutEffect(() => {
    const to = targetsRef.current;
    const from = prev.current;
    prev.current = to;
    const relayout = seenReset.current !== resetKey;
    seenReset.current = resetKey;
    const el = root.current;
    if (!el || !from) return;
    const canAnimate =
      ms > 0 && !relayout && typeof Element.prototype.animate === "function";
    for (const node of el.querySelectorAll<SVGElement | HTMLElement>(
      "[data-flip]",
    )) {
      const id = Number(node.dataset.flip);
      const running =
        typeof node.getAnimations === "function"
          ? node.getAnimations().filter((a) => a.id === FLIP_ID)
          : [];
      const b = to.get(id);
      let a = from.get(id);
      if (running.length) {
        // ještě jede předchozí přesun → navázat z okamžité polohy
        if (canAnimate && typeof DOMMatrix === "function") {
          const t = getComputedStyle(node).transform;
          const m = new DOMMatrix(t && t !== "none" ? t : undefined);
          a = { x: m.e, y: m.f };
        }
        for (const r of running) r.cancel();
      }
      if (!canAnimate || !a || !b || (a.x === b.x && a.y === b.y)) continue;
      const anim = node.animate(
        [
          { transform: `translate(${a.x}px, ${a.y}px)` },
          { transform: `translate(${b.x}px, ${b.y}px)` },
        ],
        { duration: ms, easing: "ease" },
      );
      anim.id = FLIP_ID;
    }
  }, [key, ms, resetKey, root]);
}

/**
 * Změna rozložení kresby (výška z canvasFit, šířka okna) není krok: na dva snímky dá prvku `root`
 * třídu `relayout`, pod kterou CSS vypne přechody výšky sloupců (`.array-svg.relayout .bar rect`) –
 * sloupce stojí rovnou v nové výšce. Další krok už se zase animuje. První vykreslení nic nedělá.
 */
export function useRelayoutFreeze(
  root: RefObject<Element | null>,
  layoutKey: string,
): void {
  const seen = useRef(layoutKey);
  useLayoutEffect(() => {
    if (seen.current === layoutKey) return;
    seen.current = layoutKey;
    const el = root.current;
    if (!el) return;
    el.classList.add("relayout");
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 16);
    const cancel =
      typeof cancelAnimationFrame === "function"
        ? cancelAnimationFrame
        : window.clearTimeout;
    let second = 0;
    const first = raf(() => {
      second = raf(() => el.classList.remove("relayout"));
    });
    return () => {
      cancel(first);
      cancel(second);
      el.classList.remove("relayout");
    };
  }, [layoutKey, root]);
}
