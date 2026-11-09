/**
 * Náhled modulu Sčítačka na úvodní stránce: tabulka průběhu paralelního sčítání z obr. 15.4 po výpočtu
 * (116 + 59 = 175). Jen pohled a model – stránku (líný chunk) neimportuje.
 */
import { materialize } from "../../core/steps";
import type { Preview } from "../../landing/previewTypes";
import { adderSteps, bitsOf } from "./adder";
import { FIG_15_4 } from "./adderBook.fixtures";
import { AdderTable } from "./adderViews";

export const adderPreview: Preview = {
  html: true,
  render: () => {
    const steps = materialize(
      adderSteps(bitsOf(FIG_15_4.x), bitsOf(FIG_15_4.y), "par"),
    );
    const last = steps[steps.length - 1].state;
    return <AdderTable state={last} par={last.par!} />;
  },
};
