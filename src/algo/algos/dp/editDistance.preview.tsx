/**
 * Náhled editační vzdálenosti na úvodní stránce: tabulka T obr. 12.5 (poutník / potemník) po doběhnutí
 * Edit2 se zeleně vyznačenými úpravami. Neimportuje EditDistancePage (líný chunk), jen plátno a model.
 */
import { materialize } from "../../core/steps";
import type { Preview } from "../../landing/previewTypes";
import { EditTable } from "./editCanvas";
import { edit2Steps } from "./editDistance";
import { FIG_12_5 } from "./dpBook.fixtures";

export const editDistancePreview: Preview = {
  html: true,
  render: () => {
    const steps = materialize(edit2Steps(FIG_12_5.x, FIG_12_5.y));
    return <EditTable st={steps[steps.length - 1].state} sel={null} />;
  },
};
