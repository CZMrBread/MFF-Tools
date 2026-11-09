/**
 * Rozhodování o klávesových zkratkách přehrávače – čistá funkce bez DOM (testy v shortcuts.test.ts).
 * Controls.tsx jen zjistí, na čem je fokus, a výsledek provede.
 */

export type ShortcutAction =
  | "toggle"
  | "next"
  | "prev"
  | "first"
  | "last"
  /** pomaleji (−) / rychleji (+) – o jednu rychlost v SPEEDS */
  | "slower"
  | "faster"
  /** Esc – zavřít otevřenou nabídku (ActionMenu, panel editoru); stránce se klávesa nebere */
  | "escape";

/**
 * Na čem je fokus:
 * - none: nic ovladatelného (tělo stránky, plátno)
 * - text: textové pole, textarea, select, contenteditable – klávesy patří jemu
 * - choice: zaškrtávátko / přepínač – mezerník i šipky patří jemu
 * - range: posuvník – šipky, Home a End patří jemu, mezerník ne
 * - button: tlačítko, odkaz, summary – mezerník ho aktivuje, pokud na něj uživatel došel klávesnicí
 * - action-ran: tlačítko akce, na které se fokus vrátil po provedení a sbalení operace (Enter v poli) –
 *   mezerník tu přehrává (jinak by akci znovu otevřel a z klávesnice by se nedalo přehrát), Enter ji
 *   dál otevře
 * - canvas: prvek kresby (roving tabindex, useRovingFocus / pickProps; i jiný fokusovatelný prvek v SVG) –
 *   šipky, Home a End patří kresbě (pohyb po prvcích), mezerník vždy přehrávač (rozhodnutí D3)
 */
export type FocusKind =
  "none" | "text" | "choice" | "range" | "button" | "action-ran" | "canvas";

export interface KeyInfo {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  /** automatické opakování při držení klávesy */
  repeat?: boolean;
}

export interface ShortcutDecision {
  /** co má přehrávač udělat (null = nic) */
  action: ShortcutAction | null;
  /** zavolat preventDefault – klávesa je naše a nemá rolovat stránkou ani aktivovat tlačítko */
  prevent: boolean;
}

const NOTHING: ShortcutDecision = { action: null, prevent: false };

const KEYS: Record<string, ShortcutAction> = {
  " ": "toggle",
  ArrowRight: "next",
  ArrowLeft: "prev",
  Home: "first",
  End: "last",
};

/**
 * @param focus na čem je fokus
 * @param keyboardFocus uživatel se naposledy pohyboval klávesnicí (Tab), ne myší či dotykem
 */
const SPEED_KEYS: Record<string, ShortcutAction> = {
  "-": "slower",
  "+": "faster",
  "=": "faster",
};

export function decideShortcut(
  e: KeyInfo,
  focus: FocusKind,
  keyboardFocus: boolean,
): ShortcutDecision {
  // kombinace s modifikátorem patří prohlížeči (Alt+← = zpět, Ctrl+End, Ctrl+− = lupa…)
  if (e.altKey || e.ctrlKey || e.metaKey) return NOTHING;
  if (e.key === "Escape") return { action: "escape", prevent: false };
  // „+“ se na mnoha klávesnicích píše se Shiftem – Shift tu nevadí
  const speed = SPEED_KEYS[e.key];
  if (speed) {
    if (focus === "text" || focus === "choice") return NOTHING;
    return { action: speed, prevent: true };
  }
  if (e.shiftKey) return NOTHING;
  const action = KEYS[e.key];
  if (!action) return NOTHING;
  if (focus === "text" || focus === "choice") return NOTHING;
  if (action !== "toggle") {
    // kresba: šipky přesouvají fokus mezi prvky (useRovingFocus), přehrávač nekrokuje
    if (focus === "canvas") return NOTHING;
    // posuvník si šipky, Home a End obslouží sám (jinak by se změnila rychlost i krok zároveň)
    return focus === "range" ? NOTHING : { action, prevent: true };
  }
  // Mezerník na tlačítku: kdo na něj došel tabulátorem, chce ho stisknout. Po kliknutí myší ale fokus na
  // tlačítku jen „zůstal“ a mezerník má dál přehrávat – jinak by znovu spustil poslední operaci.
  if (focus === "button" && keyboardFocus) return NOTHING;
  // držení mezerníku nesmí rychle střídat přehrát / pauza
  return { action: e.repeat ? null : "toggle", prevent: true };
}
