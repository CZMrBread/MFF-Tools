/**
 * Jednotné API plynulých přechodů mezi kroky pro pohledy (views/*).
 *
 * Visualizer spočítá délku přechodu (core/motion.ts: `stepTransitionMs` z druhu posunu přehrávače,
 * rychlosti a „omezit pohyb“) a předá ji dvěma cestami:
 *   1. CSS proměnné na `.viz-canvas`: `--algo-step-ms` (přesuny, objevení a odchod prvků) a
 *      `--algo-step-color-ms` (přelévání barev) – stačí pro pohledy, které kreslí polohy přes
 *      `transform` a barvy třídami (sloupce, krabičky, ukazatele, vrcholy a hrany grafů, buňky tabulek);
 *   2. kontext `StepTransitionContext` pro JS interpolaci (`useTween` – stromy, kde hrany musí jet
 *      s vrcholy) a pro `useLeaving` (odcházející prvky se ještě chvíli kreslí s třídou `leaving`).
 * Mimo Visualizer (samostatné testy pohledů) kontext chybí a pohledy použijí své výchozí délky.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { leavingEntries } from "./motion";

/** délka přechodu aktuálního kroku v ms; null = mimo Visualizer */
export const StepTransitionContext = createContext<number | null>(null);

/** Délka přechodu aktuálního kroku (ms) z Visualizeru, nebo `fallback` mimo něj. */
export function useStepMs(fallback: number): number {
  return useContext(StepTransitionContext) ?? fallback;
}

export const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";

function reducedMotionQuery(): MediaQueryList | null {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_MEDIA)
    : null;
}

/** Chce uživatel omezit pohyb (nastavení systému)? Jednorázové čtení – mimo React (posuny, rAF). */
export function prefersReducedMotion(): boolean {
  return reducedMotionQuery()?.matches ?? false;
}

/** Chce uživatel omezit pohyb (nastavení systému)? Sleduje i změnu za běhu. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = reducedMotionQuery();
      mq?.addEventListener?.("change", onChange);
      return () => mq?.removeEventListener?.("change", onChange);
    },
    () => reducedMotionQuery()?.matches ?? false,
    () => false,
  );
}

interface LeavingTrack<K, T> {
  sig: string;
  map: ReadonlyMap<K, T>;
  leaving: [K, T][];
  gen: number;
}

/**
 * Prvky, které z kresby právě zmizely: pohled je ještě `ms` milisekund kreslí (s třídou `leaving`,
 * CSS je nechá vyblednout) a pak je zahodí. Při `ms` = 0 (skok, omezit pohyb) zmizí hned.
 * `current` = co se kreslí teď (klíč → data pro kresbu, např. poloha a popisek); `sig` = podpis kresby –
 * když se nezmění, nic se nepočítá (výchozí podpis = seznam klíčů).
 */
export function useLeaving<K extends string | number, T>(
  current: ReadonlyMap<K, T>,
  ms: number,
  sig: string = [...current.keys()].join("|"),
): [K, T][] {
  const [track, setTrack] = useState<LeavingTrack<K, T>>(() => ({
    sig,
    map: current,
    leaving: [],
    gen: 0,
  }));
  let shown = track;
  if (track.sig !== sig) {
    // nová kresba: co z předchozí chybí, odchází (dřívější odcházející, které se nevrátily, dál)
    const leaving =
      ms > 0
        ? [
            ...track.leaving.filter(([k]) => !current.has(k)),
            ...leavingEntries(track.map, current),
          ]
        : [];
    shown = { sig, map: current, leaving, gen: track.gen + 1 };
    setTrack(shown);
  }

  const { gen, leaving } = shown;
  const pending = leaving.length > 0;
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(
      () =>
        setTrack((cur) => (cur.gen === gen ? { ...cur, leaving: [] } : cur)),
      ms,
    );
    return () => clearTimeout(t);
  }, [gen, pending, ms]);

  return ms > 0 ? leaving : [];
}
