// @vitest-environment jsdom
// (a,b)-strom na desktopu na jednu obrazovku (FIT_MEDIA): kresba vyplní výšku plátna jako BST/AVL
// (CanvasFit mění vzdálenost hladin, písmo a vrcholy zůstanou 1 : 1) – malý strom z obr. 8.7 se
// roztáhne, hluboký strom se stáhne, aby plátno nepřeteklo. Geometrie plátna je podstrčená (jsdom
// nic nerozkládá): plátno má výšku INNER, SVG se vykreslí ve své výšce zmenšené na šířku plátna.
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount } from "../../core/domTest";
import { FIT_MEDIA } from "../../core/layoutMedia";
import { ABTreePage } from "./ABTreePage";

const CANVAS_W = 598;
let INNER = 300;

const originalMedia = window.matchMedia;
const originalRect = Element.prototype.getBoundingClientRect;

const rect = (height: number, width: number) =>
  ({
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    height,
    width,
    x: 0,
    y: 0,
  }) as DOMRect;

/** vykreslená výška SVG: atribut height zmenšený na šířku plátna (CSS max-width: 100 %) */
function svgRendered(svg: Element) {
  const w = Number(svg.getAttribute("width")) || CANVAS_W;
  const hh = Number(svg.getAttribute("height")) || 0;
  return hh * Math.min(1, CANVAS_W / w);
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: q === FIT_MEDIA,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("viz-canvas") ? INNER : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("view-wrap") ||
        this.classList.contains("viz-canvas")
        ? CANVAS_W
        : 0;
    },
  });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.tagName.toLowerCase() === "svg" && this.closest(".view-wrap"))
      return rect(svgRendered(this), CANVAS_W);
    if (this.classList.contains("view-wrap")) {
      const svg = this.querySelector("svg");
      return rect(svg ? svgRendered(svg) : 0, CANVAS_W);
    }
    return rect(0, 0);
  };
});

afterEach(() => {
  window.matchMedia = originalMedia;
  Element.prototype.getBoundingClientRect = originalRect;
  // jsdom má clientHeight / clientWidth na Element.prototype – podstrčené vlastnosti stačí odebrat
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

const page = (url: string) =>
  h(
    MemoryRouter,
    { initialEntries: [url] },
    h(Routes, null, h(Route, { path: "/tree/ab", element: h(ABTreePage) })),
  );

const treeSvg = (el: HTMLElement) =>
  el.querySelector<SVGSVGElement>(".viz-canvas .tree-wrap > svg")!;

/** svislá vzdálenost kořene a jeho syna (px v kresbě) */
function levelGap(svg: SVGSVGElement): number {
  const ys = [...svg.querySelectorAll<SVGGElement>("g.mtree-node")].map((g) =>
    Number(/translate\([^,]+,\s*([-\d.]+)px\)/.exec(g.style.transform)![1]),
  );
  const levels = [...new Set(ys)].sort((a, b) => a - b);
  return levels[1] - levels[0];
}

describe("(a,b)-strom – kresba vyplní výšku plátna (CanvasFit)", () => {
  it("malý strom z obr. 8.7a (dvě hladiny) se roztáhne do výšky plátna", async () => {
    INNER = 300;
    const m = await mount(page("/tree/ab?ex=obr-8-7a"));
    const svg = treeSvg(m.el);
    const height = Number(svg.getAttribute("height"));
    // dřív 180 px (pevné hladiny po 80 px) v plátně vysokém 300 px; hladiny nejvýš 2,5 × 80 px
    // (20 + 200 + 28 + 20 = 268 px – víc by z dvou vrcholů nad sebou dělalo dlouhé čáry)
    expect(height).toBeGreaterThanOrEqual(260);
    expect(height).toBeLessThanOrEqual(INNER);
    expect(levelGap(svg)).toBeGreaterThan(80);
    await m.unmount();
  });

  it("varianta z přednášky (výchozí strom, 4 hladiny) se v nízkém plátně stáhne – nepřeteče ani se nezmenší písmem", async () => {
    INNER = 260;
    const m = await mount(page("/tree/ab"));
    const svg = treeSvg(m.el);
    // dřív 340 px → CSS zmenšilo celou kresbu i s písmem
    expect(Number(svg.getAttribute("height"))).toBeLessThanOrEqual(INNER);
    expect(Number(svg.getAttribute("width"))).toBeLessThanOrEqual(CANVAS_W);
    expect(levelGap(svg)).toBeLessThan(80);
    await m.unmount();
  });

  it("28 klíčů v (4,7) se vejde do šířky plátna 1280 × 720 bez zmenšení písma pod 12 px", async () => {
    INNER = 300;
    const keys = Array.from({ length: 28 }, (_, i) => (i + 1) * 3).join(",");
    for (const v of ["", "&var=kniha"]) {
      const m = await mount(page(`/tree/ab?k=${keys}&ab=4,7${v}`));
      const svg = treeSvg(m.el);
      const w = Number(svg.getAttribute("width"));
      // písmo klíče 13 px × zmenšení na šířku plátna
      expect(
        13 * Math.min(1, CANVAS_W / w),
        v || "přednáška",
      ).toBeGreaterThanOrEqual(12);
      expect(svgRendered(svg), v || "přednáška").toBeLessThanOrEqual(INNER);
      await m.unmount();
    }
  });
});
