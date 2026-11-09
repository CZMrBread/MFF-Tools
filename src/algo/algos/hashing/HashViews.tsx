/**
 * Kresby hešovacích tabulek (řetízky, otevřená adresace) – sdílí je stránka (HashPage.tsx, líně načítaná) a náhledy na úvodní stránce (landing/previews.tsx).
 */
import { useLayoutEffect, type CSSProperties } from "react";
import { useRovingFocus } from "../../core/useRovingFocus";
import { pickProps } from "../../views/pick";
import { useWidth } from "../../views/useWidth";
import { fitCellText } from "./cellText";
import { useCanvasRoom } from "./useCanvasRoom";
import { probeTrailSteps, TRAIL_CAP_MIN, trailBox } from "./trail";
import { TrailView } from "./TrailView";
import { type HashState } from "./tables";
import { CELL_PAD, chainFonts, chainLayout, keysWord, probeCell } from "./ui";

/** klik na klíč (výběr argumentu x v nabídce operací) */
type OnPick = (key: number) => void;

export function ChainView({ st, onPick }: { st: HashState; onPick?: OnPick }) {
  const [ref, width] = useWidth();
  // na jednu obrazovku: řádky podle výšky plátna (až 56 px, dlouhé zalomené řetězce je zmenší), při
  // nedostatku místa 2–4 sloupce (TREEHASH-04)
  const room = useCanvasRoom(ref);
  const { cols, rowH } = chainLayout(st.m, room, {
    lens: st.buckets.map((b) => b.length),
    width,
  });
  // písmo čísel roste s řádkem (CSS má strop 1,05rem – na vysokém plátně by klíče v řádku 56 px byly malé)
  const fonts = chainFonts(rowH);
  const rows = Math.ceil(st.m / cols);
  const active = Object.keys(st.marks).join(",");
  // klíče jdou vybrat jen s onPick: pak je tabulka jedna zastávka Tabu, šipky chodí po klíčích (D3)
  const rove = useRovingFocus(
    onPick
      ? st.buckets.flatMap((chain, i) => chain.map((_, idx) => `${i}:${idx}`))
      : [],
  );
  // aktivní přihrádku držet v záběru uvnitř plátna (ne okna), když se kresba přece jen nevejde
  useLayoutEffect(() => {
    const el = ref.current;
    const canvas = el?.closest<HTMLElement>(".viz-canvas");
    const row = el?.querySelector<HTMLElement>(".hc-row.cell-active");
    if (!canvas || !row || canvas.scrollHeight <= canvas.clientHeight) return;
    const c = canvas.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < c.top) canvas.scrollTop -= c.top - r.top + 8;
    else if (r.bottom > c.bottom) canvas.scrollTop += r.bottom - c.bottom + 8;
  }, [active, ref]);
  return (
    <div
      ref={ref}
      className={"hash-chain" + (cols > 1 ? " hc-cols" : "")}
      role={onPick ? "group" : "img"}
      aria-label={`Tabulka s ${st.m} přihrádkami, ${keysWord(st.n)}`}
      {...(onPick ? rove.group : {})}
      style={
        {
          "--algo-hc-row-h": `${rowH}px`,
          ...(cols > 1
            ? { gridTemplateRows: `repeat(${rows}, minmax(${rowH}px, auto))` }
            : null),
        } as CSSProperties
      }
    >
      {st.buckets.map((chain, i) => (
        <div key={i} className={"hc-row " + (st.marks[i] ?? "")}>
          <div className="hc-idx" style={{ fontSize: fonts.idx }}>
            {i}
          </div>
          {chain.map((k, idx) => (
            <span
              key={idx}
              className={
                "hc-key " +
                (st.keyMark && st.keyMark.bucket === i && st.keyMark.idx === idx
                  ? st.keyMark.cls
                  : "") +
                (onPick ? " pickable" : "")
              }
              // šipka mezi klíči (::before, 14 px vlevo) se vejde do mezery a klíče nepřekryje
              style={idx > 0 ? { marginLeft: 16 } : undefined}
              {...pickProps(onPick && (() => onPick(k)), `klíč ${k}`)}
              {...(onPick ? rove.item(`${i}:${idx}`) : {})}
            >
              {/* větší písmo jen pro číslo – šipka mezi klíči (::before) dědí písmo .hc-key a zůstane malá */}
              <span style={{ fontSize: fonts.key }}>{k}</span>
            </span>
          ))}
          {chain.length === 0 && <span className="hc-null">∅</span>}
        </div>
      ))}
    </div>
  );
}

export function ProbeView({ st, onPick }: { st: HashState; onPick?: OnPick }) {
  const [ref, avail] = useWidth();
  // na jednu obrazovku: stopa sond pod buňkami dostane jen zbylou výšku plátna (E6)
  const room = useCanvasRoom(ref);
  // skutečné px: buňky vyplní šířku plátna (36–72 px), na úzkém plátně se řada posouvá (TREEHASH-03)
  const { w: W, h: H, font } = probeCell(st.m, avail);
  const width = st.m * W + CELL_PAD;
  const rowsH = H + 34;
  // místo pro stopu je vyhrazené už před první operací (nápověda); řádky jako pro aspoň 6 sond, takže
  // se běžná stopa během operace nezmenšuje a na nízkém plátně zůstane čitelná
  const trail = trailBox(
    st.trail.length,
    room === null ? null : room - rowsH,
    Math.max(st.trail.length, TRAIL_CAP_MIN),
    true,
  );
  const height = rowsH + trail.height;
  // vybrat jde jen buňku s klíčem: pak je tabulka jedna zastávka Tabu, šipky chodí po buňkách (D3)
  const rove = useRovingFocus(
    onPick
      ? st.cells.flatMap((c, i) => (typeof c === "number" ? [i] : []))
      : [],
  );
  return (
    <div className="view-wrap" ref={ref}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={"array-svg" + (onPick ? " pickable" : "")}
        role={onPick ? "group" : "img"}
        aria-label={`Tabulka s ${st.m} buňkami, ${keysWord(st.n)}`}
        {...(onPick ? rove.group : {})}
      >
        {st.cells.map((c, i) => {
          const label = c === null ? "" : c === "tomb" ? "†" : String(c);
          const pick =
            onPick && typeof c === "number" ? () => onPick(c) : undefined;
          return (
            <g
              key={i}
              className={
                "box " +
                (st.marks[i] ??
                  (c === null ? "box-free" : c === "tomb" ? "cell-tomb" : "")) +
                (pick ? " pickable" : "")
              }
              transform={`translate(${5 + i * W}, 10)`}
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
        <TrailView
          steps={probeTrailSteps(st.trail)}
          W={W}
          top={rowsH}
          rowH={trail.rowH}
          shown={trail.shown}
          height={trail.height}
          cols={st.m}
          hint="Tady se ukáže pořadí sond operace (shora dolů)"
        />
      </svg>
    </div>
  );
}
