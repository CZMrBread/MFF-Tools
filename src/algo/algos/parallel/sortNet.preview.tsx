/**
 * Náhled modulu na úvodní stránce: třídička T₈ (obr. 15.9) na výchozím vstupu 5, 2, 7, 1, 8, 3, 6, 4
 * po 4. vrstvě (M₄: obrácení + S₈) – vodiče vodorovně, ať se vejde do karty. Neimportuje SortNetPage
 * (líný chunk stránky by se slil s přehledem).
 */
import { materialize } from "../../core/steps";
import type { Preview } from "../../landing/previewTypes";
import { THUMB_W } from "../../landing/previewTypes";
import { ComparatorView } from "../../views/ComparatorView";
import { DEFAULT_CONFIG, netOf } from "./sortNetPageModel";
import { sortNetSteps } from "./sortNetSteps";

export const sortNetPreview: Preview = {
  render: () => {
    const net = netOf(DEFAULT_CONFIG);
    const input = DEFAULT_CONFIG.input;
    const steps = materialize(sortNetSteps({ net, input, removed: [] }));
    return (
      <ComparatorView
        net={net}
        state={steps[4].state}
        input={input}
        orient="h"
        labelBase={0}
        width={THUMB_W}
      />
    );
  },
};
