/**
 * Líně načítané stránky modulů (`lazyPage(() => import("./algos/…"))` v App.tsx) nesmí nikdo jiný importovat
 * staticky – jinak se kód stránky slije do chunku AlgoPage, build hlásí INEFFECTIVE_DYNAMIC_IMPORT a chunk
 * přeroste 500 kB. Typicky náhled na úvodní stránce: kresbu sdílenou se stránkou patří do `*Views.tsx`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
      ? [p]
      : [];
  });
}

const resolveImport = (from: string, spec: string) =>
  resolve(dirname(from), spec).replace(/\.(ts|tsx)$/, "");

describe("líně načítané stránky", () => {
  const app = join(ROOT, "App.tsx");
  const lazy = new Set(
    [...readFileSync(app, "utf8").matchAll(/import\(\s*"([^"]+)"\s*\)/g)].map(
      (m) => resolveImport(app, m[1]),
    ),
  );

  it("App.tsx nějaké stránky načítá líně", () => {
    expect(lazy.size).toBeGreaterThan(10);
  });

  it("žádný zdrojový soubor (mimo testy) je neimportuje staticky", () => {
    const bad: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(
        /^\s*(?:import|export)\s[^;]*?\sfrom\s+"(\.[^"]+)";/gms,
      )) {
        if (lazy.has(resolveImport(file, m[1])))
          bad.push(`${relative(ROOT, file)} → ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
