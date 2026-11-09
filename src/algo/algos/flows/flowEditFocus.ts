/**
 * Fokus při vstupu do editoru sítě a po Hotovo (toky, X-06): s Kresbou „jen rezervy / výšky“ tlačítko
 * „Upravit síť“ po kliknutí zmizí a po Hotovo se zase skryje síť i s tlačítkem Hotovo – fokus by spadl na
 * <body>. Když po změně režimu fokus není na viditelném prvku, přejde v editoru na „Upravit graf“ v síti,
 * po Hotovo na „Upravit síť“ (nebo „Upravit graf“, když je síť vidět). Fokus jinde (nabídka akcí) zůstane.
 */
import { useEffect, useRef, type RefObject } from "react";

const lost = (a: Element | null) =>
  !a || a === document.body || !a.isConnected || !!a.closest("[hidden]");

export function useEditFocus(
  layoutRef: RefObject<HTMLElement | null>,
  editing: boolean,
): void {
  const prev = useRef(editing);
  useEffect(() => {
    if (prev.current === editing) return;
    prev.current = editing;
    const root = layoutRef.current;
    if (!root || !lost(document.activeElement)) return;
    const target = editing
      ? root.querySelector<HTMLElement>(".flow-panel-net .ge-mode")
      : (root.querySelector<HTMLElement>(".flow-edit-net") ??
        root.querySelector<HTMLElement>(
          ".flow-panel-net:not([hidden]) .ge-mode",
        ));
    target?.focus({ preventScroll: true });
  }, [editing, layoutRef]);
}
