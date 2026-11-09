/**
 * Motýlková síť FFT podle Průvodce obr. 17.4 (str. 438): vlevo vstupy v pořadí bitového zrcadlení, sloupce
 * kroužků „±k“ po vrstvách, šikmé a rovné spoje motýlků, nad dráty dvojkové popisky podproblémů, na drátech
 * hodnoty po každé vrstvě a vpravo výstupy y_k. Geometrie v butterflyNetLayout.ts, data připravuje stránka
 * (FftNetPage). Aktivní vrstva je podbarvená, aktivní blok orámovaný, kroužky motýlku a jejich spoje
 * zvýrazněné; barvy se přelévají po dobu kroku přehrávače.
 */
import { useRovingFocus } from "../core/useRovingFocus";
import type { NetLayout } from "./butterflyNetLayout";
import { pickProps } from "./pick";

export interface ButterflyNetProps {
  layout: NetLayout;
  /** popisky vstupů shora („x₄“) */
  inLabels: readonly string[];
  /** popisky výstupů („y₀“) */
  outLabels: readonly string[];
  /** popisky kroužků po vrstvách a řádcích („+1“, „−0“) */
  gateLabels: readonly (readonly string[])[];
  /** dvojkové popisky nad dráty po sloupcích; null = nekreslit (nízký řádek) */
  bits: readonly (readonly string[])[] | null;
  /** hodnoty na drátech po sloupcích (0 = po zrcadlení, c = po vrstvě c); null = ještě nespočítané */
  values: readonly (readonly (string | null)[])[];
  /** plná přesnost hodnot do vysvětlivky */
  valueTitles?: readonly (readonly (string | null)[])[];
  /** aktivní vrstva 1 … log₂ n; 0 = vstupní úsek (zrcadlení); null = žádná */
  activeLayer: number | null;
  /** aktivní blok v aktivní vrstvě: první řádek a počet řádků (2b) */
  block: { start: number; size: number } | null;
  /** aktivní kroužky (řádky) v aktivní vrstvě */
  hot: readonly number[];
  /** řádky, jejichž hodnota ve sloupci activeLayer je právě spočítaná */
  fresh: readonly number[];
  /** vysvětlivka kroužku (α) */
  gateTitle?: (layer: number, row: number) => string;
  /** klik na kroužek (přechod na krok jeho motýlku) */
  onGate?: (layer: number, row: number) => void;
  /** zvětšení celé kresby (velký monitor) */
  zoom?: number;
  ariaLabel: string;
}

export function ButterflyNetView({
  layout: L,
  inLabels,
  outLabels,
  gateLabels,
  bits,
  values,
  valueTitles,
  activeLayer,
  block,
  hot,
  fresh,
  gateTitle,
  onGate,
  zoom = 1,
  ariaLabel,
}: ButterflyNetProps) {
  const rowH = L.n > 1 ? L.rowY[1] - L.rowY[0] : 30;
  const hotSet = new Set(hot);
  const freshSet = new Set(fresh);
  // hodnota nad drátem, když nad ním nejsou dvojkové popisky; jinak pod ním
  const valDy = bits ? 12 : -4;
  const band =
    activeLayer === null
      ? null
      : activeLayer === 0
        ? { x1: L.seg[0].x1 - 2, x2: L.seg[0].x2 + 2 }
        : {
            x1: L.dotX[activeLayer - 1] - 6,
            x2: L.circleX[activeLayer - 1] + L.r + 4,
          };
  /** konec úseku drátu sloupce c: tečka další vrstvy, nebo výstup */
  const segEnd = (c: number) => (c < L.layers ? L.dotX[c] : L.outX - 2);

  // kroužky jdou vybrat jen s onGate: pak je síť jedna zastávka Tabu, šipky chodí po kroužcích (D3);
  // pořadí čtení po řádcích
  const rove = useRovingFocus(
    onGate
      ? L.rowY.flatMap((_, row) => L.circleX.map((_, li) => `${li + 1}:${row}`))
      : [],
  );

  return (
    <div className="view-wrap bn-wrap">
      <svg
        className="bn-svg"
        viewBox={`0 0 ${L.W} ${L.H}`}
        width={Math.round(L.W * zoom)}
        height={Math.round(L.H * zoom)}
        role={onGate ? "group" : "img"}
        aria-label={ariaLabel}
        {...(onGate ? rove.group : {})}
      >
        {band && (
          <rect
            className="bn-band"
            x={band.x1}
            y={2}
            width={band.x2 - band.x1}
            height={L.H - 4}
            rx={6}
          />
        )}
        {block && activeLayer !== null && activeLayer > 0 && band && (
          <rect
            className="bn-block"
            x={band.x1 + 2}
            y={L.rowY[block.start] - rowH / 2 + 3}
            width={band.x2 - band.x1 - 4}
            height={(block.size - 1) * rowH + rowH - 6}
            rx={5}
          />
        )}

        {/* úseky drátů (sloupec c = hodnoty po vrstvě c) */}
        {L.seg.map((s, c) =>
          L.rowY.map((y, row) => (
            <line
              key={`w${c}-${row}`}
              data-col={c}
              className={
                "bn-wire" + (values[c]?.[row] == null ? " is-pending" : "")
              }
              x1={c === 0 ? s.x1 - 2 : s.x1}
              y1={y}
              x2={segEnd(c)}
              y2={y}
            />
          )),
        )}

        {/* spoje motýlků: z tečky rovně do svého kroužku a šikmo do kroužku partnera */}
        {L.links.map((l) => (
          <line
            key={`l${l.layer}-${l.gateRow}-${l.kind}`}
            className={
              "bn-link " +
              l.kind +
              (l.layer === activeLayer && hotSet.has(l.gateRow)
                ? " is-hot"
                : "")
            }
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
          />
        ))}
        {L.dotX.map((x, li) =>
          L.rowY.map((y, row) => (
            <circle
              key={`d${li}-${row}`}
              className="bn-dot"
              cx={x}
              cy={y}
              r={2.2}
            />
          )),
        )}

        {/* kroužky (hradla) */}
        {L.circleX.map((cx, li) => {
          const layer = li + 1;
          return L.rowY.map((cy, row) => {
            const isHot = layer === activeLayer && hotSet.has(row);
            const done = values[layer]?.[row] != null;
            const label = gateLabels[li]?.[row] ?? "";
            return (
              <g
                key={`g${layer}-${row}`}
                data-layer={layer}
                data-row={row}
                className={
                  "bn-gate" +
                  (isHot ? " is-hot" : done ? " is-done" : "") +
                  (onGate ? " pickable" : "")
                }
                transform={`translate(${cx} ${cy})`}
                {...pickProps(
                  onGate && (() => onGate(layer, row)),
                  `Kroužek ${label} ve vrstvě ${layer}, řádek ${row}`,
                )}
                {...(onGate
                  ? {
                      "aria-label": `Kroužek ${label} ve vrstvě ${layer}, řádek ${row} – přejít na krok jeho motýlku`,
                      ...rove.item(`${layer}:${row}`),
                    }
                  : {})}
              >
                {gateTitle && <title>{gateTitle(layer, row)}</title>}
                <circle r={L.r} />
                <text textAnchor="middle" y={3.5}>
                  {label}
                </text>
              </g>
            );
          });
        })}

        {/* dvojkové popisky nad dráty (obr. 17.4) */}
        {bits &&
          L.seg.map((s, c) =>
            L.rowY.map((y, row) => (
              <text
                key={`b${c}-${row}`}
                data-col={c}
                className="bn-bits"
                x={s.x1 + 6}
                y={y - 4}
              >
                {bits[c]?.[row]}
              </text>
            )),
          )}

        {/* hodnoty na drátech */}
        {L.seg.map((s, c) =>
          L.rowY.map((y, row) => {
            const v = values[c]?.[row];
            if (v == null) return null;
            const t = valueTitles?.[c]?.[row];
            return (
              <text
                key={`v${c}-${row}`}
                data-col={c}
                data-row={row}
                className={
                  "bn-val" +
                  (c === activeLayer && freshSet.has(row) ? " is-new" : "")
                }
                x={(s.x1 + segEnd(c)) / 2}
                y={y + valDy}
                textAnchor="middle"
              >
                {t && <title>{t}</title>}
                {v}
              </text>
            );
          }),
        )}

        {L.rowY.map((y, row) => (
          <text
            key={`i${row}`}
            className="bn-in"
            x={L.inX}
            y={y + 4}
            textAnchor="end"
          >
            {inLabels[row]}
          </text>
        ))}
        {L.rowY.map((y, row) => (
          <text key={`o${row}`} className="bn-out" x={L.outX + 3} y={y + 4}>
            {outLabels[row]}
          </text>
        ))}
      </svg>
    </div>
  );
}
