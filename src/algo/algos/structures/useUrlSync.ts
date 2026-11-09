import { useEffect, useMemo, useRef } from "react";
import type { Structure } from "../../core/useStructure";

/**
 * „Kopírovat odkaz“ = aktuální stav: po každé dokončené operaci (opId) a po ↶ Vrátit operaci zavolá
 * `write(s.last)`, které stav zapíše do adresy (useUrlParam / setParams s replace – Zpět se nezahltí).
 * Otevření stránky (ani dvojí efekt ve StrictMode) ani reset nic nepřepíší – Vytvořit, příklady
 * a Výchozí příklad si adresu zapisují samy. Vrací strukturu s obaleným undo – tu předat Visualizeru.
 */
export function useUrlSync<S>(
  s: Structure<S>,
  write: (last: S) => void,
): Structure<S> {
  const writeRef = useRef(write);
  const seen = useRef({ opId: s.opId, version: s.version });
  const undone = useRef(false);
  useEffect(() => {
    writeRef.current = write;
  });
  useEffect(() => {
    const prev = seen.current;
    if (prev.opId === s.opId && prev.version === s.version) return;
    seen.current = { opId: s.opId, version: s.version };
    const sync = s.opId !== prev.opId || undone.current;
    undone.current = false;
    if (sync) writeRef.current(s.last);
  }, [s.opId, s.version, s.last]);
  const { undo, canUndo } = s;
  return useMemo(
    () => ({
      ...s,
      undo: () => {
        if (!canUndo) return;
        undone.current = true;
        undo();
      },
    }),
    [s, undo, canUndo],
  );
}

/** Stejná čísla ve stejném pořadí? */
export const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
