/**
 * Nejdelší rostoucí podposloupnost (#/dp/lis, Průvodce 12.2, str. 302–305, obr. 12.3 a 12.4): Nrp2
 * vyplní T[i] a P[i] od konce, pak výpis řešení po odkazech P. Tenká vrstva nad lis.ts, lisPageModel.ts
 * a lisView.ts; odkaz ?a=3,14,15 (výchozí příklad = bez parametru, při otevření se nepřepisuje).
 */
import { useEffect, useMemo, useState } from "react";
import { ActionMenu } from "../../core/ActionMenu";
import { CanvasFit } from "../../core/canvasFit";
import { fmtMath } from "../../core/format";
import { sameNumbers } from "../../core/input";
import { materialize } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer, type LegendItem } from "../../core/Visualizer";
import { moduleByPath } from "../../registry";
import { useWidth } from "../../views/useWidth";
import {
  initInputs,
  pushInput,
  titlesOf,
  undoInput,
} from "../sorting/inputHistory";
import { nrp2Steps, PC_NRP2 } from "./lis";
import { LisChart, LisTable } from "./lisCanvas";
import {
  LIS_DEFAULT,
  lisActions,
  lisCaption,
  lisFromUrl,
  lisSelection,
  lisToUrl,
} from "./lisPageModel";
import { lisColumns } from "./lisView";

const PATH = "/dp/lis";

const LEGEND: LegendItem[] = [
  { cls: "sw-current", label: "i – počítaný začátek xᵢ (ve výpisu k)" },
  { cls: "sw-compare", label: "j – zkoušené pokračování xⱼ" },
  { cls: "sw-active", label: "právě změněné T[i] nebo P[i]" },
  { cls: "sw-new", label: "nalezená NRP (x₀ = −∞ a prvky po odkazech P)" },
  { cls: "sw-found", label: "vybraný sloupec: NRP začínající xᵢ" },
  { cls: "sw-dp-edge", shape: "line", label: "odkaz P[i] → druhý prvek" },
];

/** výška grafu nad tabulkou při 1 : 1 a meze přizpůsobení výšce plátna */
const CHART_H = 170;
const CHART_LIMITS = { shrink: 80, grow: 420 };

export function LisPage() {
  const title = moduleByPath(PATH)?.title ?? "Nejdelší rostoucí podposloupnost";
  const [a, setA] = useUrlParam("a");
  const [init] = useState(() => lisFromUrl(a));
  const [inputs, setInputs] = useState(() => initInputs(init.values));
  const [note, setNote] = useState<string | null>(init.note);
  const [runId, setRunId] = useState(0);
  // adresu přepisujeme až po první operaci – odkaz (i vadný) se při otevření nemění
  const [touched, setTouched] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const values = inputs.current;

  // adresu změnil někdo zvenku (Zpět, vložený odkaz) → převzít vstup z ní
  const [seenA, setSeenA] = useState(a);
  if (a !== seenA) {
    setSeenA(a);
    const fromUrl = lisFromUrl(a);
    if (!sameNumbers(fromUrl.values, values)) {
      setInputs((h) =>
        pushInput(h, fromUrl.values, "Vstup z adresy", sameNumbers),
      );
      setRunId((k) => k + 1);
      setSel(null);
    }
  }
  useEffect(() => {
    if (touched) setA(lisToUrl(values));
  }, [touched, values, setA]);

  const run = (next: number[], what: string) => {
    setNote(null);
    setTouched(true);
    setInputs((h) => pushInput(h, next, what, sameNumbers));
    setRunId((k) => k + 1);
    setSel(null);
  };
  const undo = () => {
    if (!inputs.past.length) return;
    setNote(null);
    setTouched(true);
    setInputs(undoInput);
    setRunId((k) => k + 1);
    setSel(null);
  };
  const restore = () => run([...LIS_DEFAULT.values], "Výchozí příklad");

  const menu = useActionMenu(lisActions({ values, run, now: Date.now }));
  const { dispatch } = menu;
  useEffect(
    () => dispatch({ type: "text", name: "x", text: values.join(", ") }),
    [values, dispatch],
  );

  // runId: nový běh i nad stejnou posloupností (přehrávač na krok 1)
  const steps = useMemo(
    () => ({ runId, list: materialize(nrp2Steps(values)) }),
    [values, runId],
  ).list;
  const player = usePlayer(steps);
  const st = player.current?.state;
  const selection = st ? lisSelection(st, sel) : null;
  const [wrap, width] = useWidth<HTMLDivElement>();
  const { head, col } = lisColumns(width, values.length);

  return (
    <Visualizer
      drawingKeys={
        <>
          Tabulka: <kbd>Tab</kbd> na ni, šipky po sloupcích, <kbd>Enter</kbd>{" "}
          ukáže NRP začínající xᵢ, <kbd>Esc</kbd> ven
        </>
      }
      runKey={runId}
      title={title}
      description={
        <>
          <p>
            {fmtMath(
              "Z posloupnosti x_1, …, x_n chceme škrtnout co nejméně prvků, aby zbylé ostře rostly. T[i] je délka nejdelší rostoucí podposloupnosti " +
                "začínající prvkem x_i: buď jen x_i, nebo x_i a za ním nejlepší pokračování x_j s j > i a x_j > x_i. Tabulku proto plníme od konce. " +
                "Dodefinované x_0 = −∞ v optimálním řešení určitě leží, takže stačí T[0]; P[i] si pamatuje druhý prvek a z odkazů P řešení vypíšeme.",
            )}
          </p>
          <p className="complexity">
            <b>Čas:</b> Θ(n²) · <b>Paměť:</b> Θ(n) · rekurzivní Nrp bez
            pamatování až 2ⁿ (str. 303), s vyhledávacím stromem Θ(n log n) (str.
            305)
          </p>
        </>
      }
      actions={
        <>
          <ActionMenu menu={menu} />
          {note && (
            <p className="am-msg" role="status" style={{ marginTop: "0.4rem" }}>
              {note}
            </p>
          )}
        </>
      }
      inputHistory={{
        history: titlesOf(inputs),
        canUndo: inputs.past.length > 0,
        undo,
      }}
      onRestoreInitial={restore}
      player={player}
      pseudocode={PC_NRP2}
      opTitle={lisCaption(values)}
      legend={LEGEND}
      share
      tip={
        <>
          Příklady z knihy ▸ Obr. 12.4: Nrp2 najde 1, 13, 15, obrázek vyznačil
          1, 7, 15 – obě jsou nejdelší. Klik na sloupec (nebo šipky a Enter v
          tabulce) ukáže NRP začínající xᵢ.
        </>
      }
      notes={
        <p>
          Pseudokód Nrp2 je z Průvodce (str. 303), výpis řešení po odkazech P
          podle textu na str. 304. Graf nad tabulkou je obr. 12.4: vrchol i leží
          nad sloupcem i, výš podle hodnoty xᵢ, a hrana vede „doprava nahoru“
          (do 8 prvků se kreslí všechny hrany slabě). Vrchol +∞ z obrázku Nrp2
          nepotřebuje, proto chybí. Vlastní posloupnost zadejte v akci Nrp2
          (nejvýš 16 celých čísel −999 až 999); stejné hodnoty na sebe
          nenavazují.
        </p>
      }
    >
      {st && (
        <CanvasFit limits={CHART_LIMITS}>
          {(delta) => (
            <div className="dp-lis" ref={wrap}>
              {/* graf a tabulka se na úzkém plátně posouvají do strany spolu (vrchol i nad sloupcem i) */}
              <div className="table-scroll dp-scroll">
                <LisChart
                  st={st}
                  sel={selection}
                  head={head}
                  col={col}
                  height={CHART_H + delta}
                />
                <LisTable
                  st={st}
                  sel={selection}
                  head={head}
                  col={col}
                  onPick={(i) => setSel(i)}
                />
              </div>
              <p className="dp-sel-info" aria-live="polite">
                {selection
                  ? fmtMath(selection.text)
                  : "Klik na sloupec ukáže nejdelší rostoucí podposloupnost začínající xᵢ."}
              </p>
            </div>
          )}
        </CanvasFit>
      )}
    </Visualizer>
  );
}
