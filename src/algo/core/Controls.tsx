import { useEffect, useRef, type ReactNode } from "react";
import { SPEEDS, speedIndex, stepDelay } from "./player";
import { decideShortcut, type FocusKind } from "./shortcuts";
import type { Player } from "./usePlayer";

/* ---------- ikony (inline SVG, bez závislostí; barvu berou z textu tlačítka) ---------- */

const ICONS = {
  first: <path d="M3.5 4h2v12h-2zM11 10l6-6v12zM5.5 10l6-6v12z" />,
  prev: <path d="M5 4h2v12H5zM15.5 4v12L7.5 10z" />,
  play: <path d="M6 3.5l10.5 6.5L6 16.5z" />,
  pause: <path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" />,
  next: <path d="M13 4h2v12h-2zM4.5 4l8 6-8 6z" />,
  last: <path d="M14.5 4h2v12h-2zM9 10L3 4v12zM14.5 10l-6-6v12z" />,
  replay: (
    <>
      <path
        d="M10 4.5a6 6 0 1 1-5.2 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M10.5 1L6 4.5 10.5 8z" />
    </>
  ),
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      className="ctl-icon"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

/* ---------- klávesové zkratky ---------- */

function focusKind(node: EventTarget | null): FocusKind {
  const target = node as Element | null;
  if (!target || typeof target.closest !== "function") return "none"; // window, document
  const input = target.closest("input");
  if (input) {
    const type = input.type;
    if (type === "range") return "range";
    if (type === "checkbox" || type === "radio") return "choice";
    if (type === "button" || type === "submit" || type === "reset")
      return "button";
    return "text";
  }
  if (
    target.closest(
      'textarea, select, [contenteditable]:not([contenteditable="false"])',
    )
  )
    return "text";
  if (target.closest("[data-am-ran]")) return "action-ran";
  // prvek kresby (roving tabindex – useRovingFocus, pickProps) nebo jiný fokusovatelný prvek v SVG:
  // šipky patří kresbě, mezerník přehrávači (D3)
  if (target.closest("[data-canvas-item], svg")) return "canvas";
  if (
    target.closest(
      'button, a[href], summary, [role="button"], [role="radio"], [role="tab"]',
    )
  )
    return "button";
  return "none";
}

export function Controls<S>({ player }: { player: Player<S> }) {
  const n = player.steps.length;
  const canPlay = n > 1;
  const done = canPlay && player.atEnd && !player.playing;

  // posluchač se registruje jednou; aktuální přehrávač čte z refu
  const latest = useRef(player);
  const playRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    latest.current = player;
  });

  useEffect(() => {
    // Dokud uživatel nepoužil myš ani dotyk, bereme fokus jako klávesnicový (mezerník pak tlačítko stiskne).
    const nav = { keyboard: true };
    const onPointer = () => {
      nav.keyboard = false;
    };
    let pendingFocus: ((e: KeyboardEvent) => void) | null = null;
    const focusPlayAfterKeyUp = () => {
      if (pendingFocus) window.removeEventListener("keyup", pendingFocus);
      nav.keyboard = true; // Enter a mezerník = uživatel jede klávesnicí – mezerník na ▶ ho pak stiskne
      pendingFocus = (e: KeyboardEvent) => {
        if (e.key !== " ") return;
        window.removeEventListener("keyup", pendingFocus!);
        pendingFocus = null;
        setTimeout(() => {
          const play = playRef.current;
          if (
            play &&
            play.isConnected &&
            !play.disabled &&
            !document.activeElement?.closest(
              "input, textarea, select, button, a[href]",
            )
          )
            play.focus();
        }, 0);
      };
      window.addEventListener("keyup", pendingFocus);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        nav.keyboard = true;
        return;
      }
      if (e.defaultPrevented) return;
      const kind = focusKind(e.target);
      const { action, prevent } = decideShortcut(e, kind, nav.keyboard);
      if (prevent) {
        e.preventDefault();
        // fokus, který na tlačítku jen zůstal po kliknutí, pustíme – jinak by ho uvolnění mezerníku stisklo
        if (e.key === " " && (kind === "button" || kind === "action-ran"))
          (e.target as HTMLElement).blur?.();
        // Po operaci Enterem (action-ran) jde fokus klávesnice na ▶/⏸, ať se neztratí na <body> (další
        // Tab by skočil před akce). Až po uvolnění mezerníku – jinak by keyup ▶ hned stiskl (Firefox).
        if (e.key === " " && kind === "action-ran") focusPlayAfterKeyUp();
      }
      const p = latest.current;
      if (action === "slower" || action === "faster")
        p.setDelay(stepDelay(p.delay, action === "faster" ? 1 : -1));
      // Esc patří otevřeným nabídkám (ActionMenu, GraphEditor) – přehrávač ho nechá být
      else if (action && action !== "escape") p[action]();
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      if (pendingFocus) window.removeEventListener("keyup", pendingFocus);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const speedIdx = speedIndex(player.delay);
  /**
   * Krokovací tlačítka na kraji (začátek / konec) nejsou `disabled`, jen `aria-disabled`: tlačítko
   * s fokusem by jinak po stisku Enterem fokus ztratilo na <body> (SORTDS-01). Klik na kraji nic nedělá.
   */
  const edge = (atEdge: boolean, action: () => void) => ({
    "aria-disabled": atEdge || undefined,
    className: atEdge ? "is-disabled" : undefined,
    onClick: () => {
      if (!atEdge) action();
    },
  });
  const playLabel = player.playing
    ? "Pozastavit"
    : done
      ? "Přehrát znovu"
      : "Přehrát";

  return (
    <div className="controls" role="group" aria-label="Ovládání přehrávání">
      <div className="controls-row">
        <div className="controls-buttons">
          <button
            {...edge(player.atStart, player.first)}
            title="Na začátek (Home)"
            aria-label="Na začátek"
          >
            <Icon name="first" />
          </button>
          <button
            {...edge(player.atStart, player.prev)}
            title="Krok zpět (←)"
            aria-label="Krok zpět"
          >
            <Icon name="prev" />
            <span className="ctl-text">Zpět</span>
          </button>
          <button
            ref={playRef}
            className="primary ctl-play"
            onClick={player.toggle}
            disabled={!canPlay}
            title={
              canPlay
                ? `${playLabel} (mezerník)`
                : "Není co přehrávat – nejdřív spusťte operaci nebo zadejte vstup"
            }
            aria-label={playLabel}
          >
            <Icon name={player.playing ? "pause" : done ? "replay" : "play"} />
          </button>
          <button
            {...edge(player.atEnd, player.next)}
            title="Krok vpřed (→)"
            aria-label="Krok vpřed"
          >
            <span className="ctl-text">Další</span>
            <Icon name="next" />
          </button>
          <button
            {...edge(player.atEnd, player.last)}
            title="Na konec (End)"
            aria-label="Na konec"
          >
            <Icon name="last" />
          </button>
        </div>
        <span className="step-counter">
          {canPlay ? `krok ${player.index + 1} / ${n}` : "připraveno"}
        </span>
        <input
          className="seek"
          type="range"
          min={0}
          max={Math.max(0, n - 1)}
          step={1}
          value={Math.min(player.index, Math.max(0, n - 1))}
          disabled={!canPlay}
          onChange={(e) => player.seek(Number(e.target.value))}
          onPointerUp={(e) => e.currentTarget.blur()}
          aria-label="Krok"
          aria-valuetext={
            canPlay ? `krok ${player.index + 1} z ${n}` : "žádné kroky"
          }
        />
        <label className="speed" title="Rychlost přehrávání (− / +)">
          <span className="speed-label">rychlost</span>
          <input
            type="range"
            min={0}
            max={SPEEDS.length - 1}
            step={1}
            value={speedIdx}
            onChange={(e) => player.setDelay(SPEEDS[Number(e.target.value)].ms)}
            onPointerUp={(e) => e.currentTarget.blur()}
            aria-label="Rychlost přehrávání"
            aria-valuetext={SPEEDS[speedIdx].label}
          />
          <span className="speed-value">{SPEEDS[speedIdx].label}</span>
        </label>
      </div>
    </div>
  );
}

/**
 * Nápověda ke klávesám (Visualizer ji dává do sbalené nápovědy vpravo, ne pod lištu přehrávání).
 * Kresba je jedna zastávka Tabu s roving tabindexem (D3, core/useRovingFocus.ts).
 */
export function KeyHint({ drawing }: { drawing?: ReactNode } = {}) {
  return (
    <p className="kbd-hint">
      <kbd>mezerník</kbd> přehrát / pozastavit (i na kresbě) · <kbd>←</kbd>{" "}
      <kbd>→</kbd> krok · <kbd>Home</kbd> <kbd>End</kbd> začátek / konec ·{" "}
      <kbd>−</kbd> <kbd>+</kbd> rychlost
      <br />
      {drawing ?? (
        <>
          Kresba: <kbd>Tab</kbd> na ni, šipky pohyb po prvcích, <kbd>Enter</kbd>{" "}
          vybrat, <kbd>Shift</kbd>+šipky posun vrcholu, <kbd>Esc</kbd> ven
        </>
      )}
    </p>
  );
}
