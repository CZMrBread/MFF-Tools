/**
 * Náhled Dinicova algoritmu na úvodní stránce: obr. 14.7 po ČištěníSítě ve fázi 1 – šedivé hrany dozadu
 * a uvnitř vrstev, tečkované do slepých uliček (výchozí příklad modulu); bez obrysů vrstev a popisků (UX-15). Kreslí
 * se z dat knihy (flowPreviewData.ts), logika toků zůstává v líném chunku; neimportuje DinicPage.
 */
import { THUMB_H, THUMB_W, type Preview } from "../../landing/previewTypes";
import { GraphView } from "../../views/GraphView";
import { FLOW_MARKERS } from "./flowMarkers";
import { dinicPreviewData } from "./flowPreviewData";

export const dinicPreview: Preview = {
  render: () => {
    const v = dinicPreviewData();
    return (
      <GraphView
        graph={v.graph}
        state={v.state}
        markers={FLOW_MARKERS}
        width={THUMB_W}
        height={THUMB_H}
      />
    );
  },
};
