import type { KeyboardEvent } from "react";

/**
 * Atributy prvku plátna, na který jde kliknout (výběr argumentu akce – ActionMenu.pick): klik a Enter
 * ho vyberou (Enter se stránce nebere dál). Mezerník je vždy přehrávač (rozhodnutí D3) – prvek ho
 * nechá projít. Prvek je označený jako prvek kresby (`data-canvas-item`): šipky na něm nekrokují.
 * Fokus: bez dalšího je každý prvek zastávkou Tabu; kresba s roving tabindexem (useRovingFocus) přidá
 * `rove.item(key)` ZA tyto atributy (přepíše tabIndex). Bez `onActivate` nic.
 */
export function pickProps(onActivate: (() => void) | undefined, label: string) {
  if (!onActivate) return {};
  return {
    tabIndex: 0,
    role: "button",
    "data-canvas-item": "",
    "aria-label": `${label} – vybrat`,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      onActivate();
    },
  };
}
