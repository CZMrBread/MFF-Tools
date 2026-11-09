/**
 * Předvolby grafů pro Bellmanův–Fordův algoritmus (stopa graphsA, fáze 4). Oddíl 6.3 Průvodce malý graf
 * nemá, proto jsou to vlastní příklady (jen text hran, silové rozložení): záporná hrana, kvůli které se
 * vrchol otevře podruhé, a záporný cyklus (cvičení 6.3.2). presets.ts je připojí na konec PRESETS
 * (nabídka „Vytvořit“ všech grafových algoritmů).
 */
import { text, type GraphPreset } from "./presetKit";

export const bellmanFordPresets: GraphPreset[] = [
  // h = s 0, a −1, b 2, c 1; a i c se uzavřou dvakrát (Dijkstra by a už nezměnil)
  text(
    "negative",
    "Orientovaný graf se zápornou délkou hrany",
    true,
    true,
    "s a 4\ns b 2\nb a -3\na c 2\nb c 5",
    ["bellman-ford"],
  ),
  // cyklus a → b → c → a má délku 2 − 4 + 1 = −1
  text(
    "negative-cycle",
    "Orientovaný graf se záporným cyklem",
    true,
    true,
    "s a 1\na b 2\nb c -4\nc a 1\nc d 3",
    ["bellman-ford"],
  ),
];
