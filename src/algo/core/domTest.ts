/**
 * Pomůcky pro tenké DOM testy (jen v souborech s `// @vitest-environment jsdom` na prvním řádku).
 * Bez Testing Library: React 19 `act` + react-dom/client, události se posílají jako v prohlížeči.
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  el: HTMLDivElement;
  render: (node: ReactNode) => Promise<void>;
  unmount: () => Promise<void>;
  /** tlačítko podle viditelného textu (oříznutého) nebo aria-label */
  button: (text: string) => HTMLButtonElement;
  /** pole podle textu jeho <label> (začátek textu) */
  input: (label: string) => HTMLInputElement;
}

export async function mount(node: ReactNode): Promise<Mounted> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const render = (n: ReactNode) => act(async () => root.render(n));
  await render(node);
  return {
    el,
    render,
    unmount: async () => {
      await act(async () => root.unmount());
      el.remove();
    },
    button: (text) => {
      const b = [...el.querySelectorAll("button")].find(
        (x) =>
          x.textContent?.trim() === text ||
          x.getAttribute("aria-label") === text,
      );
      if (!b) throw new Error(`tlačítko „${text}“ nenalezeno`);
      return b;
    },
    input: (label) => {
      const l = [...el.querySelectorAll("label")].find((x) =>
        x.textContent?.trim().startsWith(label),
      );
      const i = l?.querySelector("input, select, textarea");
      if (!i) throw new Error(`pole „${label}“ nenalezeno`);
      return i as HTMLInputElement;
    },
  };
}

/** Napíše text do pole tak, aby to React zaregistroval (nativní setter + událost input). */
export async function type(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): Promise<void> {
  const proto =
    input instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(
      new Event(input instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

export async function key(
  target: EventTarget,
  init: KeyboardEventInit,
): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  await act(async () => {
    target.dispatchEvent(ev);
  });
  return ev;
}

export async function click(target: HTMLElement | SVGElement): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
}

/**
 * Událost ukazatele (jsdom nemá PointerEvent ve všech verzích – použije se MouseEvent s doplněnými poli).
 * `type`: pointerdown / pointermove / pointerup / pointercancel.
 */
export async function pointer(
  target: EventTarget,
  type: string,
  init: {
    clientX?: number;
    clientY?: number;
    pointerId?: number;
    pointerType?: string;
    button?: number;
    /** čas události v ms (dlouhý stisk) */
    timeStamp?: number;
  } = {},
): Promise<void> {
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
  });
  Object.defineProperty(ev, "pointerId", { value: init.pointerId ?? 1 });
  Object.defineProperty(ev, "pointerType", {
    value: init.pointerType ?? "mouse",
  });
  if (init.timeStamp !== undefined)
    Object.defineProperty(ev, "timeStamp", { value: init.timeStamp });
  await act(async () => {
    target.dispatchEvent(ev);
  });
}

export { act };
