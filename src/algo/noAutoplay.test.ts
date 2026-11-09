// Přehrávání se nikdy nespouští samo (docs/vizualizace.md): texty v UI ani komentáře to nesmí slibovat
// a spustit ho smí jen lišta přehrávání (▶, mezerník) v core/Controls.tsx.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const files = sources(ROOT).map((p) => ({
  rel: relative(ROOT, p).split(sep).join("/"),
  text: readFileSync(p, "utf8"),
}));

describe("src/algo – nic se nepřehraje samo", () => {
  it("prošel zdroje (kontrola testu samotného)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.rel === "core/Controls.tsx")).toBe(true);
  });

  it("žádný text ani komentář neslibuje, že se průběh přehraje sám", () => {
    const AUTO =
      /přehraje sám|sám přehraje|hned (se )?přehraje|rovnou přehraje|Build\(P\) přehraje|v₀ a spuštění/;
    const hits = files.flatMap((f) =>
      f.text
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => AUTO.test(line))
        .map(({ i, line }) => `${f.rel}:${i + 1}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it("přehrávání (player.play / player.toggle) spouští jen lišta přehrávání v core/Controls.tsx", () => {
    const CORE = new Set([
      "core/Controls.tsx",
      "core/usePlayer.ts",
      "core/player.ts",
    ]);
    const hits = files
      .filter((f) => !CORE.has(f.rel))
      .flatMap((f) =>
        [...f.text.matchAll(/\.(play|toggle)\b|type:\s*"play"/g)].map(
          (m) => `${f.rel}: ${m[0]}`,
        ),
      );
    expect(hits).toEqual([]);
    expect(files.find((f) => f.rel === "core/Controls.tsx")?.text).toMatch(
      /player\.toggle/,
    );
  });
});
