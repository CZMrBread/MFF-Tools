import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CanvasFitContext } from "./canvasFit";
import { Controls, KeyHint } from "./Controls";
import { readableHref } from "./linkParams";
import { FIT_MEDIA, mediaMatches } from "./layoutMedia";
import { fmtMath, splitComment } from "./format";
import { ModuleSourceContext } from "./moduleSource";
import { colorTransitionMs, stepTransitionMs } from "./motion";
import { Pseudocode } from "./Pseudocode";
import {
  prefersReducedMotion,
  StepTransitionContext,
  useReducedMotion,
} from "./stepTransition";
import type { Player } from "./usePlayer";

/** tvar vzorku v legendě: výplň (výchozí), obrys, čárkovaný obrys, čára, čárkovaná čára */
export type LegendShape = "fill" | "ring" | "dashed" | "line" | "line-dashed";

export interface LegendItem {
  /** třída vzorku – určuje barvu (viz „legenda“ v index.css) */
  cls: string;
  label: string;
  /** tvar vzorku, aby význam nenesla jen barva (hrany = 'line', čárkovaný obrys = 'dashed'…) */
  shape?: LegendShape;
  /** znak, kterým je stejná věc označená na plátně (např. „?“ u porovnávaných prvků) */
  glyph?: string;
}

/** Část Structure<S> z useStructure, kterou Visualizer potřebuje (historie, krok zpět, výchozí příklad). */
export interface StructureControls {
  opTitle: string;
  opId: number;
  /** roste i s přestavbou a vrácením (useStructure) – pro posun plátna do záběru */
  version?: number;
  history: string[];
  canUndo: boolean;
  undo: () => void;
  restoreInitial: () => void;
}

/**
 * Historie vstupu pro stránky bez useStructure (třídění, grafy, řetězce…): stejný řádek
 * „Historie … ↶ Vrátit operaci · Výchozí příklad“ pod akcemi jako u struktur.
 */
export interface InputHistory {
  history: string[];
  canUndo: boolean;
  undo: () => void;
}

interface Props<S> {
  title: string;
  /** krátký výklad + složitost */
  description: ReactNode;
  /** panel se vstupem (textové pole, tlačítka…) nad plátnem – starší rozvržení; s `actions` volitelný */
  input?: ReactNode;
  /**
   * Nabídka operací (ActionMenu) – po vzoru VisuAlgo leží hned pod plátnem vlevo, stav operace vpravo.
   * S ní odpadá panel vstupu nad plátnem (pokud stránka nepředá i `input`), historie operací je pod
   * akcemi a tip pod přehráváním.
   */
  actions?: ReactNode;
  player: Player<S>;
  pseudocode: string[];
  legend?: LegendItem[];
  /** vykreslení aktuálního stavu */
  children: ReactNode;
  /**
   * Stránky se strukturou předají výsledek useStructure: Visualizer pak ukáže název operace nad zprávou,
   * historii operací, tlačítka „Vrátit operaci“ a „Výchozí příklad“ a po nové operaci posune plátno do záběru.
   */
  structure?: StructureControls;
  /**
   * Obsluha tlačítka „Výchozí příklad“ (když stránka musí vrátit i své parametry); jinak structure.restoreInitial.
   * Bez `structure` a `inputHistory` se v řádku pod akcemi ukáže jen toto tlačítko.
   */
  onRestoreInitial?: () => void;
  /** historie a „↶ Vrátit operaci“ pro stránky bez `structure` (viz InputHistory) */
  inputHistory?: InputHistory;
  /** název operace nad zprávou pro stránky bez `structure` */
  opTitle?: string;
  /** krátký námět, co si vyzkoušet – „💡 Zkuste: …“ ve sbalené nápovědě vpravo (pod legendou) */
  tip?: ReactNode;
  /**
   * Doplňující text ke vstupu (zdroj obrázku, popis grafu, poznámka ke sdílenému vstupu…) – patří do
   * sbalené nápovědy vpravo, aby neodsouval plátno ani akce.
   */
  notes?: ReactNode;
  /**
   * řádek nápovědy ke klávesám na kresbě, když se obecný („Enter vybrat, Shift+šipky posun vrcholu“) k modulu
   * nehodí – tabulka DP, rovina obalu, strom (UX-13)
   */
  drawingKeys?: ReactNode;
  /** malé přepínače zobrazení (např. „styl knihy“) – stále vidět vpravo pod pseudokódem */
  options?: ReactNode;
  /** ukázat tlačítko „Kopírovat odkaz“ (stránka drží svůj vstup v adrese přes useUrlParam) */
  share?: boolean;
  /** text v panelu pseudokódu, dokud není co ukázat */
  codePlaceholder?: string;
  /**
   * Počítadlo spuštění pro stránky bez `structure` (nebo s přestavbou, která nemění opId): při každé
   * změně se plátno posune do záběru – na telefonu leží akce pod plátnem.
   */
  runKey?: number | string;
}

const APP_TITLE = "Algoritmy a datové struktury";
/** kolik posledních operací se vypisuje v řádku historie */
const HISTORY_SHOWN = 6;
/** značka před zprávou na konci běhu podle Step.outcome */
const OUTCOME_MARK = { success: "✓", neutral: "ⓘ", warn: "⚠" } as const;

export function Visualizer<S>({
  drawingKeys,
  title,
  description,
  input,
  actions,
  player,
  pseudocode,
  legend,
  children,
  structure,
  onRestoreInitial,
  inputHistory,
  opTitle,
  tip,
  notes,
  options,
  share,
  codePlaceholder,
  runKey,
}: Props<S>) {
  const [descOpen, setDescOpen] = useState(false);
  const source = useContext(ModuleSourceContext);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const descId = useId();
  const canvas = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  // plátno pro přizpůsobení kresby (canvasFit.ts) – jen v režimu jedné obrazovky
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const fitMode = useFitMode();
  // plynulý přechod mezi kroky: délka podle druhu posunu a rychlosti (core/motion.ts, stepTransition.ts)
  const reducedMotion = useReducedMotion();
  const stepMs = stepTransitionMs(player.motion, player.delay, reducedMotion);
  const canvasStyle = {
    "--algo-step-ms": `${stepMs}ms`,
    "--algo-step-color-ms": `${colorTransitionMs(stepMs)}ms`,
  } as CSSProperties;
  const canvasRef = useCallback((el: HTMLDivElement | null) => {
    canvas.current = el;
    setCanvasEl(el);
  }, []);

  // titulek záložky podle stránky (historie a záložky prohlížeče pak jdou rozlišit)
  useEffect(() => {
    document.title = `${title} – ${APP_TITLE}`;
    return () => {
      document.title = APP_TITLE;
    };
  }, [title]);

  // po nové operaci nebo spuštění dostat plátno do záběru (na telefonu jsou akce pod ním)
  const scrollKey = `${structure?.version ?? structure?.opId ?? ""}|${runKey ?? ""}`;
  const seenKey = useRef(scrollKey);
  useEffect(() => {
    if (scrollKey === seenKey.current) return;
    seenKey.current = scrollKey;
    const calm = prefersReducedMotion();
    const el = canvas.current;
    if (!el) return;
    // „nearest“ u plátna vyššího než okno (Kruskal s tabulkou na telefonu) nic neudělá, když horní
    // okraj zajel pod hlavičku a spodek je pod oknem – pak zarovnat začátek (scroll-margin-top počítá
    // s hlavičkou webu i horní lištou), jinak by hlavička kryla horní kus kresby (VAL-06)
    const r = el.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    // (na jednu obrazovku se stránka neposouvá – tam zůstává „nearest“)
    const block: ScrollLogicalPosition =
      !mediaMatches(FIT_MEDIA) &&
      (r.top < margin || r.height + margin > window.innerHeight)
        ? "start"
        : "nearest";
    el.scrollIntoView?.({ block, behavior: calm ? "auto" : "smooth" });
  }, [scrollKey]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  // Telefon: lišta přehrávání je přilepená dole (sticky) a může zakrýt prvek, na který přešel fokus
  // (Tab na Insert(x) pod plátnem). Výška lišty → --algo-controls-h (scroll-margin-bottom v index.css);
  // když prohlížeč přesto neposune (prvek je formálně v okně), posuneme okno o překryv sami.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    const controls = root?.querySelector<HTMLElement>(".controls");
    if (!root || !controls) return;
    const measure = () =>
      root.style.setProperty(
        "--algo-controls-h",
        `${Math.round(controls.getBoundingClientRect().height)}px`,
      );
    const ro =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(controls);
    if (!ro) measure();
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || typeof el.closest !== "function" || el.closest(".controls"))
        return;
      requestAnimationFrame(() => {
        if (document.activeElement !== el) return;
        const c = controls.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const overlap = r.bottom - c.top;
        if (
          c.height > 0 &&
          overlap > 0 &&
          r.top < c.bottom &&
          r.right > c.left &&
          r.left < c.right
        )
          window.scrollBy({ top: overlap + 16, behavior: "auto" });
      });
    };
    root.addEventListener("focusin", onFocus);
    return () => {
      ro?.disconnect();
      root.removeEventListener("focusin", onFocus);
    };
  }, []);

  const copyLink = async () => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(readableHref(window.location.href));
    } catch {
      ok = false;
    }
    setCopied(ok ? "ok" : "fail");
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(null), 2500);
  };

  const step = player.current;
  const finished =
    player.steps.length > 1 && player.atEnd && !player.playing && !step?.error;
  // konec běhu, který není úspěch (Step.outcome): ⓘ / ⚠ místo zeleného ✓
  const outcome = finished ? step?.outcome : undefined;
  const done = finished && outcome !== "warn";
  const success = finished && !outcome;
  const op = opTitle ?? structure?.opTitle ?? "";
  const showOp = opTitle !== undefined || structure !== undefined;
  const activeLine =
    step && step.line !== null ? pseudocode[step.line] : undefined;
  // řádek „Historie … ↶ Vrátit operaci · Výchozí příklad“: struktury (structure), ostatní stránky (inputHistory),
  // nebo jen tlačítko Výchozí příklad (onRestoreInitial)
  const hist: InputHistory | undefined = inputHistory ?? structure;
  const restore = onRestoreInitial ?? structure?.restoreInitial;
  const history = hist?.history ?? [];
  const shown = history.slice(-HISTORY_SHOWN);
  // oříznutá historie (vlevo) dostane přechod do ztracena, ať je vidět, že pokračuje
  const trackRef = useRef<HTMLSpanElement>(null);
  const historyText = history.join(" › ");
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // (add/remove, ne přepínač třídy – noAutoplay.test hlídá volání přepínače mimo lištu přehrávání)
    const check = () => {
      if (el.scrollWidth > el.clientWidth + 1) el.classList.add("clipped");
      else el.classList.remove("clipped");
    };
    check();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [historyText]);

  const historyRow = (hist || restore) && (
    <div className="viz-history">
      {hist && (
        // jeden řádek: zobrazí se posledních HISTORY_SHOWN položek (přetečení se ořízne zleva), celá v title
        <span
          className="viz-history-list"
          title={history.length > 0 ? history.join(" › ") : undefined}
        >
          <span className="viz-history-label">Historie:</span>{" "}
          <span className="viz-history-track" ref={trackRef}>
            <span className="viz-history-items">
              {history.length === 0 ? (
                <span className="muted">zatím žádná operace</span>
              ) : (
                <>
                  {history.length > HISTORY_SHOWN && "… › "}
                  {shown.map((t, i) => (
                    <Fragment key={i}>
                      {i > 0 && " › "}
                      <span className="viz-history-item">{fmtMath(t)}</span>
                    </Fragment>
                  ))}
                </>
              )}
            </span>
          </span>
        </span>
      )}
      <span className="viz-history-buttons">
        {hist && (
          <button
            type="button"
            onClick={hist.undo}
            disabled={!hist.canUndo}
            title="Vrátí poslední operaci – stav bude jako před ní"
          >
            ↶ Vrátit operaci
          </button>
        )}
        {restore && (
          <button
            type="button"
            onClick={restore}
            title="Vrátí stav, ve kterém se stránka otevřela"
          >
            Výchozí příklad
          </button>
        )}
      </span>
    </div>
  );
  const tipBox = tip && (
    <p className="viz-tip">
      <span aria-hidden="true">💡 </span>
      <b>Zkuste:</b> {tip}
    </p>
  );
  /** nápověda vpravo: sbalená, aby se stránka vešla na obrazovku (nic se neztratí, jen se rozbalí) */
  const more = (
    <details className="viz-more">
      <summary>{tip ? "💡 Zkuste… a nápověda" : "Nápověda"}</summary>
      <div className="viz-more-body">
        {tipBox}
        {notes && <div className="viz-notes">{notes}</div>}
        <KeyHint drawing={drawingKeys} />
      </div>
    </details>
  );
  /** s ActionMenu: akce (a historie) vlevo pod plátnem, stav vpravo – jinak jen stav */
  const dock = (status: ReactNode) =>
    actions ? (
      <div className="viz-dock">
        <section className="viz-actions" aria-label="Operace">
          {actions}
          {historyRow}
        </section>
        {status}
      </div>
    ) : (
      status
    );

  return (
    <div className="viz" ref={rootRef}>
      <header className="viz-header">
        <div className="viz-title-row">
          <h1>{title}</h1>
          {source && (
            <span
              className="viz-source"
              title="Zdroj: Průvodce labyrintem algoritmů (oddíl, strana) / přednáška Datové struktury I"
            >
              {source}
            </span>
          )}
          {share && (
            <button
              type="button"
              className="viz-share"
              onClick={copyLink}
              title="Zkopíruje adresu této stránky i s aktuálním vstupem"
            >
              {copied === "ok"
                ? "Zkopírováno ✓"
                : copied === "fail"
                  ? "Nelze zkopírovat – použijte adresní řádek"
                  : "Kopírovat odkaz"}
            </button>
          )}
        </div>
        <div className={"viz-desc" + (descOpen ? " open" : "")}>
          <div className="viz-desc-body" id={descId}>
            {description}
          </div>
          <button
            type="button"
            className="viz-desc-toggle"
            aria-expanded={descOpen}
            aria-controls={descId}
            title={
              descOpen ? "Sbalit popis" : "Celý popis algoritmu a složitost"
            }
            onClick={() => setDescOpen((o) => !o)}
          >
            {descOpen ? "méně" : "více"}
          </button>
        </div>
      </header>

      {(input !== undefined || !actions) && (
        <section className="viz-input" aria-label="Vstup a operace">
          {input}
          {!actions && historyRow}
        </section>
      )}

      <div className="viz-main">
        <div className="viz-canvas-col">
          <div className="viz-canvas" ref={canvasRef} style={canvasStyle}>
            <CanvasFitContext.Provider value={fitMode ? canvasEl : null}>
              <StepTransitionContext.Provider value={stepMs}>
                {children}
              </StepTransitionContext.Provider>
            </CanvasFitContext.Provider>
          </div>
          {dock(
            <div className="viz-status">
              {showOp && (
                <div className={"viz-op" + (success && op ? " done" : "")}>
                  {op ? (
                    <>
                      <span className="viz-op-label">
                        {finished ? "Dokončeno:" : "Operace:"}
                      </span>{" "}
                      <b>{fmtMath(op)}</b>
                    </>
                  ) : (
                    <span className="viz-op-label">Zatím žádná operace</span>
                  )}
                </div>
              )}
              <div
                className={
                  "viz-message" +
                  (done ? " done" : "") +
                  (outcome ? " " + outcome : "") +
                  (step?.error ? " error" : "")
                }
                aria-live={player.playing ? "off" : "polite"}
              >
                {finished && (
                  <span className="viz-done-mark" aria-hidden="true">
                    {OUTCOME_MARK[outcome ?? "success"]}{" "}
                  </span>
                )}
                {step ? fmtMath(step.message) : "—"}
              </div>
              {pseudocode.length > 0 && (
                <div
                  className={
                    "viz-line" + (activeLine === undefined ? " empty" : "")
                  }
                  aria-hidden="true"
                >
                  {activeLine !== undefined && step && step.line !== null ? (
                    <>
                      <span className="viz-line-num">{step.line + 1}</span>
                      <code>
                        {fmtMath(
                          splitComment(activeLine.trimStart()).code.trimEnd() ||
                            activeLine.trim(),
                        )}
                      </code>
                    </>
                  ) : (
                    " "
                  )}
                </div>
              )}
            </div>,
          )}
          <Controls player={player} />
        </div>
        <aside className="viz-code" aria-label="Pseudokód">
          <Pseudocode
            lines={pseudocode}
            active={step?.line ?? null}
            placeholder={codePlaceholder}
          />
          {options && <div className="viz-options">{options}</div>}
          {legend && legend.length > 0 && (
            <ul className="legend" aria-label="Legenda">
              {legend.map((l) => (
                <li key={l.cls + "|" + l.label}>
                  <span
                    className={
                      "swatch " +
                      l.cls +
                      (l.shape && l.shape !== "fill"
                        ? " swatch-" + l.shape
                        : "")
                    }
                  />
                  {l.glyph && <span className="legend-glyph">{l.glyph}</span>}
                  {l.label}
                </li>
              ))}
            </ul>
          )}
          {more}
        </aside>
      </div>
    </div>
  );
}

/** Platí rozložení na jednu obrazovku (FIT_MEDIA)? Sleduje změnu velikosti okna. */
function useFitMode(): boolean {
  const [fit, setFit] = useState(() => mediaMatches(FIT_MEDIA));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(FIT_MEDIA);
    const update = () => setFit(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return fit;
}
