// @vitest-environment jsdom
/*
 * Hledání v levé liště (UX audit 7. 11. 2026, UX-09): krátký zástupný text (nevejde se oříznutý),
 * počet výsledků pro čtečku, první výsledek označený jako cíl Enteru a šipka ↓ do výsledků.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AlgoPage } from "./AlgoPage";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

async function open() {
  window.location.hash = "#/sort/quick";
  const r = render(<AlgoPage />);
  await screen.findAllByText("Quicksort");
  const field = r.container.querySelector<HTMLInputElement>(
    ".sidebar .search-field",
  )!;
  const search = (text: string) =>
    act(async () => fireEvent.change(field, { target: { value: text } }));
  return { c: r.container, field, search };
}

describe("levá lišta – hledání", () => {
  it("zástupný text je krátký (v úzké liště se neořízne)", async () => {
    const { field } = await open();
    expect(field.placeholder.length).toBeLessThanOrEqual(16);
  });

  it("počet výsledků v role=status; první výsledek je označený jako cíl Enteru", async () => {
    const { c, search } = await open();
    await search("halda");
    const status = c.querySelector('.sidebar [role="status"]');
    const links = c.querySelectorAll(".sidebar .nav-cat a");
    expect(links.length).toBeGreaterThan(0);
    expect(status?.textContent).toContain(String(links.length));
    expect(links[0].classList.contains("enter-target")).toBe(true);
    expect(c.querySelectorAll(".sidebar .enter-target")).toHaveLength(1);
    // bez hledání se nic neoznačuje
    await search("");
    expect(c.querySelectorAll(".sidebar .enter-target")).toHaveLength(0);
  });

  it("↓ v poli přejde na první výsledek, ↓/↑ mezi výsledky, ↑ z prvního zpět do pole", async () => {
    const { c, field, search } = await open();
    await search("sort");
    const links = [
      ...c.querySelectorAll<HTMLAnchorElement>(".sidebar .nav-cat a"),
    ];
    expect(links.length).toBeGreaterThan(2);
    field.focus();
    await act(async () => fireEvent.keyDown(field, { key: "ArrowDown" }));
    expect(document.activeElement).toBe(links[0]);
    await act(async () => fireEvent.keyDown(links[0], { key: "ArrowDown" }));
    expect(document.activeElement).toBe(links[1]);
    await act(async () => fireEvent.keyDown(links[1], { key: "ArrowUp" }));
    expect(document.activeElement).toBe(links[0]);
    await act(async () => fireEvent.keyDown(links[0], { key: "ArrowUp" }));
    expect(document.activeElement).toBe(field);
  });
});

describe("levá lišta – aktivní modul v záběru (CROSS-12)", () => {
  it("revealTop: viditelná položka nic, skrytá pod / nad koncem se vystředí", async () => {
    const { revealTop } = await import("./AppScroll");
    const view = { top: 100, height: 500, scrollTop: 0 };
    expect(revealTop(view, { top: 200, height: 24 })).toBeNull();
    expect(revealTop(view, { top: 1000, height: 24 })).toBe(1000 - 100 - 238);
    expect(
      revealTop({ ...view, scrollTop: 800 }, { top: 50, height: 24 }),
    ).toBe(50 - 100 + 800 - 238);
    expect(revealTop(view, { top: 300, height: 24 }, 0)).toBeNull();
    expect(revealTop(view, { top: 110, height: 24 }, 0)).toBeNull();
    expect(revealTop(view, { top: 90, height: 24 })).toBe(0);
  });

  it("po otevření modulu se posune jen lišta (scrollTo na <nav>), ne okno ani scrollIntoView", async () => {
    const proto = Element.prototype as unknown as Record<string, unknown>;
    const origRect = Element.prototype.getBoundingClientRect;
    const origScrollTo = proto.scrollTo;
    const origInto = Element.prototype.scrollIntoView;
    const navCalls: unknown[] = [];
    const into: Element[] = [];
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const isNav = this.classList.contains("sidebar");
      const active = this.getAttribute("aria-current") === "page";
      const top = isNav ? 0 : active ? 1500 : 10;
      const height = isNav ? 600 : 24;
      return {
        top,
        height,
        bottom: top + height,
        left: 0,
        right: 250,
        width: 250,
        x: 0,
        y: top,
      } as DOMRect;
    };
    proto.scrollTo = function (this: Element, arg: unknown) {
      if (this.classList?.contains("sidebar")) navCalls.push(arg);
    };
    Element.prototype.scrollIntoView = function (this: Element) {
      into.push(this);
    };
    try {
      window.location.hash = "#/graph/dijkstra";
      render(<AlgoPage />);
      await screen.findAllByText("Dijkstrův algoritmus");
      await act(() => new Promise((r) => setTimeout(r, 20)));
      expect(navCalls.length).toBeGreaterThan(0);
      expect((navCalls.at(-1) as { top: number }).top).toBe(1500 - 288);
      expect(
        into.filter((e) => e.closest(".sidebar")),
        "žádný scrollIntoView v liště (posunul by i okno)",
      ).toEqual([]);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
      proto.scrollTo = origScrollTo;
      Element.prototype.scrollIntoView = origInto;
    }
  });
});
