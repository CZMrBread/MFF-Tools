// Sdílené třídy kreseb pro dávku 2 (E5, E6): sloupcový graf (.viz-barchart), stopa pod řadou buněk
// (.viz-trail) a malý les Union-Find (.viz-ufforest). Barvy jen z tokenů --algo-* (obě témata), vše pod .algo-root.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(
  new URL("../index.css", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/** těla všech pravidel, jejichž seznam selektorů obsahuje přesně `sel` */
function bodies(sel: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(",").map((s) => s.trim().replace(/\s+/g, " "));
    if (sels.includes(sel)) out.push(m[2]);
  }
  return out;
}
const has = (sel: string, prop: string, token?: string) => {
  const b = bodies(sel).join(";");
  expect(b, `${sel} { ${prop} }`).toMatch(new RegExp(`(^|[;\\s])${prop}\\s*:`));
  if (token) expect(b, `${sel} → ${token}`).toContain(`var(${token}`);
};

describe(".viz-barchart – sloupcový graf (cena operace, potenciál)", () => {
  it("osa, popisky, sloupec, zvýrazněný sloupec, druhá řada, mez a čára", () => {
    has(".algo-root .viz-barchart", "display");
    has(".algo-root .viz-barchart .bc-axis", "stroke", "--algo-");
    has(".algo-root .viz-barchart .bc-label", "fill", "--algo-muted");
    has(".algo-root .viz-barchart .bc-value", "fill", "--algo-text");
    has(".algo-root .viz-barchart .bc-bar rect", "fill", "--algo-");
    has(
      ".algo-root .viz-barchart .bc-bar.is-hot rect",
      "fill",
      "--algo-c-active",
    );
    has(".algo-root .viz-barchart .bc-bar.bc-alt rect", "fill", "--algo-c-min");
    has(".algo-root .viz-barchart .bc-limit", "stroke-dasharray");
    has(".algo-root .viz-barchart .bc-line", "stroke", "--algo-c-pivot");
    has(".algo-root .viz-barchart .bc-line", "fill");
  });
});

describe(".viz-trail – stopa pod řadou buněk (zkoušené pozice, vyhazování)", () => {
  it("buňka, šipka a stavy is-hot / is-done", () => {
    has(".algo-root .viz-trail .tr-cell rect", "fill", "--algo-");
    has(".algo-root .viz-trail .tr-cell text", "fill", "--algo-text");
    has(
      ".algo-root .viz-trail .tr-cell.is-hot rect",
      "stroke",
      "--algo-c-active",
    );
    has(".algo-root .viz-trail .tr-cell.is-done rect", "fill", "--algo-");
    has(".algo-root .viz-trail .tr-arrow", "stroke", "--algo-");
    has(".algo-root .viz-trail .tr-arrow.is-hot", "stroke", "--algo-c-active");
    has(".algo-root .viz-trail .tr-label", "fill", "--algo-muted");
  });
});

describe(".viz-ufforest – les Union-Find (ukazatele na otce, cesta Find)", () => {
  it("vrchol, kořen, cesta, hrana, šipka, rank", () => {
    has(".algo-root .viz-ufforest .uf-node circle", "fill", "--algo-c-node");
    has(".algo-root .viz-ufforest .uf-node text", "fill", "--algo-text");
    has(".algo-root .viz-ufforest .uf-node.is-root circle", "stroke-width");
    has(
      ".algo-root .viz-ufforest .uf-node.is-path circle",
      "stroke",
      "--algo-c-active",
    );
    has(".algo-root .viz-ufforest .uf-node.is-hot circle", "fill", "--algo-");
    has(".algo-root .viz-ufforest .uf-edge", "stroke", "--algo-c-edge");
    has(
      ".algo-root .viz-ufforest .uf-edge.is-path",
      "stroke",
      "--algo-c-active",
    );
    has(".algo-root .viz-ufforest .uf-arrow", "fill", "--algo-c-edge");
    has(
      ".algo-root .viz-ufforest .uf-arrow.is-path",
      "fill",
      "--algo-c-active",
    );
    has(".algo-root .viz-ufforest .uf-rank", "fill", "--algo-muted");
  });
});

describe("sdílené kresby – společná pravidla", () => {
  const SHARED = /\.viz-(barchart|trail|ufforest)\b/;
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) =>
    SHARED.test(m[1]),
  );

  it("všechna pravidla jsou pod .algo-root a barvy jen z --algo-* (žádné #hex, rgb())", () => {
    expect(rules.length).toBeGreaterThan(20);
    for (const [, sel, body] of rules) {
      for (const s of sel.split(","))
        expect(s.trim(), s).toMatch(/^\.algo-root\s/);
      expect(body, sel).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      for (const v of body.matchAll(/var\((--[\w-]+)/g))
        expect(v[1], sel).toMatch(/^--algo-/);
    }
  });

  it("prvek kresby s fokusem (roving tabindex) má viditelný obrys v barvě akcentu", () => {
    for (const item of [
      ".viz-barchart .bc-bar",
      ".viz-trail .tr-cell",
      ".viz-ufforest .uf-node",
    ])
      has(`.algo-root ${item}:focus-visible`, "outline", "--algo-accent");
  });

  it("oddíl leží před oddíly stop fáze 2 (ty musí zůstat na konci souboru)", () => {
    const at = raw.indexOf("/* ---------- sdílené kresby");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(raw.indexOf("/* === strings === */"));
  });
});

describe("zbytky dávky 2 – sdílené třídy místo inline stylů", () => {
  it("mřížka sloupcového grafu je čárkovaná (dřív inline strokeDasharray)", () => {
    has(".algo-root .viz-barchart .bc-grid", "stroke-dasharray");
  });

  it("les Union-Find má barvy komponent ze stejné palety jako vrcholy grafu (tokeny --algo-comp*)", () => {
    for (let k = 0; k < 8; k++) {
      has(
        `.algo-root .graph-node.n-comp${k} circle`,
        "fill",
        `--algo-comp${k}-fill`,
      );
      has(
        `.algo-root .graph-node.n-comp${k} circle`,
        "stroke",
        `--algo-comp${k}-line`,
      );
      has(
        `.algo-root .viz-ufforest .uf-node.uf-comp${k} circle`,
        "fill",
        `--algo-comp${k}-fill`,
      );
      has(
        `.algo-root .viz-ufforest .uf-node.uf-comp${k} circle`,
        "stroke",
        `--algo-comp${k}-line`,
      );
    }
    has(
      '.algo-root .viz-ufforest .uf-node[class*="uf-comp"] .uf-label',
      "fill",
      "--algo-comp-text",
    );
    // pravidla komponent leží za is-path / is-hot (výplň komponenty vyhraje, obrys cesty zůstane)
    const comp = css.indexOf(".viz-ufforest .uf-node.uf-comp0 circle");
    expect(comp).toBeGreaterThan(
      css.indexOf(".viz-ufforest .uf-node.is-hot circle"),
    );
    has(
      '.algo-root .viz-ufforest .uf-node[class*="uf-comp"].is-path circle',
      "stroke",
      "--algo-c-active",
    );
  });

  it("sufixové pole s omezenou výškou má lepící záhlaví", () => {
    const b = bodies(
      ".algo-root .table-scroll.sa-clamped .sa-table thead th",
    ).join(";");
    expect(b).toMatch(/position\s*:\s*sticky/);
    expect(b).toMatch(/top\s*:\s*0/);
  });
});

describe("integrace dávky 2 – les Union-Find v panelu výsledku Kruskala", () => {
  it("les lepí nahoře panelu (zvýrazněný řádek tabulky ho neodsune) a nová šipka po Union je zvýrazněná", () => {
    has(".algo-root .graph-result > .uf-forest", "position");
    expect(bodies(".algo-root .graph-result > .uf-forest").join(";")).toMatch(
      /position\s*:\s*sticky/,
    );
    has(".algo-root .graph-result > .uf-forest", "background", "--algo-");
    has(
      ".algo-root .viz-ufforest .uf-edge.is-new",
      "stroke",
      "--algo-c-active",
    );
  });
});
