// @vitest-environment jsdom
// availableFor (G-02): od dostupné výšky kresby se odečítá jen to, co leží opravdu pod ní – panel
// „Import / export textem“ vpravo v gridu editoru kresbu nezmenší.
import { describe, expect, it } from "vitest";
import { availableFor } from "./graphFitHeight";

type Box = { top: number; left: number; width: number; height: number };
function place(el: HTMLElement, b: Box) {
  el.getBoundingClientRect = () =>
    ({
      ...b,
      x: b.left,
      y: b.top,
      right: b.left + b.width,
      bottom: b.top + b.height,
      toJSON: () => b,
    }) as DOMRect;
}
function setup(textBox: Box) {
  const canvas = document.createElement("div");
  const editor = document.createElement("div");
  editor.style.display = "grid";
  const bar = document.createElement("div");
  const wrap = document.createElement("div");
  const text = document.createElement("details");
  editor.append(bar, wrap, text);
  canvas.append(editor);
  document.body.append(canvas);
  Object.defineProperty(canvas, "clientHeight", { value: 600 });
  place(canvas, { top: 0, left: 0, width: 1000, height: 600 });
  place(editor, { top: 0, left: 0, width: 1000, height: 600 });
  place(bar, { top: 0, left: 0, width: 700, height: 40 });
  place(wrap, { top: 40, left: 0, width: 700, height: 500 });
  place(text, textBox);
  return { canvas, wrap, done: () => canvas.remove() };
}

describe("availableFor (G-02)", () => {
  it("sourozenec vpravo v gridu (panel textu vedle kresby) dostupnou výšku nesnižuje", () => {
    const t = setup({ top: 0, left: 720, width: 256, height: 300 });
    expect(availableFor(t.wrap, t.canvas)).toBe(560);
    t.done();
  });
  it("sourozenec opravdu pod kresbou se odečte", () => {
    const t = setup({ top: 545, left: 0, width: 700, height: 30 });
    expect(availableFor(t.wrap, t.canvas)).toBe(530);
    t.done();
  });
});
