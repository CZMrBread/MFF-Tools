/**
 * Náhled Rabin–Karp na úvodní stránce: kokos v clanekokokosu s N = 17 po doběhnutí – heše všech
 * okének, výskyt (i = 7) a falešná shoda ≈ (i = 6). Neimportuje RabinKarpPage, jen plátno a model.
 */
import { materialize } from "../../core/steps";
import { THUMB_W, type Preview } from "../../landing/previewTypes";
import { rkExample } from "./bookStrings";
import { rkSteps } from "./rabinKarp";
import { RabinKarpCanvas } from "./rabinKarpCanvas";

export const rabinKarpPreview: Preview = {
  render: () => {
    const e = rkExample("kokos17");
    const steps = materialize(rkSteps(e.needle, e.text, e.P, e.N));
    return (
      <RabinKarpCanvas
        st={steps[steps.length - 1].state}
        width={THUMB_W}
        details={false}
      />
    );
  },
};
