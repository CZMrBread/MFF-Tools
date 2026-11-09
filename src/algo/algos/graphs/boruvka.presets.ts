/**
 * Předvolby grafů pro Borůvkův algoritmus (stopa graphsA, fáze 4). Obr. 7.5 je týž graf jako obr. 7.2
 * (předvolba `mst3` v presets.ts); tady jen vlastní příklad ke cvičení 7.3.1 (stejné váhy). presets.ts je
 * připojí na konec PRESETS (nabídka „Vytvořit“ všech grafových algoritmů).
 */
import { text, type GraphPreset } from "./presetKit";

export const boruvkaPresets: GraphPreset[] = [
  // bez pravidla pro shodné váhy by si a vybral ab, b bc a c ca → kružnice (cvičení 7.3.1)
  text(
    "equal-triangle",
    "Trojúhelník se stejnými vahami (cv. 7.3.1)",
    false,
    true,
    "a b 1\nb c 1\nc a 1",
    ["jarnik", "boruvka", "kruskal"],
  ),
];
