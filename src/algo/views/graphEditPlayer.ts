/**
 * Přehrávač zmrazený po dobu úprav grafu („Upravit graf“, G-04): ukazuje krok 1 nového běhu (kroky se
 * z upravovaného grafu počítají živě), ale nic ho neposune – mezerník, ▶, šipky, Home/End ani posuvník.
 * Lišta přehrávání vypadá jako před spuštěním („připraveno“, ▶ zakázané), protože vidí jen jeden krok.
 * „Hotovo“ pak připraví nový běh (nová sada kroků → krok 1, pozastaveno).
 *
 * Stejný přístup pro stránky toků (flowPage, GoldbergPage):
 *   const shown = useMemo(() => (mode === "edit" ? frozenPlayer(player) : player), [mode, player]);
 *   <Visualizer player={shown} …>
 */
import type { Player } from "../core/usePlayer";

const noop = () => {};

export function frozenPlayer<S>(player: Player<S>): Player<S> {
  return {
    ...player,
    steps: player.steps.slice(0, 1),
    index: 0,
    current: player.steps[0] ?? null,
    playing: false,
    play: noop,
    pause: noop,
    toggle: noop,
    next: noop,
    prev: noop,
    first: noop,
    last: noop,
    seek: noop,
    atStart: true,
    atEnd: true,
    motion: undefined,
  };
}
