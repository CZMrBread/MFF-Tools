/**
 * Náhled modulu Hradlové sítě na úvodní stránce: majorita z obr. 15.1 po výpočtu (x = 1, y = 0,
 * z = 1 → q = 1) s vrstvami S₀ … S₄. Jen pohled a model – stránku (líný chunk) neimportuje.
 */
import { materialize } from "../../core/steps";
import type { Preview } from "../../landing/previewTypes";
import { CircuitView } from "../../views/CircuitView";
import { circuitSteps } from "./circuit";
import { BOOK_PRESETS } from "./circuitPresets";
import { bitsFromArray } from "./gatesPageModel";

export const gatesPreview: Preview = {
  render: () => {
    const p = BOOK_PRESETS[0];
    const c = p.build();
    const bits = bitsFromArray(c, p.bits);
    const steps = materialize(circuitSteps(c, bits));
    const last = steps[steps.length - 1].state;
    return (
      <CircuitView
        circuit={c}
        values={last.values}
        bits={bits}
        done
        still
        ariaLabel="Hradlová síť pro majoritu (obr. 15.1)"
      />
    );
  },
};
