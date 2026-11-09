/**
 * Plátno hradlové sítě s režimem „Upravit síť“ (po vzoru GraphEditor) – tenká vrstva nad circuitEdit.ts
 * a CircuitView.
 *
 * - Upravit síť: paleta Vstup, Výstup, AND, OR, NOT, NAND, NOR, XOR – klik myší vybere nástroj a klik do
 *   plátna přidá vrchol (přichycený k mřížce), tah tlačítka do plátna ho položí na místo puštění, Enter
 *   na tlačítku (klávesnice) ho přidá na volné místo. Vodič = tah z výstupního portu (●) na vstupní port
 *   (nebo na hradlo – první volný port); obsazený port se přepojí, cyklus editor odmítne s hláškou.
 *   Klik = výběr, Delete / Backspace / pravé tlačítko / dlouhý stisk = smazat, tah = přesun (mřížka),
 *   Shift+šipky = posun o krok mřížky (samotné šipky přesouvají fokus po kresbě – roving tabindex, D3),
 *   Enter na vrcholu = začátek vodiče a Enter na druhém = spojení, Ctrl+Z / „↶ Zpět“. Úpravy nic
 *   nespouštějí; „▶ Spočítat“ přepne do režimu výpočtu a zavolá onRun.
 * - Režim výpočtu: klik / Enter na vstup přepne 0 ↔ 1 (onToggleInput); mezerník je vždy přehrávač.
 * - Hloubka a velikost sítě se ukazují živě v obou režimech; „Import / export textem“ je synchronizovaný
 *   s kresbou oběma směry.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  GATE_FNS,
  GATE_INFO,
  type Bit,
  type GateFn,
  type NodeKind,
} from "../algos/parallel/circuit";
import {
  circuitText,
  type CircuitTextIssue,
} from "../algos/parallel/circuitText";
import { summaryText } from "../algos/parallel/gatesPageModel";
import { decideShortcut } from "../core/shortcuts";
import {
  importCircuitText,
  type CircuitEditControl,
  type CircuitSelection,
} from "./circuitEdit";
import {
  canvasBounds,
  growBounds,
  inPortAt,
  insideBounds,
  nodeAt,
  outPort,
  type Bounds,
  type P2,
  type PortHit,
} from "./circuitLayout";
import { CircuitView, type CircuitTarget } from "./CircuitView";
import {
  clientToLocal,
  LONG_PRESS_MS,
  TAP_SLOP,
  type Matrix2D,
} from "./pointer";

export interface CircuitEditorProps {
  edit: CircuitEditControl;
  mode: "edit" | "run";
  onModeChange: (mode: "edit" | "run") => void;
  /** „▶ Spočítat“ z režimu úprav */
  onRun: () => void;
  /** režim výpočtu: stav kroku */
  values?: Readonly<Record<string, Bit | null>>;
  active?: readonly string[];
  done?: boolean;
  bits?: Readonly<Record<string, Bit>>;
  showLayers?: boolean;
  onToggleInput?: (id: string) => void;
  /** proč síť nejde spočítat – v režimu úprav místo prázdné hlášky */
  issue?: string | null;
  ariaLabel?: string;
  /** šířka plátna v px (testy) */
  width?: number;
  /** matice obrazovky (testy; v prohlížeči svg.getScreenCTM()) */
  screenMatrix?: () => Matrix2D | null;
}

interface Tool {
  kind: NodeKind;
  fn?: GateFn;
  label: string;
  /** viditelný text tlačítka (přístupné jméno = label) */
  text: string;
  title: string;
}

const TOOLS: readonly Tool[] = [
  {
    kind: "in",
    label: "Vstup",
    text: "○ Vstup",
    title: "Vstup sítě (bit, který přepínáte klikem)",
  },
  {
    kind: "out",
    label: "Výstup",
    text: "Výstup ○",
    title: "Výstup sítě (převezme hodnotu jednoho vodiče)",
  },
  ...GATE_FNS.map((fn) => ({
    kind: "gate" as const,
    fn,
    label: GATE_INFO[fn].name,
    text: `${GATE_INFO[fn].symbol} ${GATE_INFO[fn].name}`,
    title: `Hradlo ${GATE_INFO[fn].name} (${GATE_INFO[fn].arity === 1 ? "1 vstup" : "2 vstupy"})`,
  })),
];

const sameTool = (a: Tool | null, b: Tool) =>
  !!a && a.kind === b.kind && a.fn === b.fn;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  !!t.closest("input, textarea, select, [contenteditable]");

interface Press {
  pointer: number;
  gesture: number;
  target: CircuitTarget;
  start: P2;
  /** poloha vrcholu na začátku tahu */
  origin: P2 | null;
  t0: number;
  moved: boolean;
}

export function CircuitEditor({
  edit,
  mode,
  onModeChange,
  onRun,
  values,
  active,
  done,
  bits,
  showLayers = true,
  onToggleInput,
  issue,
  ariaLabel,
  width,
  screenMatrix,
}: CircuitEditorProps) {
  /** „Upravit síť“ – po ▶ Spočítat dostane fokus (tlačítko Spočítat zmizí, fokus nesmí na <body>) */
  const modeRef = useRef<HTMLButtonElement>(null);
  const { circuit, dispatch } = edit;
  const st = edit.state;
  const editing = mode === "edit";
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const press = useRef<Press | null>(null);
  const gestures = useRef(0);
  const [wirePreview, setWirePreview] = useState<{
    from: P2;
    to: P2;
    target: PortHit | null;
  } | null>(null);
  /** výřez se během tahu nemění (kresba by pod ukazatelem ujížděla) */
  const [frozen, setFrozen] = useState<Bounds | null>(null);
  const paletteDrag = useRef<{
    pointer: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  /** rozepsaný text (null = text sleduje kresbu) */
  const [draft, setDraft] = useState<string | null>(null);
  const [errors, setErrors] = useState<CircuitTextIssue[]>([]);

  /*
   * Výřez režimu úprav drží: klik do plátna položí prvek pod kurzor a dříve položené se neposunou.
   * Znovu se spočítá jen při vstupu do úprav, nové síti a Uspořádat (layoutEpoch); jinak se jen
   * zvětší, když kresba vyjede ven (growBounds). Při výpočtu sleduje kresbu.
   */
  const vbKey = editing ? st.layoutEpoch : -1;
  const [held, setHeld] = useState(() => ({
    key: vbKey,
    vb: canvasBounds(circuit, editing, showLayers),
  }));
  let editVb = held.vb;
  if (editing) {
    const next =
      held.key !== vbKey
        ? canvasBounds(circuit, true, showLayers)
        : growBounds(held.vb, circuit, showLayers);
    if (next !== held.vb || held.key !== vbKey) {
      editVb = next;
      setHeld({ key: vbKey, vb: next });
    }
  } else if (held.key !== vbKey) setHeld({ key: vbKey, vb: held.vb });
  const viewBox =
    frozen ?? (editing ? editVb : canvasBounds(circuit, false, showLayers));
  const text = circuitText(circuit);
  const shown = draft ?? text;
  const dirty = draft !== null && draft !== text;
  const selectedGate =
    st.selected?.kind === "node"
      ? circuit.nodes.find(
          (n) =>
            n.id === (st.selected as { id: string }).id && n.kind === "gate",
        )
      : undefined;

  // Esc zruší nástroj, rozdělaný vodič a výběr
  const pending =
    editing && (tool !== null || st.source !== null || st.selected !== null);
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (decideShortcut(e, "none", false).action !== "escape") return;
      setTool(null);
      dispatch({ type: "select", target: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, dispatch]);

  // Ctrl+Z v režimu úprav odkudkoli kromě textových polí (i po kliku myší nebo smazání prvku)
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        dispatch({ type: "undo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, dispatch]);

  /** smazaný prvek měl fokus – ať nespadne na <body>, převezme ho plátno editoru */
  const focusCanvas = () => wrapRef.current?.focus({ preventScroll: true });
  const removeAndKeepFocus = (target?: CircuitSelection) => {
    dispatch(target ? { type: "remove", target } : { type: "remove" });
    focusCanvas();
  };

  const local = (clientX: number, clientY: number): P2 | null =>
    clientToLocal(
      clientX,
      clientY,
      screenMatrix
        ? screenMatrix()
        : (svgRef.current?.getScreenCTM?.() ?? null),
    );

  const end = () => {
    press.current = null;
    setWirePreview(null);
    setFrozen(null);
  };

  const onPointerDown = (e: PointerEvent<Element>, target: CircuitTarget) => {
    if (!editing || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (press.current && press.current.pointer !== e.pointerId) return;
    const start = local(e.clientX, e.clientY);
    if (!start) return;
    const n =
      target.kind === "node"
        ? circuit.nodes.find((m) => m.id === target.id)
        : undefined;
    gestures.current += 1;
    press.current = {
      pointer: e.pointerId,
      gesture: gestures.current,
      target,
      start,
      origin: n ? { x: n.x, y: n.y } : null,
      t0: e.timeStamp,
      moved: false,
    };
    setFrozen(viewBox);
    if (target.kind === "empty") focusCanvas();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const pr = press.current;
    if (!pr || pr.pointer !== e.pointerId) return;
    const p = local(e.clientX, e.clientY);
    if (!p) return;
    if (!pr.moved && Math.hypot(p.x - pr.start.x, p.y - pr.start.y) < TAP_SLOP)
      return;
    pr.moved = true;
    const t = pr.target;
    if (t.kind === "node" && pr.origin)
      dispatch({
        type: "move",
        id: t.id,
        x: pr.origin.x + p.x - pr.start.x,
        y: pr.origin.y + p.y - pr.start.y,
        gesture: pr.gesture,
        within: viewBox,
      });
    else if (t.kind === "port") {
      const n = circuit.nodes.find((m) => m.id === t.id);
      const from = n && outPort(n, circuit.flow);
      if (from)
        setWirePreview({ from, to: p, target: inPortAt(circuit, p, 14) });
    }
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const pr = press.current;
    if (!pr || pr.pointer !== e.pointerId) return;
    end();
    const p = local(e.clientX, e.clientY) ?? pr.start;
    const moved =
      pr.moved || Math.hypot(p.x - pr.start.x, p.y - pr.start.y) >= TAP_SLOP;
    const t = pr.target;
    const long = !moved && e.timeStamp - pr.t0 >= LONG_PRESS_MS;
    if (long && (t.kind === "node" || t.kind === "wire")) {
      removeAndKeepFocus(t.kind === "node" ? { kind: "node", id: t.id } : t);
      return;
    }
    if (t.kind === "node") {
      if (moved && pr.origin)
        dispatch({
          type: "move",
          id: t.id,
          x: pr.origin.x + p.x - pr.start.x,
          y: pr.origin.y + p.y - pr.start.y,
          gesture: pr.gesture,
          within: viewBox,
        });
      else if (!moved) {
        if (st.source !== null) dispatch({ type: "tapNode", id: t.id });
        else dispatch({ type: "select", target: { kind: "node", id: t.id } });
      }
    } else if (t.kind === "port") {
      if (!moved) {
        dispatch({ type: "tapNode", id: t.id });
        return;
      }
      const hit = inPortAt(circuit, p, 14);
      if (hit)
        dispatch({ type: "connect", from: t.id, to: hit.node, port: hit.port });
      else {
        const over = nodeAt(circuit, p, 4);
        if (over && over !== t.id)
          dispatch({ type: "connect", from: t.id, to: over });
      }
    } else if (t.kind === "wire") {
      if (!moved) dispatch({ type: "select", target: t });
    } else if (!moved) {
      if (tool)
        dispatch({
          type: "add",
          kind: tool.kind,
          fn: tool.fn,
          x: p.x,
          y: p.y,
          within: viewBox,
        });
      else if (st.selected || st.source !== null)
        dispatch({ type: "select", target: null });
    }
  };

  /** klávesy jinak obsluhuje přehrávač (posluchač na window) – tady patří vrcholu či vodiči */
  const own = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const ARROWS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const onNodeKey = (e: KeyboardEvent, id: string) => {
    if (!editing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Enter") {
      own(e);
      dispatch({ type: "tapNode", id });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      own(e);
      removeAndKeepFocus({ kind: "node", id });
    } else if (ARROWS[e.key] && e.shiftKey) {
      // přesun = Shift+šipky o krok mřížky; samotné šipky přesouvají fokus (useRovingFocus)
      own(e);
      const [dx, dy] = ARROWS[e.key];
      dispatch({ type: "nudge", id, dx, dy });
    }
  };
  const onWireKey = (e: KeyboardEvent, to: string, port: number) => {
    if (!editing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Enter") {
      own(e);
      dispatch({ type: "select", target: { kind: "wire", to, port } });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      own(e);
      removeAndKeepFocus({ kind: "wire", to, port });
    }
  };
  /** pravé tlačítko myši = smazat; na dotyku místo kontextové nabídky dlouhý stisk */
  const onContextMenu = (e: MouseEvent, t: CircuitTarget) => {
    if (!editing || (t.kind !== "node" && t.kind !== "wire")) return;
    e.preventDefault();
    const pt = (e.nativeEvent as { pointerType?: string }).pointerType;
    if (pt === "touch" || pt === "pen") return;
    removeAndKeepFocus(t.kind === "node" ? { kind: "node", id: t.id } : t);
  };

  const onWrapperKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!editing || isTyping(e.target)) return;
    if ((e.key === "Delete" || e.key === "Backspace") && st.selected) {
      e.preventDefault();
      removeAndKeepFocus();
    }
  };

  /* ---- paleta: klik = nástroj, tah do plátna = položit, klávesnice = přidat na volné místo ---- */
  const palettePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    paletteDrag.current = {
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const palettePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = paletteDrag.current;
    if (!d || d.pointer !== e.pointerId) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= TAP_SLOP)
      d.moved = true;
  };
  const palettePointerUp = (e: PointerEvent<HTMLButtonElement>, t: Tool) => {
    const d = paletteDrag.current;
    paletteDrag.current = null;
    if (!d || d.pointer !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP)
      return;
    suppressClick.current = true;
    const p = local(e.clientX, e.clientY);
    if (p && insideBounds(viewBox, p))
      dispatch({
        type: "add",
        kind: t.kind,
        fn: t.fn,
        x: p.x,
        y: p.y,
        within: viewBox,
      });
  };
  const paletteClick = (e: MouseEvent<HTMLButtonElement>, t: Tool) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (e.detail === 0) {
      // klávesnice: hned na volné místo (vybraný vrchol pak posunou Shift+šipky)
      dispatch({ type: "addFree", kind: t.kind, fn: t.fn });
      return;
    }
    setTool((cur) => (sameTool(cur, t) ? null : t));
  };

  const applyText = () => {
    const r = importCircuitText(circuit, shown);
    setErrors(r.errors);
    if (r.errors.length) return;
    dispatch({ type: "load", circuit: r.circuit });
    setDraft(null);
  };

  const message =
    st.message ??
    (st.source !== null
      ? `Spojit výstup ${st.source} s… (Enter nebo ťuknutí na cílové hradlo, Esc = zrušit)`
      : tool
        ? `Nástroj ${tool.label}: klikněte do plátna (Esc = zrušit).`
        : "");
  // bez jiné hlášky ukáže, proč síť ještě nejde spočítat (nezapojený port…)
  const shownMessage = message || (issue ?? "");

  return (
    <div
      ref={wrapRef}
      className={"circuit-editor" + (editing ? " is-editing" : "")}
      onKeyDown={onWrapperKey}
      tabIndex={-1}
    >
      <div className="ce-bar">
        <div
          className="ge-toolbar ce-toolbar"
          role="toolbar"
          aria-label="Hradlová síť"
        >
          <button
            ref={modeRef}
            type="button"
            className="ge-mode"
            aria-pressed={editing}
            onClick={() => {
              setTool(null);
              onModeChange(editing ? "run" : "edit");
            }}
            title={
              editing
                ? "Zpět do režimu výpočtu bez spuštění"
                : "Kreslit a upravovat síť přímo na plátně"
            }
          >
            Upravit síť
          </button>
          {editing && (
            <>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setTool(null);
                  onModeChange("run");
                  onRun();
                  modeRef.current?.focus();
                }}
              >
                ▶ Spočítat
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "undo" })}
                disabled={st.undo.length === 0}
                title="Vrátí poslední úpravu sítě (Ctrl+Z)"
              >
                ↶ Zpět
              </button>
              <button
                type="button"
                onClick={() => removeAndKeepFocus()}
                disabled={!st.selected}
                title={
                  st.selected
                    ? "Smaže vybraný vrchol či vodič (Delete)"
                    : "Nejdřív vyberte vrchol nebo vodič"
                }
              >
                Smazat
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "arrange" })}
                disabled={!circuit.nodes.length}
                title="Rozmístí síť po vrstvách (sloupec = takt)"
              >
                Uspořádat
              </button>
              {selectedGate && (
                <label className="ge-toggle ce-fn">
                  funkce
                  <select
                    value={selectedGate.fn}
                    onChange={(e) =>
                      dispatch({
                        type: "setFn",
                        id: selectedGate.id,
                        fn: e.target.value as GateFn,
                      })
                    }
                  >
                    {GATE_FNS.map((fn) => (
                      <option key={fn} value={fn}>
                        {GATE_INFO[fn].name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </div>
        {editing && (
          <div className="ce-palette" role="toolbar" aria-label="Paleta hradel">
            {TOOLS.map((t) => (
              <button
                key={t.kind + (t.fn ?? "")}
                type="button"
                className={"ce-tool ce-tool-" + (t.fn ?? t.kind)}
                aria-label={t.label}
                aria-pressed={sameTool(tool, t)}
                title={`${t.title} – klik = nástroj, tah do plátna = položit, Enter = přidat`}
                onPointerDown={palettePointerDown}
                onPointerMove={palettePointerMove}
                onPointerUp={(e) => palettePointerUp(e, t)}
                onPointerCancel={() => (paletteDrag.current = null)}
                onClick={(e) => paletteClick(e, t)}
              >
                {t.text}
              </button>
            ))}
          </div>
        )}
        <span className="ce-summary">{summaryText(circuit)}</span>
      </div>
      {editing && (
        <p className="ge-hint ce-hint">
          Nástroj z palety a klik (nebo tah) do plátna · vodič = tah z portu ●
          na vstup · klik = výběr · Delete = smazat · tah nebo Shift+šipky =
          přesun
        </p>
      )}
      <div className="ce-canvas">
        {editing && (
          <p
            className={"ge-message ce-message" + (shownMessage ? " shown" : "")}
            role="status"
          >
            {shownMessage}
          </p>
        )}
        {editing && circuit.nodes.length === 0 && (
          <p className="hint ce-empty-hint">
            Síť je prázdná – vyberte v paletě vstup, hradlo a výstup, klikněte
            do plátna a spojte je vodiči.
          </p>
        )}
        <CircuitView
          circuit={circuit}
          values={editing ? undefined : values}
          active={editing ? undefined : active}
          done={!editing && done}
          bits={bits}
          showLayers={showLayers}
          onToggleInput={editing ? undefined : onToggleInput}
          interaction={
            editing
              ? {
                  selected: st.selected,
                  source: st.source,
                  wirePreview,
                  onPointerDown,
                  onPointerMove,
                  onPointerUp,
                  onPointerCancel: (e) => {
                    if (press.current?.pointer === e.pointerId) end();
                  },
                  onNodeKey,
                  onWireKey,
                  onContextMenu,
                }
              : undefined
          }
          viewBox={viewBox}
          width={width}
          ariaLabel={ariaLabel}
          svgRef={svgRef}
        />
      </div>
      <details className="ge-text ce-text">
        <summary>Import / export textem</summary>
        <label className="ge-text-label">
          <span>
            Jeden příkaz na řádek: <code>in x, y</code> ·{" "}
            <code>G = and(x, y)</code> (and, or, not, nand, nor, xor;{" "}
            <code>_</code> = nezapojený) · <code>out q = G</code>
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
                setErrors([]);
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
        {errors.length > 0 && (
          <div role="alert" className="hint input-error">
            {errors.map((i) => (
              <div key={(i.line ?? 0) + i.message}>{i.message}</div>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
