/**
 * Náhled konvexního obalu na úvodní stránce: výchozí příklad modulu (obr. 16.1, jabloňový sad) uprostřed
 * zametání – zametací přímka, rozpracované obálky H a D a testovaný úhel. Kreslí skutečnou rovinu modulu
 * (views/HullView) bez ovládání; neimportuje HullPage (líný chunk).
 */
import { THUMB_H, THUMB_W, type Preview } from "../../landing/previewTypes";
import { HullPlane } from "../../views/HullView";
import { hullSteps } from "./hull";
import { DEFAULT_EXAMPLE } from "./hullBook";

/** krok s testem úhlu zhruba ve dvou třetinách zametání (počítá se jednou, při prvním vykreslení) */
let cached: ReturnType<typeof hullSteps>[number] | null = null;
function previewStep() {
  if (cached) return cached;
  const steps = hullSteps(DEFAULT_EXAMPLE.points, "sweep");
  const from = Math.floor(steps.length * 0.62);
  cached =
    steps.slice(from).find((s) => s.state.test && s.state.H.length > 2) ??
    steps[steps.length - 1];
  return cached;
}

export const hullPreview: Preview = {
  render: () => (
    <div className="hull-thumb" style={{ width: THUMB_W, height: THUMB_H }}>
      <HullPlane
        st={previewStep().state}
        className="hull-thumb-plane"
        fitAspect={THUMB_W / THUMB_H}
      />
    </div>
  ),
};
