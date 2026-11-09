// @vitest-environment jsdom
// Visualizer – úpravy z UX testu fáze 3: sazba indexů ve zprávě a komentářích pseudokódu, prázdný řádek
// pseudokódu pod zprávou, jednořádková historie, sdílený řádek „↶ Vrátit operaci · Výchozí příklad“
// (inputHistory) a neutrální / varovný konec běhu (Step.outcome).
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { mount } from "./domTest";
import { Pseudocode } from "./Pseudocode";
import type { Step } from "./steps";
import type { Player } from "./usePlayer";
import { Visualizer } from "./Visualizer";

function playerOf(
  steps: Step<number>[],
  index = steps.length - 1,
): Player<number> {
  return {
    steps,
    index,
    current: steps[index],
    playing: false,
    delay: 500,
    setDelay: () => {},
    play: () => {},
    pause: () => {},
    toggle: () => {},
    next: () => {},
    prev: () => {},
    first: () => {},
    last: () => {},
    seek: () => {},
    atStart: index === 0,
    atEnd: index === steps.length - 1,
  };
}

type Extra = Partial<Parameters<typeof Visualizer<number>>[0]>;
const view = (steps: Step<number>[], extra: Extra = {}, index?: number) =>
  h(Visualizer<number>, {
    title: "Test",
    description: "popis",
    player: playerOf(steps, index),
    pseudocode: ["Insert(x)", "  krok // x_i … x_{j−1}"],
    actions: h("div", null, "AKCE"),
    children: h("div", { id: "PLATNO" }),
    ...extra,
  });

describe("sazba indexů (SORTDS-09, NEWMODS-15)", () => {
  it("komentář pseudokódu vysází x_i jako dolní index", async () => {
    const m = await mount(
      h(Pseudocode, { lines: ["a ← 1 // x_i … x_{j−1}"], active: null }),
    );
    const c = m.el.querySelector(".pc-comment")!;
    expect(c.querySelectorAll("sub").length).toBe(2);
    expect(c.textContent).toBe("// xi … xj−1");
    await m.unmount();
  });

  it("zpráva kroku „P_LRU > P_OPT“ má dolní indexy", async () => {
    const m = await mount(
      view([{ state: 0, line: null, message: "pro P_LRU > P_OPT je" }]),
    );
    const msg = m.el.querySelector(".viz-message")!;
    expect([...msg.querySelectorAll("sub")].map((s) => s.textContent)).toEqual([
      "LRU",
      "OPT",
    ]);
    await m.unmount();
  });

  it("bez řádku pseudokódu (line === null) je .viz-line prázdný a skrytý (.empty)", async () => {
    const m = await mount(
      view([
        { state: 0, line: 0, message: "a" },
        { state: 0, line: null, message: "konec" },
      ]),
    );
    const line = m.el.querySelector(".viz-line")!;
    expect(line.classList.contains("empty")).toBe(true);
    await m.render(
      view(
        [
          { state: 0, line: 0, message: "a" },
          { state: 0, line: null, message: "konec" },
        ],
        {},
        0,
      ),
    );
    expect(m.el.querySelector(".viz-line")!.classList.contains("empty")).toBe(
      false,
    );
    await m.unmount();
  });
});

describe("historie na jednom řádku (SORTDS-14)", () => {
  it("title nese celou historii, zobrazí se jen posledních 6 s „…“", async () => {
    const history = Array.from({ length: 9 }, (_, i) => `Enqueue(${i + 1})`);
    const m = await mount(
      view([{ state: 0, line: null, message: "x" }], {
        inputHistory: { history, canUndo: true, undo: () => {} },
      }),
    );
    const list = m.el.querySelector(".viz-history-list")!;
    expect(list.getAttribute("title")).toBe(history.join(" › "));
    expect(m.el.querySelectorAll(".viz-history-item").length).toBe(6);
    expect(list.textContent).toContain("… › Enqueue(4)");
    await m.unmount();
  });
});

describe("sdílený řádek Vrátit operaci / Výchozí příklad (CROSS-04/05)", () => {
  it("s inputHistory: ↶ (disabled podle canUndo) i Výchozí příklad", async () => {
    const undo = vi.fn();
    const restore = vi.fn();
    const m = await mount(
      view([{ state: 0, line: null, message: "x" }], {
        inputHistory: { history: ["Vytvořit"], canUndo: false, undo },
        onRestoreInitial: restore,
      }),
    );
    const back = m.button("↶ Vrátit operaci");
    expect(back.disabled).toBe(true);
    await m.render(
      view([{ state: 0, line: null, message: "x" }], {
        inputHistory: { history: ["Vytvořit"], canUndo: true, undo },
        onRestoreInitial: restore,
      }),
    );
    expect(m.button("↶ Vrátit operaci").disabled).toBe(false);
    m.button("↶ Vrátit operaci").click();
    m.button("Výchozí příklad").click();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(m.el.querySelector(".viz-history-list")?.textContent).toContain(
      "Vytvořit",
    );
    await m.unmount();
  });

  it("jen s onRestoreInitial: jen tlačítko Výchozí příklad (bez historie a ↶)", async () => {
    const restore = vi.fn();
    const m = await mount(
      view([{ state: 0, line: null, message: "x" }], {
        onRestoreInitial: restore,
      }),
    );
    const buttons = [...m.el.querySelectorAll(".viz-history button")].map(
      (b) => b.textContent,
    );
    expect(buttons).toEqual(["Výchozí příklad"]);
    expect(m.el.querySelector(".viz-history-list")).toBeNull();
    m.button("Výchozí příklad").click();
    expect(restore).toHaveBeenCalledTimes(1);
    // řádek leží v sekci akcí (pod ActionMenu)
    expect(m.el.querySelector(".viz-actions .viz-history")).not.toBeNull();
    await m.unmount();
  });

  it("bez structure, inputHistory i onRestoreInitial se řádek nevykreslí", async () => {
    const m = await mount(view([{ state: 0, line: null, message: "x" }]));
    expect(m.el.querySelector(".viz-history")).toBeNull();
    await m.unmount();
  });
});

describe("neutrální / varovný konec běhu (TREEHASH-18, GRAPH-14)", () => {
  const run = (outcome?: "neutral" | "warn"): Step<number>[] => [
    { state: 0, line: 0, message: "start" },
    { state: 0, line: null, message: "konec", outcome },
  ];

  it("bez outcome: ✓ a třída done", async () => {
    const m = await mount(view(run()));
    const msg = m.el.querySelector(".viz-message")!;
    expect(msg.textContent?.startsWith("✓")).toBe(true);
    expect(msg.classList.contains("done")).toBe(true);
    await m.unmount();
  });

  it("outcome 'neutral': ⓘ, žádné ✓, třídy done neutral", async () => {
    const m = await mount(view(run("neutral")));
    const msg = m.el.querySelector(".viz-message")!;
    expect(msg.textContent?.startsWith("ⓘ")).toBe(true);
    expect(msg.textContent).not.toContain("✓");
    expect(msg.classList.contains("neutral")).toBe(true);
    expect(msg.classList.contains("done")).toBe(true);
    await m.unmount();
  });

  it("outcome 'warn': ⚠, žádné ✓, třída warn (ne done)", async () => {
    const m = await mount(view(run("warn")));
    const msg = m.el.querySelector(".viz-message")!;
    expect(msg.textContent?.startsWith("⚠")).toBe(true);
    expect(msg.textContent).not.toContain("✓");
    expect(msg.classList.contains("warn")).toBe(true);
    expect(msg.classList.contains("done")).toBe(false);
    await m.unmount();
  });

  it("outcome se uplatní až na konci běhu", async () => {
    const m = await mount(view(run("warn"), {}, 0));
    const msg = m.el.querySelector(".viz-message")!;
    expect(msg.classList.contains("warn")).toBe(false);
    expect(msg.textContent).toBe("start");
    await m.unmount();
  });
});

describe("telefon: fokus nezajede pod přilepené ovládání (TREEHASH-06)", () => {
  it("výška .controls jde do --algo-controls-h; fokus pod lištou posune okno o překryv", async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const origRO = g.ResizeObserver;
    const origRect = Element.prototype.getBoundingClientRect;
    const origScrollBy = window.scrollBy;
    const origRaf = window.requestAnimationFrame;
    const scrolls: unknown[] = [];
    g.ResizeObserver = class {
      cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
      }
      observe() {
        this.cb();
      }
      disconnect() {}
    };
    const rect = (top: number, height: number) =>
      ({
        top,
        height,
        bottom: top + height,
        left: 0,
        right: 390,
        width: 390,
        x: 0,
        y: top,
      }) as DOMRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains("controls")) return rect(700, 144);
      if (this.id === "POD") return rect(720, 30);
      if (this.id === "NAD") return rect(300, 30);
      return rect(0, 0);
    };
    window.scrollBy = ((arg: unknown) => {
      scrolls.push(arg);
    }) as typeof window.scrollBy;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof window.requestAnimationFrame;
    try {
      const m = await mount(
        view([{ state: 0, line: null, message: "x" }], {
          actions: h("div", null, [
            h("button", { id: "NAD", key: 1 }, "Find(x)"),
            h("button", { id: "POD", key: 2 }, "Insert(x)"),
          ]),
        }),
      );
      const root = m.el.querySelector<HTMLElement>(".viz")!;
      expect(root.style.getPropertyValue("--algo-controls-h")).toBe("144px");
      m.el.querySelector<HTMLElement>("#NAD")!.focus();
      expect(scrolls).toEqual([]);
      m.el.querySelector<HTMLElement>("#POD")!.focus();
      expect(scrolls).toEqual([{ top: 750 - 700 + 16, behavior: "auto" }]);
      // fokus uvnitř ovládání samotného nic neposouvá
      m.el.querySelector<HTMLElement>(".controls button")!.focus();
      expect(scrolls.length).toBe(1);
      await m.unmount();
    } finally {
      g.ResizeObserver = origRO;
      Element.prototype.getBoundingClientRect = origRect;
      window.scrollBy = origScrollBy;
      window.requestAnimationFrame = origRaf;
    }
  });
});
