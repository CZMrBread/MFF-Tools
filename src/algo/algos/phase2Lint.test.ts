// Moduly fáze 2 (textové algoritmy, hradlové sítě, sčítačka, třídicí sítě, FFT) a jejich pohledy jsou
// bez potlačených pravidel ESLint – závislosti hooků se řeší zachycením hodnoty (vzor setRun v GatesPage).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIRS = ["strings", "parallel", "fourier"].map(
  (d) => new URL(`./${d}/`, import.meta.url),
);
const VIEWS = [
  "CircuitEditor.tsx",
  "CircuitView.tsx",
  "ComparatorView.tsx",
  "ButterflyNetView.tsx",
  "UnitCircleView.tsx",
  "TextStripView.tsx",
  "AutomatonView.tsx",
].map((f) => new URL(`../views/${f}`, import.meta.url));

describe("fáze 2 – žádné eslint-disable", () => {
  it("zdrojové soubory nových modulů nepotlačují pravidla", () => {
    const files = [
      ...DIRS.flatMap((d) =>
        readdirSync(d)
          .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
          .map((f) => new URL(f, d)),
      ),
      ...VIEWS,
    ];
    expect(files.length).toBeGreaterThan(40);
    for (const f of files)
      expect(readFileSync(f, "utf8"), f.pathname).not.toMatch(/eslint-disable/);
  });
});
