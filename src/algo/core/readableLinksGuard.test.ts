// E7 (čitelné odkazy): stránky zapisují dotaz do adresy jen přes core/linkParams (readableSearch,
// useLinkSearchParams) nebo useUrlParam – přímé useSearchParams z react-router by psalo „%2C“.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const ALLOWED = new Set(["core/linkParams.ts", "core/useUrlParam.ts"]);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("E7 – stránky nepíšou do adresy %2C", () => {
  const files = sources(root).map((p) => ({
    rel: p.slice(root.length).replaceAll("\\", "/"),
    text: readFileSync(p, "utf8"),
  }));

  it("useSearchParams z react-router jen v core/linkParams a core/useUrlParam", () => {
    const bad = files
      .filter((f) => !ALLOWED.has(f.rel))
      .filter((f) =>
        /\buseSearchParams\b/.test(
          f.text.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ""),
        ),
      )
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it("navigate({ search }) nestaví dotaz přes URLSearchParams.toString()", () => {
    const bad = files
      .filter((f) =>
        /new URLSearchParams\([\s\S]{0,120}?\)\.toString\(\)[\s\S]{0,80}?navigate\(/.test(
          f.text,
        ),
      )
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });
});
