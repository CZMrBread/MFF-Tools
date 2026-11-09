/**
 * Náhled LLRB stromu na úvodní stránce: výchozí příklad stránky (skutečná kresba – čtyři červené hrany)
 * přes celou šířku náhledu. (2,3)-strom vedle by v malém náhledu měl nečitelné písmo (UX-15). Neimportuje
 * LlrbPage (líný chunk) ani generátory kroků (llrb.ts) – jen čtení stromu (llrbTree.ts), aby hlavní chunk
 * úvodní stránky nerostl.
 */
import { THUMB_W, type Preview } from "../../landing/previewTypes";
import { TreeView } from "../../views/TreeView";
import { LLRB_DEFAULT_SPEC } from "./llrbDefault";
import { emptyLlrb, llrbFromSpec, llrbLayout } from "./llrbTree";

export const llrbPreview: Preview = {
  render: () => {
    const st = llrbFromSpec(LLRB_DEFAULT_SPEC, "23") ?? emptyLlrb();
    const lay = llrbLayout(st);
    return (
      <div className="llrb-tree llrb-thumb">
        <TreeView
          width={THUMB_W}
          levelHeight={52}
          radius={16}
          nodes={lay.nodes}
          edges={lay.edges}
        />
      </div>
    );
  },
};
