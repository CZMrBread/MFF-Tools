// @vitest-environment jsdom
// Pseudokód drží aktivní řádek v záběru panelu: měří polohu řádku vůči panelu (ne vůči offsetParent),
// a když se řádek vejde s posunem 0, nechá nahoře záhlaví algoritmu (řádek 1).
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { mount } from "./domTest";
import { Pseudocode } from "./Pseudocode";

const LINE = 20;
const PANEL_TOP = 500; // panel není offsetParent řádků (není positioned) – offsetTop je od stránky

function fakeLayout(pre: HTMLElement) {
  Object.defineProperty(pre, "clientHeight", {
    configurable: true,
    value: 100,
  });
  Object.defineProperty(pre, "scrollHeight", {
    configurable: true,
    value: 20 * LINE,
  });
  pre.getBoundingClientRect = () =>
    ({
      top: PANEL_TOP,
      bottom: PANEL_TOP + 100,
      left: 0,
      right: 0,
      height: 100,
      width: 0,
    }) as DOMRect;
  [...pre.children].forEach((c, i) => {
    const el = c as HTMLElement;
    Object.defineProperty(el, "offsetHeight", {
      configurable: true,
      value: LINE,
    });
    Object.defineProperty(el, "offsetTop", {
      configurable: true,
      value: PANEL_TOP + i * LINE,
    });
    el.getBoundingClientRect = () => {
      const top = PANEL_TOP + i * LINE - pre.scrollTop;
      return {
        top,
        bottom: top + LINE,
        left: 0,
        right: 0,
        height: LINE,
        width: 0,
      } as DOMRect;
    };
  });
}

describe("Pseudocode – posun k aktivnímu řádku", () => {
  const lines = Array.from({ length: 20 }, (_, i) => `řádek ${i + 1}`);
  it("řádek blízko začátku: záhlaví zůstane vidět (scrollTop 0); vzdálený řádek se posune do záběru", async () => {
    let active = 0;
    const m = await mount(h(Pseudocode, { lines, active }));
    const pre = m.el.querySelector("pre")!;
    fakeLayout(pre);
    for (active of [1, 2]) {
      await m.render(h(Pseudocode, { lines, active }));
      expect(pre.scrollTop, `aktivní ${active}`).toBe(0);
    }
    active = 12;
    await m.render(h(Pseudocode, { lines, active }));
    const r = pre.children[12].getBoundingClientRect();
    expect(r.top).toBeGreaterThanOrEqual(PANEL_TOP);
    expect(r.bottom).toBeLessThanOrEqual(PANEL_TOP + 100);
    active = 3;
    await m.render(h(Pseudocode, { lines, active }));
    const r3 = pre.children[3].getBoundingClientRect();
    expect(r3.top).toBeGreaterThanOrEqual(PANEL_TOP);
    await m.unmount();
  });
});
