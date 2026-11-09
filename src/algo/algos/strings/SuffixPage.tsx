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
import {
  initialSuffix,
  SUFFIX_EXAMPLES,
  suffixActions,
  suffixCaption,
  suffixReducer,
  withLcp,
} from "./pageModel";
import {
  cleanAlpha,
  cleanBeta,
  patternFor,
  pseudocodeFor,
  randomAlpha,
  suffixSteps,
  type Phase,
} from "./suffix";
import { saAtMin, saClamp, saFitLimits, saZoom } from "./suffixView";
import { SATable } from "./SuffixViews";

/** legenda jen se značkami, které se v dané fázi opravdu kreslí */
const LEGENDS: Record<Phase["kind"], LegendItem[]> = {
  build: [{ cls: "sw-range", label: "právě počítaný sloupec Rₖ" }],
  kasai: [
    { cls: "sw-active", label: "sufix i (podle pozice v α)" },
    { cls: "sw-compare", label: "jeho následník q = X[j+1]" },
    { cls: "sw-found", label: "společný prefix (délka l)" },
  ],
  search: [
    { cls: "sw-range", label: "kandidáti X[lo … hi−1]" },
    { cls: "sw-active", label: "řádek mid" },
    { cls: "sw-found", label: "porovnávaných |β| znaků" },
    { cls: "sw-hit", label: "nalezený výskyt" },
  ],
};

const DEFAULT = SUFFIX_EXAMPLES[0];

export function SuffixPage() {
  // vstup jde sdílet odkazem: #/string/suffix?a=mississippi&b=ssi
  // (oba parametry se zapisují jedním voláním – dvě volání setteru useUrlParam v jedné obsluze by se přepsala)
  const [params, setParams] = useLinkSearchParams();
  const [initial] = useState(() => {
    const alpha = cleanAlpha(params.get("a") ?? "").value || DEFAULT.alpha;
    return {
      alpha,
      beta: cleanBeta(params.get("b") ?? "") || DEFAULT.beta,
      example: SUFFIX_EXAMPLES.find((e) => e.alpha === alpha)?.id ?? null,
    };
  });
  const writeUrl = (patch: Record<string, string>) => {
    const copy = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) copy.set(k, v);
    if (copy.toString() !== params.toString())
      setParams(copy, { replace: true });
  };
  const [run, setRun] = useState(() =>
    initialSuffix(initial.alpha, initial.example),
  );
  const lcp = withLcp(run);
  const steps = useMemo(
    () => suffixSteps(run.applied, run.phase, lcp),
    [run.applied, run.phase, lcp],
  );
  const player = usePlayer(steps);
  const st = player.current?.state;
  // šířková mez zvětšení tabulky pro tento běh a šířku plátna (viz SATable onFit)
  // a výška tabulky při 1 : 1 (mění se jen s počtem řádků – drží se, dokud se nezmění o víc než 4 px)
  const [fit, setFit] = useState({
    run: run.runId,
    avail: 0,
    cap: Infinity,
    baseH: 0,
  });
  const onFit = (avail: number, cap: number, baseH: number) =>
    setFit((f) => {
      const same = f.run === run.runId && Math.abs(f.avail - avail) < 4;
      const next = Math.min(same ? f.cap : Infinity, cap);
      const h =
        f.run === run.runId && Math.abs(f.baseH - baseH) <= 4 ? f.baseH : baseH;
      return same && !(next < f.cap - 0.02) && h === f.baseH
        ? f
        : { run: run.runId, avail, cap: same ? next : cap, baseH: h };
    });
  const fitBaseH = fit.run === run.runId ? fit.baseH : 0;
  // dlouhé α na malém plátně: omezená výška tabulky (null = celá tabulka), viz saClamp
  const [clampH, setClampH] = useState<number | null>(null);
  const onMeasure = (atMin: boolean) => (natural: number, avail: number) =>
    setClampH((prev) => saClamp(prev, { atMin, natural, avail }));

  const fields = (alpha: string, beta?: string) => {
    menu.dispatch({ type: "text", name: "alpha", text: alpha });
    if (beta !== undefined)
      menu.dispatch({ type: "text", name: "beta", text: beta });
  };
  /** nový řetězec (příklad, náhodný, výchozí) – rovnou se postaví */
  const load = (
    alpha: string,
    beta: string,
    example: string | null,
    restart = true,
  ) => {
    fields(alpha, beta);
    setRun(suffixReducer(run, { type: "load", alpha, restart, example }));
    writeUrl({ a: alpha, b: beta });
  };
  /** operace nad aktuálním textem pole α (Postavit, Kasai, Hledat) */
  const start = (text: string, next: Phase) => {
    const r = suffixReducer(run, { type: "run", text, next });
    setRun(r);
    if (r.runId === run.runId) return; // α je prázdné – jen poznámka
    fields(r.applied, next.kind === "search" ? next.beta : undefined);
    writeUrl(
      next.kind === "search"
        ? { a: r.applied, b: next.beta }
        : { a: r.applied },
    );
  };

  const menu = useActionMenu(
    suffixActions({
      applied: run.applied,
      beta: initial.beta,
      // text pole α (stejně jako ho ActionMenu ukazuje: zadaný, jinak postavené α)
      alphaText: () => menu.state.texts.alpha ?? run.applied,
      run: start,
      load: (e) => load(e.alpha, e.beta, e.id),
      now: Date.now,
      random: (seed, length) => {
        const a = randomAlpha(seed, length);
        load(a, patternFor(a, seed + 1), null);
      },
    }),
  );

  return (
    <Visualizer
      runKey={run.runId}
      // Výchozí příklad: α = „banana“, β = „ana“ jako po otevření (adresa bez parametrů)
      onRestoreInitial={() =>
        load(DEFAULT.alpha, DEFAULT.beta, DEFAULT.id, false)
      }
      title={moduleByPath("/string/suffix")?.title ?? "Sufixové pole + LCP"}
      description={
        <>
          <p>
            {fmtMath(
              "Sufixové pole X je permutace pozic řetězce α podle lexikografického pořadí sufixů; R je inverzní pole (R[i] = pořadí sufixu i, " +
                "tedy X[R[i]] = i). Stavíme ho zdvojováním: R_k[i] říká, kolik sufixů má prvních k znaků menších než sufix i, a setříděním dvojic " +
                "(R_k[i], R_k[i+k]) získáme pořadí podle 2k znaků. LCP pole L (Kasaiův algoritmus) a binární vyhledávání vzorku β jsou další " +
                "dvě operace; obě navazují na postavené pole X.",
            )}
          </p>
          <p className="complexity">
            <b>Konstrukce:</b> O(n log n) (O(log n) kol × radix sort) ·{" "}
            <b>LCP (Kasai):</b> O(n) · <b>hledání vzorku β:</b> O(|β| log n)
          </p>
        </>
      }
      actions={
        <>
          <ActionMenu menu={menu} />
          {/* co se se vstupem α stalo (odstraněné $, zkrácení, nové postavení před Kasai / hledáním) */}
          {run.note.text && (
            <p
              className={"am-msg" + (run.note.error ? " error" : "")}
              role={run.note.error ? "alert" : "status"}
              style={{ marginTop: "0.4rem" }}
            >
              {run.note.text}
            </p>
          )}
        </>
      }
      player={player}
      pseudocode={pseudocodeFor(run.phase)}
      opTitle={suffixCaption(run)}
      share
      tip={
        <>
          „mississippi“: Postavit X (tři kola zdvojování: k = 1, 2, 4), pak LCP
          pole (Kasai) – l klesá vždy nejvýše o 1, proto O(n). Nakonec hledejte
          β = „ssi“ a sledujte, jak se úsek kandidátů půlí. V Příkladech z knihy
          jsou slova z přednášky (banana, barokoarokoko).
        </>
      }
      legend={LEGENDS[run.phase.kind]}
    >
      {st && (
        // na velkém plátně se písmo tabulky zvětší podle volné výšky (nejvýš SA_ZOOM_MAX), ale jen
        // tak, aby se tabulka vešla do šířky (mez se v rámci běhu jen snižuje – písmo neposkakuje)
        // (dlouhé α, které se nevejde ani na nejmenším zvětšení, se posouvá uvnitř tabulky – saClamp)
        <CanvasFit limits={saFitLimits(fitBaseH, clampH !== null)}>
          {(delta) => {
            const zoom = saZoom(
              delta,
              fit.run === run.runId ? fit.cap : Infinity,
              fitBaseH,
            );
            return (
              <>
                <SATable
                  st={st}
                  zoom={zoom}
                  onFit={onFit}
                  maxHeight={clampH}
                  onMeasure={onMeasure(saAtMin(delta, fitBaseH))}
                />
                <VarsView vars={st.vars} />
              </>
            );
          }}
        </CanvasFit>
      )}
    </Visualizer>
  );
}
