import { useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion, useStepMs } from "../core/stepTransition";

export interface Pt {
  x: number;
  y: number;
}
export type Positions = Map<number, Pt>;

/** Délka přesunu vrcholů (ms), pokud stránka nepředá vlastní. */
export const MOVE_MS = 350;

/** Klíč polohy všech prvků – změna klíče spustí animaci. */
export function posKey(p: Positions): string {
  let s = "";
  for (const [id, { x, y }] of p) s += `${id}:${x.toFixed(1)},${y.toFixed(1)};`;
  return s;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Mezipoloha v čase t ∈ [0, 1]. Prvky, které ve `from` nejsou (nově vložené), stojí rovnou v cíli;
 * prvky, které v cíli nejsou (smazané), se nekreslí.
 */
export function interpolate(
  from: Positions,
  to: Positions,
  t: number,
): Positions {
  const e = ease(Math.max(0, Math.min(1, t)));
  const out: Positions = new Map();
  for (const [id, b] of to) {
    const a = from.get(id) ?? b;
    out.set(id, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
  }
  return out;
}

/**
 * Plynulý přesun vrcholů i hran zároveň (JS interpolace místo CSS přechodu na transformaci): hrana se kreslí
 * z týchž mezipoloh jako vrcholy, takže při rotacích a dělení na ně navazuje i při rychlém přehrávání.
 * Bez requestAnimationFrame (SSR, testy) nebo s „omezit pohyb“ vrací rovnou cíl.
 * `resetKey` (např. šířka plátna): když se změní, vrcholy skočí rovnou do cíle – nové rozložení po změření
 * nebo změně šířky není operace a nemá se při každém otevření stránky „rozjíždět“.
 * `msOverride` chybí → délka z Visualizeru (skok posuvníkem = 0, ruční krok krátce, přehrávání podle
 * rychlosti); mimo Visualizer MOVE_MS.
 */
export function useTween(
  target: Positions,
  msOverride?: number,
  resetKey?: string | number,
): Positions {
  const fromPlayer = useStepMs(MOVE_MS);
  const ms = msOverride ?? fromPlayer;
  const key = posKey(target);
  const seenReset = useRef(resetKey);
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const targetRef = useRef(target);
  useLayoutEffect(() => {
    targetRef.current = target;
  });

  useLayoutEffect(() => {
    const to = targetRef.current;
    const from = shownRef.current;
    const jump = () => {
      shownRef.current = to;
      setShown(to);
    };
    const relayout = seenReset.current !== resetKey;
    seenReset.current = resetKey;
    if (posKey(from) === key) return;
    if (
      relayout ||
      ms <= 0 ||
      typeof requestAnimationFrame !== "function" ||
      prefersReducedMotion()
    ) {
      jump();
      return;
    }
    const frame = { id: 0 };
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / ms;
      if (t >= 1) {
        jump();
        return;
      }
      const cur = interpolate(from, to, t);
      shownRef.current = cur;
      setShown(cur);
      frame.id = requestAnimationFrame(tick);
    };
    frame.id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.id);
  }, [key, ms, resetKey]);

  // Před spuštěním animace (první render s novým cílem) kreslíme dosavadní polohy, nové prvky rovnou v cíli.
  // Prvky, které z cíle zmizely, vynecháme.
  const out: Positions = new Map();
  for (const [id, p] of target) out.set(id, shown.get(id) ?? p);
  return out;
}
