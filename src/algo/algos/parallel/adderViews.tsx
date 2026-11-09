/**
 * Pohledy sčítačky (Průvodce 15.2): tabulka průběhu paralelního sčítání přesně jako obr. 15.4 (HTML
 * tabulka – sloupce = pozice od nejvyššího řádu, bloky jako sloučené buňky, přenosy nad hranicemi
 * sloupců, c₀ a cₙ mimo tabulku), malá tabulka skládání H ∘ D (s. 388) a řetěz krabiček Σ školního
 * sčítání jako obr. 15.3 (SVG, c₀ vlevo).
 *
 * Proč ne hradlová síť z CircuitView: paralelní sčítačka pro n = 16 má stovky hradel (přes MAX_NODES)
 * a kniha ji sama kreslí jako tabulku po hladinách; školní sčítačka ze hradel je v modulu Hradlové sítě
 * (Příklady z knihy ▸ Školní sčítačka ze hradel).
 */
import { useId, type CSSProperties, type ReactNode } from "react";
import { useRovingFocus, type RovingFocus } from "../../core/useRovingFocus";
import { pickProps } from "../../views/pick";
import { subscript } from "./circuit";
import {
  toPQ,
  type AdderState,
  type Behavior,
  type Bit,
  type ParState,
  type SchoolState,
} from "./adder";

export type ToggleBit = (which: "x" | "y", i: number) => void;

const sub = subscript;

function Glyph({ b }: { b: Behavior }) {
  return b === "<" ? <span>&lt;</span> : <b>{b}</b>;
}

const blockCls = (b: Behavior) =>
  b === "0" ? " ad-b0" : b === "1" ? " ad-b1" : " ad-bc";

function BitCell({
  which,
  i,
  v,
  onToggle,
  rove,
}: {
  which: "x" | "y";
  i: number;
  v: Bit;
  onToggle?: ToggleBit;
  rove: RovingFocus;
}) {
  const props = onToggle
    ? {
        ...pickProps(
          () => onToggle(which, i),
          `${which}${sub(i)} = ${v}, přepnout`,
        ),
        "aria-pressed": v === 1,
        ...rove.item(which + i),
      }
    : {};
  return (
    <td
      className={"ad-col ad-bit" + (onToggle ? " ad-toggle" : "")}
      data-bit={`${which}${i}`}
      {...props}
    >
      {v}
    </td>
  );
}

export interface AdderTableProps {
  state: AdderState;
  par: ParState;
  pq?: boolean;
  onToggle?: ToggleBit;
  /** měřítko písma tabulky (CanvasFit: kresba se vejde do výšky plátna), výchozí 1 */
  scale?: number;
}

/** Průběh paralelního sčítání jako obr. 15.4 (s. 390). */
export function AdderTable({
  state,
  par,
  pq = false,
  onToggle,
  scale = 1,
}: AdderTableProps) {
  const { n, x, y } = state;
  const k = Math.round(Math.log2(n));
  const cols = Array.from({ length: n }, (_, j) => n - 1 - j); // řády zleva doprava
  // přepínače bitů: tabulka je jedna zastávka Tabu, šipky chodí po bitech (D3); pořadí čtení x pak y
  const rove = useRovingFocus(
    onToggle ? [...cols.map((i) => "x" + i), ...cols.map((i) => "y" + i)] : [],
  );
  const used = new Set(par.used.map((u) => `${u.level}:${u.block}`));
  const sources = new Set(par.sources);
  const edge = (content: ReactNode = null, cls = "") => (
    <td className={"ad-edge" + cls}>{content}</td>
  );
  const carry = (i: number) => {
    const v = par.carries[i];
    if (v === null) return { text: "", cls: "" };
    return {
      text: String(v),
      cls:
        (v === 1 ? " ad-one" : "") +
        (par.hotRound !== null && par.carryRound[i] === par.hotRound
          ? " ad-new"
          : "") +
        (sources.has(i) ? " ad-src" : ""),
    };
  };
  const group = (label: string, rows: number) => (
    <th className="ad-group" scope="rowgroup" rowSpan={rows}>
      {label}
    </th>
  );

  const blockRows = Array.from({ length: k + 1 }, (_, j) => {
    const size = 2 ** j;
    const row = par.levels[j];
    const cells = Array.from({ length: n / size }, (_, t) => n / size - 1 - t);
    return (
      <tr
        key={`b${j}`}
        className={`ad-blocks ad-blocks-${j}` + (j === 0 ? " ad-sep" : "")}
      >
        {edge()}
        {cells.map((b) => {
          const v = row?.[b];
          return (
            <td
              key={b}
              colSpan={size}
              className={
                "ad-col ad-block" +
                (v ? blockCls(v) : "") +
                (par.hotLevel === j ? " ad-new" : "") +
                (used.has(`${j}:${b}`) ? " ad-used" : "")
              }
              title={
                v ? `blok [${b * size}, ${(b + 1) * size}) = ${v}` : undefined
              }
            >
              {v && <Glyph b={v} />}
              {v && pq && (
                <small
                  className="ad-pq"
                  title={`(p, q) = (${toPQ(v)[0]}, ${v === "<" ? "∗" : toPQ(v)[1]})`}
                >
                  {v === "<" ? "1∗" : toPQ(v).join("")}
                </small>
              )}
            </td>
          );
        })}
        {edge()}
        {j === 0 && group("bloky", k + 1)}
      </tr>
    );
  });

  const c0 = carry(0);
  const cn = carry(n);
  const carryRows = Array.from({ length: k + 1 }, (_, s) => {
    if (s === 0)
      return (
        <tr key="c0" className="ad-carry ad-carry-0 ad-sep">
          {edge(cn.text, " ad-cedge" + cn.cls)}
          {cols.map((i) => (
            <td key={i} className="ad-col ad-gap" />
          ))}
          {edge(c0.text, " ad-cedge" + c0.cls)}
          {group("přenosy", k + 1)}
        </tr>
      );
    const b = 2 ** (k - s);
    const starts: number[] = [];
    for (let i = n - 2 * b; i >= 0; i -= 2 * b) starts.push(i);
    return (
      <tr key={`c${s}`} className={`ad-carry ad-carry-${s}`}>
        {edge()}
        {starts.map((i) => {
          const c = carry(i + b);
          return (
            <td
              key={i}
              colSpan={2 * b}
              className={"ad-col ad-cval" + c.cls}
              title={`c${sub(i + b)}`}
            >
              {c.text}
            </td>
          );
        })}
        {edge()}
      </tr>
    );
  });

  const zn = par.z[n];
  return (
    <table
      className={"adder-table" + (n >= 16 ? " ad-wide" : "")}
      aria-label="Průběh paralelního sčítání (obr. 15.4)"
      {...(onToggle ? rove.group : {})}
      // měřítko z CanvasFit násobí velikost písma z index.css (na desktopu roste s výškou okna)
      style={
        scale !== 1
          ? {
              fontSize: `calc(clamp(0.9rem, 1.85vh + 0.1rem, 1.3rem) * ${scale})`,
            }
          : undefined
      }
    >
      <tbody>
        <tr className="ad-pos">
          <td className="ad-edge" />
          {cols.map((i) => (
            <th key={i} className="ad-col" scope="col">
              {i}
            </th>
          ))}
          <td className="ad-edge" />
          <th className="ad-group" scope="rowgroup">
            pozice
          </th>
        </tr>
        <tr className="ad-x ad-sep">
          {edge(<span className="ad-name">x</span>)}
          {cols.map((i) => (
            <BitCell
              key={i}
              which="x"
              i={i}
              v={x[i]}
              onToggle={onToggle}
              rove={rove}
            />
          ))}
          {edge()}
          {group("vstup", 2)}
        </tr>
        <tr className="ad-y">
          {edge(<span className="ad-name">y</span>)}
          {cols.map((i) => (
            <BitCell
              key={i}
              which="y"
              i={i}
              v={y[i]}
              onToggle={onToggle}
              rove={rove}
            />
          ))}
          {edge()}
        </tr>
        {blockRows}
        {carryRows}
        <tr className="ad-out ad-sep">
          {edge(
            zn === null ? "" : zn,
            " ad-zn" + (zn === 1 ? " ad-one" : "") + (zn === 0 ? " muted" : ""),
          )}
          {cols.map((i) => (
            <td
              key={i}
              className={
                "ad-col ad-z" +
                (par.outHot ? " ad-new" : "") +
                (par.done ? " ad-done" : "")
              }
            >
              {par.z[i] ?? ""}
            </td>
          ))}
          {edge()}
          {group("výstup", 1)}
        </tr>
      </tbody>
    </table>
  );
}

const ORDER: Behavior[] = ["0", "1", "<"];

/** Tabulka skládání B = H ∘ D (s. 388); zvýrazní buňky použité v aktuálním kroku. */
export function CompositionTable({
  composed,
  scale = 1,
}: {
  composed: readonly string[];
  /** měřítko písma (jako AdderTable) */
  scale?: number;
}) {
  const hot = new Set(composed);
  return (
    <table
      className="adder-compose"
      aria-label="Skládání bloků H ∘ D (s. 388)"
      style={
        scale !== 1
          ? {
              fontSize: `calc(clamp(0.82rem, 1.6vh + 0.05rem, 1.15rem) * ${scale})`,
            }
          : undefined
      }
    >
      <caption>H ∘ D</caption>
      <tbody>
        <tr>
          <th scope="col" title="řádek = horní blok H, sloupec = dolní blok D">
            H \ D
          </th>
          {ORDER.map((d) => (
            <th key={d} scope="col">
              <Glyph b={d} />
            </th>
          ))}
        </tr>
        {ORDER.map((hh) => (
          <tr key={hh}>
            <th scope="row">
              <Glyph b={hh} />
            </th>
            {ORDER.map((d) => {
              const v = hh === "<" ? d : hh;
              return (
                <td
                  key={d}
                  className={hot.has(`${hh}|${d}`) ? "ad-new" : undefined}
                >
                  <Glyph b={v} />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- řetěz krabiček Σ (obr. 15.3) ----------

const LEFT = 48;
const BOX_Y = 44;

export interface SchoolChainProps {
  x: readonly Bit[];
  y: readonly Bit[];
  school: SchoolState;
  onToggle?: ToggleBit;
  ariaLabel?: string;
  /** měřítko kresby (atributy width/height; viewBox a písmo 11 px v něm zůstávají), výchozí 1 */
  scale?: number;
}

/** Sčítání školním algoritmem jako obr. 15.3: c₀ vlevo, krabička Σᵢ s xᵢ, yᵢ nahoře a zᵢ dole. */
export function SchoolChain({
  x,
  y,
  school,
  onToggle,
  ariaLabel,
  scale = 1,
}: SchoolChainProps) {
  const arrowId = "ad-arrow-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const arrow = `url(#${arrowId})`;
  /** šipka vodiče s přenosem 1 – barva vodiče, stejná (pevná) velikost */
  const arrowOne = `url(#${arrowId}-1)`;
  const n = x.length;
  // přepínače vstupů: řetěz je jedna zastávka Tabu, šipky chodí po vstupech (D3)
  const rove = useRovingFocus(
    onToggle
      ? Array.from({ length: n }, (_, i) => ["x" + i, "y" + i]).flat()
      : [],
  );
  // n = 16: hustší řetěz, aby se na desktopu nezmenšil pod ~0,7
  const STEP = n >= 16 ? 48 : 64;
  const BOX = n >= 16 ? 30 : 34;
  const R = n >= 16 ? 6 : 7;
  const pinDx = n >= 16 ? 8 : 9;
  const bx = (i: number) => LEFT + i * STEP;
  const lastRight = bx(n - 1) + BOX;
  const endX = lastRight + 28;
  const W = endX + R + 6;
  const H = 132;
  const cy = BOX_Y + BOX / 2;
  const carryCls = (i: number) => {
    const v = school.c[i];
    return (
      "ad-carry-line" + (v === null ? " ad-unknown" : v === 1 ? " ad-one" : "")
    );
  };
  const carryArrow = (i: number) => (school.c[i] === 1 ? arrowOne : arrow);
  const carryVal = (i: number, mid: number) => {
    const v = school.c[i];
    return (
      <>
        <text className="ad-clabel" x={mid} y={cy - 7} textAnchor="middle">
          c{sub(i)}
        </text>
        {v !== null && (
          <text
            className={"ad-cbit" + (v === 1 ? " ad-one" : "")}
            x={mid}
            y={cy + 15}
            textAnchor="middle"
          >
            {v}
          </text>
        )}
      </>
    );
  };
  const inputPin = (which: "x" | "y", i: number, px: number) => {
    const v = which === "x" ? x[i] : y[i];
    const props = onToggle
      ? {
          ...pickProps(
            () => onToggle(which, i),
            `${which}${sub(i)} = ${v}, přepnout`,
          ),
          "aria-pressed": v === 1,
          ...rove.item(which + i),
        }
      : {};
    return (
      <g
        className={
          "ad-pin" + (v === 1 ? " ad-one" : "") + (onToggle ? " ad-toggle" : "")
        }
        data-chain-bit={`${which}${i}`}
        {...props}
      >
        <text className="ad-pin-label" x={px} y={10} textAnchor="middle">
          {which}
          {sub(i)}
        </text>
        <circle cx={px} cy={24} r={R} />
        <text className="ad-pin-bit" x={px} y={27.5} textAnchor="middle">
          {v}
        </text>
        <line
          className="ad-wire"
          x1={px}
          y1={24 + R}
          x2={px}
          y2={BOX_Y}
          markerEnd={arrow}
        />
      </g>
    );
  };
  return (
    <svg
      className="adder-chain-svg"
      // šířka v CSS (desktop) = --algo-ad-w × písmo tabulky – měřítko ji zmenší / zvětší s tabulkou
      style={{ "--algo-ad-w": W * scale } as CSSProperties}
      viewBox={`0 0 ${W} ${H}`}
      width={Math.round(W * scale)}
      height={Math.round(H * scale)}
      role={onToggle ? "group" : "img"}
      aria-label={ariaLabel ?? `Školní sčítání (obr. 15.3), n = ${n}`}
      {...(onToggle ? rove.group : {})}
    >
      <defs>
        {/* pevná velikost (userSpaceOnUse): šipka neroste se silným vodičem přenosu 1 */}
        {[
          [arrowId, "ad-arrowhead"],
          [arrowId + "-1", "ad-arrowhead ad-one"],
        ].map(([id, cls]) => (
          <marker
            key={id}
            id={id}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="8"
            markerHeight="8"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 z" className={cls} />
          </marker>
        ))}
      </defs>
      <text className="ad-const" x={8} y={cy + 4}>
        0
      </text>
      <line
        className={carryCls(0)}
        x1={18}
        y1={cy}
        x2={bx(0)}
        y2={cy}
        markerEnd={carryArrow(0)}
      />
      {carryVal(0, (18 + bx(0)) / 2)}
      {Array.from({ length: n }, (_, i) => {
        const left = bx(i);
        const z = school.z[i];
        return (
          <g key={i}>
            {inputPin("x", i, left + pinDx)}
            {inputPin("y", i, left + BOX - pinDx)}
            <g
              className={
                "ad-box" +
                (school.hot === i ? " hot" : "") +
                (z !== null ? " done" : "")
              }
              data-box={i}
            >
              <rect x={left} y={BOX_Y} width={BOX} height={BOX} />
              <text x={left + BOX / 2} y={cy + 6} textAnchor="middle">
                Σ
              </text>
            </g>
            <line
              className="ad-wire"
              x1={left + BOX / 2}
              y1={BOX_Y + BOX}
              x2={left + BOX / 2}
              y2={BOX_Y + BOX + 16}
              markerEnd={arrow}
            />
            <g
              className={
                "ad-pin ad-zpin" +
                (z === 1 ? " ad-one" : "") +
                (z !== null ? " ad-done" : "")
              }
            >
              <circle cx={left + BOX / 2} cy={BOX_Y + BOX + 16 + R} r={R} />
              <text
                className="ad-pin-bit"
                x={left + BOX / 2}
                y={BOX_Y + BOX + 19.5 + R}
                textAnchor="middle"
              >
                {z ?? ""}
              </text>
              <text
                className="ad-pin-label"
                x={left + BOX / 2}
                y={H - 4}
                textAnchor="middle"
              >
                z{sub(i)}
              </text>
            </g>
            {i < n - 1 && (
              <>
                <line
                  className={carryCls(i + 1)}
                  x1={left + BOX}
                  y1={cy}
                  x2={bx(i + 1)}
                  y2={cy}
                  markerEnd={carryArrow(i + 1)}
                />
                {carryVal(i + 1, (left + BOX + bx(i + 1)) / 2)}
              </>
            )}
          </g>
        );
      })}
      <line
        className={carryCls(n)}
        x1={lastRight}
        y1={cy}
        x2={endX - R}
        y2={cy}
      />
      {carryVal(n, (lastRight + endX - R) / 2)}
      <g
        className={
          "ad-pin ad-zpin" +
          (school.z[n] === 1 ? " ad-one" : "") +
          (school.z[n] !== null ? " ad-done" : "")
        }
      >
        <circle cx={endX} cy={cy} r={R} />
        <text className="ad-pin-bit" x={endX} y={cy + 3.5} textAnchor="middle">
          {school.z[n] ?? ""}
        </text>
      </g>
    </svg>
  );
}

/**
 * Písemné sčítání pod řetězem krabiček (školní režim): řády zleva od nejvyššího, přenosy c nad čísly
 * jako na papíře, součet z pod čarou – ze stejných dat jako řetěz; počítaný přenos cᵢ zvýrazněný.
 */
export function WrittenSum({
  x,
  y,
  school,
  scale = 1,
}: {
  x: readonly Bit[];
  y: readonly Bit[];
  school: SchoolState;
  scale?: number;
}) {
  const n = x.length;
  // sloupce: řád n (jen přenos a z) … řád 0
  const cols = Array.from({ length: n + 1 }, (_, j) => n - j);
  const show = (v: Bit | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  const hotC = school.hot;
  return (
    <div
      className="gtable adder-written"
      style={scale !== 1 ? { fontSize: `${0.88 * scale}rem` } : undefined}
    >
      <table aria-label="Písemné sčítání (stejný výpočet jako řetěz krabiček)">
        <tbody>
          <tr>
            <th scope="row">pozice</th>
            {cols.map((i) => (
              <td key={i} className="muted">
                {i}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">přenosy c</th>
            {cols.map((i) => (
              <td
                key={i}
                data-c={i}
                className={i === hotC ? "cell-hot" : undefined}
              >
                {show(school.c[i])}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">x</th>
            {cols.map((i) => (
              <td key={i}>{i < n ? x[i] : ""}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">y</th>
            {cols.map((i) => (
              <td key={i}>{i < n ? y[i] : ""}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">z</th>
            {cols.map((i) => (
              <td
                key={i}
                className={
                  school.z[i] !== null && school.z[i] !== undefined
                    ? "cell-done"
                    : undefined
                }
              >
                {show(school.z[i])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
