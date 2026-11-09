import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import viteConfig from "../../vite.config";
import { PAGES, isPageId, pageHref } from "./pages";

const REPO = resolve(import.meta.dirname, "../..");

/** pageHref čte data-site-root z <html> – v prostředí node stačí malý zástupný document. */
function stubSiteRoot(siteRoot: string) {
  vi.stubGlobal("document", {
    documentElement: { dataset: { siteRoot } },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pages", () => {
  it("zachovává URL starých stránek a algoritmy jsou čtvrtá stránka algo/", () => {
    expect(PAGES.map((page) => page.path)).toEqual([
      "",
      "kalkulačka/",
      "specializace/",
      "algo/",
    ]);
  });

  it("hlavička uvádí „Algoritmy“ až za třemi původními nástroji", () => {
    expect(PAGES.map((page) => page.title)).toEqual([
      "Průvodce prváka",
      "Kalkulačka kreditů",
      "Mapa předmětů",
      "Algoritmy",
    ]);
  });

  it("isPageId rozpozná jen známé stránky", () => {
    expect(isPageId("calculator")).toBe(true);
    expect(isPageId("algo")).toBe(true);
    expect(isPageId("neznama")).toBe(false);
    expect(isPageId(undefined)).toBe(false);
  });

  it("pageHref('algo') je relativní z kořene i z podsložky", () => {
    stubSiteRoot("./");
    expect(pageHref("algo")).toBe("./algo/");
    stubSiteRoot("../");
    expect(pageHref("algo")).toBe("../algo/");
    expect(pageHref("guide")).toBe("../");
  });
});

describe("vstupní HTML stránek", () => {
  const inputs = Object.values(
    (viteConfig.build?.rollupOptions?.input ?? {}) as Record<string, string>,
  ).map((path) => resolve(path));

  for (const page of PAGES) {
    const html = resolve(REPO, "app", page.path, "index.html");
    const depth = page.path === "" ? "./" : "../";

    it(`${page.id}: app/${page.path}index.html je vstup buildu s data-page a data-site-root`, () => {
      expect(existsSync(html), html).toBe(true);
      expect(inputs).toContain(html);
      const text = readFileSync(html, "utf8");
      expect(text).toContain(`data-page="${page.id}"`);
      expect(text).toContain(`data-site-root="${depth}"`);
    });
  }

  it("algo: téma se nastaví před prvním vykreslením (klíč algo-theme) a má vlastní favicon", () => {
    const text = readFileSync(resolve(REPO, "app/algo/index.html"), "utf8");
    expect(text).toMatch(
      /<script>[\s\S]*localStorage\.getItem\("algo-theme"\)/,
    );
    expect(text).toContain('href="./favicon.svg"');
    expect(existsSync(resolve(REPO, "app/algo/favicon.svg"))).toBe(true);
    // žádné absolutní cesty z dřívějšího base /~smolad/algo/
    expect(text).not.toContain("~smolad");
  });
});
