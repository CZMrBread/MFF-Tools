// Oddíl „drag“ v index.css: společný vzhled tahu ukazatelem (usePointerDrag) – kurzor během tahu
// a větší neviditelný úchop vrcholu na dotykovém displeji.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(
  new URL("../index.css", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const a = raw.indexOf("/* === drag === */");
const b = raw.indexOf("/* === /drag === */");
const section = a >= 0 && b > a ? raw.slice(a, b) : "";

describe("index.css – oddíl drag", () => {
  it("během tahu kurzor „grabbing“ na celé kresbě", () => {
    expect(section).toMatch(
      /\.algo-root \.graph-svg\.is-dragging[^{]*\{[^}]*cursor:\s*grabbing/,
    );
  });

  it("přetahovatelný vrchol, který jde i vybrat (v₀), má kurzor „grab“ (ne „pointer“ z .pickable)", () => {
    expect(section).toMatch(
      /\.algo-root \.graph-svg\.draggable\.pickable \.graph-node\s*\{[^}]*cursor:\s*grab;/,
    );
  });

  it("dotykový displej: úchop vrcholu aspoň 44 px (CSS r)", () => {
    const coarse = section.match(
      /@media \(pointer: coarse\)\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    expect(coarse).toBeDefined();
    expect(coarse).toMatch(/\.node-hit[^{]*\{[^}]*\br:\s*44px/);
  });

  it("jen pod .algo-root a bez barev natvrdo", () => {
    const rules = section
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .match(/[^{}]+\{/g)!
      .map((s) => s.replace("{", "").trim())
      .filter((s) => !s.startsWith("@media"));
    expect(rules.length).toBeGreaterThan(0);
    for (const sel of rules)
      for (const part of sel.split(","))
        expect(part.trim().startsWith(".algo-root ")).toBe(true);
    expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
