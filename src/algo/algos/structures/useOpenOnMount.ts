import { useEffect } from "react";
import type { ActionMenuControl } from "../../core/useActionMenu";

/**
 * Po otevření stránky rozbalí hlavní akci (Push(x), Insert(x), Min⟨i, j⟩…) s předvyplněným argumentem:
 * nejčastější operace je pak na jeden klik na Provést (nebo Enter v poli), jako dřív tlačítko vedle pole.
 * Fokus se nepřesouvá (stránka nesmí po načtení skákat ani brát klávesy přehrávači).
 */
export function useOpenOnMount(menu: ActionMenuControl, id: string): void {
  const { dispatch } = menu;
  useEffect(() => {
    dispatch({ type: "open", id });
    // jen při připojení – pozdější volby uživatele se nepřepisují
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);
}
