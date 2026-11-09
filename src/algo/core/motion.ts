/**
 * Plynulé přechody mezi kroky – čisté funkce (testy v motion.test.ts).
 *
 * Přehrávač si pamatuje, *jak* se dostal na aktuální krok (`StepMotion`): přehráváním (tick), ručním
 * krokem (Další/Zpět, ←/→) nebo skokem (posuvník, Home/End, nová sada kroků). Visualizer z toho a z
 * rychlosti spočítá délku přechodu (`stepTransitionMs`) a předá ji pohledům:
 *   - CSS proměnnou `--algo-step-ms` / `--algo-step-color-ms` na `.viz-canvas` (přesuny sloupců,
 *     krabiček, barvy vrcholů a hran, objevení a odchod prvků),
 *   - kontextem `StepTransitionContext` pro JS interpolaci (`useTween` – stromy, kde hrany navazují).
 * Skok a „omezit pohyb“ = 0 ms (okamžitě). Přechody nikdy nespouštějí přehrávání – jen čtou jeho stav.
 */
import type { PlayerAction } from "./player";

export type StepMotion = "play" | "step" | "jump";

/** krátký přechod ručního kroku (Další/Zpět) – nezávisí na rychlosti přehrávání */
export const MANUAL_MS = 200;
/** nejdelší přechod při přehrávání (pomalé rychlosti) */
export const MAX_STEP_MS = 600;
/** podíl intervalu mezi kroky, který zabere přechod – zbytek je klid, aby šel krok přečíst */
const PLAY_SHARE = 0.6;
/** kratší přechod než ~2 snímky nemá smysl (jen by zatěžoval) → okamžitě */
const MIN_MS = 40;
/** barvy se mění nejvýš takhle dlouho – delší přelévání působí líně (výběr, zvýraznění) */
const MAX_COLOR_MS = 250;

/**
 * Druh posunu po akci přehrávače. Když se krok nezměnil (pauza, ▶ uprostřed), zůstává předchozí
 * druh – běžící přechod se tak neutne ani nezrychlí.
 */
export function motionOf(
  action: PlayerAction["type"],
  fromIndex: number,
  toIndex: number,
  previous: StepMotion | undefined,
): StepMotion | undefined {
  if (fromIndex === toIndex) return previous;
  if (action === "tick") return "play";
  if (action === "next" || action === "prev") return "step";
  return "jump";
}

/** Délka přechodu v ms pro daný druh posunu, prodlevu přehrávače (ms) a „omezit pohyb“. */
export function stepTransitionMs(
  motion: StepMotion | undefined,
  delay: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion || motion === undefined || motion === "jump") return 0;
  if (motion === "step") return MANUAL_MS;
  if (!Number.isFinite(delay) || delay <= 0) return 0;
  const ms = Math.min(MAX_STEP_MS, Math.round(delay * PLAY_SHARE));
  return ms < MIN_MS ? 0 : ms;
}

/** Délka přelévání barev (výplň a obrys vrcholů, hran, krabiček) k dané délce přechodu. */
export function colorTransitionMs(stepMs: number): number {
  return Math.max(0, Math.min(stepMs, MAX_COLOR_MS));
}

/** Položky předchozí kresby, které v nové chybí (odcházející prvky), v původním pořadí. */
export function leavingEntries<K, T>(
  prev: ReadonlyMap<K, T>,
  next: ReadonlyMap<K, T>,
): [K, T][] {
  const out: [K, T][] = [];
  for (const [k, v] of prev) if (!next.has(k)) out.push([k, v]);
  return out;
}
