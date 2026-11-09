import type { CSSProperties } from "react";
import { useRovingFocus } from "../core/useRovingFocus";
import type { AutomatonLayout } from "./automatonLayout";
import { pickProps } from "./pick";
import { useWidth } from "./useWidth";

interface Props {
  /** rozvržení pro změřenou šířku (linearAutomaton – KMP, trieAutomaton – Aho-Corasicková) */
  layout: (width: number) => AutomatonLayout;
  /** třídy stavů podle id (au-current, au-cmp, au-pending, au-final, au-word, au-queue…) */
  nodeCls?: Readonly<Record<number, string>>;
  /** třídy hran podle klíče edgeKey (au-hot…) */
  edgeCls?: Readonly<Record<string, string>>;
  ariaLabel: string;
  /** pevná šířka (náhled) místo změřené */
  width?: number;
  /** klik (Enter) na stav */
  onPick?: (id: number) => void;
}

/**
 * Vyhledávací automat v SVG: stavy (kroužky s číslem, jméno nad nimi – ve stromu vedle), dopředné
 * hrany s písmenem, zpětné a (tečkované) zkratkové hrany. Barvy se mezi kroky přelévají (CSS, --algo-step-color-ms).
 * Geometrie v automatonLayout.ts.
 */
export function AutomatonView({
  layout,
  nodeCls = {},
  edgeCls = {},
  ariaLabel,
  width,
  onPick,
}: Props) {
  const [ref, measured] = useWidth();
  const L = layout(width ?? measured);
  const order = { back: 0, short: 1, fwd: 2 } as const;
  const edges = [...L.edges].sort((a, b) => {
    const hot =
      Number(Boolean(edgeCls[a.key])) - Number(Boolean(edgeCls[b.key]));
    return hot || order[a.kind] - order[b.kind];
  });
  // stavy jdou vybrat jen s onPick: pak je automat jedna zastávka Tabu, šipky chodí po stavech (D3)
  const rove = useRovingFocus(onPick ? L.nodes.map((n) => n.id) : []);
  return (
    <div className="automaton-view view-wrap" ref={ref}>
      <svg
        viewBox={`0 0 ${L.W} ${L.H}`}
        width={L.W}
        height={L.H}
        className="automaton-svg"
        style={
          L.zoom && L.zoom !== 1
            ? ({ "--algo-au-zoom": L.zoom } as CSSProperties)
            : undefined
        }
        role={onPick ? "group" : "img"}
        aria-label={ariaLabel}
        {...(onPick ? rove.group : {})}
      >
        {edges.map((e) => (
          <g
            key={e.key}
            className={`au-edge au-${e.kind} ${edgeCls[e.key] ?? ""}`}
          >
            <path d={e.d} />
            <polygon points={e.arrow} />
            {e.label !== undefined && (
              <text x={e.lx} y={e.ly} textAnchor="middle" className="au-letter">
                {e.label}
              </text>
            )}
          </g>
        ))}
        {L.nodes.map((n) => {
          const pick = onPick ? () => onPick(n.id) : undefined;
          return (
            <g
              key={n.id}
              className={
                "au-node " + (nodeCls[n.id] ?? "") + (pick ? " pickable" : "")
              }
              {...pickProps(pick, `Stav ${n.id} (${n.name})`)}
              {...(pick ? rove.item(n.id) : {})}
            >
              <title>{`stav ${n.id}: ${n.name}`}</title>
              <circle cx={n.x} cy={n.y} r={L.r} />
              <text
                x={n.x}
                y={n.y + 4 * (L.zoom ?? 1)}
                textAnchor="middle"
                className="au-num"
              >
                {n.id}
              </text>
              {n.ellipsis && (
                <text
                  x={n.x}
                  y={L.nameY}
                  textAnchor="middle"
                  className="au-name"
                  aria-hidden="true"
                >
                  …
                </text>
              )}
              {n.showName &&
                (n.nameX !== undefined ? (
                  // strom (obr. 13.2): jméno vedle kroužku, s podkladem přes hrany
                  <text
                    x={n.nameX}
                    y={n.nameY}
                    textAnchor={n.nameAnchor ?? "start"}
                    className="au-name au-tname"
                  >
                    {n.name}
                  </text>
                ) : (
                  <text
                    x={n.x}
                    y={L.nameY}
                    textAnchor="middle"
                    className="au-name"
                  >
                    {n.name}
                  </text>
                ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
