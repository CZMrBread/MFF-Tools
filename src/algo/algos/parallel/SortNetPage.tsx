import { useEffect, useMemo, useState } from "react";
import { useLinkSearchParams } from "../../core/linkParams";
import { ActionMenu } from "../../core/ActionMenu";
import { CanvasFit } from "../../core/canvasFit";
import { fmtMath } from "../../core/format";
import { materialize } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { Visualizer } from "../../core/Visualizer";
import { moduleByPath } from "../../registry";
import { VarsView } from "../../views/ArrayView";
import { ComparatorView } from "../../views/ComparatorView";
import { comparatorFitLimits } from "../../views/comparatorLayout";
import { zeroOneCheck } from "./sortNet";
import {
  autoOrient,
  BOOK_EXAMPLES,
  configFromUrl,
  configToUrl,
  MAX_SEQ_N,
  netOf,
  DEFAULT_CONFIG,
  sortNetActions,
  sortNetLegend,
  type SortNetConfig,
} from "./sortNetPageModel";
import {
  labelBase,
  netTitle,
  sortNetPseudocode,
  sortNetSteps,
} from "./sortNetSteps";

interface Note {
  text: string;
  error: boolean;
}

/** výsledek „Ověřit 0-1 principem“ – na plátně, dokud se síť nebo vstup nezmění */
interface Check {
  sorted: number;
  total: number;
  /** protipříklad (načtený jako vstup), null = síť třídí */
  counter: number[] | null;
  text: string;
}

export function SortNetPage() {
  // vstup jde sdílet odkazem: #/parallel/sortnet?net=t&a=5,2,7,1,8,3,6,4 (&lay=seq &x=3 &o=h)
  const [params, setParams] = useLinkSearchParams();
  const [initial] = useState(() => configFromUrl(params));
  const [config, setConfig] = useState<SortNetConfig>(initial.config);
  const [runId, setRunId] = useState(0);
  const [note, setNote] = useState<Note | null>(
    initial.notice ? { text: initial.notice, error: true } : null,
  );
  // odkaz se při otevření stránky nepřepisuje – jen po změně vstupu, sítě nebo kresby
  const writeUrl = (c: SortNetConfig) => {
    const next = new URLSearchParams(configToUrl(c));
    if (next.toString() !== params.toString())
      setParams(next, { replace: true });
  };
  /** nová konfigurace = nový běh: krok 1, pozastaveno (▶ ho přehraje) */
  const [check, setCheck] = useState<Check | null>(null);
  const apply = (c: SortNetConfig, keepNote: Note | null = null) => {
    setCheck(null);
    setConfig(c);
    setRunId((k) => k + 1);
    setNote(keepNote);
    writeUrl(c);
  };

  const { kind, input, seq, removed } = config;
  const n = input.length;
  const net = useMemo(
    () => netOf({ kind, input, seq, removed: [], orient: null }),
    [kind, input, seq],
  );
  const steps = useMemo(
    () => materialize(sortNetSteps({ net, input, removed })),
    [net, input, removed],
  );
  const player = usePlayer(steps);
  const st = player.current?.state ?? null;
  const orient = config.orient ?? autoOrient(n);

  const verify = () => {
    const r = zeroOneCheck(net, removed);
    const isSortNet = kind !== "sep" && kind !== "bitonic";
    if (!r.counter) {
      setNote(null);
      setCheck({
        sorted: r.sorted,
        total: r.total,
        counter: null,
        text: `0-1 princip ✓ síť setřídila ${r.sorted} / ${r.total} vstupů z nul a jedniček, takže setřídí každý vstup (cv. 15.3.6).`,
      });
      return;
    }
    const why = removed.length
      ? "síť s vynechaným komparátorem už netřídí"
      : isSortNet
        ? "síť netřídí"
        : `${netTitle(kind, n)} není třídicí síť (třídí jen bitonické vstupy, viz s. 394)`;
    apply({ ...config, input: r.counter });
    setCheck({
      sorted: r.sorted,
      total: r.total,
      counter: r.counter,
      text: `0-1 princip ✗ setříděno ${r.sorted} / ${r.total} vstupů z nul a jedniček – ${why}. Protipříklad ${r.counter.join(", ")} je teď vstupem: krokujte ho a na konci uvidíte nesetříděný výstup.`,
    });
  };

  const menu = useActionMenu(
    sortNetActions({
      config,
      apply: (c) => apply(c),
      note: (text) => setNote({ text, error: true }),
      verify,
      seed: Date.now,
    }),
  );
  const { dispatch } = menu;
  // pole P vždy ukazuje aktuální vstup, Síť zvolenou síť
  useEffect(
    () => dispatch({ type: "text", name: "P", text: input.join(", ") }),
    [input, dispatch],
  );
  useEffect(
    () => dispatch({ type: "variant", id: "net", variant: kind }),
    [kind, dispatch],
  );

  const example = BOOK_EXAMPLES.find(
    (e) =>
      e.config.kind === kind &&
      e.config.seq === net.seq &&
      e.config.input.join() === input.join(),
  );
  const toggleInput = (w: number) => {
    const next = input.slice();
    next[w] = 1 - next[w];
    apply({ ...config, input: next });
  };

  const options = (
    <p className="hint">
      Zobrazení:{" "}
      {kind === "bubble" && n <= MAX_SEQ_N && (
        <>
          <label title="Jako obr. 15.6: každý komparátor zvlášť v pořadí zápisu, průchody oddělené tečkovaně">
            <input
              type="checkbox"
              checked={net.seq}
              onChange={(e) => apply({ ...config, seq: e.target.checked })}
            />{" "}
            jak je zapsaná (obr. 15.6)
          </label>{" "}
        </>
      )}
      <label title="Jako v knize: vodiče svisle, čas teče dolů. Vypnuto: vodiče vodorovně (víc místa pro n = 16)">
        <input
          type="checkbox"
          checked={orient === "v"}
          onChange={(e) => {
            const c = {
              ...config,
              orient: e.target.checked ? ("v" as const) : ("h" as const),
            };
            setConfig(c);
            writeUrl(c);
          }}
        />{" "}
        vodiče svisle
      </label>
    </p>
  );

  return (
    <Visualizer
      runKey={runId}
      // Výchozí příklad: třídička T₈ na 5, 2, 7, 1, 8, 3, 6, 4 jako po otevření (orientace zůstává)
      onRestoreInitial={() =>
        apply({
          ...DEFAULT_CONFIG,
          input: DEFAULT_CONFIG.input.slice(),
          orient: config.orient,
        })
      }
      title={moduleByPath("/parallel/sortnet")?.title ?? "Třídicí sítě"}
      description={
        <>
          <p>
            {fmtMath(
              "Komparátor dostane dvě hodnoty a menší pošle na levý výstup, větší ve směru šipky. Síť z komparátorů počítá po vrstvách: " +
                "komparátory jedné vrstvy nesdílejí vodič, a tak běží současně – čas = hloubka sítě. Paralelní bublinkové třídění má hloubku 2n − 3. " +
                "Rychlejší je bitonické třídění: separátor S_n rozdělí bitonickou posloupnost na menší a větší polovinu, bitonická třídička B_n je " +
                "separátory S_n, S_{n/2}, …, S_2, slévačka M_n obrátí druhou posloupnost a použije B_{2n} a třídička T_n slévá jako Mergesort. " +
                "Podle 0-1 principu stačí síť ověřit na všech 2^n vstupech z nul a jedniček.",
            )}
          </p>
          <p className="complexity">
            <b>Bublinková:</b> hloubka 2n − 3, n(n − 1)/2 komparátorů ·{" "}
            <b>Bₙ:</b> Θ(log n) · <b>Tₙ, Batcher:</b> hloubka Θ(log² n), Θ(n
            log² n) komparátorů
          </p>
        </>
      }
      actions={
        <>
          <ActionMenu menu={menu} />
          {note && (
            <p
              className={"am-msg" + (note.error ? " error" : "")}
              role={note.error ? "alert" : "status"}
              style={{ marginTop: "0.4rem" }}
            >
              {note.text}
            </p>
          )}
        </>
      }
      player={player}
      pseudocode={sortNetPseudocode(kind)}
      opTitle={
        netTitle(kind, n) +
        (net.seq ? " – jak je zapsaná" : "") +
        (example ? ` – ${example.label.split(" ").slice(0, 2).join(" ")}` : "")
      }
      share
      options={options}
      tip={
        <>
          Krokujte T₈ (obr. 15.9) a sledujte, jak se žetony po vrstvách
          prohazují. V Příkladech z knihy je separátor S₈ s horou a údolím (obr.
          15.10, 15.11) a bublinka jak je zapsaná (obr. 15.6) proti skutečnému
          průběhu (obr. 15.7). Klikněte na šipku, vynechejte komparátor a nechte
          0-1 princip najít vstup, který síť nesetřídí.
        </>
      }
      notes={
        example ? (
          <p className="hint">{example.title}.</p>
        ) : (
          <p className="hint">
            Kniha čísla na vstupu nedává – sítě jsou podle obrázků 15.6–15.10,
            vstup je zvolený.
          </p>
        )
      }
      legend={sortNetLegend(config)}
    >
      <CanvasFit limits={comparatorFitLimits(net, orient)}>
        {(delta) => (
          <ComparatorView
            net={net}
            state={st}
            input={input}
            orient={orient}
            labelBase={labelBase(kind)}
            removed={removed}
            delta={delta}
            onPickComp={(c) => menu.pick(c + 1)}
            onToggleInput={toggleInput}
          />
        )}
      </CanvasFit>
      {st && <VarsView vars={st.vars} reserve />}
      {check && (
        <div
          className={"sn-check" + (check.counter ? " fail" : " ok")}
          role="status"
        >
          <meter
            min={0}
            max={check.total}
            value={check.sorted}
            aria-label={`setříděno ${check.sorted} z ${check.total} vstupů z nul a jedniček`}
          />
          <span>{check.text}</span>
        </div>
      )}
    </Visualizer>
  );
}
