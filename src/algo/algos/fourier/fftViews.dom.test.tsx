// @vitest-environment jsdom
// Tabulka hodnot FFT (NEWMODS-01): po změně kroku se posune jen její kontejner (ne okno) k buňce
// cell-hot (jinak cell-active); kontejner jde posouvat klávesnicí (tabIndex 0, přístupné jméno).
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { mount } from "../../core/domTest";
import type { TableModel } from "./fft";
import { FftTable } from "./fftViews";

const model = (hot: number): TableModel => ({
  heads: Array.from({ length: 16 }, (_, i) => String(i)),
  rows: [
    {
      key: "y",
      label: "y",
      cells: Array.from({ length: 16 }, (_, i) => ({
        text: String(i),
        cls: i === hot ? "cell-hot" : undefined,
      })),
    },
  ],
});

describe("FftTable", () => {
  it("kontejner .table-scroll má tabIndex 0 a jméno „Tabulka hodnot FFT“", async () => {
    const m = await mount(h(FftTable, { model: model(0), caption: "Hodnoty" }));
    const box = m.el.querySelector<HTMLElement>(".table-scroll")!;
    expect(box.tabIndex).toBe(0);
    expect(box.getAttribute("aria-label")).toBe("Tabulka hodnot FFT");
    await m.unmount();
  });

  it("buňka cell-hot mimo záběr → posune se scrollLeft kontejneru, okno ne", async () => {
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const r = (x: number, w: number) =>
        ({
          left: x,
          right: x + w,
          top: 0,
          bottom: 20,
          width: w,
          height: 20,
          x,
          y: 0,
        }) as DOMRect;
      if (this.classList.contains("table-scroll")) return r(0, 100);
      if (this.classList.contains("cell-hot"))
        return r(
          300 - (this.closest(".table-scroll") as HTMLElement).scrollLeft,
          30,
        );
      return r(0, 0);
    };
    const winX = window.scrollX;
    try {
      const m = await mount(
        h(FftTable, { model: model(12), caption: "Hodnoty" }),
      );
      const box = m.el.querySelector<HTMLElement>(".table-scroll")!;
      expect(box.scrollLeft).toBeGreaterThanOrEqual(230);
      expect(window.scrollX).toBe(winX);
      await m.unmount();
    } finally {
      Element.prototype.getBoundingClientRect = orig;
    }
  });
});
