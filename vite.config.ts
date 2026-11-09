import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

// Staré stránky (index.html, kalkulačka/, specializace/) leží v kořeni repa a nesmí se
// měnit, proto jsou vstupní HTML nové aplikace v app/. Build generuje čtyři samostatné
// vstupy se stejnými URL jako dřív: dist/index.html, dist/kalkulačka/index.html,
// dist/specializace/index.html a dist/algo/index.html (vizualizace algoritmů, dřív
// samostatný projekt algo/; uvnitř HashRouter). Web běží pod ~smolad/, takže base je
// relativní.
export default defineConfig({
  root: fromRoot("app"),
  base: "./",
  publicDir: fromRoot("public"),
  plugins: [react()],
  build: {
    outDir: fromRoot("dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        guide: fromRoot("app/index.html"),
        calculator: fromRoot("app/kalkulačka/index.html"),
        map: fromRoot("app/specializace/index.html"),
        algo: fromRoot("app/algo/index.html"),
      },
      // stránka algo: sdílené kresby (src/algo/views) ve vlastním chunku, aby chunk AlgoPage zůstal
      // pod 500 kB (build bez varování); oba se stáhnou při otevření stránky, chování beze změny
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [{ name: "algo-views", test: /src[\\/]algo[\\/]views[\\/]/ }],
        },
      },
    },
  },
  test: {
    root: repoRoot,
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
