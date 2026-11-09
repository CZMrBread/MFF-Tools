/**
 * Kresba výšek Goldbergova algoritmu (Průvodce 14.5): každý vrchol sítě ve vlastním sloupci (pořadí podle
 * kresby sítě, z vlevo, s vpravo), svisle jeho výška h na ose hladin 0…H. Rozsah hladin je pevný pro celý
 * běh (heightMax), takže se kresba mezi kroky nepřeměřuje – při zvednutí vrchol poskočí o hladinu výš
 * a jeho původní místo zůstane čárkovaně. Odznak „+x“ = přebytek, šipky = hrany s kladnou rezervou dolů
 * (jen po nich lze převádět), oranžová šipka s „+δ“ = převedení v tomto kroku.
 *
 * Kresba je jen k prohlížení: jedna zastávka Tabu, šipky po vrcholech (roving tabindex, čtečka přečte
 * výšku a přebytek). Rozložení počítá goldbergView.heightLayout (bez Reactu, testované).
 */
import { useId } from "react";
import { fmtNum } from "../graphs/graph";
import { lbl, type FlowNet } from "./flowNet";
import type { GoldbergState } from "./goldberg";
import { useRovingFocus } from "../../core/useRovingFocus";
import { useGraphFitHeight } from "../../views/graphFitHeight";
import { useWidth } from "../../views/useWidth";
import {
  goldbergStateFits,
  heightArcs,
  heightLayout,
  heightNodeName,
  levelLabelEvery,
} from "./goldbergView";

/** výška kresby mimo režim jedné obrazovky (telefon, testy): ~22 px na hladinu */
const levelPx = (hMax: number) => Math.max(220, Math.min(460, 52 + hMax * 22));
/**
 * meze výšky v režimu jedné obrazovky; dolní mez je malá, ať je kresba vždy nejvýš tak vysoká jako volné
 * místo (pod sebou se sítí, F-04) – hladiny se pak jen přiblíží, kresba se neořízne
 */
const FIT_MIN = 80;
const FIT_MAX = 560;

interface Props {
  net: FlowNet;
  state: GoldbergState | undefined;
  /** nejvyšší hladina pro celý běh (heightMax) – mezi kroky se nemění */
  hMax: number;
  /** pevná šířka / výška v px (testy, náhled); jinak podle obalu a volného místa v plátně */
  width?: number;
  height?: number;
  /** náhled na úvodní stránce: statický obrázek bez zastávek Tabu a bez rolí prvků */
  still?: boolean;
}

const HALO = {
  paintOrder: "stroke",
  stroke: "var(--algo-panel)",
  strokeWidth: 3,
} as const;

export function GoldbergHeightView({
  net,
  state,
  hMax,
  width,
  height,
  still = false,
}: Props) {
  const g = net.graph;
  const [wrapRef, measured] = useWidth();
  const fitH = useGraphFitHeight(wrapRef, FIT_MIN, FIT_MAX);
  const W = width ?? measured;
  const H = height ?? fitH ?? levelPx(hMax);
  const lay = heightLayout(net, hMax, W, H);
  const st = goldbergStateFits(net, state) ? state : undefined;
  const pos = lay.at(st);
  const arcs = heightArcs(net, st);
  const uid = useId().replace(/:/g, "");
  const rove = useRovingFocus(still ? [] : lay.columns.map((v) => `v${v}`));
  const r = lay.r;
  const font = r >= 14 ? 13 : 11;

  const marks = (v: number) => {
    const c: string[] = [];
    if (v === net.z || v === net.s) c.push("gb-term");
    if (st) {
      if (st.u === v) c.push("gb-current");
      else if (v !== net.z && v !== net.s && st.ex[v] > 0) c.push("gb-excess");
      if (st.lift?.v === v) c.push("gb-lift");
      if (st.cut?.A.includes(v)) c.push("gb-cut-a");
    }
    return c.join(" ");
  };

  /** úsečka mezi středy zkrácená o kroužky (konec o kus víc kvůli šipce) */
  const seg = (u: number, v: number, endGap = r + 2) => {
    const p = pos[u];
    const q = pos[v];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return {
      x1: p.x + (dx / d) * r,
      y1: p.y + (dy / d) * r,
      x2: q.x - (dx / d) * endGap,
      y2: q.y - (dy / d) * endGap,
    };
  };

  // popisky (a čáry) hladin: všechny, nebo při husté kresbě každá k-tá (hladina n vždy)
  const gap = lay.levelY(0) - lay.levelY(1);
  const every = levelLabelEvery(gap);
  const n = g.nodes.length;
  const levels = Array.from({ length: lay.hMax + 1 }, (_, k) => k);

  const name = `Výšky vrcholů: ${n} vrcholů ve sloupcích, svisle výška h (0 až ${lay.hMax}), zdroj ${lbl(g, net.z)} ve výšce ${n}`;

  return (
    <div className="gb-heights view-wrap" ref={wrapRef}>
      <svg
        className="gb-svg"
        width={lay.width}
        height={lay.height}
        viewBox={`0 0 ${lay.width} ${lay.height}`}
        role={still ? "img" : "group"}
        aria-label={name}
        {...(still ? {} : rove.group)}
      >
        <defs>
          {(["gb-down", "gb-push"] as const).map((c) => (
            <marker
              key={c}
              id={`${uid}-${c}`}
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="10"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" className={`gb-arrow ${c}`} />
            </marker>
          ))}
        </defs>
        <g className="gb-axis" aria-hidden="true">
          <text x={8} y={lay.top - 14} className="gb-axis-title">
            h
          </text>
          {levels.map((k) => {
            const y = lay.levelY(k);
            const isN = k === n;
            if (!isN && k % every !== 0) return null;
            return (
              <g key={k} className={isN ? "gb-level gb-level-n" : "gb-level"}>
                <line x1={lay.left - 6} x2={lay.width - 8} y1={y} y2={y} />
                {/* popisek k-té hladiny těsně pod n by se s „n = …“ překrýval */}
                {(isN || Math.abs(k - n) * gap >= 12) && (
                  <text x={lay.left - 10} y={y + 4} textAnchor="end">
                    {isN ? `n = ${n}` : k}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        <g aria-hidden="true">
          {g.edges.map((e) => {
            const s = seg(e.u, e.v, r);
            return <line key={e.id} className="gb-edge" {...s} />;
          })}
          {st?.lift && (
            <g className="gb-rise">
              <circle
                className="gb-ghost"
                cx={pos[st.lift.v].x}
                cy={lay.levelY(st.lift.from)}
                r={r}
              />
              <line
                x1={pos[st.lift.v].x}
                x2={pos[st.lift.v].x}
                y1={lay.levelY(st.lift.from) - r}
                y2={pos[st.lift.v].y + r + 2}
                markerEnd={`url(#${uid}-gb-push)`}
              />
            </g>
          )}
          {arcs.map((a) => {
            const s = seg(a.u, a.v);
            return (
              <g key={a.arc} className={`gb-arc ${a.cls}`}>
                <line {...s} markerEnd={`url(#${uid}-${a.cls})`} />
                {a.label && (
                  <text
                    x={(s.x1 + s.x2) / 2 + 6}
                    y={(s.y1 + s.y2) / 2 - 6}
                    className="gb-arc-label"
                    style={HALO}
                  >
                    {a.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        {lay.columns.map((v) => {
          const p = pos[v];
          return (
            <g
              key={v}
              className={`gb-node ${marks(v)}`.trim()}
              transform={`translate(${p.x} ${p.y})`}
              {...(still
                ? {}
                : {
                    ...rove.item(`v${v}`),
                    role: "img",
                    "aria-label": heightNodeName(net, st, v),
                  })}
            >
              <title>{lbl(g, v)}</title>
              <circle r={r} />
              <text
                y={font / 2 - 1}
                textAnchor="middle"
                className="gb-node-label"
                style={{ fontSize: font }}
              >
                {lbl(g, v)}
              </text>
            </g>
          );
        })}
        {st && (
          <g aria-hidden="true">
            {lay.columns
              .filter((v) => v !== net.z && st.ex[v] > 0)
              .map((v) => {
                const p = pos[v];
                const text = `+${fmtNum(st.ex[v])}`;
                const bw = 8 + text.length * 7;
                return (
                  <g
                    key={v}
                    className={
                      v === net.s ? "gb-badge gb-badge-sink" : "gb-badge"
                    }
                    transform={`translate(${p.x + r * 0.55} ${p.y - r - 13})`}
                  >
                    <rect width={bw} height={15} rx={7.5} />
                    <text x={bw / 2} y={11.5} textAnchor="middle">
                      {text}
                    </text>
                  </g>
                );
              })}
          </g>
        )}
      </svg>
    </div>
  );
}
