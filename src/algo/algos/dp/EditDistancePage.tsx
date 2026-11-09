/**
 * Editační vzdálenost (#/dp/edit, Průvodce 12.3, str. 306–310, obr. 12.5 a 12.6): Edit2 vyplní tabulku T
 * zdola nahoru a zprava doleva, pak se z T[1, 1] zpětně najdou úpravy (cvičení 12.3.3). Tenká vrstva nad
 * editDistance.ts, editPageModel.ts a editView.ts; odkaz ?x=…&y=… (výchozí příklad = bez parametrů,
 * při otevření se nepřepisuje).
 */
import { useEffect, useMemo, useState } from "react";
import { ActionMenu } from "../../core/ActionMenu";
import { CanvasFit } from "../../core/canvasFit";
import { fmtMath } from "../../core/format";
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
import { EditAlign, EditTable } from "./editCanvas";
import { edit2Steps, PC_EDIT2 } from "./editDistance";
import {
  EDIT_DEFAULT,
  editActions,
  editCaption,
  editFromUrl,
  editSelection,
  editToUrl,
} from "./editPageModel";
import { editCellSize, editFitLimits } from "./editView";

const PATH = "/dp/edit";

const LEGEND: LegendItem[] = [
  {
    cls: "sw-current",
    label: "počítaná buňka T[i, j] (při úpravách místo, kde stojíme)",
  },
  {
    cls: "sw-compare",
    label: "tři čtení sousedé: ↘ T[i+1, j+1], ↓ T[i+1, j], → T[i, j+1]",
  },
  { cls: "sw-active", label: "soused, odkud vzešlo minimum (šipka v buňce)" },
  { cls: "sw-new", label: "nejkratší cesta úprav z T[1, 1]" },
  { cls: "sw-found", label: "vybraný podproblém a jeho úpravy" },
  {
    cls: "sw-dp-eq",
    glyph: "·",
    label: "xᵢ = yⱼ (δ = 0, plná hrana obr. 12.6)",
  },
];

interface Words {
  x: string;
  y: string;
}
const same = (a: Words, b: Words) => a.x === b.x && a.y === b.y;

export function EditDistancePage() {
  const title = moduleByPath(PATH)?.title ?? "Editační vzdálenost";
  const [ux, setX] = useUrlParam("x");
  const [uy, setY] = useUrlParam("y");
  const [init] = useState(() => editFromUrl(ux, uy));
  const [inputs, setInputs] = useState(() =>
    initInputs<Words>({ x: init.x, y: init.y }),
  );
  const [note, setNote] = useState<string | null>(init.note);
  const [runId, setRunId] = useState(0);
  // adresu přepisujeme až po první operaci – odkaz (i vadný) se při otevření nemění
  const [touched, setTouched] = useState(false);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const words = inputs.current;

  // adresu změnil někdo zvenku (Zpět, vložený odkaz) → převzít slova z ní
  const urlKey = `${ux}\u0000${uy}`;
  const [seenUrl, setSeenUrl] = useState(urlKey);
  if (urlKey !== seenUrl) {
    setSeenUrl(urlKey);
    const fromUrl = editFromUrl(ux, uy);
    if (!fromUrl.note && !same(fromUrl, words)) {
      setInputs((hh) =>
        pushInput(hh, { x: fromUrl.x, y: fromUrl.y }, "Vstup z adresy", same),
      );
      setRunId((k) => k + 1);
      setSel(null);
    }
  }
  useEffect(() => {
    if (!touched) return;
    const u = editToUrl(words.x, words.y);
    setX(u?.x ?? null);
    setY(u?.y ?? null);
  }, [touched, words, setX, setY]);

  const run = (x: string, y: string, what: string) => {
    setNote(null);
    setTouched(true);
    setInputs((hh) => pushInput(hh, { x, y }, what, same));
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
  const restore = () => run(EDIT_DEFAULT.x, EDIT_DEFAULT.y, "Výchozí příklad");

  const menu = useActionMenu(
    editActions({ x: words.x, y: words.y, run, now: Date.now }),
  );
  const { dispatch } = menu;
  useEffect(() => {
    dispatch({ type: "text", name: "x", text: words.x });
    dispatch({ type: "text", name: "y", text: words.y });
  }, [words, dispatch]);

  // runId: nový běh i nad stejnými slovy (přehrávač na krok 1)
  const steps = useMemo(
    () => ({ runId, list: materialize(edit2Steps(words.x, words.y)) }),
    [words, runId],
  ).list;
  const player = usePlayer(steps);
  const st = player.current?.state;
  const selection = st && sel ? editSelection(st, sel[0], sel[1]) : null;
  const [wrap, width] = useWidth<HTMLDivElement>();
  const n = [...words.x].length;
  const m = [...words.y].length;

  return (
    <Visualizer
      drawingKeys={
        <>
          Tabulka: <kbd>Tab</kbd> na ni, šipky po buňkách, <kbd>Enter</kbd>{" "}
          ukáže řešení podproblému T[i, j], <kbd>Esc</kbd> ven
        </>
      }
      runKey={runId}
      title={title}
      description={
        <>
          <p>
            {fmtMath(
              "Editační (Levenštejnova) vzdálenost L(x, y) je nejmenší počet vložení, smazání a změn znaku, kterými z x vznikne y. " +
                "T[i, j] = L(x_i … x_n, y_j … y_m) pro přípony: první znak ponecháme (x_i = y_j, δ = 0) či změníme (δ = 1), smažeme x_i, " +
                "nebo vložíme y_j – vybereme nejlevnější. Každá buňka závisí jen na buňkách vpravo a dole, proto plníme po řádcích zdola nahoru, " +
                "zprava doleva. Výsledek je T[1, 1]; úpravy najdeme zpětně z T[1, 1] po tazích, kde nastalo minimum.",
            )}
          </p>
          <p className="complexity">
            <b>Čas:</b> Θ(nm) · <b>Paměť:</b> Θ(nm), jen pro délku Θ(n + m)
            (cvičení 2) · rekurzivní Edit bez pamatování exponenciálně (str.
            308)
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
      pseudocode={PC_EDIT2}
      opTitle={editCaption(words.x, words.y)}
      legend={LEGEND}
      share
      tip={
        <>
          Na konci klikněte na libovolnou buňku (nebo šipky a Enter v tabulce):
          ukáže editační vzdálenost přípon a jejich úpravy. Příklady z knihy ▸
          koule → kdoule: jediné vložení.
        </>
      }
      notes={
        <p>
          Pseudokód Edit2 je z Průvodce (str. 308), tabulka jako obr. 12.5:
          řádky jsou písmena x, sloupce písmena y, poslední řádek a sloupec jsou
          okraje (jedno slovo už skončilo). Šipky odpovídají hranám grafu obr.
          12.6: ↘ ponechání či změna, ↓ smazání xᵢ, → vložení yⱼ. Zpětný průchod
          je cvičení 3 na str. 310; ze stejně dobrých tahů bere ↘, pak ↓, pak →
          – obr. 12.6 vyznačil jinou, stejně krátkou cestu (u → t, vložení e, t
          → m). Slova mají nejvýš 12 znaků; velká a malá písmena i písmena s
          diakritikou se liší (í ≠ i).
        </p>
      }
    >
      {st && (
        <CanvasFit limits={editFitLimits(n)}>
          {(delta) => (
            <div className="dp-edit" ref={wrap}>
              <EditTable
                st={st}
                sel={selection}
                cell={editCellSize(delta, n, m, width)}
                onPick={(r, c) => setSel([r, c])}
              />
              <EditAlign st={st} />
              <p className="dp-sel-info" aria-live="polite">
                {selection
                  ? selection.text
                  : "Klik na buňku T[i, j] ukáže editační vzdálenost přípon xᵢ… a yⱼ… a jejich úpravy."}
              </p>
            </div>
          )}
        </CanvasFit>
      )}
    </Visualizer>
  );
}
