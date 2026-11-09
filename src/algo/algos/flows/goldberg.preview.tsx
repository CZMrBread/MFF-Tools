/**
 * Náhled Goldbergova algoritmu na úvodní stránce: kresba výšek výchozího příkladu (síť z obr. 14.2)
 * v kroku převedení po hraně a→c – vrcholy v různých výškách, odznaky přebytků, hrany s rezervou dolů.
 * Kreslí se z dat (goldbergPreviewData.ts), logika algoritmu zůstává v líném chunku; neimportuje
 * GoldbergPage.
 */
import { THUMB_H, THUMB_W, type Preview } from "../../landing/previewTypes";
import { GoldbergHeightView } from "./goldbergHeightView";
import { goldbergPreviewData } from "./goldbergPreviewData";

export const goldbergPreview: Preview = {
  render: () => {
    const v = goldbergPreviewData();
    return (
      <GoldbergHeightView
        net={v.net}
        state={v.state}
        hMax={v.hMax}
        width={THUMB_W}
        height={THUMB_H}
        still
      />
    );
  },
};
