/**
 * Konvexní obal (#/geom/hull, Průvodce 16.1, str. 401–405): KonvexníObal (zametání roviny, obr. 16.3)
 * a provázkový algoritmus (obr. 16.2). Tenká stránka nad hull.ts (kroky), hullPageModel.ts (odkaz, úpravy
 * bodů), hullActions.ts (nabídka), usePlaneDrag.ts (myš a prst v rovině) a views/HullView.tsx (rovina
 * a panel obálek).
 *
 * Rovina: klepnutí do prázdna = nový bod, klepnutí na bod = výběr (pole x, y; × u bodu ho smaže), tah bodu
 * = přesun (bod jede s ukazatelem, puštění = nový běh od kroku 1). Všechny úpravy vrací ↶ Vrátit operaci.
 *
 * Odkaz: `#/geom/hull?pts=10,20,35,70,…&v=wrap` (pts = body po dvojicích, „none“ = prázdná rovina;
 * v=wrap = provázkový algoritmus). Bez parametrů obr. 16.1 se zametáním.
 */
import { useEffect, useState } from "react";
import { ActionMenu } from "../../core/ActionMenu";
import { useLinkSearchParams } from "../../core/linkParams";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { Visualizer } from "../../core/Visualizer";
import { moduleByPath } from "../../registry";
import { HullPanel, HullPlane } from "../../views/HullView";
import {
  HULL_FRAME,
  HULL_MAP,
  HULL_PLANE,
  HULL_PT_R,
} from "../../views/hullPlaneMap";
import {
  initInputs,
  pushInput,
  titlesOf,
  undoInput,
} from "../sorting/inputHistory";
import { hullSteps, PC_SWEEP, PC_WRAP } from "./hull";
import { hullActions } from "./hullActions";
import { DEL_R, removeButtonAt } from "./planeDrag";
import { usePlaneDrag } from "./usePlaneDrag";
import {
  configFromUrl,
  configToUrl,
  DEFAULT_CONFIG,
  addAt,
  exampleOf,
  hullLegend,
  moveAt,
  nudge,
  removeId,
  pointsText,
  sameConfig,
  type HullConfig,
  type HullEdit,
} from "./hullPageModel";

interface Note {
  text: string;
  error: boolean;
}

const ALG_NAME = {
  sweep: "KonvexníObal (zametání)",
  wrap: "Provázkový algoritmus",
} as const;

export function HullPage() {
  const [params, setParams] = useLinkSearchParams();
  const [initial] = useState(() => configFromUrl(params));
  const [config, setConfig] = useState<HullConfig>(initial.config);
  const [runId, setRunId] = useState(0);
  const [note, setNote] = useState<Note | null>(
    initial.notice ? { text: initial.notice, error: true } : null,
  );
  // historie vstupů (body a algoritmus) pro řádek Historie a ↶ Vrátit operaci
  const [inputs, setInputs] = useState(() => initInputs(initial.config));

  // odkaz se při otevření stránky nepřepisuje – jen po změně bodů nebo algoritmu
  const writeUrl = (c: HullConfig) => {
    const next = new URLSearchParams(configToUrl(c));
    if (next.toString() !== params.toString())
      setParams(next, { replace: true });
  };
  /** nová konfigurace = nový běh: krok 1, pozastaveno (▶ ho přehraje) */
  const show = (c: HullConfig, n: Note | null) => {
    setConfig(c);
    setRunId((k) => k + 1);
    setNote(n);
    writeUrl(c);
  };
  const apply = (c: HullConfig, title: string, warn: string | null = null) => {
    setInputs((h) => pushInput(h, c, title, sameConfig));
    show(c, warn ? { text: warn, error: false } : null);
  };
  const edit = (e: HullEdit) => {
    if (e.kind === "points")
      apply({ ...config, points: e.points }, e.change.replace(/\.$/, ""));
    else if (e.kind === "error") setNote({ text: e.message, error: true });
  };
  // vybraný bod (klik / Enter): × u něj ho smaže, souřadnice jsou v polích x, y
  const [picked, setPicked] = useState<number | null>(null);
  const selected = config.points.some((p) => p.id === picked) ? picked : null;
  const undo = () => {
    const last = inputs.past[inputs.past.length - 1];
    if (!last) return;
    setInputs(undoInput);
    show(last.before, null);
  };

  // nové pole kroků s každou konfigurací (i stejné body s jiným algoritmem) → přehrávač stojí na kroku 1
  const [steps, setSteps] = useState(() =>
    hullSteps(initial.config.points, initial.config.alg),
  );
  const [stepsFor, setStepsFor] = useState(config);
  if (stepsFor !== config) {
    setStepsFor(config);
    setSteps(hullSteps(config.points, config.alg));
  }
  const player = usePlayer(steps);
  const st = player.current?.state ?? null;

  const menu = useActionMenu(
    hullActions({ config, apply, edit, seed: Date.now }),
  );
  const { dispatch } = menu;
  // pole „body =“ vždy ukazuje aktuální body
  useEffect(
    () =>
      dispatch({ type: "text", name: "P", text: pointsText(config.points) }),
    [config.points, dispatch],
  );

  /** výběr bodu: souřadnice do polí x, y (Přidat bod i Odebrat bod je sdílí) */
  const select = (id: number, points = config.points) => {
    const p = points.find((q) => q.id === id);
    if (!p) return;
    setPicked(id);
    dispatch({ type: "text", name: "x", text: String(p.x) });
    dispatch({ type: "text", name: "y", text: String(p.y) });
  };
  const remove = (id: number) => {
    setPicked(null);
    edit(removeId(config.points, id));
  };
  const selPt = config.points.find((p) => p.id === selected);
  const plane = usePlaneDrag({
    map: HULL_MAP,
    plane: HULL_PLANE,
    points: config.points,
    pointR: HULL_PT_R,
    remove: selPt
      ? {
          id: selPt.id,
          at: removeButtonAt(HULL_MAP.toPx(selPt.x, selPt.y), HULL_FRAME),
          r: DEL_R,
        }
      : null,
    onTap: (at) => {
      setPicked(null);
      edit(addAt(config.points, at.x, at.y));
    },
    onSelect: (id) => select(id),
    onRemove: remove,
    onMove: (id, to) => {
      const e = moveAt(config.points, id, to.x, to.y);
      edit(e);
      // přesunutý bod zůstane vybraný (× u něj, nové souřadnice v polích)
      if (e.kind === "points") select(id, e.points);
    },
  });

  const example = exampleOf(config.points);
  const n = config.points.length;

  return (
    <Visualizer
      drawingKeys={
        <>
          Rovina: <kbd>Tab</kbd> na ni, šipky po bodech, <kbd>Enter</kbd> bod
          vybere (jako klik), <kbd>Delete</kbd> ho smaže, <kbd>Shift</kbd>
          +šipky posun bodu, <kbd>Esc</kbd> ven
        </>
      }
      runKey={runId}
      title={moduleByPath("/geom/hull")?.title ?? "Konvexní obal"}
      description={
        <>
          <p>
            Konvexní obal n bodů v rovině je nejmenší konvexní mnohoúhelník,
            který je všechny obsahuje – nejkratší plot kolem jabloňového sadu.
            KonvexníObal zametá rovinu zleva doprava: body setřídí podle x (při
            shodě podle y) a každý další bod přidá do horní obálky H a dolní
            obálky D. Obálky jsou zásobníky; dokud by nový bod porušil směr
            zatáčení (horní obálka zatáčí doprava, dolní doleva), odebírá se
            poslední bod. Orientaci úhlu určí znaménko determinantu det M = x₁y₂
            − x₂y₁. Provázkový algoritmus místo toho otáčí polopřímkou kolem
            obalu jako provázkem namotávaným na špulku.
          </p>
          <p className="complexity">
            <b>KonvexníObal:</b> O(n log n) kvůli třídění, po setřídění O(n) –
            každý bod se odebere nejvýš jednou · <b>provázkový:</b> Θ(n·h) pro h
            vrcholů obalu, nejhůř Θ(n²) · <b>dolní odhad:</b> Ω(n log n) (cv.
            16.1.6)
          </p>
        </>
      }
      actions={
        <>
          <ActionMenu menu={menu} />
          {note && (
            <p
              className={"am-msg" + (note.error ? " error" : " warn")}
              role={note.error ? "alert" : "status"}
            >
              {note.error ? "" : "⚠ "}
              {note.text}
            </p>
          )}
        </>
      }
      inputHistory={{
        history: titlesOf(inputs),
        canUndo: inputs.past.length > 0,
        undo,
      }}
      onRestoreInitial={() =>
        apply(
          {
            points: DEFAULT_CONFIG.points.map((p) => ({ ...p })),
            alg: DEFAULT_CONFIG.alg,
          },
          "Výchozí příklad",
        )
      }
      player={player}
      pseudocode={config.alg === "wrap" ? PC_WRAP : PC_SWEEP}
      opTitle={`${ALG_NAME[config.alg]}, n = ${n}${example ? ` – ${example.label.split(" – ")[0]}` : ""}`}
      share
      tip={
        <>
          otevřete obr. 16.3 v Příkladech z knihy a dokrokujte k poslednímu bodu
          b – z horní obálky odejdou tři body, z dolní žádný, jako v knize. U
          cvičení 16.1.1 sledujte, že body na přímce horní obálka odebere (det M
          = 0 je „doleva“), dolní ne. Klepnutím do prázdného místa roviny
          přidáte bod; bod chytíte i kousek vedle kroužku a tažením ho přesunete
          (čáry jdou s ním, puštění připraví nový běh od kroku 1). Klepnutím bod
          vyberete – smaže ho × vedle něj, klávesa Delete nebo Odebrat bod(x,
          y); omyl vrátí ↶ Vrátit operaci. Pak porovnejte počet kroků zametání a
          provázkového algoritmu.
        </>
      }
      notes={
        <p className="hint">
          {example
            ? `${example.title}. Kniha souřadnice nedává – body jsou změřené z obrázku.`
            : "Vlastní body – odkaz je nese v parametru pts (dvojice x, y)."}
        </p>
      }
      legend={hullLegend(config.alg)}
    >
      {st && (
        <div className="hull-layout">
          <HullPlane
            st={st}
            svgProps={plane.handlers}
            attachSvg={plane.attachSvg}
            live={plane.live}
            selected={selected}
            onSelect={(id) => select(id)}
            onRemove={remove}
            onNudge={(id, dx, dy) => edit(nudge(config.points, id, dx, dy))}
          />
          <HullPanel st={st} />
        </div>
      )}
    </Visualizer>
  );
}
