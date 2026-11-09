/**
 * Náhled modulu #/fft/net na úvodní stránce: motýlková síť obr. 17.4 pro n = 8 – vstupy x₀, x₄, x₂, …
 * v pořadí bitového zrcadlení, 3 vrstvy kroužků „±k“ a výstupy y₀ … y₇; jeden motýlek druhé vrstvy
 * zvýrazněný. Statické SVG bez ovládání; sdílí geometrii se stránkou (netLayout), ale neimportuje
 * FftNetPage.tsx (líný chunk stránky by se slil s přehledem).
 */
import type { Preview } from "../../landing/previewTypes";
import { THUMB_H, THUMB_W } from "../../landing/previewTypes";
import { netLayout } from "../../views/butterflyNetLayout";
import { subDigits } from "./complex";
import { bitReverse, gateLabels } from "./fft2";

const N = 8;
/** zvýrazněný motýlek: vrstva 2, řádky 1 a 3 (k = 1) */
const HOT_LAYER = 2;
const HOT = new Set([1, 3]);

/** kresba náhledu (obyčejná funkce, ne komponenta – soubor exportuje jen náhled) */
function thumb() {
  const L = netLayout({ n: N, rowH: 30, valueW: 26, crossW: 34 });
  const labels = gateLabels(N);
  const k = Math.min(THUMB_W / L.W, THUMB_H / L.H);
  const tx = (THUMB_W - L.W * k) / 2;
  const ty = (THUMB_H - L.H * k) / 2;
  const segEnd = (c: number) => (c < L.layers ? L.dotX[c] : L.outX - 2);
  return (
    <svg
      viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
      className="bn-thumb"
      aria-hidden="true"
    >
      <g transform={`translate(${tx} ${ty}) scale(${k})`}>
        {L.seg.map((s, c) =>
          L.rowY.map((y, row) => (
            <line
              key={`w${c}-${row}`}
              className="bn-wire"
              x1={s.x1}
              y1={y}
              x2={segEnd(c)}
              y2={y}
            />
          )),
        )}
        {L.links.map((l) => (
          <line
            key={`l${l.layer}-${l.gateRow}-${l.kind}`}
            className={
              "bn-link" +
              (l.layer === HOT_LAYER && HOT.has(l.gateRow) ? " is-hot" : "")
            }
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
          />
        ))}
        {L.circleX.map((cx, li) =>
          L.rowY.map((cy, row) => (
            <g
              key={`g${li}-${row}`}
              className={
                "bn-gate" +
                (li + 1 === HOT_LAYER && HOT.has(row) ? " is-hot" : "")
              }
              transform={`translate(${cx} ${cy})`}
            >
              <circle r={L.r} />
              <text textAnchor="middle" y={3.5}>
                {labels[li][row]}
              </text>
            </g>
          )),
        )}
        {bitReverse(N).map((r, row) => (
          <text
            key={`i${row}`}
            className="bn-in"
            x={L.inX}
            y={L.rowY[row] + 4}
            textAnchor="end"
          >
            {"x" + subDigits(r)}
          </text>
        ))}
        {L.rowY.map((y, row) => (
          <text key={`o${row}`} className="bn-out" x={L.outX + 3} y={y + 4}>
            {"y" + subDigits(row)}
          </text>
        ))}
      </g>
    </svg>
  );
}

export const fftNetPreview: Preview = { render: thumb };
