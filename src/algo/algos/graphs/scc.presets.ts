/**
 * Předvolby grafů pro silně souvislé komponenty (stopa graphsB, fáze 4). Pomůcky book() / text() z presetKit.ts; presets.ts
 * je připojí na konec PRESETS (v nabídce „Příklady z knihy“ / „Vytvořit“ všech grafových algoritmů).
 * Knižní obr. 5.13 je předvolba `scc` v presets.ts; tady vlastní příklad na to, co obrázek neukáže.
 */
import { text, type GraphPreset } from "./presetKit";

export const sccPresets: GraphPreset[] = [
  // příčná hrana d→c do komponenty, která ještě není odebraná (esc ji započítá), a příčná hrana d→g do
  // už odebrané komponenty {f, g} (esc ji ignoruje) – Průvodce 5.10, lemmata na str. 136
  text(
    "scc-cross",
    "Příčné hrany v Tarjanově algoritmu",
    true,
    false,
    "a b\nb c\nc a\nc f\nf g\ng f\nb d\nd c\nd g",
    ["scc"],
  ),
];
