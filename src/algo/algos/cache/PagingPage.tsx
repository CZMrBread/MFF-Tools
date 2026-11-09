import { useMemo, useState } from "react";
import { moduleByPath } from "../../registry";
import { useLinkSearchParams } from "../../core/linkParams";
import { ActionMenu } from "../../core/ActionMenu";
import { IntField } from "../../core/Fields";
import { useActionMenu } from "../../core/useActionMenu";
import { fmtMath } from "../../core/format";
import { materialize } from "../../core/steps";
import { usePlayer } from "../../core/usePlayer";
import { Visualizer } from "../../core/Visualizer";
import { PAGING_EXAMPLES, pagingActions, runCaption } from "./pageModel";
import {
  initInputs,
  pushInput,
  titlesOf,
  undoInput,
} from "../sorting/inputHistory";
import {
  DEFAULT_P,
  DEFAULT_SEQ,
  MAX_P,
  MIN_P,
  paging,
  PC,
  readP,
  readSeq,
  STRATS,
  type PagingState,
} from "./paging";

/** co se se strategií stalo při posledním požadavku */
function lastText(c: PagingState["caches"]["LRU"]): string {
  if (!c.last) return "";
  if (c.last.hit) return "zásah";
  return c.last.evicted !== null
    ? `výpadek, vyhozena ${String(c.last.evicted).replace("-", "−")}`
    : "výpadek (volný slot)";
}

export function CacheTable({ st }: { st: PagingState }) {
  return (
    <div className="paging">
      <div className="paging-seq" aria-label="Posloupnost požadavků">
        {st.seq.map((x, k) => (
          <span
            key={k}
            className={"pg" + (k === st.i ? " cur" : k < st.i ? " done" : "")}
            aria-current={k === st.i ? "step" : undefined}
          >
            {x}
          </span>
        ))}
      </div>
      {/* širší tabulka (P = 8) se na úzkém plátně posouvá, první sloupec zůstává vidět */}
      <div className="table-scroll">
        <table className="paging-table">
          <thead>
            <tr>
              <th scope="col">strategie</th>
              {Array.from({ length: st.P }, (_, k) => (
                <th key={k} scope="col">
                  slot {k + 1}
                </th>
              ))}
              <th scope="col">výpadky</th>
              <th scope="col">poslední požadavek</th>
            </tr>
          </thead>
          <tbody>
            {STRATS.map((s) => {
              const c = st.caches[s];
              return (
                <tr key={s}>
                  <th scope="row">{s}</th>
                  {c.slots.map((pg, k) => (
                    <td
                      key={k}
                      className={
                        c.last && c.last.slot === k
                          ? c.last.hit
                            ? "hit"
                            : "miss"
                          : ""
                      }
                    >
                      {pg ?? "–"}
                    </td>
                  ))}
                  <td className="num">{c.misses}</td>
                  <td className="muted">{lastText(c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Run {
  seq: number[];
  P: number;
  /** id příkladu z nabídky (popisek a zdroj v názvu běhu); null = vlastní vstup */
  example: string | null;
}

const sameRun = (a: Run, b: Run) =>
  a.P === b.P &&
  a.example === b.example &&
  a.seq.length === b.seq.length &&
  a.seq.every((v, i) => v === b.seq[i]);

export function PagingPage() {
  // vstup jde sdílet odkazem: #/cache/paging?q=1,2,3,4&P=3
  // (oba parametry se zapisují jedním voláním – dvě volání setteru useUrlParam v jedné obsluze by se přepsala)
  const [params, setParams] = useLinkSearchParams();
  const [initial] = useState<Run>(() => {
    const seq = readSeq(params.get("q"));
    return {
      seq: seq ?? DEFAULT_SEQ,
      P: readP(params.get("P")) ?? DEFAULT_P,
      example: seq ? null : "belady",
    };
  });
  const writeUrl = (patch: Record<string, string>) => {
    const copy = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) copy.set(k, v);
    if (copy.toString() !== params.toString())
      setParams(copy, { replace: true });
  };
  // použité vstupy (σ, P, příklad) s historií – řádek Historie a ↶ Vrátit operaci (CROSS-05)
  const [inputs, setInputs] = useState(() => initInputs<Run>(initial));
  const applied = inputs.current;
  const push = (next: Run, title: string) =>
    setInputs((h) => pushInput(h, next, title, sameRun));
  const [P, setP] = useState(initial.P);
  // roste s každým spuštěním z nabídky – Visualizer podle něj posune plátno do záběru (při otevření stránky ne)
  const [runId, setRunId] = useState(0);

  const steps = useMemo(
    () => materialize(paging(applied.seq, applied.P)),
    [applied],
  );
  const player = usePlayer(steps);
  const st = player.current?.state;

  /** Spustí simulaci; pole požadavků ukáže přesně použitou posloupnost a adresa se aktualizuje. */
  const start = (
    seq: number[],
    p = P,
    example: string | null = null,
    title = `σ = ${seq.join(", ")}`,
  ) => {
    menu.dispatch({ type: "text", name: "q", text: seq.join(", ") });
    setP(p);
    push({ seq, P: p, example }, title);
    setRunId((k) => k + 1);
    writeUrl({ q: seq.join(","), P: String(p) });
  };
  /** P platí hned: simulace se přepočítá nad stejnou posloupností */
  const changeP = (p: number) => {
    setP(p);
    push({ ...applied, P: p }, `P = ${p}`);
    writeUrl({ P: String(p) });
  };
  /** ↶ Vrátit operaci: předchozí σ a P (pole i adresa je převezmou), nový běh na kroku 1 */
  const undo = () => {
    const prev = inputs.past[inputs.past.length - 1]?.before;
    if (!prev) return;
    setInputs(undoInput);
    setP(prev.P);
    menu.dispatch({ type: "text", name: "q", text: prev.seq.join(", ") });
    setRunId((k) => k + 1);
    writeUrl({ q: prev.seq.join(","), P: String(prev.P) });
  };
  const restore = () =>
    start([...initial.seq], initial.P, initial.example, "Výchozí příklad");

  const menu = useActionMenu(
    pagingActions({
      P,
      seq: applied.seq,
      now: Date.now,
      start: (seq, p, example, title) => start(seq, p, example ?? null, title),
    }),
  );

  return (
    <Visualizer
      runKey={runId}
      title={moduleByPath("/cache/paging")?.title ?? "Stránkování"}
      description={
        <>
          <p>
            Cache má P slotů; posloupnost požadavků na stránky obsluhujeme třemi
            strategiemi najednou. Zásah (hit) = stránka už v cache je, výpadek
            (miss) = musíme ji načíst z pomalé paměti. OPT zná budoucnost a
            vyhazuje stránku potřebnou nejpozději – slouží jako měřítko. LRU
            vyhazuje nejdéle nepoužitou, FIFO nejdéle načtenou.
          </p>
          <p>
            {fmtMath(
              "Věta Sleatora a Tarjana: pro P_LRU > P_OPT je F_LRU ≤ P_LRU/(P_LRU − P_OPT) · F_OPT + P_OPT – má-li LRU cache dvakrát větší " +
                "než OPT, udělá nejvýše dvakrát tolik výpadků (+ P_OPT). Tady mají všechny tři strategie stejné P; „zlá“ posloupnost (cyklus " +
                "P + 1 stránek) ukazuje, že při stejném P může mít LRU výpadek při každém požadavku.",
            )}
          </p>
          <p className="complexity">
            <b>Model:</b> cache má P = M/B bloků (stránek); výpadek = načtení
            bloku z pomalé paměti
          </p>
        </>
      }
      actions={
        <>
          {/* P je parametr, ne operace: platí hned (simulace se přepočítá), Enter ji i spustí (přehraje až ▶) */}
          <div className="paging-param" style={{ marginBottom: "0.4rem" }}>
            <IntField
              label="P ="
              value={P}
              onChange={changeP}
              min={MIN_P}
              max={MAX_P}
              onEnter={(p) =>
                start(
                  applied.seq,
                  p,
                  applied.example &&
                    PAGING_EXAMPLES.find((e) => e.id === applied.example)?.P ===
                      p
                    ? applied.example
                    : null,
                )
              }
              width="3rem"
              title={`Počet slotů cache (${MIN_P}–${MAX_P}); změna platí hned`}
            />
          </div>
          <ActionMenu menu={menu} />
        </>
      }
      player={player}
      inputHistory={{
        history: titlesOf(inputs),
        canUndo: inputs.past.length > 0,
        undo,
      }}
      onRestoreInitial={restore}
      pseudocode={PC}
      opTitle={runCaption(applied.P, applied.seq.length, applied.example)}
      share
      tip={
        <>
          výchozí posloupnost s P = 3 a pak s P = 4 – FIFO má s větší cache víc
          výpadků (9 → 10, Béládyho anomálie), LRU ani OPT ne. Potom „Vytvořit ▸
          Zlá posloupnost pro LRU“: LRU i FIFO mají výpadek při každém
          požadavku, OPT výrazně méně (s P = 3 polovinu). V Příkladech je čtení
          matice po sloupcích z přednášky.
        </>
      }
      legend={[
        { cls: "sw-hit", label: "zásah – stránka už v cache byla" },
        { cls: "sw-miss", label: "výpadek – stránka načtena do slotu" },
      ]}
    >
      {st && <CacheTable st={st} />}
    </Visualizer>
  );
}
