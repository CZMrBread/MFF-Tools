/**
 * Náhled Aho–Corasickové na úvodní stránce: výchozí příklad z knihy (obr. 13.2, seno barbara) po
 * doběhnutí – strom se zpětnými hranami a zkratkami vlevo, seno se čtyřmi výskyty vpravo. Neimportuje
 * AhoCorasickPage (líný chunk stránky), jen plátno a model.
 */
import { materialize } from "../../core/steps";
import { THUMB_W, type Preview } from "../../landing/previewTypes";
import { acSteps } from "./ahoCorasick";
import { AcCanvas } from "./ahoCorasickCanvas";
import { AC_DEFAULT } from "./ahoCorasickPageModel";
import { acSlots } from "./ahoCorasickView";

export const ahoCorasickPreview: Preview = {
  render: () => {
    const steps = materialize(
      acSteps(AC_DEFAULT.words, AC_DEFAULT.text, "search"),
    );
    const st = steps[steps.length - 1].state;
    return (
      <div className="ac-thumb">
        <AcCanvas
          st={st}
          slots={acSlots(steps)}
          width={Math.round(THUMB_W / 2)}
          levelH={30}
          names={false}
          table={false}
          line={false}
        />
      </div>
    );
  },
};
