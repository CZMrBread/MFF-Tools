import { createContext } from "react";

/**
 * Zdroj aktuálního modulu jedním řádkem („Průvodce 9.5, str. 230 · DS I, přednáška 2“, viz formatSource
 * v registry.ts). Dodává ho App.tsx podle cesty, Visualizer ho ukáže u nadpisu; mimo App prázdný.
 */
export const ModuleSourceContext = createContext("");
