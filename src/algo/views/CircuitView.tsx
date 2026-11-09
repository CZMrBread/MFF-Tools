/**
 * Kresba hradlové sítě (SVG) jako v Průvodci: krabičky hradel se znakem ∧ ∨ ¬ ⊕, kroužky vstupů
 * a výstupů, pravoúhlé vodiče se šipkou do portu a tečkou v rozvětvení, tečkované vrstvy S₀ … Sₖ.
 * Při výpočtu nese vodič hodnotu zdroje (1 = silná čára, 0 = tenká, neznámá = čárkovaná), aktivní
 * vrstva je podbarvená. Geometrie je v circuitLayout.ts, úpravy myší v CircuitEditor.tsx (předá
 * `interaction`). Bez `interaction` a `onToggleInput` je kresba jen obrázek (náhled úvodní stránky).
 */
import {
  useId,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type Ref,
} from "react";
import {
  arityOf,
  circuitLayers,
  GATE_INFO,
  subscript,
  type Bit,
  type Circuit,
  type CNode,
  type TruthTable,
} from "../algos/parallel/circuit";
import type { CircuitSelection } from "./circuitEdit";
import {
  BAND_LABEL,
  circuitBounds,
  inPort,
  layerBands,
  nodeBox,
  outPort,
  PIN_R,
  routeWires,
  type Bounds,
  type P2,
  type PortHit,
} from "./circuitLayout";
import { useRovingFocus } from "../core/useRovingFocus";
import { useWidth } from "./useWidth";

export type CircuitTarget =
  | { kind: "node"; id: string }
  /** výstupní port vrcholu (začátek vodiče) */
  | { kind: "port"; id: string }
  | { kind: "wire"; to: string; port: number }
  | { kind: "empty" };

/** Obsluha úprav na plátně – dodává CircuitEditor. */
export interface CircuitInteraction {
  selected: CircuitSelection | null;
  source: string | null;
  /** tažený vodič: z výstupního portu k ukazateli, cílový port pod ukazatelem */
  wirePreview: { from: P2; to: P2; target: PortHit | null } | null;
  onPointerDown: (e: PointerEvent<Element>, t: CircuitTarget) => void;
  onPointerMove: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerCancel: (e: PointerEvent<SVGSVGElement>) => void;
  onNodeKey: (e: KeyboardEvent, id: string) => void;
  onWireKey: (e: KeyboardEvent, to: string, port: number) => void;
  onContextMenu: (e: MouseEvent, t: CircuitTarget) => void;
}

export interface CircuitViewProps {
  circuit: Circuit;
  /** hodnoty vrcholů v aktuálním kroku (null = ještě neznámá); bez nich se kreslí jen síť */
  values?: Readonly<Record<string, Bit | null>>;
  /** vrstva S_t – vrcholy počítané v tomto taktu */
  active?: readonly string[];
  /** bity vstupů (kroužek vstupu je ukazuje i mimo výpočet) */
  bits?: Readonly<Record<string, Bit>>;
  /** výpočet doběhl – výstupy jako výsledek */
  done?: boolean;
  /** tečkované vrstvy S₀ … Sₖ (jinak vrstva malým štítkem u vrcholu) */
  showLayers?: boolean;
  /** režim výpočtu: klik / Enter na vstup přepne 0 ↔ 1 (mezerník = přehrávač, D3) */
  onToggleInput?: (id: string) => void;
  interaction?: CircuitInteraction;
  /** výřez kresby (editor ho drží během tahu); jinak podle sítě */
  viewBox?: Bounds;
  /** šířka v px (testy, náhled); jinak podle obalu */
  width?: number;
  ariaLabel?: string;
  svgRef?: Ref<SVGSVGElement>;
  /** náhled: přirozená velikost, bez měření obalu */
  still?: boolean;
}

const WIRE_CLASSES = ["w1", "w0", "wu", "we"] as const;
type WireClass = (typeof WIRE_CLASSES)[number];

/** „x1“ → x s dolním indexem 1 (jako x₁ v knize) */
function NameText({
  name,
  ...rest
}: { name: string } & Record<string, unknown>) {
  const m = /^([A-Za-z]+?)(\d+)$/.exec(name);
  return (
    <text {...rest}>
      {m ? (
        <>
          {m[1]}
          <tspan className="csub" dy="3">
            {m[2]}
          </tspan>
        </>
      ) : (
        name
      )}
    </text>
  );
}

const pathD = (pts: readonly P2[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");

export function CircuitView({
  circuit,
  values,
  active = [],
  bits,
  done = false,
  showLayers = true,
  onToggleInput,
  interaction,
  viewBox,
  width,
  ariaLabel,
  svgRef,
  still = false,
}: CircuitViewProps) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, measured] = useWidth();
  const flow = circuit.flow ?? "right";
  const editing = !!interaction;
  const L = circuitLayers(circuit);
  // pruhy vrstev jen při výpočtu (při kreslení by poskakovaly) – jinak štítek vrstvy u vrcholu
  const bands = showLayers && !editing ? layerBands(circuit, L) : null;
  const vb = viewBox ?? circuitBounds(circuit, { bandLabels: !!bands });
  const natural = Math.max(1, vb.w);
  const avail = width ?? (still ? natural : measured);
  const W = Math.round(
    Math.max(natural * 0.75, Math.min(avail, natural * 1.8)),
  );
  const H = Math.round((W * vb.h) / natural);
  const routing = routeWires(circuit);
  const byId = new Map(circuit.nodes.map((n) => [n.id, n]));
  const activeSet = new Set(active);
  const hotLayer = active.length ? L[active[0]] : undefined;

  const valueOf = (id: string): Bit | null => {
    if (values) return values[id] ?? null;
    const n = byId.get(id);
    return n?.kind === "in" && bits ? (bits[id] ?? 0) : null;
  };
  const wireClass = (from: string): WireClass => {
    if (!values) return "we";
    const v = values[from];
    return v === 1 ? "w1" : v === 0 ? "w0" : "wu";
  };
  const sel = interaction?.selected;
  const isSelNode = (id: string) => sel?.kind === "node" && sel.id === id;
  const isSelWire = (to: string, port: number) =>
    sel?.kind === "wire" && sel.to === to && sel.port === port;
  const hoverPort = interaction?.wirePreview?.target ?? null;

  // pruhy vrstev: dělicí čáry napříč kresbou, popisky pod ní (tok doprava) / vlevo (tok dolů)
  const cross =
    flow === "down"
      ? { lo: vb.x, hi: vb.x + vb.w }
      : { lo: vb.y, hi: vb.y + vb.h };
  const bandEdges = bands
    ? [
        flow === "down" ? vb.y : vb.x,
        ...bands.separators,
        flow === "down" ? vb.y + vb.h : vb.x + vb.w,
      ]
    : [];
  const hotIndex =
    bands && hotLayer !== undefined
      ? bands.labels.findIndex((l) => l.layer === hotLayer)
      : -1;
  const line = (u: number, a: number, b: number) =>
    flow === "down"
      ? { x1: a, y1: u, x2: b, y2: u }
      : { x1: u, y1: a, x2: u, y2: b };
  const labelPos = (u: number) =>
    flow === "down"
      ? { x: vb.x + BAND_LABEL / 2 + 4, y: u + 4 }
      : { x: u, y: vb.y + vb.h - 8 };

  const interactive = editing || !!onToggleInput;
  // roving tabindex (D3): kresba je jedna zastávka Tabu – šipky chodí po vrcholech (v úpravách i po
  // vodičích), Shift+šipky posunou hradlo (CircuitEditor), Enter = vodič / přepnutí vstupu
  const rove = useRovingFocus(
    editing
      ? [
          ...circuit.nodes.map((n) => `n:${n.id}`),
          ...routing.wires.map((w) => `w:${w.key}`),
        ]
      : onToggleInput
        ? circuit.nodes.filter((n) => n.kind === "in").map((n) => `n:${n.id}`)
        : [],
  );
  const name =
    ariaLabel ??
    `Hradlová síť: ${circuit.nodes.filter((n) => n.kind === "in").length} vstupy, ${circuit.nodes.filter((n) => n.kind === "gate").length} hradel`;

  const nodeAttrs = (n: CNode) => {
    if (editing) {
      const what =
        n.kind === "in"
          ? "Vstup"
          : n.kind === "out"
            ? "Výstup"
            : `Hradlo ${GATE_INFO[n.fn ?? "and"].name}`;
      return {
        ...rove.item(`n:${n.id}`),
        role: "button",
        "aria-label": `${what} ${n.id} – Enter = spojit vodičem, Delete = smazat, Shift+šipky = posun`,
        onPointerDown: (e: PointerEvent<Element>) =>
          interaction!.onPointerDown(e, { kind: "node", id: n.id }),
        onKeyDown: (e: KeyboardEvent) => interaction!.onNodeKey(e, n.id),
        onContextMenu: (e: MouseEvent) =>
          interaction!.onContextMenu(e, { kind: "node", id: n.id }),
      };
    }
    if (n.kind === "in" && onToggleInput) {
      const v = valueOf(n.id) ?? 0;
      return {
        ...rove.item(`n:${n.id}`),
        role: "button",
        "aria-pressed": v === 1,
        "aria-label": `Vstup ${n.id} = ${v}, přepnout`,
        onClick: () => onToggleInput(n.id),
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          e.stopPropagation();
          onToggleInput(n.id);
        },
      };
    }
    return {};
  };

  return (
    <div className="circuit-wrap view-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className={
          "circuit-svg" +
          (editing ? " editing" : "") +
          (onToggleInput && !editing ? " toggling" : "")
        }
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        width={W}
        height={H}
        role={interactive ? "group" : "img"}
        aria-label={name}
        {...(interactive ? rove.group : {})}
        onPointerMove={interaction?.onPointerMove}
        onPointerUp={interaction?.onPointerUp}
        onPointerCancel={interaction?.onPointerCancel}
        onLostPointerCapture={interaction?.onPointerCancel}
      >
        <defs>
          {WIRE_CLASSES.map((c) => (
            <marker
              key={c}
              id={`${uid}-m-${c}`}
              className={`cmarker ${c}`}
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="9"
              markerHeight="7"
              preserveAspectRatio="none"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          ))}
        </defs>
        {editing && (
          <rect
            className="circuit-bg"
            x={vb.x}
            y={vb.y}
            width={vb.w}
            height={vb.h}
            onPointerDown={(e) =>
              interaction.onPointerDown(e, { kind: "empty" })
            }
          />
        )}
        {bands && (
          <g className="clayers" aria-hidden="true">
            {hotIndex >= 0 && (
              <rect
                className="clayer-hot"
                {...(flow === "down"
                  ? {
                      x: vb.x,
                      y: bandEdges[hotIndex],
                      width: vb.w,
                      height: bandEdges[hotIndex + 1] - bandEdges[hotIndex],
                    }
                  : {
                      x: bandEdges[hotIndex],
                      y: vb.y,
                      width: bandEdges[hotIndex + 1] - bandEdges[hotIndex],
                      height: vb.h,
                    })}
              />
            )}
            {bands.separators.map((u, i) => (
              <line
                key={i}
                className="clayer-sep"
                {...line(u, cross.lo, cross.hi)}
              />
            ))}
            {bands.labels.map((l, i) => (
              <text
                key={l.layer}
                className={"clayer-label" + (i === hotIndex ? " hot" : "")}
                textAnchor="middle"
                {...labelPos(l.at)}
              >
                S
                <tspan className="csub" dy="3">
                  {l.layer}
                </tspan>
              </text>
            ))}
          </g>
        )}
        <g className="cwires">
          {routing.wires.map((w) => {
            const cls = wireClass(w.from);
            const d = pathD(w.points);
            const selected = isSelWire(w.to, w.port);
            return (
              <g
                key={w.key}
                className={`cwire ${cls}` + (selected ? " selected" : "")}
              >
                <path
                  className="cwire-line"
                  d={d}
                  markerEnd={`url(#${uid}-m-${cls})`}
                />
                {editing && (
                  <path
                    className={"cwire-hit" + (selected ? " selected" : "")}
                    d={d}
                    data-wire={w.key}
                    {...rove.item(`w:${w.key}`)}
                    role="button"
                    aria-label={`Vodič ${w.from} → ${w.to} (vstup ${w.port + 1}) – Delete = smazat`}
                    onPointerDown={(e) =>
                      interaction.onPointerDown(e, {
                        kind: "wire",
                        to: w.to,
                        port: w.port,
                      })
                    }
                    onKeyDown={(e) => interaction.onWireKey(e, w.to, w.port)}
                    onContextMenu={(e) =>
                      interaction.onContextMenu(e, {
                        kind: "wire",
                        to: w.to,
                        port: w.port,
                      })
                    }
                  />
                )}
              </g>
            );
          })}
          {routing.junctions.map((p, i) => (
            <circle
              key={i}
              className={`cjunction ${wireClass(p.from)}`}
              cx={p.x}
              cy={p.y}
              r={3}
            />
          ))}
        </g>
        <g className="cnodes">
          {circuit.nodes.map((n) => {
            const b = nodeBox(n, flow);
            const v = valueOf(n.id);
            const cls =
              `cnode cnode-${n.kind}` +
              (activeSet.has(n.id) ? " active" : "") +
              (isSelNode(n.id) ? " selected" : "") +
              (interaction?.source === n.id ? " source" : "") +
              (n.kind === "out" && done ? " done" : "") +
              (v === 1 ? " v1" : v === 0 ? " v0" : "");
            const op = outPort(n, flow);
            const tag =
              // štítek vrstvy u vrcholu (vlastní kresba); vstupy jsou vždy S₀
              !bands && showLayers && n.kind !== "in" && L[n.id] !== undefined
                ? `S${subscript(L[n.id])}`
                : null;
            return (
              <g key={n.id} className={cls} data-node={n.id} {...nodeAttrs(n)}>
                <title>
                  {n.kind === "gate"
                    ? `${n.id} = ${n.fn}(${n.inputs.map((s) => s ?? "_").join(", ")})`
                    : n.kind === "in"
                      ? `vstup ${n.id}`
                      : `výstup ${n.id}`}
                  {L[n.id] !== undefined
                    ? ` – vrstva S${subscript(L[n.id])}`
                    : ""}
                </title>
                <rect
                  className="cnode-hit"
                  x={b.x0 - 6}
                  y={b.y0 - 6}
                  width={b.x1 - b.x0 + 12}
                  height={b.y1 - b.y0 + 12}
                />
                {n.kind === "gate" ? (
                  <>
                    <rect
                      className="cgate-box"
                      x={b.x0}
                      y={b.y0}
                      width={b.x1 - b.x0}
                      height={b.y1 - b.y0}
                    />
                    <text
                      className="cgate-sym"
                      x={n.x}
                      y={n.y + 6}
                      textAnchor="middle"
                    >
                      {GATE_INFO[n.fn ?? "and"].symbol}
                    </text>
                    <NameText
                      name={n.id}
                      className="cname"
                      // tok shora dolů: vodiče vstupují shora – jméno vlevo od hradla
                      textAnchor={flow === "down" ? "end" : "start"}
                      x={flow === "down" ? b.x0 - 3 : b.x0}
                      y={flow === "down" ? b.y0 + 10 : b.y0 - 4}
                    />
                    {v !== null && op && (
                      <text
                        className="cval"
                        x={flow === "down" ? op.x + 6 : op.x + 3}
                        y={flow === "down" ? op.y + 12 : op.y - 5}
                      >
                        {v}
                      </text>
                    )}
                  </>
                ) : (
                  <>
                    <circle className="cpin" cx={n.x} cy={n.y} r={PIN_R} />
                    {v !== null && (
                      <text
                        className="cpin-val"
                        x={n.x}
                        y={n.y + 4}
                        textAnchor="middle"
                      >
                        {v}
                      </text>
                    )}
                    <NameText
                      name={n.id}
                      className="clabel"
                      textAnchor={
                        flow === "down"
                          ? "middle"
                          : n.kind === "in"
                            ? "end"
                            : "start"
                      }
                      x={
                        flow === "down"
                          ? n.x
                          : n.kind === "in"
                            ? n.x - PIN_R - 5
                            : n.x + PIN_R + 5
                      }
                      y={
                        flow === "down"
                          ? n.kind === "in"
                            ? n.y - PIN_R - 6
                            : n.y + PIN_R + 15
                          : n.y + 5
                      }
                    />
                  </>
                )}
                {tag && (
                  <text
                    className={
                      "clayer-tag" + (activeSet.has(n.id) ? " hot" : "")
                    }
                    x={b.x1 + 2}
                    y={b.y0 - (n.kind === "gate" ? 4 : 0)}
                  >
                    {tag}
                  </text>
                )}
                {editing &&
                  Array.from({ length: arityOf(n) }, (_, j) => {
                    const p = inPort(n, j, flow);
                    const free = n.inputs[j] == null;
                    const hover =
                      hoverPort?.node === n.id && hoverPort.port === j;
                    return (
                      <circle
                        key={j}
                        className={
                          "cport-in" +
                          (free ? " free" : "") +
                          (hover ? " hover" : "")
                        }
                        cx={p.x}
                        cy={p.y}
                        r={hover ? 5 : 3.5}
                      />
                    );
                  })}
                {editing && op && (
                  <circle
                    className="cport-out"
                    data-port={n.id}
                    cx={op.x}
                    cy={op.y}
                    r={6}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      interaction.onPointerDown(e, { kind: "port", id: n.id });
                    }}
                  />
                )}
              </g>
            );
          })}
        </g>
        {interaction?.wirePreview && (
          <line
            className={
              "cwire-preview" + (interaction.wirePreview.target ? " ok" : "")
            }
            x1={interaction.wirePreview.from.x}
            y1={interaction.wirePreview.from.y}
            x2={interaction.wirePreview.to.x}
            y2={interaction.wirePreview.to.y}
          />
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ pravdivostní tabulka */

export interface TruthTableViewProps {
  table: TruthTable;
  /** bity aktuálního vstupu (řádek se zvýrazní) */
  current?: string;
  /** klik / Enter na řádek = tento vstup */
  onPick?: (bits: Bit[]) => void;
}

/** Pravdivostní tabulka sítě: vstupy | výstupy, řádek aktuálního vstupu zvýrazněný. */
export function TruthTableView({
  table,
  current,
  onPick,
}: TruthTableViewProps) {
  return (
    <div className="gtable ctruth">
      <div className="gtable-title">Pravdivostní tabulka</div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {table.inputs.map((id) => (
                <th key={"i" + id} scope="col">
                  {id}
                </th>
              ))}
              {table.outputs.map((id, k) => (
                <th
                  key={"o" + id}
                  scope="col"
                  className={k === 0 ? "ctruth-out" : undefined}
                >
                  {id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => {
              const key = r.bits.join("");
              const hl = key === current;
              const label = `${table.inputs.map((id, i) => `${id} = ${r.bits[i]}`).join(", ")} → ${table.outputs.map((id, i) => `${id} = ${r.outs[i]}`).join(", ")}`;
              const pick = onPick ? () => onPick(r.bits) : undefined;
              return (
                <tr
                  key={key}
                  className={
                    (hl ? "hl" : "") + (pick ? " pickable" : "") || undefined
                  }
                  // řádek zůstává řádkem tabulky (buňky s vazbou na záhlaví); myší jde kliknout kamkoli,
                  // klávesnicí na tlačítko v první buňce
                  onClick={pick}
                  aria-current={hl || undefined}
                >
                  {r.bits.map((b, i) => (
                    <td key={"i" + i}>
                      {pick && i === 0 ? (
                        <button
                          type="button"
                          className="ctruth-use"
                          aria-label={`${label} – použít jako vstup`}
                          aria-pressed={hl}
                          onClick={(e) => {
                            e.stopPropagation();
                            pick();
                          }}
                        >
                          {b}
                        </button>
                      ) : (
                        b
                      )}
                    </td>
                  ))}
                  {r.outs.map((b, i) => (
                    <td
                      key={"o" + i}
                      className={
                        (i === 0 ? "ctruth-out " : "") + (b ? "c1" : "c0")
                      }
                    >
                      {b}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
