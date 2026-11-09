/**
 * Přehrávač stránky toků v režimu „Upravit graf“ (F-08): stojí na kroku 1 živě přepočítaného běhu upravené
 * sítě – kresby vedle sítě ukazují, co ukáže krok 1 nového běhu. Nic ho neposune ani nespustí (▶, mezerník,
 * šipky, Krok vpřed, posuvník); rychlost jde měnit. Po „Hotovo“ stránka předá zase skutečný přehrávač
 * (nový běh na kroku 1, pozastaveno).
 */
import type { Player } from "../../core/usePlayer";

const noop = () => {};

export function frozenPlayer<S>(p: Player<S>): Player<S> {
  return {
    ...p,
    index: 0,
    current: p.steps[0] ?? null,
    playing: false,
    atStart: true,
    // konec běhu by Visualizer ukázal jako „Dokončeno“ – v editoru se nic nedokončilo
    atEnd: p.steps.length <= 1,
    play: noop,
    pause: noop,
    toggle: noop,
    next: noop,
    prev: noop,
    first: noop,
    last: noop,
    seek: noop,
    motion: undefined,
  };
}
