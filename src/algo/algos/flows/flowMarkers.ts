/** Třídy hran toků s vlastní barvou šipky (GraphView `markers`; barvy v oddílu CSS „flows“). Ve vlastním
 * souboru, aby ho náhledy úvodní stránky mohly importovat bez logiky toků. */
export const FLOW_MARKERS = [
  "e-flow",
  "e-sat",
  "e-path",
  "e-path-back",
  "e-changed",
  "e-cut",
  "e-match",
  "e-zero",
  "e-r-live",
  "e-r-gray",
  "e-r-dead",
  "e-r-sat",
] as const;
