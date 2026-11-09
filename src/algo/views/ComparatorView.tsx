import { useId, useRef } from "react";
import { useStepMs } from "../core/stepTransition";
import { useRovingFocus } from "../core/useRovingFocus";
import { sub, type SortNet } from "../algos/parallel/sortNet";
import type { SortNetState } from "../algos/parallel/sortNetSteps";
import { comparatorLayout, type Orient } from "./comparatorLayout";
import { pickProps } from "./pick";
import { useFlip } from "./useFlip";
import { useWidth } from "./useWidth";

interface Props {
  net: SortNet;
  /** stav aktuálního kroku; null = jen vstup (náhled, před prvním krokem) */
  state: SortNetState | null;
  input: readonly number[];
  orient: Orient;
  /** vodiče číslované od 1 (bublinka v knize) nebo od 0 */
  labelBase: 0 | 1;
  removed?: readonly number[];
  /** natažení / zmáčknutí na výšku (canvasFit) */
  delta?: number;
  /** pevná šířka místo změřené (náhled) */
  width?: number;
  /** klik (Enter) na šipku – stránka vyplní Vynechat(c) */
  onPickComp?: (c: number) => void;
  /** klik na vstup (jen 0/1 vstup) – přepne bit */
  onToggleInput?: (w: number) => void;
}

const MARKERS = ["plain", "keep", "swap"] as const;

/**
 * Komparátorová síť jako v knize (obr. 15.6–15.10): vodiče svisle s popisky xᵢ nahoře a yᵢ dole, čas
 * teče dolů, komparátor = šipka k většímu výstupu; nebo vodorovně (velké sítě). Žetony s hodnotami
 * stojí v mezeře za poslední spočítanou vrstvou a do další se přesunou plynule (useFlip – prohozené
 * šikmo na druhý vodič); hodnoty dřívějších mezer zůstávají vidět drobně. Bloky Sₙ / Mₙ jsou
 * průhledné obdélníky s popiskem (obr. 15.8 / 15.9).
 */
export function ComparatorView({
  net,
  state,
  input,
  orient,
  labelBase,
  removed = [],
  delta = 0,
  width,
  onPickComp,
  onToggleInput,
}: Props) {
  const [ref, measured] = useWidth();
  const L = comparatorLayout(net, {
    orient,
    width: width ?? measured,
    delta,
  });
  const uid = useId().replace(/:/g, "");
  const ms = useStepMs(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const t = state?.t ?? 0;
  const gaps = state?.gaps ?? [input.slice()];
  const ids = state?.ids ?? [input.map((_, i) => i)];
  const cur = gaps[t];
  const curIds = ids[t];
  const active = new Set(state?.active ?? []);
  const off = new Set(removed);
  const zeroOne = input.every((v) => v === 0 || v === 1);
  const mountain = state?.mountain ?? null;
  const sortedOut = !!state?.final && state.sorted;
  const prevIds = t > 0 ? ids[t - 1] : null;

  // žeton = hodnota se svou identitou (index vstupu), poloha z mezery t
  const targets = new Map<number, { x: number; y: number }>();
  curIds.forEach((id, w) => targets.set(id, L.token(w, t)));
  useFlip(svgRef, targets, ms, `${L.W}|${L.H}|${orient}`);

  const w = (i: number) => sub(i + labelBase);
  const marker = (k: (typeof MARKERS)[number]) => `url(#sn${uid}${k})`;
  const interactive = !!onPickComp || (!!onToggleInput && zeroOne);
  const name = `Komparátorová síť: ${net.n} vodičů, ${net.comps.length} komparátorů, hloubka ${net.layers.length}; na vodičích ${cur.join(", ")}`;
  const v = orient === "v";
  // kresba je jedna zastávka Tabu (D3): nejdřív vstupy (přepínače bitů), pak komparátory
  const toggles = !!onToggleInput && zeroOne;
  const rove = useRovingFocus([
    ...(toggles ? input.map((_, wi) => "i" + wi) : []),
    ...(onPickComp ? net.comps.map((_, c) => "c" + c) : []),
  ]);

  return (
    <div className="sortnet-view view-wrap" ref={ref}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${L.W} ${L.H}`}
        width={L.W}
        height={L.H}
        className={
          `sortnet-svg orient-${orient}` + (zeroOne ? " zero-one" : "")
        }
        role={interactive ? "group" : "img"}
        aria-label={name}
        {...(interactive ? rove.group : {})}
      >
        <defs>
          {MARKERS.map((k) => (
            <marker
              key={k}
              id={`sn${uid}${k}`}
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="9"
              markerHeight="7"
              preserveAspectRatio="none"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" className={"sn-arrow " + k} />
            </marker>
          ))}
        </defs>

        {state?.layer !== null && state?.layer !== undefined && (
          <rect className="sn-band" {...rectProps(L.layerBand(state.layer))} />
        )}
        {L.blocks.map((b, i) => (
          <g key={"b" + i}>
            <rect
              className="sn-block"
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={3}
            />
            <text
              className="sn-block-label"
              x={b.lx}
              y={b.ly}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {b.label}
            </text>
          </g>
        ))}
        {L.separators.map((s, i) => (
          <line key={"s" + i} className="sn-pass-sep" {...s} />
        ))}

        {L.wires.map((g) => (
          <g key={"w" + g.w}>
            <line className="sn-wire" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
            <text
              className="sn-wire-label"
              x={g.inLabel.x}
              y={g.inLabel.y}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {"x" + w(g.w)}
            </text>
            <text
              className="sn-wire-label"
              x={g.outLabel.x}
              y={g.outLabel.y}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {"y" + w(g.w)}
            </text>
          </g>
        ))}

        {L.comps.map((g) => {
          const c = net.comps[g.c];
          const res = state?.done[g.c];
          const isActive = active.has(g.c);
          const cls =
            "sn-comp" +
            (off.has(g.c)
              ? " removed"
              : isActive
                ? " active " + (res ?? "keep")
                : res
                  ? " past" + (res === "swap" ? " was-swap" : "")
                  : " future") +
            (onPickComp ? " pickable" : "");
          const m =
            isActive && !off.has(g.c)
              ? res === "swap"
                ? "swap"
                : "keep"
              : "plain";
          return (
            <g
              key={"c" + g.c}
              className={cls}
              {...pickProps(
                onPickComp && (() => onPickComp(g.c)),
                `Komparátor ${g.c + 1}: (x${w(c.a)}, x${w(c.b)})`,
              )}
              {...(onPickComp ? rove.item("c" + g.c) : {})}
            >
              <line
                className="sn-comp-hit"
                x1={g.x1}
                y1={g.y1}
                x2={g.x2}
                y2={g.y2}
              />
              <line
                className="sn-comp-line"
                x1={g.x1}
                y1={g.y1}
                x2={g.x2}
                y2={g.y2}
                markerEnd={off.has(g.c) ? undefined : marker(m)}
              />
              {isActive && res === "swap" && (
                <text
                  className="sn-comp-glyph"
                  x={(g.x1 + g.x2) / 2 + (v ? 0 : 9)}
                  y={(g.y1 + g.y2) / 2 + (v ? -6 : 0)}
                  textAnchor="middle"
                  dominantBaseline={v ? "auto" : "central"}
                  aria-hidden="true"
                >
                  ⇄
                </text>
              )}
            </g>
          );
        })}

        {gaps.slice(0, t).map((vals, g) =>
          vals.map((val, wi) => {
            const p = L.token(wi, g);
            return (
              <text
                key={`p${g}-${wi}`}
                className="sn-past"
                // vedle vodiče, ne přes něj: svisle vpravo od něj, vodorovně nad ním
                x={v ? p.x + 4 : p.x}
                y={v ? p.y : p.y - 6}
                textAnchor={v ? "start" : "middle"}
                dominantBaseline={v ? "central" : "auto"}
              >
                {val}
              </text>
            );
          }),
        )}

        {cur.map((val, wi) => {
          const id = curIds[wi];
          const p = L.token(wi, t);
          const moved = !!prevIds && prevIds[wi] !== id;
          const cls =
            "sn-token" +
            (zeroOne ? (val ? " z1" : " z0") : "") +
            (mountain ? (mountain[id] ? " hora" : " udoli") : "") +
            (sortedOut ? " sorted" : "") +
            (moved ? " moved" : "");
          return (
            <g
              key={"t" + id}
              data-flip={id}
              className={cls}
              style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
            >
              <circle r={L.tokenR} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                style={L.tokenR < 10 ? { fontSize: L.tokenR + 2 } : undefined}
              >
                {val}
              </text>
            </g>
          );
        })}

        {onToggleInput &&
          toggles &&
          input.map((val, wi) => {
            const p = L.token(wi, 0);
            return (
              <circle
                key={"i" + wi}
                className="sn-input"
                cx={p.x}
                cy={p.y}
                r={L.tokenR + 2}
                {...pickProps(
                  () => onToggleInput(wi),
                  `Vstup x${w(wi)} = ${val}, přepnout na ${1 - val}`,
                )}
                {...rove.item("i" + wi)}
              />
            );
          })}
      </svg>
    </div>
  );
}

const rectProps = (r: { x: number; y: number; w: number; h: number }) => ({
  x: r.x,
  y: r.y,
  width: r.w,
  height: r.h,
});
