import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_DELAY,
  playerReducer,
  readStoredDelay,
  storeDelay,
  syncPlayer,
  trackPlayer,
  type PlayerAction,
  type TrackedPlayer,
} from "./player";
import { motionOf, type StepMotion } from "./motion";
import type { Step } from "./steps";

export interface Player<S> {
  steps: Step<S>[];
  index: number;
  current: Step<S> | null;
  playing: boolean;
  /** ms mezi kroky */
  delay: number;
  setDelay: (ms: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  first: () => void;
  last: () => void;
  seek: (i: number) => void;
  atStart: boolean;
  atEnd: boolean;
  /**
   * Jak se přehrávač dostal na aktuální krok (přehráváním / ručním krokem / skokem; undefined = nová
   * sada kroků) – Visualizer z toho odvodí délku přechodu (core/motion.ts).
   */
  motion?: StepMotion;
}

type Stored<S> = TrackedPlayer<Step<S>[]> & { motion?: StepMotion };

export interface PlayerOptions {
  /** prodleva mezi kroky v ms, dokud si uživatel sám nezvolí rychlost (ta se pamatuje v localStorage) */
  initialDelay?: number;
}

/**
 * Přehrává sadu kroků. `steps` musí mít stabilní identitu (stav nebo useMemo) – nové pole znamená novou
 * sadu kroků a návrat na krok 0, pozastaveno (přehrávání se samo nikdy nespouští). Druhý parametr je buď výchozí prodleva v ms, nebo PlayerOptions.
 */
export function usePlayer<S>(
  steps: Step<S>[],
  options: number | PlayerOptions = {},
): Player<S> {
  const { initialDelay = DEFAULT_DELAY }: PlayerOptions =
    typeof options === "number" ? { initialDelay: options } : options;

  const [stored, setStored] = useState<Stored<S>>(() => trackPlayer(steps));
  const [delay, setDelayState] = useState(() => readStoredDelay(initialDelay));

  // Nová sada kroků → stav se odvodí hned při renderu (žádný commit se starým indexem, žádný setState v efektu).
  // Do `stored` se propíše až s první akcí.
  const st: Stored<S> = syncPlayer(stored, steps);
  const { index, playing, motion } = st;
  const n = steps.length;

  const dispatch = useCallback(
    (action: PlayerAction) =>
      setStored((prev) => {
        const base: Stored<S> = syncPlayer(prev, steps);
        const next = playerReducer(base, action, steps.length);
        if (next === base) return base;
        const motion = motionOf(
          action.type,
          base.index,
          next.index,
          base.motion,
        );
        return { ...base, ...next, motion };
      }),
    [steps],
  );

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => dispatch({ type: "tick" }), delay);
    return () => clearTimeout(t);
  }, [playing, index, delay, dispatch]);

  const setDelay = useCallback((ms: number) => {
    setDelayState(ms);
    storeDelay(ms);
  }, []);

  return useMemo<Player<S>>(
    () => ({
      steps,
      index,
      current: steps[index] ?? null,
      playing,
      delay,
      setDelay,
      play: () => dispatch({ type: "play" }),
      pause: () => dispatch({ type: "pause" }),
      toggle: () => dispatch({ type: "toggle" }),
      next: () => dispatch({ type: "next" }),
      prev: () => dispatch({ type: "prev" }),
      first: () => dispatch({ type: "first" }),
      last: () => dispatch({ type: "last" }),
      seek: (i) => dispatch({ type: "seek", index: i }),
      atStart: index <= 0,
      atEnd: index >= n - 1,
      motion,
    }),
    [steps, index, playing, delay, setDelay, dispatch, n, motion],
  );
}
