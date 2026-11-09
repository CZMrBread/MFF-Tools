/**
 * Kresby kukaččího hešování a Bloomova filtru – sdílí je stránka (CuckooBloomPage.tsx, líně načítaná) a náhledy na úvodní stránce (landing/previews.tsx).
 */
import { useRovingFocus } from "../../core/useRovingFocus";
import { pickProps } from "../../views/pick";
import { useWidth } from "../../views/useWidth";
import { bloomBits, type BloomState } from "./bloom";
import { fitCellText } from "./cellText";
import {
  cuckooTrailSteps,
  TRAIL_CAP_MIN,
  trailBox,
  trailBoxH,
  trailFont,
} from "./trail";
import { TrailHint, TrailView } from "./TrailView";
import { useCanvasRoom } from "./useCanvasRoom";
import { type CuckooState } from "./cuckoo";
import {
  bitRows,
  BLOOM_LABEL_W,
  bloomLayout,
  bloomMatrix,
  CELL_PAD,
  keysWord,
  probeCell,
  trailRows,
} from "./ui";

export function CuckooView({
  st,
  onPick,
}: {
  st: CuckooState;
  /** klik na klíč vyplní x v nabídce operací */
  onPick?: (key: number) => void;
}) {
  const [ref, avail] = useWidth();
  // na jednu obrazovku: stopa vyhazování pod buňkami dostane jen zbylou výšku plátna (E6)
  const room = useCanvasRoom(ref);
  // buňky vyplní šířku plátna (36–72 px), písmo úměrně (TREEHASH-03)
  const { w: W, h: H, font } = probeCell(st.m, avail);
  const width = st.m * W + CELL_PAD;
  const rowsH = 30 + H + 24;
  // místo pro stopu je vyhrazené už před první operací (nápověda); řádky jako pro aspoň 6 přesunů
  const trail = trailBox(
    st.trail.length,
    room === null ? null : room - rowsH,
    Math.max(st.trail.length, TRAIL_CAP_MIN),
    true,
  );
  const height = rowsH + trail.height;
  const cx = (i: number) => 5 + i * W + (W - 3) / 2;
  // vybrat jde jen buňku s klíčem: pak je tabulka jedna zastávka Tabu, šipky chodí po buňkách (D3)
  const rove = useRovingFocus(
    onPick ? st.cells.flatMap((c, i) => (c === null ? [] : [i])) : [],
  );
  return (
    <div className="view-wrap" ref={ref}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={"array-svg" + (onPick ? " pickable" : "")}
        role={onPick ? "group" : "img"}
        aria-label={`Kukaččí tabulka s ${st.m} buňkami, ${keysWord(st.n)}`}
        {...(onPick ? rove.group : {})}
      >
        <defs>
          <marker
            id="ckarrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="var(--algo-c-swap)" />
          </marker>
        </defs>
        {st.cells.map((c, i) => {
          const label = c === null ? "" : String(c);
          const pick = onPick && c !== null ? () => onPick(c) : undefined;
          return (
            <g
              key={i}
              className={
                "box " +
                (st.marks[i] ?? (c === null ? "box-free" : "")) +
                (pick ? " pickable" : "")
              }
              transform={`translate(${5 + i * W}, 30)`}
              {...pickProps(pick, `buňka ${i}, klíč ${label}`)}
              {...(pick ? rove.item(i) : {})}
            >
              <rect width={W - 3} height={H} rx={4} />
              {/* dlouhé klíče se do úzké buňky vejdou díky zmenšení / zúžení písma */}
              <text
                x={(W - 3) / 2}
                y={H / 2 + font * 0.36}
                textAnchor="middle"
                {...fitCellText(label, W - 3, font)}
              >
                {label}
              </text>
              <text
                x={(W - 3) / 2}
                y={H + 17}
                textAnchor="middle"
                className="bar-index"
              >
                {i}
              </text>
            </g>
          );
        })}
        {st.arrow && (
          <path
            d={`M${cx(st.arrow.from)},28 Q${(cx(st.arrow.from) + cx(st.arrow.to)) / 2},10 ${cx(st.arrow.to)},28`}
            fill="none"
            stroke="var(--algo-c-swap)"
            strokeWidth={2}
            markerEnd="url(#ckarrow)"
          />
        )}
        <TrailView
          steps={cuckooTrailSteps(st.trail)}
          W={W}
          top={rowsH}
          rowH={trail.rowH}
          shown={trail.shown}
          height={trail.height}
          cols={st.m}
          hint="Tady se při Insert ukáže cesta vyhazování (shora dolů)"
        />
      </svg>
    </div>
  );
}

/** výška záhlaví matice „klíč → bity“ pod filtrem (px) */
const BLOOM_HEAD_H = 22;

export function BloomView({ st }: { st: BloomState }) {
  const [ref, avail] = useWidth();
  // na jednu obrazovku: matice klíčů pod filtrem dostane zbylou výšku plátna
  const room = useCanvasRoom(ref);
  // na desktopu filtr v jedné řadě se sloupcem klíčů vlevo a pod ním matice „klíč → bity“ přes zbytek
  // plátna; dlouhý filtr (m = 64), telefon a náhled na úvodní stránce: řady jako dřív, bez matice
  // (TREEHASH-03)
  const fitted = bloomLayout(st.m, avail);
  const {
    single,
    perRow,
    rows,
    w: W,
    x0,
  } = room !== null
    ? fitted
    : { single: false, ...bitRows(st.m, avail, 20, 48, 32), x0: 5 };
  const BH = Math.min(40, Math.max(28, Math.round(W * 0.8)));
  const font = W < 28 ? 12 : Math.min(18, Math.round(W * 0.4));
  const ROW = BH + 22;
  const width = x0 - 5 + perRow * W + CELL_PAD;
  const bitsH = rows * ROW + 6;
  const matrix = single ? bloomMatrix(st) : [];
  const count = matrix.length;
  // místo pro matici: celý zbytek plátna (i bez klíčů – nápověda)
  const matrixH = single && room !== null ? Math.max(0, room - bitsH) : 0;
  // řádky podle počtu klíčů + jednoho dalšího (Insert přidá řádek bez skoku), aspoň 4 – i na nízkém
  // plátně (1280 × 720) jsou tři výchozí klíče čitelné
  const { rowH, shown } = trailRows(
    count,
    matrixH - BLOOM_HEAD_H,
    Math.max(count + 1, 4),
  );
  // z dlouhé matice jen posledních `shown` řádků; zvýrazněný klíč zůstane vidět vždy
  let visible = matrix.slice(count - shown);
  const hotRow = matrix.find((r) => r.hot);
  if (hotRow && shown > 0 && !visible.includes(hotRow))
    visible = [hotRow, ...visible.slice(1)];
  const boxH = trailBoxH(rowH);
  const cellFont = trailFont(boxH);
  const mTop = bitsH + BLOOM_HEAD_H;
  const height = bitsH + matrixH;
  const cx = (bit: number) => x0 + bit * W + (W - 2) / 2;
  return (
    <div className="view-wrap" ref={ref}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="array-svg"
        role="img"
        aria-label={`Bloomův filtr, ${st.m} bitů, jedniček ${st.bits.filter((b) => b).length}`}
      >
        {st.bits.map((b, i) => (
          <g
            key={i}
            className={"box " + (st.marks[i] ?? (b ? "box-one" : "box-free"))}
            transform={`translate(${x0 + (i % perRow) * W}, ${8 + Math.floor(i / perRow) * ROW})`}
          >
            <rect width={W - 2} height={BH} rx={3} />
            <text
              x={(W - 2) / 2}
              y={BH / 2 + font * 0.36}
              textAnchor="middle"
              style={{ fontSize: font }}
            >
              {b}
            </text>
            <text
              x={(W - 2) / 2}
              y={BH + 14}
              textAnchor="middle"
              className="bar-index"
            >
              {i}
            </text>
          </g>
        ))}
        {single && (
          <g className="viz-trail" aria-hidden="true">
            {count === 0 ? (
              <TrailHint
                x={5}
                y={bitsH}
                width={width - CELL_PAD}
                height={matrixH - 4}
                text="Tady se ukáže, které bity nastavil který vložený klíč"
              />
            ) : (
              <>
                <text
                  className="tr-label"
                  x={5}
                  y={bitsH + BLOOM_HEAD_H / 2}
                  dominantBaseline="central"
                  style={{ fontSize: 12 }}
                >
                  {`klíč → jeho bity hᵢ(klíč), v buňce je i = 1…${st.k}`}
                </text>
                {visible.map((row, r) => {
                  const y = mTop + r * rowH;
                  const hot = row.hot ? " is-hot" : "";
                  const order = bloomBits(st, row.key);
                  const far = row.cells.reduce(
                    (mx, c) => Math.max(mx, cx(c.bit)),
                    -Infinity,
                  );
                  return (
                    <g key={row.key} data-key={row.key}>
                      {row.cells.length > 0 && (
                        <line
                          className={"tr-arrow" + hot}
                          x1={BLOOM_LABEL_W - 3}
                          y1={y + boxH / 2}
                          x2={far}
                          y2={y + boxH / 2}
                        />
                      )}
                      <g
                        className={"tr-cell" + hot}
                        transform={`translate(5, ${y})`}
                      >
                        <rect width={BLOOM_LABEL_W - 8} height={boxH} rx={3} />
                        <text
                          x={(BLOOM_LABEL_W - 8) / 2}
                          y={boxH / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          {...fitCellText(
                            String(row.key),
                            BLOOM_LABEL_W - 8,
                            cellFont,
                          )}
                        >
                          {row.key}
                        </text>
                      </g>
                      {row.cells.map((c) => (
                        <g
                          key={c.bit}
                          data-bit={c.bit}
                          className={"tr-cell" + (c.state ? " " + c.state : "")}
                          transform={`translate(${x0 + c.bit * W}, ${y})`}
                        >
                          <rect width={W - 2} height={boxH} rx={3} />
                          <text
                            x={(W - 2) / 2}
                            y={boxH / 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            {...fitCellText(
                              String(order.indexOf(c.bit) + 1),
                              W - 2,
                              Math.min(cellFont, 13),
                            )}
                          >
                            {order.indexOf(c.bit) + 1}
                          </text>
                        </g>
                      ))}
                    </g>
                  );
                })}
              </>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
