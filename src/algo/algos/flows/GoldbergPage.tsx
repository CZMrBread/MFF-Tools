/**
 * Goldbergův algoritmus (#/flow/goldberg, Průvodce 14.5–14.6, str. 368–376): výšky, vlna s přebytky,
 * Převedení po hraně a Zvednutí; varianta „nejvyšší vrchol“ = vylepšení z 14.6.
 *
 * Síť se kreslí a upravuje stejně jako u FordFulkersona a Dinica (GraphEditor – „Upravit graf“, kapacita =
 * cena hrany; síť, náhodná síť, párování a kapacity sdílí flowPageModel.ts / flowNet.ts). Vedle sítě
 * „vlna / kapacita“ (u vrcholu výška a přebytek) je kresba výšek (goldbergHeightView.tsx): vrcholy ve
 * sloupcích, svisle výška, odznak přebytku, hrany s rezervou dolů a převedení +δ. Operace „Goldberg(z, s)“
 * připraví běh na kroku 1, ▶ ho přehraje (nikdy se nespouští sám). Logika bez Reactu je v goldberg.ts,
 * goldbergView.ts a goldbergPageModel.ts.
 *
 * V režimu „Upravit graf“ zůstane rozložení i kresba výšek jako v běhu (zrušené UX-02, chyba vlastníka
 * 8. 11. 2026): výšky a proměnné živě ukazují krok 1 nového běhu upravené sítě (h(z) = n, ostatní 0),
 * přehrávač na něm stojí (flowEditPlayer.ts). „Jen výšky“ se v editoru kreslí jako obě, po Hotovo se vrátí.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionMenu } from "../../core/ActionMenu";
import { FIT_MEDIA, mediaMatches } from "../../core/layoutMedia";
import { readableSearch, useLinkSearchParams } from "../../core/linkParams";
import { materialize } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { Visualizer } from "../../core/Visualizer";
import { moduleByPath } from "../../registry";
import { VarsView } from "../../views/ArrayView";
import { GraphEditor, GraphEditorPanel } from "../../views/GraphEditor";
import { subLabelReserve } from "../../views/graphGeometry";
import { useGraphEdit } from "../../views/useGraphEdit";
import { useWidth } from "../../views/useWidth";
import type { Graph } from "../graphs/graph";
import {
  graphDrawingKey,
  graphStructureKey,
  withWeights,
} from "../graphs/graphPageModel";
import { useInputHistory } from "../graphs/inputHistory";
import { useEditFocus } from "./flowEditFocus";
import { frozenPlayer } from "./flowEditPlayer";
import { FLOW_MARKERS } from "./flowMarkers";
import { netProblem } from "./flowNet";
import {
  bipartiteNet,
  defaultSettings,
  endsNote,
  flowParams,
  netOf,
  randomNet,
  randomSeed,
  type FlowInput,
} from "./flowPageModel";
import { flowPresetById } from "./flowPresets";
import {
  isMatchingNet,
  MATCH_FIT_ASPECT,
  netCaption,
  phoneFitAspect,
  readableBase,
  readableWidth,
} from "./flowView";
import { goldberg, goldbergPseudocode, type GoldbergVariant } from "./goldberg";
import { GoldbergHeightView } from "./goldbergHeightView";
import {
  GOLDBERG_DEFAULT_EXAMPLE,
  GOLDBERG_PRESET_NOTE,
  goldbergActionDefs,
  goldbergDefaultInput,
  goldbergExampleInput,
  goldbergExampleOf,
  goldbergFromParams,
  goldbergOpTitle,
  goldbergParams,
  type GoldbergHandlers,
} from "./goldbergPageModel";
import {
  goldbergLegend,
  goldbergNetState,
  goldbergStacked,
  goldbergView,
  type GoldbergViewMode,
  goldbergVars,
  heightMax,
} from "./goldbergView";

const PATH = "/flow/goldberg";
const OTHER_PATH = { ff: "/flow/ford-fulkerson", dinic: "/flow/dinic" };

/** po kolika ms od posledního přesunu vrcholu se souřadnice zapíšou do adresy (xy=) */
const URL_MOVE_DELAY_MS = 250;

/** okno, kde se na jednu obrazovku vejdou pod sebou obě kresby široké sítě (obr. 14.7) */
const ROOMY_MEDIA = "(min-width: 1600px) and (min-height: 900px)";

/** stav vstupu, který vrací „↶ Vrátit operaci“ */
interface GoldbergSnap {
  graph: Graph;
  example: string | null;
  z: string | null;
  s: string | null;
  /** položka je přesun vrcholu – vrácení nespouští nový běh */
  moveOnly?: boolean;
}

const LOCK_DIRECTED = "Síť je vždy orientovaný graf.";
const LOCK_WEIGHTED = "Hrany sítě mají vždy kapacitu (cenu hrany).";

const DESCRIPTION =
  "Na rozdíl od FordFulkersona a Dinica nezačíná tokem, ale vlnou: všechny hrany ze zdroje se naplní na maximum a ve vrcholech vzniknou přebytky fΔ(v) = přítok − odtok. Vrcholy mají výšky h – zdroj n, ostatní 0 – a přebytek se smí převádět jen po hraně s kladnou rezervou z vyššího vrcholu do nižšího (Převedení: δ = min(přebytek, rezerva)). Když z vrcholu s přebytkem žádná taková hrana nevede, vrchol se zvedne o 1. Co se nevejde do stoku, vrátí se nakonec do zdroje. Jakmile žádný vrchol kromě z a s nemá přebytek, vlna je maximální tok (lemma K). Varianta 14.6 vybírá vždy nejvyšší vrchol s přebytkem.";
const COMPLEXITY =
  "O(n²m): nejvýš 2n² zvednutí, nm nasycených a O(n²m) nenasycených převedení; s volbou nejvyššího vrcholu O(n³), přesněji O(n²√m) (14.6) · Goldberg, 1985";
const TIP =
  "Krokujte obr. 14.2 a sledujte kresbu výšek: vrchol bez hrany s rezervou dolů se zvedá po jedné hladině, dokud z něj přebytek neodteče – nadbytek, který se nevejde do stoku, se vrací ke zdroji až nad výškou n (zdroj je ve výšce n). Přepněte variantu na nejvyšší vrchol a porovnejte počet kroků na obr. 14.7.";

export function GoldbergPage() {
  const mod = moduleByPath(PATH);
  const [params, setParams] = useLinkSearchParams();
  const navigate = useNavigate();
  const [init] = useState(() => goldbergFromParams(params));
  const edit = useGraphEdit(init.input.graph);
  const graph = edit.graph;
  const [ends, setEnds] = useState({ z: init.input.z, s: init.input.s });
  const [example, setExample] = useState(init.input.example);
  const [variant, setVariant] = useState<GoldbergVariant>(init.variant);
  // null = automaticky (goldbergView): široká síť v menším okně jen výšky
  const [chosenView, setView] = useState<GoldbergViewMode | null>(null);
  const [mode, setMode] = useState<"edit" | "run">("run");
  // roste se spuštěním → nový běh (krok 1, ▶ ho přehraje); kreslení ani přesun ho nemění
  const [runId, setRunId] = useState(0);
  // roste se spuštěním i s „Prázdná – nakreslit“ → Visualizer posune plátno do záběru
  const [shownId, setShownId] = useState(0);
  const [notice, setNotice] = useState(init.problem);
  // rozložení (kresby pod sebou, síť párování) zamrzne po dobu úprav – při kreslení se kresby nepřeskládají
  // ani nezmizí; nové rozložení až s novým během (Hotovo), F-03
  const [editLayout, setEditLayout] = useState<{
    stacked: boolean;
    matching: boolean;
  } | null>(null);

  const structure = graphStructureKey(graph);
  const exampleNow = goldbergExampleOf(graph, example);
  const input: FlowInput = { graph, z: ends.z, s: ends.s, example: exampleNow };
  const net = netOf(input);

  // Běh: síť se zachytí jen při změně struktury, zdroje/stoku, varianty nebo novém spuštění – přesun
  // vrcholu kroky nepřepočítá. Nové pole kroků = přehrávač na kroku 1, pozastavený (usePlayer).
  const runKey = `${structure}|${net.z}|${net.s}|${variant}|${runId}`;
  const [run, setRun] = useState({ key: runKey, input });
  if (run.key !== runKey) setRun({ key: runKey, input });
  const runNet = useMemo(() => netOf(run.input), [run]);
  // pod sebou podle poměru stran kresby sítě (jako FordFulkerson a Dinic); v editoru zmrazené (editLayout)
  const stacked = useMemo(() => goldbergStacked(runNet), [runNet]);
  const layoutNow = { stacked, matching: isMatchingNet(net) };
  const editing = mode === "edit";
  const layout = (editing && editLayout) || layoutNow;
  const steps = useMemo(
    () => materialize(goldberg(runNet, { variant })),
    [runNet, variant],
  );
  const player = usePlayer(steps);
  // v editoru krok 1 živě přepočítaného běhu (runKey obsahuje strukturu), jinak krok přehrávače
  const st = editing ? steps[0]?.state : player.current?.state;
  const legend = useMemo(() => goldbergLegend(runNet, steps), [runNet, steps]);
  // rozsah hladin kresby výšek – pevný pro celý běh (kresba se mezi kroky nepřeměřuje)
  const hMax = useMemo(() => heightMax(runNet, steps), [runNet, steps]);
  // místo pro nejdelší popisek vrcholu sítě za celý běh (výška, přebytek) – hustá kresba se mezi kroky ani
  // při vstupu do editoru nepřeměřuje
  const subReserve = useMemo(
    () => subLabelReserve(steps.map((s) => goldbergNetState(runNet, s.state))),
    [runNet, steps],
  );

  // odkaz po každé změně sítě, zdroje/stoku a varianty; při otevření stránky ne (ani ve StrictMode).
  // Přesun vrcholu (jen xy=) se zapíše až chvíli po dotažení.
  const q = goldbergParams(input, variant);
  const { xy: qxy, ...qrest } = q;
  const urlKey = JSON.stringify(qrest);
  const posKey = qxy ?? "";
  const written = useRef({ urlKey, posKey });
  const qText = readableSearch(q);
  useEffect(() => {
    const w = written.current;
    if (w.urlKey === urlKey && w.posKey === posKey) return;
    const write = () => {
      written.current = { urlKey, posKey };
      setParams(new URLSearchParams(qText), { replace: true });
    };
    if (w.urlKey !== urlKey) {
      write();
      return;
    }
    const t = window.setTimeout(write, URL_MOVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [urlKey, posKey, qText, setParams]);

  const start = () => {
    setMode("run");
    setEditLayout(null);
    setNotice(null);
    setRunId((r) => r + 1);
    setShownId((r) => r + 1);
  };

  // ↶ Vrátit operaci: každá změna vstupu z nabídky, import textem i celé sezení v „Upravit graf“
  const snap = (): GoldbergSnap => ({
    graph,
    example: exampleNow,
    z: ends.z,
    s: ends.s,
  });
  const [editStart, setEditStart] = useState<GoldbergSnap | null>(null);
  const history = useInputHistory<GoldbergSnap>();
  const restore = (b: GoldbergSnap) => {
    edit.dispatch({ type: "load", graph: b.graph });
    setExample(b.example);
    setEnds({ z: b.z, s: b.s });
  };
  /** sezení v editoru už síť změnilo (↶ Vrátit operaci ho nejdřív zahodí, X-05 jako G-08 u grafů) */
  const sessionDirty =
    mode === "edit" &&
    editStart !== null &&
    graphDrawingKey(editStart.graph) !== graphDrawingKey(graph);
  const undo = () => {
    if (sessionDirty && editStart) {
      // první klik v editoru: síť jako před vstupem do editoru, historie beze změny; editor zůstane otevřený
      restore(editStart);
      return;
    }
    const b = history.pop();
    if (!b) return;
    setEditStart(null);
    restore(b);
    // přesun vrcholu nebyl nový běh – krok přehrávače zůstane
    if (!b.moveOnly) start();
  };
  const flushEdit = () => {
    const before = editStart;
    setEditStart(null);
    // i sezení, které jen přesouvalo (V-4)
    if (before && graphDrawingKey(before.graph) !== graphDrawingKey(graph))
      history.record("Úprava sítě", before);
  };
  /**
   * Přesun vrcholu v režimu algoritmu = položka „↶ Vrátit operaci“ (V-4): celý tah jedna, série Shift+šipek
   * na témž vrcholu jedna (MOVE_GROUP_MS).
   */
  const noteMove = (id: number, gesture?: number) =>
    history.recordGrouped(
      `Přesun vrcholu ${graph.nodes[id]?.label ?? "?"}`,
      { ...snap(), moveOnly: true },
      gesture !== undefined ? `g${gesture}` : `k${id}`,
      gesture !== undefined ? Infinity : undefined,
    );
  const changeMode = (m: "edit" | "run") => {
    if (m === "edit") {
      // úpravy nic nespouštějí – rozběhnuté přehrávání se zastaví
      player.pause();
      if (mode !== "edit") {
        setEditStart(snap());
        setEditLayout(layoutNow);
      }
    } else {
      flushEdit();
      setEditLayout(null);
    }
    setMode(m);
  };
  /** nový vstup z nabídky: jde vrátit, zdroj a stok výchozí, běh se připraví na krok 1 */
  const load = (g: Graph, ex: string | null, title: string) => {
    flushEdit();
    history.record(title, snap());
    edit.dispatch({ type: "load", graph: g });
    setExample(ex);
    setEnds({ z: null, s: null });
    start();
  };
  const handlers: GoldbergHandlers = {
    random: (n, m) =>
      load(randomNet(n, m, randomSeed()), null, `Náhodně (n = ${n}, m = ${m})`),
    empty: () => {
      flushEdit();
      history.record("Prázdná síť", snap());
      const g: Graph = {
        directed: true,
        weighted: true,
        nodes: [
          { id: 0, label: "z", x: 0.08, y: 0.5 },
          { id: 1, label: "s", x: 0.92, y: 0.5 },
        ],
        edges: [],
      };
      edit.dispatch({ type: "load", graph: g });
      setExample(null);
      setEnds({ z: null, s: null });
      player.pause();
      setEditStart({ graph: g, example: null, z: null, s: null });
      setNotice(null);
      setEditLayout({ stacked: false, matching: false });
      setMode("edit");
      setShownId((r) => r + 1);
    },
    bipartite: (text) => {
      const r = bipartiteNet(text);
      if (r.graph) load(r.graph, null, "Párování");
    },
    loadExample: (id) => {
      const p = flowPresetById(id);
      if (p) load(goldbergExampleInput(p).graph, p.id, p.label);
    },
    run: (z, s) => {
      flushEdit();
      setEnds({ z, s });
      start();
    },
    setCapacities: (cs) => {
      flushEdit();
      history.record("Kapacity hran", snap());
      edit.dispatch({ type: "load", graph: withWeights(graph, cs) });
      start();
    },
    switchAlgo: (kind) => {
      const p = flowPresetById(exampleNow);
      navigate({
        pathname: OTHER_PATH[kind],
        search: readableSearch(flowParams(kind, input, defaultSettings(p))),
      });
    },
  };
  const restoreDefault = () => {
    setVariant("zakladni");
    load(
      goldbergDefaultInput().graph,
      GOLDBERG_DEFAULT_EXAMPLE,
      "Výchozí příklad",
    );
  };
  const menu = useActionMenu(goldbergActionDefs(input, handlers));

  // pole akcí sledují síť: z a s podle aktuální sítě, kapacity podle dnešních hran
  const { dispatch: menuDispatch } = menu;
  const zLabel = graph.nodes[net.z]?.label ?? "";
  const sLabel = graph.nodes[net.s]?.label ?? "";
  const capsText = graph.edges.map((e) => e.w).join(" ");
  useEffect(() => {
    menuDispatch({ type: "text", name: "z", text: zLabel });
    menuDispatch({ type: "text", name: "s", text: sLabel });
  }, [zLabel, sLabel, structure, menuDispatch]);
  useEffect(() => {
    menuDispatch({ type: "text", name: "c", text: capsText });
  }, [capsText, menuDispatch]);

  const changeVariant = (v: GoldbergVariant) => {
    flushEdit();
    setVariant(v);
    start();
  };

  const fit = mediaMatches(FIT_MEDIA);
  const view = goldbergView(chosenView, {
    stacked: layout.stacked,
    cramped: fit && !mediaMatches(ROOMY_MEDIA),
  });
  // v editoru je síť vidět vždy (kreslí se na ní): „jen výšky“ = obě, po Hotovo zase jen výšky
  const shown: GoldbergViewMode = editing && view === "vysky" ? "obe" : view;
  const showNet = shown !== "vysky";
  const showHeights = shown !== "sit";
  // síť párování podle rozložení (v editoru zmrazené) – kresba při úpravě kapacity neposkočí
  const matching = layout.matching;
  const problem = netProblem(net);
  // proměnné kroku dole v poslední viditelné kresbě (druhé, jinak v síti): síť vedle ní má na výšku o řádek
  // víc – síť párování v menším okně (1280 × 720) se tak víc roztáhne (F-05); v editoru krok 1 (F-03)
  const vars = <VarsView reserve vars={goldbergVars(net, st)} />;
  const note = endsNote(input);
  const preset = flowPresetById(exampleNow);
  // telefon a menší okno (stránka se posouvá): široká knižní síť (obr. 14.7) nesmí být užší, než aby se
  // vrcholy nepřekrývaly – pak se posouvá do strany (.view-wrap); na desktopu na jednu obrazovku ne
  // Čitelná šířka podle kresby při načtení sítě (u příkladu z knihy podle jeho kresby): přesun vrcholu ani
  // odkaz s xy= ji nemění – jinak by se plátno po tahu na telefonu roztáhlo (V-2, V-7, jako flowPage)
  const [layoutRef, layoutW] = useWidth();
  useEditFocus(layoutRef, editing);
  const readableKey = `${structure}|${exampleNow ?? ""}`;
  const [readable, setReadable] = useState(() => ({
    key: readableKey,
    need: readableWidth(readableBase(graph, exampleNow)),
  }));
  if (readable.key !== readableKey)
    setReadable({
      key: readableKey,
      need: readableWidth(readableBase(graph, exampleNow)),
    });
  const need = readable.need;
  // na telefonu se široká síť místo posunu do strany roztáhne na výšku (X-09)
  const squeeze = !fit && need !== null && need > layoutW;

  // editor: nápověda a hláška – v bočním sloupci (desktop na jednu obrazovku) nebo pod kresbami, F-03
  const editHelp = (
    <div className="flow-edit-help">
      <GraphEditorPanel
        edit={edit}
        lockDirected={LOCK_DIRECTED}
        lockWeighted={LOCK_WEIGHTED}
      />
      <p className="hint">
        Kresba výšek vedle sítě ukazuje krok 1 nového běhu upravené sítě (zdroj
        ve výšce n, ostatní 0, šipky = hrany s rezervou dolů). Hotovo připraví
        nový běh na kroku 1.
      </p>
    </div>
  );
  const radios = (
    name: string,
    legendText: string,
    value: string,
    options: readonly { id: string; label: string; title?: string }[],
    onChange: (id: string) => void,
    disabled = false,
  ) => (
    <fieldset className="flow-options hint" disabled={disabled}>
      <legend>{legendText}</legend>
      {options.map((o) => (
        <label key={o.id} title={o.title}>
          <input
            type="radio"
            name={`${name}-goldberg`}
            value={o.id}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
          />{" "}
          {o.label}
        </label>
      ))}
    </fieldset>
  );
  const options = (
    <>
      {radios(
        "gb-variant",
        "Volba vrcholu:",
        variant,
        [
          {
            id: "zakladni",
            label: "první v seznamu P (14.5)",
            title:
              "Kniha nechává volbu volnou – bereme vrchol, který je v seznamu P vrcholů s přebytkem nejdéle",
          },
          {
            id: "nejvyssi",
            label: "nejvyšší (14.6)",
            title:
              "Vylepšení z oddílu 14.6: ze všech vrcholů s přebytkem pokaždé ten nejvyšší – O(n²√m)",
          },
        ],
        (id) => changeVariant(id === "nejvyssi" ? "nejvyssi" : "zakladni"),
      )}
      {radios(
        "gb-view",
        "Kresba:",
        view,
        [
          { id: "obe", label: "obě" },
          { id: "sit", label: "jen síť" },
          { id: "vysky", label: "jen výšky", title: "Jen kresbu výšek" },
        ],
        (id) =>
          setView(id === "sit" ? "sit" : id === "vysky" ? "vysky" : "obe"),
      )}
      {editing && fit && editHelp}
    </>
  );
  const notes = (
    <>
      {preset && <p className="hint graph-source">{preset.note}</p>}
      <p className="hint graph-source">{GOLDBERG_PRESET_NOTE}</p>
      <p className="hint">
        Kresba výšek: každý vrchol má svůj sloupec, svisle jeho výška h
        (čárkovaná hladina n = výška zdroje). Odznak +x = přebytek, šipky =
        hrany s kladnou rezervou dolů – jen po nich se smí převádět (podle
        invariantu S vedou vždy o jednu hladinu níž). Sousedé se zkoušejí v
        pořadí podle názvu. Síť kreslíte v režimu Upravit graf jako u
        FordFulkersona; vrcholy sítě jdou přetahovat myší i prstem (chytit jde i
        kousek vedle kroužku, síť se během tahu nezmenšuje; z klávesnice
        Shift+šipky).
      </p>
    </>
  );

  return (
    <Visualizer
      title={mod?.title ?? PATH}
      description={
        <>
          <p>{DESCRIPTION}</p>
          <p className="complexity">
            <b>Čas:</b> {COMPLEXITY}
          </p>
        </>
      }
      opTitle={goldbergOpTitle(runNet, variant)}
      inputHistory={
        sessionDirty
          ? { ...history.control(undo), canUndo: true }
          : history.control(undo)
      }
      onRestoreInitial={restoreDefault}
      tip={TIP}
      share
      runKey={shownId}
      actions={<ActionMenu menu={menu} label="Síť a algoritmus" />}
      player={editing ? frozenPlayer(player) : player}
      pseudocode={goldbergPseudocode(variant)}
      legend={legend}
      notes={notes}
      options={options}
    >
      {notice && (
        <p className="hint input-error" role="status">
          {notice}
        </p>
      )}
      <div
        ref={layoutRef}
        className={
          `flow-layout gb-layout flow-view-${shown}` +
          (shown === "obe" && layout.stacked ? " flow-stack" : "") +
          (matching ? " flow-match" : "")
        }
      >
        <section
          className="flow-panel flow-panel-net"
          hidden={!showNet}
          aria-label="Síť: vlna / kapacita"
        >
          <p className="flow-panel-title">
            <span aria-hidden="true">Síť: vlna / kapacita</span>
            {note && !problem && !showHeights && (
              <span className="flow-panel-note" title={note}>
                {note}
              </span>
            )}
          </p>
          <GraphEditor
            edit={edit}
            mode={mode}
            onModeChange={changeMode}
            onRunMove={noteMove}
            onRunUndo={undo}
            onTextLoad={(g) => {
              if (mode !== "edit") history.record("Import textem", snap());
              edit.dispatch({ type: "load", graph: g });
            }}
            state={goldbergNetState(net, st)}
            // v editoru popisky jako krok 1 (0/c, u párování bez popisků) – stejně široké jako v běhu,
            // kresba při vstupu do editoru ani po Hotovo nezmění viewBox (F-03, F-10)
            editState={goldbergNetState(net, undefined)}
            onRun={() => start()}
            lockDirected={LOCK_DIRECTED}
            lockWeighted={LOCK_WEIGHTED}
            panel="outside"
            ariaLabel={`Síť ${netCaption(net)}`}
            markers={FLOW_MARKERS}
            subReserve={subReserve}
            dense
            // síť párování vyplní panel (R2), široká síť na telefonu se roztáhne na výšku (X-09)
            fitAspect={
              matching
                ? MATCH_FIT_ASPECT
                : squeeze
                  ? phoneFitAspect(graph.aspect)
                  : undefined
            }
          />
          {!showHeights && vars}
        </section>
        {showHeights && (
          <section
            className="flow-panel flow-panel-res"
            aria-label="Výšky vrcholů"
          >
            <p className="flow-panel-title">
              <span aria-hidden="true">Výšky h a přebytky</span>
              {note && !problem && (
                <span className="flow-panel-note" title={note}>
                  {note}
                </span>
              )}
              {!showNet && (
                <button
                  type="button"
                  className="flow-edit-net"
                  onClick={() => changeMode("edit")}
                  title="Upravit síť (vrcholy, hrany, kapacity) – po Hotovo nový běh na kroku 1"
                >
                  Upravit síť
                </button>
              )}
            </p>
            {problem ? (
              <p className="hint flow-panel-hint" role="status">
                {problem}
              </p>
            ) : (
              <GoldbergHeightView net={net} state={st} hMax={hMax} />
            )}
            {vars}
          </section>
        )}
      </div>
      {editing && !fit && editHelp}
    </Visualizer>
  );
}
