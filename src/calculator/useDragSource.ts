import type { DragEvent } from "react";
import { usePlanner } from "./plannerContext";

/**
 * Obsluha přetahování předmětu (řádek v levém sloupci i zařazený předmět). Třída
 * `dragging` se přidává přímo na prvek jako ve staré stránce – bez překreslení.
 */
export function useDragSource(
  subjectId: string,
  draggingClass: string | undefined,
) {
  const { actions } = usePlanner();
  return {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      actions.dragStart(subjectId);
      if (draggingClass) event.currentTarget.classList.add(draggingClass);
      event.dataTransfer.setData("text/plain", subjectId);
      event.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: (event: DragEvent<HTMLElement>) => {
      if (draggingClass) event.currentTarget.classList.remove(draggingClass);
      actions.dragEnd();
    },
  };
}
