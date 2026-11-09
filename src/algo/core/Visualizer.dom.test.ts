// @vitest-environment jsdom
// Visualizer v DOM: po spuštění akce (změně runKey) se plátno posune do záběru – na telefonu leží
// nabídka akcí pod plátnem, takže bez posunu by uživatel přehrávání vůbec neviděl.
import { createElement as h, useContext } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasFitContext } from "./canvasFit";
import { mount } from "./domTest";
import { FIT_MEDIA } from "./layoutMedia";
import type { Player } from "./usePlayer";
import { Visualizer } from "./Visualizer";

const steps = [{ state: 0, line: null, message: "klid" }];
const player: Player<number> = {
  steps,
  index: 0,
  current: steps[0],
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
  atStart: true,
  atEnd: true,
};

const view = (runKey: number) =>
  h(Visualizer<number>, {
    title: "Graf",
    description: "popis",
    player,
    pseudocode: [],
    actions: h("div", null, "AKCE"),
    runKey,
    children: h("div", { id: "PLATNO" }),
  });

describe("Visualizer – posun plátna do záběru (jsdom)", () => {
  const spy = vi.fn();
  const original = Element.prototype.scrollIntoView;
  afterEach(() => {
    spy.mockReset();
    Element.prototype.scrollIntoView = original;
  });

  it("změna runKey posune .viz-canvas do záběru, první vykreslení ne", async () => {
    Element.prototype.scrollIntoView = spy;
    const m = await mount(view(0));
    expect(spy).not.toHaveBeenCalled();
    await m.render(view(1));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.contexts[0]).toBe(m.el.querySelector(".viz-canvas"));
    // stejný klíč znovu = žádný další posun
    await m.render(view(1));
    expect(spy).toHaveBeenCalledTimes(1);
    await m.render(view(2));
    expect(spy).toHaveBeenCalledTimes(2);
    await m.unmount();
  });

  it("plátno vyšší než okno nebo s horním okrajem pod hlavičkou se zarovná začátkem (block: start) – VAL-06 Kruskal 390 px", async () => {
    Element.prototype.scrollIntoView = spy;
    const m = await mount(view(0));
    const canvas = m.el.querySelector<HTMLElement>(".viz-canvas")!;
    const rect = (top: number, height: number) => () =>
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
    // horní okraj zajel pod hlavičku a horní lištu (top 40 < scroll-margin), spodek mimo okno
    canvas.getBoundingClientRect = rect(40, 1400);
    canvas.style.scrollMarginTop = "120px";
    await m.render(view(1));
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ block: "start" });
    // malé plátno celé pod hlavičkou: jen „nearest“ (stránka zbytečně neskáče)
    canvas.getBoundingClientRect = rect(300, 200);
    await m.render(view(2));
    expect(spy.mock.calls[1]?.[0]).toMatchObject({ block: "nearest" });
    await m.unmount();
  });

  it("přestavba struktury (version roste, opId ne – např. BST ▸ Seřazeně) také posune plátno", async () => {
    Element.prototype.scrollIntoView = spy;
    const structure = (version: number) => ({
      opTitle: "",
      opId: 3,
      version,
      history: [],
      canUndo: false,
      undo: () => {},
      restoreInitial: () => {},
    });
    const tree = (version: number) =>
      h(Visualizer<number>, {
        title: "BST",
        description: "popis",
        player,
        pseudocode: [],
        structure: structure(version),
        children: h("div", null),
      });
    const m = await mount(tree(5));
    await m.render(tree(6));
    expect(spy).toHaveBeenCalledTimes(1);
    await m.unmount();
  });
});

describe("Visualizer – plátno pro přizpůsobení kresby (CanvasFitContext)", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });
  const media = (fit: boolean) =>
    ((q: string) => ({
      matches: fit && q === FIT_MEDIA,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

  let seen: HTMLElement | null | undefined;
  function Probe() {
    seen = useContext(CanvasFitContext);
    return null;
  }
  const withProbe = () =>
    h(Visualizer<number>, {
      title: "Graf",
      description: "popis",
      player,
      pseudocode: [],
      actions: h("div", null, "AKCE"),
      children: h(Probe),
    });

  it("na desktopu na jednu obrazovku dá stránce prvek .viz-canvas, jinde null", async () => {
    window.matchMedia = media(true);
    seen = undefined;
    const m = await mount(withProbe());
    expect(seen).toBe(m.el.querySelector(".viz-canvas"));
    await m.unmount();

    window.matchMedia = media(false);
    seen = undefined;
    const m2 = await mount(withProbe());
    expect(seen).toBeNull();
    await m2.unmount();
  });
});
