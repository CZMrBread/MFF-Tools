import {
  MNODE_H as H,
  multiTreeLayout,
  type MEdge,
  type MNode,
} from "./treeLayout";
import { useRovingFocus } from "../core/useRovingFocus";
import { pickProps } from "./pick";
import { plural } from "./text";
import { useTween, type Positions } from "./useTween";
import { useWidth } from "./useWidth";

export type { MEdge, MNode } from "./treeLayout";

interface Props {
  nodes: MNode[];
  edges: MEdge[];
  /** svislá vzdálenost hladin v px */
  levelHeight?: number;
  /** délka přesunu vrcholů v ms – jen ruční přebití; jinak ji dá Visualizer podle přehrávače */
  moveMs?: number;
  /** pevná šířka v px místo změřené šířky obalu */
  width?: number;
  ariaLabel?: string;
  /**
   * klik nebo Enter na klíč (list i oddělovač) – výběr argumentu akce; klíče jsou pak tlačítka
   * „Klíč 41 – vybrat“ s roving tabindexem (kresba je jedna zastávka Tabu, šipky chodí po klíčích, D3)
   */
  onPickKey?: (key: string, node: MNode, index: number) => void;
  /**
   * plátno na jednu obrazovku: užší buňky místo zmenšení písma, okraje podle krajních vrcholů a výška
   * bez prázdné hladiny pod listy (multiTreeLayout s fit; vzdálenost hladin dá multiFitLevelHeight)
   */
  fit?: boolean;
}

/** Třída klíče i ve vrcholu: „hot“ (zvýrazněný) a/nebo keyCls[i]; bez obojího žádná (beze změny markupu). */
function keyClass(n: MNode, i: number): string | undefined {
  const cls = [n.hot === i ? "hot" : undefined, n.keyCls?.[i]]
    .filter(Boolean)
    .join(" ");
  return cls || undefined;
}

/** Strom s více klíči ve vrcholu ((a,b)-stromy). Vrcholy klíčované id, animované přesuny i s hranami. */
export function MultiTreeView({
  nodes,
  edges,
  levelHeight = 80,
  moveMs,
  width,
  ariaLabel,
  onPickKey,
  fit,
}: Props) {
  const [ref, measured] = useWidth();
  const L = multiTreeLayout(nodes, width ?? measured, levelHeight, { fit });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // animuje se střed horní hrany vrcholu
  const target: Positions = new Map(
    nodes.map((n) => [n.id, { x: L.px(n), y: L.py(n) }]),
  );
  // změna šířky (první změření, otočení telefonu) se neanimuje – jen přesuny po operaci
  const pos = useTween(target, moveMs, L.W);
  const CELL = L.cell;
  // pořadí čtení (hladiny shora, zleva) – zastávkou Tabu je napoprvé první klíč kořene
  const rove = useRovingFocus(
    onPickKey
      ? [...nodes]
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .flatMap((n) => n.keys.map((_, i) => `${n.id}:${i}`))
      : [],
  );
  const name =
    ariaLabel ??
    (nodes.length
      ? `(a,b)-strom s ${nodes.length} ${plural(nodes.length, "vrcholem", "vrcholy", "vrcholy")}`
      : "Prázdný strom");

  return (
    <div className="tree-wrap view-wrap" ref={ref}>
      <svg
        viewBox={`0 0 ${L.W} ${L.height}`}
        width={L.W}
        height={L.height}
        className={"tree-svg" + (onPickKey ? " pickable" : "")}
        role={onPickKey ? "group" : "img"}
        aria-label={name}
        {...(onPickKey ? rove.group : {})}
      >
        {edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b || !byId.has(e.from) || !byId.has(e.to)) return null;
          return (
            <line
              key={e.from + "-" + e.to}
              x1={a.x}
              y1={a.y + H}
              x2={b.x}
              y2={b.y}
              className={"mtree-edge " + (e.cls ?? "")}
            />
          );
        })}
        {nodes.length === 0 && (
          <text
            x={L.W / 2}
            y={60}
            textAnchor="middle"
            className="box-empty-text"
          >
            prázdný strom
          </text>
        )}
        {nodes.map((n) => {
          const w = L.nodeW(n);
          const p = pos.get(n.id)!;
          return (
            <g
              key={n.id}
              className={"mtree-node " + (n.cls ?? "")}
              style={{ transform: `translate(${p.x - w / 2}px, ${p.y}px)` }}
            >
              <rect width={w} height={H} rx={6} />
              {n.keys.map((k, i) => (
                <g
                  key={i}
                  className={
                    [keyClass(n, i), onPickKey ? "pickable" : undefined]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  {...pickProps(
                    onPickKey && (() => onPickKey(k, n, i)),
                    `Klíč ${k}`,
                  )}
                  {...(onPickKey ? rove.item(`${n.id}:${i}`) : {})}
                >
                  {n.hot === i && (
                    <rect
                      x={i * CELL + 1}
                      y={1}
                      width={CELL - 2}
                      height={H - 2}
                      rx={5}
                      className="hot-bg"
                    />
                  )}
                  {i > 0 && (
                    <line
                      x1={i * CELL}
                      y1={4}
                      x2={i * CELL}
                      y2={H - 4}
                      className="mtree-sep"
                    />
                  )}
                  <text
                    x={i * CELL + CELL / 2}
                    y={H / 2 + 5}
                    textAnchor="middle"
                  >
                    {k}
                  </text>
                </g>
              ))}
              {n.sub && (
                <text
                  x={w / 2}
                  y={H + 13}
                  textAnchor="middle"
                  className="tree-sub"
                >
                  {n.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
