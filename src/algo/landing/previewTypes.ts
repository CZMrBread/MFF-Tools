/**
 * Typ náhledu karty úvodní stránky a rozměry kresby. Ve vlastním souboru, aby soubory náhledů vedle
 * stránek modulů (např. `algos/strings/kmp.preview.tsx`) nemusely importovat registr `previews.tsx`
 * (ten je naopak importuje – kruhová závislost).
 */
import type { ReactElement } from "react";

/** Šířka, se kterou se pohledy kreslí (viewBox); CSS náhledu SVG zmenší do karty se zachovaným poměrem. */
export const THUMB_W = 360;
export const THUMB_H = 200;

export interface Preview {
  render: () => ReactElement;
  /** HTML pohled (tabulka, řádky) – zmenší se zoomem, ne přes viewBox */
  html?: boolean;
}
