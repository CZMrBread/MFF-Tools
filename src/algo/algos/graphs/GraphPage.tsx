/**
 * Stránka grafových algoritmů (GRAPH_ALGOS: BFS, DFS, mosty, topologické uspořádání, SCC, Dijkstra,
 * Bellman-Ford, Jarník, Borůvka, Kruskal). Algoritmus s `variants` dostane přepínač „Varianta“ (v= v odkazu).
 *
 * Zadávání po vzoru VisuAlgo: graf se kreslí přímo na plátně (GraphEditor – „Upravit graf“), příklady
 * z Průvodce a další vstupy jsou v nabídce operací pod plátnem (graphActions.ts), algoritmus se spustí
 * akcí „BFS(v₀) ▸ ▶ Spustit“ nebo klikem na vrchol (= v₀). Textový zápis hran je ve sbaleném panelu
 * „Import / export textem“. Logika bez Reactu je v graphPageModel.ts a graphActions.ts.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { readableSearch, useLinkSearchParams } from "../../core/linkParams";
import { ActionMenu } from "../../core/ActionMenu";
import { materialize } from "../../core/steps";
import { useActionMenu } from "../../core/useActionMenu";
import { usePlayer } from "../../core/usePlayer";
import { Visualizer } from "../../core/Visualizer";
import { isKnownPath, moduleByPath } from "../../registry";
import { VarsView } from "../../views/ArrayView";
import {
  GraphEditor,
  GraphEditorPanel,
  GraphTextPanel,
} from "../../views/GraphEditor";
import { frozenPlayer } from "../../views/graphEditPlayer";
import { subLabelReserve } from "../../views/graphGeometry";
import { GraphView, TableView } from "../../views/GraphView";
import { useGraphEdit } from "../../views/useGraphEdit";
import { UnionFindView } from "../../views/UnionFindView";
import { ufForestLayout } from "../../views/ufForestLayout";
import { GRAPH_ALGOS, legendFor, type GraphAlgorithm } from "./algorithms";
import { emptyState, plural, type Graph } from "./graph";
import {
  graphActionDefs,
  weightTerm,
  type GraphActionHandlers,
} from "./graphActions";
import {
  buildGraph,
  defaultSpec,
  effectiveSpec,
  formatWeights,
  graphFromUrl,
  graphDrawingKey,
  graphStructureKey,
  keepRowVisible,
  layoutPreset,
  legendForStyle,
  loadPresetGraph,
  opTitleFor,
  pageParams,
  pageStartLabel,
  positionsKey,
  randomPageGraph,
  sourceCaption,
  specFromParams,
  startIndex,
  variantFromParams,
  variantPseudocode,
  withVariantParam,
  withWeights,
} from "./graphPageModel";
import { useInputHistory } from "./inputHistory";
import { bfsLayers } from "./layers";
import { presetById } from "./presets";

/** stav vstupu, který vrací „↶ Vrátit operaci“ */
interface GraphSnap {
  graph: Graph;
  layout: string | undefined;
  startLabel: string | null;
  /** položka je přesun vrcholu – vrácení nespouští nový běh */
  moveOnly?: boolean;
}

/** po kolika ms od posledního přesunu vrcholu se souřadnice zapíšou do adresy (xy=) */
const URL_MOVE_DELAY_MS = 250;

const EMPTY_GRAPH_HINT =
  "Graf je prázdný – v režimu Upravit graf klikněte do plátna (vrchol) a táhněte z vrcholu na vrchol (hrana).";

export function GraphPage() {
  const { id } = useParams();
  const algo = GRAPH_ALGOS.find((a) => a.id === id);
  // neznámé id → přehled (App.tsx to hlídá také, tady pro jistotu i při přímém použití stránky)
  if (!algo || !isKnownPath(`/graph/${id}`)) return <Navigate to="/" replace />;
  return <GraphInner key={algo.id} algo={algo} />;
}

/** Stránka jednoho algoritmu (export kvůli testům variant s pokusným algoritmem). */
export function GraphInner({ algo }: { algo: GraphAlgorithm }) {
  const [params, setParams] = useLinkSearchParams();
  const navigate = useNavigate();
  // vstup z odkazu (jen při otevření stránky), jinak výchozí příklad; knižní předvolba se kreslí podle knihy
  const [init] = useState(() => {
    const url = specFromParams(algo, params);
    // souřadnice z xy= (ručně kreslený / přesunutý graf), jinak knižní nebo automatické rozložení
    const graph = graphFromUrl(url);
    const layout = graph.aspect
      ? (url.spec.layout ?? layoutPreset(url.spec)?.id)
      : undefined;
    // varianta algoritmu (v=), jen u algoritmů s variants; neznámá → výchozí s hláškou
    const v = variantFromParams(algo, params);
    const problem =
      [url.problem, v.problem].filter((x) => x !== null).join(" ") || null;
    return { ...url, graph, layout, variant: v.variant, problem };
  });
  const edit = useGraphEdit(init.graph);
  const graph = edit.graph;
  /** knižní předvolba, jejíž kresbu graf drží (popisek zdroje, p=… v odkazu) */
  const [layout, setLayout] = useState(init.layout);
  /** v₀ podle popisku – přežije úpravy grafu, které vrcholy přečíslují */
  const [startLabel, setStartLabel] = useState(init.startLabel);
  // roste se spuštěním (akce, klik na vrchol, ▶ Spustit, nový graf z nabídky) → připraví se nový běh (krok 1, ▶ ho přehraje);
  // kreslení ani přesun vrcholu ho nemění
  const [runId, setRunId] = useState(0);
  // roste se spuštěním i s „Prázdný – nakreslit“ → Visualizer posune plátno do záběru
  const [shownId, setShownId] = useState(0);
  const [urlProblem, setUrlProblem] = useState(init.problem);
  // jen kresba (běh se nemění): DFS jako obr. 5.9, BFS po vrstvách jako obr. 5.8
  const [bookStyle, setBookStyle] = useState(false);
  const [layered, setLayered] = useState(false);
  /** zvolená varianta algoritmu (null = algoritmus bez variant) */
  const [variant, setVariant] = useState(init.variant);

  // bez výslovné volby začíná algoritmus jako v knize (obr. 7.2: Jarník z E), jinak z prvního vrcholu
  const startId = startIndex(
    graph,
    pageStartLabel(algo, graph, layout, startLabel),
  );
  const v0 = graph.nodes[startId]?.label ?? null;
  const structure = graphStructureKey(graph);

  // Běh algoritmu: graf se zachytí jen při změně struktury (graphStructureKey bez souřadnic) nebo při
  // novém spuštění (runId). Přesun vrcholu tak kroky nepřepočítá a přehrávání zůstane, kde bylo; ▶ Spustit
  // znovu dá novou identitu kroků → přehrávač stojí pozastavený na kroku 1 a čeká na ▶ (samo se nikdy
  // nepřehrává, hlídá GraphPage.dom.test.ts).
  const runKey = `${structure}|${runId}`;
  const [run, setRun] = useState({ key: runKey, graph });
  if (run.key !== runKey) setRun({ key: runKey, graph });
  const steps = useMemo(
    () =>
      run.graph.nodes.length
        ? materialize(algo.run(run.graph, startId, variant ?? undefined))
        : [],
    [run, startId, algo, variant],
  );
  const player = usePlayer(steps);
  const [mode, setMode] = useState<"edit" | "run">("run");
  // v editoru přehrávač stojí na kroku 1 nového běhu a nic ho neposune (G-04)
  const shownPlayer = useMemo(
    () => (mode === "edit" ? frozenPlayer(player) : player),
    [mode, player],
  );
  // místo pro nejdelší popisky stavu za celý běh – kresba se mezi kroky ani v editoru neposouvá
  const subReserve = useMemo(
    () => subLabelReserve(steps.map((s) => s.state)),
    [steps],
  );
  const st = shownPlayer.current?.state;
  // les Union-Find (Kruskal): místo pro nejvyšší a nejširší les za celý běh – tabulka pod ním ani graf vedle
  // mezi kroky neposkočí
  const ufReserve = useMemo(
    () =>
      steps.reduce(
        (r, s) => {
          if (!s.state.uf) return r;
          const L = ufForestLayout(s.state.uf.parent);
          return { w: Math.max(r.w, L.w), h: Math.max(r.h, L.h) };
        },
        { w: 0, h: 0 },
      ),
    [steps],
  );
  const legend = useMemo(
    () => legendFor(algo, steps, run.graph),
    [algo, steps, run.graph],
  );

  // vstup do adresy (Kopírovat odkaz) po každé změně grafu nebo v₀ – při otevření stránky ne (odkaz platí).
  // Porovnává se klíč stavu, ne „první běh“: dvojí efekt ve StrictMode (dev) tak odkaz nepřepíše. Přesun
  // vrcholu (jen souřadnice, xy= v odkazu) se zapíše až chvíli po dotažení – tah myší by jinak přepisoval
  // adresu v každém snímku (prohlížeče replaceState škrtí).
  const urlKey = `${structure}|${v0}|${layout}|${runId}|${variant}`;
  const posKey = positionsKey(graph);
  const written = useRef({ urlKey, posKey });
  useEffect(() => {
    const w = written.current;
    if (w.urlKey === urlKey && w.posKey === posKey) return;
    const write = () => {
      written.current = { urlKey, posKey };
      const out = withVariantParam(
        algo,
        pageParams(algo, graph, v0, layout),
        variant,
      );
      if (out) setParams(out, { replace: true });
    };
    if (w.urlKey !== urlKey) {
      write();
      return;
    }
    const t = window.setTimeout(write, URL_MOVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [urlKey, posKey, algo, graph, v0, layout, variant, setParams]);

  const start = (label: string | null) => {
    if (label !== null) setStartLabel(label);
    setMode("run");
    setFrozenW(null);
    setUrlProblem(null);
    setRunId((r) => r + 1);
    setShownId((r) => r + 1);
  };

  // ↶ Vrátit operaci: každá změna vstupu z nabídky, import textem i celé sezení v „Upravit graf“
  const snap = (): GraphSnap => ({ graph, layout, startLabel });
  /** stav při vstupu do „Upravit graf“ – po návratu se celé sezení zapíše jako jedna operace */
  const [editStart, setEditStart] = useState<GraphSnap | null>(null);
  const history = useInputHistory<GraphSnap>();
  /** sezení v editoru už graf změnilo (↶ Vrátit operaci ho nejdřív zahodí, G-08) */
  const sessionDirty =
    mode === "edit" &&
    editStart !== null &&
    graphDrawingKey(editStart.graph) !== graphDrawingKey(graph);
  const undo = () => {
    if (sessionDirty && editStart) {
      // první klik v editoru: graf jako před vstupem do editoru, historie beze změny; editor zůstane otevřený
      edit.dispatch({ type: "load", graph: editStart.graph });
      setLayout(editStart.layout);
      setStartLabel(editStart.startLabel);
      return;
    }
    const b = history.pop();
    if (!b) return;
    setEditStart(null);
    edit.dispatch({ type: "load", graph: b.graph });
    setLayout(b.layout);
    setStartLabel(b.startLabel);
    // přesun vrcholu nebyl nový běh – krok přehrávače zůstane
    if (!b.moveOnly) start(null);
  };
  const historyControl = (() => {
    const c = history.control(undo);
    return sessionDirty ? { ...c, canUndo: true } : c;
  })();
  /** sezení v editoru, které graf změnilo → položka historie „Úprava grafu“ */
  const flushEdit = () => {
    const before = editStart;
    setEditStart(null);
    // i sezení, které jen přesouvalo (V-4)
    if (before && graphDrawingKey(before.graph) !== graphDrawingKey(graph))
      history.record("Úprava grafu", before);
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
  /**
   * Šířka sloupce výsledku zmrazená po dobu úprav (X-07): první vrchol prázdného grafu přidá tabulku, ale
   * sloupec se nerozšíří – kresba vedle neposkočí a vrchol zůstane pod kliknutím. Po Hotovo podle běhu.
   */
  const [frozenW, setFrozenW] = useState<number | null>(null);
  // prvek sloupce ve stavu (ne ref): handler ho smí číst, aniž by se ref předával při renderu
  const [resultEl, setResultEl] = useState<HTMLDivElement | null>(null);
  const freezeResult = () => setFrozenW(resultEl?.offsetWidth || null);
  const changeMode = (m: "edit" | "run") => {
    if (m === "edit") {
      // úpravy nic nespouštějí – rozběhnuté přehrávání se zastaví
      player.pause();
      if (mode !== "edit") {
        setEditStart(snap());
        freezeResult();
      }
    } else {
      flushEdit();
      setFrozenW(null);
    }
    setMode(m);
  };
  /** nový graf z nabídky: jde vrátit (↶ Vrátit operaci), v₀ = první vrchol, běh se připraví na krok 1 */
  const load = (g: Graph, lay: string | undefined, title: string) => {
    flushEdit();
    history.record(title, snap());
    edit.dispatch({ type: "load", graph: g });
    setLayout(lay);
    setStartLabel(null);
    start(null);
  };
  const restoreDefault = () => {
    const d = defaultSpec(algo);
    const g = buildGraph(d).graph;
    load(g, g.aspect ? layoutPreset(d)?.id : undefined, "Výchozí příklad");
  };
  const handlers: GraphActionHandlers = {
    loadPreset: (id) => {
      const r = loadPresetGraph(algo, id);
      load(r.graph, r.layout, presetById(id)?.label ?? id);
    },
    random: (n, m) =>
      load(
        randomPageGraph(algo, graph, n, m),
        undefined,
        `Náhodně (n = ${n}, m = ${m})`,
      ),
    empty: () => {
      flushEdit();
      history.record("Prázdný graf", snap());
      const t = effectiveSpec(algo, { ...graph, text: "" });
      const g: Graph = {
        directed: t.directed,
        weighted: t.weighted,
        nodes: [],
        edges: [],
      };
      edit.dispatch({ type: "load", graph: g });
      setLayout(undefined);
      setStartLabel(null);
      player.pause();
      setEditStart({ graph: g, layout: undefined, startLabel: null });
      if (mode !== "edit") freezeResult();
      setMode("edit");
      setShownId((r) => r + 1);
    },
    run: (label) => {
      flushEdit();
      start(label);
    },
    setWeights: (ws) => {
      flushEdit();
      history.record(weightTerm(algo).action, snap());
      edit.dispatch({ type: "load", graph: withWeights(graph, ws) });
      start(null);
    },
    switchAlgo: (id) => {
      const target = GRAPH_ALGOS.find((a) => a.id === id);
      if (!target) return;
      navigate({
        pathname: `/graph/${id}`,
        search: readableSearch(pageParams(target, graph, v0, layout) ?? {}),
      });
    },
  };
  const menu = useActionMenu(graphActionDefs(algo, graph, startId, handlers));

  // pole akcí sledují graf: v₀ = aktuální počáteční vrchol, ceny = dnešní ceny hran
  const weightsText = formatWeights(graph.edges.map((e) => e.w));
  const { dispatch: menuDispatch } = menu;
  useEffect(() => {
    if (v0 !== null) menuDispatch({ type: "text", name: "v0", text: v0 });
  }, [v0, structure, menuDispatch]);
  useEffect(() => {
    menuDispatch({ type: "text", name: "w", text: weightsText });
  }, [weightsText, menuDispatch]);

  const edgeStyle = bookStyle && algo.id === "dfs" ? "book" : "color";
  const layers =
    layered && algo.id === "bfs" && mode === "run" && graph.nodes.length
      ? bfsLayers(graph, startId)
      : null;
  const caption = sourceCaption(algo, graph, layout);
  const forced = algo.directed !== undefined || algo.weighted !== undefined;
  const lock = (on: boolean) =>
    on ? (algo.forcedWhy ?? "Typ grafu vyžaduje algoritmus") : undefined;
  const ariaLabel = `Graf: ${plural(graph.nodes.length, "vrchol", "vrcholy", "vrcholů")}, ${plural(graph.edges.length, "hrana", "hrany", "hran")}`;
  // Sloupec výsledku je i v editoru (G-01): ukazuje krok 1 nového běhu (kroky se z upravovaného grafu
  // počítají živě), nad ním je panel editoru (typ grafu, návod, hláška). Šířku dává obsah kroku 1 – stejná
  // jako po „Hotovo“, takže kresba při vstupu do editoru ani po návratu neposkočí.
  const editing = mode === "edit";
  // import textem v režimu algoritmu = samostatná operace; v editoru patří k sezení úprav
  const textLoad = (g: Graph) => {
    if (!editing) history.record("Import textem", snap());
    edit.dispatch({ type: "load", graph: g });
  };
  const resultRef = useRef<HTMLDivElement>(null);
  const attachResult = useCallback((el: HTMLDivElement | null) => {
    resultRef.current = el;
    setResultEl(el);
  }, []);
  // zvýrazněný řádek tabulky (Kruskal: právě zkoumaná hrana) drží v záběru panelu – posouvá se jen panel
  // s vlastním posuvníkem (desktop), stránka ne; les Union-Find nahoře může lepit (sticky) a řádek zakrýt
  useLayoutEffect(() => {
    const panel = resultRef.current;
    if (mode !== "run" || !panel || panel.scrollHeight <= panel.clientHeight)
      return;
    const row = panel.querySelector("tr.hl");
    if (!row) return;
    const forest = panel.querySelector(".uf-forest");
    const sticky =
      forest && getComputedStyle(forest).position === "sticky"
        ? forest.getBoundingClientRect().height
        : 0;
    const next = keepRowVisible(
      panel.getBoundingClientRect(),
      row.getBoundingClientRect(),
      panel.scrollTop,
      sticky,
    );
    if (next !== panel.scrollTop) panel.scrollTop = next;
  }, [mode, st]);
  // tabulka výsledku je vidět od kroku 1 (prázdná): graf se při přehrávání nezúží a neposune
  const tableShape = steps.find((s) => s.state.table)?.state.table;
  const shownTable =
    st?.table ??
    (tableShape && { ...tableShape, rows: [], highlight: undefined });

  /** zdroj obrázku a popis grafu – do sbalené nápovědy, aby plátno zůstalo vysoké */
  const notes = (
    <>
      {caption && <p className="hint graph-source">{caption}</p>}
      <p className="hint">
        {graph.nodes.length === 0
          ? EMPTY_GRAPH_HINT
          : `Graf: ${ariaLabel.slice(6)}, ${graph.directed ? "orientovaný" : "neorientovaný"}, ${graph.weighted ? "ohodnocený" : "neohodnocený"}`}
        {graph.nodes.length > 0 && forced && (
          <span className="muted"> (typ vyžaduje algoritmus)</span>
        )}
        {graph.nodes.length > 0 && "."}{" "}
        {algo.needsStart &&
          "Klik na vrchol = počáteční vrchol v₀ (běh se připraví, ▶ ho přehraje). "}
        Vrcholy jdou přetahovat myší i prstem – chytit jde i kousek vedle
        kroužku, kresba během tahu drží měřítko a vrchol puštěný za okrajem
        zůstane na okraji (z klávesnice: Tab na kresbu, šipkami na vrchol,
        Shift+šipky ho posunou). Sousedé se procházejí v pořadí podle názvu
        (čísla podle velikosti).
      </p>
    </>
  );
  /** jiná varianta algoritmu: nový běh na kroku 1 (▶ ho přehraje), v= v odkazu */
  const changeVariant = (id: string) => {
    flushEdit();
    setVariant(id);
    start(null);
  };
  /** přepínač varianty (algoritmy s variants) – vpravo pod pseudokódem */
  const variantOptions = algo.variants && (
    <fieldset className="graph-variants hint">
      <legend>Varianta:</legend>
      {algo.variants.map((x) => (
        <label key={x.id} title={x.title}>
          <input
            type="radio"
            name={`graph-variant-${algo.id}`}
            value={x.id}
            checked={variant === x.id}
            onChange={() => changeVariant(x.id)}
          />{" "}
          {x.label}
        </label>
      ))}
    </fieldset>
  );
  /** přepínač kresby (styl knihy / vrstvy) – vpravo pod pseudokódem */
  const viewOptions = (algo.id === "dfs" || algo.id === "bfs") && (
    <p className="hint">
      Zobrazení:{" "}
      {algo.id === "dfs" ? (
        <label title="Jako obr. 5.9 Průvodce: nestromové hrany tečkovaně, typ hrany jen popiskem">
          <input
            type="checkbox"
            checked={bookStyle}
            onChange={(e) => setBookStyle(e.target.checked)}
          />{" "}
          styl knihy
        </label>
      ) : (
        <label title="Jako obr. 5.8 Průvodce: vrstva = sloupec, ve sloupci v pořadí objevení">
          <input
            type="checkbox"
            checked={layered}
            onChange={(e) => setLayered(e.target.checked)}
          />{" "}
          vrstvy V₀…Vₖ
        </label>
      )}
    </p>
  );
  const options =
    variantOptions || viewOptions ? (
      <>
        {variantOptions}
        {viewOptions}
      </>
    ) : undefined;

  return (
    <Visualizer
      title={moduleByPath(`/graph/${algo.id}`)?.title ?? algo.title}
      description={
        <>
          <p>{algo.description}</p>
          <p className="complexity">
            <b>Čas:</b> {algo.complexity}
          </p>
        </>
      }
      opTitle={opTitleFor(algo, graph, startId)}
      inputHistory={historyControl}
      onRestoreInitial={restoreDefault}
      tip={algo.tip}
      share
      runKey={shownId}
      actions={<ActionMenu menu={menu} label="Graf a algoritmus" />}
      player={shownPlayer}
      pseudocode={variantPseudocode(algo, variant)}
      legend={legendForStyle(legend, edgeStyle)}
      notes={notes}
      options={options}
    >
      {urlProblem && (
        <p className="hint input-error" role="status">
          {urlProblem}
        </p>
      )}
      {/* na desktopu graf | výsledek běhu (tabulka, proměnné) vedle sebe – tabulka neodsune graf */}
      <div className="graph-layout">
        {graph.nodes.length === 0 && (
          // prázdný graf: návod přímo na plátně jako překryv (jinak je popis grafu ve sbalené
          // nápovědě) – po prvním vrcholu zmizí, ale plátno se neposune a vrchol leží pod kliknutím
          <p className="hint graph-empty-hint">{EMPTY_GRAPH_HINT}</p>
        )}
        {layers ? (
          // vrstvy jsou jen pohled v běhu: lišta s „Upravit graf“ zůstane (editor je dočasně vypne, po
          // „Hotovo“ se vrátí) a obal má stejnou stavbu jako GraphEditor – kresba neposkočí (G-09)
          <div className="graph-editor">
            <div className="ge-toolbar" role="toolbar" aria-label="Graf">
              <button
                type="button"
                className="ge-mode"
                aria-pressed={false}
                onClick={() => changeMode("edit")}
                title="Kreslit a upravovat graf přímo na plátně (vrstvy se po dobu úprav skryjí)"
              >
                Upravit graf
              </button>
            </div>
            <GraphView
              graph={layers.graph}
              state={st ?? emptyState()}
              groups={layers.groups}
              subReserve={subReserve}
              edgeStyle={edgeStyle}
              ariaLabel={ariaLabel}
              markers={algo.markers}
              onPickVertex={
                algo.needsStart
                  ? (id) => start(layers.graph.nodes[id]?.label ?? null)
                  : undefined
              }
            />
          </div>
        ) : (
          <GraphEditor
            edit={edit}
            mode={mode}
            onModeChange={changeMode}
            onRunMove={noteMove}
            onRunUndo={undo}
            state={st}
            onRun={() => start(null)}
            onPickVertex={
              algo.needsStart
                ? (id) => start(graph.nodes[id]?.label ?? null)
                : undefined
            }
            lockDirected={lock(algo.directed !== undefined)}
            lockWeighted={lock(algo.weighted !== undefined)}
            subReserve={subReserve}
            panel="outside"
            textPanel="outside"
            edgeStyle={edgeStyle}
            ariaLabel={ariaLabel}
            markers={algo.markers}
          />
        )}
        {/* sloupec výsledku je vždy (i v editoru a u prázdného grafu) – kresba vedle neposkočí */}
        <div
          className={
            "graph-result" +
            (st ? " has-run" : "") +
            (editing && frozenW ? " is-frozen" : "")
          }
          style={editing && frozenW ? { width: frozenW } : undefined}
          ref={attachResult}
        >
          {!editing && !shownTable && graph.nodes.length === 0 && (
            // prázdný graf po Hotovo: rozložení graf | sloupec zůstane jako v editoru (X-07)
            <div className="gtable graph-result-empty" aria-hidden="true" />
          )}
          {editing && (
            // typ grafu, návod a hláška editoru nahoře ve sloupci – nad kresbou nic nepřibude;
            // třída gtable: rozvržení graf | sloupec vedle sebe i u prázdného grafu (index.css)
            <div className="gtable ge-panel-slot">
              <GraphEditorPanel
                edit={edit}
                lockDirected={lock(algo.directed !== undefined)}
                lockWeighted={lock(algo.weighted !== undefined)}
              />
            </div>
          )}
          {st?.uf && (
            // Kruskal: les keříků Union-Find (E5) nad tabulkou – pod dlouhou tabulkou by na menších
            // obrazovkách zůstal mimo záběr; rozměry podle největšího lesa běhu
            <UnionFindView
              uf={st.uf}
              labels={run.graph.nodes.map((n) => n.label)}
              nodeMarks={st.nodeMarks}
              reserveH={ufReserve.h}
              reserveW={ufReserve.w}
            />
          )}
          {shownTable && <TableView table={shownTable} />}
          {st && <VarsView vars={st.vars} />}
          {/* Import / export textem ve sloupci (G-02): rozbalený nebere kresbě šířku ani výšku */}
          <GraphTextPanel edit={edit} onTextLoad={textLoad} />
        </div>
      </div>
    </Visualizer>
  );
}
