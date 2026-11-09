// @vitest-environment jsdom
/*
 * Nápověda ke klávesám na kresbě odpovídá modulu (UX-13): tabulka DP nemá vrcholy k posunu, v rovině obalu
 * Enter bod smaže (jako klik), strom LLRB Enterem vyplní x. Obecný řádek („Enter vybrat, Shift+šipky posun
 * vrcholu“) zůstává ostatním modulům.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AlgoPage } from "./AlgoPage";
import { moduleByPath } from "./registry";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const hint = async (path: string) => {
  window.location.hash = "#" + path;
  const { container } = render(<AlgoPage />);
  await waitFor(
    () => {
      expect(container.querySelector("h1")?.textContent).toBe(
        moduleByPath(path)!.title,
      );
      expect(container.querySelector(".kbd-hint")).not.toBeNull();
    },
    { timeout: 10000 },
  );
  return container.querySelector(".kbd-hint")?.textContent ?? "";
};

describe("nápověda ke kresbě podle modulu (UX-13)", () => {
  for (const [path, re] of [
    ["/dp/edit", /Tabulka: Tab na ni, šipky po buňkách/],
    ["/dp/lis", /Tabulka: Tab na ni, šipky po sloupcích/],
    // Enter bod vybere, maže Delete / × (vlastník 8. 11. 2026 – mazání klikem bylo nešikovné, UX-12 už neplatí)
    ["/geom/hull", /Enter bod vybere \(jako klik\), Delete ho smaže/],
    ["/geom/kdtree", /Enter bod vybere \(jako klik\), Delete ho smaže/],
    ["/tree/llrb", /Enter vyplní x/],
  ] as const)
    it(path, async () => {
      const text = await hint(path);
      expect(text).toMatch(re);
      expect(text).not.toContain("posun vrcholu");
    });

  it("ostatní moduly mají obecný řádek", async () => {
    expect(await hint("/graph/dfs")).toContain("Shift+šipky posun vrcholu");
  });
});
