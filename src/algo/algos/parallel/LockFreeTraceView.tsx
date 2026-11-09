/**
 * Časová osa prokládání pod zásobníkem: dráhy P1 a P2, v každém sloupci jeden atomický krok procesu
 * (čtení h, s, pokus CAS ✓ / ✗). Ukazuje, KDY se který proces dostal ke slovu – právě prokládání dělá
 * ABA. Stav jde s krokem přehrávače (průběh je ve stavu kroku). Jen obrázek – nic se v ní nevybírá,
 * takže není zastávkou Tabu; čtečka dostane celý průběh v aria-label. Geometrie: lockfreeTimeline.ts.
 */
import { useWidth } from "../../views/useWidth";
import type { LFState, LFTraceItem } from "./lockfree";
import { lfTimeline, timelineLabel } from "./lockfreeTimeline";

/** krabička kroku podle druhu (barvy z legendy stránky: načtení žlutě, úspěšný CAS zeleně) */
const CHIP_CLASS: Record<LFTraceItem["kind"], string> = {
  start: "",
  read: "box-compare",
  ok: "box-new",
  fail: "box-removed",
  end: "",
};

export function LockFreeTimeline({ st }: { st: LFState }) {
  const [ref, width] = useWidth();
  const L = lfTimeline(st.trace, st.traceSkipped, width);
  return (
    <div className="view-wrap" ref={ref}>
      <svg
        viewBox={`0 0 ${L.W} ${L.H}`}
        width={L.W}
        height={L.H}
        className="boxlist-svg"
        role="img"
        aria-label={timelineLabel(st)}
      >
        <text x={L.moreX} y={L.titleY} className="bar-index">
          průběh prokládání (čas →)
        </text>
        {L.lanes.map((lane) => (
          <g key={lane.label}>
            <line
              className="box-arrow"
              x1={L.moreX}
              x2={L.W - 6}
              y1={lane.y + 15}
              y2={lane.y + 15}
              style={{ strokeDasharray: "2 5", opacity: 0.6 }}
            />
            <text
              x={4}
              y={lane.y + 20}
              style={{ fontWeight: 700, fill: "var(--algo-text)" }}
            >
              {lane.label}
            </text>
          </g>
        ))}
        {L.hidden > 0 && (
          <text x={L.moreX} y={L.lanes[0].y + 34} className="bar-index">
            … +{L.hidden}
          </text>
        )}
        {L.chips.map((c, i) => (
          <g key={i} className={"box " + CHIP_CLASS[c.kind]}>
            <rect
              x={c.x}
              y={c.y}
              width={c.w}
              height={c.h}
              rx={5}
              style={c.last ? { strokeWidth: 3 } : undefined}
            />
            <text x={c.x + c.w / 2} y={c.y + 21} textAnchor="middle">
              {c.text}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
