import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tooltipPosition } from "../lib/map";
import type { DegreeFilter, TooltipContent } from "../lib/map";
import { GRAPH_HEIGHT, GRAPH_WIDTH, createGraph } from "./graph";
import type { GraphController, GraphData } from "./graph";
import { SubjectPopover } from "./SubjectPopover";
import styles from "./MapGraph.module.css";

/**
 * Požadavek na použití filtru stupně. Je to objekt, ne jen hodnota, aby se filtr
 * použil i při kliku na už aktivní tlačítko (nový objekt = nový požadavek) – stará
 * stránka v tom případě také znovu rozhýbala simulaci.
 */
export interface FilterRequest {
  value: DegreeFilter;
}

export interface MapGraphProps {
  /**
   * Data vybraného roku a oboru; `null`, dokud se načítají (nebo při chybě). Pro
   * jiný rok či obor vykresli komponentu s jiným `key` – výběr, zvýraznění a pohled
   * patří k datům.
   */
  data: GraphData | null;
  filter: FilterRequest;
  /** Text chyby načtení dat, který se zobrazí místo grafu. */
  error?: string | null;
}

interface TooltipState {
  content: TooltipContent | null;
  visible: boolean;
}

interface PopoverState {
  subjectId: string;
  anchor: SVGCircleElement;
}

const NO_IDS: ReadonlySet<string> = new Set();

function toggled(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}

function TooltipBody({ content }: { content: TooltipContent }) {
  if (content.kind === "subject") {
    return (
      <>
        <div className={styles.tooltipTitle} style={{ color: content.color }}>
          {content.id}
        </div>
        <div className={styles.tooltipDesc}>{content.title}</div>
        <div className={styles.badge} style={{ background: content.color }}>
          {content.badgeLabel}
        </div>
        <div className={styles.tooltipMeta}>
          Vyskytuje se v {content.sharedCount} specializacích
        </div>
      </>
    );
  }
  return (
    <>
      <div className={styles.tooltipTitle} style={{ color: content.color }}>
        {content.label}
      </div>
      <div className={styles.tooltipDesc}>
        Kliknutím aktivujete / skryjete v průniku
      </div>
      <div className={styles.tooltipMeta}>
        Sdílených předmětů (ve filtru): {content.count}
      </div>
    </>
  );
}

/**
 * Kontejner s grafem (starý `#graph-container`): D3 graf, tlačítka celé obrazovky a
 * zoomu, tooltip, panel zvýraznění a popover předmětu.
 *
 * Graf kreslí D3 do `<svg>` (viz graph.ts); React drží stav – vybrané specializace,
 * předměty vybrané přes „Zobrazit specializace", celou obrazovku, tooltip a popover –
 * a do grafu ho posílá efekty, aniž by se simulace stavěla znovu.
 */
export function MapGraph({ data, filter, error }: MapGraphProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<GraphController | null>(null);
  const layoutListeners = useRef(new Set<() => void>());

  const [selectedSpecs, setSelectedSpecs] = useState(NO_IDS);
  const [highlightSources, setHighlightSources] = useState(NO_IDS);
  const [fullscreen, setFullscreen] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>({
    content: null,
    visible: false,
  });
  const [popover, setPopover] = useState<PopoverState | null>(null);

  // Graf se staví jen při změně dat (nebo kontejneru); úklid zastaví simulaci a
  // vyprázdní <svg>, takže ani dvojí spuštění efektu ve StrictMode nic nezdvojí.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !container || !data) return;
    const listeners = layoutListeners.current;
    const controller = createGraph(svg, data, {
      onSpecClick: (specId) =>
        setSelectedSpecs((current) => toggled(current, specId)),
      // Klik znovu na stejný uzel popover zavře (toggle).
      onSubjectClick: (subject, circle) =>
        setPopover((current) =>
          current?.anchor === circle
            ? null
            : { subjectId: subject.id, anchor: circle },
        ),
      onNodeEnter: (content) => setTooltip({ content, visible: true }),
      onNodeMove: (clientX, clientY) => {
        const element = tooltipRef.current;
        if (!element) return;
        const rect = container.getBoundingClientRect();
        const position = tooltipPosition(
          clientX - rect.left,
          clientY - rect.top,
        );
        element.style.left = position.left;
        element.style.top = position.top;
        element.style.transform = position.transform;
      },
      // Obsah zůstává, aby tooltip při mizení neproblikl prázdný.
      onNodeLeave: () =>
        setTooltip((current) => ({ ...current, visible: false })),
      onLayout: () => listeners.forEach((listener) => listener()),
    });
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.destroy();
    };
  }, [container, data]);

  // Stav → graf. Efekty závisí i na `container` a `data`, aby se po postavení nového
  // grafu spustily znovu a poslaly do něj aktuální stav.
  useEffect(() => {
    controllerRef.current?.applyFilter(filter.value);
  }, [container, data, filter]);

  useEffect(() => {
    controllerRef.current?.setSelectedSpecs(selectedSpecs);
  }, [container, data, selectedSpecs]);

  useEffect(() => {
    controllerRef.current?.setHighlightSources(highlightSources);
  }, [container, data, highlightSources]);

  const subscribeLayout = useCallback((listener: () => void) => {
    const listeners = layoutListeners.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const closePopover = useCallback(() => setPopover(null), []);

  const toggleFullscreen = (next: boolean) => {
    // Popover je vložený do stránky nebo do kontejneru podle režimu, při přepnutí
    // celé obrazovky se proto zavírá.
    setPopover(null);
    setFullscreen(next);
  };

  const popoverSubjectId = popover?.subjectId;
  const toggleHighlight = useCallback(() => {
    if (popoverSubjectId === undefined) return;
    setHighlightSources((current) => toggled(current, popoverSubjectId));
    setPopover(null);
  }, [popoverSubjectId]);

  return (
    <div
      ref={setContainer}
      className={
        fullscreen
          ? `${styles.container} ${styles.fullscreen}`
          : styles.container
      }
    >
      <button
        type="button"
        className={styles.fullscreenOpen}
        onClick={() => toggleFullscreen(true)}
      >
        Celá obrazovka
      </button>
      <button
        type="button"
        className={styles.fullscreenClose}
        onClick={() => toggleFullscreen(false)}
      >
        ✕
      </button>
      <div
        className={
          highlightSources.size > 0
            ? `${styles.highlightPanel} ${styles.visible}`
            : styles.highlightPanel
        }
      >
        <button
          type="button"
          className={styles.clearHighlight}
          onClick={() => setHighlightSources(NO_IDS)}
        >
          Zrušit zvýraznění
        </button>
        <div className={styles.highlightLegend}>
          <span className={`${styles.legendSwatch} ${styles.and}`}>
            <span className={styles.dot}></span>ve všech vybraných předmětech
            (AND)
          </span>
          <span className={`${styles.legendSwatch} ${styles.or}`}>
            <span className={styles.dot}></span>alespoň v jednom vybraném
            předmětu (OR)
          </span>
        </div>
      </div>
      <div className={styles.zoomControls}>
        <button
          type="button"
          title="Přiblížit"
          onClick={() => controllerRef.current?.zoomBy(1.4)}
        >
          +
        </button>
        <button
          type="button"
          title="Oddálit"
          onClick={() => controllerRef.current?.zoomBy(1 / 1.4)}
        >
          −
        </button>
        <button
          type="button"
          title="Výchozí zobrazení"
          onClick={() => controllerRef.current?.resetZoom()}
        >
          ⟲
        </button>
      </div>
      <div
        ref={tooltipRef}
        className={styles.tooltip}
        style={{ opacity: tooltip.visible ? 1 : 0 }}
      >
        {tooltip.content && <TooltipBody content={tooltip.content} />}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {data && (
        <svg
          ref={svgRef}
          className={styles.svg}
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        />
      )}
      {popover &&
        container &&
        createPortal(
          <SubjectPopover
            key={popover.subjectId}
            subjectId={popover.subjectId}
            anchor={popover.anchor}
            highlighted={highlightSources.has(popover.subjectId)}
            onClose={closePopover}
            onToggleHighlight={toggleHighlight}
            subscribeLayout={subscribeLayout}
          />,
          // Ve fullscreenu musí být popover uvnitř kontejneru (ten je position: fixed
          // s vysokým z-indexem), jinak na stránce.
          fullscreen ? container : document.body,
        )}
    </div>
  );
}
