// CSS plynulých přechodů mezi kroky: délky se berou z proměnných, které Visualizer nastaví na
// .viz-canvas podle přehrávače (--algo-step-ms pohyb, --algo-step-color-ms barvy) – žádné pevné časy,
// jinak by skok posuvníkem animoval a rychlé přehrávání nestíhalo. Odcházející prvky (.leaving)
// doznívají a nejdou kliknout; nové prvky se objeví (animace algo-enter).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8")
  .replaceAll("\r\n", "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** těla pravidel, jejichž selektor (mimo @media) přesně odpovídá */
function bodies(selector: string): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const sels = m[1].split(",").map((s) => s.trim());
    if (sels.includes(selector)) out.push(m[2]);
  }
  return out;
}
const transitionOf = (selector: string) =>
  bodies(selector)
    .map((b) => /transition:([^;]+);/.exec(b)?.[1] ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

describe("CSS přechodů mezi kroky", () => {
  it("změna rozložení (třída .relayout na SVG pole) výšku sloupců neanimuje (F10)", () => {
    expect(transitionOf(".algo-root .array-svg.relayout .bar rect")).toMatch(
      /^none/,
    );
  });

  it("ukazatele: přesun (transform) trvá var(--algo-step-ms)", () => {
    expect(transitionOf(".algo-root .pointer")).toMatch(
      /transform var\(--algo-step-ms/,
    );
  });

  it.each([".algo-root .bar", ".algo-root .box"])(
    "%s: přesun animuje useFlip (Web Animations), ne CSS přechod – ten by se s ním pral",
    (sel) => {
      expect(transitionOf(sel)).not.toMatch(/transform/);
    },
  );

  it("sloupce mění výšku po dobu kroku, barvu po dobu barev", () => {
    const t = transitionOf(".algo-root .bar rect");
    expect(t).toMatch(/height var\(--algo-step-ms/);
    expect(t).toMatch(/fill var\(--algo-step-color-ms/);
  });

  it.each([
    ".algo-root .box rect",
    ".algo-root .tree-node circle",
    ".algo-root .graph-node circle",
    ".algo-root .mtree-node rect",
  ])("%s: výplň a obrys přes var(--algo-step-color-ms)", (sel) => {
    const t = transitionOf(sel);
    expect(t).toMatch(/fill var\(--algo-step-color-ms/);
    expect(t).toMatch(/stroke var\(--algo-step-color-ms/);
  });

  it("žádný přechod plátna nemá pevnou délku transformace", () => {
    expect(css).not.toMatch(/transition:\s*transform\s+0\.\d+s/);
  });

  it("nové prvky se objeví (algo-enter), odcházející doznívají (algo-leave) a nejdou kliknout", () => {
    expect(css).toMatch(/@keyframes algo-enter\s*\{/);
    expect(css).toMatch(/@keyframes algo-leave\s*\{/);
    const leave = bodies(".algo-root .viz-canvas .leaving").join(";");
    expect(leave).toMatch(/animation:\s*algo-leave var\(--algo-step-ms/);
    expect(leave).toMatch(/pointer-events:\s*none/);
    const enter = css.match(/([^{}]+)\{[^{}]*animation:\s*algo-enter[^{}]*\}/);
    expect(enter?.[1]).toMatch(/\.tree-node/);
    expect(enter?.[1]).toMatch(/\.box/);
    expect(enter?.[1]).toMatch(/\.bar/);
  });

  it("barvy hran grafu a stromu, buněk tabulek a bodů k-d stromu se přelévají", () => {
    for (const sel of [
      ".algo-root .graph-edge path",
      ".algo-root .tree-edge line",
      ".algo-root .mtree-edge",
      ".algo-root .kd-pt circle",
      ".algo-root .kd-split",
      ".algo-root .lf-node",
      ".algo-root .hc-key",
      ".algo-root .gtable td",
      ".algo-root .sa-table td",
      ".algo-root .paging-seq .pg",
    ])
      expect(transitionOf(sel), sel).toMatch(/var\(--algo-step-color-ms/);
  });
});
