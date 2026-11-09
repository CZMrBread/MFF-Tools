/**
 * #/fft/fft – rekurzivní FFT (Průvodce 17.3, str. 430), inverzní FFT a násobení polynomů (17.1, str. 425).
 * Tenká vrstva: stav běhu a adresa; logika v fftPageModel.ts, kroky v fft.ts / polyMul.ts, kresby
 * v fftViews.tsx.
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
import { useWidth } from "../../views/useWidth";
import { FFT_EXAMPLES, type FftInput } from "./bookExamples";
import {
  codeFor,
  integerInput,
  mulTableModel,
  pList,
  tableModel,
  wSym,
  type CallNode,
  type FftState,
} from "./fft";
import { FIELDS } from "./field";
import {
  DEFAULT_RUN,
  fftActions,
  fftCaption,
  fftUrlParams,
  parseFftUrl,
  randomInput,
  runSteps,
  type FftRun,
} from "./fftPageModel";
import { callTreeLayout, fftZoom, zoomLimits } from "./fftTreeLayout";
import { CallTree, FftCircle, FftTable } from "./fftViews";

const PATH = "/fft/fft";
/** vzdálenost hladin stromu volání (px) */
const LEVEL = 44;
/** kružnice při 1 : 1 (px) */
const CIRCLE = 160;
/** mezera mezi stromem a kružnicí (1rem) a rezerva */
const ROW_GAP = 24;
/** výška horní řady kresby při 1 : 1: strom, nebo kružnice s řádkem proměnných */
const topHeight = (st: FftState) =>
  Math.max(callTreeLayout(st.calls, LEVEL).H, CIRCLE + 40);

const LEGEND_FFT: LegendItem[] = [
  { cls: "sw-active", label: "aktivní volání; sⱼ, ℓⱼ a ωʲ právě počítaného j" },
  { cls: "sw-compare", label: "právě spočítané yⱼ" },
  { cls: "sw-new", label: "hotové volání a hodnoty" },
  { cls: "sw-teal", label: "sudé koeficienty (podtržené) → s" },
  { cls: "sw-orange", label: "liché koeficienty → ℓ" },
  {
    cls: "sw-compare",
    shape: "line-dashed",
    label: "spárované body ωʲ a −ωʲ na kružnici",
  },
];

const LEGEND_MUL: LegendItem[] = [
  { cls: "sw-active", label: "řádek bodového součinu" },
  { cls: "sw-compare", label: "právě spočítaný graf / hodnota" },
  { cls: "sw-new", label: "koeficienty součinu R" },
  { cls: "sw-wire0", shape: "dashed", label: "doplněné nuly" },
];

const fmtList = (xs: readonly number[]) =>
  xs.map((x) => String(x).replace("-", "−")).join(", ");

/** drobečky nad tabulkou, když běží vnořená FFT */
function crumb(st: FftState): string | null {
  if (st.mul && st.code !== "mul") {
    const where =
      st.mul.stage === "fftP"
        ? "krok 4 › FFT(P)"
        : st.mul.stage === "fftQ"
          ? "krok 4 › FFT(Q)"
          : "krok 6 › inverzní FFT";
    return `NásobeníPolynomů › ${where}${st.code === "fft" && st.ifft ? ` › z ← FFT(${FIELDS[st.field].sym(true)})` : ""}`;
  }
  if (st.ifft && st.code === "fft")
    return `InverzníFFT › krok 2 › z ← FFT(n, ${FIELDS[st.field].sym(true)}, y)`;
  return null;
}

function tableCaption(st: FftState): string {
  if (st.code === "mul")
    return "NásobeníPolynomů: koeficienty → hodnoty v xⱼ = ωʲ → součin → koeficienty";
  const f = FIELDS[st.field];
  const node = st.calls[st.shown ?? 0];
  return `Volání FFT(${node.idx.length}, ${wSym(f, st.inverse, node.depth)}, ${pList(node.idx, st.ifft ? "y" : "p")}) – koeficienty → hodnoty`;
}

export function FftPage() {
  const mod = moduleByPath(PATH);
  // vstup jde sdílet odkazem: #/fft/fft?p=0,1,2,3&f=z17, #/fft/fft?op=mul&p=3,2,1&q=6,5,4&b=10
  const [params, setParams] = useLinkSearchParams();
  const [initial] = useState(() => parseFftUrl(params));
  const [run, setRun] = useState<FftRun>(initial.run);
  const [notice, setNotice] = useState<string | null>(initial.notice);
  const steps = useMemo(() => runSteps(run), [run]);
  const player = usePlayer(steps);
  const st = player.current?.state;
  // šířka kresby – přiblížení stromu a kružnice nesmí řadu roztáhnout přes plátno
  const [layoutRef, layoutW] = useWidth();

  const writeUrl = (input: FftInput | null) => {
    const next = new URLSearchParams(input ? fftUrlParams(input) : {});
    if (next.toString() !== params.toString())
      setParams(next, { replace: true });
  };
  /** pole nabídky ukážou vstup běhu (příklad, náhodný, výchozí) */
  const syncFields = (input: FftInput) => {
    const set = (name: string, text: string) =>
      menu.dispatch({ type: "text", name, text });
    set("f", input.field);
    if (input.op === "fft") set("p", fmtList(input.p));
    if (input.op === "ifft" && !input.yFromFft) set("y", fmtList(input.p));
    if (input.op === "mul") {
      set("P", fmtList(input.p));
      set("Q", fmtList(input.q));
      set("d", input.detail);
    }
  };
  /** klik na volání ve stromu: FFT(p) s jeho koeficienty (Enter ho spustí jako nový běh) */
  const pickCall = (v: CallNode) => {
    const vals = integerInput(v);
    if (!vals) return;
    menu.dispatch({ type: "open", id: "fft" });
    menu.dispatch({ type: "text", name: "p", text: fmtList(vals) });
    if (st) menu.dispatch({ type: "text", name: "f", text: st.field });
    menu.focusRef.current = { to: "go" };
  };
  const begin = (input: FftInput, example: string | null, url = true) => {
    setRun((r) => ({ ...input, example, runId: r.runId + 1 }));
    setNotice(null);
    writeUrl(url ? input : null);
  };

  const menu = useActionMenu(
    fftActions({
      run,
      start: (patch) =>
        begin(
          {
            op: patch.op,
            field: patch.field ?? run.field,
            p: patch.p ?? run.p,
            q: patch.q ?? run.q,
            detail: patch.detail ?? run.detail,
            yFromFft: patch.yFromFft ?? false,
            base: patch.base ?? null,
          },
          null,
        ),
      load: (e) => {
        syncFields(e);
        begin(e, e.id);
      },
      random: (seed, n) => {
        const input = randomInput(seed, n);
        syncFields(input);
        begin(input, null);
      },
      now: Date.now,
    }),
  );

  const example = FFT_EXAMPLES.find((e) => e.id === run.example);
  const mulLevel = st?.code === "mul";
  const path = st ? crumb(st) : null;

  return (
    <Visualizer
      runKey={run.runId}
      // Výchozí příklad: FFT(0, 1, …, 7) jako po otevření (adresa bez parametrů)
      onRestoreInitial={() => {
        syncFields(DEFAULT_RUN);
        begin(DEFAULT_RUN, null, false);
      }}
      title={mod?.title ?? "Rychlá Fourierova transformace (FFT)"}
      description={
        <>
          <p>
            {fmtMath(
              "Polynom velikosti n = 2^k vyhodnotíme v mocninách primitivní n-té odmocniny z jedničky ω = e^{2πi/n}: koeficienty rozdělíme na sudé a liché, " +
                "obě poloviny rekurzivně vyhodnotíme v mocninách ω^2 a z jejich grafů s a ℓ poskládáme graf celého polynomu motýlky " +
                "y_j = s_j + ω^j·ℓ_j a y_{j+n/2} = s_j − ω^j·ℓ_j – body ω^j a ω^{j+n/2} = −ω^j jsou spárované. Inverzní FFT je tatáž FFT s ω̄ = ω^{−1} " +
                "a vydělení n (Ω^{−1} = (1/n)·Ω̄). Násobení polynomů: FFT obou, součin po složkách a inverzní FFT. Počítá se v ℂ nebo přesně v ℤ₁₇.",
            )}
          </p>
          <p className="complexity">
            <b>FFT i inverzní FFT:</b> Θ(n log n), T(n) = 2T(n/2) + Θ(n) ·{" "}
            <b>násobení polynomů:</b> Θ(n log n) místo Θ(n²)
          </p>
        </>
      }
      actions={<ActionMenu menu={menu} />}
      player={player}
      pseudocode={codeFor(st)}
      opTitle={fftCaption(run)}
      share
      legend={mulLevel ? LEGEND_MUL : LEGEND_FFT}
      tip={
        <>
          Sledujte kružnici: v každé hladině rekurze se body umocní na druhou –
          je jich polovina a pořád tvoří dvojice ±ω<sup>j</sup>. V Příkladech z
          knihy je násobení 123 × 456 (cvičení 17.5.2): po inverzní FFT vyjde
          18, 27, 28, 13, 4 a s přenosy 56088. V ℤ₁₇ se počítá přesně, ale
          koeficient 28 se přetočí na 11.
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
            <sub>k</sub>·ω<sup>jk</sup> (knihovny jako numpy mají opačné
            znaménko). Komplexní čísla na 2 desetinná místa, plná přesnost ve
            vysvětlivce buňky. ℤ₁₇: ω = 2 pro n = 8 (2⁴ = −1, str. 439), 4 pro n
            = 4 a generátor 3 pro n = 16.
          </p>
        </>
      }
    >
      {notice && <p className="input-warn">{notice}</p>}
      {/* obal je vždy v DOM – měří šířku pro přiblížení (i když se přepne pohled násobení) */}
      <div className="fft-wrap" ref={layoutRef}>
        {st &&
          (mulLevel ? (
            // kroky NásobeníPolynomů: kružnice s body x_j a tabulka po řádcích j (P, Q, P̂, Q̂, R̂, R vedle sebe)
            <div className="fft-layout is-mul">
              <div className="fft-side" style={{ width: CIRCLE }}>
                <FftCircle st={st} size={CIRCLE} />
                <VarsView vars={st.vars} reserve point />
              </div>
              <div className="fft-table-col">
                <FftTable
                  model={mulTableModel(st)}
                  mul
                  vertical
                  caption={tableCaption(st)}
                />
              </div>
            </div>
          ) : (
            // na velkém monitoru strom i kružnice úměrně narostou, na malém se nejvýš trochu zmenší
            <CanvasFit limits={zoomLimits(topHeight(st))}>
              {(delta) => {
                const treeW = callTreeLayout(st.calls, LEVEL).W;
                const zoom = fftZoom(
                  delta,
                  topHeight(st),
                  (layoutW - ROW_GAP) / (treeW + CIRCLE),
                );
                return (
                  <div className="fft-layout">
                    <div className="fft-tree">
                      <CallTree
                        st={st}
                        levelHeight={LEVEL}
                        zoom={zoom}
                        onPick={pickCall}
                      />
                    </div>
                    <div
                      className="fft-side"
                      style={{ width: Math.round(CIRCLE * zoom) }}
                    >
                      <FftCircle st={st} size={Math.round(CIRCLE * zoom)} />
                      <VarsView vars={st.vars} reserve point />
                    </div>
                    <div className="fft-table-col">
                      {path && <p className="fft-crumb">{path}</p>}
                      <FftTable
                        model={tableModel(st)}
                        caption={tableCaption(st)}
                      />
                    </div>
                  </div>
                );
              }}
            </CanvasFit>
          ))}
      </div>
    </Visualizer>
  );
}
