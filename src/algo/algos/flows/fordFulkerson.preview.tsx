/**
 * Náhled Fordova–Fulkersonova algoritmu na úvodní stránce: obr. 14.5 – síť z obr. 14.2 s maximálním tokem 18
 * (f/c) a minimálním řezem A = {z, a, b, c}, jak ho modul ukáže na konci výchozího příkladu (BFS). Kreslí
 * se z dat knihy (flowPreviewData.ts), logika toků zůstává v líném chunku; neimportuje FordFulkersonPage.
 */
import { THUMB_H, THUMB_W, type Preview } from "../../landing/previewTypes";
import { GraphView } from "../../views/GraphView";
import { FLOW_MARKERS } from "./flowMarkers";
import { ffPreviewData } from "./flowPreviewData";

export const fordFulkersonPreview: Preview = {
  render: () => {
    const { graph, state } = ffPreviewData();
    return (
      <GraphView
        graph={graph}
        state={state}
        markers={FLOW_MARKERS}
        width={THUMB_W}
        height={THUMB_H}
      />
    );
  },
};
