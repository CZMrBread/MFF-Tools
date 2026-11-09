/**
 * Plátno grafu s režimem „Upravit graf“ (po vzoru VisuAlgo) – tenká vrstva nad graphEdit.ts a GraphView.
 *
 * - Upravit graf: klik do prázdna = vrchol, tah z vrcholu na vrchol = hrana (dotyk: ťuknout na vrchol,
 *   pak na druhý), tah do prázdna = přesun, klik na hranu = cena (pole přímo na plátně), Delete /
 *   Backspace / dlouhý stisk prstem / pravé tlačítko = smazat, Ctrl+Z nebo „↶ Zpět“ = vrátit. Úpravy nic
 *   nespouštějí; „Hotovo“ přepne do režimu algoritmu a zavolá onRun (stránka připraví nový běh;
 *   přehraje se až po ▶).
 * - Režim algoritmu: klik (Enter) na vrchol = počáteční vrchol v₀ (onPickVertex), tah vrcholem ho posune.
 * - „Import / export textem“ (sbalený panel): text hran synchronizovaný s kresbou oběma směry.
 *
 * Použití na stránce (useGraphEdit z ./useGraphEdit):
 *   const edit = useGraphEdit(() => buildGraph(spec).graph);
 *   const [mode, setMode] = useState<"edit" | "run">("run");
 *   const key = topologyKey(edit.graph);   // přesun vrcholu kroky nepřepočítá
 *   const steps = useMemo(() => materialize(bfs(edit.graph, start)), [key, start]);
 *   const player = usePlayer(steps);
 *   <GraphEditor edit={edit} mode={mode} onModeChange={setMode} state={player.current?.state}
 *     onRun={() => setRunId((r) => r + 1)} onPickVertex={(v) => { setStart(v); setRunId((r) => r + 1); }} />
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  emptyState,
  type Graph,
  type GraphIssue,
  type GraphState,
} from "../algos/graphs/graph";
import type { NodeGroup } from "../algos/graphs/layers";
import { decideShortcut } from "../core/shortcuts";
import { graphEditText, importGraphText } from "./graphEdit";
import type { GraphEditControl } from "./useGraphEdit";
import { GraphView } from "./GraphView";
import type { Matrix2D } from "./pointer";

export interface GraphEditorProps {
  edit: GraphEditControl;
  mode: "edit" | "run";
  onModeChange: (mode: "edit" | "run") => void;
  /** stav algoritmu (krok přehrávače) pro režim algoritmu */
  state?: GraphState;
  /**
   * stav kresby v editoru (výchozí emptyState() – neutrální kresba s cenami hran); např. síť párování
   * bez popisků „1“ (edgeText s prázdnými texty)
   */
  editState?: GraphState;
  /** hustá kresba a poměr stran podle plátna (toky, viz GraphView `dense` a `fitAspect`) */
  dense?: boolean;
  fitAspect?: readonly [number, number];
  /** „Hotovo“ v editoru: návrat do režimu algoritmu a nový běh (stojí na kroku 1, přehraje ho až ▶) */
  onRun: () => void;
  /** graf z panelu Import / export (stránka si ho zapíše do historie); jinak se jen načte */
  onTextLoad?: (graph: Graph) => void;
  /** režim algoritmu: klik na vrchol = v₀ */
  onPickVertex?: (id: number) => void;
  /** důvod, proč orientaci nejde přepnout (algoritmus ji předepisuje) */
  lockDirected?: string;
  /** důvod, proč ohodnocení nejde přepnout */
  lockWeighted?: string;
  /** text tlačítka návratu z editoru, výchozí „Hotovo“ */
  runLabel?: string;
  height?: number;
  width?: number;
  ariaLabel?: string;
  edgeStyle?: "color" | "book";
  groups?: readonly NodeGroup[];
  /** matice obrazovky (testy) */
  screenMatrix?: () => Matrix2D | null;
  /**
   * „outside“: přepínače orientace a ohodnocení, návod a hláška editoru nejsou nad kresbou, ale
   * v GraphEditorPanel (stránka ho dá do sloupce výsledku) – kresba je v obou režimech stejně velká
   * a na stejném místě. Výchozí „inline“.
   */
  panel?: "inline" | "outside";
  /**
   * „outside“: panel Import / export textem nekreslí GraphEditor pod kresbou – stránka dá GraphTextPanel
   * do sloupce výsledku (kresbě pak při otevření nebere šířku ani výšku, G-02). Výchozí „inline“.
   */
  textPanel?: "inline" | "outside";
  /** nejdelší popisky stavu za běh (GraphView subReserve) – stejná kresba v obou režimech */
  subReserve?: Readonly<Record<number, string>>;
  /** další třídy hran s vlastní šipkou (GraphView markers) */
  markers?: readonly string[];
  /**
   * režim algoritmu: přesun vrcholu (před změnou grafu) – stránka si ho zapíše do „↶ Vrátit operaci“;
   * `gesture` = id tahu (všechna volání jednoho tahu stejné), u Shift+šipek chybí
   */
  onRunMove?: (id: number, gesture?: number) => void;
  /** režim algoritmu: Ctrl+Z na kresbě = „↶ Vrátit operaci“ stránky */
  onRunUndo?: () => void;
}

const isCtrlZ = (e: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  key: string;
}) => (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z";

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  !!t.closest("input, textarea, select, [contenteditable]");

export function GraphEditor({
  edit,
  mode,
  onModeChange,
  state,
  editState,
  dense,
  fitAspect,
  onRun,
  onTextLoad,
  onPickVertex,
  lockDirected,
  lockWeighted,
  runLabel = "Hotovo",
  height,
  width,
  ariaLabel,
  edgeStyle,
  groups,
  screenMatrix,
  subReserve,
  panel = "inline",
  textPanel = "inline",
  markers,
  onRunMove,
  onRunUndo,
}: GraphEditorProps) {
  const { graph, dispatch } = edit;
  const st = edit.state;
  const editing = mode === "edit";
  const [weightEdge, setWeightEdge] = useState<number | null>(null);

  // Esc zavře pole ceny a zruší rozdělanou hranu (klávesu stránce nebereme)
  const hasPending =
    weightEdge !== null || st.source !== null || st.selected !== null;
  useEffect(() => {
    if (!editing || !hasPending) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (decideShortcut(e, "none", false).action !== "escape") return;
      setWeightEdge(null);
      dispatch({ type: "select", target: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, hasPending, dispatch]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing || isTyping(e.target)) return;
    if (isCtrlZ(e) && onRunUndo) {
      e.preventDefault();
      onRunUndo();
    }
  };

  // Editor: Ctrl+Z a Delete platí, i když fokus po kliknutí do kresby skončil na <body> (klik do SVG
  // fokus nepřesune) – posluchač na window, dokud se upravuje; psaní do polí ho nechá být (G-06)
  const hasSelection = st.selected !== null;
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      if (isCtrlZ(e)) {
        e.preventDefault();
        dispatch({ type: "undo" });
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        hasSelection &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        dispatch({ type: "remove" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, hasSelection, dispatch]);

  // po zavření pole ceny (Enter, Esc) dostane fokus hrana – fokus se neztratí na <body> a Delete ji smaže
  const rootRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLButtonElement>(null);
  const refocusEdge = useRef<number | null>(null);
  useEffect(() => {
    const id = refocusEdge.current;
    if (id === null || weightEdge !== null) return;
    refocusEdge.current = null;
    const a = document.activeElement;
    if (a && a !== document.body && rootRef.current?.contains(a) === false)
      return; // uživatel mezitím přešel jinam
    rootRef.current
      ?.querySelector<SVGElement>(`[data-edge="${id}"] .edge-hit`)
      ?.focus({ preventScroll: true });
  });

  return (
    <div
      ref={rootRef}
      className={"graph-editor" + (editing ? " is-editing" : "")}
      onKeyDown={onKeyDown}
    >
      <div className="ge-toolbar" role="toolbar" aria-label="Graf">
        <button
          ref={modeRef}
          type="button"
          className="ge-mode"
          aria-pressed={editing}
          onClick={() => onModeChange(editing ? "run" : "edit")}
          title={
            editing
              ? "Zpět do režimu algoritmu bez spuštění"
              : "Kreslit a upravovat graf přímo na plátně"
          }
        >
          Upravit graf
        </button>
        {editing && (
          <>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setWeightEdge(null);
                onModeChange("run");
                onRun();
                // tlačítko Hotovo zmizí – fokus na Upravit graf, ne na <body> (G-06)
                modeRef.current?.focus();
              }}
            >
              {runLabel}
            </button>
            {/* Zpět a Smazat jako ikony: lišta má i v úzkém panelu (toky) jeden řádek – stejně vysoká
                jako v režimu algoritmu, kresba pod ní neposkočí (G-03) */}
            <button
              type="button"
              className="ge-icon"
              onClick={() => dispatch({ type: "undo" })}
              disabled={st.undo.length === 0}
              aria-label="Zpět"
              title="Zpět – vrátí poslední úpravu grafu (Ctrl+Z)"
            >
              <span aria-hidden="true">↶</span>
            </button>
            <button
              type="button"
              className="ge-icon"
              onClick={() => dispatch({ type: "remove" })}
              disabled={!st.selected}
              aria-label="Smazat"
              title={
                st.selected
                  ? "Smazat vybraný vrchol či hranu (Delete)"
                  : "Smazat – nejdřív vyberte vrchol nebo hranu"
              }
            >
              <TrashIcon />
            </button>
            {panel === "inline" && (
              <EditorToggles
                edit={edit}
                lockDirected={lockDirected}
                lockWeighted={lockWeighted}
              />
            )}
          </>
        )}
      </div>
      {editing && panel === "inline" && <EditorNotes edit={edit} />}
      <GraphView
        graph={graph}
        state={editing ? (editState ?? emptyState()) : (state ?? emptyState())}
        height={height}
        width={width}
        ariaLabel={ariaLabel}
        edgeStyle={edgeStyle}
        groups={editing ? undefined : groups}
        screenMatrix={screenMatrix}
        subReserve={subReserve}
        markers={markers}
        dense={dense}
        fitAspect={fitAspect}
        onMove={
          editing
            ? undefined
            : (id, x, y, gesture) => {
                onRunMove?.(id, gesture);
                dispatch({ type: "move", id, x, y, gesture });
              }
        }
        onPickVertex={editing ? undefined : onPickVertex}
        edit={
          editing
            ? {
                selected: st.selected,
                source: st.source,
                dispatch,
                onEdgeTap: (id) => {
                  if (graph.weighted) setWeightEdge(id);
                },
              }
            : undefined
        }
        editWeight={
          editing && weightEdge !== null
            ? {
                edge: weightEdge,
                onSubmit: (t) => {
                  refocusEdge.current = weightEdge;
                  setWeightEdge(null);
                  dispatch({ type: "setWeight", edge: weightEdge, text: t });
                },
                onCancel: () => {
                  refocusEdge.current = weightEdge;
                  setWeightEdge(null);
                },
              }
            : undefined
        }
      />
      {textPanel === "inline" && (
        <GraphTextPanel edit={edit} onTextLoad={onTextLoad} />
      )}
    </div>
  );
}

/**
 * „Import / export textem“ (sbalený panel): text hran synchronizovaný s kresbou oběma směry. GraphEditor
 * ho kreslí pod kresbou; s `textPanel="outside"` ho stránka dá jinam (sloupec výsledku grafů).
 */
export function GraphTextPanel({
  edit,
  onTextLoad,
}: {
  edit: GraphEditControl;
  /** graf z textu (stránka si ho zapíše do historie); jinak se jen načte */
  onTextLoad?: (graph: Graph) => void;
}) {
  const { graph, dispatch } = edit;
  /** rozepsaný text (null = text sleduje kresbu) */
  const [draft, setDraft] = useState<string | null>(null);
  const [issues, setIssues] = useState<{
    errors: GraphIssue[];
    warnings: GraphIssue[];
  }>({
    errors: [],
    warnings: [],
  });
  const text = graphEditText(graph);
  const shown = draft ?? text;
  const dirty = draft !== null && draft !== text;
  const applyText = () => {
    const r = importGraphText(graph, shown);
    setIssues({ errors: r.errors, warnings: r.warnings });
    if (r.errors.length) return;
    if (onTextLoad) onTextLoad(r.graph);
    else dispatch({ type: "load", graph: r.graph });
    setDraft(null);
  };
  return (
    <details className="ge-text">
      <summary>Import / export textem</summary>
      <label className="ge-text-label">
        <span>
          Hrany, jedna na řádek: <code>u v</code>
          {graph.weighted ? (
            <>
              {" "}
              <code>cena</code>
            </>
          ) : null}
          ; samotný název = izolovaný vrchol
        </span>
        <textarea
          value={shown}
          rows={Math.min(10, Math.max(3, shown.split("\n").length))}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              applyText();
            }
          }}
        />
      </label>
      <div className="ge-text-buttons">
        <button
          type="button"
          className={dirty ? "primary" : undefined}
          onClick={applyText}
        >
          Použít text
        </button>
        {dirty && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setDraft(null);
              setIssues({ errors: [], warnings: [] });
            }}
          >
            Zahodit změny
          </button>
        )}
        <span className="ge-text-note" role="status">
          {dirty
            ? "Text se liší od kresby – Použít text (Ctrl+Enter) ji přepíše."
            : ""}
        </span>
      </div>
      {issues.errors.length > 0 && (
        <div role="alert" className="hint input-error">
          {issues.errors.map((i) => (
            <div key={i.line + i.message}>{i.message}</div>
          ))}
        </div>
      )}
      {issues.errors.length === 0 && issues.warnings.length > 0 && (
        <div className="hint input-warn">
          {issues.warnings.map((i) => (
            <div key={i.line + i.message}>{i.message}</div>
          ))}
        </div>
      )}
    </details>
  );
}

/** ikona koše (inline SVG, barvu bere z textu tlačítka) */
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7.5 2.5h5l.7 1.5H17v2H3V4h3.8zM4.5 7h11l-.9 10.5H5.4zm3 2v6.5h1.5V9zm3.5 0v6.5h1.5V9z" />
    </svg>
  );
}

/** Přepínače typu grafu v režimu úprav. */
function EditorToggles({
  edit,
  lockDirected,
  lockWeighted,
}: {
  edit: GraphEditControl;
  lockDirected?: string;
  lockWeighted?: string;
}) {
  const { graph, dispatch } = edit;
  return (
    <>
      <label className="ge-toggle" title={lockDirected}>
        <input
          type="checkbox"
          checked={graph.directed}
          disabled={!!lockDirected}
          onChange={(e) =>
            dispatch({ type: "setDirected", value: e.target.checked })
          }
        />
        orientovaný
      </label>
      <label className="ge-toggle" title={lockWeighted}>
        <input
          type="checkbox"
          checked={graph.weighted}
          disabled={!!lockWeighted}
          onChange={(e) =>
            dispatch({ type: "setWeighted", value: e.target.checked })
          }
        />
        ohodnocený
      </label>
    </>
  );
}

/** Návod k ovládání a hláška editoru (odmítnutá úprava, rozdělaná hrana). */
function EditorNotes({ edit }: { edit: GraphEditControl }) {
  const { graph } = edit;
  const st = edit.state;
  return (
    <>
      <p className="ge-hint">
        Klik do prázdna = vrchol · tah z vrcholu na vrchol (nebo ťuknout na dva
        vrcholy) = hrana · tah vrcholu do prázdna (chytit jde i kousek vedle
        kroužku) nebo Shift+šipky = přesun · klik na hranu = cena · Delete,
        pravé tlačítko nebo dlouhý stisk prstem = smazat
      </p>
      <p className="ge-message" role="status">
        {st.message ??
          (st.source !== null
            ? `Spojit vrchol ${graph.nodes[st.source]?.label} s… (ťukněte na druhý vrchol, Esc = zrušit)`
            : "")}
      </p>
    </>
  );
}

/**
 * Přepínače, návod a hláška editoru mimo kresbu (GraphEditor s `panel="outside"`): stránka je dá do
 * sloupce výsledku, který v režimu úprav jinak zůstává prázdný.
 */
export function GraphEditorPanel({
  edit,
  lockDirected,
  lockWeighted,
}: {
  edit: GraphEditControl;
  lockDirected?: string;
  lockWeighted?: string;
}) {
  return (
    <div className="ge-panel">
      <div className="ge-toolbar" role="group" aria-label="Typ grafu">
        <EditorToggles
          edit={edit}
          lockDirected={lockDirected}
          lockWeighted={lockWeighted}
        />
      </div>
      <EditorNotes edit={edit} />
    </div>
  );
}
