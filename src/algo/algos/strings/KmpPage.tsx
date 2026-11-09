import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { readableSearch, useLinkSearchParams } from "../../core/linkParams";
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
import { kmpSteps, pseudocodeForPhase, type KmpPhase } from "./kmp";
import { KmpCanvas } from "./kmpCanvas";
import { stripZoom, stripZoomLimits } from "./pageModel";
import {
  initialKmp,
  KMP_DEFAULT,
  kmpActions,
  kmpCaption,
  kmpReducer,
  kmpTip,
  kmpUrl,
  randomKmp,
  type KmpCmd,
} from "./kmpPageModel";
import { kmpBrackets, kmpSlots, kmpVars } from "./kmpView";

const PATH = "/string/kmp";
/** výška pásu a tabulky při 1 : 1 (px) – převod delty CanvasFit na zvětšení */
const KMP_ZOOM_BASE = 200;

/** legenda jen se značkami, které se v dané fázi kreslí */
const LEGEND: Record<KmpPhase, LegendItem[]> = {
  build: [
    { cls: "sw-active", label: "aktuální stav s / čtený znak" },
    { cls: "sw-new", glyph: "✓", label: "ι[s] = x (shodný prefix)" },
    { cls: "sw-miss", glyph: "✗", label: "ι[s] ≠ x" },
    { cls: "sw-relax", shape: "line", label: "procházená zpětná hrana" },
    { cls: "sw-tree", shape: "line", label: "procházená dopředná hrana" },
    { cls: "sw-tomb", shape: "dashed", label: "stav ještě bez zpětné hrany" },
  ],
  search: [
    { cls: "sw-active", label: "aktuální stav s / čtený znak" },
    { cls: "sw-new", glyph: "✓", label: "ι[s] = x (shodný prefix)" },
    {
      cls: "sw-miss",
      glyph: "✗",
      label: "ι[s] ≠ x (ι[J] = ⊥ se neshoduje nikdy)",
    },
    { cls: "sw-relax", shape: "line", label: "procházená zpětná hrana" },
    { cls: "sw-tree", shape: "line", label: "procházená dopředná hrana" },
    { cls: "sw-hit", label: "výskyt jehly" },
  ],
};

/** Knuth–Morris–Pratt (#/string/kmp): stavba automatu a hledání v jedné sadě kroků (Průvodce 13.2). */
export function KmpPage() {
  const title = moduleByPath(PATH)?.title ?? "Knuth–Morris–Pratt (KMP)";
  // vstup jde sdílet odkazem #/string/kmp?j=kokos&s=clanekokokosu (při otevření se nepřepisuje)
  const [params, setParams] = useLinkSearchParams();
  const [run, setRun] = useState(() =>
    initialKmp({ j: params.get("j"), s: params.get("s") }),
  );
  const steps = useMemo(
    () => materialize(kmpSteps(run.needle, run.text, run.mode, run.from)),
    [run.needle, run.text, run.mode, run.from],
  );
  const slots = useMemo(() => kmpSlots(steps), [steps]);
  const floors = useMemo(() => {
    const fin = steps[steps.length - 1]?.state;
    return fin
      ? Math.max(0, ...stackBrackets(kmpBrackets(fin)).map((b) => b.row + 1))
      : 0;
  }, [steps]);
  const player = usePlayer(steps);
  const st = player.current?.state;

  const apply = (cmd: KmpCmd) => {
    const next = kmpReducer(run, cmd);
    setRun(next);
    if (next.runId === run.runId) return;
    menu.dispatch({ type: "text", name: "needle", text: next.needle });
    menu.dispatch({ type: "text", name: "text", text: next.text });
    const copy = new URLSearchParams(params);
    for (const [k, v] of Object.entries(kmpUrl(next))) copy.set(k, v);
    if (copy.toString() !== params.toString())
      setParams(copy, { replace: true });
  };

  /** Výchozí příklad (tlačítko pod akcemi) – vstup jako po otevření stránky */
  const restoreDefault = () =>
    apply({
      type: "load",
      needle: KMP_DEFAULT.needle,
      text: KMP_DEFAULT.text,
      example: KMP_DEFAULT.id,
    });

  const menu = useActionMenu(
    kmpActions({
      needle: run.needle,
      text: run.text,
      needleText: () => menu.state.texts.needle ?? run.needle,
      build: (needle) => apply({ type: "build", needle }),
      search: (needle, text) => apply({ type: "search", needle, text }),
      read: (x) => apply({ type: "read", x }),
      load: (needle, text, example) =>
        apply({ type: "load", needle, text, example }),
      random: (seed) =>
        apply({ type: "load", ...randomKmp(seed), example: null }),
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
  const phase: KmpPhase =
    st?.phase ?? (run.mode === "search" ? "search" : "build");

  return (
    <Visualizer
      runKey={run.runId}
      onRestoreInitial={restoreDefault}
      title={title}
      description={
        <>
          <p>
            {fmtMath(
              "Vyhledávací automat má stavy = prefixy jehly ι (0 … J). Dopředná hrana ze stavu s čte ι[s], zpětná vede do Z[s] – " +
                "nejdelšího vlastního sufixu stavu, který je zároveň prefixem jehly. Invariant: stav s je nejdelší prefix jehly, " +
                "který je sufixem zatím přečteného sena. Automat se staví tak, že hledá jehlu v ní samé (KmpKonstrukce čte ι[1:]); " +
                "stavy ≥ i ještě nemají zpětnou hranu, ale čtení slova délky i − 1 se do nich nedostane.",
            )}
          </p>
          <p className="complexity">
            <b>Konstrukce:</b> Θ(J) · <b>hledání:</b> Θ(S) – zpětných hran je
            nejvýš tolik jako dopředných · <b>celkem:</b> Θ(J + S)
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
      pseudocode={pseudocodeForPhase(phase)}
      opTitle={kmpCaption(run)}
      share
      legend={LEGEND[phase]}
      tip={<>{kmpTip(run)}</>}
      notes={
        <>
          <p>
            Pseudokód KmpKrok, KmpHledej a KmpKonstrukce je z Průvodce (str. 322
            a 324). Zarážka ι[J] = ⊥ je fiktivní znak (str. 322): po ohlášení
            výskytu se automat ptá na dopřednou hranu z posledního stavu – ta
            neexistuje, takže vede zpětná hrana. Klik na znak sena vyplní akci
            „Přečti znak(x)“ (automat je online, str. 320).
          </p>
          {/[\s,;]/u.test(run.needle) ? (
            // Aho-Corasicková dělí slovník čárkou / středníkem – jehla s nimi by tam byla víc jehlami
            <p>
              Více jehel najednou umí Aho-Corasicková; jehla s čárkou nebo
              středníkem se do ní ale převést nedá (oddělují jehly slovníku).
            </p>
          ) : (
            <p>
              Více jehel najednou:{" "}
              <Link
                className="kmp-to-ac"
                to={`/string/aho-corasick${readableSearch({ j: run.needle, s: run.text })}`}
              >
                stejný automat v Aho-Corasickové →
              </Link>{" "}
              (s jedinou jehlou je to přesně automat KMP, str. 325).
            </p>
          )}
        </>
      }
    >
      {st && (
        // na velkém plátně se pás a tabulka zvětší (jinak by pod nimi zůstala prázdná plocha)
        <CanvasFit limits={stripZoomLimits(KMP_ZOOM_BASE)}>
          {(delta) => (
            <>
              <KmpCanvas
                st={st}
                slots={slots}
                reserveBrackets={floors}
                onPickText={pickChar}
                zoom={stripZoom(delta, KMP_ZOOM_BASE)}
              />
              <VarsView vars={kmpVars(st)} />
            </>
          )}
        </CanvasFit>
      )}
    </Visualizer>
  );
}
