// Moduly fáze 4 (toky, nové grafové algoritmy, dynamické programování, konvexní obal, LLRB) a jejich pohledy
// jsou bez potlačených pravidel ESLint – stejně jako fáze 2 (phase2Lint.test.ts).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** celé složky stop fáze 4 */
const DIRS = ["flows", "dp"].map((d) => new URL(`./${d}/`, import.meta.url));
/** soubory stop fáze 4 ve sdílených složkách (podle předpony jména) */
const NAMED: [string, RegExp][] = [
  ["./graphs/", /^(bellmanFord|boruvka|bridges|scc|algoKit|presetKit)/],
  ["./geometry/", /^(hull|Hull)/],
  ["./trees/", /^(llrb|Llrb)/],
  ["../views/", /^(flow|Flow|dp|Dp|hull|Hull|llrb|Llrb)/],
];

const sources = (dir: URL, match: RegExp = /./) =>
  readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && match.test(f))
    .map((f) => new URL(f, dir));

describe("fáze 4 – žádné eslint-disable", () => {
  it("zdrojové soubory nových modulů nepotlačují pravidla", () => {
    const files = [
      ...DIRS.flatMap((d) => sources(d)),
      ...NAMED.flatMap(([d, re]) => sources(new URL(d, import.meta.url), re)),
    ];
    expect(files.length).toBeGreaterThan(15);
    for (const f of files)
      expect(readFileSync(f, "utf8"), f.pathname).not.toMatch(/eslint-disable/);
  });
});
