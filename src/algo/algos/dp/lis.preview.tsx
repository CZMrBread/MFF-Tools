/**
 * Náhled nejdelší rostoucí podposloupnosti na úvodní stránce: graf posloupnosti obr. 12.3 (jako obr. 12.4)
 * po doběhnutí Nrp2 – odkazy P a zeleně nalezená NRP 3, 14, 15, 35, 38, 46. Neimportuje LisPage (líný
 * chunk), jen plátno a model.
 */
import { materialize } from "../../core/steps";
import { THUMB_H, THUMB_W, type Preview } from "../../landing/previewTypes";
import { nrp2Steps } from "./lis";
import { LisChart } from "./lisCanvas";
import { FIG_12_3 } from "./dpBook.fixtures";

const HEAD = 30;

export const lisPreview: Preview = {
  render: () => {
    const steps = materialize(nrp2Steps(FIG_12_3.x));
    const n = FIG_12_3.x.length;
    return (
      <LisChart
        st={steps[steps.length - 1].state}
        sel={null}
        head={HEAD}
        col={(THUMB_W - HEAD) / (n + 1)}
        height={THUMB_H}
      />
    );
  },
};
