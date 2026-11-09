import { useEffect, useMemo, useState } from "react";
import { moduleByPath } from "../../registry";
import { Navigate, useParams } from "react-router-dom";
import { CanvasFit } from "../../core/canvasFit";
import { materialize } from "../../core/steps";
import { usePlayer } from "../../core/usePlayer";
import { useUrlParam } from "../../core/useUrlParam";
import { Visualizer } from "../../core/Visualizer";
import { ActionMenu } from "../../core/ActionMenu";
import { useActionMenu } from "../../core/useActionMenu";
import { fmtMath } from "../../core/format";
import { ArrayView, VarsView } from "../../views/ArrayView";
import { SORTING } from "./algorithms";
import { sortBarHeights, sortFitLimits, type AuxKind } from "./fit";
import { inputPosition, sortingActions } from "./actions";
import { initInputs, pushInput, titlesOf, undoInput } from "./inputHistory";
import { legendFor, mainRowLabel, P_LEGEND } from "./legend";
import {
  DEFAULT_INPUT,
  DEFAULT_SMALL_INPUT,
  MIN_VALUE,
  defaultInput,
  inputFromUrl,
  inputToUrl,
  layoutOf,
  maxValueOf,
  opTitleFor,
  plainMath,
  sameNumbers,
  scaleMax,
  scaleMin,
  urlInputNotice,
} from "./input";
import type { SortAlgorithm, SortState } from "./types";

// seznam algoritmů žije v ./algorithms; odsud ho dál vyvážíme kvůli stávajícím importům
export { SORTING } from "./algorithms";

/** Počítadla porovnání a přesunů pod plátnem (podle nich se algoritmy na stejném vstupu srovnávají). */
function StatsView({ algo, st }: { algo: SortAlgorithm; st: SortState }) {
  return (
    <div
      className="vars sort-stats"
      role="group"
      aria-label="Počítadla operací"
    >
      <span className="var">
        <span className="var-name">porovnání</span>:{" "}
        <span className="var-value">{st.stats.cmp}</span>
      </span>
      <span className="var">
        <span className="var-name">{algo.moves.label}</span>:{" "}
        <span className="var-value">{st.stats.moves}</span>
      </span>
    </div>
  );
}

export function SortingPage() {
  const { id } = useParams();
  const found = SORTING.find((a) => a.id === id);
  const algo = found ?? SORTING[0];
  const limited = algo.inputMax !== undefined;
  const [a, setA] = useUrlParam("a");

  // Porovnávací algoritmy sdílejí jeden vstup (dají se tak srovnávat). Algoritmus s omezeným rozsahem
  // hodnot (Counting sort) má vlastní – nic se tak potichu nepřepisuje a textové pole vždy odpovídá tomu,
  // co se třídí. Vstup z odkazu (?a=…) se použije pro algoritmus, na který odkaz vede.
  // Každý vstup má vlastní historii (řádek Historie, ↶ Vrátit operaci vrátí předchozí P).
  const [wide, setWide] = useState(() =>
    initInputs((limited ? null : inputFromUrl(a, algo)) ?? DEFAULT_INPUT),
  );
  const [small, setSmall] = useState(() =>
    initInputs((limited ? inputFromUrl(a, algo) : null) ?? DEFAULT_SMALL_INPUT),
  );
  const inputs = limited ? small : wide;
  const setInputs = limited ? setSmall : setWide;
  const values = inputs.current;
  const setValues = (next: number[], title: string) =>
    setInputs((h) => pushInput(h, next, title, sameNumbers));
  // počítadlo spuštění: vlastní vstup (Použít, předvolba) připraví nový běh (posun do záběru), přepnutí algoritmu ani načtení ne
  const [runId, setRunId] = useState(0);

  // vstup z odkazu, který nešel použít celý: hláška nad plátnem (jako u grafů) a adresa zůstane, jak
  // přišla, dokud uživatel vstup nezmění (patří k algoritmu, na který odkaz vedl)
  const [urlNotice, setUrlNotice] = useState(() => {
    const n = urlInputNotice(a, algo);
    return n && { ...n, algo: algo.id };
  });
  const notice = urlNotice?.algo === algo.id ? urlNotice : null;
  // adresu změnil někdo zvenku (vložený odkaz, tlačítko Zpět) → převezmeme vstup z ní
  const [seenA, setSeenA] = useState(a);
  if (a !== seenA) {
    setSeenA(a);
    const fromUrl = inputFromUrl(a, algo);
    if (fromUrl && !sameNumbers(fromUrl, values))
      setValues(fromUrl, "Vstup z adresy");
    const n = urlInputNotice(a, algo);
    if (n) setUrlNotice({ ...n, algo: algo.id });
  }
  // a naopak: adresa vždy nese aktuální vstup (odkaz „Kopírovat odkaz“ ho předá dál)
  const keepUrl = notice !== null;
  useEffect(() => {
    if (found && !keepUrl) setA(inputToUrl(values, algo));
  }, [found, algo, values, setA, keepUrl]);

  /**
   * použít vstup z nabídky; `restart` = nový běh i pro stejný obsah (nové pole → nová sada kroků, přehrávač
   * stojí na kroku 1 a čeká na ▶; runId posune plátno do záběru)
   */
  const apply = (next: number[], restart: boolean, title: string) => {
    setUrlNotice(null);
    if (!restart && sameNumbers(values, next)) return;
    setValues(next.slice(), title);
    if (restart) setRunId((k) => k + 1);
  };
  /** ↶ Vrátit operaci: předchozí vstup P, nový běh na kroku 1 (adresa ho převezme) */
  const undo = () => {
    if (!inputs.past.length) return;
    setUrlNotice(null);
    setInputs(undoInput);
    setRunId((k) => k + 1);
  };
  /** Výchozí příklad: výchozí vstup algoritmu (jde vrátit), adresa bez ?a= */
  const restore = () => apply(defaultInput(algo), true, "Výchozí příklad");
  const menu = useActionMenu(sortingActions(algo, values, { apply }));
  const { dispatch } = menu;
  // po otevření není rozbalená žádná akce – běh je připravený, ▶ ho přehraje (CROSS-06)
  // pole P vždy ukazuje to, co se třídí (předvolba, jiný algoritmus, adresa…)
  useEffect(
    () => dispatch({ type: "text", name: "P", text: values.join(", ") }),
    [values, dispatch],
  );

  // runId: nový běh i nad stejným vstupem (Quicksort(P), ↶ na stejný obsah) – přehrávač na krok 1
  const steps = useMemo(
    () => materialize(algo.run(values)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [algo, values, runId],
  );
  const layout = useMemo(() => layoutOf(steps), [steps]);
  const legend = useMemo(
    () => [P_LEGEND, ...legendFor(algo, steps)],
    [algo, steps],
  );
  const player = usePlayer(steps);

  // neznámé :id (#/sort/foo) – App.tsx sem takovou adresu nepustí, tohle je jen pojistka
  if (!found) return <Navigate to="/" replace />;

  const st = player.current?.state;
  const max = scaleMax(values);
  const min = scaleMin(values);
  // počítadla Counting sortu mají vlastní měřítko, pomocné pole Mergesortu sdílí měřítko i sloty s hlavním polem
  const counters = algo.id === "counting";
  // v krocích bez pomocného pole kreslíme prázdné se stejným popiskem, aby se výška plátna neměnila
  const aux =
    st?.aux ??
    (layout.aux
      ? { ...layout.aux, items: [], marks: {}, offset: 0 }
      : undefined);
  const hasError = steps.length === 1 && steps[0].error === true;
  // výška sloupců podle výšky plátna (desktop na jednu obrazovku), jinde výchozí
  const auxKind: AuxKind = !aux ? "none" : counters ? "counting" : "merge";

  return (
    <Visualizer
      runKey={runId}
      title={moduleByPath(`/sort/${algo.id}`)?.title ?? algo.title}
      description={
        <>
          <p>
            {algo.title.includes(" – ") && (
              <b>
                {algo.title
                  .split(" – ")[1]
                  .replace(/^./, (c) => c.toUpperCase())}
                .{" "}
              </b>
            )}
            {fmtMath(algo.description)}
          </p>
          <p className="complexity">
            <b>Čas:</b> {algo.complexity.time} · <b>Pomocná paměť:</b>{" "}
            {algo.complexity.space} · <b>Stabilní:</b>{" "}
            {algo.complexity.stable ? "ano" : "ne"}
          </p>
        </>
      }
      actions={<ActionMenu menu={menu} />}
      inputHistory={{
        history: titlesOf(inputs),
        canUndo: inputs.past.length > 0,
        undo,
      }}
      onRestoreInitial={restore}
      notes={
        <p className="hint">
          {limited
            ? `Counting sort má vlastní vstup (celá čísla ${MIN_VALUE} až ${maxValueOf(algo)}); porovnávací algoritmy v menu sdílejí jiný.`
            : "Vstup zůstává stejný i po přepnutí na jiný třídicí algoritmus v menu – počty porovnání a přesunů tak můžete srovnat."}
        </p>
      }
      player={player}
      pseudocode={algo.pseudocode}
      legend={legend}
      opTitle={opTitleFor(algo, values)}
      tip={fmtMath(algo.tip)}
      share
    >
      {notice && (
        <p
          className={
            "hint " + (notice.kind === "error" ? "input-error" : "input-warn")
          }
          role="status"
        >
          {notice.text}
        </p>
      )}
      {st && (
        <CanvasFit limits={sortFitLimits(auxKind)}>
          {(fit) => {
            const bars = sortBarHeights(fit, auxKind);
            return (
              <>
                <ArrayView
                  items={st.items}
                  marks={st.marks}
                  sorted={st.sorted}
                  ranges={st.ranges}
                  max={max}
                  min={min}
                  height={bars.main}
                  label={mainRowLabel(algo.id)}
                  reserveRanges={layout.ranges}
                  // klik na sloupec: x = hodnota, i = pozice prvku ve vstupu → P[i] ← x
                  onPick={(idx, v) => {
                    dispatch({ type: "text", name: "x", text: String(v) });
                    dispatch({
                      type: "text",
                      name: "i",
                      text: String(inputPosition(st.items, idx, values)),
                    });
                    // fokus do pole x (pick by ho dal na Provést) – hned jde psát novou hodnotu; focusRef je
                    // RefObject nabídky určený právě k takovému požadavku
                    menu.focusRef.current = { to: "field" };
                    dispatch({ type: "open", id: "set" });
                  }}
                />
                {aux && (
                  <ArrayView
                    items={aux.items}
                    marks={aux.marks}
                    max={counters ? layout.auxMax : max}
                    min={counters ? 0 : min}
                    height={bars.aux}
                    label={plainMath(aux.label)}
                    slotCount={counters ? undefined : st.items.length}
                    offset={aux.offset ?? 0}
                  />
                )}
                {!hasError && <StatsView algo={algo} st={st} />}
                <VarsView vars={st.vars} />
              </>
            );
          }}
        </CanvasFit>
      )}
    </Visualizer>
  );
}
