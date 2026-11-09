// Kontroly index.css: témata, kontrast barev sdílených komponent, přístupnost.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../index.css", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");

/** Obsah prvního bloku `selector { … }` (bez vnořených bloků). */
function block(selector: string, from = 0): string {
  const at = css.indexOf(selector + " {", from);
  if (at < 0) throw new Error(`v index.css chybí ${selector}`);
  const start = css.indexOf("{", at) + 1;
  return css.slice(start, css.indexOf("}", start));
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

const light = vars(block(":root"));
const darkManual = vars(block(':root[data-theme="dark"]'));
const darkSystem = vars(
  block(
    ':root:not([data-theme="light"])',
    css.indexOf("@media (prefers-color-scheme: dark)"),
  ),
);
const dark = { ...light, ...darkManual };

describe("index.css – témata", () => {
  it("oba tmavé bloky (ruční volba i podle systému) mají stejné hodnoty", () => {
    expect(darkSystem).toEqual(darkManual);
  });

  it("color-scheme pro každé téma (posuvníky a nativní prvky v tmavém tématu tmavé)", () => {
    expect(block(":root")).toMatch(/(?<![\w-])color-scheme:\s*light dark/);
    expect(block(':root[data-theme="light"]')).toMatch(/color-scheme:\s*light/);
    expect(block(':root[data-theme="dark"]')).toMatch(/color-scheme:\s*dark/);
    expect(
      block(
        ':root:not([data-theme="light"])',
        css.indexOf("@media (prefers-color-scheme: dark)"),
      ),
    ).toMatch(/color-scheme:\s*dark/);
  });

  it("prefers-reduced-motion vypíná přechody", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\{[^}]*transition-duration:\s*0s/,
    );
  });
});

describe("index.css – kontrast (WCAG AA)", () => {
  for (const [name, t] of [
    ["světlé", light],
    ["tmavé", dark],
  ] as const) {
    it(`${name} téma: akcent jako text na pozadí i panelu ≥ 4,5 : 1 a text tlačítka na akcentu ≥ 4,5 : 1`, () => {
      expect(
        contrast(t["--algo-accent"], t["--algo-bg"]),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(t["--algo-accent"], t["--algo-panel"]),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(t["--algo-accent-text"], t["--algo-accent"]),
      ).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name} téma: čísla řádků a komentáře na aktivním řádku pseudokódu ≥ 4,5 : 1`, () => {
      expect(
        contrast(t["--algo-code-comment"], t["--algo-code-active"]),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(t["--algo-code-comment"], t["--algo-code-bg"]),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(t["--algo-code-text"], t["--algo-code-active"]),
      ).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name} téma: chybová barva čitelná na panelu`, () => {
      expect(
        contrast(t["--algo-danger"], t["--algo-panel"]),
      ).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name} téma: navštívený vrchol (.n-visited) má jinou výplň než neoznačený`, () => {
      expect(t["--algo-c-visited-fill"]).toBeDefined();
      expect(t["--algo-c-visited-fill"]).not.toBe(t["--algo-c-node"]);
    });
  }

  it(".n-visited se liší i jinak než barvou (čárkovaný obrys)", () => {
    expect(block(".n-visited circle")).toMatch(
      /fill: var\(--algo-c-visited-fill\)/,
    );
    expect(block(".n-visited circle")).toMatch(/stroke-dasharray/);
  });

  it("barevné komponenty Kruskala nepřebarvují popisek pod vrcholem (.node-sub) na #111", () => {
    expect(css).not.toMatch(/\.graph-node\[class\*=['"]n-comp['"]\] text\s*\{/);
    // tmavý popisek přes token palety komponent (sdílený s lesem Union-Find)
    expect(block('.graph-node[class*="n-comp"] .node-label')).toMatch(
      /fill: var\(--algo-comp-text\)/,
    );
    expect(css).toMatch(/--algo-comp-text: #111;/);
  });
});

/** color-mix(in srgb, a p%, b) */
function mix(a: string, p: number, b: string): string {
  const ch = (s: string) =>
    [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [x, y] = [ch(a), ch(b)];
  return (
    "#" +
    x
      .map((v, i) =>
        Math.round(v * p + y[i] * (1 - p))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

describe("index.css – kontrast hodnot v nových modulech (fáze 2)", () => {
  for (const [name, t] of [
    ["světlé", light],
    ["tmavé", dark],
  ] as const) {
    it(`${name} téma: hodnota 1 (--algo-c-one) čitelná na plátně, panelu, zvýrazněném řádku a vrstvě`, () => {
      const one = t["--algo-c-one"];
      expect(one).toMatch(/^#[0-9a-f]{6}$/i);
      for (const bg of [
        t["--algo-c-node"],
        t["--algo-panel"],
        t["--algo-panel-2"],
        t["--algo-bg"],
        mix(t["--algo-c-compare"], 0.3, t["--algo-panel"]), // .gtable tr.hl
        mix(t["--algo-c-compare"], 0.16, t["--algo-panel"]), // .clayer-hot
        mix(one, 0.2, t["--algo-c-node"]), // vstup s hodnotou 1
      ])
        expect(contrast(one, bg), `${one} na ${bg}`).toBeGreaterThanOrEqual(
          4.5,
        );
    });
    it(`${name} téma: hodnota na aktivním hradle (podbarvení c-compare 40 %) má barvu textu ≥ 4,5`, () => {
      const fill = mix(t["--algo-c-compare"], 0.4, t["--algo-c-node"]);
      expect(contrast(t["--algo-text"], fill)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name} téma: popisky bloků sortnet a klíče sudé/liché ve FFT stromu ≥ 4,5`, () => {
      for (const tok of ["--algo-c-bound-text", "--algo-c-pivot-text"])
        for (const bg of [
          t["--algo-panel"],
          t["--algo-c-node"],
          t["--algo-c-visited-fill"],
        ])
          expect(
            contrast(t[tok], bg),
            `${tok} na ${bg}`,
          ).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("hodnota 1 v hradlech, tabulce a sčítačce bere token --algo-c-one, na aktivním hradle barvu textu", () => {
    expect(block(".algo-root .cnode.v1 .cpin-val")).toMatch(
      /var\(--algo-c-one\)/,
    );
    expect(block(".algo-root .ctruth td.c1")).toMatch(/var\(--algo-c-one\)/);
    expect(
      block(".algo-root .adder-chain-svg .ad-pin.ad-one .ad-pin-bit"),
    ).toMatch(/var\(--algo-c-one\)/);
    expect(block(".algo-root .adder-table .ad-one")).toMatch(
      /var\(--algo-c-one\)/,
    );
    expect(block(".algo-root .cnode.active.v1 .cpin-val")).toMatch(
      /var\(--algo-text\)/,
    );
    expect(block(".algo-root .sortnet-svg .sn-block-label")).toMatch(
      /fill: var\(--algo-c-bound-text\)/,
    );
    expect(block(".algo-root .mtree-node .key-even > text")).toMatch(
      /var\(--algo-c-bound-text\)/,
    );
    expect(block(".algo-root .mtree-node .key-odd > text")).toMatch(
      /var\(--algo-c-pivot-text\)/,
    );
  });
});

describe("index.css – kontrast nových textových barev (fáze 3)", () => {
  for (const [name, t] of [
    ["světlé", light],
    ["tmavé", dark],
  ] as const) {
    it(`${name} téma: ⓘ / ⚠ na konci běhu (info/warn-text na panel-2) ≥ 4,5 : 1`, () => {
      for (const v of ["--algo-info-text", "--algo-warn-text"])
        for (const bg of ["--algo-panel-2", "--algo-panel"])
          expect(contrast(t[v], t[bg]), `${v} na ${bg}`).toBeGreaterThanOrEqual(
            4.5,
          );
    });
    it(`${name} téma: text ukazatele p (--algo-danger-text) a zelený text na plátně ≥ 4,5 : 1`, () => {
      for (const bg of ["--algo-panel", "--algo-bg", "--algo-panel-2"]) {
        expect(contrast(t["--algo-danger-text"], t[bg])).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrast(t["--algo-success-text"], t[bg]),
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
