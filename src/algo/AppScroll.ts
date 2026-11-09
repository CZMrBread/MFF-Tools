/** Posun levé lišty k aktivnímu modulu (App.tsx) – čistá funkce, testy v sidebar.dom.test.tsx. */

/**
 * Kam posunout posuvný kontejner (scrollTop), aby položka byla vidět: null = už je vidět (s okrajem
 * `margin`), jinak poloha, při které je položka uprostřed. Obdélníky jsou vůči oknu (getBoundingClientRect).
 */
export function revealTop(
  view: { top: number; height: number; scrollTop: number },
  item: { top: number; height: number },
  margin = 8,
): number | null {
  if (
    item.top >= view.top + margin &&
    item.top + item.height <= view.top + view.height - margin
  )
    return null;
  const rel = item.top - view.top + view.scrollTop;
  return Math.max(0, rel - (view.height - item.height) / 2);
}
