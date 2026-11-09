// Vzorky legendy a značky bodů v index.css: čárkovaný vzorek, navštívený bod k-d dotazu, volná buňka, počítadla třídění.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../../index.css", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");

/** Spojený obsah všech bloků `selector { … }` (i jednořádkových). */
function rules(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const out = [
    ...css.matchAll(
      new RegExp(
        // obsah index.css je pod .algo-root (stránka /algo/ hlavní aplikace)
        String.raw`(?:^|\n|,\s*)(?:\.algo-root )?` +
          esc +
          String.raw`\s*\{([^}]*)\}`,
        "g",
      ),
    ),
  ].map((m) => m[1]);
  if (!out.length) throw new Error(`v index.css chybí ${selector}`);
  return out.join("\n");
}
function vars(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    out[m[1]] = m[2].trim();
  return out;
}
function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** color-mix(in srgb, a t, b) */
function mix(a: string, b: string, t: number): string {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * t +
            parseInt(b.slice(i, i + 2), 16) * (1 - t),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

const rootBody = css.slice(
  css.indexOf(":root {") + 7,
  css.indexOf("}", css.indexOf(":root {")),
);
const light = vars(rootBody);
const darkAt = css.indexOf(':root[data-theme="dark"] {');
if (darkAt < 0) throw new Error("v index.css chybí blok tmavého tématu");
const dark = { ...light, ...vars(css.slice(darkAt, css.indexOf("}", darkAt))) };
/** barva z `fill: var(--x)` v pravidle */
const fillVar = (sel: string) =>
  rules(sel).match(/fill:\s*var\((--[\w-]+)\)/)?.[1];

describe("čárkovaný vzorek legendy (shape: dashed)", () => {
  it("má skutečný čárkovaný border, žádnou masku ani vnitřní stín, který by zakryl výplň (dřív neodpovídal .n-visited)", () => {
    const b = rules(".swatch.swatch-dashed");
    expect(b).toMatch(/border:\s*[\d.]+px dashed/);
    expect(b).not.toMatch(/mask/);
    expect(b).not.toMatch(/box-shadow/);
  });
  it("sw-visited: výplň i obrys jako .n-visited circle", () => {
    const b = rules(".swatch.sw-visited");
    expect(b).toMatch(/background:\s*var\(--algo-c-visited-fill\)/);
    expect(b).toMatch(/dashed var\(--algo-c-node-border\)/);
  });
  it("dotaz Q (sw-compare + dashed): žlutý čárkovaný obrys jako .kd-query, plný outline vypnutý", () => {
    const b = rules(".swatch.sw-compare.swatch-dashed");
    expect(b).toMatch(/border-color:\s*var\(--algo-c-compare-line\)/);
    expect(b).toMatch(/outline:\s*none/);
  });
});

describe("k-d strom: navštívený bod mimo Q", () => {
  it("má jinou barvu než neoznačený, ohlášený i podproblémový bod", () => {
    const v = fillVar(".kd-pt.pt-visited circle");
    expect(v).toBeDefined();
    for (const s of [
      ".kd-pt circle",
      ".kd-pt.pt-found circle",
      ".kd-pt.pt-set circle",
      ".kd-pt.pt-active circle",
    ])
      expect(fillVar(s), s).not.toBe(v);
  });
  for (const [name, t] of [
    ["světlé", light],
    ["tmavé", dark],
  ] as const) {
    it(`${name} téma: kontrast ≥ 3 : 1 na plátně i v oblasti aktuálního vrcholu`, () => {
      const c = t[fillVar(".kd-pt.pt-visited circle")!];
      expect(contrast(c, t["--algo-panel-2"])).toBeGreaterThanOrEqual(3);
      expect(
        contrast(c, mix(t["--algo-c-active"], t["--algo-panel-2"], 0.18)),
      ).toBeGreaterThanOrEqual(3);
      // a dá se rozeznat od neoznačeného bodu
      expect(c).not.toBe(t["--algo-c-node-border"]);
    });
  }
  it("legenda má vzorek stejné barvy", () => {
    expect(rules(".swatch.sw-pt-visited")).toContain(
      `var(${fillVar(".kd-pt.pt-visited circle")})`,
    );
  });
});

describe("další vzorky a pravidla", () => {
  it("volná buňka pole: vzorek se shoduje s .box-free rect", () => {
    expect(rules(".box-free rect")).toMatch(/fill:\s*var\(--algo-c-empty\)/);
    expect(rules(".swatch.sw-free")).toMatch(
      /background:\s*var\(--algo-c-empty\)/,
    );
    expect(rules(".swatch.sw-free")).toMatch(
      /border:\s*1px solid var\(--algo-border\)/,
    );
  });
  it("počítadla třídění (.sort-stats) jsou odlišená od proměnných", () => {
    expect(rules(".sort-stats")).toMatch(/opacity:\s*0?\.9/);
  });
});
