/**
 * Předvolby grafů pro mosty a artikulace (stopa graphsB, fáze 4). Pomůcky book() / text() z presetKit.ts; presets.ts
 * je připojí na konec PRESETS (v nabídce „Příklady z knihy“ / „Vytvořit“ všech grafových algoritmů).
 * Knižní obr. 5.10 je předvolba `bridges` v presets.ts; tady vlastní příklad na to, co obrázek neukáže.
 */
import { text, type GraphPreset } from "./presetKit";

export const bridgesPresets: GraphPreset[] = [
  // kořen DFS stromu se dvěma syny je artikulace (str. 126) a nesouvislý graf (Mosty2 z každé komponenty)
  text(
    "bridges-root",
    "Kořen jako artikulace (nesouvislý)",
    false,
    false,
    "1 2\n2 3\n3 1\n1 4\n4 5\n6 7",
    ["bridges"],
  ),
];
