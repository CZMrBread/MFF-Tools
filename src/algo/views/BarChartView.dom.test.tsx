// @vitest-environment jsdom
/*
 * Sloupcový graf s křivkou (graf ceny operací, obr. 9.2): sloupce mají popis pro čtečku, poslední
 * operace je zvýrazněná, kresba je jedna zastávka Tabu a šipky chodí po sloupcích (roving tabindex);
 * bez operací je to obrázek s výzvou. Čísla s desetinnou čárkou.
 */
import { afterEach, describe, expect, it } from "vitest";
import { key, mount, type Mounted } from "../core/domTest";
import { BarChartView } from "./BarChartView";

let m: Mounted | null = null;
afterEach(async () => {
  await m?.unmount();
  m = null;
});

const props = {
  line: [4, 0, 2],
  first: 1,
  height: 200,
  current: 1,
  ariaLabel: "Graf ceny operací",
  barLabel: (i: number) => `operace ${i + 1}`,
  emptyText: "Zatím žádná operace.",
};

describe("BarChartView", () => {
  it("sloupce s popisem, zvýrazněná poslední operace, křivka s bodem před i po operacích", async () => {
    m = await mount(<BarChartView {...props} bars={[5, 1]} />);
    const svg = m.el.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-label")).toBe("Graf ceny operací");
    const bars = [...m.el.querySelectorAll<SVGGElement>("g.bar")];
    expect(bars.map((b) => b.getAttribute("aria-label"))).toEqual([
      "operace 1",
      "operace 2",
    ]);
    expect(bars[0].classList.contains("bar-plain")).toBe(true);
    expect(bars[1].classList.contains("bar-bound")).toBe(true);
    expect(m.el.querySelectorAll("circle.bc-dot")).toHaveLength(3);
  });

  it("roving tabindex: jedna zastávka Tabu, šipka vpravo na další sloupec", async () => {
    m = await mount(<BarChartView {...props} bars={[5, 1]} />);
    const stops = () =>
      [...m!.el.querySelectorAll('[tabindex="0"]')].map((e) =>
        e.getAttribute("aria-label"),
      );
    expect(stops()).toEqual(["operace 1"]);
    const first = m.el.querySelector<SVGGElement>('[tabindex="0"]')!;
    first.focus();
    await key(first, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "operace 2",
    );
    expect(stops()).toEqual(["operace 2"]);
  });

  it("bez operací: obrázek s výzvou, žádná zastávka Tabu", async () => {
    m = await mount(<BarChartView {...props} bars={[]} line={[0.5]} />);
    const svg = m.el.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(m.el.textContent).toContain("Zatím žádná operace.");
    expect(m.el.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("barvy křivky a mřížky ze sdílených tříd .viz-barchart, žádný inline styl (Otevřené body, dávka 2)", async () => {
    m = await mount(<BarChartView {...props} bars={[5, 1]} />);
    const svg = m.el.querySelector("svg")!;
    expect(svg.classList.contains("viz-barchart")).toBe(true);
    expect(m.el.querySelectorAll("[style]")).toHaveLength(0);
    // mřížka: nulová značka je plná čára osy, ostatní čárkované (bc-grid)
    const grid = [...svg.querySelectorAll("line.bc-axis")];
    expect(grid.length).toBeGreaterThan(1);
    expect(svg.querySelectorAll("line.bc-axis.bc-grid").length).toBe(
      grid.length - 1,
    );
    expect(svg.querySelectorAll("polyline.bc-line")).toHaveLength(1);
    const dots = [...svg.querySelectorAll("circle.bc-dot")];
    expect(dots).toHaveLength(3);
    // bod potenciálu po zvýrazněné (poslední) operaci
    expect(dots.map((d) => d.classList.contains("is-hot"))).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("hodnoty nad sloupci a značky osy s desetinnou čárkou", async () => {
    m = await mount(<BarChartView {...props} bars={[1.5]} line={[]} />);
    const texts = [...m.el.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toContain("1,5");
    expect(texts.join(" ")).not.toMatch(/\d\.\d/);
  });
});
