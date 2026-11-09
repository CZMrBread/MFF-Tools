// @vitest-environment jsdom
/*
 * Roving tabindex (rozhodnutí vlastníka D3, 7. 11. 2026): každá kresba je JEDNA zastávka tabulátoru –
 * mezi jejími prvky se chodí šipkami (core/useRovingFocus.ts). Hlídá všechny moduly z registry.ts po
 * otevření stránky i s otevřenou první akcí (pak jdou prvky kresby vybrat klikem / Enterem).
 *
 * Kresba = nejbližší [data-rove-group], <svg>, .view-wrap nebo odstavec .hint kolem prvku. Počítají se jen
 * prvky kresby (fokusovatelné prvky, které nejsou nativní ovládací prvky – tlačítka panelů nástrojů,
 * pole a posuvné oblasti .table-scroll do kresby nepatří).
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AlgoPage } from "./AlgoPage";
import { MODULES } from "./registry";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const wait = (ms: number) =>
  act(() => new Promise<void>((r) => setTimeout(r, ms)));

const NATIVE = "a[href], button, input, select, textarea, summary";

/** zastávky tabulátoru v kresbách: popis kresby → popisky prvků s tabindex ≥ 0 */
function drawingTabStops(root: HTMLElement): Map<Element, string[]> {
  const out = new Map<Element, string[]>();
  for (const el of root.querySelectorAll("[tabindex]")) {
    if (Number(el.getAttribute("tabindex")) < 0) continue;
    if (el.matches(NATIVE) || el.matches(".table-scroll, main, h1, h2"))
      continue;
    if (el.closest(".controls, .action-menu, nav, header")) continue;
    const drawing =
      el.parentElement?.closest("[data-rove-group], svg, .view-wrap, .hint") ??
      root;
    const list = out.get(drawing) ?? [];
    list.push(
      el.getAttribute("aria-label") ??
        el.textContent?.trim().slice(0, 20) ??
        "?",
    );
    out.set(drawing, list);
  }
  return out;
}

function describeDrawing(d: Element) {
  return (
    d.getAttribute("aria-label") ??
    `${d.tagName.toLowerCase()}.${(d.getAttribute("class") ?? "").split(" ")[0]}`
  );
}

function expectOneStopPerDrawing(root: HTMLElement, when: string) {
  const bad = [...drawingTabStops(root)]
    .filter(([, stops]) => stops.length > 1)
    .map(
      ([d, stops]) =>
        `${describeDrawing(d)}: ${stops.length} zastávek (${stops.slice(0, 3).join(" | ")}…)`,
    );
  expect(bad, when).toEqual([]);
}

describe("každá kresba je jedna zastávka Tabu (roving tabindex)", () => {
  for (const m of MODULES) {
    it(`${m.path}: po otevření i s otevřenou akcí`, async () => {
      window.location.hash = "#" + m.path;
      const { container } = render(<AlgoPage />);
      await screen.findAllByText(m.title);
      await waitFor(
        () => expect(container.querySelector(".am-action")).not.toBeNull(),
        { timeout: 10000 },
      );
      await wait(30);
      expectOneStopPerDrawing(container, "po otevření");

      const action = [
        ...container.querySelectorAll<HTMLButtonElement>(".am-action"),
      ].find(
        (b) =>
          b.getAttribute("aria-disabled") !== "true" &&
          b.hasAttribute("aria-expanded"),
      );
      if (action && action.getAttribute("aria-expanded") !== "true") {
        await act(async () => fireEvent.click(action));
        await wait(10);
      }
      expectOneStopPerDrawing(container, "s otevřenou akcí");
    });
  }
});
