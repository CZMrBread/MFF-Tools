// Oddíl CSS `llrb` v index.css: barvy LLRB stromu jen přes proměnné --algo-*, pravidla jen pod .algo-root,
// červená hrana / obrys, rotovaná hrana čárkovaně, přebarvované vrcholy, rozložení se (2,4)-stromem vedle.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(
  new URL("../../index.css", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const start = raw.indexOf("/* === llrb === */");
const end = raw.indexOf("/* === /llrb === */");
const section = raw.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");

/** tělo prvního pravidla, jehož selektor obsahuje `sel` */
const body = (sel: string) => {
  const re = /([^{}]+)\{([^}]*)\}/g;
  for (const m of section.matchAll(re)) if (m[1].includes(sel)) return m[2];
  return undefined;
};

describe("index.css – oddíl llrb", () => {
  it("je neprázdný, každé pravidlo pod .algo-root, žádné pevné barvy", () => {
    expect(start).toBeGreaterThan(-1);
    const selectors = [...section.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim())
      .filter((s) => !s.startsWith("@media"));
    expect(selectors.length).toBeGreaterThan(8);
    for (const s of selectors)
      for (const part of s.split(","))
        expect(part.trim(), part).toMatch(/^\.algo-root /);
    expect(section).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("červená hrana a obrys vrcholu pod ní: --algo-danger", () => {
    expect(body(".tree-edge.e-red line")).toContain("var(--algo-danger)");
    expect(body(".tree-node.n-red circle")).toContain("var(--algo-danger)");
  });

  it("rotovaná hrana je čárkovaná, přebarvované vrcholy mají vlastní barvu (--algo-c-min)", () => {
    expect(body(".tree-edge.e-rotate line")).toMatch(/stroke-dasharray/);
    expect(body(".tree-node.n-flip circle")).toContain("var(--algo-c-min)");
  });

  it("černé hrany jsou tmavé (--algo-text), ne šedé jako v ostatních stromech", () => {
    expect(body(".llrb-tree .tree-edge line")).toContain("var(--algo-text)");
  });

  it("desktop: (2,4)-strom vedle v řádku; náhled na úvodní stránce jen LLRB strom přes celou šířku (UX-15)", () => {
    expect(section).toMatch(
      /@media \(min-width: 1100px\) and \(min-height: 600px\)/,
    );
    expect(body(".llrb-layout.with-ab")).toMatch(/flex-direction:\s*row/);
    expect(body(".thumb-art .llrb-thumb > :first-child")).toMatch(
      /flex:\s*1 1 auto/,
    );
  });

  it("(2,4)-strom vedle se nezmenšuje pod skutečnou velikost (písmo ≥ 10 px) – posouvá se vodorovně", () => {
    expect(body(".llrb-ab > .view-wrap")).toMatch(/overflow-x:\s*auto/);
    expect(body(".llrb-ab > .view-wrap > svg")).toMatch(/max-width:\s*none/);
  });
});
