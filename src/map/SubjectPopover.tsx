import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { placePopover, sisUrl, wikiUrl } from "../lib/map";
import styles from "./SubjectPopover.module.css";

export interface SubjectPopoverProps {
  /** Kód předmětu – titulek popoveru a cíl odkazů. */
  subjectId: string;
  /** Kruh uzlu předmětu, vedle kterého se popover drží. */
  anchor: Element;
  /** Je předmět právě ve výběru „Zobrazit specializace"? */
  highlighted: boolean;
  onClose: () => void;
  /** Klik na „Zobrazit specializace" / „Odebrat z výběru specializací". */
  onToggleHighlight: () => void;
  /**
   * Přihlášení k odběru pohybu grafu (krok simulace, zoom, posun) – popover se při
   * něm přepočítá, aby zůstal u svého uzlu. Vrací funkci pro odhlášení.
   */
  subscribeLayout: (listener: () => void) => () => void;
}

/**
 * Popover s odkazy na předmět (náhrada za bootstrap.Popover ze staré stránky). Je
 * umístěný absolutně ve svém rodiči (stránka, ve fullscreenu kontejner grafu) a drží
 * se uzlu `anchor`: nahoře, při nedostatku místa vpravo, dole nebo vlevo.
 *
 * Zavírá se stejně jako dřív: křížkem, tlačítkem výběru specializací a klikem kamkoli
 * mimo popover a mimo jeho uzel. Klávesa Escape ho nezavírá (jako dřív).
 */
export function SubjectPopover({
  subjectId,
  anchor,
  highlighted,
  onClose,
  onToggleHighlight,
  subscribeLayout,
}: SubjectPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  /** Posun, který je právě na popoveru nastavený (kvůli zjištění počátku rodiče). */
  const translation = useRef({ x: 0, y: 0 });

  const updatePosition = useCallback(() => {
    const popover = popoverRef.current;
    const arrow = arrowRef.current;
    if (!popover || !arrow) return;

    // Popover leží v levém horním rohu svého rodiče a posouvá se transformací, takže
    // jeho šířka nezávisí na poloze. Počátek rodiče v souřadnicích okna = aktuální
    // poloha bez právě nastaveného posunu.
    const current = popover.getBoundingClientRect();
    const originX = current.left - translation.current.x;
    const originY = current.top - translation.current.y;

    const reference = anchor.getBoundingClientRect();
    const position = placePopover(
      {
        left: reference.left,
        top: reference.top,
        width: reference.width,
        height: reference.height,
      },
      { width: popover.offsetWidth, height: popover.offsetHeight },
      {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
    );

    const x = Math.round(position.x - originX);
    const y = Math.round(position.y - originY);
    translation.current = { x, y };
    popover.style.transform = `translate(${x}px, ${y}px)`;
    popover.dataset.placement = position.placement;
    const vertical =
      position.placement === "top" || position.placement === "bottom";
    arrow.style.transform = vertical
      ? `translate(${position.arrowOffset}px, 0)`
      : `translate(0, ${position.arrowOffset}px)`;
  }, [anchor]);

  // První umístění ještě před vykreslením, aby popover neproblikl v rohu stránky.
  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(
    () => subscribeLayout(updatePosition),
    [subscribeLayout, updatePosition],
  );

  useEffect(() => {
    const scrollOptions = { capture: true, passive: true };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, scrollOptions);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, scrollOptions);
    };
  }, [updatePosition]);

  // Zavření klikem mimo popover a mimo uzel předmětu. Kliky na uzly předmětů sem
  // nedojdou (graf u nich zastavuje probublávání) – ty popover přepínají samy.
  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (popoverRef.current?.contains(target) || anchor.contains(target))
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [anchor, onClose]);

  return (
    <div
      ref={popoverRef}
      className={styles.popover}
      role="tooltip"
      data-placement="top"
    >
      <div ref={arrowRef} className={styles.arrow}></div>
      <h3 className={styles.header}>
        {subjectId}{" "}
        <button
          type="button"
          className={styles.close}
          aria-label="Zavřít"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        ></button>
      </h3>
      <div className={styles.body}>
        <div className={styles.links}>
          <a
            href={sisUrl(subjectId)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.link} ${styles.sis}`}
          >
            SIS
          </a>
          <a
            href={wikiUrl(subjectId)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.link} ${styles.wiki}`}
          >
            WIKI
          </a>
          <button
            type="button"
            className={
              highlighted
                ? `${styles.link} ${styles.specs} ${styles.active}`
                : `${styles.link} ${styles.specs}`
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggleHighlight();
            }}
          >
            {highlighted
              ? "Odebrat z výběru specializací"
              : "Zobrazit specializace"}
          </button>
        </div>
      </div>
    </div>
  );
}
