// @vitest-environment jsdom
// Panel výsledku grafových algoritmů (TableView): jednořádkové tabulky (fronta, zásobník, topologické
// pořadí) jako dlaždice, které se zalamují; zásobník se po změně posune na konec (GRAPH-02).
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { mount } from "../core/domTest";
import { TableView } from "./GraphView";

describe("TableView", () => {
  it("jednořádková tabulka bez hlavičky = ol.gtable-tiles s li.gtable-tile a třídami buněk", async () => {
    const m = await mount(
      h(TableView, {
        table: {
          title: "Topologické pořadí (zleva)",
          header: [],
          rows: [["A", "B", "C"]],
          cellMarks: { "0:1": "cell-hot", "0:2": "cell-done" },
        },
      }),
    );
    const tiles = [...m.el.querySelectorAll("ol.gtable-tiles > li")];
    expect(tiles.map((t) => t.textContent)).toEqual(["A", "B", "C"]);
    expect(tiles.map((t) => t.className)).toEqual([
      "gtable-tile",
      "gtable-tile cell-hot",
      "gtable-tile cell-done",
    ]);
    expect(m.el.querySelector("table")).toBeNull();
    await m.unmount();
  });

  it("prázdná jednořádková tabulka ukáže (prázdné); víceřádková zůstane tabulkou", async () => {
    const m = await mount(
      h(TableView, {
        table: { title: "Fronta", header: [], rows: [[]] },
      }),
    );
    expect(m.el.textContent).toContain("(prázdné)");
    expect(m.el.querySelectorAll("li.gtable-tile")).toHaveLength(0);
    await m.unmount();
    const t = await mount(
      h(TableView, {
        table: { title: "Hrany", header: ["hrana", "w"], rows: [["a–b", "1"]] },
      }),
    );
    expect(t.el.querySelector("table")).not.toBeNull();
    await t.unmount();
  });

  it("zásobník (tail): po změně posune kontejner na konec – ne okno", async () => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const sw = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth",
    );
    const sh = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    Object.defineProperty(proto, "scrollWidth", {
      configurable: true,
      get: () => 500,
    });
    Object.defineProperty(proto, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    const winY = window.scrollY;
    try {
      const m = await mount(
        h(TableView, {
          table: {
            title: "Zásobník rekurze",
            header: [],
            rows: [["A", "B", "L"]],
            tail: true,
          },
        }),
      );
      const box = m.el.querySelector<HTMLElement>(".table-scroll")!;
      expect(box.scrollLeft).toBe(500);
      expect(box.scrollTop).toBe(300);
      expect(window.scrollY).toBe(winY);
      await m.unmount();
    } finally {
      if (sw) Object.defineProperty(HTMLElement.prototype, "scrollWidth", sw);
      else delete proto.scrollWidth;
      if (sh) Object.defineProperty(HTMLElement.prototype, "scrollHeight", sh);
      else delete proto.scrollHeight;
    }
  });
});
