import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Dev server Vite (root: app/) najde jen skripty uvnitř app/. Odkaz mimo kořen
// (../src/main.tsx) projde buildem, ale v `npm run dev` zůstane stránka prázdná.
const appDir = resolve(__dirname, "../app");
const entries = [
  "index.html",
  "kalkulačka/index.html",
  "specializace/index.html",
  "algo/index.html",
];

describe("vstupní HTML", () => {
  it.each(entries)("%s načítá skript, který leží uvnitř app/", (entry) => {
    const html = readFileSync(resolve(appDir, entry), "utf8");
    const srcs = [
      ...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g),
    ].map((m) => m[1] ?? "");
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      const file = resolve(dirname(resolve(appDir, entry)), src);
      expect(
        relative(appDir, file).startsWith(".."),
        `${src} je mimo app/`,
      ).toBe(false);
      expect(existsSync(file), `${src} neexistuje`).toBe(true);
    }
  });
});
