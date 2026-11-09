/**
 * Značky úprav roviny s body (konvexní obal, k-d strom): souřadnice taženého bodu a tlačítko × u vybraného
 * bodu. Barvy z CSS (oddíl hull: .plane-drag-label, .plane-del).
 */
import { formatNum } from "../../core/format";
import { DEL_R } from "./planeDrag";

const num = (v: number) => formatNum(v).replace("-", "−");

/** souřadnice taženého bodu (po puštění zaokrouhlené) nad ukazatelem */
export function DragLabel({
  at,
  x,
  y,
}: {
  at: { x: number; y: number };
  x: number;
  y: number;
}) {
  return (
    <text
      x={at.x}
      y={at.y - 16}
      textAnchor="middle"
      className="plane-drag-label"
    >
      ({num(x)}, {num(y)})
    </text>
  );
}

/** tlačítko × u vybraného bodu (jen ukazatel; klávesnice má Delete na bodu) */
export function RemoveButton({ at }: { at: { x: number; y: number } }) {
  const d = 3.5;
  return (
    <g className="plane-del" aria-hidden="true">
      <title>Smazat bod (Delete)</title>
      <circle cx={at.x} cy={at.y} r={DEL_R} />
      <path
        d={`M${at.x - d},${at.y - d}L${at.x + d},${at.y + d}M${at.x + d},${at.y - d}L${at.x - d},${at.y + d}`}
      />
    </g>
  );
}
