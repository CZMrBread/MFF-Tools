/**
 * Náhled KMP na úvodní stránce: výchozí příklad z knihy (kokos v clanekokokosu, str. 320–321) po
 * doběhnutí – automat se zpětnými hranami a seno s výskytem na pozici 7. Neimportuje KmpPage
 * (líný chunk stránky), jen plátno a model.
 */
import { materialize } from "../../core/steps";
import { THUMB_W, type Preview } from "../../landing/previewTypes";
import { kmpSteps } from "./kmp";
import { KmpCanvas } from "./kmpCanvas";
import { KMP_DEFAULT } from "./kmpPageModel";
import { kmpSlots } from "./kmpView";

export const kmpPreview: Preview = {
  render: () => {
    const steps = materialize(
      kmpSteps(KMP_DEFAULT.needle, KMP_DEFAULT.text, "search"),
    );
    const st = steps[steps.length - 1].state;
    return (
      <div className="kmp-thumb">
        <KmpCanvas
          st={st}
          slots={kmpSlots(steps)}
          width={THUMB_W}
          table={false}
        />
      </div>
    );
  },
};
