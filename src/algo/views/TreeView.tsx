import { useLayoutEffect } from "react";
import { useLeaving, useStepMs } from "../core/stepTransition";
import { useRovingFocus } from "../core/useRovingFocus";
import { pickProps } from "./pick";
import { treeLayout, type TEdge, type TNode } from "./treeLayout";
import { plural } from "./text";
import { posKey, useTween, type Positions } from "./useTween";
import { useWidth } from "./useWidth";

export type { TEdge, TNode } from "./treeLayout";

interface Props {
  nodes: TNode[];
  edges: TEdge[];
  /** svislá vzdálenost hladin v px */
  levelHeight?: number;
  /** nejmenší poloměr vrcholu v px (delší popisky ho zvětší) */
  radius?: number;
  minHeight?: number;
  /** délka přesunu vrcholů v ms – jen ruční přebití; jinak ji dá Visualizer podle přehrávače (core/stepTransition.ts) */
  moveMs?: number;
  /** pevná šířka v px místo změřené šířky obalu */
  width?: number;
  /** přístupný název; výchozí „Strom se 7 vrcholy“ */
  ariaLabel?: string;
  /** klik (Enter) na vrchol – stránka vyplní klíč do argumentu akce (ActionMenu.pick) */
  onPick?: (node: TNode) => void;
  /** text místo prázdného stromu (výchozí „prázdný strom“) */
  emptyLabel?: string;
  /** nevejde-li se strom do šířky, zúžit vrcholy až na tento poloměr (místo zmenšení písma) */
  minRadius?: number;
  /**
   * nejmenší měřítko kresby (hluboký strom): menší by písmo zmenšilo pod čitelnou mez – kresba pak
   * zůstane takto velká a obal se posouvá svisle, aktivní vrchol drží v záběru
   */
  minScale?: number;
}

/**
 * Obecné vykreslení stromu. Uzly mají souřadnice x ∈ [0,1] a y = hloubka.
 * Uzly jsou klíčované id → přesuny (rotace, bublání) se animují; hrany se kreslí z týchž mezipoloh.
 */
export function TreeView({
  nodes,
  edges,
  levelHeight = 72,
  radius = 20,
  minHeight = 120,
  moveMs,
  width,
  ariaLabel,
  onPick,
  emptyLabel = "prázdný strom",
  minRadius,
  minScale,
}: Props) {
  const [ref, measured] = useWidth();
  const L = treeLayout(nodes, width ?? measured, {
    levelHeight,
    radius,
    minHeight,
    minRadius,
  });
  const target: Positions = new Map(
    nodes.map((n) => [n.id, { x: L.px(n), y: L.py(n) }]),
  );
  // změna šířky (první změření, otočení telefonu) se neanimuje – jen přesuny po operaci
  const pos = useTween(target, moveMs, L.W);
  const at = (id: number) => pos.get(id);
  // smazané vrcholy doznívají na poslední poloze (mimo Visualizer ms = 0 → zmizí hned)
  const leaveMs = useStepMs(0);
  const drawn = new Map(
    nodes.map((n) => [
      n.id,
      { ...target.get(n.id)!, label: n.label, cls: n.cls },
    ]),
  );
  const leaving = useLeaving(
    drawn,
    leaveMs,
    `${L.W}|${L.r}|${posKey(target)}|${nodes.map((n) => n.label).join(",")}`,
  );
  // posouvá-li se obal (hluboký strom), aktivní vrchol kroku drží v záběru – posun obalu, ne okna
  const focusKey = nodes
    .filter((n) => /(^|\s)n-(active|found|new)(\s|$)/.test(n.cls ?? ""))
    .map((n) => n.id)
    .join(",");
  useLayoutEffect(() => {
    const wrap = ref.current;
    if (!minScale || !wrap) return;
    // nejbližší posouvatelný předek (plátno), ne okno
    let box: HTMLElement | null = wrap.parentElement;
    while (box && box.scrollHeight <= box.clientHeight + 1)
      box = box.classList.contains("viz-canvas") ? null : box.parentElement;
    if (!box) return;
    const el = wrap.querySelector<SVGGElement>(
      ".tree-node.n-active, .tree-node.n-found, .tree-node.n-new",
    );
    if (!el) return;
    const w = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const margin = 24;
    const dy =
      r.top < w.top + margin
        ? r.top - (w.top + margin)
        : r.bottom > w.bottom - margin
          ? r.bottom - (w.bottom - margin)
          : 0;
    if (dy) box.scrollBy?.({ top: dy });
  }, [focusKey, minScale, ref]);
  // vybírat jde jen s onPick: pak je kresba jedna zastávka Tabu, šipky chodí po vrcholech (D3)
  // pořadí čtení (hladiny shora, zleva) – zastávkou Tabu je napoprvé kořen, ne první vrchol v DOM
  const rove = useRovingFocus(
    onPick
      ? [...nodes].sort((a, b) => a.y - b.y || a.x - b.x).map((n) => n.id)
      : [],
  );
  const name =
    ariaLabel ??
    (nodes.length
      ? `Strom s ${nodes.length} ${plural(nodes.length, "vrcholem", "vrcholy", "vrcholy")}`
      : "Prázdný strom");

  return (
    <div
      className="tree-wrap view-wrap"
      ref={ref}
      // obal se nesmršťuje – přetečení posouvá plátno (.viz-canvas), useCanvasFit tak nejdřív stáhne hladiny
      style={minScale ? { flexShrink: 0 } : undefined}
    >
      <svg
        viewBox={`0 0 ${L.W} ${L.H}`}
        width={L.W}
        height={L.H}
        className={"tree-svg" + (onPick ? " pickable" : "")}
        style={
          minScale
            ? { minHeight: Math.round(L.H * minScale), flexShrink: 0 }
            : undefined
        }
        role={onPick ? "group" : "img"}
        aria-label={name}
        {...(onPick ? rove.group : {})}
      >
        {edges.map((e) => {
          const a = at(e.from);
          const b = at(e.to);
          if (!a || !b) return null;
          return (
            <g
              key={e.from + "-" + e.to}
              className={"tree-edge " + (e.cls ?? "")}
            >
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              {e.label && (
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 4}
                  textAnchor="middle"
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
        {nodes.length === 0 && (
          <text
            x={L.W / 2}
            y={60}
            textAnchor="middle"
            className="box-empty-text"
          >
            {emptyLabel}
          </text>
        )}
        {nodes.map((n) => {
          const p = at(n.id)!;
          return (
            <g
              key={n.id}
              className={
                "tree-node " + (n.cls ?? "") + (onPick ? " pickable" : "")
              }
              style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
              {...pickProps(
                onPick && (() => onPick(n)),
                n.aria ?? `Vrchol ${n.label}`,
              )}
              {...(onPick ? rove.item(n.id) : {})}
            >
              <circle r={L.r} />
              <text
                y={5}
                textAnchor="middle"
                style={L.font !== 14 ? { fontSize: L.font } : undefined}
              >
                {n.label}
              </text>
              {n.sub && (
                <text y={L.r + 14} textAnchor="middle" className="tree-sub">
                  {n.sub}
                </text>
              )}
            </g>
          );
        })}
        {leaving.map(([id, d]) => (
          <g
            key={"leaving-" + id}
            className={"tree-node leaving " + (d.cls ?? "")}
            style={{ transform: `translate(${d.x}px, ${d.y}px)` }}
            aria-hidden="true"
          >
            <circle r={L.r} />
            <text
              y={5}
              textAnchor="middle"
              style={L.font !== 14 ? { fontSize: L.font } : undefined}
            >
              {d.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
