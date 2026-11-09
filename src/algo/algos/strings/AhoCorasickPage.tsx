import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLinkSearchParams } from "../../core/linkParams";
import { ActionMenu } from "../../core/ActionMenu";
import { CanvasFit } from "../../core/canvasFit";
import { fmtMath } from "../../core/format";
import { materialize } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { Visualizer, type LegendItem } from "../../core/Visualizer";
import { moduleByPath } from "../../registry";
import { VarsView } from "../../views/ArrayView";
import { stackBrackets } from "../../views/textStripLayout";
import { acSteps, pseudocodeForAcPhase, type AcPhase } from "./ahoCorasick";
import { useInputHistory } from "../graphs/inputHistory";
import { AcCanvas } from "./ahoCorasickCanvas";
import {
  AC_DEFAULT,
  acActions,
  acCaption,
  acKmpLink,
  acReducer,
  acUrl,
  initialAc,
  randomAc,
  type AcCmd,
} from "./ahoCorasickPageModel";
import {
  AC_ALL_BACK_MAX,
  acBrackets,
  acDepth,
  acFitLimits,
  acLevel,
  acSlots,
  acVars,
} from "./ahoCorasickView";

const PATH = "/string/aho-corasick";

/** legenda jen se značkami, které se v dané fázi kreslí */
const LEGEND: Record<AcPhase, LegendItem[]> = {
  build: [
    { cls: "sw-active", label: "z – stav AcKroku" },
    { cls: "sw-compare", label: "syn s, jehož zpětnou hranu počítáme" },
    { cls: "sw-relax", shape: "line", label: "procházená zpětná hrana" },
    { cls: "sw-new", shape: "line", label: "právě nastavená Zpět / Zkratka" },
    { cls: "sw-forward", shape: "line-dashed", label: "zkratka" },
    { cls: "sw-tomb", shape: "dashed", label: "stav ještě bez zpětné hrany" },
    { cls: "sw-ac-word", label: "koncový stav (Slovo ≠ ∅)" },
  ],
  search: [
    { cls: "sw-active", label: "aktuální stav s / čtený znak" },
    { cls: "sw-relax", shape: "line", label: "procházená zpětná hrana" },
    { cls: "sw-tree", shape: "line", label: "procházená dopředná hrana" },
    { cls: "sw-forward", shape: "line-dashed", label: "zkratka (hlášení)" },
    { cls: "sw-ac-word", label: "koncový stav (Slovo ≠ ∅)" },
    { cls: "sw-hit", label: "ohlášený výskyt" },
  ],
};

/** Aho–Corasicková (#/string/aho-corasick): stavba automatu a hledání v jedné sadě kroků (Průvodce 13.3). */
/** stav vstupu, který vrací „↶ Vrátit operaci“ */
interface AcRunSnap {
  words: readonly string[];
  text: string;
  example: string | null;
}

/** Název operace do řádku Historie (jen příkazy, které mění slovník nebo seno). */
function acCmdTitle(cmd: AcCmd): string | null {
  switch (cmd.type) {
    case "add":
      return `Přidat slovo(${cmd.word})`;
    case "remove":
      return `Odebrat slovo(${cmd.word})`;
    case "load":
      return cmd.example ? "Příklad" : "Vytvořit";
    case "build":
      return "Postavit automat";
    case "search":
      return "Hledat";
    default:
      return null;
  }
}

export function AhoCorasickPage() {
  const title = moduleByPath(PATH)?.title ?? "Aho–Corasicková";
  // vstup jde sdílet odkazem #/string/aho-corasick?j=ara,bar&s=barbara (při otevření se nepřepisuje)
  const [params, setParams] = useLinkSearchParams();
  const [run, setRun] = useState(() =>
    initialAc({ j: params.get("j"), s: params.get("s") }),
  );
  const [names, setNames] = useState(true);
  /** null = podle velikosti slovníku (do 16 stavů všechny zpětné hrany) */
  const [allBackPick, setAllBack] = useState<boolean | null>(null);
  const steps = useMemo(
    () => materialize(acSteps(run.words, run.text, run.mode, run.from)),
    [run.words, run.text, run.mode, run.from],
  );
  const slots = useMemo(() => acSlots(steps), [steps]);
  const floors = useMemo(() => {
    const fin = steps[steps.length - 1]?.state;
    return fin
      ? Math.max(0, ...stackBrackets(acBrackets(fin)).map((b) => b.row + 1))
      : 0;
  }, [steps]);
  const player = usePlayer(steps);
  const st = player.current?.state;
  const nStates = steps[0]?.state.nodes.length ?? 1;
  const allBack = allBackPick ?? nStates <= AC_ALL_BACK_MAX;

  // ↶ Vrátit operaci: změny slovníku a sena (Vytvořit, Příklady, Přidat / Odebrat slovo, Výchozí příklad)
  const history = useInputHistory<AcRunSnap>();
  const apply = (cmd: AcCmd, title: string | null = acCmdTitle(cmd)) => {
    const next = acReducer(run, cmd);
    setRun(next);
    if (next.runId === run.runId) return;
    const changed =
      next.text !== run.text ||
      next.words.join("\u0001") !== run.words.join("\u0001");
    if (title && changed)
      history.record(title, {
        words: run.words,
        text: run.text,
        example: run.example,
      });
    menu.dispatch({ type: "text", name: "words", text: next.words.join(", ") });
    menu.dispatch({ type: "text", name: "text", text: next.text });
    const copy = new URLSearchParams(params);
    for (const [k, v] of Object.entries(acUrl(next))) copy.set(k, v);
    if (copy.toString() !== params.toString())
      setParams(copy, { replace: true });
  };

  /** Výchozí příklad (tlačítko pod akcemi) – vstup jako po otevření stránky */
  const restoreDefault = () =>
    apply(
      {
        type: "load",
        words: AC_DEFAULT.words,
        text: AC_DEFAULT.text,
        example: AC_DEFAULT.id,
      },
      "Výchozí příklad",
    );

  const menu = useActionMenu(
    acActions({
      words: run.words,
      text: run.text,
      wordsText: () => menu.state.texts.words ?? run.words.join(", "),
      build: (words) => apply({ type: "build", words }),
      search: (words, text) => apply({ type: "search", words, text }),
      read: (x) => apply({ type: "read", x }),
      add: (word) => apply({ type: "add", word }),
      remove: (word) => apply({ type: "remove", word }),
      load: (words, text, example) =>
        apply({ type: "load", words, text, example }),
      random: (seed) =>
        apply({ type: "load", ...randomAc(seed), example: null }),
      now: Date.now,
    }),
  );
  /** klik na znak sena: vyplní x akce „Přečti znak(x)“ */
  const pickChar = (i: number) => {
    const ch = st ? [...st.text][i] : undefined;
    if (!ch) return;
    menu.dispatch({ type: "open", id: "read" });
    menu.pick(ch);
  };
  /** klik na stav: koncový → Odebrat slovo(jeho jehla), jinak Přidat slovo(jméno stavu) */
  const pickNode = (id: number) => {
    const n = st?.nodes[id];
    if (!n || id === 0) return;
    const word = n.word !== null ? st.words[n.word] : null;
    menu.dispatch({ type: "open", id: word ? "remove" : "add" });
    menu.pick(word ?? n.name);
  };
  const phase: AcPhase =
    st?.phase ?? (run.mode === "search" ? "search" : "build");
  const kmp = acKmpLink(run);

  const options = (
    <p className="hint">
      Zobrazení:{" "}
      <label title="Jméno stavu (prefix jehly) vedle kroužku; kniha kreslí jen písmena na hranách">
        <input
          type="checkbox"
          checked={names}
          onChange={(e) => setNames(e.target.checked)}
        />{" "}
        jména stavů
      </label>{" "}
      <label title="Jinak jen zpětné hrany, které se v kroku týkají (velký slovník by byl nečitelný); tabulka ukazuje všechny">
        <input
          type="checkbox"
          checked={allBack}
          onChange={(e) => setAllBack(e.target.checked)}
        />{" "}
        všechny zpětné hrany
      </label>
    </p>
  );

  return (
    <Visualizer
      runKey={run.runId}
      onRestoreInitial={restoreDefault}
      inputHistory={history.control(() => {
        const b = history.pop();
        if (b)
          apply(
            { type: "load", words: b.words, text: b.text, example: b.example },
            null,
          );
      })}
      title={title}
      description={
        <>
          <p>
            {fmtMath(
              "Jehly ι₁, …, ιₙ uložíme do písmenkového stromu: stavy jsou všechny prefixy jehel, dopředné hrany přidávají písmeno. " +
                "Zpětná hrana vede do nejdelšího vlastního sufixu stavu, který je stavem; zkratka do nejbližšího koncového stavu po zpětných hranách. " +
                "Invariant jako u KMP: stav je nejdelší sufix přečteného sena, který je prefixem některé jehly. Zpětné hrany se počítají po hladinách " +
                "(fronta F) – AcKrok přitom chodí jen po hotových mělčích hladinách. Při hledání se po každém znaku ohlásí Slovo stavu a projdou se zkratky.",
            )}
          </p>
          <p className="complexity">
            <b>Konstrukce:</b> Θ(ΣJᵢ) · <b>hledání:</b> Θ(S + V), V = počet
            výskytů · <b>celkem:</b> Θ(ΣJᵢ + S + V)
          </p>
        </>
      }
      actions={
        <>
          <ActionMenu menu={menu} />
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
      pseudocode={pseudocodeForAcPhase(phase)}
      opTitle={acCaption(run)}
      share
      legend={LEGEND[phase]}
      options={options}
      tip={
        <>
          Obr. 13.2 se senem barbara: po „barbar“ je automat ve stavu barbar,
          který není koncový – výskyt bar ohlásí až zkratka barbar → bar, a na
          konci zkratka barbara → ara ohlásí ara. Při stavbě sledujte, že zpětná
          hrana vede vždy aspoň o hladinu výš.
        </>
      }
      notes={
        <>
          <p>
            Pseudokód AcKrok, AcHledej a AcKonstrukce je z Průvodce (str. 327 a
            328), obrázek automatu z obr. 13.2 (str. 326). Stavy číslujeme podle
            vzniku při vkládání slov, syny bereme v abecedním pořadí. Klik na
            znak sena vyplní „Přečti znak(x)“, klik na koncový stav „Odebrat
            slovo“, na jiný stav „Přidat slovo“ s jeho jménem.
          </p>
          <p>
            S jedinou jehlou je strom cesta a automat je přesně KMP (str. 325)
            {kmp ? (
              <>
                {": "}
                <Link className="ac-to-kmp" to={kmp}>
                  ← stejný automat v KMP
                </Link>
              </>
            ) : (
              " – viz příklad barbarossa (obr. 13.1)"
            )}
            .
          </p>
        </>
      }
    >
      {st && (
        <>
          <CanvasFit limits={acFitLimits(acDepth(st))}>
            {(fit) => (
              <AcCanvas
                st={st}
                slots={slots}
                reserveBrackets={floors}
                levelH={acLevel(fit, acDepth(st))}
                names={names}
                allBack={allBack}
                onPickText={pickChar}
                onPickNode={pickNode}
              />
            )}
          </CanvasFit>
          <VarsView vars={acVars(st)} />
        </>
      )}
    </Visualizer>
  );
}
