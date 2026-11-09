/**
 * Stavový automat přehrávače – čisté funkce bez Reactu (testy v player.test.ts).
 * Hook usePlayer je jen tenká obálka: drží stav, časovač a rychlost.
 */

import { safeLocalStorage } from "./storage";

export interface Speed {
  label: string;
  /** prodleva mezi kroky v ms */
  ms: number;
}

export const SPEEDS: readonly Speed[] = [
  { label: "0,25×", ms: 2000 },
  { label: "0,5×", ms: 1000 },
  { label: "1×", ms: 500 },
  { label: "2×", ms: 250 },
  { label: "4×", ms: 120 },
  { label: "8×", ms: 50 },
];

export const DEFAULT_DELAY = 500;

/** Index rychlosti v SPEEDS nejbližší dané prodlevě (pro posuvník). */
export function speedIndex(delay: number): number {
  let best = 0;
  SPEEDS.forEach((s, i) => {
    if (Math.abs(s.ms - delay) < Math.abs(SPEEDS[best].ms - delay)) best = i;
  });
  return best;
}

/** Prodleva o jednu rychlost rychleji (dir = 1, klávesa +) nebo pomaleji (dir = −1, klávesa −); na krajích zůstane. */
export function stepDelay(delay: number, dir: 1 | -1): number {
  const i = Math.max(0, Math.min(SPEEDS.length - 1, speedIndex(delay) + dir));
  return SPEEDS[i].ms;
}

/* ---------- zapamatovaná rychlost ---------- */

export const SPEED_KEY = "algo-speed";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

// přístup k localStorage může sám vyhodit výjimku (zakázané cookies) → null
const storage = safeLocalStorage;

/** Uložená rychlost, pokud je to jedna z hodnot SPEEDS; jinak `fallback`. */
export function readStoredDelay(
  fallback = DEFAULT_DELAY,
  store: StorageLike | null = storage(),
): number {
  try {
    const raw = store?.getItem(SPEED_KEY);
    const ms = raw == null ? NaN : Number(raw);
    return SPEEDS.some((s) => s.ms === ms) ? ms : fallback;
  } catch {
    return fallback;
  }
}

export function storeDelay(
  ms: number,
  store: StorageLike | null = storage(),
): void {
  try {
    store?.setItem(SPEED_KEY, String(ms));
  } catch {
    /* soukromé okno apod. */
  }
}

/* ---------- stav a přechody ---------- */

export interface PlayerState {
  index: number;
  playing: boolean;
}

export type PlayerAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "first" }
  | { type: "last" }
  | { type: "seek"; index: number }
  /** uplynula prodleva při přehrávání */
  | { type: "tick" };

/** Výchozí stav: krok 0, pozastaveno. Přehrávání se nikdy nespouští samo – jen ▶ / mezerník (akce „play“). */
export function initialPlayerState(): PlayerState {
  return { index: 0, playing: false };
}

const clamp = (i: number, n: number) =>
  Math.max(0, Math.min(Number.isFinite(i) ? Math.trunc(i) : 0, n - 1));

function to(st: PlayerState, index: number, playing: boolean): PlayerState {
  return st.index === index && st.playing === playing ? st : { index, playing };
}

/** Přechod automatu; `n` je počet kroků. Když se nic nemění, vrací tentýž objekt. */
export function playerReducer(
  st: PlayerState,
  action: PlayerAction,
  n: number,
): PlayerState {
  const index = clamp(st.index, n);
  const atEnd = index >= n - 1;
  switch (action.type) {
    case "play":
      // není co přehrát → zůstat stát; na konci začít znovu od začátku
      return n > 1 ? to(st, atEnd ? 0 : index, true) : to(st, index, false);
    case "pause":
      return to(st, index, false);
    case "toggle":
      return playerReducer(st, { type: st.playing ? "pause" : "play" }, n);
    case "next":
      return to(st, clamp(index + 1, n), false);
    case "prev":
      return to(st, clamp(index - 1, n), false);
    case "first":
      return to(st, 0, false);
    case "last":
      return to(st, clamp(n - 1, n), false);
    case "seek":
      return to(st, clamp(action.index, n), false);
    case "tick": {
      if (!st.playing) return to(st, index, false);
      const next = clamp(index + 1, n);
      // poslední krok přehrávání zastaví
      return to(st, next, next < n - 1);
    }
  }
}

/* ---------- navázání na sadu kroků ---------- */

/** Stav přehrávače spolu se sadou kroků, ke které patří. */
export interface TrackedPlayer<T> extends PlayerState {
  steps: T;
}

export function trackPlayer<T>(steps: T): TrackedPlayer<T> {
  return { steps, ...initialPlayerState() };
}

/**
 * Patří stav k jiné sadě kroků (nové pole = nová operace, nový vstup, jiný algoritmus…), začíná se
 * od kroku 0 a pozastaveno – simulaci rozběhne až uživatel (▶ / mezerník).
 */
export function syncPlayer<T>(
  prev: TrackedPlayer<T>,
  steps: T,
): TrackedPlayer<T> {
  return prev.steps === steps ? prev : trackPlayer(steps);
}
