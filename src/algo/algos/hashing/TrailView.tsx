/**
 * Stopa operace pod řadou buněk (E6) ve sdílené kresbě .viz-trail (index.css, „sdílené kresby“): řádek
 * pod sloupcem každé prohlížené buňky, řádky jdou shora dolů a spojují je šipky. Otevřená adresace kreslí
 * posloupnost sond, kukačka cestu vyhazování. Před první operací je místo vyhrazené a ukazuje nápovědu.
 * Je to jen obrázek (aria-hidden): průběh popisuje hláška kroku, výběr klíčů zůstává na buňkách nahoře
 * (roving tabindex tabulky se nemění).
 */
import { useId } from "react";
import { fitCellText } from "./cellText";
import { TRAIL_GAP, trailBoxH, trailFont, type TrailStep } from "./trail";

/** Hrot šipek stopy (obyčejný a zvýrazněný) – `id` je předpona z useId. */
export function TrailMarkers({ id }: { id: string }) {
  return (
    <defs>
      {(["", "is-hot"] as const).map((hot) => (
        <marker
          key={hot}
          id={`${id}${hot}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" className={"tr-head " + hot} />
        </marker>
      ))}
    </defs>
  );
}

/**
 * Nápověda ve vyhrazeném místě, dokud je stopa prázdná: přerušovaný rámeček přes šířku řady, tečkované
 * dráhy pod buňkami (`lanes` = x středů, kudy povede stopa) a text nahoře (.tr-label na podkladu plátna).
 * Na malém místě (pod 28 px) se nekreslí.
 */
export function TrailHint({
  x,
  y,
  width,
  height,
  text,
  lanes = [],
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  lanes?: readonly number[];
}) {
  if (height < 28 || width <= 0) return null;
  // úzká řada (telefon, malé m): text se zúží, aby nepřetekl rámeček
  const textW = text.length * 0.55 * 13;
  const narrow = textW > width - 12;
  const ty = y + Math.min(height / 2, 60);
  const bgW = Math.min(width - 4, textW + 20);
  return (
    <>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill="none"
        stroke="var(--algo-border)"
        strokeDasharray="4 4"
      />
      {lanes.map((lx, i) => (
        <line
          key={i}
          className="tr-lane"
          x1={lx}
          y1={y + 6}
          x2={lx}
          y2={y + height - 6}
          stroke="var(--algo-border)"
          strokeDasharray="2 6"
        />
      ))}
      <rect
        x={x + (width - bgW) / 2}
        y={ty - 11}
        width={bgW}
        height={22}
        rx={4}
        fill="var(--algo-panel)"
      />
      <text
        className="tr-label"
        x={x + width / 2}
        y={ty}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 13 }}
        {...(narrow
          ? { textLength: width - 12, lengthAdjust: "spacingAndGlyphs" }
          : {})}
      >
        {text}
      </text>
    </>
  );
}

/**
 * Stopa v SVG souřadnicích řady buněk: buňka i začíná na x = 5 + i·W (šířka obdélníku W − 3), stopa na y = top.
 * Z dlouhé stopy kreslí jen posledních `shown` řádků. Probíhající krok (poslední řádek bez výsledku) je
 * is-hot, šipka k poslednímu řádku také. `height` je vyhrazené místo (pro nápovědu), `cols` počet buněk.
 */
export function TrailView({
  steps,
  W,
  top,
  rowH,
  shown,
  height,
  cols,
  hint,
}: {
  steps: readonly TrailStep[];
  W: number;
  top: number;
  rowH: number;
  shown: number;
  height: number;
  cols: number;
  hint: string;
}) {
  // id do url(#…) jen z bezpečných znaků (useId v Reactu 19 vrací např. „«r1»“)
  const id = "trail" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (steps.length === 0)
    return height > 0 ? (
      <g className="viz-trail" aria-hidden="true">
        <TrailHint
          x={5}
          y={top + TRAIL_GAP}
          width={cols * W - 3}
          height={height - TRAIL_GAP - 2}
          text={hint}
          lanes={Array.from(
            { length: cols },
            (_, i) => 5 + i * W + (W - 3) / 2,
          )}
        />
      </g>
    ) : null;
  if (shown <= 0) return null;
  const visible = steps.slice(steps.length - shown);
  const boxH = trailBoxH(rowH);
  const font = trailFont(boxH);
  const cx = (cell: number) => 5 + cell * W + (W - 3) / 2;
  const y = (r: number) => top + TRAIL_GAP + r * rowH;
  const lastR = visible.length - 1;
  return (
    <g className="viz-trail" aria-hidden="true">
      <TrailMarkers id={id} />
      {visible.slice(1).map((s, r) => {
        const hot = r + 1 === lastR ? " is-hot" : "";
        return (
          <path
            key={`a${steps.length - shown + r}`}
            className={"tr-arrow" + hot}
            d={`M${cx(visible[r].cell)},${y(r) + boxH} L${cx(s.cell)},${y(r + 1)}`}
            markerEnd={`url(#${id}${hot.trim()})`}
          />
        );
      })}
      {visible.map((s, r) => {
        // poslední řádek bez výsledku (sonda / přesun právě probíhá) je zvýrazněný
        const state =
          r === lastR && (s.state === "" || s.state === "is-done")
            ? "is-hot"
            : s.state;
        return (
          <g
            key={steps.length - shown + r}
            className={"tr-cell" + (state ? " " + state : "")}
            transform={`translate(${5 + s.cell * W}, ${y(r)})`}
          >
            <rect width={W - 3} height={boxH} rx={3} />
            <text
              x={(W - 3) / 2}
              y={boxH / 2}
              textAnchor="middle"
              dominantBaseline="central"
              {...fitCellText(s.label, W - 3, font)}
            >
              {s.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
