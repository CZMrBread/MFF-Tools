/**
 * Náhled modulu #/fft/fft na úvodní stránce: hotový strom volání výchozího příkladu (n = 8, listy v pořadí
 * bitového zrcadlení 0, 4, 2, 6, 1, 5, 3, 7 jako obr. 17.4; sudé / liché indexy barvou) a jednotková
 * kružnice s ω⁰ … ω⁷ (obr. 17.2) se spárovanou dvojicí ω¹, ω⁵ = −ω¹. Statické SVG bez ovládání; sdílí
 * geometrii se stránkou (callTreeLayout, circleLayout), ale neimportuje FftPage.tsx (líný chunk stránky
 * by se slil s přehledem).
 */
import type { Preview } from "../../landing/previewTypes";
import { THUMB_H, THUMB_W } from "../../landing/previewTypes";
import { circleLayout } from "../../views/unitCircleLayout";
import { supDigits } from "./complex";
import { callTree } from "./fft";
import { callTreeLayout } from "./fftTreeLayout";

const N = 8;
const CIRCLE = 150;

/** kresba náhledu (obyčejná funkce, ne komponenta – soubor exportuje jen náhled) */
function thumb() {
  const calls = callTree(N);
  const T = callTreeLayout(calls, 50);
  // strom vlevo zmenšený do zbytku šířky, kružnice vpravo
  const k = Math.min((THUMB_W - CIRCLE - 6) / T.W, THUMB_H / T.H);
  const ty = (THUMB_H - T.H * k) / 2;
  const circle = circleLayout(N, false, CIRCLE);
  const ox = THUMB_W - CIRCLE;
  const oy = (THUMB_H - CIRCLE) / 2;
  return (
    <svg
      viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
      className="fft-thumb"
      aria-hidden="true"
    >
      <g className="fft-calltree" transform={`translate(0 ${ty}) scale(${k})`}>
        {T.edges.map((e) => (
          <line
            key={e.from + "-" + e.to}
            className="mtree-edge"
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
          />
        ))}
        {calls.map((v) => {
          const b = T.boxes[v.id];
          return (
            <g
              key={v.id}
              className={
                "mtree-node " + (v.depth === 0 ? "n-active" : "n-found")
              }
              transform={`translate(${b.x - b.w / 2} ${b.y})`}
            >
              <rect width={b.w} height={T.nodeH} rx={5} />
              {v.idx.map((key, i) => (
                <g
                  key={i}
                  className={
                    v.idx.length > 1
                      ? i % 2 === 0
                        ? "key-even"
                        : "key-odd"
                      : undefined
                  }
                >
                  <text
                    x={i * T.cell + T.cell / 2}
                    y={T.nodeH / 2 + 4}
                    textAnchor="middle"
                  >
                    {key}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </g>
      <g transform={`translate(${ox} ${oy})`}>
        <line
          className="uc-axis"
          x1={circle.cx - circle.r - 8}
          y1={circle.cy}
          x2={circle.cx + circle.r + 8}
          y2={circle.cy}
        />
        <line
          className="uc-axis"
          x1={circle.cx}
          y1={circle.cy - circle.r - 8}
          x2={circle.cx}
          y2={circle.cy + circle.r + 8}
        />
        <circle
          className="uc-circle"
          cx={circle.cx}
          cy={circle.cy}
          r={circle.r}
        />
        <line
          className="uc-pair-line"
          x1={circle.points[1].x}
          y1={circle.points[1].y}
          x2={circle.points[5].x}
          y2={circle.points[5].y}
        />
        {circle.points.map((p) => (
          <g
            key={p.k}
            className={
              "uc-point uc-on" + (p.k === 1 || p.k === 5 ? " uc-pair" : "")
            }
          >
            <circle cx={p.x} cy={p.y} r={4.5} />
            <text
              x={p.lx}
              y={p.ly}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {"ω" + supDigits(p.k)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export const fftPreview: Preview = { render: thumb };
