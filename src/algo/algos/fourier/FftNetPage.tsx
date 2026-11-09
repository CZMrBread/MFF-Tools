/**
 * #/fft/net – FFT jako hradlová síť a nerekurzivní FFT2 (Průvodce 17.5, obr. 17.4 na str. 438, algoritmus
 * FFT2 na str. 439). Tenká vrstva: stav běhu a adresa; logika v fft2PageModel.ts, kroky v fft2.ts, kresba
 * sítě ve views/ButterflyNetView.tsx (geometrie butterflyNetLayout.ts).
 */
import { useMemo, useState } from "react";
import { useLinkSearchParams } from "../../core/linkParams";
import { ActionMenu } from "../../core/ActionMenu";
import { CanvasFit } from "../../core/canvasFit";
import { fmtMath } from "../../core/format";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { Visualizer, type LegendItem } from "../../core/Visualizer";
import { moduleByPath } from "../../registry";
import { VarsView } from "../../views/ArrayView";
import { ButterflyNetView } from "../../views/ButterflyNetView";
import {
  BASE_ROW,
  netFit,
  netLayout,
  netLimits,
  showBits,
  valueWidth,
} from "../../views/butterflyNetLayout";
import { UnitCircleView } from "../../views/UnitCircleView";
import { useWidth } from "../../views/useWidth";
import { subDigits, supDigits, type C } from "./complex";
import { toField, transformSize } from "./fft";
import {
  bitReverse,
  butterflies,
  fft2Layers,
  gateLabels,
  PC_FFT2,
  wireLabels,
  type NetState,
} from "./fft2";
import {
  NET_DEFAULT,
  NET_EXAMPLES,
  netActions,
  netCaption,
  netRandom,
  netRunSteps,
  netUrlParams,
  parseNetUrl,
  stepOfGate,
  type NetInput,
  type NetRun,
} from "./fft2PageModel";
import { FIELDS } from "./field";

const PATH = "/fft/net";
/** kružnice s mocninami ω vedle sítě (px), mezera */
const CIRCLE = 132;
const GAP = 16;
/** výška řádku proměnných nad sítí */
const VARS_H = 26;

const LEGEND: LegendItem[] = [
  { cls: "sw-visited", label: "aktivní vrstva (velikost bloku b)" },
  {
    cls: "sw-active",
    shape: "dashed",
    label: "aktivní blok j … j + 2b − 1",
  },
  {
    cls: "sw-compare",
    label: "motýlek: kroužky „±k“ a spoje; α = ωᵉ na kružnici",
  },
  { cls: "sw-new", label: "právě spočítané hodnoty na drátech" },
  { cls: "sw-wire0", shape: "line-dashed", label: "drát ještě bez hodnoty" },
];

const fmtList = (xs: readonly number[]) =>
  xs.map((x) => String(x).replace("-", "−")).join(", ");

const full = (z: C) =>
  z.im === 0
    ? String(z.re)
    : `${z.re} ${z.im < 0 ? "−" : "+"} ${Math.abs(z.im)}i`;

/** vstup doplněný nulami na velikost sítě */
const padded = (x: readonly number[]) => {
  const n = transformSize(x.length);
  return [...x, ...new Array<number>(n - x.length).fill(0)];
};

/** exponenty α použité v aktivní vrstvě (2b-té odmocniny) a dvojice ±α aktuálního motýlku */
function circleMarks(st: NetState) {
  const n = st.n;
  if (st.layer === null || st.layer < 1)
    return { active: [] as number[], pair: null, hot: null };
  const layer = butterflies(n)[st.layer - 1];
  const used = [...new Set(layer.flatMap((g) => [g.e, (g.e + n / 2) % n]))];
  return {
    active: used,
    pair:
      st.e === null ? null : ([st.e, (st.e + n / 2) % n] as [number, number]),
    hot: st.e,
  };
}

export function FftNetPage() {
  const mod = moduleByPath(PATH);
  // vstup jde sdílet odkazem: #/fft/net?x=0,1,2,3&f=z17&d=layer
  const [params, setParams] = useLinkSearchParams();
  const [initial] = useState(() => parseNetUrl(params));
  const [run, setRun] = useState<NetRun>(initial.run);
  const [notice, setNotice] = useState<string | null>(initial.notice);
  const steps = useMemo(() => netRunSteps(run), [run]);
  const player = usePlayer(steps);
  const st = player.current?.state;
  const [layoutRef, layoutW] = useWidth();

  // pevná data sítě pro celý běh: popisky a šířka úseků podle nejdelší hodnoty (kresba se nerozjíždí)
  const net = useMemo(() => {
    const x = padded(run.x);
    const n = x.length;
    const f = FIELDS[run.field];
    const cols = fft2Layers(toField(x, run.field), f);
    return {
      n,
      valueW: valueWidth(cols.flat().map(f.fmt)),
      inLabels: bitReverse(n).map((k) => "x" + subDigits(k)),
      outLabels: Array.from({ length: n }, (_, k) => "y" + subDigits(k)),
      gates: gateLabels(n),
      bits: wireLabels(n),
      exps: butterflies(n),
    };
  }, [run]);

  const writeUrl = (input: NetInput | null) => {
    const next = new URLSearchParams(input ? netUrlParams(input) : {});
    if (next.toString() !== params.toString())
      setParams(next, { replace: true });
  };
  const syncFields = (input: NetInput) => {
    const set = (name: string, text: string) =>
      menu.dispatch({ type: "text", name, text });
    set("x", fmtList(input.x));
    set("f", input.field);
    set("d", input.detail);
  };
  const begin = (input: NetInput, example: string | null, url = true) => {
    setRun((r) => ({ ...input, example, runId: r.runId + 1 }));
    setNotice(null);
    writeUrl(url ? input : null);
  };

  const menu = useActionMenu(
    netActions({
      run,
      start: (input) => begin(input, null),
      load: (e) => {
        syncFields(e);
        begin({ field: e.field, x: e.x, detail: e.detail }, e.id);
      },
      random: (seed, n) => {
        const input = netRandom(seed, n);
        syncFields(input);
        begin(input, null);
      },
      now: Date.now,
    }),
  );

  const example = NET_EXAMPLES.find((e) => e.id === run.example);
  const f = FIELDS[run.field];
  const H0 = netLayout({
    n: net.n,
    rowH: BASE_ROW[net.n],
    valueW: net.valueW,
  }).H;
  const baseW = netLayout({
    n: net.n,
    rowH: BASE_ROW[net.n],
    valueW: net.valueW,
  }).W;
  // kružnice s α vedle sítě, jen když se obě vejdou do šířky plátna
  const withCircle = layoutW >= baseW + CIRCLE + GAP;

  const onGate = (layer: number, row: number) => {
    const i = stepOfGate(steps, layer, row);
    if (i >= 0) player.seek(i);
  };
  const gateTitle = (layer: number, row: number) => {
    const g = net.exps[layer - 1].find((x) => x.top === row || x.bot === row);
    if (!g) return "";
    const a = f.fmt(f.omega(net.n, g.e, false));
    return `${row === g.top ? "horní" : "dolní"} výstup motýlku j = ${g.j}, k = ${g.k}: ${row === g.top ? "s + α·ℓ" : "s − α·ℓ"}, α = ω${supDigits(g.e)} = ${a} – klik: přejít na krok`;
  };

  return (
    <Visualizer
      runKey={run.runId}
      // Výchozí příklad: síť obr. 17.4 pro x = (0, 1, …, 7) jako po otevření (adresa bez parametrů)
      onRestoreInitial={() => {
        syncFields(NET_DEFAULT);
        begin(NET_DEFAULT, NET_DEFAULT.example, false);
      }}
      title={mod?.title ?? "FFT jako hradlová síť (FFT2)"}
      description={
        <>
          <p>
            {fmtMath(
              "Průběh FFT nakreslený jako síť (obr. 17.4): vlevo vstup v pořadí bitového zrcadlení r(k), pak log_2 n vrstev kroužků. " +
                "Vrstva s bloky velikosti 2b spojí v každém bloku řádky j+k a j+k+b motýlkem s α = ω^{nk/2b}: nahoru jde s + α·ℓ, dolů s − α·ℓ " +
                "(číslo k v kroužku je mocnina odmocniny ω_{2b}). Vyhodnocením po vrstvách zleva doprava vznikne nerekurzivní FFT2. " +
                "Operace jedné vrstvy jsou nezávislé, takže síť počítá paralelně.",
            )}
          </p>
          <p className="complexity">
            <b>FFT2:</b> čas Θ(n log n), prostor Θ(n) · <b>síť:</b> čas
            (hloubka) Θ(log n), prostor Θ(n log n)
          </p>
        </>
      }
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={PC_FFT2}
      opTitle={netCaption(run)}
      share
      legend={LEGEND}
      tip={
        <>
          Klikněte na kroužek – přehrávač skočí na krok jeho motýlku. Čísla nad
          dráty jsou indexy vstupů, ze kterých podproblém počítá (jako na obr.
          17.4): v posledním sloupci celý vstup, předtím sudé a liché indexy, …
          V „po vrstvách“ se celá vrstva spočítá jedním krokem, tak jak ji
          počítá hradlová síť.
        </>
      }
      notes={
        <>
          {example && (
            <p>
              {example.source
                ? `${example.source}: ${example.note}.`
                : `Vlastní příklad: ${example.note}.`}
            </p>
          )}
          <p>
            Konvence knihy: ω = e<sup>2πi/n</sup> a y<sub>j</sub> = Σ x
            <sub>k</sub>·ω<sup>jk</sup>. Komplexní čísla na 2 desetinná místa,
            plná přesnost ve vysvětlivce hodnoty. ℤ₁₇: ω = 2 pro n = 8 (2⁴ = −1,
            str. 439), 4 pro n = 4 a generátor 3 pro n = 16. Výsledek je stejný
            jako u rekurzivní FFT (modul Rychlá Fourierova transformace).
          </p>
        </>
      }
    >
      {notice && <p className="input-warn">{notice}</p>}
      <div className="fftnet-wrap" ref={layoutRef}>
        {st && (
          <CanvasFit limits={netLimits(net.n, H0 + VARS_H)}>
            {(delta) => {
              // síť i kružnice rostou společně – omezuje je šířka plátna
              const cap =
                layoutW / Math.max(1, baseW + (withCircle ? CIRCLE + GAP : 0));
              const fit = netFit(delta, net.n, H0 + VARS_H, cap);
              const L = netLayout({
                n: net.n,
                rowH: fit.rowH,
                valueW: net.valueW,
              });
              const marks = circleMarks(st);
              return (
                <div className={"fftnet-layout" + (withCircle ? "" : " solo")}>
                  <div className="fftnet-net">
                    <VarsView vars={st.vars} reserve point />
                    <ButterflyNetView
                      layout={L}
                      zoom={fit.zoom}
                      inLabels={net.inLabels}
                      outLabels={net.outLabels}
                      gateLabels={net.gates}
                      bits={showBits(fit.rowH) ? net.bits : null}
                      values={st.cols.map((col) =>
                        col.map((z) => (z ? f.fmt(z) : null)),
                      )}
                      valueTitles={st.cols.map((col) =>
                        col.map((z) => (z ? full(z) : null)),
                      )}
                      activeLayer={st.layer}
                      block={
                        st.j !== null && st.b !== null
                          ? { start: st.j, size: 2 * st.b }
                          : null
                      }
                      hot={st.gates}
                      fresh={st.wrote}
                      gateTitle={gateTitle}
                      onGate={onGate}
                      ariaLabel={`Motýlková síť FFT pro n = ${net.n}: ${L.layers} vrstvy po ${net.n / 2} motýlcích, vstupy v pořadí bitového zrcadlení`}
                    />
                  </div>
                  {withCircle && (
                    <div
                      className="fftnet-side"
                      style={{ width: Math.round(CIRCLE * fit.zoom) }}
                    >
                      <UnitCircleView
                        n={net.n}
                        inverse={false}
                        active={marks.active}
                        pair={marks.pair}
                        hot={marks.hot}
                        label={
                          run.field === "Z17"
                            ? (k) => f.fmt(f.omega(net.n, k, false))
                            : (k) => "ω" + supDigits(k)
                        }
                        axes={run.field === "C"}
                        angleText={
                          run.field === "C" && net.n <= 8 ? `2π/${net.n}` : ""
                        }
                        size={Math.round(CIRCLE * fit.zoom)}
                        ariaLabel={
                          run.field === "C"
                            ? `Jednotková kružnice s ${net.n} mocninami ω; zvýrazněné jsou mocniny, které používá aktivní vrstva`
                            : `Mocniny ω = ${f.fmt(f.omega(net.n, 1, false))} v ℤ₁₇ rozmístěné po kružnici`
                        }
                      />
                      <p className="fftnet-note">
                        {st.layer && st.layer > 0 && st.b
                          ? `vrstva ${st.layer}: odmocniny ω${subDigits(2 * st.b)}`
                          : `ω = ${f.fmt(f.omega(net.n, 1, false))}`}
                      </p>
                    </div>
                  )}
                </div>
              );
            }}
          </CanvasFit>
        )}
      </div>
    </Visualizer>
  );
}
