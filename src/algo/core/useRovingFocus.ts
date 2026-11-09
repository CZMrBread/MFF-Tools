/**
 * Roving tabindex pro kresbu (rozhodnutí vlastníka D3, 7. 11. 2026): celá kresba je JEDNA zastávka
 * tabulátoru, šipky přesouvají fokus mezi jejími prvky (prostorově, rovingFocus.ts), Home / End na první
 * / poslední, Esc kresbu opustí (fokus na další ovládací prvek za ní), Tab také.
 *
 * Hook klávesy NEbere: Enter (výběr prvku obslouží prvek sám – pickProps, GraphView…), mezerník (vždy
 * přehrávač, viz shortcuts.ts „canvas“), Shift+šipky (přesun vrcholu / hradla v editoru) a kombinace
 * s Ctrl / Alt / Meta. Obsluha prvku (onKeyDown na prvku) běží dřív a může klávesu vzít sama
 * (preventDefault) – hook ji pak nechá být.
 *
 * Použití:
 *   const rove = useRovingFocus(nodes.map((n) => n.id));
 *   <svg role="group" aria-label="…" {...rove.group}>
 *     {nodes.map((n) => <g key={n.id} role="button" {...rove.item(n.id)} … />)}
 *
 * Polohy prvků pro šipky se berou z getBoundingClientRect v okamžiku stisku (středy a rozměry), takže
 * kresba nemusí nic předávat; bez rozvržení (jsdom) se jde podle pořadí v DOM.
 */
import {
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ROVING_KEYS, rovingTarget, type RovePoint } from "./rovingFocus";

export type RoveKey = string | number;

/** atributy prvku kresby – ovládání klávesnicí na něm patří kresbě (Controls / shortcuts „canvas“) */
export const CANVAS_ITEM_ATTR = "data-canvas-item";
const KEY_ATTR = "data-rove-key";
const GROUP_ATTR = "data-rove-group";

export interface RovingItemProps {
  tabIndex: 0 | -1;
  [KEY_ATTR]: string;
  [CANVAS_ITEM_ATTR]: "";
}

export interface RovingGroupProps {
  [GROUP_ATTR]: "";
  onKeyDown: (e: ReactKeyboardEvent<Element>) => void;
  onFocus: (e: ReactFocusEvent<Element>) => void;
  onBlur: (e: ReactFocusEvent<Element>) => void;
}

export interface RovingFocus {
  /** na obal kresby (svg / div s role="group" a aria-label) */
  group: RovingGroupProps;
  /** na každý prvek kresby, který jde vybrat (spolu s jeho role / aria-label / onKeyDown) */
  item: (key: RoveKey) => RovingItemProps;
  /** prvek, který je teď zastávkou Tabu (null = prázdná kresba) */
  active: string | null;
}

/** prvky této kresby (bez prvků vnořené kresby) */
function itemsOf(group: Element): Element[] {
  return [...group.querySelectorAll(`[${KEY_ATTR}]`)].filter(
    (el) => el.parentElement?.closest(`[${GROUP_ATTR}]`) === group,
  );
}

/** střed a rozměry prvku (sloupce různé výšky na společné základně tak leží v jedné řadě) */
function center(el: Element): RovePoint {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    w: r.width,
    h: r.height,
  };
}

const FOCUSABLE =
  'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Fokus na první ovládací prvek za kresbou v pořadí dokumentu (jako Tab); jinak jen opustit kresbu. */
export function focusAfter(group: Element) {
  const all = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)];
  for (const el of all) {
    if (group.contains(el)) continue;
    if (!(group.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))
      continue;
    if ((el as HTMLButtonElement).disabled || el.closest("[inert], [hidden]"))
      continue;
    el.focus();
    // skrytý prvek (display: none…) fokus nepřijme – zkusit další
    if (document.activeElement === el) return;
  }
  (document.activeElement as HTMLElement | null)?.blur?.();
}

export function useRovingFocus(keys: readonly RoveKey[]): RovingFocus {
  const [chosen, setChosen] = useState<string | null>(null);
  const names = keys.map(String);
  const active =
    chosen !== null && names.includes(chosen) ? chosen : (names[0] ?? null);
  /** kresba a prvek, na kterých je fokus (null = fokus mimo kresbu) */
  const focused = useRef<{ group: Element; key: string } | null>(null);

  // Zmizí-li prvek s fokusem (krok přehrávače, nový stav struktury), prohlížeč pošle fokus na <body> –
  // vrátit ho na novou zastávku kresby, ať šipky dál chodí po kresbě a nekrokují přehrávač.
  useLayoutEffect(() => {
    const f = focused.current;
    if (!f) return;
    const now = document.activeElement;
    if (now && now !== document.body) {
      if (!f.group.contains(now)) focused.current = null;
      return;
    }
    focused.current = null;
    const els = f.group.isConnected ? itemsOf(f.group) : [];
    // prvek pořád je → fokus odešel jinam (klik vedle) – nebrat
    if (els.some((el) => el.getAttribute(KEY_ATTR) === f.key)) return;
    const next = els.find((el) => el.getAttribute("tabindex") === "0");
    (next as HTMLElement | undefined)?.focus({ preventScroll: true });
  });

  const onFocus = (e: ReactFocusEvent<Element>) => {
    const item = (e.target as Element).closest?.(`[${KEY_ATTR}]`);
    if (
      !item ||
      item.parentElement?.closest(`[${GROUP_ATTR}]`) !== e.currentTarget
    )
      return;
    const k = item.getAttribute(KEY_ATTR);
    if (k === null) return;
    focused.current = { group: e.currentTarget, key: k };
    if (k !== chosen) setChosen(k);
  };

  const onBlur = (e: ReactFocusEvent<Element>) => {
    // fokus jde na jiný prvek mimo kresbu (Tab, klik) – kresba ho už nedrží
    const to = e.relatedTarget as Node | null;
    if (to && !e.currentTarget.contains(to)) focused.current = null;
  };

  const onKeyDown = (e: ReactKeyboardEvent<Element>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const group = e.currentTarget;
    const item = (e.target as Element).closest?.(`[${KEY_ATTR}]`);
    if (!item || item.parentElement?.closest(`[${GROUP_ATTR}]`) !== group)
      return;
    if (e.key === "Escape") {
      // klávesu stránce nebereme: otevřená akce či rozdělaná hrana editoru se zavře jako jinde
      focusAfter(group);
      return;
    }
    if (e.shiftKey || !ROVING_KEYS.includes(e.key)) return;
    const els = itemsOf(group);
    const from = els.indexOf(item);
    // klávesa je kresby – přehrávač (šipky = krok, Home / End) ji nedostane, stránka se neposune
    e.preventDefault();
    e.stopPropagation();
    const to = rovingTarget(els.map(center), from, e.key);
    if (to === null) return;
    const next = els[to] as HTMLElement | SVGElement;
    setChosen(next.getAttribute(KEY_ATTR));
    next.focus();
  };

  return {
    group: { [GROUP_ATTR]: "", onKeyDown, onFocus, onBlur },
    item: (key) => ({
      tabIndex: String(key) === active ? 0 : -1,
      [KEY_ATTR]: String(key),
      [CANVAS_ITEM_ATTR]: "",
    }),
    active,
  };
}
