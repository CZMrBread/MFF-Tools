import { useMemo, useState } from "react";
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
import { PC_RK, rkSteps } from "./rabinKarp";
import { RabinKarpCanvas } from "./rabinKarpCanvas";
import {
  initialRk,
  randomRk,
  RK_DEFAULT,
  rkActions,
  rkCaption,
  rkReducer,
  rkUrl,
  rkZoom,
  rkZoomLimits,
  type RkCmd,
} from "./rabinKarpPageModel";
import { rkBrackets, rkCollapse, rkVars } from "./rabinKarpView";

const PATH = "/string/rabin-karp";

const LEGEND: LegendItem[] = [
  { cls: "sw-range", label: "okénko σ[i : i + J]" },
  { cls: "sw-compare", label: "h = j – kandidát, porovnáme znaky" },
  { cls: "sw-hit", glyph: "✓", label: "výskyt" },
  {
    cls: "sw-relax",
    glyph: "≈",
    label: "falešná shoda (stejný heš, jiný řetězec)",
  },
  { cls: "sw-miss", label: "odchozí znak σ[i] / neshodný znak ✗" },
  { cls: "sw-new", label: "příchozí znak σ[i + J] / shodný znak ✓" },
];

/** Rabin–Karp (#/string/rabin-karp): heš okénka a jeho přepočet v O(1) (Průvodce 13.4). */
export function RabinKarpPage() {
  const title = moduleByPath(PATH)?.title ?? "Rabin–Karp";
  // #/string/rabin-karp?j=kokos&s=clanekokokosu&p=31&n=101 (při otevření se nepřepisuje)
  const [params, setParams] = useLinkSearchParams();
  const [run, setRun] = useState(() =>
    initialRk({
      j: params.get("j"),
      s: params.get("s"),
      p: params.get("p"),
      n: params.get("n"),
    }),
  );
  const steps = useMemo(
    () => materialize(rkSteps(run.needle, run.text, run.P, run.N)),
    [run.needle, run.text, run.P, run.N],
  );
  // patra závorek a jejich sbalení podle konce běhu – kresba se během přehrávání nepřepíná
  const { floors, collapse } = useMemo(() => {
    const fin = steps[steps.length - 1]?.state;
    if (!fin) return { floors: 0, collapse: false };
    const c = rkCollapse(fin);
    return {
      collapse: c,
      floors: Math.max(
        0,
        ...stackBrackets(rkBrackets(fin, c)).map((b) => b.row + 1),
      ),
    };
  }, [steps]);
  const player = usePlayer(steps);
  const st = player.current?.state;

  const apply = (cmd: RkCmd) => {
    const next = rkReducer(run, cmd);
    setRun(next);
    if (next.runId === run.runId) return;
    menu.dispatch({ type: "text", name: "needle", text: next.needle });
    menu.dispatch({ type: "text", name: "text", text: next.text });
    menu.dispatch({ type: "text", name: "P", text: String(next.P) });
    menu.dispatch({ type: "text", name: "N", text: String(next.N) });
    const copy = new URLSearchParams(params);
    for (const [k, v] of Object.entries(rkUrl(next))) copy.set(k, v);
    if (copy.toString() !== params.toString())
      setParams(copy, { replace: true });
  };

  /** Výchozí příklad (tlačítko pod akcemi) – vstup jako po otevření stránky */
  const restoreDefault = () => apply({ type: "load", e: RK_DEFAULT });

  const menu = useActionMenu(
    rkActions({
      needle: run.needle,
      text: run.text,
      P: run.P,
      N: run.N,
      search: (needle, text, P, N) =>
        apply({ type: "search", needle, text, P, N }),
      load: (e) => apply({ type: "load", e }),
      random: (seed) => apply({ type: "search", ...randomRk(seed) }),
      now: Date.now,
    }),
  );
  /** klik na znak sena: jehla = okénko od této pozice (akce Hledat) */
  const pickWindow = (i: number) => {
    if (!st) return;
    const t = [...st.text];
    const J = [...st.needle].length;
    const from = Math.max(0, Math.min(i, t.length - J));
    menu.dispatch({ type: "open", id: "search" });
    menu.pick(t.slice(from, from + J).join(""));
  };

  return (
    <Visualizer
      runKey={run.runId}
      onRestoreInitial={restoreDefault}
      title={title}
      description={
        <>
          <p>
            {fmtMath(
              "Okénko délky J klouže po seně σ. Jeho heš H(x_1, …, x_J) = (x_1·P^{J−1} + … + x_J·P^0) mod N (písmena jako čísla a = 1, …, z = 26) " +
                "se při posunu přepočítá v O(1): H(x_2, …, x_{J+1}) = (P · H(x_1, …, x_J) − x_1·P^J + x_{J+1}) mod N. Znaky okénka porovnáme s jehlou, " +
                "jen když se heše shodují – jinak to výskyt být nemůže. Shodný heš u jiného řetězce je falešná shoda. P musí být nesoudělné s N a P^J řádově větší než N.",
            )}
          </p>
          <p className="complexity">
            <b>Průměrně:</b> O(J + S + V·J + S/N·J) (V = počet výskytů) ·{" "}
            <b>nejhůř:</b> O(JS) · Karp a Rabin, 1987
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
      pseudocode={PC_RK}
      opTitle={rkCaption(run)}
      share
      legend={LEGEND}
      tip={
        <>
          Příklad „kokos, N = 17“: okénko okoko (i = 6) má heš 15 stejně jako
          jehla – znaky se porovnají a ukáže se falešná shoda ≈. S N = 101 se
          heš shoduje jen u skutečného výskytu. Zkuste i P = 26, N = 13
          (soudělná).
        </>
      }
      notes={
        <p>
          Pseudokód RabinKarp je z Průvodce (str. 331), vzorce z str. 330. Kniha
          číselný příklad nemá – sena jsou z knihy (str. 319–320), P a N volíme
          my. Kódujeme a = 1, …, z = 26: s a = 0 by heš „ztratil“ počáteční áčka
          (aab a ab by bez modula měly stejný heš). Klik na znak sena vybere
          okénko od něj jako novou jehlu.
        </p>
      }
    >
      {st && (
        // na velkém plátně se pás zvětší (jinak by pod ním zůstala prázdná plocha)
        <CanvasFit limits={rkZoomLimits()}>
          {(delta) => (
            <>
              <RabinKarpCanvas
                zoom={rkZoom(delta)}
                st={st}
                reserveBrackets={floors}
                collapse={collapse}
                onPickText={pickWindow}
              />
              <VarsView vars={rkVars(st)} />
            </>
          )}
        </CanvasFit>
      )}
    </Visualizer>
  );
}
